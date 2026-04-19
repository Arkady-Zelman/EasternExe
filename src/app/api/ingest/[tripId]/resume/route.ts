import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Resume a stuck ingestion chain.
 *
 * Inspects the current state of a trip (uploads, ai_runs, chunks, places)
 * and fires the correct next step. Idempotent — safe to call repeatedly.
 *
 * Used by the client-side `useTripStatus` hook when a trip has been in
 * `status='ingesting'` for >20s without observable progress.
 */
export async function POST(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  const tripId = params.tripId;
  if (!tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  // Load current trip state
  const { data: tripData } = await supabase
    .from("trips")
    .select("id, status")
    .eq("id", tripId)
    .single();

  if (!tripData) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  const trip = tripData as { id: string; status: string };

  // Nothing to do if not ingesting
  if (trip.status !== "ingesting") {
    return NextResponse.json({
      ok: true,
      message: `Trip status is '${trip.status}', nothing to resume.`,
    });
  }

  // Gather state to determine where the chain stalled
  const [
    { data: pendingUploads },
    { data: aiRuns },
    { count: chunkCount },
    { count: placeCount },
  ] = await Promise.all([
    supabase
      .from("uploads")
      .select("id, status")
      .eq("trip_id", tripId)
      .in("status", ["pending", "processing"]),
    supabase
      .from("ai_runs")
      .select("kind")
      .eq("trip_id", tripId),
    supabase
      .from("upload_chunks")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId),
    supabase
      .from("places")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId),
  ]);

  const hasPendingUploads = (pendingUploads ?? []).length > 0;
  const runKinds = new Set((aiRuns ?? []).map((r) => (r as { kind: string }).kind));
  const hasChunks = (chunkCount ?? 0) > 0;
  const hasPlaces = (placeCount ?? 0) > 0;

  const profileCount = [...runKinds].filter((k) =>
    k.startsWith("ingest.profile")
  ).length;

  // Determine next step by checking what's missing, in pipeline order.
  let nextPath: string | null = null;
  let reason: string;

  if (hasPendingUploads) {
    // Extract step didn't finish — re-enter the extract chain
    nextPath = `/api/ingest/${tripId}/extract`;
    reason = `${(pendingUploads ?? []).length} upload(s) still pending/processing`;
  } else if (!hasChunks) {
    // No chunks and no pending uploads — nothing to extract (empty trip).
    // Skip straight to finalize.
    nextPath = `/api/ingest/${tripId}/finalize`;
    reason = "No chunks extracted, skipping to finalize";
  } else if (profileCount === 0) {
    // Profiles never started
    nextPath = `/api/ingest/${tripId}/profiles?i=0`;
    reason = "No profiles generated yet";
  } else {
    // Check how many participants we should have profiles for
    const { data: participants } = await supabase
      .from("participants")
      .select("id")
      .eq("trip_id", tripId);
    const participantCount = (participants ?? []).length;

    if (profileCount < participantCount) {
      // Some profiles done but not all — resume from the next index
      nextPath = `/api/ingest/${tripId}/profiles?i=${profileCount}`;
      reason = `Only ${profileCount}/${participantCount} profiles done`;
    } else if (!runKinds.has("ingest.trip_memory")) {
      nextPath = `/api/ingest/${tripId}/memory`;
      reason = "Trip memory not generated";
    } else if (!runKinds.has("ingest.places") && !hasPlaces) {
      nextPath = `/api/ingest/${tripId}/places`;
      reason = "Places not generated";
    } else {
      // Everything seems done but finalize never ran
      nextPath = `/api/ingest/${tripId}/finalize`;
      reason = "All steps complete, finalizing";
    }
  }

  // Fire the next step
  const nextUrl = new URL(nextPath, req.url).toString();
  waitUntil(
    fetch(nextUrl, { method: "POST" }).catch((e) =>
      console.error(`resume dispatch to ${nextPath} failed:`, e)
    )
  );

  return NextResponse.json(
    { ok: true, resumed: nextPath, reason },
    { status: 202 }
  );
}

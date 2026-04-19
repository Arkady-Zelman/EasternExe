import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { buildDigestFromChatMessages } from "@/lib/chat/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — list digests for the trip, newest first.
 */
export async function GET(
  _req: Request,
  { params }: { params: { tripId: string } }
) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("chat_digests")
    .select("*")
    .eq("trip_id", params.tripId)
    .order("window_start", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ digests: data ?? [] });
}

/**
 * POST — build (or rebuild) a digest for a window. Deterministic only in
 * v1; LLM refinement can layer on top later by updating the row's summary.
 *
 * Body:
 *   { from?: ISO, to?: ISO, period?: 'day'|'inactivity'|'manual',
 *     source?: 'chat_messages'|'upload_chunks' }
 *
 * Default window: last 24h. Default period: inactivity. Default source:
 * chat_messages.
 */
export async function POST(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  let body: {
    from?: string;
    to?: string;
    period?: "day" | "inactivity" | "manual";
    source?: "chat_messages" | "upload_chunks";
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Empty body is fine — fall back to defaults.
  }

  const period = body.period ?? "inactivity";
  const source = body.source ?? "chat_messages";
  const windowEnd = body.to ? new Date(body.to) : new Date();
  const windowStart = body.from
    ? new Date(body.from)
    : new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

  if (isNaN(windowStart.getTime()) || isNaN(windowEnd.getTime())) {
    return NextResponse.json({ error: "Invalid from/to" }, { status: 400 });
  }
  if (windowStart.getTime() >= windowEnd.getTime()) {
    return NextResponse.json(
      { error: "from must be earlier than to" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { data: trip } = await supabase
    .from("trips")
    .select("id")
    .eq("id", params.tripId)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  if (source !== "chat_messages") {
    return NextResponse.json(
      { error: "Only 'chat_messages' source is supported in v1" },
      { status: 400 }
    );
  }

  const built = await buildDigestFromChatMessages(supabase, {
    tripId: params.tripId,
    windowStart,
    windowEnd,
  });

  const row = {
    trip_id: params.tripId,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    period,
    source,
    message_count: built.message_count,
    participants_active: built.participants_active,
    topics_active: built.topics_active,
    places_mentioned: built.places_mentioned,
    decisions_noted: built.decisions_noted,
    questions_raised: built.questions_raised,
    summary: null,
    generator: "deterministic",
  };

  const { data: upserted, error: upErr } = await supabase
    .from("chat_digests")
    .upsert(row, { onConflict: "trip_id,window_start,window_end,source" })
    .select()
    .single();

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ digest: upserted });
}

import { NextResponse } from "next/server";

import { chainStep } from "@/lib/ingest/chain";
import { runMemory, runPlaces } from "@/lib/ingest/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Trip memory + places extraction in parallel. Both steps only read chunks
 * and don't depend on each other, so they run concurrently via Promise.all.
 */
export async function POST(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  if (!params.tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }

  chainStep(req, params.tripId, async () => {
    await Promise.all([
      runMemory(params.tripId),
      runPlaces(params.tripId),
    ]);
    return `/api/ingest/${params.tripId}/finalize`;
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}

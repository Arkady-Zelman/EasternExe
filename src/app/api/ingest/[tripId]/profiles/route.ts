import { NextResponse } from "next/server";

import { chainStep } from "@/lib/ingest/chain";
import {
  listParticipantIds,
  runProfileForParticipant,
} from "@/lib/ingest/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Profile generation for all participants in parallel. Each participant's
 * LLM call runs concurrently via Promise.all, then chains to memory.
 */
export async function POST(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  if (!params.tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }

  chainStep(req, params.tripId, async () => {
    const participantIds = await listParticipantIds(params.tripId);
    await Promise.all(
      participantIds.map((pid) =>
        runProfileForParticipant(params.tripId, pid)
      )
    );
    return `/api/ingest/${params.tripId}/memory`;
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}

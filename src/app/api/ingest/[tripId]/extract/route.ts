import { NextResponse } from "next/server";

import { chainStep } from "@/lib/ingest/chain";
import {
  listPendingUploadIds,
  runExtractOne,
  tripHasChunks,
} from "@/lib/ingest/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Text extraction for all pending uploads in parallel. Each upload's download,
 * parse, and chunk persist runs concurrently via Promise.all.
 */
export async function POST(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  if (!params.tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }

  chainStep(req, params.tripId, async () => {
    const uploadIds = await listPendingUploadIds(params.tripId);
    if (uploadIds.length === 0) {
      const hasChunks = await tripHasChunks(params.tripId);
      return hasChunks
        ? `/api/ingest/${params.tripId}/profiles`
        : `/api/ingest/${params.tripId}/finalize`;
    }
    await Promise.all(
      uploadIds.map((id) => runExtractOne(params.tripId, id))
    );
    return `/api/ingest/${params.tripId}/profiles`;
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}

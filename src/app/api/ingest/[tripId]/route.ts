import { NextResponse } from "next/server";

import { runIngestion } from "@/lib/ingest/pipeline";

export const runtime = "nodejs";
// Ingestion is long-running (Whisper + many LLM calls + Places lookups).
// Locally the Node dev server has no timeout; on Vercel this will need the
// maxDuration bump (paid plans) or a background worker.
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: { tripId: string } }
) {
  if (!params.tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }

  // Kick off ingestion but don't block the HTTP response. The pipeline
  // writes progress via trips.status + uploads.status so clients can watch
  // via realtime.
  void runIngestion(params.tripId).catch((e) => {
    console.error("runIngestion crashed:", e);
  });

  return NextResponse.json({ ok: true, tripId: params.tripId }, { status: 202 });
}

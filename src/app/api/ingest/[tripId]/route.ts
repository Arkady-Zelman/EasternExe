import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";

import { runIngestion } from "@/lib/ingest/pipeline";

export const runtime = "nodejs";
// Hobby plan caps serverless functions at 60s regardless of this value. Bump
// with the plan if you upgrade. Without waitUntil(), Vercel freezes the
// function instance the moment the response is sent — leaving runIngestion
// suspended and the trip pinned to "ingesting" forever.
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: { tripId: string } }
) {
  if (!params.tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }

  waitUntil(
    runIngestion(params.tripId).catch((e) => {
      console.error("runIngestion crashed:", e);
    })
  );

  return NextResponse.json({ ok: true, tripId: params.tripId }, { status: 202 });
}

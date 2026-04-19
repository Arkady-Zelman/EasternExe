import { NextResponse } from "next/server";

import { summarizeChatIntoGraph } from "@/lib/graph/summarize";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Give the LLM up to 60s on Hobby; bump to 120 on Pro.
export const maxDuration = 60;

/**
 * POST /api/trips/[tripId]/graph/summarize
 * Runs the LLM delta-ingest: read new chat since last summary, merge into
 * trip_memory, rebuild graph. Called by:
 *   - the client-side inactivity watcher (after 30min of chat silence)
 *   - the /api/cron/graph-tick daily cron
 *   - a manual "Summarize" button in the brain panel
 */
export async function POST(
  _req: Request,
  { params }: { params: { tripId: string } }
) {
  const supabase = getSupabaseServerClient();
  try {
    const result = await summarizeChatIntoGraph(supabase, params.tripId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("summarize failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

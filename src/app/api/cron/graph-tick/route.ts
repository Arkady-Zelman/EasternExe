import { NextResponse } from "next/server";

import { summarizeChatIntoGraph } from "@/lib/graph/summarize";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily cron. Wire up in vercel.json:
 *   { "crons": [{ "path": "/api/cron/graph-tick", "schedule": "0 6 * * *" }] }
 *
 * Iterates trips with status="ready" and triggers a graph summary on each.
 * Quick + crude; for production, shard by trip_id hash or fan out via queue.
 */
export async function GET(req: Request) {
  // Vercel cron pings with a special header we could verify; for hackathon
  // we accept an optional bearer that matches an env var.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabaseServerClient();
  const { data: trips } = await supabase
    .from("trips")
    .select("id")
    .eq("status", "ready");

  const results: Array<{ trip_id: string; status: string; error?: string }> = [];
  for (const t of trips ?? []) {
    try {
      const r = await summarizeChatIntoGraph(supabase, t.id as string);
      results.push({ trip_id: t.id as string, status: r.status });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ trip_id: t.id as string, status: "error", error: msg });
    }
  }

  return NextResponse.json({ ok: true, results });
}

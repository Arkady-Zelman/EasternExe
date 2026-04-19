import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/activations?trip_id=...&since=ISO
 * Returns recent agent_run_activations for the trip. Used by the viz to
 * light up nodes touched by recent agent runs.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tripId = url.searchParams.get("trip_id");
  const since =
    url.searchParams.get("since") ??
    new Date(Date.now() - 5 * 60 * 1000).toISOString();
  if (!tripId) {
    return NextResponse.json(
      { error: "trip_id is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_run_activations")
    .select("*")
    .eq("trip_id", tripId)
    .gte("activated_at", since)
    .order("activated_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ activations: data ?? [] });
}

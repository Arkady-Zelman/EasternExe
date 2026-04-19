import { NextResponse } from "next/server";

import { rebuildGraph } from "@/lib/graph/build";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { tripId: string } }
) {
  const supabase = getSupabaseServerClient();
  try {
    const result = await rebuildGraph(supabase, params.tripId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("rebuildGraph failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

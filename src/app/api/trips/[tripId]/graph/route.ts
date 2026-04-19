import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { tripId: string } }
) {
  const supabase = getSupabaseServerClient();
  const [{ data: nodes }, { data: edges }] = await Promise.all([
    supabase
      .from("kg_nodes")
      .select("*")
      .eq("trip_id", params.tripId)
      .is("invalidated_at", null)
      .order("importance", { ascending: false }),
    supabase
      .from("kg_edges")
      .select("*")
      .eq("trip_id", params.tripId)
      .is("invalidated_at", null),
  ]);

  return NextResponse.json({
    nodes: nodes ?? [],
    edges: edges ?? [],
  });
}

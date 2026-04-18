import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createTripRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createTripRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();

  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .insert({
      name: parsed.data.name,
      destination: parsed.data.destination,
      start_date: parsed.data.start_date || null,
      end_date: parsed.data.end_date || null,
    })
    .select()
    .single();

  if (tripErr || !trip) {
    return NextResponse.json(
      { error: tripErr?.message ?? "Could not create trip" },
      { status: 500 }
    );
  }

  const participantRows = parsed.data.participants.map((p) => ({
    trip_id: trip.id,
    display_name: p.display_name,
    color: p.color,
  }));

  const { data: participants, error: partErr } = await supabase
    .from("participants")
    .insert(participantRows)
    .select();

  if (partErr || !participants) {
    // Best-effort rollback — triggers will cascade on trip delete.
    await supabase.from("trips").delete().eq("id", trip.id);
    return NextResponse.json(
      { error: partErr?.message ?? "Could not create participants" },
      { status: 500 }
    );
  }

  return NextResponse.json({ trip, participants });
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { participantDraftSchema } from "@/lib/schemas";

export const runtime = "nodejs";

const bodySchema = participantDraftSchema.extend({
  trip_id: z.string().uuid(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("participants")
    .insert({
      trip_id: parsed.data.trip_id,
      display_name: parsed.data.display_name,
      color: parsed.data.color,
    })
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create participant" },
      { status: 500 }
    );
  }

  return NextResponse.json({ participant: data });
}

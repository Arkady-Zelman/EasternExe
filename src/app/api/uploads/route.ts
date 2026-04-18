import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  trip_id: z.string().uuid(),
  participant_id: z.string().uuid().optional().nullable(),
  kind: z.enum(["whatsapp_zip", "doc", "image", "audio_intro", "other"]),
  storage_path: z.string().min(1),
  filename: z.string().optional().nullable(),
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
    .from("uploads")
    .insert({
      trip_id: parsed.data.trip_id,
      participant_id: parsed.data.participant_id ?? null,
      kind: parsed.data.kind,
      storage_path: parsed.data.storage_path,
      filename: parsed.data.filename ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not register upload" },
      { status: 500 }
    );
  }

  return NextResponse.json({ upload: data });
}

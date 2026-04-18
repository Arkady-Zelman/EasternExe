import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  room_id: z.string().uuid(),
  sender_participant_id: z.string().uuid().nullable().optional(),
  sender_type: z
    .enum(["user", "agent", "subagent", "system"])
    .default("user"),
  sender_label: z.string().max(60).nullable().optional(),
  content: z.string().min(1).max(8000),
  parent_message_id: z.string().uuid().nullable().optional(),
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
    .from("chat_messages")
    .insert({
      room_id: parsed.data.room_id,
      sender_participant_id: parsed.data.sender_participant_id ?? null,
      sender_type: parsed.data.sender_type,
      sender_label: parsed.data.sender_label ?? null,
      content: parsed.data.content,
      parent_message_id: parsed.data.parent_message_id ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not insert message" },
      { status: 500 }
    );
  }

  // TODO(M6): if sender_type === 'user' and content matches /@agent\b/i
  // in a group room, kick off /api/agent asynchronously here.

  return NextResponse.json({ message: data });
}

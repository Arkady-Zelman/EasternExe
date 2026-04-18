import { NextResponse } from "next/server";
import { z } from "zod";

import { runAgent } from "@/lib/agent/main";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  tripId: z.string().uuid(),
  roomId: z.string().uuid(),
  placeholderMessageId: z.string().uuid(),
  triggerMessageId: z.string().uuid(),
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

  void runAgent(parsed.data).catch((e) => {
    console.error("agent pipeline crashed:", e);
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}

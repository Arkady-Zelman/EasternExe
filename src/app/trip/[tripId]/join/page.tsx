import { notFound } from "next/navigation";

import { ParticipantPicker } from "@/components/workspace/ParticipantPicker";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Participant, Trip } from "@/types/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function JoinPage({
  params,
}: {
  params: { tripId: string };
}) {
  const supabase = getSupabaseServerClient();

  const [{ data: trip }, { data: participants }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", params.tripId).maybeSingle(),
    supabase.from("participants").select("*").eq("trip_id", params.tripId),
  ]);

  if (!trip) notFound();

  return (
    <ParticipantPicker
      trip={trip as Trip}
      participants={(participants ?? []) as Participant[]}
    />
  );
}

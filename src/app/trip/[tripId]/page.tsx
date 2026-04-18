import { notFound } from "next/navigation";

import { TripWorkspace } from "@/components/workspace/TripWorkspace";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ChatRoom, Participant, Trip } from "@/types/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TripPage({
  params,
}: {
  params: { tripId: string };
}) {
  const supabase = getSupabaseServerClient();

  const [{ data: trip }, { data: participants }, { data: rooms }] =
    await Promise.all([
      supabase.from("trips").select("*").eq("id", params.tripId).maybeSingle(),
      supabase.from("participants").select("*").eq("trip_id", params.tripId),
      supabase.from("chat_rooms").select("*").eq("trip_id", params.tripId),
    ]);

  if (!trip) notFound();
  const typedTrip = trip as Trip;
  const typedParticipants = (participants ?? []) as Participant[];
  const typedRooms = (rooms ?? []) as ChatRoom[];

  const groupRoom = typedRooms.find((r) => r.type === "group");
  if (!groupRoom) {
    throw new Error(
      `Trip ${params.tripId} has no group room — did migration 001_init.sql run?`
    );
  }

  const agentRoomsByParticipant: Record<string, string> = {};
  for (const r of typedRooms) {
    if (r.type === "agent" && r.owner_id) {
      agentRoomsByParticipant[r.owner_id] = r.id;
    }
  }

  return (
    <TripWorkspace
      trip={typedTrip}
      participants={typedParticipants}
      groupRoomId={groupRoom.id}
      agentRoomsByParticipant={agentRoomsByParticipant}
    />
  );
}

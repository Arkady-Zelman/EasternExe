"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ChatInput } from "@/components/chat/ChatInput";
import { MessageList } from "@/components/chat/MessageList";
import { TabsShell, type WorkspaceTab } from "@/components/workspace/TabsShell";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useParticipant } from "@/hooks/useParticipant";
import type { Participant, Trip } from "@/types/db";

interface Props {
  trip: Trip;
  participants: Participant[];
  groupRoomId: string;
  agentRoomsByParticipant: Record<string, string>;
}

export function TripWorkspace({
  trip,
  participants,
  groupRoomId,
  agentRoomsByParticipant,
}: Props) {
  const router = useRouter();
  const { participantId, hydrated } = useParticipant(trip.id);
  const [tab, setTab] = useState<WorkspaceTab>("group");

  const participantMap = useMemo(() => {
    return Object.fromEntries(participants.map((p) => [p.id, p]));
  }, [participants]);

  const myAgentRoomId = participantId
    ? agentRoomsByParticipant[participantId]
    : undefined;

  const activeRoomId =
    tab === "group" ? groupRoomId : tab === "me" ? myAgentRoomId : undefined;

  const { messages, send } = useChatMessages(activeRoomId);

  // Redirect to /join if no participantId after hydration
  if (hydrated && !participantId) {
    router.replace(`/trip/${trip.id}/join`);
    return null;
  }

  const me = participantId ? participantMap[participantId] : null;

  return (
    <main className="flex h-dvh flex-col bg-background">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">
              {trip.name}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {trip.destination}
              {trip.status !== "ready" ? ` · ${trip.status}` : ""}
            </div>
          </div>
          {me ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {me.display_name}
              </span>
              <div
                className="flex size-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: me.color }}
                aria-hidden
              >
                {me.display_name.charAt(0).toUpperCase()}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <TabsShell active={tab} onChange={setTab} />

      {tab !== "map" ? (
        <div className="flex min-h-0 flex-1 flex-col pb-14 sm:pb-0">
          <MessageList
            messages={messages}
            participants={participantMap}
            currentParticipantId={participantId}
            emptyState={
              <div className="mx-auto max-w-sm text-center">
                <h3 className="text-base font-semibold">
                  {tab === "group"
                    ? "No messages yet"
                    : "Your private assistant"}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tab === "group"
                    ? "Say hi — or tag @agent once your trip is ingested."
                    : "Ask anything about the trip. Your messages stay private to you."}
                </p>
              </div>
            }
          />
          <ChatInput
            placeholder={
              tab === "group"
                ? "Message the group… (@agent to ask the AI)"
                : "Ask your private assistant…"
            }
            onSend={(content) =>
              send({
                content,
                senderParticipantId: participantId,
                senderType: "user",
              })
            }
            disabled={!activeRoomId || !participantId}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 pb-20 text-center">
          <div className="max-w-sm">
            <h3 className="text-base font-semibold">Map</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              The place map lands in milestone 7. Pins will appear here from
              WhatsApp mentions, docs, and agent suggestions.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

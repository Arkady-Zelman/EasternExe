"use client";

import { useRouter } from "next/navigation";

import { useParticipant } from "@/hooks/useParticipant";
import type { Participant, Trip } from "@/types/db";

interface Props {
  trip: Trip;
  participants: Participant[];
}

export function ParticipantPicker({ trip, participants }: Props) {
  const router = useRouter();
  const { assign } = useParticipant(trip.id);

  const pick = (id: string) => {
    assign(id);
    router.replace(`/trip/${trip.id}`);
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-md">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Who are you?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick your name to enter{" "}
            <span className="font-medium text-foreground">{trip.name}</span>.
          </p>
        </header>

        <ul className="mt-8 space-y-2">
          {participants.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => pick(p.id)}
                className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div
                  className="flex size-10 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: p.color }}
                  aria-hidden
                >
                  {p.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {p.display_name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    Tap to enter
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>

        {participants.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            No participants found for this trip.
          </p>
        ) : null}
      </div>
    </main>
  );
}

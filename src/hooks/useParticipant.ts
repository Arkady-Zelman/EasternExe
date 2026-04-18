"use client";

import { useEffect, useState } from "react";

export function useParticipant(tripId: string | undefined) {
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!tripId || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(`participantId_${tripId}`);
    setParticipantId(stored);
    setHydrated(true);
  }, [tripId]);

  const assign = (id: string) => {
    if (!tripId || typeof window === "undefined") return;
    window.localStorage.setItem(`participantId_${tripId}`, id);
    setParticipantId(id);
  };

  return { participantId, assign, hydrated };
}

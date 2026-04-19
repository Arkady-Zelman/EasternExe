"use client";

import { useEffect, useRef } from "react";

import type { OptimisticMessage } from "@/hooks/useChatMessages";

const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
const TICK_MS = 60 * 1000; // check every minute

/**
 * After 30 minutes of no new chat messages, fire a graph summary so the
 * trip brain absorbs recent conversation. Re-arms on every new message.
 * Only fires once per quiet period.
 */
export function useChatInactivityWatcher(
  tripId: string | undefined,
  messages: OptimisticMessage[]
) {
  const firedForLastMsgIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tripId) return;
    const tick = setInterval(() => {
      if (messages.length === 0) return;
      const last = messages[messages.length - 1];
      if (!last) return;

      // Don't fire twice for the same "latest message"
      if (firedForLastMsgIdRef.current === last.id) return;

      const age = Date.now() - new Date(last.created_at).getTime();
      if (age < INACTIVITY_MS) return;

      firedForLastMsgIdRef.current = last.id;
      fetch(`/api/trips/${tripId}/graph/summarize`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {
        // Swallow; will retry on next inactivity period
      });
    }, TICK_MS);
    return () => clearInterval(tick);
  }, [tripId, messages]);
}

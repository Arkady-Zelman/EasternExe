"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AgentRunActivation } from "@/lib/graph/types";

const POLL_INTERVAL_MS = 3000;
const WINDOW_MS = 5 * 60 * 1000; // keep last 5 min of activations in memory

/**
 * Subscribe to agent_run_activations for a trip. The graph viz uses this
 * to light up nodes that recent agent runs have touched. Realtime + 3s
 * polling fallback, same pattern as useChatMessages / useRealtimePlaces.
 */
export function useActivations(tripId: string | undefined) {
  const [activations, setActivations] = useState<AgentRunActivation[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const merge = useCallback((incoming: AgentRunActivation[]) => {
    setActivations((prev) => {
      const byId = new Map(prev.map((a) => [a.id, a]));
      for (const a of incoming) byId.set(a.id, a);
      const cutoff = Date.now() - WINDOW_MS;
      return Array.from(byId.values()).filter(
        (a) => new Date(a.activated_at).getTime() >= cutoff
      );
    });
  }, []);

  const fetchRecent = useCallback(async () => {
    if (!tripId) return;
    try {
      const since = new Date(Date.now() - WINDOW_MS).toISOString();
      const res = await fetch(
        `/api/activations?trip_id=${tripId}&since=${encodeURIComponent(since)}`,
        { cache: "no-store" }
      );
      const body = (await res.json().catch(() => ({}))) as {
        activations?: AgentRunActivation[];
      };
      if (body.activations) merge(body.activations);
    } catch (e) {
      console.error("useActivations fetch failed:", e);
    }
  }, [tripId, merge]);

  useEffect(() => {
    if (!tripId) {
      setActivations([]);
      return;
    }
    const supabase = getSupabaseBrowserClient();

    fetchRecent();

    const channel = supabase
      .channel(`activations:${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_run_activations",
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => merge([payload.new as AgentRunActivation])
      )
      .subscribe();

    pollRef.current = setInterval(fetchRecent, POLL_INTERVAL_MS);

    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tripId, fetchRecent, merge]);

  return { activations, refetch: fetchRecent };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { KGEdge, KGNode } from "@/lib/graph/types";

const POLL_INTERVAL_MS = 10000;

export function useTripGraph(tripId: string | undefined) {
  const [nodes, setNodes] = useState<KGNode[]>([]);
  const [edges, setEdges] = useState<KGEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const fetchAll = useCallback(async () => {
    if (!tripId) return;
    try {
      const res = await fetch(`/api/trips/${tripId}/graph`, {
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as {
        nodes?: KGNode[];
        edges?: KGEdge[];
      };
      if (body.nodes) setNodes(body.nodes);
      if (body.edges) setEdges(body.edges);
    } catch (e) {
      console.error("useTripGraph fetch failed:", e);
    }
  }, [tripId]);

  const rebuild = useCallback(async () => {
    if (!tripId) return;
    try {
      await fetch(`/api/trips/${tripId}/graph/rebuild`, { method: "POST" });
      await fetchAll();
    } catch (e) {
      console.error("rebuild failed:", e);
    }
  }, [tripId, fetchAll]);

  useEffect(() => {
    if (!tripId) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    let active = true;

    (async () => {
      setLoading(true);
      await fetchAll();
      if (active) setLoading(false);
    })();

    const channel = supabase
      .channel(`kg:${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "kg_nodes",
          filter: `trip_id=eq.${tripId}`,
        },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "kg_edges",
          filter: `trip_id=eq.${tripId}`,
        },
        () => fetchAll()
      )
      .subscribe();

    pollRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      supabase.removeChannel(channel);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tripId, fetchAll]);

  return { nodes, edges, loading, rebuild, refetch: fetchAll };
}

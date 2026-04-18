"use client";

import { useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Trip, Upload } from "@/types/db";

export function useTripStatus(tripId: string | undefined, initialTrip?: Trip) {
  const [trip, setTrip] = useState<Trip | undefined>(initialTrip);
  const [uploads, setUploads] = useState<Upload[]>([]);

  useEffect(() => {
    if (!tripId) return;
    const supabase = getSupabaseBrowserClient();
    let active = true;

    (async () => {
      const [{ data: t }, { data: u }] = await Promise.all([
        supabase.from("trips").select("*").eq("id", tripId).maybeSingle(),
        supabase.from("uploads").select("*").eq("trip_id", tripId),
      ]);
      if (!active) return;
      if (t) setTrip(t as Trip);
      if (u) setUploads(u as Upload[]);
    })();

    const channel = supabase
      .channel(`trip-status:${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trips",
          filter: `id=eq.${tripId}`,
        },
        (payload) => setTrip(payload.new as Trip)
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "uploads",
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) =>
          setUploads((prev) => {
            const u = payload.new as Upload;
            if (prev.find((p) => p.id === u.id)) return prev;
            return [...prev, u];
          })
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "uploads",
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) =>
          setUploads((prev) =>
            prev.map((u) =>
              u.id === (payload.new as Upload).id
                ? (payload.new as Upload)
                : u
            )
          )
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  return { trip, uploads };
}

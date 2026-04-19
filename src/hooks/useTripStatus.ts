"use client";

import { useEffect, useRef, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Trip, Upload } from "@/types/db";

const RESUME_AFTER_MS = 20_000;
const RESUME_COOLDOWN_MS = 30_000;

export function useTripStatus(tripId: string | undefined, initialTrip?: Trip) {
  const [trip, setTrip] = useState<Trip | undefined>(initialTrip);
  const [uploads, setUploads] = useState<Upload[]>([]);

  // Resume logic: track when we first saw ingesting, and when we last
  // fired a resume call (to avoid spamming on every render).
  const ingestStartRef = useRef<number | null>(null);
  const lastResumeRef = useRef<number>(0);

  useEffect(() => {
    if (!tripId) return;
    const supabase = getSupabaseBrowserClient();
    let active = true;

    const fetchFromServer = async () => {
      try {
        const res = await fetch(`/api/trips/${tripId}/snapshot`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          trip?: Trip;
          uploads?: Upload[];
        };
        if (!active) return;
        if (body.trip) setTrip(body.trip);
        if (body.uploads) setUploads(body.uploads);
      } catch (e) {
        console.error("useTripStatus initial fetch failed:", e);
      }
    };

    fetchFromServer();

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

    // Polling fallback via server snapshot (service role) — so we keep
    // working even before migration 003 grants anon read access.
    const pollHandle = setInterval(async () => {
      if (!active) return;
      try {
        const res = await fetch(`/api/trips/${tripId}/snapshot`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          trip?: Trip;
          uploads?: Upload[];
        };
        if (!active) return;
        if (body.trip) setTrip(body.trip);
        if (body.uploads) setUploads(body.uploads);
        if (body.trip?.status === "ready") clearInterval(pollHandle);
      } catch {
        // Transient — keep polling.
      }
    }, 5000);

    return () => {
      active = false;
      clearInterval(pollHandle);
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  // Resume: if trip is ingesting and has been for >20s without completing,
  // fire the resume endpoint once. The endpoint is idempotent.
  const tripStatus = trip?.status;
  useEffect(() => {
    if (!tripId) return;

    if (tripStatus === "ingesting") {
      if (!ingestStartRef.current) {
        ingestStartRef.current = Date.now();
      }

      const elapsed = Date.now() - ingestStartRef.current;
      const sinceLastResume = Date.now() - lastResumeRef.current;

      if (elapsed >= RESUME_AFTER_MS && sinceLastResume >= RESUME_COOLDOWN_MS) {
        lastResumeRef.current = Date.now();
        fetch(`/api/ingest/${tripId}/resume`, { method: "POST" }).catch(
          (e) => console.error("auto-resume failed:", e)
        );
      }
    } else {
      // Trip left ingesting state — reset the timer for next time
      ingestStartRef.current = null;
    }
  }, [tripId, tripStatus]);

  return { trip, uploads };
}

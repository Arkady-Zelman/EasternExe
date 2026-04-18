"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  FileIcon,
  RotateCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Trip, Upload } from "@/types/db";

interface Props {
  trip: Trip;
  uploads: Upload[];
}

function statusIcon(status: Upload["status"]) {
  if (status === "processed")
    return <CheckCircle2 className="size-4 text-green-600" />;
  if (status === "failed")
    return <AlertCircle className="size-4 text-destructive" />;
  if (status === "processing")
    return <Loader2 className="size-4 animate-spin text-primary" />;
  return <FileIcon className="size-4 text-muted-foreground" />;
}

export function IngestProgress({ trip, uploads }: Props) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const total = uploads.length;
  const done = uploads.filter(
    (u) => u.status === "processed" || u.status === "failed"
  ).length;
  const pct =
    trip.status === "ready"
      ? 100
      : total > 0
        ? Math.round((done / total) * 90) // reserve last 10% for LLM stage
        : 20;

  const isError = trip.status === "error";

  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/ingest/${trip.id}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Retry failed (${res.status})`);
      }
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : "Unknown error");
      setRetrying(false);
    }
    // On success, trips.status flips back to 'ingesting' via realtime; the
    // overlay will re-render from scratch.
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-xl animate-fade-in">
        <div className="flex items-center gap-3">
          {isError ? (
            <AlertCircle className="size-5 text-destructive" />
          ) : (
            <Loader2 className="size-5 animate-spin text-primary" />
          )}
          <div>
            <div className="text-sm font-semibold">
              {isError
                ? "Ingestion failed"
                : trip.status === "ingesting"
                  ? "Ingesting your trip…"
                  : "Getting ready…"}
            </div>
            <div className="text-xs text-muted-foreground">
              Parsing chats, transcribing intros, building profiles, and
              extracting places.
            </div>
          </div>
        </div>

        <Progress value={pct} />

        {isError && trip.error ? (
          <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
            {trip.error}
          </div>
        ) : null}

        {uploads.length > 0 ? (
          <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
            {uploads.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                {statusIcon(u.status)}
                <span className="min-w-0 flex-1 truncate">
                  {u.filename ?? u.kind}
                </span>
                <span className="text-muted-foreground">{u.status}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {isError ? (
          <div className="space-y-2">
            <Button
              type="button"
              onClick={retry}
              disabled={retrying}
              className="w-full"
            >
              {retrying ? (
                <>
                  <Loader2 className="animate-spin" /> Retrying…
                </>
              ) : (
                <>
                  <RotateCw /> Retry ingestion
                </>
              )}
            </Button>
            {retryError ? (
              <p className="text-center text-[11px] text-destructive">
                {retryError}
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="text-center text-[11px] text-muted-foreground">
          {isError
            ? "Chat + map stay empty until this succeeds."
            : "You can keep this tab open — updates arrive in realtime."}
        </p>
      </div>
    </div>
  );
}

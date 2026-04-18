"use client";

import { Bot, MessageCircle, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/components/map/categories";
import type { Participant, Place } from "@/types/db";

interface Props {
  place: Place;
  addedBy: Participant | null;
  onAskAgent: (place: Place) => void;
  onClose: () => void;
}

export function PlaceCard({ place, addedBy, onAskAgent, onClose }: Props) {
  const color = place.category ? CATEGORY_COLORS[place.category] : "#64748b";
  const label = place.category ? CATEGORY_LABELS[place.category] : "Other";

  return (
    <div className="w-[280px] rounded-xl border bg-card p-4 shadow-xl animate-fade-in">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">
            {place.name}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: color }}
            >
              {label}
            </span>
            {place.time_of_day && place.time_of_day !== "any" ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="size-3" />
                {place.time_of_day}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {place.notes ? (
        <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
          {place.notes}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        {place.added_by_agent ? (
          <>
            <Bot className="size-3" />
            Added by Agent
          </>
        ) : addedBy ? (
          <>
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: addedBy.color }}
              aria-hidden
            />
            Added by {addedBy.display_name}
          </>
        ) : (
          <>Ingested from group materials</>
        )}
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3 w-full"
        onClick={() => onAskAgent(place)}
      >
        <MessageCircle /> Ask Agent about this
      </Button>
    </div>
  );
}

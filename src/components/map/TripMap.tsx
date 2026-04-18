"use client";

import { useMemo, useState } from "react";
import Map, { Marker, Popup } from "react-map-gl";
import type { MapRef } from "react-map-gl";
import { useRef } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

import { PlaceCard } from "@/components/map/PlaceCard";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from "@/components/map/categories";
import { cn } from "@/lib/utils";
import type { Participant, Place, PlaceCategory, Trip } from "@/types/db";

interface Props {
  trip: Trip;
  places: Place[];
  participants: Participant[];
  onAskAgent: (place: Place) => void;
}

export function TripMap({ trip, places, participants, onAskAgent }: Props) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const [filter, setFilter] = useState<PlaceCategory | "all">("all");
  const [selected, setSelected] = useState<Place | null>(null);
  const mapRef = useRef<MapRef | null>(null);

  const participantsById = useMemo(
    () => Object.fromEntries(participants.map((p) => [p.id, p])),
    [participants]
  );

  const visible = useMemo(
    () =>
      places.filter(
        (p) =>
          p.lat != null &&
          p.lng != null &&
          (filter === "all" || p.category === filter)
      ),
    [places, filter]
  );

  const initialLat = trip.destination_lat ?? 35.6762; // Tokyo fallback
  const initialLng = trip.destination_lng ?? 139.6503;

  if (!token) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h3 className="text-base font-semibold">Map unavailable</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Add <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to{" "}
            <code>.env.local</code> and reload.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col">
      <div className="z-10 flex gap-1.5 overflow-x-auto border-b bg-background/80 px-4 py-2 backdrop-blur sm:px-6">
        <FilterChip
          label="All"
          active={filter === "all"}
          color="#475569"
          onClick={() => setFilter("all")}
        />
        {CATEGORY_ORDER.map((cat) => (
          <FilterChip
            key={cat}
            label={CATEGORY_LABELS[cat]}
            active={filter === cat}
            color={CATEGORY_COLORS[cat]}
            onClick={() => setFilter(cat)}
          />
        ))}
      </div>

      <div className="relative flex-1">
        <Map
          ref={mapRef}
          mapboxAccessToken={token}
          initialViewState={{
            latitude: initialLat,
            longitude: initialLng,
            zoom: 12,
          }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          style={{ width: "100%", height: "100%" }}
        >
          {visible.map((place) => {
            const color = place.category
              ? CATEGORY_COLORS[place.category]
              : "#64748b";
            return (
              <Marker
                key={place.id}
                latitude={place.lat!}
                longitude={place.lng!}
                anchor="bottom"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelected(place);
                }}
              >
                <button
                  type="button"
                  aria-label={place.name}
                  className="group relative flex items-center justify-center"
                >
                  <span
                    className="size-5 rounded-full border-2 border-white shadow-md transition-transform group-hover:scale-125"
                    style={{ backgroundColor: color }}
                  />
                </button>
              </Marker>
            );
          })}

          {selected ? (
            <Popup
              latitude={selected.lat!}
              longitude={selected.lng!}
              anchor="top"
              closeButton={false}
              closeOnClick={false}
              onClose={() => setSelected(null)}
              offset={16}
              maxWidth="320px"
            >
              <PlaceCard
                place={selected}
                addedBy={
                  selected.added_by
                    ? (participantsById[selected.added_by] ?? null)
                    : null
                }
                onAskAgent={(p) => {
                  setSelected(null);
                  onAskAgent(p);
                }}
                onClose={() => setSelected(null)}
              />
            </Popup>
          ) : null}
        </Map>

        {visible.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-10 mx-auto w-fit rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow">
            {places.length === 0
              ? "No places yet — ingestion will add pins"
              : "No places in this category"}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      )}
    >
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </button>
  );
}

"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TripBasicsState {
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
}

interface Props {
  value: TripBasicsState;
  onChange: (next: TripBasicsState) => void;
  errors?: Partial<Record<keyof TripBasicsState, string>>;
}

export function StepTripBasics({ value, onChange, errors }: Props) {
  const update = <K extends keyof TripBasicsState>(
    key: K,
    v: TripBasicsState[K]
  ) => onChange({ ...value, [key]: v });

  return (
    <div className="mx-auto w-full max-w-xl space-y-8">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Trip basics</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Name the trip and say where you&apos;re going.
        </p>
      </header>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="trip-name">Trip name</Label>
          <Input
            id="trip-name"
            autoFocus
            placeholder="Tokyo crew"
            value={value.name}
            onChange={(e) => update("name", e.target.value)}
          />
          {errors?.name ? (
            <p className="text-xs text-destructive">{errors.name}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="trip-destination">Destination</Label>
          <Input
            id="trip-destination"
            placeholder="Tokyo, Japan"
            value={value.destination}
            onChange={(e) => update("destination", e.target.value)}
          />
          {errors?.destination ? (
            <p className="text-xs text-destructive">{errors.destination}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="trip-start">Start date (optional)</Label>
            <Input
              id="trip-start"
              type="date"
              value={value.start_date}
              onChange={(e) => update("start_date", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trip-end">End date (optional)</Label>
            <Input
              id="trip-end"
              type="date"
              value={value.end_date}
              onChange={(e) => update("end_date", e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

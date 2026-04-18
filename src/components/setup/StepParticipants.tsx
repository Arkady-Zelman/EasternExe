"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pickColor } from "@/lib/colors";

export interface ParticipantDraft {
  tempId: string;
  display_name: string;
  color: string;
}

interface Props {
  value: ParticipantDraft[];
  onChange: (next: ParticipantDraft[]) => void;
  error?: string;
}

export function StepParticipants({ value, onChange, error }: Props) {
  const add = () => {
    onChange([
      ...value,
      {
        tempId: crypto.randomUUID(),
        display_name: "",
        color: pickColor(value.length),
      },
    ]);
  };

  const remove = (tempId: string) =>
    onChange(value.filter((p) => p.tempId !== tempId));

  const rename = (tempId: string, display_name: string) =>
    onChange(
      value.map((p) => (p.tempId === tempId ? { ...p, display_name } : p))
    );

  return (
    <div className="mx-auto w-full max-w-xl space-y-8">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Participants</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Add everyone on the trip. You need at least two.
        </p>
      </header>

      <div className="space-y-3">
        {value.map((p, i) => (
          <div
            key={p.tempId}
            className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm animate-fade-in"
          >
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: p.color }}
              aria-hidden
            >
              {p.display_name.trim().charAt(0).toUpperCase() || `#${i + 1}`}
            </div>
            <Input
              aria-label={`Participant ${i + 1} name`}
              placeholder="Name"
              value={p.display_name}
              onChange={(e) => rename(p.tempId, e.target.value)}
              className="flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(p.tempId)}
              aria-label={`Remove participant ${i + 1}`}
            >
              <Trash2 className="text-muted-foreground" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={add}
          className="w-full border-dashed"
        >
          <Plus /> Add participant
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          No participants yet — start by adding yourself.
        </p>
      ) : null}

      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          {value.length}/20 added
        </Label>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

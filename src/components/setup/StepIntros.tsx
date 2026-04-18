"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AudioRecorder } from "@/components/setup/AudioRecorder";

import type { ParticipantDraft } from "@/components/setup/StepParticipants";

export interface IntroDraft {
  blob: Blob | null;
  notes: string;
}

interface Props {
  participants: ParticipantDraft[];
  intros: Record<string, IntroDraft>;
  onChange: (next: Record<string, IntroDraft>) => void;
}

export function StepIntros({ participants, intros, onChange }: Props) {
  const update = (tempId: string, patch: Partial<IntroDraft>) => {
    onChange({
      ...intros,
      [tempId]: {
        blob: intros[tempId]?.blob ?? null,
        notes: intros[tempId]?.notes ?? "",
        ...patch,
      },
    });
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-8">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">
          Audio intros
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Each person records a short 30-second intro — what you like, what
          you&apos;re excited about. Totally optional, but quality suffers
          without it.
        </p>
      </header>

      <div className="space-y-4">
        {participants.map((p) => {
          const draft = intros[p.tempId] ?? { blob: null, notes: "" };
          return (
            <div
              key={p.tempId}
              className="space-y-3 rounded-xl border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: p.color }}
                  aria-hidden
                >
                  {p.display_name.trim().charAt(0).toUpperCase() || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {p.display_name || "Unnamed"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {draft.blob ? "Intro saved" : "No intro yet"}
                  </div>
                </div>
              </div>

              <AudioRecorder
                existing={draft.blob}
                onSave={(b) => update(p.tempId, { blob: b })}
                onClear={() => update(p.tempId, { blob: null })}
              />

              <div className="space-y-1.5">
                <Label
                  htmlFor={`notes-${p.tempId}`}
                  className="text-xs text-muted-foreground"
                >
                  Notes (optional)
                </Label>
                <Textarea
                  id={`notes-${p.tempId}`}
                  placeholder="Anything else the AI should know…"
                  value={draft.notes}
                  onChange={(e) => update(p.tempId, { notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

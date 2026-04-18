"use client";

import { useCallback, useRef, useState } from "react";
import { FileArchive, FileText, ImageIcon, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { UploadKind } from "@/types/db";

export interface FileDraft {
  tempId: string;
  file: File;
  kind: UploadKind;
}

interface Props {
  value: FileDraft[];
  onChange: (next: FileDraft[]) => void;
}

const ACCEPTED = ".zip,.pdf,.txt,.md,.png,.jpg,.jpeg";

function inferKind(file: File): UploadKind {
  const name = file.name.toLowerCase();
  if (name.endsWith(".zip")) return "whatsapp_zip";
  if (name.endsWith(".pdf") || name.endsWith(".txt") || name.endsWith(".md"))
    return "doc";
  if (
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg")
  )
    return "image";
  return "other";
}

function iconFor(kind: UploadKind) {
  if (kind === "whatsapp_zip") return <FileArchive className="text-muted-foreground" />;
  if (kind === "image") return <ImageIcon className="text-muted-foreground" />;
  return <FileText className="text-muted-foreground" />;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function StepUploads({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const next: FileDraft[] = Array.from(files).map((file) => ({
        tempId: crypto.randomUUID(),
        file,
        kind: inferKind(file),
      }));
      onChange([...value, ...next]);
    },
    [value, onChange]
  );

  const remove = (tempId: string) =>
    onChange(value.filter((f) => f.tempId !== tempId));

  return (
    <div className="mx-auto w-full max-w-xl space-y-8">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">
          Shared material
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Drop your WhatsApp export (.zip), any PDFs, notes, or screenshots.
          Everything gets ingested.
        </p>
      </header>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          drag
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/30 hover:bg-muted/60"
        }`}
      >
        <Upload className="size-8 text-muted-foreground" />
        <div className="text-sm font-medium">
          Drop files, or click to browse
        </div>
        <div className="text-xs text-muted-foreground">
          .zip · .pdf · .txt · .md · .png · .jpg
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </button>

      {value.length > 0 ? (
        <ul className="space-y-2">
          {value.map((f) => (
            <li
              key={f.tempId}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 animate-fade-in"
            >
              {iconFor(f.kind)}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {f.file.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {f.kind} · {formatBytes(f.file.size)}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(f.tempId)}
                aria-label={`Remove ${f.file.name}`}
              >
                <X className="text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          No files yet — you can also continue without any.
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

type State = "idle" | "recording" | "recorded";

interface Props {
  onSave: (blob: Blob) => void;
  onClear: () => void;
  existing?: Blob | null;
}

export function AudioRecorder({ onSave, onClear, existing }: Props) {
  const [state, setState] = useState<State>(existing ? "recorded" : "idle");
  const [blob, setBlob] = useState<Blob | null>(existing ?? null);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const b = new Blob(chunksRef.current, { type: "audio/webm" });
        setBlob(b);
        onSave(b);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(b);
        setState("recorded");
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setState("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not access microphone. Check browser permissions."
      );
    }
  };

  const stop = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current?.stop();
  };

  const reset = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setBlob(null);
    setElapsed(0);
    setPlaying(false);
    setState("idle");
    onClear();
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  };

  return (
    <div className="space-y-3">
      {state === "idle" ? (
        <Button type="button" size="sm" onClick={start}>
          <Mic /> Record intro
        </Button>
      ) : null}

      {state === "recording" ? (
        <div className="flex items-center gap-3 rounded-lg bg-destructive/10 px-3 py-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
          </span>
          <span className="font-mono text-xs tabular-nums">
            {Math.floor(elapsed / 60)
              .toString()
              .padStart(2, "0")}
            :{(elapsed % 60).toString().padStart(2, "0")}
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={stop}
            className="ml-auto"
          >
            <Square /> Stop
          </Button>
        </div>
      ) : null}

      {state === "recorded" && blob ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={togglePlay}
          >
            {playing ? <Pause /> : <Play />}
            {playing ? "Pause" : "Play"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={reset}>
            <RotateCcw /> Re-record
          </Button>
          <audio
            ref={audioRef}
            src={urlRef.current ?? undefined}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

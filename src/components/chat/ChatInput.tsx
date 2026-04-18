"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  placeholder?: string;
  onSend: (content: string) => Promise<void> | void;
  disabled?: boolean;
  /** Incrementing key that re-triggers the prefill; paired with `prefillContent`. */
  prefillKey?: number;
  prefillContent?: string;
}

export function ChatInput({
  placeholder,
  onSend,
  disabled,
  prefillKey,
  prefillContent,
}: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (prefillKey && prefillContent) {
      setValue(prefillContent);
      requestAnimationFrame(() => ref.current?.focus());
    }
  }, [prefillKey, prefillContent]);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setValue("");
      requestAnimationFrame(() => ref.current?.focus());
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-end gap-2 px-4 py-3 sm:px-6">
        <Textarea
          ref={ref}
          value={value}
          placeholder={placeholder ?? "Message the group…"}
          disabled={disabled || sending}
          rows={1}
          className="min-h-9 resize-none"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={!value.trim() || sending || disabled}
          aria-label="Send"
        >
          <Send />
        </Button>
      </div>
    </div>
  );
}

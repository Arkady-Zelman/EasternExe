export function ThinkingIndicator() {
  return (
    <div
      role="status"
      aria-label="Thinking"
      className="flex items-center gap-1 py-1"
    >
      <span className="size-1.5 animate-pulse-dot rounded-full bg-muted-foreground [animation-delay:-0.32s]" />
      <span className="size-1.5 animate-pulse-dot rounded-full bg-muted-foreground [animation-delay:-0.16s]" />
      <span className="size-1.5 animate-pulse-dot rounded-full bg-muted-foreground" />
    </div>
  );
}

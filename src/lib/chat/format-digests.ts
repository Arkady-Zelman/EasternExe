import "server-only";

/**
 * Format a list of chat_digests rows as a compact bullet-fact block for
 * agent context. Research note (2026): mid-tier LLMs (GLM-4.5 / Llama-3.1
 * 70B) read short natural-language bullets far better than raw JSON, and
 * specifics like dates / place names stay attached when they're listed
 * individually rather than buried in prose. We budget ~150 tokens per
 * digest so `maxDigests=5` stays well under 1k tokens total.
 */

interface DigestRow {
  window_start: string;
  window_end: string;
  message_count: number | null;
  topics_active: unknown;
  places_mentioned: unknown;
  decisions_noted: unknown;
  questions_raised: unknown;
  summary?: string | null;
}

function toArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function short(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  const mo = d.toLocaleString("en-US", { month: "short" });
  return `${mo} ${d.getUTCDate()}`;
}

export function formatDigestsBlock(
  digests: DigestRow[],
  opts: { maxDigests?: number } = {}
): string {
  const max = opts.maxDigests ?? 5;
  if (digests.length === 0) return "";

  // Oldest first — chronology reads more naturally when the reader knows
  // the sequence of events.
  const slice = digests.slice(0, max).reverse();

  const blocks: string[] = [];
  for (const d of slice) {
    const header = `Window: ${short(d.window_start)} → ${short(d.window_end)} · ${d.message_count ?? 0} msgs`;
    const topics = toArray<{ label: string; count: number }>(d.topics_active);
    const places = toArray<{ name: string; count: number }>(d.places_mentioned);
    const decisions = toArray<{ text: string }>(d.decisions_noted);
    const questions = toArray<{ text: string }>(d.questions_raised);

    const topicsLine =
      topics.length > 0
        ? `  - Topics: ${topics
            .slice(0, 6)
            .map((t) => `${t.label} (${t.count})`)
            .join(", ")}`
        : null;
    const placesLine =
      places.length > 0
        ? `  - Places mentioned: ${places
            .slice(0, 8)
            .map((p) => p.name)
            .join(", ")}`
        : null;
    const decisionLines = decisions
      .slice(0, 4)
      .map((x) => `  - Decided: ${x.text.slice(0, 180)}`);
    const questionLines = questions
      .slice(0, 4)
      .map((x) => `  - Asked: ${x.text.slice(0, 180)}`);
    const summaryLine = d.summary ? `  - Summary: ${d.summary.trim()}` : null;

    const bullets = [
      topicsLine,
      placesLine,
      ...decisionLines,
      ...questionLines,
      summaryLine,
    ].filter(Boolean) as string[];

    blocks.push([header, ...bullets].join("\n"));
  }

  return blocks.join("\n\n");
}

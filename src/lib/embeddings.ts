import { embedBatch } from "@/lib/openai";

/**
 * Approximate chunker. Targets ~500 tokens per chunk with ~50 overlap.
 * Uses character count with the 4 chars/token heuristic to avoid pulling
 * in tiktoken at runtime.
 */
const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 500;
const OVERLAP_TOKENS = 50;
const MAX_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN; // 2000
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN; // 200

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= MAX_CHARS) return [clean];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < clean.length) {
    let end = Math.min(cursor + MAX_CHARS, clean.length);
    // Prefer to break on a newline or sentence boundary if nearby
    if (end < clean.length) {
      const window = clean.slice(end - 200, end);
      const nlIdx = window.lastIndexOf("\n");
      const sentIdx = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? ")
      );
      const pickIdx = nlIdx >= 0 ? nlIdx : sentIdx;
      if (pickIdx > 0) {
        end = end - 200 + pickIdx + 1;
      }
    }
    chunks.push(clean.slice(cursor, end).trim());
    if (end >= clean.length) break;
    cursor = Math.max(end - OVERLAP_CHARS, cursor + 1);
  }
  return chunks.filter((c) => c.length > 0);
}

const BATCH = 100;

export async function embedMany(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const embs = await embedBatch(batch);
    out.push(...embs);
  }
  return out;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * Plain-text extraction for uploaded docs. PDFs go through pdf-parse,
 * .txt/.md go through UTF-8 decode, images skip text extraction in v1.
 */
export async function extractDocText(
  filename: string | null,
  buffer: Uint8Array
): Promise<string> {
  const lower = (filename ?? "").toLowerCase();

  if (lower.endsWith(".pdf")) {
    // Dynamic import avoids pdf-parse's startup-time test-file probe.
    const mod = (await import("pdf-parse")) as unknown as {
      default: (b: Buffer | Uint8Array) => Promise<{ text: string }>;
    };
    const pdf = mod.default ?? (mod as unknown as typeof mod.default);
    const buf = Buffer.from(buffer);
    const result = await pdf(buf);
    return result.text ?? "";
  }

  if (
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown")
  ) {
    return new TextDecoder("utf-8").decode(buffer);
  }

  // Fallback: try utf-8 decode, trim binary garbage
  try {
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    return decoded.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  } catch {
    return "";
  }
}

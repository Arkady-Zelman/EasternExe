import { transcribeAudioBlob } from "@/lib/openai";

export async function transcribeAudio(
  buffer: Uint8Array,
  filename = "intro.webm"
): Promise<string> {
  // Copy into a standalone ArrayBuffer to satisfy Blob constructor's BlobPart
  // type (some environments reject SharedArrayBuffer-backed views).
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  const blob = new Blob([copy.buffer], { type: "audio/webm" });
  return transcribeAudioBlob(blob, filename);
}

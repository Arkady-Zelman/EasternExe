import "server-only";

import OpenAI from "openai";

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY — check .env.local");
  client = new OpenAI({ apiKey });
  return client;
}

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const WHISPER_MODEL = "whisper-1";
export const EMBEDDING_DIMS = 1536;

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const openai = getOpenAIClient();
  const result = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return result.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export async function transcribeAudioBlob(
  blob: Blob,
  filename = "audio.webm"
): Promise<string> {
  const openai = getOpenAIClient();
  const file = new File([blob], filename, { type: blob.type || "audio/webm" });
  const transcription = await openai.audio.transcriptions.create({
    model: WHISPER_MODEL,
    file,
    response_format: "text",
  });
  // When response_format is "text", the SDK returns a plain string.
  return typeof transcription === "string"
    ? transcription
    : (transcription as { text: string }).text;
}

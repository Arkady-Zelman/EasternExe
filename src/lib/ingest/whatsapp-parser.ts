import JSZip from "jszip";

export interface ParsedWhatsApp {
  /** normalized `[timestamp] Name: message` lines, one per line */
  text: string;
  /** media attachments found inside the zip (not _chat.txt) */
  mediaFiles: { filename: string; data: Uint8Array }[];
  /** distinct sender names we saw — useful for debugging */
  senders: string[];
}

// iOS:     [25/02/2026, 14:30:12] Name: message
// iOS alt: [25/02/2026, 14:30:12] Name: ‎message
// Android: 25/02/2026, 14:30 - Name: message
const IOS_LINE = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.+?):\s*(.*)$/;
const ANDROID_LINE =
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(.+?):\s*(.*)$/;

function normalizeLine(line: string): string | null {
  const iosMatch = line.match(IOS_LINE);
  if (iosMatch) {
    const [, date, time, sender, msg] = iosMatch;
    return `[${date} ${time}] ${sender}: ${msg.replace(/\u200e/g, "").trim()}`;
  }
  const androidMatch = line.match(ANDROID_LINE);
  if (androidMatch) {
    const [, date, time, sender, msg] = androidMatch;
    return `[${date} ${time}] ${sender}: ${msg.trim()}`;
  }
  return null;
}

export async function parseWhatsAppZip(
  buffer: Uint8Array
): Promise<ParsedWhatsApp> {
  const zip = await JSZip.loadAsync(buffer);
  const outLines: string[] = [];
  const mediaFiles: { filename: string; data: Uint8Array }[] = [];
  const senders = new Set<string>();

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const lowerName = path.toLowerCase();
    if (
      lowerName.endsWith("_chat.txt") ||
      lowerName.endsWith("chat.txt") ||
      lowerName.endsWith(".txt")
    ) {
      const content = await file.async("string");
      let buffered: string | null = null;
      for (const rawLine of content.split(/\r?\n/)) {
        const normalized = normalizeLine(rawLine);
        if (normalized) {
          if (buffered) outLines.push(buffered);
          buffered = normalized;
          const senderMatch = normalized.match(/^\[.+?\]\s+(.+?):/);
          if (senderMatch) senders.add(senderMatch[1]);
        } else if (buffered && rawLine.trim()) {
          // continuation of the previous message (multi-line)
          buffered += `\n${rawLine.trim()}`;
        }
      }
      if (buffered) outLines.push(buffered);
    } else {
      // likely media (image/video/audio); keep the file
      const data = await file.async("uint8array");
      if (data.byteLength > 0) {
        const filename = path.split("/").pop() ?? path;
        mediaFiles.push({ filename, data });
      }
    }
  }

  return {
    text: outLines.join("\n"),
    mediaFiles,
    senders: Array.from(senders),
  };
}

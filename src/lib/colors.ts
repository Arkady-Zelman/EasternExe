/**
 * 8 distinct participant avatar colors (hex).
 * Used in round-robin fashion as participants are added.
 */
export const PARTICIPANT_COLORS = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#eab308", // yellow-500
  "#22c55e", // green-500
  "#06b6d4", // cyan-500
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
] as const;

export function pickColor(index: number): string {
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
}

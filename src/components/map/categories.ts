import type { PlaceCategory } from "@/types/db";

export const CATEGORY_COLORS: Record<PlaceCategory, string> = {
  food: "#f97316", // orange
  drinks: "#ec4899", // pink
  sight: "#3b82f6", // blue
  shopping: "#22c55e", // green
  nature: "#14b8a6", // teal
  nightlife: "#8b5cf6", // violet
  other: "#94a3b8", // slate
};

export const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  food: "Food",
  drinks: "Drinks",
  sight: "Sights",
  shopping: "Shopping",
  nature: "Nature",
  nightlife: "Nightlife",
  other: "Other",
};

export const CATEGORY_ORDER: PlaceCategory[] = [
  "food",
  "drinks",
  "sight",
  "shopping",
  "nature",
  "nightlife",
];

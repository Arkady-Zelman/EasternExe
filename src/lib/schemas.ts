import { z } from "zod";

// ---------------------------------------------------------------
// Setup flow — form validation
// ---------------------------------------------------------------
export const tripBasicsSchema = z.object({
  name: z.string().trim().min(1, "Trip name is required").max(120),
  destination: z.string().trim().min(1, "Destination is required").max(160),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
});
export type TripBasics = z.infer<typeof tripBasicsSchema>;

export const participantDraftSchema = z.object({
  display_name: z.string().trim().min(1, "Name is required").max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type ParticipantDraft = z.infer<typeof participantDraftSchema>;

// ---------------------------------------------------------------
// API — POST /api/trips
// ---------------------------------------------------------------
export const createTripRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  destination: z.string().trim().min(1).max(160),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  participants: z
    .array(participantDraftSchema)
    .min(2, "At least 2 participants required")
    .max(20),
});
export type CreateTripRequest = z.infer<typeof createTripRequestSchema>;

// ---------------------------------------------------------------
// LLM structured outputs (used by M5 ingestion + agents)
// ---------------------------------------------------------------
export const participantProfileLlmSchema = z.object({
  personality: z.string().min(1).max(400),
  interests: z.array(z.string()).max(20),
  budget_style: z.string().max(80),
  travel_style: z.string().max(80),
  food_preferences: z.array(z.string()).max(20),
  dislikes: z.array(z.string()).max(20),
  dealbreakers: z.array(z.string()).max(20),
  open_questions: z.array(z.string()).max(20),
});
export type ParticipantProfileLlm = z.infer<typeof participantProfileLlmSchema>;

export const tripMemoryLlmSchema = z.object({
  destination: z.string(),
  constraints: z.array(z.string()).max(30),
  group_preferences: z.array(z.string()).max(30),
  priorities: z.array(z.string()).max(30),
  tensions: z.array(z.string()).max(30),
  decisions_made: z.array(z.string()).max(30),
  open_questions: z.array(z.string()).max(30),
});
export type TripMemoryLlm = z.infer<typeof tripMemoryLlmSchema>;

export const extractedPlaceSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum([
    "food",
    "drinks",
    "sight",
    "shopping",
    "nature",
    "nightlife",
    "other",
  ]),
  time_of_day: z
    .enum(["morning", "afternoon", "evening", "night", "any"])
    .default("any"),
  notes: z.string().max(600).default(""),
  source_hint: z.string().max(200).default(""),
});
export type ExtractedPlace = z.infer<typeof extractedPlaceSchema>;

export const extractedPlacesResponseSchema = z.object({
  places: z.array(extractedPlaceSchema).max(100),
});

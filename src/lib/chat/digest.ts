import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deterministic chat-digest builder.
 *
 * Given a time window and a source (`chat_messages` for live chat, or
 * `upload_chunks` for an imported WhatsApp export), produces a structured
 * fact record: topics discussed, places mentioned, decisions noted,
 * questions raised, and the most active participants.
 *
 * No LLM calls — the extraction is entirely keyword- and heuristic-based so
 * it works even when Z.ai is rate-limited. An LLM pass can upgrade the
 * optional `summary` prose field later.
 *
 * The research (mem0, LangGraph, Letta benchmarks) is clear that rolling
 * prose summaries lose specifics — dates, proper names, numbers — first.
 * By extracting facts to typed columns we keep those specifics pinned
 * regardless of how many digests pile up.
 */

// Topic vocabulary — MUST stay aligned with src/lib/graph/build.ts TOPICS.
// Keeping the patterns here is fine duplication; importing server-only code
// into a server-only module is safe.
const TOPICS: { id: string; label: string; pattern: RegExp }[] = [
  {
    id: "food",
    label: "Food",
    pattern:
      /\b(food|eat|eating|restaurant|dinner|lunch|breakfast|brunch|ramen|sushi|pho|banh|laksa|dumpling|bbq|burger|pizza|bakery|pastry|dim\s*sum|cuisine|chef|menu|michelin|omakase|pie|mash|curry|noodle|taco|buffet|dish|meal|kitchen|cafe|café|kaya|roast)\b/i,
  },
  {
    id: "drinks",
    label: "Drinks & Bars",
    pattern:
      /\b(drink|drinks|cocktail|wine|whisky|whiskey|bar\b|beer|pint|pub|ale|lager|cider|mezcal|gin|vodka|bourbon|sommelier)\b/i,
  },
  {
    id: "nightlife",
    label: "Nightlife",
    pattern:
      /\b(nightlife|club|jazz|live music|dj|late-night|night out|dancing|karaoke)\b/i,
  },
  {
    id: "sight",
    label: "Sights & Culture",
    pattern:
      /\b(museum|gallery|art|exhibit|cultural|history|historic|temple|shrine|palace|castle|tower|cathedral|architecture|landmark|viewpoint|v&a|tate|british\s*museum)\b/i,
  },
  {
    id: "shopping",
    label: "Shopping",
    pattern:
      /\b(shop|shopping|market|boutique|store|souvenir|vintage|flea|flower\s*market|outlet|portobello|columbia)\b/i,
  },
  {
    id: "nature",
    label: "Nature & Outdoors",
    pattern:
      /\b(park|garden|hike|trail|river|waterfront|beach|outdoor|green|forest)\b/i,
  },
  {
    id: "logistics",
    label: "Travel & Logistics",
    pattern:
      /\b(flight|airline|airport|airbnb|hotel|room|check-in|check\s*in|taxi|tube|train|transfer|pass|adapter|baggage|arrival|departure|landing|transit|contactless|oyster|lhr|heathrow)\b/i,
  },
  {
    id: "schedule",
    label: "Schedule",
    pattern:
      /\b(schedule|morning|afternoon|evening|booking|reservation|booked|reserved|slot|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  },
  {
    id: "budget",
    label: "Budget",
    pattern:
      /(£\s?\d|\$\s?\d|pp\b|per\s*person|splurge|afford|budget|reasonable|mid-range)/i,
  },
  {
    id: "dietary",
    label: "Diet & Allergies",
    pattern:
      /\b(allerg|pescatarian|vegetarian|vegan|gluten|lactose|dairy|peanut|shellfish|halal|kosher|dealbreaker|diet|don't\s*eat|doesn't\s*eat)\b/i,
  },
];

// Phrases that signal a concrete decision was recorded.
const DECISION_PATTERN =
  /\b(booked|confirmed|locked|reserved|bought|paid|decided|settled|we\s*(?:are|will|'re|'ll)\s*(?:going|doing|staying))\b/i;

// Phrases that signal an open question (beyond just ending with '?').
const QUESTION_PATTERN =
  /\b(should\s*we|can\s*we|anyone\s*(?:else\s*)?(?:got|know|have)|who\s+(?:wants|has|knows)|which\s+(?:one|day|place))\b/i;

export interface DigestMessage {
  id: string | null;
  sender_name: string | null;
  participant_id: string | null;
  content: string;
  created_at: string;
}

export interface DigestParticipant {
  id: string;
  display_name: string;
  count: number;
}

export interface DigestTopic {
  id: string;
  label: string;
  count: number;
  sample: string | null;
}

export interface DigestPlaceMention {
  id: string | null; // places.id if matched
  name: string;
  count: number;
}

export interface DigestBuildResult {
  message_count: number;
  participants_active: DigestParticipant[];
  topics_active: DigestTopic[];
  places_mentioned: DigestPlaceMention[];
  decisions_noted: { text: string; message_id: string | null }[];
  questions_raised: { text: string; message_id: string | null }[];
}

/** Extract structured facts from a list of messages within a window. */
export function computeDeterministicDigest(args: {
  messages: DigestMessage[];
  participants: { id: string; display_name: string }[];
  places: { id: string; name: string }[];
}): DigestBuildResult {
  const { messages, participants, places } = args;

  const participantById = new Map(participants.map((p) => [p.id, p]));
  const nameCounts = new Map<string, number>();

  const topicCounts = new Map<
    string,
    { id: string; label: string; count: number; sample: string | null }
  >();

  const placeCounts = new Map<
    string,
    { id: string | null; name: string; count: number }
  >();

  const decisions: { text: string; message_id: string | null }[] = [];
  const questions: { text: string; message_id: string | null }[] = [];

  // Prepare lowercase place-name substrings for cheap matching. Keep names
  // above 3 chars — 'The' would hit every sentence otherwise.
  const placeMatchers = places
    .map((p) => ({ id: p.id, name: p.name, needle: p.name.toLowerCase() }))
    .filter((p) => p.needle.length > 3);

  for (const m of messages) {
    if (!m.content?.trim()) continue;
    const text = m.content;
    const lower = text.toLowerCase();

    if (m.participant_id) {
      nameCounts.set(
        m.participant_id,
        (nameCounts.get(m.participant_id) ?? 0) + 1
      );
    }

    // Topics
    for (const t of TOPICS) {
      if (t.pattern.test(text)) {
        const existing = topicCounts.get(t.id);
        if (existing) {
          existing.count += 1;
        } else {
          topicCounts.set(t.id, {
            id: t.id,
            label: t.label,
            count: 1,
            sample: text.slice(0, 140),
          });
        }
      }
    }

    // Places — substring match. We rank by count later so repeated mentions
    // bubble up naturally.
    for (const p of placeMatchers) {
      if (lower.includes(p.needle)) {
        const key = p.id;
        const existing = placeCounts.get(key);
        if (existing) existing.count += 1;
        else placeCounts.set(key, { id: p.id, name: p.name, count: 1 });
      }
    }

    // Decisions
    if (DECISION_PATTERN.test(text)) {
      decisions.push({ text: text.trim(), message_id: m.id });
    }

    // Questions — either explicit "?" or question-phrase heuristic
    if (
      (text.trim().endsWith("?") && text.length < 200) ||
      QUESTION_PATTERN.test(text)
    ) {
      questions.push({ text: text.trim(), message_id: m.id });
    }
  }

  const participants_active: DigestParticipant[] = Array.from(nameCounts.entries())
    .map(([id, count]) => ({
      id,
      display_name: participantById.get(id)?.display_name ?? "Unknown",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const topics_active: DigestTopic[] = Array.from(topicCounts.values()).sort(
    (a, b) => b.count - a.count
  );

  const places_mentioned: DigestPlaceMention[] = Array.from(placeCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  // Dedupe decisions/questions by first 80 chars so the same phrase said
  // twice doesn't double-count.
  const uniq = <T extends { text: string }>(arr: T[]): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const it of arr) {
      const key = it.text.slice(0, 80).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
      if (out.length >= 30) break;
    }
    return out;
  };

  return {
    message_count: messages.length,
    participants_active,
    topics_active,
    places_mentioned,
    decisions_noted: uniq(decisions),
    questions_raised: uniq(questions),
  };
}

/**
 * Load + build a digest for a window of `chat_messages` in a room/trip.
 * Use this when the live group chat has real activity.
 */
export async function buildDigestFromChatMessages(
  supabase: SupabaseClient,
  args: {
    tripId: string;
    roomId?: string; // if omitted, defaults to the group room
    windowStart: Date;
    windowEnd: Date;
  }
): Promise<DigestBuildResult> {
  const { tripId, roomId, windowStart, windowEnd } = args;

  let targetRoomId = roomId;
  if (!targetRoomId) {
    const { data: groupRoom } = await supabase
      .from("chat_rooms")
      .select("id")
      .eq("trip_id", tripId)
      .eq("type", "group")
      .maybeSingle();
    targetRoomId = (groupRoom as { id: string } | null)?.id;
  }

  const { data: msgData } = await supabase
    .from("chat_messages")
    .select(
      "id, sender_participant_id, sender_label, content, created_at"
    )
    .eq("room_id", targetRoomId ?? "")
    .eq("sender_type", "user")
    .gte("created_at", windowStart.toISOString())
    .lt("created_at", windowEnd.toISOString())
    .order("created_at", { ascending: true });

  const rawMessages = (msgData ?? []) as {
    id: string;
    sender_participant_id: string | null;
    sender_label: string | null;
    content: string;
    created_at: string;
  }[];

  const { data: participantData } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("trip_id", tripId);
  const participants = (participantData ?? []) as {
    id: string;
    display_name: string;
  }[];
  const pById = new Map(participants.map((p) => [p.id, p.display_name]));

  const { data: placeData } = await supabase
    .from("places")
    .select("id, name")
    .eq("trip_id", tripId);
  const places = (placeData ?? []) as { id: string; name: string }[];

  const messages: DigestMessage[] = rawMessages.map((m) => ({
    id: m.id,
    sender_name: m.sender_participant_id
      ? (pById.get(m.sender_participant_id) ?? m.sender_label ?? null)
      : m.sender_label,
    participant_id: m.sender_participant_id,
    content: m.content,
    created_at: m.created_at,
  }));

  return computeDeterministicDigest({ messages, participants, places });
}

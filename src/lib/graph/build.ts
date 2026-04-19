import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Participant,
  ParticipantProfile,
  Place,
  Trip,
  TripMemory,
} from "@/types/db";
import type { KGNodeKind, KGRelation } from "./types";

/**
 * Deterministic graph builder. No LLM calls. Turns whatever's already in
 * trips/participants/participant_profiles/places/trip_memory into a graph.
 *
 * Stable origin keys mean re-running this is idempotent: the same row in
 * (e.g.) trip_memory.constraints always produces the same node.
 */

interface PendingNode {
  kind: KGNodeKind;
  label: string;
  properties?: Record<string, unknown>;
  importance?: number;
  origin_table: string;
  origin_id: string;
}

interface PendingEdge {
  src_origin: string; // origin_id of src
  dst_origin: string;
  relation: KGRelation;
  weight?: number;
  properties?: Record<string, unknown>;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Fixed topic vocabulary + keyword heuristics. Pick the first topic whose
 * pattern hits; fall back to null (no topic edge) so we don't over-attach.
 */
const TOPICS: {
  id: string;
  label: string;
  pattern: RegExp;
}[] = [
  {
    id: "food",
    label: "Food",
    pattern:
      /\b(food|eat|eating|restaurant|dinner|lunch|breakfast|brunch|ramen|sushi|pho|banh|laksa|dumpling|bbq|burger|pizza|bakery|pastry|dim sum|cuisine|chef|menu|michelin|omakase|pie|mash|curry|noodle|taco|buffet|dish|meal|kitchen)\b/i,
  },
  {
    id: "drinks",
    label: "Drinks & Bars",
    pattern:
      /\b(drink|drinks|cocktail|wine|whisky|whiskey|bar\b|beer|pint|pub|ale|lager|cider|mezcal|gin|vodka|bourbon|natural wine|sommelier)\b/i,
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
      /\b(sight|museum|gallery|art|exhibit|cultural|history|historic|temple|shrine|palace|castle|tower|cathedral|architecture|landmark|viewpoint|v&a|tate|british museum)\b/i,
  },
  {
    id: "shopping",
    label: "Shopping",
    pattern:
      /\b(shop|shopping|market|boutique|store|souvenir|vintage|flea|flower market|outlet)\b/i,
  },
  {
    id: "nature",
    label: "Nature & Outdoors",
    pattern:
      /\b(park|garden|nature|hike|trail|walk|river|waterfront|beach|outdoor|green|forest)\b/i,
  },
  {
    id: "logistics",
    label: "Travel & Logistics",
    pattern:
      /\b(flight|airline|airport|airbnb|hotel|room|check-in|check in|taxi|tube|train|transfer|pass|adapter|baggage|arrival|departure|landing|transit|contactless|oyster)\b/i,
  },
  {
    id: "schedule",
    label: "Schedule",
    pattern:
      /\b(date|dates|schedule|day|morning|afternoon|evening|night\b|booking|reservation|booked|reserved|slot|time)\b/i,
  },
  {
    id: "budget",
    label: "Budget",
    pattern:
      /\b(budget|£\d|\$\d|cost|price|cheap|expensive|splurge|pp\b|per person|afford|reasonable|mid-range)\b/i,
  },
  {
    id: "dietary",
    label: "Diet & Allergies",
    pattern:
      /\b(allerg|pescatarian|vegetarian|vegan|gluten|lactose|dairy|peanut|shellfish|halal|kosher|dealbreaker|diet)\b/i,
  },
];

function inferTopic(text: string): string | null {
  for (const t of TOPICS) if (t.pattern.test(text)) return t.id;
  return null;
}

function placeCategoryToTopic(category: string | null | undefined): string | null {
  switch (category) {
    case "food":
      return "food";
    case "drinks":
      return "drinks";
    case "nightlife":
      return "nightlife";
    case "sight":
      return "sight";
    case "shopping":
      return "shopping";
    case "nature":
      return "nature";
    default:
      return null;
  }
}

/**
 * Day of week detection from free text (place.notes, decisions). A
 * given note can mention multiple days ("Saturday or Sunday") — we emit
 * an edge for each hit. Matches both full ("Tuesday") and abbreviated
 * ("Tue") forms plus ordinal phrases.
 */
const DAY_PATTERNS: { id: string; label: string; pattern: RegExp }[] = [
  { id: "day_mon", label: "Mon", pattern: /\b(monday|mon\b)/i },
  { id: "day_tue", label: "Tue", pattern: /\b(tuesday|tue\b|tues\b)/i },
  { id: "day_wed", label: "Wed", pattern: /\b(wednesday|wed\b)/i },
  { id: "day_thu", label: "Thu", pattern: /\b(thursday|thu\b|thur\b|thurs\b)/i },
  { id: "day_fri", label: "Fri", pattern: /\b(friday|fri\b)/i },
  { id: "day_sat", label: "Sat", pattern: /\b(saturday|sat\b)/i },
  { id: "day_sun", label: "Sun", pattern: /\b(sunday|sun\b)/i },
];

function inferDays(text: string | null | undefined): string[] {
  if (!text) return [];
  const hits: string[] = [];
  for (const d of DAY_PATTERNS) if (d.pattern.test(text)) hits.push(d.id);
  return hits;
}

/** Haversine distance in meters, for NEAR sibling edges. */
function distanceMeters(
  a: { lat: number | null; lng: number | null },
  b: { lat: number | null; lng: number | null }
): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
    return Infinity;
  }
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function collectPending(args: {
  trip: Trip;
  participants: Participant[];
  profiles: ParticipantProfile[];
  places: Place[];
  memory: TripMemory | null;
}): { nodes: PendingNode[]; edges: PendingEdge[] } {
  const nodes: PendingNode[] = [];
  const edges: PendingEdge[] = [];
  const topicsUsed = new Set<string>();

  const topicOriginOf = (topicId: string) => `topic:${topicId}`;

  const attachTopic = (
    subjectOrigin: string,
    text: string,
    fallbackTopic?: string | null
  ) => {
    const topic = inferTopic(text) ?? fallbackTopic ?? null;
    if (!topic) return;
    topicsUsed.add(topic);
    edges.push({
      src_origin: subjectOrigin,
      dst_origin: topicOriginOf(topic),
      relation: "ABOUT",
    });
  };

  // 1. Trip hub
  const tripOrigin = `trip:${args.trip.id}`;
  nodes.push({
    kind: "trip",
    label: args.trip.destination ?? args.trip.name,
    properties: {
      name: args.trip.name,
      destination: args.trip.destination,
      start_date: args.trip.start_date,
      end_date: args.trip.end_date,
    },
    importance: 1.0,
    origin_table: "trips",
    origin_id: tripOrigin,
  });

  // 2. Person nodes — NO direct person→trip edge. People connect to the
  // graph purely through topics their preferences/styles/dealbreakers imply.
  // This is what breaks the per-person sphere clustering: without a
  // person→trip link (and without per-person pref nodes), the force layout
  // no longer orbits participants around a personal hub.
  const profileByParticipant = new Map(
    args.profiles.map((p) => [p.participant_id, p])
  );
  for (const p of args.participants) {
    const profile = profileByParticipant.get(p.id);
    const personOrigin = `person:${p.id}`;
    nodes.push({
      kind: "person",
      label: p.display_name,
      properties: {
        color: p.color,
        personality: profile?.personality ?? null,
        budget_style: profile?.budget_style ?? null,
        travel_style: profile?.travel_style ?? null,
      },
      importance: 0.9,
      origin_table: "participants",
      origin_id: personOrigin,
    });

    // Connect person → topic via everything we know about their preferences.
    // Each attachTopic emits a single edge, so a person who likes food + has
    // pescatarian dealbreaker sits near both the Food and Dietary hubs.
    if (profile?.budget_style) attachTopic(personOrigin, profile.budget_style, "budget");
    if (profile?.travel_style) attachTopic(personOrigin, profile.travel_style);
    if (profile?.personality) attachTopic(personOrigin, profile.personality);
    for (const item of profile?.interests ?? []) attachTopic(personOrigin, item);
    for (const item of profile?.food_preferences ?? [])
      attachTopic(personOrigin, item, "food");
    for (const item of profile?.dislikes ?? []) attachTopic(personOrigin, item);

    // Dealbreakers still become constraint nodes — they're too important to
    // collapse. Anchored to the relevant topic (not the trip, not the
    // person) so peers with the same dietary constraint cluster together.
    for (const db of profile?.dealbreakers ?? []) {
      const cOrigin = `constraint:${slug(db)}`;
      nodes.push({
        kind: "constraint",
        label: db,
        properties: { source: "dealbreaker", owner: p.display_name },
        importance: 0.9,
        origin_table: "derived",
        origin_id: cOrigin,
      });
      attachTopic(cOrigin, db, "dietary");
    }
  }

  // 3. Place nodes → ABOUT → topic hub. PROPOSED edges dropped so the force
  // layout no longer orbits each place around its champion.
  const daysUsed = new Set<string>();
  const dayOriginOf = (dayId: string) => `day:${dayId}`;

  interface PlaceIndex {
    origin: string;
    place: Place;
    days: string[];
    timeOfDay: string | null;
  }
  const placeIndex: PlaceIndex[] = [];

  for (const place of args.places) {
    const placeOrigin = `place:${place.id}`;
    nodes.push({
      kind: "place",
      label: place.name,
      properties: {
        category: place.category,
        lat: place.lat,
        lng: place.lng,
        time_of_day: place.time_of_day,
        added_by_agent: place.added_by_agent,
        status: place.status,
      },
      importance: 0.6,
      origin_table: "places",
      origin_id: placeOrigin,
    });
    const placeTopic = placeCategoryToTopic(place.category);
    if (placeTopic) {
      topicsUsed.add(placeTopic);
      edges.push({
        src_origin: placeOrigin,
        dst_origin: topicOriginOf(placeTopic),
        relation: "ABOUT",
      });
    } else {
      attachTopic(placeOrigin, place.name);
    }

    // Day attachment from notes (e.g., "Thu lunch", "Sunday roast").
    const placeDays = inferDays(`${place.name} ${place.notes ?? ""}`);
    for (const dayId of placeDays) {
      daysUsed.add(dayId);
      edges.push({
        src_origin: placeOrigin,
        dst_origin: dayOriginOf(dayId),
        relation: "SCHEDULED_ON",
      });
    }

    placeIndex.push({
      origin: placeOrigin,
      place,
      days: placeDays,
      timeOfDay:
        place.time_of_day && place.time_of_day !== "any"
          ? place.time_of_day
          : null,
    });
  }

  // 3b. Sparse sibling edges between places — topic hubs alone produce
  // a star-graph hairball. Research (GraphRAG, LeanRAG) says the fix is
  // typed + capped cross-links. Rules:
  //
  //   NEAR (≤600m)          weight 0.55, max 2 per place
  //   SAME_DAY              weight 0.45, max 1 per place
  //   SAME_TIME_OF_DAY      weight 0.25, max 1 per place
  //
  // Caps are enforced by degree, so we pick each place's closest peers.
  const NEAR_METERS = 600;
  const NEAR_CAP = 2;
  const SAME_DAY_CAP = 1;
  const SAME_TOD_CAP = 1;

  // Precompute pairwise distances for all places with coords.
  for (let i = 0; i < placeIndex.length; i++) {
    const a = placeIndex[i];
    // NEAR — pick up to NEAR_CAP closest places under threshold.
    const nearCandidates: { other: PlaceIndex; dist: number }[] = [];
    for (let j = 0; j < placeIndex.length; j++) {
      if (i === j) continue;
      const b = placeIndex[j];
      const d = distanceMeters(a.place, b.place);
      if (d <= NEAR_METERS) nearCandidates.push({ other: b, dist: d });
    }
    nearCandidates.sort((x, y) => x.dist - y.dist);
    const pickedNear = nearCandidates.slice(0, NEAR_CAP);
    for (const c of pickedNear) {
      // Undirected — only emit if a.origin < c.origin to avoid duplicates.
      if (a.origin < c.other.origin) {
        edges.push({
          src_origin: a.origin,
          dst_origin: c.other.origin,
          relation: "NEAR",
          weight: 0.55,
          properties: { distance_m: Math.round(c.dist) },
        });
      }
    }

    // SAME_DAY — first candidate per day.
    if (a.days.length > 0) {
      const sameDayCandidates = placeIndex.filter(
        (b) =>
          b.origin !== a.origin &&
          b.origin > a.origin &&
          b.days.some((d) => a.days.includes(d))
      );
      for (const b of sameDayCandidates.slice(0, SAME_DAY_CAP)) {
        edges.push({
          src_origin: a.origin,
          dst_origin: b.origin,
          relation: "SAME_DAY",
          weight: 0.45,
        });
      }
    }

    // SAME_TIME_OF_DAY — cheap slot-chaining.
    if (a.timeOfDay) {
      const sameTodCandidates = placeIndex.filter(
        (b) =>
          b.origin !== a.origin &&
          b.origin > a.origin &&
          b.timeOfDay === a.timeOfDay
      );
      for (const b of sameTodCandidates.slice(0, SAME_TOD_CAP)) {
        edges.push({
          src_origin: a.origin,
          dst_origin: b.origin,
          relation: "SAME_TIME_OF_DAY",
          weight: 0.25,
        });
      }
    }
  }

  // 4. Trip-memory items — connect only to their inferred topic, NOT to
  // the trip hub. This keeps the trip node from becoming a single over-
  // connected super-hub. If inferTopic misses, the item falls through to a
  // "general" topic so it stays in the graph.
  if (args.memory) {
    const m = args.memory;
    const attachOrFallback = (origin: string, text: string) => {
      const hit = inferTopic(text);
      if (hit) {
        topicsUsed.add(hit);
        edges.push({
          src_origin: origin,
          dst_origin: topicOriginOf(hit),
          relation: "ABOUT",
        });
      } else {
        topicsUsed.add("general");
        edges.push({
          src_origin: origin,
          dst_origin: topicOriginOf("general"),
          relation: "ABOUT",
        });
      }
    };
    for (const c of m.constraints ?? []) {
      const cOrigin = `constraint:${slug(c)}`;
      nodes.push({
        kind: "constraint",
        label: c,
        properties: { source: "trip_memory" },
        importance: 0.85,
        origin_table: "trip_memory",
        origin_id: cOrigin,
      });
      attachOrFallback(cOrigin, c);
    }
    for (const d of m.decisions_made ?? []) {
      const dOrigin = `decision:${slug(d)}`;
      nodes.push({
        kind: "decision",
        label: d,
        properties: { source: "trip_memory" },
        importance: 0.8,
        origin_table: "trip_memory",
        origin_id: dOrigin,
      });
      attachOrFallback(dOrigin, d);
      // Also edge decision → day if it mentions a day explicitly
      // ("booked Friday 7:30pm", "Sunday roast"), so Travel/Plan slices
      // have temporal anchors without waiting on the LLM.
      for (const dayId of inferDays(d)) {
        daysUsed.add(dayId);
        edges.push({
          src_origin: dOrigin,
          dst_origin: dayOriginOf(dayId),
          relation: "SCHEDULED_ON",
        });
      }
    }
    for (const q of m.open_questions ?? []) {
      const qOrigin = `question:${slug(q)}`;
      nodes.push({
        kind: "question",
        label: q,
        properties: { source: "trip_memory" },
        importance: 0.7,
        origin_table: "trip_memory",
        origin_id: qOrigin,
      });
      attachOrFallback(qOrigin, q);
      for (const dayId of inferDays(q)) {
        daysUsed.add(dayId);
        edges.push({
          src_origin: qOrigin,
          dst_origin: dayOriginOf(dayId),
          relation: "SCHEDULED_ON",
        });
      }
    }
    for (const gp of m.group_preferences ?? []) {
      const pOrigin = `pref:group:${slug(gp)}`;
      nodes.push({
        kind: "preference",
        label: gp,
        properties: { kind: "group" },
        importance: 0.55,
        origin_table: "trip_memory",
        origin_id: pOrigin,
      });
      attachOrFallback(pOrigin, gp);
    }
    for (const t of m.tensions ?? []) {
      const tOrigin = `tension:${slug(t)}`;
      nodes.push({
        kind: "tension",
        label: t,
        properties: { source: "trip_memory" },
        importance: 0.6,
        origin_table: "trip_memory",
        origin_id: tOrigin,
      });
      attachOrFallback(tOrigin, t);
    }
  }

  // 5. Emit topic hub nodes for every topic that was referenced. Connect
  // each topic to the trip so they sit near the root rather than floating.
  // "general" is a catch-all for items that miss every keyword pattern.
  const topicLabelFor = (id: string): string => {
    if (id === "general") return "General";
    return TOPICS.find((t) => t.id === id)?.label ?? id;
  };
  for (const topicId of topicsUsed) {
    const tOrigin = topicOriginOf(topicId);
    nodes.push({
      kind: "topic",
      label: topicLabelFor(topicId),
      properties: { id: topicId },
      importance: 0.75,
      origin_table: "derived",
      origin_id: tOrigin,
    });
    edges.push({
      src_origin: tOrigin,
      dst_origin: tripOrigin,
      relation: "PART_OF",
    });
  }

  // 6. Emit Day nodes and chain them NEXT_DAY. Days provide the itinerary
  // spine — user questions like "what's on Thursday?" traverse in one hop
  // from the Day hub instead of string-scanning every place's notes.
  const dayOrder = DAY_PATTERNS.map((d) => d.id); // Mon…Sun canonical order
  const orderedDays = dayOrder.filter((d) => daysUsed.has(d));
  for (const dayId of orderedDays) {
    const label = DAY_PATTERNS.find((d) => d.id === dayId)?.label ?? dayId;
    const dayIndex = orderedDays.indexOf(dayId);
    nodes.push({
      kind: "day",
      label,
      properties: { id: dayId, day_index: dayIndex },
      importance: 0.7,
      origin_table: "derived",
      origin_id: dayOriginOf(dayId),
    });
    edges.push({
      src_origin: dayOriginOf(dayId),
      dst_origin: tripOrigin,
      relation: "PART_OF",
    });
  }
  // NEXT_DAY chain so the itinerary reads as a line, not a hub-and-spoke.
  for (let i = 0; i < orderedDays.length - 1; i++) {
    edges.push({
      src_origin: dayOriginOf(orderedDays[i]),
      dst_origin: dayOriginOf(orderedDays[i + 1]),
      relation: "NEXT_DAY",
      weight: 0.7,
    });
  }

  // 7. Propagate a day_index onto every node that has a SCHEDULED_ON
  // edge to a day. Multi-day nodes get the EARLIEST day's index so they
  // stack onto the first plane they touch (with cross-day edges visibly
  // spanning the layers). Nodes with no day get day_index = -1, which
  // the frontend parks on an "unscheduled" plane above the stack.
  const dayIndexById = new Map<string, number>();
  for (const dayId of orderedDays) {
    dayIndexById.set(dayOriginOf(dayId), orderedDays.indexOf(dayId));
  }
  const nodeDayIndex = new Map<string, number>();
  for (const e of edges) {
    if (e.relation !== "SCHEDULED_ON") continue;
    const di = dayIndexById.get(e.dst_origin);
    if (di == null) continue;
    const prev = nodeDayIndex.get(e.src_origin);
    if (prev == null || di < prev) nodeDayIndex.set(e.src_origin, di);
  }
  for (const n of nodes) {
    const di =
      n.kind === "day"
        ? (n.properties?.day_index as number | undefined)
        : nodeDayIndex.get(n.origin_id);
    if (typeof di === "number") {
      n.properties = { ...(n.properties ?? {}), day_index: di };
    }
  }

  return { nodes, edges };
}

interface InMemoryNode {
  id: string; // = origin_id, stable across rebuilds
  trip_id: string;
  kind: KGNodeKind;
  label: string;
  properties: Record<string, unknown>;
  importance: number;
  confidence: "provisional" | "confirmed" | "disputed";
  origin_table: string;
  origin_id: string;
  invalidated_at: null;
  created_at: string;
  updated_at: string;
}

interface InMemoryEdge {
  id: string; // synthetic: src|dst|relation
  trip_id: string;
  src_id: string;
  dst_id: string;
  relation: KGRelation;
  weight: number;
  confidence: "provisional";
  properties: Record<string, unknown>;
  source_message_id: null;
  invalidated_at: null;
  created_at: string;
}

/**
 * Compute the graph in memory from source tables. No writes. Deterministic:
 * same source data always produces the same (id, label, edges).
 *
 * This is what the graph API returns — we treat the graph as a derived view,
 * not a stored artifact. Consequence: no migration 005 needed. Cost: we
 * recompute per request, ~5–50ms at trip scale.
 */
export async function computeGraphInMemory(
  supabase: SupabaseClient,
  tripId: string
): Promise<{ nodes: InMemoryNode[]; edges: InMemoryEdge[] }> {
  const [tripRes, participantsRes, placesRes, memoryRes] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    supabase.from("participants").select("*").eq("trip_id", tripId),
    supabase.from("places").select("*").eq("trip_id", tripId),
    supabase
      .from("trip_memory")
      .select("*")
      .eq("trip_id", tripId)
      .maybeSingle(),
  ]);

  if (tripRes.error || !tripRes.data) {
    throw new Error(`Trip ${tripId} not found`);
  }

  const trip = tripRes.data as Trip;
  const participants = (participantsRes.data ?? []) as Participant[];
  const places = (placesRes.data ?? []) as Place[];
  const memory = (memoryRes.data ?? null) as TripMemory | null;

  const { data: profilesData } = await supabase
    .from("participant_profiles")
    .select("*")
    .in(
      "participant_id",
      participants.map((p) => p.id)
    );
  const profiles = (profilesData ?? []) as ParticipantProfile[];

  const { nodes: pendingNodes, edges: pendingEdges } = collectPending({
    trip,
    participants,
    profiles,
    places,
    memory,
  });

  // Dedupe nodes by origin_id, keeping the highest importance.
  const nodesByOrigin = new Map<string, PendingNode>();
  for (const n of pendingNodes) {
    const existing = nodesByOrigin.get(n.origin_id);
    if (!existing) {
      nodesByOrigin.set(n.origin_id, n);
    } else {
      existing.importance = Math.max(
        existing.importance ?? 0.5,
        n.importance ?? 0.5
      );
    }
  }

  const now = new Date().toISOString();
  const nodes: InMemoryNode[] = Array.from(nodesByOrigin.values()).map((n) => ({
    id: n.origin_id,
    trip_id: tripId,
    kind: n.kind,
    label: n.label,
    properties: n.properties ?? {},
    importance: n.importance ?? 0.5,
    confidence: "provisional",
    origin_table: n.origin_table,
    origin_id: n.origin_id,
    invalidated_at: null,
    created_at: tripCreatedAtFor(n, trip, places, memory),
    updated_at: now,
  }));

  const nodeIds = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges: InMemoryEdge[] = [];
  for (const e of pendingEdges) {
    if (!nodeIds.has(e.src_origin) || !nodeIds.has(e.dst_origin)) continue;
    if (e.src_origin === e.dst_origin) continue;
    const key = `${e.src_origin}|${e.dst_origin}|${e.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: key,
      trip_id: tripId,
      src_id: e.src_origin,
      dst_id: e.dst_origin,
      relation: e.relation,
      weight: e.weight ?? 1.0,
      confidence: "provisional",
      properties: e.properties ?? {},
      source_message_id: null,
      invalidated_at: null,
      created_at: now,
    });
  }

  return { nodes, edges };
}

/**
 * Best-guess "when did this node come into existence" for the z-axis day
 * layers. We sample the origin row's created_at where available; otherwise
 * fall back to the trip start so the node sits on day 0.
 */
function tripCreatedAtFor(
  n: PendingNode,
  trip: Trip,
  places: Place[],
  memory: TripMemory | null
): string {
  if (n.origin_table === "trips") return trip.created_at;
  if (n.origin_table === "places") {
    const rawId = n.origin_id.startsWith("place:")
      ? n.origin_id.slice("place:".length)
      : n.origin_id;
    const p = places.find((pp) => pp.id === rawId);
    if (p) return p.created_at;
  }
  if (n.origin_table === "participants") return trip.created_at;
  if (n.origin_table === "trip_memory" && memory) return memory.updated_at;
  return trip.created_at;
}

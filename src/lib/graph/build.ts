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

function collectPending(args: {
  trip: Trip;
  participants: Participant[];
  profiles: ParticipantProfile[];
  places: Place[];
  memory: TripMemory | null;
}): { nodes: PendingNode[]; edges: PendingEdge[] } {
  const nodes: PendingNode[] = [];
  const edges: PendingEdge[] = [];

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
    origin_id: args.trip.id,
  });

  // 2. Person nodes + PART_OF edge
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
      origin_id: p.id,
    });
    edges.push({
      src_origin: personOrigin,
      dst_origin: tripOrigin,
      relation: "PART_OF",
    });

    // Per-person preferences (interests + food_preferences)
    const likeItems = [
      ...(profile?.interests ?? []).map((x) => ({ text: x, kind: "interest" })),
      ...(profile?.food_preferences ?? []).map((x) => ({
        text: x,
        kind: "food",
      })),
    ];
    for (const item of likeItems) {
      const prefOrigin = `pref:${item.kind}:${slug(item.text)}`;
      nodes.push({
        kind: "preference",
        label: item.text,
        properties: { kind: item.kind },
        importance: 0.4,
        origin_table: "derived",
        origin_id: prefOrigin,
      });
      edges.push({
        src_origin: personOrigin,
        dst_origin: prefOrigin,
        relation: "PREFERS",
      });
    }

    // Per-person dislikes → dislike preferences
    for (const d of profile?.dislikes ?? []) {
      const prefOrigin = `pref:dislike:${slug(d)}`;
      nodes.push({
        kind: "preference",
        label: d,
        properties: { kind: "dislike" },
        importance: 0.5,
        origin_table: "derived",
        origin_id: prefOrigin,
      });
      edges.push({
        src_origin: personOrigin,
        dst_origin: prefOrigin,
        relation: "DISLIKES",
      });
    }

    // Per-person dealbreakers → hard constraints
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
      // Heuristic: if the text mentions allergy, use ALLERGIC_TO; else DISLIKES
      const rel: KGRelation = /allerg|intoleran/i.test(db)
        ? "ALLERGIC_TO"
        : "DISLIKES";
      edges.push({
        src_origin: personOrigin,
        dst_origin: cOrigin,
        relation: rel,
      });
    }
  }

  // 3. Place nodes + PROPOSED edges
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
      origin_id: place.id,
    });
    if (place.added_by) {
      edges.push({
        src_origin: `person:${place.added_by}`,
        dst_origin: placeOrigin,
        relation: "PROPOSED",
      });
    }
  }

  // 4. Trip-level constraints / decisions / questions / tensions / group prefs
  if (args.memory) {
    const m = args.memory;
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
      edges.push({
        src_origin: tripOrigin,
        dst_origin: cOrigin,
        relation: "CONSTRAINED_BY",
      });
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
      edges.push({
        src_origin: tripOrigin,
        dst_origin: dOrigin,
        relation: "DECIDED",
      });
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
      edges.push({
        src_origin: tripOrigin,
        dst_origin: qOrigin,
        relation: "ASKING",
      });
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
      edges.push({
        src_origin: tripOrigin,
        dst_origin: pOrigin,
        relation: "SUPPORTS",
      });
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
      edges.push({
        src_origin: tripOrigin,
        dst_origin: tOrigin,
        relation: "TENSION_BETWEEN",
      });
    }
  }

  return { nodes, edges };
}

/** Wipe and rebuild the graph for a single trip. */
export async function rebuildGraph(
  supabase: SupabaseClient,
  tripId: string
): Promise<{ nodeCount: number; edgeCount: number }> {
  const [tripRes, participantsRes, profilesRes, placesRes, memoryRes] =
    await Promise.all([
      supabase.from("trips").select("*").eq("id", tripId).single(),
      supabase.from("participants").select("*").eq("trip_id", tripId),
      supabase
        .from("participant_profiles")
        .select("*")
        .in(
          "participant_id",
          (
            await supabase
              .from("participants")
              .select("id")
              .eq("trip_id", tripId)
          ).data?.map((p) => p.id) ?? []
        ),
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
  const profiles = (profilesRes.data ?? []) as ParticipantProfile[];
  const places = (placesRes.data ?? []) as Place[];
  const memory = (memoryRes.data ?? null) as TripMemory | null;

  const { nodes: pendingNodes, edges: pendingEdges } = collectPending({
    trip,
    participants,
    profiles,
    places,
    memory,
  });

  // Dedupe nodes by origin_id (some origins appear twice — e.g. same
  // dealbreaker from two people)
  const nodesByOrigin = new Map<string, PendingNode>();
  for (const n of pendingNodes) {
    const existing = nodesByOrigin.get(n.origin_id);
    if (!existing) {
      nodesByOrigin.set(n.origin_id, n);
    } else {
      // Merge: keep the higher importance + union properties
      existing.importance = Math.max(
        existing.importance ?? 0.5,
        n.importance ?? 0.5
      );
    }
  }

  // Wipe existing graph for this trip (cascades delete activations too —
  // fine for rough version; user won't rebuild during an active @agent turn)
  await supabase.from("kg_edges").delete().eq("trip_id", tripId);
  await supabase.from("kg_nodes").delete().eq("trip_id", tripId);

  // Insert nodes in a single batch
  const nodeRows = Array.from(nodesByOrigin.values()).map((n) => ({
    trip_id: tripId,
    kind: n.kind,
    label: n.label,
    properties: n.properties ?? {},
    importance: n.importance ?? 0.5,
    origin_table: n.origin_table,
    origin_id: n.origin_id,
  }));
  const { data: insertedNodes, error: insertErr } = await supabase
    .from("kg_nodes")
    .insert(nodeRows)
    .select("id, origin_id");
  if (insertErr) throw new Error(`Node insert failed: ${insertErr.message}`);

  const idByOrigin = new Map(
    (insertedNodes ?? []).map((r) => [r.origin_id as string, r.id as string])
  );

  // Resolve edges against the new node ids; drop any whose endpoints
  // didn't survive (e.g. referenced participant no longer exists)
  const edgeRows = pendingEdges
    .map((e) => {
      const src = idByOrigin.get(e.src_origin);
      const dst = idByOrigin.get(e.dst_origin);
      if (!src || !dst || src === dst) return null;
      return {
        trip_id: tripId,
        src_id: src,
        dst_id: dst,
        relation: e.relation,
        weight: e.weight ?? 1.0,
        properties: e.properties ?? {},
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Dedupe exact (src,dst,relation) triples
  const seen = new Set<string>();
  const uniqueEdges = edgeRows.filter((e) => {
    const key = `${e.src_id}|${e.dst_id}|${e.relation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueEdges.length > 0) {
    const { error: edgeErr } = await supabase
      .from("kg_edges")
      .insert(uniqueEdges);
    if (edgeErr) throw new Error(`Edge insert failed: ${edgeErr.message}`);
  }

  return { nodeCount: nodeRows.length, edgeCount: uniqueEdges.length };
}

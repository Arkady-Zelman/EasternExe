import type { KGEdge, KGNode } from "./types";

/**
 * Karpathy-index-style digest: one compact block the LLM can read to "know"
 * the whole trip graph without needing multi-hop queries. At ~50 nodes the
 * full digest is ~1–2 KB, which is cheaper than our old RAG chunks (~5 KB).
 */
export function serializeGraph(
  nodes: KGNode[],
  edges: KGEdge[],
  opts: { maxPerKind?: number } = {}
): string {
  const maxPerKind = opts.maxPerKind ?? 30;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byKind = new Map<string, KGNode[]>();
  for (const n of nodes) {
    if (n.invalidated_at) continue;
    const arr = byKind.get(n.kind) ?? [];
    arr.push(n);
    byKind.set(n.kind, arr);
  }

  const lines: string[] = [];
  const order: KGNode["kind"][] = [
    "trip",
    "topic",
    "person",
    "constraint",
    "decision",
    "question",
    "tension",
    "preference",
    "place",
  ];

  for (const kind of order) {
    const list = byKind.get(kind) ?? [];
    if (list.length === 0) continue;
    list.sort((a, b) => b.importance - a.importance);
    lines.push(`\n## ${kind.toUpperCase()}S`);
    for (const n of list.slice(0, maxPerKind)) {
      const outgoing = edges.filter(
        (e) => e.src_id === n.id && !e.invalidated_at
      );
      const relTags = outgoing
        .slice(0, 6)
        .map((e) => {
          const dst = byId.get(e.dst_id);
          return dst ? `${e.relation}→${dst.label}` : null;
        })
        .filter(Boolean)
        .join(", ");
      const propHint = summarizeProps(n);
      lines.push(
        `- [${n.id.slice(0, 8)}] ${n.label}${propHint ? ` (${propHint})` : ""}${
          relTags ? ` — ${relTags}` : ""
        }`
      );
    }
  }

  return lines.join("\n").trim();
}

function summarizeProps(n: KGNode): string {
  const p = n.properties ?? {};
  const bits: string[] = [];
  if (n.kind === "person") {
    if (p.budget_style) bits.push(String(p.budget_style));
    if (p.travel_style) bits.push(String(p.travel_style));
  } else if (n.kind === "place") {
    if (p.category) bits.push(String(p.category));
    if (p.time_of_day && p.time_of_day !== "any")
      bits.push(String(p.time_of_day));
  } else if (n.kind === "constraint" && p.owner) {
    bits.push(`from ${p.owner}`);
  }
  return bits.join(", ");
}

/** The short list of node IDs to write as activations when this graph
 *  slice is included in an agent prompt. */
export function activatedNodeIds(nodes: KGNode[]): string[] {
  return nodes.filter((n) => !n.invalidated_at).map((n) => n.id);
}

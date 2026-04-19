"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Brain, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useActivations } from "@/hooks/useActivations";
import { useTripGraph } from "@/hooks/useTripGraph";
import type { KGNode } from "@/lib/graph/types";
import type { Trip } from "@/types/db";

// react-force-graph uses window/canvas — disable SSR.
// The library's generic types don't play well with strict TS; we use `any`
// at the callback boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph3D: any = dynamic(
  () => import("react-force-graph-3d").then((m) => m.default),
  { ssr: false }
);

const KIND_COLOR: Record<string, string> = {
  trip: "#f59e0b",
  person: "#3b82f6",
  place: "#10b981",
  decision: "#8b5cf6",
  question: "#f97316",
  constraint: "#ef4444",
  preference: "#06b6d4",
  tension: "#ec4899",
};

const LAYER_SPACING = 80; // distance between day layers on the z-axis
const GLOW_MS = 1800; // how long a node stays "hot" after activation

interface GraphNode {
  id: string;
  label: string;
  kind: string;
  importance: number;
  dayIndex: number;
  color: string;
  fz: number; // pinned z — makes this node sit in its day's layer
  val: number;
}

interface GraphLink {
  id: string;
  source: string;
  target: string;
  relation: string;
  color: string;
}

function dayIndexOf(createdAt: string, tripStart: Date): number {
  const t = new Date(createdAt).getTime();
  const ms = t - tripStart.getTime();
  const day = Math.floor(ms / (1000 * 60 * 60 * 24));
  return Math.max(day, 0);
}

export function TripBrainGraph({ trip }: { trip: Trip }) {
  const { nodes, edges, loading, rebuild } = useTripGraph(trip.id);
  const { activations } = useActivations(trip.id);
  const [busy, setBusy] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const fgRef = useRef<{
    cameraPosition: (pos: Record<string, number>) => void;
    d3Force?: (name: string) => { strength?: (n: number) => void } | undefined;
  }>();

  // Auto-rebuild once if the graph is empty on first mount.
  const autoRebuiltRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (nodes.length === 0 && !autoRebuiltRef.current) {
      autoRebuiltRef.current = true;
      rebuild();
    }
  }, [loading, nodes.length, rebuild]);

  const tripStart = useMemo(() => {
    if (trip.start_date) return new Date(trip.start_date);
    return new Date(trip.created_at);
  }, [trip.start_date, trip.created_at]);

  // Build a map of node_id -> latest activation time for glow.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const latestActivationByNode = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of activations) {
      if (!a.node_id) continue;
      const t = new Date(a.activated_at).getTime();
      const prev = map.get(a.node_id) ?? 0;
      if (t > prev) map.set(a.node_id, t);
    }
    return map;
  }, [activations]);

  const { graphNodes, graphLinks, dayRange } = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let minDay = Infinity;
    let maxDay = -Infinity;
    const gn: GraphNode[] = nodes.map((n: KGNode) => {
      const di = dayIndexOf(n.created_at, tripStart);
      if (di < minDay) minDay = di;
      if (di > maxDay) maxDay = di;
      return {
        id: n.id,
        label: n.label,
        kind: n.kind,
        importance: n.importance,
        dayIndex: di,
        color: KIND_COLOR[n.kind] ?? "#94a3b8",
        fz: di * LAYER_SPACING,
        val: 2 + n.importance * 6,
      };
    });
    const gl: GraphLink[] = [];
    for (const e of edges) {
      if (!byId.has(e.src_id) || !byId.has(e.dst_id)) continue;
      gl.push({
        id: e.id,
        source: e.src_id,
        target: e.dst_id,
        relation: e.relation as string,
        color: "rgba(148,163,184,0.35)",
      });
    }
    return {
      graphNodes: gn,
      graphLinks: gl,
      dayRange:
        isFinite(minDay) && isFinite(maxDay)
          ? { min: minDay, max: maxDay }
          : { min: 0, max: 0 },
    };
  }, [nodes, edges, tripStart]);

  const handleRebuild = async () => {
    setBusy(true);
    try {
      await rebuild();
    } finally {
      setBusy(false);
    }
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    try {
      await fetch(`/api/trips/${trip.id}/graph/summarize`, { method: "POST" });
      await rebuild();
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-violet-500" />
          <div>
            <div className="text-sm font-semibold">Trip brain</div>
            <div className="text-[10px] text-muted-foreground">
              {nodes.length} nodes · {edges.length} edges ·{" "}
              {dayRange.max - dayRange.min + 1} day layers
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSummarize}
            disabled={summarizing}
            title="Ask the LLM to fold new chat into the brain"
          >
            {summarizing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            <span className="ml-1 text-[11px]">Summarize chat</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRebuild}
            disabled={busy}
            title="Rebuild graph from current trip data"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span className="ml-1 text-[11px]">Rebuild</span>
          </Button>
        </div>
      </div>

      <Legend />

      <div className="relative min-h-0 flex-1 bg-[radial-gradient(ellipse_at_center,_#0b1020_0%,_#000_100%)]">
        {loading || nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {loading ? "Loading graph…" : "Building graph…"}
          </div>
        ) : (
          <ForceGraph3D
            ref={fgRef as never}
            graphData={{ nodes: graphNodes, links: graphLinks }}
            backgroundColor="rgba(0,0,0,0)"
            nodeLabel={(n: GraphNode) =>
              `<div style="background:#0f172a;color:white;padding:4px 8px;border-radius:6px;font-size:11px;">
                 <div style="font-weight:600">${escapeHtml(n.label)}</div>
                 <div style="opacity:0.6;margin-top:2px;text-transform:capitalize">${n.kind} · day ${n.dayIndex}</div>
               </div>`
            }
            linkLabel={(l: GraphLink) => l.relation}
            nodeThreeObject={(n: GraphNode) => {
              const lastHit = latestActivationByNode.get(n.id);
              const since = lastHit ? now - lastHit : Infinity;
              const isHot = since < GLOW_MS;
              const pulse = isHot
                ? 1 + 0.35 * Math.sin((since / 120) % (Math.PI * 2))
                : 1;
              const radius = n.val * pulse;
              const group = new THREE.Group();
              const mat = new THREE.MeshBasicMaterial({
                color: new THREE.Color(n.color),
                transparent: true,
                opacity: isHot ? 1 : 0.9,
              });
              const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 16, 16),
                mat
              );
              group.add(sphere);
              if (isHot) {
                const haloMat = new THREE.MeshBasicMaterial({
                  color: new THREE.Color(n.color),
                  transparent: true,
                  opacity: 0.25 * (1 - since / GLOW_MS),
                });
                const halo = new THREE.Mesh(
                  new THREE.SphereGeometry(radius * 2.2, 16, 16),
                  haloMat
                );
                group.add(halo);
              }
              return group;
            }}
            linkWidth={0.6}
            linkOpacity={0.5}
            linkDirectionalParticles={(l: GraphLink) => {
              const src = l.source as unknown as GraphNode | string;
              const srcId = typeof src === "string" ? src : src.id;
              return latestActivationByNode.has(srcId) ? 2 : 0;
            }}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.006}
            linkColor={(l: GraphLink) => {
              const src = l.source as unknown as GraphNode | string;
              const srcId = typeof src === "string" ? src : src.id;
              const hot = latestActivationByNode.has(srcId);
              return hot ? "rgba(251,191,36,0.85)" : "rgba(148,163,184,0.35)";
            }}
            cooldownTicks={150}
            warmupTicks={40}
            showNavInfo={false}
          />
        )}
      </div>
    </div>
  );
}

function Legend() {
  const kinds: { kind: string; label: string }[] = [
    { kind: "trip", label: "Trip" },
    { kind: "person", label: "People" },
    { kind: "place", label: "Places" },
    { kind: "decision", label: "Decisions" },
    { kind: "question", label: "Questions" },
    { kind: "constraint", label: "Constraints" },
    { kind: "preference", label: "Preferences" },
    { kind: "tension", label: "Tensions" },
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 border-b bg-background/80 px-3 py-1.5 text-[10px]">
      {kinds.map((k) => (
        <span key={k.kind} className="inline-flex items-center gap-1">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: KIND_COLOR[k.kind] }}
          />
          {k.label}
        </span>
      ))}
      <span className="ml-auto text-[10px] text-muted-foreground">
        Z-axis = day · yellow = agent touched it
      </span>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

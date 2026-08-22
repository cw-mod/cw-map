import { isOffmapEdge } from './edgeKinds';
import { isSelfLoop } from './mapModel';
import type { CwMap, ShortestPath } from './types';

/** Shortest path by hop count. Self-loops and off-map exits are ignored. */
export function shortestPath(
  map: CwMap,
  fromId: string,
  toId: string,
): ShortestPath | null {
  if (!map.locations.some((l) => l.id === fromId)) return null;
  if (!map.locations.some((l) => l.id === toId)) return null;
  if (fromId === toId) {
    return { locationIds: [fromId], edgeIds: [], hops: [] };
  }

  const adj = new Map<string, { to: string; edgeId: string }[]>();
  for (const loc of map.locations) adj.set(loc.id, []);
  for (const edge of map.edges) {
    if (isSelfLoop(edge) || isOffmapEdge(edge) || !edge.toLocationId) continue;
    adj.get(edge.fromLocationId)?.push({
      to: edge.toLocationId,
      edgeId: edge.id,
    });
  }

  const prev = new Map<string, { from: string; edgeId: string }>();
  const seen = new Set<string>([fromId]);
  const queue: string[] = [fromId];

  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) break;
    if (cur === toId) break;
    for (const next of adj.get(cur) ?? []) {
      if (seen.has(next.to)) continue;
      seen.add(next.to);
      prev.set(next.to, { from: cur, edgeId: next.edgeId });
      queue.push(next.to);
    }
  }

  if (!prev.has(toId)) return null;

  const locationIds: string[] = [toId];
  const edgeIds: string[] = [];
  const hops: ShortestPath['hops'] = [];
  let cursor = toId;
  while (cursor !== fromId) {
    const step = prev.get(cursor);
    if (!step) return null;
    edgeIds.unshift(step.edgeId);
    hops.unshift({ fromId: step.from, toId: cursor, edgeId: step.edgeId });
    locationIds.unshift(step.from);
    cursor = step.from;
  }

  return { locationIds, edgeIds, hops };
}

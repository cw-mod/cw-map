import type { Edge, EdgeKind, OffmapKind } from './types';
import { OFFMAP_KINDS } from './types';

export interface EdgeKindUi {
  label: string;
  color: string;
}

/** Distinct from tribe chips and from location/self cell fills. */
export const EDGE_KIND_UI: Record<EdgeKind, EdgeKindUi> = {
  location: { label: 'Другая локация', color: '#d4d4d4' },
  self: { label: 'В себя', color: '#60a5fa' },
  camp: { label: 'Лагерь', color: '#ea580c' },
  climb: { label: 'Лазалки', color: '#c4a574' },
  swim: { label: 'Плавательные', color: '#2dd4bf' },
  tunnel: { label: 'Туннели', color: '#a8a29e' },
  forbidden: { label: 'Проход запрещён', color: '#ef4444' },
};

export function isOffmapKind(value: string): value is OffmapKind {
  return (OFFMAP_KINDS as readonly string[]).includes(value);
}

export function isOffmapEdge(edge: Edge): boolean {
  return isOffmapKind(edge.kind);
}

export function edgeKindOf(edge: Edge): EdgeKind {
  if (edge.kind) return edge.kind;
  if (edge.toLocationId && edge.fromLocationId === edge.toLocationId) {
    return 'self';
  }
  return 'location';
}

export function cellFill(kind: string): string {
  if (kind === 'link' || kind === 'location') return EDGE_KIND_UI.location.color;
  if (kind === 'loop' || kind === 'self') return EDGE_KIND_UI.self.color;
  if (isOffmapKind(kind)) {
    return EDGE_KIND_UI[kind].color;
  }
  return '#727272';
}

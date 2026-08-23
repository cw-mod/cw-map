export const MAP_VERSION = 9;

export const GRID_COLS = 10;
export const GRID_ROWS = 6;

export type TribeId = 'grosa' | 'veter' | 'teni' | 'reka';

export type LocationResourceId = 'moss' | 'herbs' | 'sticks' | 'water_moss';

export type LocationActionId = 'drink' | 'hunt';

export type EdgeKind =
  | 'location'
  | 'self'
  | 'camp'
  | 'climb'
  | 'swim'
  | 'tunnel'
  | 'forbidden'
  | 'deadend';

export const OFFMAP_KINDS = [
  'camp',
  'climb',
  'swim',
  'tunnel',
  'forbidden',
  'deadend',
] as const;
export type OffmapKind = (typeof OFFMAP_KINDS)[number];

export interface Cell {
  x: number;
  y: number;
}

export interface Location {
  id: string;
  name: string;
  x: number;
  y: number;
  tribes: TribeId[];
  resources: LocationResourceId[];
  actions: LocationActionId[];
  backgroundUrl?: string;
}

export interface Edge {
  id: string;
  kind: EdgeKind;
  fromLocationId: string;
  fromCell: Cell;
  toLocationId?: string;
  toCell?: Cell;
  /** Optional name of the other map / camp for off-map exits. */
  label?: string;
  /** Draw `label` on the map next to the exit cell. Missing = hidden. */
  showLabel?: boolean;
  /** World-space corridor point for the orthogonal polyline. */
  elbow?: { x: number; y: number };
}

export interface CwMap {
  version: number;
  name: string;
  comment?: string;
  locations: Location[];
  edges: Edge[];
}

export interface PathHop {
  fromId: string;
  toId: string;
  edgeId: string;
}

export interface ShortestPath {
  locationIds: string[];
  edgeIds: string[];
  hops: PathHop[];
}

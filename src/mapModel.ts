import { GRID_COLS, GRID_ROWS, MAP_VERSION } from './types';
import type { Cell, CwMap, Edge, EdgeKind, Location, OffmapKind, TribeId } from './types';
import { isOffmapEdge, isOffmapKind } from './edgeKinds';
import { parseActionId, parseResourceId } from './locationMarks';
import { parseTribeId } from './tribes';

export function newLocationId(): string {
  return `loc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newEdgeId(): string {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function cloneMap(map: CwMap): CwMap {
  return structuredClone(map);
}

export function emptyMap(name = 'Новая карта'): CwMap {
  return {
    version: MAP_VERSION,
    name,
    comment: '',
    locations: [],
    edges: [],
  };
}

export function isValidCell(cell: Cell): boolean {
  return (
    Number.isInteger(cell.x) &&
    Number.isInteger(cell.y) &&
    cell.x >= 0 &&
    cell.x < GRID_COLS &&
    cell.y >= 0 &&
    cell.y < GRID_ROWS
  );
}

export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

export function isSelfLoop(edge: Edge): boolean {
  if (isOffmapEdge(edge) || !edge.toLocationId) return false;
  return edge.fromLocationId === edge.toLocationId;
}

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

export function pickFreeCell(map: CwMap, locationId: string): Cell {
  const used = new Set(
    map.edges
      .filter((e) => e.fromLocationId === locationId)
      .map((e) => cellKey(e.fromCell)),
  );
  const preferred: Cell[] = [
    { x: 4, y: 2 },
    { x: 5, y: 2 },
    { x: 4, y: 3 },
    { x: 5, y: 3 },
    { x: 0, y: 0 },
  ];
  for (const cell of preferred) {
    if (!used.has(cellKey(cell))) return cell;
  }
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if (!used.has(`${x},${y}`)) return { x, y };
    }
  }
  return { x: 4, y: 2 };
}

export function findReverse(map: CwMap, edge: Edge): Edge | undefined {
  if (isOffmapEdge(edge) || isSelfLoop(edge) || !edge.toLocationId || !edge.toCell) {
    return undefined;
  }
  const toId = edge.toLocationId;
  const toCell = edge.toCell;
  return map.edges.find(
    (candidate) =>
      !isOffmapEdge(candidate) &&
      candidate.fromLocationId === toId &&
      candidate.toLocationId === edge.fromLocationId &&
      candidate.toCell !== undefined &&
      cellsEqual(candidate.fromCell, toCell) &&
      cellsEqual(candidate.toCell as Cell, edge.fromCell),
  );
}

export function outgoingFrom(
  map: CwMap,
  locationId: string,
): Edge[] {
  return map.edges.filter((e) => e.fromLocationId === locationId);
}

export function edgeAtCell(
  map: CwMap,
  locationId: string,
  cell: Cell,
): Edge | undefined {
  return map.edges.find(
    (e) => e.fromLocationId === locationId && cellsEqual(e.fromCell, cell),
  );
}

export type CellKind = 'empty' | 'link' | 'loop' | OffmapKind;

export function cellKind(
  map: CwMap,
  locationId: string,
  cell: Cell,
): CellKind {
  for (const edge of map.edges) {
    if (edge.fromLocationId !== locationId || !cellsEqual(edge.fromCell, cell)) {
      continue;
    }
    if (isOffmapKind(edge.kind)) {
      return edge.kind;
    }
    if (isSelfLoop(edge)) return 'loop';
    return 'link';
  }
  return 'empty';
}

export function locationLabel(loc: Location, all: Location[]): string {
  const duplicates = all.filter((other) => other.name === loc.name).length > 1;
  return duplicates ? `${loc.name} (${loc.id})` : loc.name;
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export class MapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapParseError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseCell(value: unknown, path: string): Cell {
  const rec = asRecord(value);
  if (!rec) throw new MapParseError(`${path}: ожидается {x, y}`);
  const x = rec.x;
  const y = rec.y;
  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new MapParseError(`${path}: x и y должны быть числами`);
  }
  const cell = { x, y };
  if (!isValidCell(cell)) {
    throw new MapParseError(
      `${path}: клетка вне сетки 10×6 (x: 0–9, y: 0–5)`,
    );
  }
  return cell;
}

function parseLocation(value: unknown, index: number): Location {
  const rec = asRecord(value);
  if (!rec) throw new MapParseError(`locations[${index}]: не объект`);
  if (typeof rec.id !== 'string' || !rec.id) {
    throw new MapParseError(`locations[${index}].id: нужна непустая строка`);
  }
  if (typeof rec.name !== 'string') {
    throw new MapParseError(`locations[${index}].name: нужна строка`);
  }
  if (typeof rec.x !== 'number' || typeof rec.y !== 'number') {
    throw new MapParseError(`locations[${index}]: x/y должны быть числами`);
  }
  const tribes: TribeId[] = [];
  if (rec.tribes !== undefined) {
    if (!Array.isArray(rec.tribes)) {
      throw new MapParseError(`locations[${index}].tribes: нужен массив`);
    }
    for (const item of rec.tribes) {
      const tribe = parseTribeId(item);
      if (tribe && !tribes.includes(tribe)) tribes.push(tribe);
    }
  }
  const backgroundUrl = parseBackgroundUrl(rec.backgroundUrl);
  return {
    id: rec.id,
    name: rec.name,
    x: rec.x,
    y: rec.y,
    tribes,
    resources: parseMarkList(
      rec.resources,
      parseResourceId,
      `locations[${index}].resources`,
    ),
    actions: parseMarkList(
      rec.actions,
      parseActionId,
      `locations[${index}].actions`,
    ),
    ...(backgroundUrl ? { backgroundUrl } : {}),
  };
}

function parseBackgroundUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseMarkList<Id extends string>(
  value: unknown,
  parseOne: (item: unknown) => Id | null,
  path: string,
): Id[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new MapParseError(`${path}: нужен массив`);
  }
  const out: Id[] = [];
  for (const item of value) {
    const id = parseOne(item);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function parseEdgeKind(
  raw: unknown,
  fromId: string,
  toId: string | undefined,
): EdgeKind {
  if (
    raw === 'location' ||
    raw === 'self' ||
    (typeof raw === 'string' && isOffmapKind(raw))
  ) {
    return raw;
  }
  if (toId && fromId === toId) return 'self';
  return 'location';
}

function parseEdge(value: unknown, index: number): Edge {
  const rec = asRecord(value);
  if (!rec) throw new MapParseError(`edges[${index}]: не объект`);
  if (typeof rec.id !== 'string' || !rec.id) {
    throw new MapParseError(`edges[${index}].id: нужна непустая строка`);
  }
  if (typeof rec.fromLocationId !== 'string' || !rec.fromLocationId) {
    throw new MapParseError(`edges[${index}].fromLocationId: нужна строка`);
  }
  const fromCell = parseCell(rec.fromCell, `edges[${index}].fromCell`);
  const toId =
    typeof rec.toLocationId === 'string' && rec.toLocationId
      ? rec.toLocationId
      : undefined;
  const kind = parseEdgeKind(rec.kind, rec.fromLocationId, toId);
  const label = typeof rec.label === 'string' ? rec.label.trim() : '';
  const elbow = parseElbow(rec.elbow);

  if (isOffmapKind(kind)) {
    return {
      id: rec.id,
      kind,
      fromLocationId: rec.fromLocationId,
      fromCell,
      ...(label ? { label } : {}),
      ...(elbow ? { elbow } : {}),
    };
  }

  if (!toId) {
    throw new MapParseError(`edges[${index}].toLocationId: нужна строка`);
  }
  return {
    id: rec.id,
    kind,
    fromLocationId: rec.fromLocationId,
    fromCell,
    toLocationId: toId,
    toCell: parseCell(rec.toCell, `edges[${index}].toCell`),
    ...(label ? { label } : {}),
    ...(elbow ? { elbow } : {}),
  };
}

function parseElbow(value: unknown): { x: number; y: number } | undefined {
  const rec = asRecord(value);
  if (!rec) return undefined;
  if (typeof rec.x !== 'number' || typeof rec.y !== 'number') return undefined;
  if (!Number.isFinite(rec.x) || !Number.isFinite(rec.y)) return undefined;
  return { x: rec.x, y: rec.y };
}

interface MakeTransition {
  id?: string;
  row: number;
  col: number;
  targetLocationId: string;
  bidirectional?: boolean;
}

interface MakeLocation {
  id: string;
  name: string;
  x: number;
  y: number;
  tribes?: unknown[];
  transitions?: MakeTransition[];
}

function isMakeMap(rec: Record<string, unknown>): boolean {
  if (!Array.isArray(rec.locations) || rec.locations.length === 0) return false;
  const first = asRecord(rec.locations[0]);
  return Boolean(first && Array.isArray(first.transitions));
}

function migrateMakeMap(rec: Record<string, unknown>): CwMap {
  const meta = asRecord(rec.meta);
  const name =
    (typeof meta?.name === 'string' && meta.name) ||
    (typeof rec.name === 'string' && rec.name) ||
    'Импорт';
  const comment =
    (typeof meta?.comment === 'string' && meta.comment) ||
    (typeof rec.comment === 'string' ? rec.comment : '');

  const rawLocations = rec.locations as MakeLocation[];
  const locations: Location[] = rawLocations.map((loc, index) => {
    if (!loc || typeof loc.id !== 'string') {
      throw new MapParseError(`Make locations[${index}].id обязателен`);
    }
    const tribes: TribeId[] = [];
    for (const item of loc.tribes ?? []) {
      const tribe = parseTribeId(item);
      if (tribe && !tribes.includes(tribe)) tribes.push(tribe);
    }
    return {
      id: loc.id.startsWith('loc_') ? loc.id : `loc_${loc.id}`,
      name: typeof loc.name === 'string' ? loc.name : 'Локация',
      x: typeof loc.x === 'number' ? loc.x : 80,
      y: typeof loc.y === 'number' ? loc.y : 80,
      tribes,
      resources: [],
      actions: [],
    };
  });

  const idMap = new Map<string, string>();
  rawLocations.forEach((loc, i) => {
    idMap.set(loc.id, locations[i].id);
  });

  const edges: Edge[] = [];
  const seen = new Set<string>();

  const addEdge = (edge: Edge) => {
    const key = [
      edge.kind,
      edge.fromLocationId,
      cellKey(edge.fromCell),
      edge.toLocationId ?? '',
      edge.toCell ? cellKey(edge.toCell) : '',
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(edge);
  };

  const draft: CwMap = {
    version: MAP_VERSION,
    name,
    comment,
    locations,
    edges,
  };

  for (const loc of rawLocations) {
    const fromId = idMap.get(loc.id);
    if (!fromId) continue;
    for (const t of loc.transitions ?? []) {
      if (typeof t.row !== 'number' || typeof t.col !== 'number') continue;
      const fromCell: Cell = { x: t.col, y: t.row };
      if (!isValidCell(fromCell)) continue;
      const isSelf = t.targetLocationId === 'self' || t.targetLocationId === loc.id;
      const toId = isSelf
        ? fromId
        : idMap.get(t.targetLocationId) ?? t.targetLocationId;
      if (!locations.some((l) => l.id === toId)) continue;

      let toCell: Cell = fromCell;
      if (!isSelf) {
        const targetRaw = rawLocations.find((l) => idMap.get(l.id) === toId);
        const back = targetRaw?.transitions?.find(
          (r) => r.targetLocationId === loc.id || r.targetLocationId === fromId,
        );
        toCell = back
          ? { x: back.col, y: back.row }
          : pickFreeCell({ ...draft, edges }, toId);
      }

      addEdge({
        id: typeof t.id === 'string' && t.id ? `e_${t.id}` : newEdgeId(),
        kind: isSelf ? 'self' : 'location',
        fromLocationId: fromId,
        fromCell,
        toLocationId: toId,
        toCell,
      });

      if (t.bidirectional && !isSelf) {
        addEdge({
          id: newEdgeId(),
          kind: 'location',
          fromLocationId: toId,
          fromCell: toCell,
          toLocationId: fromId,
          toCell: fromCell,
        });
      }
    }
  }

  return draft;
}

export function parseMapJson(value: unknown): CwMap {
  const rec = asRecord(value);
  if (!rec) throw new MapParseError('Корень JSON должен быть объектом');

  if (isMakeMap(rec)) {
    return migrateMakeMap(rec);
  }

  const name = typeof rec.name === 'string' ? rec.name : '';
  const comment = typeof rec.comment === 'string' ? rec.comment : '';
  if (!Array.isArray(rec.locations)) {
    throw new MapParseError('locations: нужен массив');
  }
  if (!Array.isArray(rec.edges)) {
    throw new MapParseError('edges: нужен массив');
  }

  const locations = rec.locations.map(parseLocation);
  const ids = new Set(locations.map((l) => l.id));
  if (ids.size !== locations.length) {
    throw new MapParseError('id локаций должны быть уникальны');
  }

  const edges = rec.edges.map(parseEdge);
  const edgeIds = new Set(edges.map((e) => e.id));
  if (edgeIds.size !== edges.length) {
    throw new MapParseError('id рёбер должны быть уникальны');
  }
  for (const edge of edges) {
    if (!ids.has(edge.fromLocationId)) {
      throw new MapParseError(
        `ребро ${edge.id} ссылается на неизвестную локацию`,
      );
    }
    if (isOffmapEdge(edge)) continue;
    if (!edge.toLocationId || !ids.has(edge.toLocationId)) {
      throw new MapParseError(
        `ребро ${edge.id} ссылается на неизвестную локацию`,
      );
    }
  }

  return {
    version: MAP_VERSION,
    name: name || 'Без названия',
    comment,
    locations,
    edges,
  };
}

export function parseMapText(text: string): CwMap {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new MapParseError('Файл не является корректным JSON');
  }
  return parseMapJson(json);
}

export function addLocation(map: CwMap): { map: CwMap; id: string } {
  const id = newLocationId();
  const loc: Location = {
    id,
    name: nextLocationName(map),
    tribes: [],
    resources: [],
    actions: [],
    x: 80 + Math.random() * 240,
    y: 60 + Math.random() * 200,
  };
  return { map: { ...map, locations: [...map.locations, loc] }, id };
}

export function nextLocationName(map: CwMap, base = 'Новая локация'): string {
  const taken = new Set(map.locations.map((l) => l.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

/** Place a new card to the right and slightly below `origin`. */
export function addLocationNear(
  map: CwMap,
  origin: { x: number; y: number },
  name?: string,
): { map: CwMap; id: string } {
  const id = newLocationId();
  let x = origin.x + 160;
  let y = origin.y + 48;
  for (let i = 0; i < 16; i++) {
    const clash = map.locations.some(
      (l) => Math.abs(l.x - x) < 36 && Math.abs(l.y - y) < 36,
    );
    if (!clash) break;
    x += 28;
    y += 20;
  }
  const loc: Location = {
    id,
    name: (name ?? '').trim() || nextLocationName(map),
    tribes: [],
    resources: [],
    actions: [],
    x,
    y,
  };
  return { map: { ...map, locations: [...map.locations, loc] }, id };
}

export function deleteLocation(map: CwMap, id: string): CwMap {
  return {
    ...map,
    locations: map.locations.filter((l) => l.id !== id),
    edges: map.edges.filter(
      (e) => e.fromLocationId !== id && e.toLocationId !== id,
    ),
  };
}

export function moveLocation(
  map: CwMap,
  id: string,
  x: number,
  y: number,
): CwMap {
  return {
    ...map,
    locations: map.locations.map((l) => (l.id === id ? { ...l, x, y } : l)),
  };
}

export function patchLocation(
  map: CwMap,
  id: string,
  patch: Partial<
    Pick<Location, 'name' | 'tribes' | 'resources' | 'actions' | 'backgroundUrl'>
  >,
): CwMap {
  return {
    ...map,
    locations: map.locations.map((l) => {
      if (l.id !== id) return l;
      const next: Location = { ...l, ...patch };
      if (patch.backgroundUrl !== undefined) {
        const trimmed = patch.backgroundUrl.trim();
        if (trimmed) next.backgroundUrl = trimmed;
        else delete next.backgroundUrl;
      }
      return next;
    }),
  };
}

export function upsertOutgoingEdge(
  map: CwMap,
  edge: Edge,
  bidirectional: boolean,
): CwMap {
  const previous = map.edges.find(
    (e) =>
      e.id === edge.id ||
      (e.fromLocationId === edge.fromLocationId &&
        cellsEqual(e.fromCell, edge.fromCell)),
  );
  const dropIds = new Set<string>();
  if (previous) {
    dropIds.add(previous.id);
    const paired = findReverse(map, previous);
    if (paired) dropIds.add(paired.id);
  }

  const edges = [
    ...map.edges.filter(
      (e) =>
        !dropIds.has(e.id) &&
        !(
          e.fromLocationId === edge.fromLocationId &&
          cellsEqual(e.fromCell, edge.fromCell)
        ),
    ),
    {
      ...edge,
      elbow:
        edge.elbow ??
        (previous && previous.toLocationId === edge.toLocationId
          ? previous.elbow
          : undefined),
    },
  ];
  const draft: CwMap = { ...map, edges };

  if (
    bidirectional &&
    !isOffmapEdge(edge) &&
    !isSelfLoop(edge) &&
    edge.toLocationId
  ) {
    const reverse: Edge = {
      id: newEdgeId(),
      kind: 'location',
      fromLocationId: edge.toLocationId,
      fromCell: pickFreeCell(draft, edge.toLocationId),
      toLocationId: edge.fromLocationId,
      toCell: edge.fromCell,
    };
    const withoutReverse = draft.edges.filter(
      (e) =>
        !(
          e.fromLocationId === reverse.fromLocationId &&
          cellsEqual(e.fromCell, reverse.fromCell)
        ),
    );
    return { ...draft, edges: [...withoutReverse, reverse] };
  }

  return draft;
}

export function removeEdge(map: CwMap, edgeId: string): CwMap {
  const previous = map.edges.find((e) => e.id === edgeId);
  let edges = map.edges.filter((e) => e.id !== edgeId);
  if (previous) {
    const paired = findReverse(map, previous);
    if (paired) edges = edges.filter((e) => e.id !== paired.id);
  }
  return { ...map, edges };
}

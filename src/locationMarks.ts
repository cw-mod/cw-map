import type { LocationActionId, LocationResourceId } from './types';

export interface MarkDef<Id extends string> {
  id: Id;
  label: string;
  short: string;
}

export const RESOURCES: MarkDef<LocationResourceId>[] = [
  { id: 'moss', label: 'Мох', short: 'мох' },
  { id: 'herbs', label: 'Травы', short: 'травы' },
  { id: 'sticks', label: 'Ветки', short: 'ветки' },
  { id: 'water_moss', label: 'Водяной мох', short: 'в.мох' },
];

export const ACTIONS: MarkDef<LocationActionId>[] = [
  { id: 'drink', label: 'Пить', short: 'пить' },
  { id: 'hunt', label: 'Охота', short: 'охота' },
];

const RESOURCE_KEYS = new Set<string>(RESOURCES.map((r) => r.id));
const ACTION_KEYS = new Set<string>(ACTIONS.map((a) => a.id));

export function parseResourceId(value: unknown): LocationResourceId | null {
  if (typeof value !== 'string' || !RESOURCE_KEYS.has(value)) return null;
  return value as LocationResourceId;
}

export function parseActionId(value: unknown): LocationActionId | null {
  if (typeof value !== 'string' || !ACTION_KEYS.has(value)) return null;
  return value as LocationActionId;
}

export function locationHintLabels(loc: {
  resources?: LocationResourceId[];
  actions?: LocationActionId[];
}): string[] {
  return [
    ...(loc.resources ?? []).map(
      (id) => RESOURCES.find((r) => r.id === id)?.short ?? id,
    ),
    ...(loc.actions ?? []).map(
      (id) => ACTIONS.find((a) => a.id === id)?.short ?? id,
    ),
  ];
}

import type { TribeId } from './types';

export interface TribeDef {
  id: TribeId;
  label: string;
  color: string;
}

/** Chip colors from the Figma Make prototype. */
export const TRIBES: TribeDef[] = [
  { id: 'grosa', label: 'Гроза', color: '#f59e0b' },
  { id: 'veter', label: 'Ветер', color: '#06b6d4' },
  { id: 'teni', label: 'Тени', color: '#7c3aed' },
  { id: 'reka', label: 'Река', color: '#3b82f6' },
];

export const TRIBE_IDS: TribeId[] = TRIBES.map((t) => t.id);

const MAKE_TRIBE_NAMES: Record<string, TribeId> = {
  Гроза: 'grosa',
  Ветер: 'veter',
  Тени: 'teni',
  Река: 'reka',
  grosa: 'grosa',
  veter: 'veter',
  teni: 'teni',
  reka: 'reka',
};

export function tribeById(id: TribeId): TribeDef {
  return TRIBES.find((t) => t.id === id) ?? TRIBES[0];
}

export function tribeColors(tribes: TribeId[]): string[] {
  return tribes.map((id) => tribeById(id).color);
}

export function parseTribeId(value: unknown): TribeId | null {
  if (typeof value !== 'string') return null;
  return MAKE_TRIBE_NAMES[value] ?? null;
}

export function tribeBorderBackground(colors: string[]): string {
  if (colors.length === 0) return 'transparent';
  if (colors.length === 1) return colors[0];
  if (colors.length === 2) {
    return `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)`;
  }
  const slice = 100 / colors.length;
  const stops = colors
    .map((c, i) => `${c} ${i * slice}% ${(i + 1) * slice}%`)
    .join(', ');
  return `conic-gradient(from 135deg, ${stops})`;
}

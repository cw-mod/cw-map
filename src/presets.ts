import egidaRaw from './data/egida.json';
import { cloneMap, parseMapJson } from './mapModel';
import type { CwMap } from './types';

export const EGIDA_MAP: CwMap = parseMapJson(egidaRaw);

export const PRESETS = [
  { id: 'egida', name: 'Эгида', map: EGIDA_MAP },
] as const;

export type PresetId = (typeof PRESETS)[number]['id'];

export const DEFAULT_PRESET_ID: PresetId = 'egida';

export function getPreset(id: string = DEFAULT_PRESET_ID) {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

export function isPresetId(value: string): value is PresetId {
  return PRESETS.some((p) => p.id === value);
}

export function clonePreset(id: PresetId = DEFAULT_PRESET_ID): CwMap {
  const preset = getPreset(id);
  const copy = cloneMap(preset.map);
  copy.name = `${preset.map.name} (копия)`;
  return copy;
}

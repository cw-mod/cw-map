import { cloneMap, parseMapJson } from './mapModel';
import type { CwMap } from './types';

const DRAFT_KEY = 'cw-map-draft';

export function saveDraft(map: CwMap): void {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(map));
}

export function loadDraft(): CwMap | null {
  const raw = sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return parseMapJson(JSON.parse(raw));
  } catch {
    sessionStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

export function cloneIntoDraft(map: CwMap): CwMap {
  const copy = cloneMap(map);
  saveDraft(copy);
  return copy;
}

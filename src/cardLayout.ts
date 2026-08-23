import { cellBox, GRID_GAP, GRID_SIZE } from './edgeLabels';
import { locationHintLabels } from './locationMarks';
import type { Cell, Location } from './types';
import { GRID_COLS, GRID_ROWS } from './types';
import type { Pt, Rect } from './ortho';

/** Mini-grid and card chrome — keep in sync with MapCanvas / PNG export. */
export const CARD_GRID = GRID_SIZE;
export const NAME_PX = 10;
export const HINT_PX = 8;
export const TITLE_MB = 4;
export const HINT_MT = 2;
export const TRIBE_BORDER_PAD = 2;

export function locationHasHints(loc: Location): boolean {
  return locationHintLabels(loc).length > 0;
}

export function locationTitleHeight(hasHints: boolean): number {
  return NAME_PX + TITLE_MB + (hasHints ? HINT_MT + HINT_PX : 0);
}

export function locationTribePad(loc: Location): number {
  return loc.tribes.length > 0 ? TRIBE_BORDER_PAD : 0;
}

/** Framed grid (colored tribe border), world coordinates. */
export function locationFrameBox(loc: Location): Rect {
  const pad = locationTribePad(loc);
  const titleH = locationTitleHeight(locationHasHints(loc));
  return {
    left: loc.x,
    top: loc.y + titleH,
    right: loc.x + CARD_GRID + pad * 2,
    bottom: loc.y + titleH + CARD_GRID + pad * 2,
  };
}

export function locationGridOrigin(loc: Location): Pt {
  const pad = locationTribePad(loc);
  const titleH = locationTitleHeight(locationHasHints(loc));
  return { x: loc.x + pad, y: loc.y + titleH + pad };
}

export function cellWorldCenter(loc: Location, cell: Cell): Pt {
  const origin = locationGridOrigin(loc);
  const box = cellBox(cell);
  return { x: origin.x + box.cx, y: origin.y + box.cy };
}

/** Gap lines for a 10×6 grid painted without 60 empty cell nodes. */
export function gridGapBackground(gapColor: string): {
  backgroundImage: string;
  backgroundPosition: string;
  backgroundSize: string;
  backgroundRepeat: string;
} {
  const cellW = (GRID_SIZE - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const cellH = (GRID_SIZE - GRID_GAP * (GRID_ROWS - 1)) / GRID_ROWS;
  const images: string[] = [];
  const positions: string[] = [];
  const sizes: string[] = [];
  for (let i = 1; i < GRID_COLS; i++) {
    const x = i * cellW + (i - 1) * GRID_GAP;
    images.push(`linear-gradient(${gapColor}, ${gapColor})`);
    positions.push(`${x}px 0`);
    sizes.push(`${GRID_GAP}px 100%`);
  }
  for (let i = 1; i < GRID_ROWS; i++) {
    const y = i * cellH + (i - 1) * GRID_GAP;
    images.push(`linear-gradient(${gapColor}, ${gapColor})`);
    positions.push(`0 ${y}px`);
    sizes.push(`100% ${GRID_GAP}px`);
  }
  return {
    backgroundImage: images.join(','),
    backgroundPosition: positions.join(','),
    backgroundSize: sizes.join(','),
    backgroundRepeat: 'no-repeat',
  };
}

export const EMPTY_GRID_GAPS = gridGapBackground('#4a4a4a');
export const DIMMED_GRID_GAPS = gridGapBackground('rgba(0,0,0,0.35)');

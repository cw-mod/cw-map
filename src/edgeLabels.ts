import { isOtherGroupEdge } from './edgeKinds';
import type { Cell, CwMap, Edge } from './types';
import { GRID_COLS, GRID_ROWS } from './types';

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

export const GRID_SIZE = 120;
export const GRID_GAP = 0.75;
export const CHIP_H = 14;
export const CHIP_PAD_X = 5;
export const CHIP_FONT_PX = 8;
export const CHIP_MAX_W = 88;
export const CHIP_OUTSET = 6;

export interface CaptionPreview {
  locationId: string;
  cell: Cell;
  text: string;
}

export interface CaptionItem {
  id: string;
  text: string;
  cell: Cell;
}

export interface CaptionLayout {
  id: string;
  text: string;
  cell: Cell;
  chipX: number;
  chipY: number;
  chipW: number;
  chipH: number;
  anchorX: number;
  anchorY: number;
  tipX: number;
  tipY: number;
}

export function visibleEdgeCaption(edge: Edge): string | null {
  if (!edge.showLabel || !isOtherGroupEdge(edge)) return null;
  const text = edge.label?.trim() ?? '';
  return text || null;
}

export function captionsForLocation(
  map: CwMap,
  locationId: string,
  preview?: CaptionPreview | null,
): CaptionItem[] {
  const items: CaptionItem[] = [];
  for (const edge of map.edges) {
    if (edge.fromLocationId !== locationId) continue;
    if (
      preview &&
      preview.locationId === locationId &&
      sameCell(edge.fromCell, preview.cell)
    ) {
      continue;
    }
    const text = visibleEdgeCaption(edge);
    if (text) items.push({ id: edge.id, text, cell: edge.fromCell });
  }
  const previewText = preview?.text.trim() ?? '';
  if (preview && preview.locationId === locationId && previewText) {
    items.push({
      id: `preview:${locationId}`,
      text: previewText,
      cell: preview.cell,
    });
  }
  return items;
}

export function cellBox(cell: Cell): {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
} {
  const cellW = (GRID_SIZE - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const cellH = (GRID_SIZE - GRID_GAP * (GRID_ROWS - 1)) / GRID_ROWS;
  const x = cell.x * (cellW + GRID_GAP);
  const y = cell.y * (cellH + GRID_GAP);
  return { x, y, w: cellW, h: cellH, cx: x + cellW / 2, cy: y + cellH / 2 };
}

export function estimateChipWidth(text: string): number {
  const inner = Math.min(text.length * 5.4, CHIP_MAX_W - CHIP_PAD_X * 2);
  return Math.ceil(inner + CHIP_PAD_X * 2);
}

export function layoutEdgeCaptions(
  items: CaptionItem[],
  measureWidth: (text: string) => number = estimateChipWidth,
): CaptionLayout[] {
  if (items.length === 0) return [];
  const left: CaptionItem[] = [];
  const right: CaptionItem[] = [];
  for (const item of items) {
    if (item.cell.x >= GRID_COLS / 2) right.push(item);
    else left.push(item);
  }
  return [
    ...layoutSide(left, 'left', measureWidth),
    ...layoutSide(right, 'right', measureWidth),
  ];
}

function layoutSide(
  items: CaptionItem[],
  side: 'left' | 'right',
  measureWidth: (text: string) => number,
): CaptionLayout[] {
  const rows = items
    .map((item) => {
      const box = cellBox(item.cell);
      const chipW = Math.min(CHIP_MAX_W, Math.max(18, measureWidth(item.text)));
      return { item, box, chipW, chipY: box.cy - CHIP_H / 2 };
    })
    .sort((a, b) => a.box.cy - b.box.cy || a.item.cell.x - b.item.cell.x);

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const minY = prev.chipY + CHIP_H + 2;
    if (rows[i].chipY < minY) rows[i].chipY = minY;
  }

  return rows.map(({ item, box, chipW, chipY }) => {
    const chipX =
      side === 'right' ? GRID_SIZE + CHIP_OUTSET : -CHIP_OUTSET - chipW;
    const tipX = side === 'right' ? GRID_SIZE + CHIP_OUTSET : -CHIP_OUTSET;
    return {
      id: item.id,
      text: item.text,
      cell: item.cell,
      chipX,
      chipY,
      chipW,
      chipH: CHIP_H,
      anchorX: box.cx,
      anchorY: box.cy,
      tipX,
      tipY: chipY + CHIP_H / 2,
    };
  });
}

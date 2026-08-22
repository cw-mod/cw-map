export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type CardSide = 'left' | 'right' | 'top' | 'bottom';
export type OrthoMode = 'hv' | 'vh';

const EPS = 0.75;

export function viewportToWorld(
  vx: number,
  vy: number,
  cam: { x: number; y: number; z: number },
): Pt {
  return { x: (vx - cam.x) / cam.z, y: (vy - cam.y) / cam.z };
}

export function worldToViewport(
  p: Pt,
  cam: { x: number; y: number; z: number },
): Pt {
  return { x: p.x * cam.z + cam.x, y: p.y * cam.z + cam.y };
}

function collapse(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < EPS && Math.abs(last.y - p.y) < EPS) {
      continue;
    }
    out.push(p);
  }
  return out;
}

export function preferHorizontalFirst(from: Pt, to: Pt): boolean {
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
}

/** Side of `box` that `from` is approaching. Dominant axis, facing the source. */
export function sideOfApproach(from: Pt, box: Rect): CardSide {
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const dx = cx - from.x;
  const dy = cy - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'left' : 'right';
  }
  return dy >= 0 ? 'top' : 'bottom';
}

/** Midpoint of the side, or a point on that side lined up with `from` / `via`. */
export function attachOnSide(
  box: Rect,
  side: CardSide,
  from: Pt,
  via?: Pt | null,
): Pt {
  const midX = (box.left + box.right) / 2;
  const midY = (box.top + box.bottom) / 2;
  const inY = (y: number) => y >= box.top - EPS && y <= box.bottom + EPS;
  const inX = (x: number) => x >= box.left - EPS && x <= box.right + EPS;
  if (side === 'left' || side === 'right') {
    const x = side === 'left' ? box.left : box.right;
    const y =
      via && inY(via.y) ? via.y : inY(from.y) ? from.y : midY;
    return { x, y };
  }
  const y = side === 'top' ? box.top : box.bottom;
  const x = via && inX(via.x) ? via.x : inX(from.x) ? from.x : midX;
  return { x, y };
}

export function modeForSide(side: CardSide): OrthoMode {
  return side === 'left' || side === 'right' ? 'hv' : 'vh';
}

/** Orthogonal H-V-H or V-H-V. `via` is the corridor (world). */
export function orthogonalPoints(
  from: Pt,
  to: Pt,
  via?: Pt | null,
  mode?: OrthoMode,
): Pt[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const alignedH = Math.abs(dy) < EPS;
  const alignedV = Math.abs(dx) < EPS;
  if (!via && (alignedH || alignedV)) {
    return [from, to];
  }
  const mid = via ?? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const hv =
    mode === 'hv'
      ? true
      : mode === 'vh'
        ? false
        : alignedH && via
          ? false
          : alignedV && via
            ? true
            : preferHorizontalFirst(from, to);
  if (hv) {
    const x = mid.x;
    return collapse([from, { x, y: from.y }, { x, y: to.y }, to]);
  }
  const y = mid.y;
  return collapse([from, { x: from.x, y }, { x: to.x, y }, to]);
}

export function pointsToPath(pts: Pt[]): string {
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

export function corridorHandle(pts: Pt[]): Pt | null {
  if (pts.length < 2) return null;
  if (pts.length === 2) {
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }
  const a = pts[1];
  const b = pts[pts.length - 2];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

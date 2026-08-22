import { cellFill } from './edgeKinds';
import {
  emptyCellFill,
  usableBackgroundUrl,
} from './locationBackground';
import { locationHintLabels } from './locationMarks';
import { cellKind } from './mapModel';
import { viewportToWorld, type Pt } from './ortho';
import { tribeColors } from './tribes';
import type { CwMap, Location } from './types';
import { GRID_COLS, GRID_ROWS } from './types';

const WORLD_LAYER = '[data-cw-map-layer="world"]';
const EDGES_LAYER = '[data-cw-map-layer="edges"]';
const PADDING = 32;
const PREFERRED_SCALE = 2;
const MAX_CANVAS = 8192;
const MC = 120;
const GRID_GAP = 0.75;
const NAME_PX = 10;
const HINT_PX = 8;
const TITLE_MB = 4;
const HINT_MT = 2;
const LINE_STROKE = 1.5;
const DEFAULT_LINE = 'rgba(255,255,255,0.72)';
const CARD_SHADOW = 'rgba(0,0,0,0.45)';

export class ExportPngError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportPngError';
  }
}

export function sanitizeMapFilename(name: string): string {
  const trimmed = name.trim() || 'карта';
  const cleaned = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '');
  return (cleaned || 'карта').slice(0, 120);
}

export async function downloadMapPng(map: CwMap): Promise<void> {
  if (map.locations.length === 0) {
    throw new ExportPngError('На карте нет локаций — нечего сохранять.');
  }

  await document.fonts.ready;

  const world = document.querySelector<HTMLElement>(WORLD_LAYER);
  const edges = document.querySelector<SVGSVGElement>(EDGES_LAYER);
  const cam = world ? cameraFromLayer(world) : { x: 0, y: 0, z: 1 };
  const polylines = edges ? worldPolylines(edges, cam) : [];

  const bounds = measureBounds(map, polylines);
  const cssW = Math.max(1, Math.ceil(bounds.width + PADDING * 2));
  const cssH = Math.max(1, Math.ceil(bounds.height + PADDING * 2));
  const pixelRatio = pickPixelRatio(cssW, cssH);
  const shiftX = PADDING - bounds.minX;
  const shiftY = PADDING - bounds.minY;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cssW * pixelRatio));
  canvas.height = Math.max(1, Math.round(cssH * pixelRatio));
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    throw new ExportPngError('Не удалось создать изображение карты.');
  }

  let images = new Map<string, HTMLImageElement>();
  try {
    images = await loadBackgroundImages(map);
  } catch {
    images = new Map();
  }

  const render = (imgs: ReadonlyMap<string, HTMLImageElement>) => {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.translate(shiftX, shiftY);

    for (const loc of map.locations) {
      const url = usableBackgroundUrl(loc.backgroundUrl);
      drawCard(ctx, map, loc, url ? imgs.get(url) : undefined);
    }

    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    ctx.strokeStyle = DEFAULT_LINE;
    ctx.lineWidth = LINE_STROKE;
    for (const pts of polylines) {
      if (pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    }
  };

  render(images);
  let blob: Blob | undefined;
  try {
    ctx.getImageData(0, 0, 1, 1);
    blob = await canvasToBlob(canvas);
  } catch {
    blob = undefined;
  }
  if (!blob) {
    render(new Map());
    blob = await canvasToBlob(canvas);
  }
  downloadBlob(blob, `${sanitizeMapFilename(map.name)}.png`);
}

function cameraFromLayer(el: HTMLElement): { x: number; y: number; z: number } {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return { x: 0, y: 0, z: 1 };
  const m = new DOMMatrix(t);
  return { x: m.e, y: m.f, z: m.a || 1 };
}

function worldPolylines(
  svg: SVGSVGElement,
  cam: { x: number; y: number; z: number },
): Pt[][] {
  const out: Pt[][] = [];
  for (const path of svg.querySelectorAll('path')) {
    const stroke = path.getAttribute('stroke');
    if (!stroke || stroke === 'transparent') continue;
    const d = path.getAttribute('d');
    if (!d) continue;
    const pts = parsePolyPath(d).map((p) => viewportToWorld(p.x, p.y, cam));
    if (pts.length >= 2) out.push(pts);
  }
  return out;
}

function parsePolyPath(d: string): Pt[] {
  const pts: Pt[] = [];
  const re = /[ML]\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d))) {
    pts.push({ x: Number(match[1]), y: Number(match[2]) });
  }
  return pts;
}

function measureBounds(
  map: CwMap,
  polylines: Pt[][],
): { minX: number; minY: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const loc of map.locations) {
    const box = cardBox(loc);
    include(box.minX, box.minY);
    include(box.maxX, box.maxY);
  }
  for (const pts of polylines) {
    for (const p of pts) include(p.x, p.y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    throw new ExportPngError('На карте нет локаций — нечего сохранять.');
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function cardMetrics(loc: Location): {
  pad: number;
  width: number;
  titleH: number;
  height: number;
  colors: string[];
  hints: string[];
} {
  const colors = tribeColors(loc.tribes);
  const pad = colors.length > 0 ? 2 : 0;
  const hints = locationHintLabels(loc);
  const titleH =
    NAME_PX + TITLE_MB + (hints.length > 0 ? HINT_MT + HINT_PX : 0);
  const width = MC + pad * 2;
  return {
    pad,
    width,
    titleH,
    height: titleH + MC + pad * 2,
    colors,
    hints,
  };
}

function cardBox(loc: Location): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const m = cardMetrics(loc);
  return {
    minX: loc.x,
    minY: loc.y,
    maxX: loc.x + m.width,
    maxY: loc.y + m.height,
  };
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  map: CwMap,
  loc: Location,
  bgImage?: HTMLImageElement,
): void {
  const m = cardMetrics(loc);
  const x = loc.x;
  const y = loc.y;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `${NAME_PX}px Inter, sans-serif`;
  ctx.fillText(fitText(ctx, loc.name, m.width), x, y);

  if (m.hints.length > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `${HINT_PX}px Inter, sans-serif`;
    ctx.fillText(
      fitText(ctx, m.hints.join('  '), m.width),
      x,
      y + NAME_PX + HINT_MT,
    );
  }

  const frameX = x;
  const frameY = y + m.titleH;
  const frameW = m.width;
  const frameH = MC + m.pad * 2;

  ctx.save();
  ctx.shadowColor = CARD_SHADOW;
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  roundRect(ctx, frameX, frameY, frameW, frameH, 4);
  if (m.colors.length === 0) {
    ctx.fillStyle = '#4a4a4a';
  } else {
    ctx.fillStyle = tribeFill(ctx, frameX, frameY, frameW, frameH, m.colors);
  }
  ctx.fill();
  ctx.restore();

  if (m.colors.length > 0) {
    roundRect(ctx, frameX, frameY, frameW, frameH, 4);
    ctx.fillStyle = tribeFill(ctx, frameX, frameY, frameW, frameH, m.colors);
    ctx.fill();
  }

  drawMiniGrid(ctx, map, loc.id, frameX + m.pad, frameY + m.pad, bgImage);
}

function tribeFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: string[],
): CanvasGradient | string {
  if (colors.length === 1) return colors[0];
  if (colors.length === 2) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0.5, colors[0]);
    g.addColorStop(0.501, colors[1]);
    return g;
  }
  const g = ctx.createConicGradient((135 * Math.PI) / 180, x + w / 2, y + h / 2);
  const slice = 1 / colors.length;
  colors.forEach((c, i) => {
    g.addColorStop(i * slice, c);
    g.addColorStop(Math.min(1, (i + 1) * slice), c);
  });
  return g;
}

function drawMiniGrid(
  ctx: CanvasRenderingContext2D,
  map: CwMap,
  locationId: string,
  x: number,
  y: number,
  bgImage?: HTMLImageElement,
): void {
  const cellW = (MC - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const cellH = (MC - GRID_GAP * (GRID_ROWS - 1)) / GRID_ROWS;
  const hasBg = Boolean(bgImage);

  ctx.save();
  roundRect(ctx, x, y, MC, MC, 2);
  ctx.fillStyle = '#4a4a4a';
  ctx.fill();
  ctx.clip();

  if (bgImage) {
    drawImageCover(ctx, bgImage, x, y, MC, MC);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(x, y, MC, MC);
  }

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const kind = cellKind(map, locationId, { x: col, y: row });
      ctx.fillStyle =
        kind === 'empty' && hasBg ? emptyCellFill(true) : cellFill(kind);
      ctx.fillRect(
        x + col * (cellW + GRID_GAP),
        y + row * (cellH + GRID_GAP),
        cellW,
        cellH,
      );
    }
  }
  ctx.restore();
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (iw <= 0 || ih <= 0) return;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

const IMAGE_LOAD_MS = 4000;

function loadBackgroundImages(
  map: CwMap,
): Promise<Map<string, HTMLImageElement>> {
  const urls = [
    ...new Set(
      map.locations
        .map((loc) => usableBackgroundUrl(loc.backgroundUrl))
        .filter((url): url is string => Boolean(url)),
    ),
  ];
  return Promise.all(urls.map((url) => loadCorsImage(url))).then((loaded) => {
    const out = new Map<string, HTMLImageElement>();
    urls.forEach((url, i) => {
      const img = loaded[i];
      if (img) out.set(url, img);
    });
    return out;
  });
}

function loadCorsImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), IMAGE_LOAD_MS);
    img.crossOrigin = 'anonymous';
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = url;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(`${t}…`).width > maxW) {
    t = t.slice(0, -1);
  }
  return t.length ? `${t}…` : '';
}

function pickPixelRatio(cssW: number, cssH: number): number {
  const max = Math.max(cssW, cssH, 1);
  return Math.min(PREFERRED_SCALE, MAX_CANVAS / max);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new ExportPngError('Не удалось сохранить PNG.'));
    }, 'image/png');
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

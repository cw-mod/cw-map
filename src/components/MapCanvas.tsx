import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { cellFill, EDGE_KIND_UI, isOffmapEdge } from '../edgeKinds';
import {
  emptyCellFill,
  locationCardBackground,
  usableBackgroundUrl,
  useLoadedBackgrounds,
} from '../locationBackground';
import {
  captionsForLocation,
  CHIP_FONT_PX,
  CHIP_PAD_X,
  layoutEdgeCaptions,
  type CaptionPreview,
} from '../edgeLabels';
import { cellKind, isSelfLoop } from '../mapModel';
import { OFFMAP_KINDS } from '../types';
import {
  attachOnSide,
  corridorHandle,
  modeForSide,
  orthogonalPoints,
  pointsToPath,
  sideOfApproach,
  viewportToWorld,
  worldToViewport,
  type Pt,
} from '../ortho';
import type { Cell, CwMap, Location } from '../types';
import { GRID_COLS, GRID_ROWS } from '../types';
import { locationHintLabels } from '../locationMarks';
import { tribeBorderBackground, tribeColors } from '../tribes';

const MC = 120;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_BUTTON_FACTOR = 1.2;
const PAN_CLICK_SLOP = 4;

interface Camera {
  x: number;
  y: number;
  z: number;
}

interface MapCanvasProps {
  map: CwMap;
  selectedId?: string | null;
  readOnly?: boolean;
  pathLocationIds?: string[];
  pathEdgeIds?: string[];
  routeFromId?: string | null;
  routeToId?: string | null;
  onSelect?: (id: string | null) => void;
  onLocationClick?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onDeleteLocation?: (id: string, event: ReactMouseEvent) => void;
  onAddLocation?: (event: ReactMouseEvent) => void;
  onElbowChange?: (edgeId: string, elbow: { x: number; y: number }) => void;
  captionPreview?: CaptionPreview | null;
}

function cardOutline(opts: {
  selected: boolean;
  isFrom: boolean;
  isTo: boolean;
  onPath: boolean;
}): string {
  if (opts.selected) {
    return '0 0 0 2px #ff9090, 0 0 0 5px rgba(255,144,144,0.3)';
  }
  if (opts.isFrom) {
    return '0 0 0 2px #7dd3fc, 0 0 0 5px rgba(125,211,252,0.35)';
  }
  if (opts.isTo) {
    return '0 0 0 2px #d8b4fe, 0 0 0 5px rgba(216,180,254,0.4)';
  }
  if (opts.onPath) {
    return '0 0 0 2px #fbbf24, 0 0 0 5px rgba(251,191,36,0.35)';
  }
  return '0 1px 4px rgba(0,0,0,0.45)';
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function cellCenter(
  grid: HTMLDivElement,
  viewport: HTMLDivElement,
  cell: Cell,
): { x: number; y: number } {
  const gridRect = grid.getBoundingClientRect();
  const viewRect = viewport.getBoundingClientRect();
  const cellW = gridRect.width / GRID_COLS;
  const cellH = gridRect.height / GRID_ROWS;
  return {
    x: gridRect.left - viewRect.left + cell.x * cellW + cellW / 2,
    y: gridRect.top - viewRect.top + cell.y * cellH + cellH / 2,
  };
}

/** Framed grid (parent = colored border), viewport-relative. */
function cardScreenBox(
  grid: HTMLDivElement,
  viewport: HTMLDivElement,
): { left: number; top: number; right: number; bottom: number } {
  const el = grid.parentElement ?? grid;
  const r = el.getBoundingClientRect();
  const v = viewport.getBoundingClientRect();
  return {
    left: r.left - v.left,
    top: r.top - v.top,
    right: r.right - v.left,
    bottom: r.bottom - v.top,
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function MapCanvas({
  map,
  selectedId = null,
  readOnly = false,
  pathLocationIds = [],
  pathEdgeIds = [],
  routeFromId = null,
  routeToId = null,
  onSelect,
  onLocationClick,
  onMove,
  onDeleteLocation,
  onAddLocation,
  onElbowChange,
  captionPreview = null,
}: MapCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const gridRefs = useRef(new Map<string, HTMLDivElement>());
  const cameraRef = useRef<Camera>({ x: 0, y: 0, z: 1 });
  const hoverRef = useRef(false);
  const spaceRef = useRef(false);
  const movedRef = useRef(false);
  const cardDrag = useRef<{
    id: string;
    ox: number;
    oy: number;
    mx: number;
    my: number;
  } | null>(null);
  const panDrag = useRef<{
    mx: number;
    my: number;
    ox: number;
    oy: number;
  } | null>(null);
  const elbowDrag = useRef<{ edgeId: string } | null>(null);

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, z: 1 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [layoutTick, setLayoutTick] = useState(0);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [draggingElbowId, setDraggingElbowId] = useState<string | null>(null);
  const loadedBgs = useLoadedBackgrounds(
    map.locations.map((loc) => loc.backgroundUrl),
  );

  const applyCamera = useCallback((next: Camera) => {
    const cam = { x: next.x, y: next.y, z: clampZoom(next.z) };
    cameraRef.current = cam;
    setCamera(cam);
  }, []);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, nextZ: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const z = clampZoom(nextZ);
      const { x: panX, y: panY, z: prevZ } = cameraRef.current;
      const rect = viewport.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const worldX = (sx - panX) / prevZ;
      const worldY = (sy - panY) / prevZ;
      applyCamera({ x: sx - worldX * z, y: sy - worldY * z, z });
    },
    [applyCamera],
  );

  const zoomByButton = (factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    zoomAt(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      cameraRef.current.z * factor,
    );
  };

  useLayoutEffect(() => {
    setLayoutTick((n) => n + 1);
  }, [map.locations, map.edges, selectedId, camera]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const cam = cameraRef.current;
      if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
        const dx = event.deltaX !== 0 ? event.deltaX : event.deltaY;
        const dy = event.deltaX !== 0 ? event.deltaY : 0;
        applyCamera({ x: cam.x - dx, y: cam.y - dy, z: cam.z });
        return;
      }
      if (event.deltaY === 0 && event.deltaX !== 0) {
        applyCamera({ x: cam.x - event.deltaX, y: cam.y, z: cam.z });
        return;
      }
      const factor = Math.exp(-event.deltaY * 0.002);
      zoomAt(event.clientX, event.clientY, cam.z * factor);
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [applyCamera, zoomAt]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;
      if (isTypingTarget(event.target)) return;
      if (!hoverRef.current) return;
      event.preventDefault();
      spaceRef.current = true;
      setSpaceHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const onWindowMove = (event: MouseEvent) => {
      const elbow = elbowDrag.current;
      const viewport = viewportRef.current;
      if (elbow && viewport) {
        movedRef.current = true;
        const rect = viewport.getBoundingClientRect();
        const world = viewportToWorld(
          event.clientX - rect.left,
          event.clientY - rect.top,
          cameraRef.current,
        );
        onElbowChange?.(elbow.edgeId, { x: world.x, y: world.y });
        return;
      }
      const pan = panDrag.current;
      if (pan) {
        const dx = event.clientX - pan.mx;
        const dy = event.clientY - pan.my;
        if (Math.hypot(dx, dy) > PAN_CLICK_SLOP) movedRef.current = true;
        applyCamera({ x: pan.ox + dx, y: pan.oy + dy, z: cameraRef.current.z });
        return;
      }
      const drag = cardDrag.current;
      if (!drag) return;
      const z = cameraRef.current.z;
      const dx = (event.clientX - drag.mx) / z;
      const dy = (event.clientY - drag.my) / z;
      if (Math.hypot(event.clientX - drag.mx, event.clientY - drag.my) > PAN_CLICK_SLOP) {
        movedRef.current = true;
      }
      onMove?.(drag.id, drag.ox + dx, drag.oy + dy);
    };
    const onWindowUp = () => {
      panDrag.current = null;
      cardDrag.current = null;
      elbowDrag.current = null;
      setPanning(false);
      setDraggingElbowId(null);
    };
    window.addEventListener('mousemove', onWindowMove);
    window.addEventListener('mouseup', onWindowUp);
    return () => {
      window.removeEventListener('mousemove', onWindowMove);
      window.removeEventListener('mouseup', onWindowUp);
    };
  }, [applyCamera, onMove, onElbowChange]);

  const startPan = (event: ReactMouseEvent | MouseEvent) => {
    movedRef.current = false;
    panDrag.current = {
      mx: event.clientX,
      my: event.clientY,
      ox: cameraRef.current.x,
      oy: cameraRef.current.y,
    };
    setPanning(true);
  };

  const onViewportDown = (event: ReactMouseEvent) => {
    if (event.button === 1 || spaceRef.current || event.button === 0) {
      if (event.button === 1) event.preventDefault();
      startPan(event);
    }
  };

  const onCardDown = (event: ReactMouseEvent, loc: Location) => {
    if (event.button === 1 || spaceRef.current) {
      if (event.button === 1) event.preventDefault();
      event.stopPropagation();
      startPan(event);
      return;
    }
    if (readOnly) {
      event.stopPropagation();
      movedRef.current = false;
      return;
    }
    if (event.button !== 0) return;
    event.stopPropagation();
    movedRef.current = false;
    cardDrag.current = {
      id: loc.id,
      ox: loc.x,
      oy: loc.y,
      mx: event.clientX,
      my: event.clientY,
    };
    onSelect?.(loc.id);
  };

  const onCardClick = (event: ReactMouseEvent, loc: Location) => {
    event.stopPropagation();
    if (movedRef.current) return;
    if (onLocationClick) {
      onLocationClick(loc.id);
      return;
    }
    onSelect?.(loc.id);
  };

  const onViewportClick = () => {
    if (movedRef.current) return;
    onSelect?.(null);
  };

  const lines = (() => {
    const viewport = viewportRef.current;
    if (!viewport) return [];
    void layoutTick;
    const cam = camera;
    const result: {
      edgeId: string;
      d: string;
      bidir: boolean;
      onPath: boolean;
      handle: Pt | null;
      fromId: string;
      toId?: string;
    }[] = [];
    const seen = new Set<string>();
    const toWorld = (p: { x: number; y: number }) =>
      viewportToWorld(p.x, p.y, cam);
    const toScreen = (pts: Pt[]) => pts.map((p) => worldToViewport(p, cam));

    for (const edge of map.edges) {
      if (isOffmapEdge(edge) || isSelfLoop(edge) || !edge.toLocationId) continue;
      const fromGrid = gridRefs.current.get(edge.fromLocationId);
      if (!fromGrid) continue;

      const pair = [edge.fromLocationId, edge.toLocationId].sort().join('~');
      if (seen.has(pair)) continue;
      seen.add(pair);

      const toGrid = gridRefs.current.get(edge.toLocationId);
      if (!toGrid) continue;

      const reverse = map.edges.find(
        (other) =>
          other.fromLocationId === edge.toLocationId &&
          other.toLocationId === edge.fromLocationId &&
          !isSelfLoop(other),
      );
      const fromS = cellCenter(fromGrid, viewport, edge.fromCell);
      const fromW = toWorld(fromS);
      const via = edge.elbow ?? reverse?.elbow;
      const ownerId = edge.elbow
        ? edge.id
        : reverse?.elbow
          ? reverse.id
          : edge.id;
      let toW: Pt;
      let mode: 'hv' | 'vh' | undefined;
      if (reverse) {
        toW = toWorld(cellCenter(toGrid, viewport, reverse.fromCell));
      } else {
        const boxS = cardScreenBox(toGrid, viewport);
        const tl = toWorld({ x: boxS.left, y: boxS.top });
        const br = toWorld({ x: boxS.right, y: boxS.bottom });
        const box = { left: tl.x, top: tl.y, right: br.x, bottom: br.y };
        const side = sideOfApproach(fromW, box);
        toW = attachOnSide(box, side, fromW, via);
        mode = modeForSide(side);
      }
      const screenPts = toScreen(orthogonalPoints(fromW, toW, via, mode));
      const onPath = map.edges.some(
        (candidate) =>
          pathEdgeIds.includes(candidate.id) &&
          ((candidate.fromLocationId === edge.fromLocationId &&
            candidate.toLocationId === edge.toLocationId) ||
            (candidate.fromLocationId === edge.toLocationId &&
              candidate.toLocationId === edge.fromLocationId)),
      );
      result.push({
        edgeId: ownerId,
        d: pointsToPath(screenPts),
        bidir: Boolean(reverse),
        onPath,
        handle: corridorHandle(screenPts),
        fromId: edge.fromLocationId,
        toId: edge.toLocationId,
      });
    }
    return result;
  })();

  const setGridRef = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) gridRefs.current.set(id, node);
    else gridRefs.current.delete(id);
  }, []);

  const grabCursor = panning || spaceHeld ? 'grabbing' : 'grab';

  return (
    <div
      ref={viewportRef}
      className="relative flex-1 overflow-hidden"
      style={{ backgroundColor: '#3e3e3e', cursor: grabCursor }}
      onMouseEnter={() => {
        hoverRef.current = true;
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
      }}
      onMouseDown={onViewportDown}
      onAuxClick={(event) => event.preventDefault()}
      onClick={onViewportClick}
    >
      <div
        data-cw-map-layer="world"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {map.locations.map((loc) => {
          const isSel = loc.id === selectedId;
          const isFrom = loc.id === routeFromId;
          const isTo = loc.id === routeToId;
          const onPath = pathLocationIds.includes(loc.id);
          const colors = tribeColors(loc.tribes);
          const borderPad = colors.length > 0 ? 2 : 0;
          const borderBg = tribeBorderBackground(colors);
          const hints = locationHintLabels(loc);
          const bgUrl = usableBackgroundUrl(loc.backgroundUrl);
          const hasBg = Boolean(bgUrl && loadedBgs.has(bgUrl));
          const captions = layoutEdgeCaptions(
            captionsForLocation(map, loc.id, captionPreview),
          );
          const cardCursor = readOnly
            ? spaceHeld || panning
              ? grabCursor
              : onLocationClick
                ? 'pointer'
                : grabCursor
            : undefined;

          return (
            <div
              key={loc.id}
              className={`absolute select-none group ${
                readOnly
                  ? ''
                  : 'cursor-grab active:cursor-grabbing'
              }`}
              style={{
                left: loc.x,
                top: loc.y,
                cursor: cardCursor,
              }}
              onMouseDown={(e) => onCardDown(e, loc)}
              onClick={(e) => onCardClick(e, loc)}
            >
              <div className="mb-1" style={{ width: MC + borderPad * 2 }}>
                <div className="flex items-center gap-1">
                  <span className="flex-1 truncate text-[10px] leading-none text-white">
                    {loc.name}
                  </span>
                  {isFrom || isTo ? (
                    <span className="shrink-0 text-[8px] leading-none text-white/50">
                      {isFrom ? 'откуда' : 'куда'}
                    </span>
                  ) : null}
                  {!readOnly && (
                    <button
                      type="button"
                      className="flex-shrink-0 text-white/40 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => onDeleteLocation?.(loc.id, e)}
                      aria-label="Удалить локацию"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
                {hints.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    {hints.map((hint) => (
                      <span
                        key={hint}
                        className="text-[8px] leading-none text-white/45"
                      >
                        {hint}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  position: 'relative',
                  padding: borderPad,
                  background: borderBg,
                  borderRadius: 4,
                  boxShadow: cardOutline({
                    selected: isSel,
                    isFrom,
                    isTo,
                    onPath,
                  }),
                }}
              >
                <div
                  ref={(node) => setGridRef(loc.id, node)}
                  style={{
                    ...miniGridStyle,
                    ...(hasBg
                      ? locationCardBackground(loc.backgroundUrl)
                      : { backgroundColor: '#4a4a4a' }),
                  }}
                >
                  {Array.from({ length: GRID_COLS * GRID_ROWS }, (_, idx) => {
                    const y = Math.floor(idx / GRID_COLS);
                    const x = idx % GRID_COLS;
                    const kind = cellKind(map, loc.id, { x, y });
                    const fill =
                      kind === 'empty' && hasBg
                        ? emptyCellFill(true)
                        : cellFill(kind);
                  return (
                    <div
                      key={idx}
                      style={{ backgroundColor: fill }}
                    />
                  );
                  })}
                </div>
                {captions.length > 0 && (
                  <div
                    className="pointer-events-none absolute overflow-visible"
                    style={{
                      left: borderPad,
                      top: borderPad,
                      width: MC,
                      height: MC,
                    }}
                  >
                    <svg
                      width={MC}
                      height={MC}
                      className="absolute overflow-visible"
                      style={{ overflow: 'visible' }}
                    >
                      {captions.map((cap) => (
                        <line
                          key={`lead-${cap.id}`}
                          x1={cap.anchorX}
                          y1={cap.anchorY}
                          x2={cap.tipX}
                          y2={cap.tipY}
                          stroke="rgba(255,255,255,0.32)"
                          strokeWidth={1}
                        />
                      ))}
                    </svg>
                    {captions.map((cap) => (
                      <div
                        key={cap.id}
                        className="absolute truncate text-white"
                        style={{
                          left: cap.chipX,
                          top: cap.chipY,
                          width: cap.chipW,
                          height: cap.chipH,
                          paddingLeft: CHIP_PAD_X,
                          paddingRight: CHIP_PAD_X,
                          fontSize: CHIP_FONT_PX,
                          lineHeight: `${cap.chipH}px`,
                          borderRadius: 3,
                          backgroundColor: 'rgba(20,20,20,0.9)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                        }}
                        title={cap.text}
                      >
                        {cap.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <svg
        data-cw-map-layer="edges"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      >
        {lines.map((ln) => {
          const showHandle =
            Boolean(onElbowChange) &&
            Boolean(ln.handle) &&
            (hoveredLineId === ln.edgeId ||
              draggingElbowId === ln.edgeId ||
              selectedId === ln.fromId ||
              selectedId === ln.toId);
          return (
            <g
              key={ln.edgeId}
              onMouseEnter={() => setHoveredLineId(ln.edgeId)}
              onMouseLeave={() =>
                setHoveredLineId((id) => (id === ln.edgeId ? null : id))
              }
            >
              <path
                d={ln.d}
                stroke="transparent"
                strokeWidth={16}
                fill="none"
                className="pointer-events-auto"
                style={{ pointerEvents: 'stroke' }}
              />
              <path
                d={ln.d}
                stroke={ln.onPath ? '#fbbf24' : 'rgba(255,255,255,0.72)'}
                strokeWidth={ln.onPath ? 2.4 : 1.5}
                fill="none"
              />
              {showHandle && ln.handle ? (
                <circle
                  cx={ln.handle.x}
                  cy={ln.handle.y}
                  r={6}
                  fill="#f5f5f5"
                  stroke="#2c2c2c"
                  strokeWidth={1.5}
                  className="pointer-events-auto cursor-grab"
                  onMouseDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    movedRef.current = false;
                    elbowDrag.current = { edgeId: ln.edgeId };
                    setDraggingElbowId(ln.edgeId);
                    setHoveredLineId(ln.edgeId);
                  }}
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute bottom-5 left-5 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: EDGE_KIND_UI.location.color }} />
          <span className="text-[10px] text-white/55">→ другая локация</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: EDGE_KIND_UI.self.color }} />
          <span className="text-[10px] text-white/55">↩ в себя</span>
        </div>
        {OFFMAP_KINDS.map((kind) => (
          <div key={kind} className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: EDGE_KIND_UI[kind].color }} />
            <span className="text-[10px] text-white/55">{EDGE_KIND_UI[kind].label}</span>
          </div>
        ))}
        {onElbowChange ? (
          <span className="mt-1 text-[10px] text-white/40">
            Потяните точку на линии
          </span>
        ) : null}
      </div>

      <div
        className="absolute right-5 bottom-5 flex flex-col items-end gap-2"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-0.5 rounded-lg p-1"
          style={{ backgroundColor: '#2c2c2c' }}
        >
          <button
            type="button"
            title="Отдалить"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#f5f5f5] transition-opacity hover:opacity-85 disabled:opacity-30"
            disabled={camera.z <= MIN_ZOOM}
            onClick={() => zoomByButton(1 / ZOOM_BUTTON_FACTOR)}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-11 text-center text-[11px] text-white/70 tabular-nums">
            {Math.round(camera.z * 100)}%
          </span>
          <button
            type="button"
            title="Приблизить"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#f5f5f5] transition-opacity hover:opacity-85 disabled:opacity-30"
            disabled={camera.z >= MAX_ZOOM}
            onClick={() => zoomByButton(ZOOM_BUTTON_FACTOR)}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-[11px] text-[#f5f5f5] transition-opacity hover:opacity-85"
          style={{ backgroundColor: '#2c2c2c' }}
          onClick={() => applyCamera({ x: 0, y: 0, z: 1 })}
        >
          Сбросить вид
        </button>
        {!readOnly && (
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-[#f5f5f5] transition-opacity hover:opacity-85"
            style={{ backgroundColor: '#2c2c2c' }}
            onClick={(e) => onAddLocation?.(e)}
          >
            <Plus className="h-4 w-4" />
            Добавить локацию
          </button>
        )}
      </div>
    </div>
  );
}

const miniGridStyle: CSSProperties = {
  width: MC,
  height: MC,
  display: 'grid',
  gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
  gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
  backgroundColor: '#4a4a4a',
  gap: '0.75px',
  borderRadius: 2,
  overflow: 'hidden',
};

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Minus, Plus, X } from 'lucide-react';
import {
  CARD_GRID,
  cellWorldCenter,
  DIMMED_GRID_GAPS,
  EMPTY_GRID_GAPS,
  locationFrameBox,
} from '../cardLayout';
import { cellFill, EDGE_KIND_UI, isOffmapEdge } from '../edgeKinds';
import {
  captionsForLocation,
  CHIP_FONT_PX,
  CHIP_PAD_X,
  cellBox,
  layoutEdgeCaptions,
  type CaptionLayout,
  type CaptionPreview,
} from '../edgeLabels';
import {
  locationCardBackground,
  usableBackgroundUrl,
  useLoadedBackgrounds,
} from '../locationBackground';
import { indexCellsByLocation, isSelfLoop, type MarkedCell } from '../mapModel';
import { OFFMAP_KINDS } from '../types';
import {
  attachOnSide,
  corridorHandle,
  modeForSide,
  orthogonalPoints,
  pointsToPath,
  sideOfApproach,
  viewportToWorld,
  type Pt,
} from '../ortho';
import type { CwMap, Edge, Location } from '../types';
import { locationHintLabels } from '../locationMarks';
import { tribeBorderBackground, tribeColors } from '../tribes';

const MC = CARD_GRID;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const ZOOM_BUTTON_FACTOR = 1.2;
const PAN_CLICK_SLOP = 4;
/** Below this zoom, skip per-cell DOM and captions. */
const DETAIL_ZOOM = 0.48;
const FIT_PAD = 48;

interface Camera {
  x: number;
  y: number;
  z: number;
}

interface WorldLine {
  edgeId: string;
  d: string;
  bidir: boolean;
  onPath: boolean;
  handle: Pt | null;
  fromId: string;
  toId?: string;
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
  pickMode?: boolean;
  onPickLocation?: (id: string) => void;
  pickHint?: string | null;
}

function cardOutline(opts: {
  selected: boolean;
  isFrom: boolean;
  isTo: boolean;
  onPath: boolean;
  pickHover?: boolean;
}): string {
  if (opts.pickHover) {
    return '0 0 0 2px #fde68a, 0 0 0 5px rgba(253,230,138,0.5)';
  }
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

function cameraTransform(cam: Camera): string {
  return `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function reverseKey(fromId: string, toId: string): string {
  return `${fromId}\0${toId}`;
}

function computeWorldLines(
  locations: Location[],
  edges: Edge[],
  pathEdgeIds: Set<string>,
): WorldLine[] {
  const locById = new Map(locations.map((loc) => [loc.id, loc]));
  const reverseOf = new Map<string, Edge>();
  for (const edge of edges) {
    if (isOffmapEdge(edge) || isSelfLoop(edge) || !edge.toLocationId) continue;
    reverseOf.set(reverseKey(edge.fromLocationId, edge.toLocationId), edge);
  }

  const result: WorldLine[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    if (isOffmapEdge(edge) || isSelfLoop(edge) || !edge.toLocationId) continue;
    const fromLoc = locById.get(edge.fromLocationId);
    const toLoc = locById.get(edge.toLocationId);
    if (!fromLoc || !toLoc) continue;

    const pair = [edge.fromLocationId, edge.toLocationId].sort().join('~');
    if (seen.has(pair)) continue;
    seen.add(pair);

    const reverse = reverseOf.get(
      reverseKey(edge.toLocationId, edge.fromLocationId),
    );
    const fromW = cellWorldCenter(fromLoc, edge.fromCell);
    const via = edge.elbow ?? reverse?.elbow;
    const ownerId = edge.elbow
      ? edge.id
      : reverse?.elbow
        ? reverse.id
        : edge.id;

    let toW: Pt;
    let mode: 'hv' | 'vh' | undefined;
    if (reverse) {
      toW = cellWorldCenter(toLoc, reverse.fromCell);
    } else {
      const box = locationFrameBox(toLoc);
      const side = sideOfApproach(fromW, box);
      toW = attachOnSide(box, side, fromW, via);
      mode = modeForSide(side);
    }

    const pts = orthogonalPoints(fromW, toW, via, mode);
    result.push({
      edgeId: ownerId,
      d: pointsToPath(pts),
      bidir: Boolean(reverse),
      onPath:
        pathEdgeIds.has(edge.id) ||
        (reverse ? pathEdgeIds.has(reverse.id) : false),
      handle: corridorHandle(pts),
      fromId: edge.fromLocationId,
      toId: edge.toLocationId,
    });
  }
  return result;
}

function worldSvgBounds(
  locations: Location[],
  edges: Edge[],
): { minX: number; minY: number; width: number; height: number } {
  let minX = 0;
  let minY = 0;
  let maxX = 400;
  let maxY = 400;
  for (const loc of locations) {
    const box = locationFrameBox(loc);
    minX = Math.min(minX, loc.x - 120);
    minY = Math.min(minY, loc.y - 24);
    maxX = Math.max(maxX, box.right + 120);
    maxY = Math.max(maxY, box.bottom + 24);
  }
  for (const edge of edges) {
    if (!edge.elbow) continue;
    minX = Math.min(minX, edge.elbow.x - 24);
    minY = Math.min(minY, edge.elbow.y - 24);
    maxX = Math.max(maxX, edge.elbow.x + 24);
    maxY = Math.max(maxY, edge.elbow.y + 24);
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function fitCameraToMap(locations: Location[], viewport: HTMLElement): Camera {
  if (locations.length === 0) return { x: 0, y: 0, z: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const loc of locations) {
    const box = locationFrameBox(loc);
    minX = Math.min(minX, loc.x);
    minY = Math.min(minY, loc.y);
    maxX = Math.max(maxX, box.right + 96);
    maxY = Math.max(maxY, box.bottom);
  }
  const vw = Math.max(1, viewport.clientWidth);
  const vh = Math.max(1, viewport.clientHeight);
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const z = clampZoom(
    Math.min((vw - FIT_PAD * 2) / w, (vh - FIT_PAD * 2) / h, 1),
  );
  return {
    x: (vw - w * z) / 2 - minX * z,
    y: (vh - h * z) / 2 - minY * z,
    z,
  };
}

function setToKey(ids: string[]): string {
  return ids.join('\0');
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
  pickMode = false,
  onPickLocation,
  pickHint = null,
}: MapCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, z: 1 });
  const hoverRef = useRef(false);
  const spaceRef = useRef(false);
  const movedRef = useRef(false);
  const showDetailRef = useRef(true);
  const fittedNameRef = useRef<string | null>(null);
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

  const [zoomPct, setZoomPct] = useState(100);
  const [showDetail, setShowDetail] = useState(true);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [hoveredPickId, setHoveredPickId] = useState<string | null>(null);
  const [draggingElbowId, setDraggingElbowId] = useState<string | null>(null);
  const loadedBgs = useLoadedBackgrounds(
    map.locations.map((loc) => loc.backgroundUrl),
  );

  const applyCamera = useCallback((next: Camera) => {
    const cam = { x: next.x, y: next.y, z: clampZoom(next.z) };
    const nextPct = Math.round(cam.z * 100);
    const zoomChanged = nextPct !== Math.round(cameraRef.current.z * 100);
    cameraRef.current = cam;
    const world = worldRef.current;
    if (world) world.style.transform = cameraTransform(cam);
    const nextDetail = cam.z >= DETAIL_ZOOM;
    if (nextDetail !== showDetailRef.current) {
      showDetailRef.current = nextDetail;
      setShowDetail(nextDetail);
    }
    if (zoomChanged) setZoomPct(nextPct);
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

  const fitView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    applyCamera(fitCameraToMap(map.locations, viewport));
  }, [applyCamera, map.locations]);

  useLayoutEffect(() => {
    const world = worldRef.current;
    if (world) world.style.transform = cameraTransform(cameraRef.current);
  });

  useLayoutEffect(() => {
    if (fittedNameRef.current === map.name) return;
    fittedNameRef.current = map.name;
    fitView();
  }, [fitView, map.name]);

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

  const onCardDown = useCallback(
    (event: ReactMouseEvent, loc: Location) => {
      if (event.button === 1 || spaceRef.current) {
        if (event.button === 1) event.preventDefault();
        event.stopPropagation();
        startPan(event);
        return;
      }
      if (pickMode) {
        event.stopPropagation();
        movedRef.current = false;
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
    },
    [onSelect, pickMode, readOnly],
  );

  const onCardClick = useCallback(
    (event: ReactMouseEvent, loc: Location) => {
      event.stopPropagation();
      if (movedRef.current) return;
      if (pickMode) {
        onPickLocation?.(loc.id);
        return;
      }
      if (onLocationClick) {
        onLocationClick(loc.id);
        return;
      }
      onSelect?.(loc.id);
    },
    [onLocationClick, onPickLocation, onSelect, pickMode],
  );

  const onViewportClick = () => {
    if (movedRef.current) return;
    if (pickMode) return;
    onSelect?.(null);
  };

  const pathLocKey = setToKey(pathLocationIds);
  const pathEdgeKey = setToKey(pathEdgeIds);
  const pathLocSet = useMemo(
    () => new Set(pathLocKey ? pathLocKey.split('\0') : []),
    [pathLocKey],
  );
  const pathEdgeSet = useMemo(
    () => new Set(pathEdgeKey ? pathEdgeKey.split('\0') : []),
    [pathEdgeKey],
  );

  const cellsByLoc = useMemo(
    () => indexCellsByLocation(map.edges),
    [map.edges],
  );

  const edges = map.edges;
  const captionsByLoc = useMemo(() => {
    const draft = { edges } as CwMap;
    const out = new Map<string, CaptionLayout[]>();
    const ids = new Set(edges.map((edge) => edge.fromLocationId));
    if (captionPreview) ids.add(captionPreview.locationId);
    for (const id of ids) {
      const caps = layoutEdgeCaptions(
        captionsForLocation(draft, id, captionPreview),
      );
      if (caps.length) out.set(id, caps);
    }
    return out;
  }, [edges, captionPreview]);

  const lines = useMemo(
    () => computeWorldLines(map.locations, map.edges, pathEdgeSet),
    [map.locations, map.edges, pathEdgeSet],
  );

  const svgBounds = useMemo(
    () => worldSvgBounds(map.locations, map.edges),
    [map.locations, map.edges],
  );

  const onPickHover = useCallback((id: string | null) => {
    setHoveredPickId(id);
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
        ref={worldRef}
        data-cw-map-layer="world"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {map.locations.map((loc) => (
          <LocationCard
            key={loc.id}
            loc={loc}
            selected={loc.id === selectedId}
            isFrom={loc.id === routeFromId}
            isTo={loc.id === routeToId}
            onPath={pathLocSet.has(loc.id)}
            pickMode={pickMode}
            pickHover={pickMode && hoveredPickId === loc.id}
            readOnly={readOnly}
            grabCursor={grabCursor}
            spaceHeld={spaceHeld}
            panning={panning}
            hasClick={Boolean(onLocationClick)}
            loadedBgs={loadedBgs}
            marked={showDetail ? (cellsByLoc.get(loc.id) ?? EMPTY_MARKED) : EMPTY_MARKED}
            captions={showDetail ? (captionsByLoc.get(loc.id) ?? EMPTY_CAPTIONS) : EMPTY_CAPTIONS}
            showDetail={showDetail}
            onCardDown={onCardDown}
            onCardClick={onCardClick}
            onDeleteLocation={onDeleteLocation}
            onPickHover={onPickHover}
          />
        ))}

        <svg
          data-cw-map-layer="edges"
          data-cw-map-space="world"
          className="pointer-events-none absolute overflow-visible"
          style={{
            left: svgBounds.minX,
            top: svgBounds.minY,
            width: svgBounds.width,
            height: svgBounds.height,
            overflow: 'visible',
          }}
          viewBox={`${svgBounds.minX} ${svgBounds.minY} ${svgBounds.width} ${svgBounds.height}`}
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
                  vectorEffect="nonScalingStroke"
                  className={pickMode ? undefined : 'pointer-events-auto'}
                  style={{ pointerEvents: pickMode ? 'none' : 'stroke' }}
                />
                <path
                  d={ln.d}
                  stroke={ln.onPath ? '#fbbf24' : 'rgba(255,255,255,0.72)'}
                  strokeWidth={ln.onPath ? 2.4 : 1.5}
                  fill="none"
                  vectorEffect="nonScalingStroke"
                />
                {showHandle && ln.handle ? (
                  <circle
                    cx={ln.handle.x}
                    cy={ln.handle.y}
                    r={6}
                    fill="#f5f5f5"
                    stroke="#2c2c2c"
                    strokeWidth={1.5}
                    vectorEffect="nonScalingStroke"
                    className={
                      pickMode
                        ? 'pointer-events-none'
                        : 'pointer-events-auto cursor-grab'
                    }
                    onMouseDown={(event) => {
                      if (pickMode) return;
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
      </div>

      {pickMode ? (
        <div
          className="pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-lg px-3 py-1.5 text-xs text-white shadow-lg"
          style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
        >
          {pickHint ?? 'Кликните локацию на карте'}
        </div>
      ) : null}

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
            disabled={zoomPct <= MIN_ZOOM * 100 + 0.5}
            onClick={() => zoomByButton(1 / ZOOM_BUTTON_FACTOR)}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-11 text-center text-[11px] text-white/70 tabular-nums">
            {zoomPct}%
          </span>
          <button
            type="button"
            title="Приблизить"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#f5f5f5] transition-opacity hover:opacity-85 disabled:opacity-30"
            disabled={zoomPct >= MAX_ZOOM * 100 - 0.5}
            onClick={() => zoomByButton(ZOOM_BUTTON_FACTOR)}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-[11px] text-[#f5f5f5] transition-opacity hover:opacity-85"
          style={{ backgroundColor: '#2c2c2c' }}
          onClick={fitView}
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

const EMPTY_MARKED: MarkedCell[] = [];
const EMPTY_CAPTIONS: CaptionLayout[] = [];

interface LocationCardProps {
  loc: Location;
  selected: boolean;
  isFrom: boolean;
  isTo: boolean;
  onPath: boolean;
  pickMode: boolean;
  pickHover: boolean;
  readOnly: boolean;
  grabCursor: string;
  spaceHeld: boolean;
  panning: boolean;
  hasClick: boolean;
  loadedBgs: ReadonlySet<string>;
  marked: MarkedCell[];
  captions: CaptionLayout[];
  showDetail: boolean;
  onCardDown: (event: ReactMouseEvent, loc: Location) => void;
  onCardClick: (event: ReactMouseEvent, loc: Location) => void;
  onDeleteLocation?: (id: string, event: ReactMouseEvent) => void;
  onPickHover: (id: string | null) => void;
}

const LocationCard = memo(function LocationCard({
  loc,
  selected,
  isFrom,
  isTo,
  onPath,
  pickMode,
  pickHover,
  readOnly,
  grabCursor,
  spaceHeld,
  panning,
  hasClick,
  loadedBgs,
  marked,
  captions,
  showDetail,
  onCardDown,
  onCardClick,
  onDeleteLocation,
  onPickHover,
}: LocationCardProps) {
  const bgUrl = usableBackgroundUrl(loc.backgroundUrl);
  const hasBg = Boolean(bgUrl && loadedBgs.has(bgUrl));
  const colors = tribeColors(loc.tribes);
  const borderPad = colors.length > 0 ? 2 : 0;
  const borderBg = tribeBorderBackground(colors);
  const hints = locationHintLabels(loc);
  const cardCursor = pickMode
    ? 'pointer'
    : readOnly
      ? spaceHeld || panning
        ? grabCursor
        : hasClick
          ? 'pointer'
          : grabCursor
      : undefined;

  return (
    <div
      className={`absolute select-none group ${
        readOnly || pickMode ? '' : 'cursor-grab active:cursor-grabbing'
      }`}
      style={{
        left: loc.x,
        top: loc.y,
        cursor: cardCursor,
        contain: 'layout style',
      }}
      onMouseDown={(e) => onCardDown(e, loc)}
      onClick={(e) => onCardClick(e, loc)}
      onMouseEnter={() => {
        if (pickMode) onPickHover(loc.id);
      }}
      onMouseLeave={() => {
        onPickHover(null);
      }}
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
          {!readOnly && !pickMode && (
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
            selected,
            isFrom,
            isTo,
            onPath,
            pickHover,
          }),
        }}
      >
        <div
          style={{
            ...miniGridStyle,
            ...(hasBg
              ? locationCardBackground(loc.backgroundUrl)
              : { backgroundColor: '#727272' }),
          }}
        >
          {showDetail ? (
            <div
              className="pointer-events-none absolute inset-0"
              style={hasBg ? DIMMED_GRID_GAPS : EMPTY_GRID_GAPS}
            />
          ) : null}
          {showDetail
            ? marked.map((item) => {
                const box = cellBox(item.cell);
                return (
                  <div
                    key={`${item.cell.x},${item.cell.y}`}
                    style={{
                      position: 'absolute',
                      left: box.x,
                      top: box.y,
                      width: box.w,
                      height: box.h,
                      backgroundColor: cellFill(item.kind),
                    }}
                  />
                );
              })
            : null}
        </div>
        {showDetail && captions.length > 0 && (
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
});

const miniGridStyle: CSSProperties = {
  width: MC,
  height: MC,
  position: 'relative',
  backgroundColor: '#4a4a4a',
  borderRadius: 2,
  overflow: 'hidden',
};

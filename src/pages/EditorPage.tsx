import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Download,
  Eye,
  MessageSquare,
  Plus,
  Redo2,
  Share2,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthorContacts } from '../components/AuthorContacts';
import { ExportPngButton } from '../components/ExportPngButton';
import { HelpButton } from '../components/HelpButton';
import { LocationPicker } from '../components/LocationPicker';
import { MapCanvas } from '../components/MapCanvas';
import { ShareModal } from '../components/ShareModal';
import { loadDraft, saveDraft } from '../draft';
import {
  addLocation,
  addLocationNear,
  deleteLocation,
  cellKind,
  downloadJson,
  edgeAtCell,
  emptyMap,
  findReverse,
  isSelfLoop,
  MapParseError,
  moveLocation,
  newEdgeId,
  nextLocationName,
  locationLabel,
  outgoingFrom,
  parseMapText,
  patchEdge,
  patchLocation,
  pickFreeCell,
  removeEdge,
  upsertOutgoingEdge,
} from '../mapModel';
import { PRESETS, clonePreset, type PresetId } from '../presets';
import {
  encodeMapHash,
  ShareTooLargeError,
  viewUrlWithHash,
} from '../share';
import {
  cellFill,
  EDGE_KIND_UI,
  edgeKindOf,
  isOffmapEdge,
  isOffmapKind,
  isOtherGroupEdge,
  isOtherGroupKind,
} from '../edgeKinds';
import {
  emptyCellFill,
  isBackgroundUrlValid,
  locationCardBackground,
  usableBackgroundUrl,
  useLoadedBackgrounds,
} from '../locationBackground';
import { ACTIONS, RESOURCES } from '../locationMarks';
import { TRIBES, tribeColors } from '../tribes';
import type {
  Cell,
  CwMap,
  Edge,
  Location,
  LocationActionId,
  LocationResourceId,
  OffmapKind,
  TribeId,
} from '../types';
import { GRID_COLS, GRID_ROWS, MAP_VERSION, OFFMAP_KINDS } from '../types';

const EC = 30;
const NEW_LOCATION_TARGET = '__new__';
const FORM_CELL_SELECTED = '#fbbf24';

function pickJsonFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('Файл не выбран'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.readAsText(file);
    };
    input.click();
  });
}

export function EditorPage() {
  const [map, setMap] = useState<CwMap>(() => loadDraft() ?? emptyMap());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBackgroundUrl, setEditBackgroundUrl] = useState('');
  const [editTribes, setEditTribes] = useState<TribeId[]>([]);
  const [editResources, setEditResources] = useState<LocationResourceId[]>([]);
  const [editActions, setEditActions] = useState<LocationActionId[]>([]);
  const [formCell, setFormCell] = useState<Cell | null>(null);
  const [formEditId, setFormEditId] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState('self');
  const [formNewName, setFormNewName] = useState('Новая локация');
  const [formLabel, setFormLabel] = useState('');
  const [formShowLabel, setFormShowLabel] = useState(false);
  const [formBidir, setFormBidir] = useState(false);
  const [pickingOnMap, setPickingOnMap] = useState(false);
  const [pickHint, setPickHint] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const histStack = useRef<{ locations: Location[]; edges: Edge[] }[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const skipHist = useRef(false);
  const prevSel = useRef<string | null>(null);

  const canUndo = histIdx > 0;
  const canRedo = histIdx >= 0 && histIdx < histStack.current.length - 1;
  const selLoc = map.locations.find((l) => l.id === selectedId) ?? null;
  const editTrans = selectedId ? outgoingFrom(map, selectedId) : [];
  const loadedBgs = useLoadedBackgrounds(
    map.locations.map((l) => l.backgroundUrl),
  );
  const selBgUrl = usableBackgroundUrl(selLoc?.backgroundUrl);
  const selHasBg = Boolean(selBgUrl && loadedBgs.has(selBgUrl));

  useEffect(() => {
    saveDraft(map);
  }, [map]);

  const recordHistory = useCallback(
    (snapshot: CwMap) => {
      if (skipHist.current) return;
      const stack = histStack.current.slice(0, histIdx + 1);
      stack.push(
        structuredClone({
          locations: snapshot.locations,
          edges: snapshot.edges,
        }),
      );
      histStack.current = stack;
      setHistIdx(stack.length - 1);
    },
    [histIdx],
  );

  const applyMap = useCallback(
    (next: CwMap) => {
      setMap(next);
      recordHistory(next);
    },
    [recordHistory],
  );

  useEffect(() => {
    if (prevSel.current === selectedId) return;
    prevSel.current = selectedId;
    const loc = map.locations.find((l) => l.id === selectedId);
    setEditName(loc?.name ?? '');
    setEditBackgroundUrl(loc?.backgroundUrl ?? '');
    setEditTribes(loc?.tribes ?? []);
    setEditResources(loc?.resources ?? []);
    setEditActions(loc?.actions ?? []);
    skipHist.current = true;
    histStack.current = [
      structuredClone({ locations: map.locations, edges: map.edges }),
    ];
    setHistIdx(0);
    skipHist.current = false;
    setFormCell(null);
    setFormEditId(null);
    setPickingOnMap(false);
    setPickHint(null);
    // Intentionally only when the selected card changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const handleUndo = useCallback(() => {
    if (histIdx <= 0) return;
    const ni = histIdx - 1;
    const snap = histStack.current[ni];
    skipHist.current = true;
    setMap((prev) => ({
      ...prev,
      locations: structuredClone(snap.locations),
      edges: structuredClone(snap.edges),
    }));
    setHistIdx(ni);
    skipHist.current = false;
    setFormCell(null);
    setFormEditId(null);
    setPickingOnMap(false);
    setPickHint(null);
  }, [histIdx]);

  const handleRedo = useCallback(() => {
    if (histIdx >= histStack.current.length - 1) return;
    const ni = histIdx + 1;
    const snap = histStack.current[ni];
    skipHist.current = true;
    setMap((prev) => ({
      ...prev,
      locations: structuredClone(snap.locations),
      edges: structuredClone(snap.edges),
    }));
    setHistIdx(ni);
    skipHist.current = false;
    setFormCell(null);
    setFormEditId(null);
    setPickingOnMap(false);
    setPickHint(null);
  }, [histIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Escape' && pickingOnMap) {
        e.preventDefault();
        setPickingOnMap(false);
        setPickHint(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo, pickingOnMap]);

  const handleSave = () => {
    if (!selectedId) return;
    setMap((prev) =>
      patchLocation(prev, selectedId, {
        name: editName,
        backgroundUrl: editBackgroundUrl.trim(),
        tribes: editTribes,
        resources: editResources,
        actions: editActions,
      }),
    );
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const onAddLocation = (e: MouseEvent) => {
    e.stopPropagation();
    const result = addLocation(map);
    setMap(result.map);
    setSelectedId(result.id);
  };

  const onDeleteLocation = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setMap(deleteLocation(map, id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleExport = () => {
    downloadJson(map, `${map.name || 'карта'}.json`);
  };

  const handleImport = async () => {
    try {
      const text = await pickJsonFile();
      const parsed = parseMapText(text);
      setMap(parsed);
      setSelectedId(null);
      setNotice(null);
    } catch (err) {
      const message =
        err instanceof MapParseError
          ? err.message
          : 'Не удалось прочитать файл. Нужен JSON карты.';
      setNotice(message);
    }
  };

  const handleShare = () => {
    try {
      const payload = encodeMapHash(map);
      setShareError(null);
      setShareUrl(viewUrlWithHash(payload));
    } catch (err) {
      setShareUrl(null);
      setShareError(
        err instanceof ShareTooLargeError
          ? err.message
          : 'Не удалось собрать ссылку. Скачайте JSON.',
      );
    }
  };

  const onEditorCellClick = (cell: Cell) => {
    if (!selectedId) return;
    setPickingOnMap(false);
    setPickHint(null);
    const existing = edgeAtCell(map, selectedId, cell);
    if (existing) {
      setFormCell(cell);
      setFormEditId(existing.id);
      setFormTarget(
        isOffmapEdge(existing)
          ? existing.kind
          : isSelfLoop(existing)
            ? 'self'
            : (existing.toLocationId ?? 'self'),
      );
      setFormLabel(existing.label ?? '');
      setFormShowLabel(existing.showLabel === true);
      setFormBidir(Boolean(findReverse(map, existing)));
    } else {
      setFormCell(cell);
      setFormEditId(null);
      setFormTarget('self');
      setFormBidir(false);
      setFormLabel('');
      setFormShowLabel(false);
      setFormNewName(nextLocationName(map));
    }
  };

  const onFormConfirm = () => {
    if (!selectedId || !formCell) return;
    const origin = map.locations.find((l) => l.id === selectedId);
    if (!origin) return;

    const existing = formEditId
      ? map.edges.find((e) => e.id === formEditId)
      : undefined;
    const note = formLabel.trim();

    if (isOffmapKind(formTarget)) {
      const edge: Edge = {
        id: existing?.id ?? newEdgeId(),
        kind: formTarget as OffmapKind,
        fromLocationId: selectedId,
        fromCell: formCell,
        ...(note ? { label: note } : {}),
        ...(formShowLabel ? { showLabel: true } : {}),
      };
      applyMap(upsertOutgoingEdge(map, edge, false));
      setFormCell(null);
      setFormEditId(null);
      setPickingOnMap(false);
      setPickHint(null);
      return;
    }

    const creating = formTarget === NEW_LOCATION_TARGET;
    const toSelf = formTarget === 'self';
    let working = map;
    let toLocationId = toSelf ? selectedId : formTarget;

    if (creating) {
      const created = addLocationNear(working, origin, formNewName);
      working = created.map;
      toLocationId = created.id;
    } else if (!toSelf && !working.locations.some((l) => l.id === toLocationId)) {
      return;
    }

    const toCell = toSelf
      ? formCell
      : existing && existing.toLocationId === toLocationId && existing.toCell
        ? existing.toCell
        : pickFreeCell(working, toLocationId);

    const edge: Edge = {
      id: existing?.id ?? newEdgeId(),
      kind: toSelf ? 'self' : 'location',
      fromLocationId: selectedId,
      fromCell: formCell,
      toLocationId,
      toCell,
      ...(toSelf && note ? { label: note } : {}),
      ...(toSelf && formShowLabel ? { showLabel: true } : {}),
    };
    applyMap(
      upsertOutgoingEdge(working, edge, !toSelf && formBidir),
    );
    setFormCell(null);
    setFormEditId(null);
    setPickingOnMap(false);
    setPickHint(null);
  };

  const onDeleteFromForm = () => {
    if (!formEditId) return;
    applyMap(removeEdge(map, formEditId));
    setFormCell(null);
    setFormEditId(null);
    setPickingOnMap(false);
    setPickHint(null);
  };

  const onDeleteTransition = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    applyMap(removeEdge(map, id));
    if (formEditId === id) {
      setFormCell(null);
      setFormEditId(null);
      setPickingOnMap(false);
      setPickHint(null);
    }
  };

  const startEmpty = () => {
    setMap(emptyMap());
    setSelectedId(null);
  };

  const cloneReadyMap = (id: PresetId) => {
    setMap(clonePreset(id));
    setSelectedId(null);
  };

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="@container flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b border-gray-200 bg-white">
          <div className="flex min-w-0 items-center gap-1 px-3 py-2.5 @[36rem]:gap-2.5 @[36rem]:px-4">
            <input
              className="min-w-0 flex-1 truncate rounded border-0 bg-transparent px-1.5 py-1 text-sm font-semibold outline-none -ml-1.5 placeholder:text-gray-300 focus:bg-gray-50"
              placeholder="Название карты"
              value={map.name}
              onChange={(e) =>
                setMap((prev) => ({ ...prev, name: e.target.value }))
              }
            />
            <div className="hidden h-5 w-px shrink-0 bg-gray-200 @[36rem]:block" />
            <div className="flex shrink-0 items-center gap-0.5 @[36rem]:gap-1">
            <Link
              to="/"
              title="К просмотру"
              aria-label="К просмотру"
              className="flex items-center gap-1 rounded-md p-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 @[36rem]:px-2.5 @[36rem]:py-1.5"
            >
              <Eye className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden @[36rem]:inline">К просмотру</span>
            </Link>
            <button
              type="button"
              onClick={() => setShowComment((v) => !v)}
              title="Комментарий к карте"
              aria-label="Комментарий к карте"
              className={`rounded-md p-1.5 transition-colors ${
                showComment
                  ? 'bg-gray-100 text-gray-700'
                  : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleImport()}
              title="Импорт карты (.json)"
              aria-label="Импорт карты"
              className="flex items-center gap-1 rounded-md p-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 @[36rem]:px-2.5 @[36rem]:py-1.5"
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden @[36rem]:inline">Импорт</span>
            </button>
            <button
              type="button"
              onClick={handleExport}
              title="Экспорт карты (.json)"
              aria-label="Экспорт карты"
              className="flex items-center gap-1 rounded-md p-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 @[36rem]:px-2.5 @[36rem]:py-1.5"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden @[36rem]:inline">Экспорт</span>
            </button>
            <ExportPngButton map={map} onError={setNotice} />
            <HelpButton />
            <button
              type="button"
              onClick={handleShare}
              title="Поделиться"
              aria-label="Поделиться"
              className="flex items-center gap-1 rounded-md p-1.5 text-xs text-white transition-opacity hover:opacity-85 @[36rem]:px-2.5 @[36rem]:py-1.5"
              style={{ backgroundColor: '#2c2c2c' }}
            >
              <Share2 className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden @[36rem]:inline">Поделиться</span>
            </button>
            </div>
          </div>
          <div className="px-3 pb-2 @[36rem]:px-4">
            <AuthorContacts />
          </div>
          {showComment && (
            <div className="px-4 pb-3">
              <textarea
                rows={2}
                placeholder="Описание карты — видно при открытии по ссылке…"
                className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-300 focus:ring-1 focus:ring-gray-300 focus:outline-none"
                value={map.comment ?? ''}
                onChange={(e) =>
                  setMap((prev) => ({ ...prev, comment: e.target.value }))
                }
              />
            </div>
          )}
        </div>

        {(notice || shareError) && (
          <div className="flex-shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            {notice || shareError}
            <button
              type="button"
              className="ml-3 text-amber-700 underline"
              onClick={() => {
                setNotice(null);
                setShareError(null);
              }}
            >
              Закрыть
            </button>
          </div>
        )}

        <MapCanvas
          map={map}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={(id, x, y) => setMap((prev) => moveLocation(prev, id, x, y))}
          onDeleteLocation={onDeleteLocation}
          onAddLocation={onAddLocation}
          onElbowChange={(edgeId, elbow) =>
            setMap((prev) => ({
              ...prev,
              version: MAP_VERSION,
              edges: prev.edges.map((e) =>
                e.id === edgeId ? { ...e, elbow } : e,
              ),
            }))
          }
          captionPreview={
            selectedId &&
            formCell &&
            formShowLabel &&
            formLabel.trim() &&
            isOtherGroupKind(formTarget)
              ? {
                  locationId: selectedId,
                  cell: formCell,
                  text: formLabel.trim(),
                }
              : null
          }
          pickMode={pickingOnMap}
          pickHint={pickHint}
          onPickLocation={(id) => {
            if (id === selectedId) {
              setPickHint('выберите другую локацию');
              return;
            }
            setFormTarget(id);
            setFormBidir(false);
            setPickingOnMap(false);
            setPickHint(null);
          }}
        />
      </div>

      <div
        className="flex h-full max-h-screen min-h-0 w-[360px] flex-shrink-0 flex-col overflow-y-auto border-l border-gray-300 bg-[#f2f0ed]"
      >
        {selLoc ? (
          <>
            <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-5 pt-5 pb-4">
              <h2 className="text-sm font-semibold text-gray-800">
                Редактирование локации
              </h2>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-lg px-3.5 py-2 text-xs text-white transition-opacity hover:opacity-85"
                style={{ backgroundColor: savedFlash ? '#16a34a' : '#2c2c2c' }}
              >
                {savedFlash ? 'Сохранено' : 'Сохранить'}
              </button>
            </div>

            <div className="flex-shrink-0 border-b border-gray-200 px-5 py-4">
              <label className="mb-1.5 block text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Имя локации
              </label>
              <input
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-1 focus:ring-gray-400 focus:outline-none"
                value={editName}
                onChange={(e) => {
                  const name = e.target.value;
                  setEditName(name);
                  setMap((prev) => patchLocation(prev, selLoc.id, { name }));
                }}
              />
              <label className="mt-3 mb-1.5 block text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Фон
              </label>
              <input
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-1 focus:ring-gray-400 focus:outline-none"
                value={editBackgroundUrl}
                placeholder="https://catwar.su/cw3/spacoj/71002.jpg"
                onChange={(e) => {
                  const backgroundUrl = e.target.value;
                  setEditBackgroundUrl(backgroundUrl);
                  if (isBackgroundUrlValid(backgroundUrl)) {
                    setMap((prev) =>
                      patchLocation(prev, selLoc.id, {
                        backgroundUrl: backgroundUrl.trim(),
                      }),
                    );
                  }
                }}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Официальные карты: после выкладки файлов — URL на /assets/гроза/…
              </p>
              {editBackgroundUrl.trim() !== '' &&
                !isBackgroundUrlValid(editBackgroundUrl) && (
                  <p className="mt-1 text-[11px] text-red-400">
                    Нужна ссылка http(s)
                  </p>
                )}
              <div className="mt-2.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  title="Ctrl+Z"
                  className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-500 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Undo2 className="h-3 w-3" /> Отменить
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={!canRedo}
                  title="Ctrl+Y"
                  className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-500 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Redo2 className="h-3 w-3" /> Повторить
                </button>
                <span className="ml-1 text-[10px] text-gray-300">
                  Ctrl+Z / Ctrl+Y
                </span>
              </div>
            </div>

            <div className="flex-shrink-0 border-b border-gray-200 px-5 py-3">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                  Племя
                </label>
                <span className="text-[10px] text-gray-400">
                  {editTribes.length === 0
                    ? 'нейтраль'
                    : `${editTribes.length} выбрано`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TRIBES.map((t) => {
                  const active = editTribes.includes(t.id);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => {
                        const next = active
                          ? editTribes.filter((v) => v !== t.id)
                          : [...editTribes, t.id];
                        setEditTribes(next);
                        setMap((prev) =>
                          patchLocation(prev, selLoc.id, { tribes: next }),
                        );
                      }}
                      className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all"
                      style={{
                        backgroundColor: active ? t.color : 'transparent',
                        borderColor: t.color,
                        color: active ? 'white' : t.color,
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {editTribes.length >= 2 && (
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full"
                  style={{
                    background:
                      editTribes.length === 2
                        ? `linear-gradient(to right, ${tribeColors(editTribes)[0]} 50%, ${tribeColors(editTribes)[1]} 50%)`
                        : `linear-gradient(to right, ${tribeColors(editTribes).join(', ')})`,
                  }}
                />
              )}
            </div>

            <div className="flex-shrink-0 border-b border-gray-200 px-5 py-3">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                  Ресурсы
                </label>
                <span className="text-[10px] text-gray-400">
                  {editResources.length === 0
                    ? 'нет'
                    : `${editResources.length} выбрано`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {RESOURCES.map((r) => {
                  const active = editResources.includes(r.id);
                  return (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => {
                        const next = active
                          ? editResources.filter((v) => v !== r.id)
                          : [...editResources, r.id];
                        setEditResources(next);
                        setMap((prev) =>
                          patchLocation(prev, selLoc.id, { resources: next }),
                        );
                      }}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                        active
                          ? 'border-gray-600 bg-gray-700 text-white'
                          : 'border-gray-300 bg-transparent text-gray-600'
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-shrink-0 border-b border-gray-200 px-5 py-3">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                  Действия
                </label>
                <span className="text-[10px] text-gray-400">
                  {editActions.length === 0
                    ? 'нет'
                    : `${editActions.length} выбрано`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ACTIONS.map((a) => {
                  const active = editActions.includes(a.id);
                  return (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => {
                        const next = active
                          ? editActions.filter((v) => v !== a.id)
                          : [...editActions, a.id];
                        setEditActions(next);
                        setMap((prev) =>
                          patchLocation(prev, selLoc.id, { actions: next }),
                        );
                      }}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                        active
                          ? 'border-gray-600 bg-gray-700 text-white'
                          : 'border-gray-300 bg-transparent text-gray-600'
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-shrink-0 border-b border-gray-200 px-5 py-4">
              <label className="mb-2 block text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Клетки — нажмите для перехода
              </label>
              <div
                className="overflow-hidden rounded-md"
                style={{
                  width: EC * GRID_COLS,
                  height: EC * GRID_ROWS,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                  gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
                  gap: '1px',
                  ...(selHasBg
                    ? locationCardBackground(selLoc.backgroundUrl)
                    : { backgroundColor: '#4a4a4a' }),
                }}
              >
                {Array.from({ length: GRID_COLS * GRID_ROWS }, (_, idx) => {
                  const y = Math.floor(idx / GRID_COLS);
                  const x = idx % GRID_COLS;
                  const trans = edgeAtCell(map, selLoc.id, { x, y });
                  const kind = cellKind(map, selLoc.id, { x, y });
                  const isForm =
                    formCell?.x === x && formCell?.y === y;
                  const bg = isForm
                    ? FORM_CELL_SELECTED
                    : kind === 'empty' && selHasBg
                      ? emptyCellFill(true)
                      : cellFill(kind);
                  const targetName = trans
                    ? isOffmapEdge(trans)
                      ? EDGE_KIND_UI[trans.kind].label
                      : isSelfLoop(trans)
                        ? 'в себя'
                        : (map.locations.find((l) => l.id === trans.toLocationId)
                            ?.name ?? '?')
                    : null;
                  return (
                    <div
                      key={idx}
                      className="cursor-pointer transition-[filter] hover:brightness-125"
                      style={{ backgroundColor: bg }}
                      onClick={() => onEditorCellClick({ x, y })}
                      title={
                        trans
                          ? `(${y + 1},${x + 1}) → ${targetName} — редактировать`
                          : `(${y + 1},${x + 1}) — добавить переход`
                      }
                    />
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10px] text-gray-400">
                Серая = локация · Синяя = в себя · Оранж. = лагерь · Беж. =
                лазалки · Бирюз. = плавательные · Сер. = туннели · Красн. =
                запрещён · Фиол. = тупик · Жёлтая = выбрана
              </p>
            </div>

            {formCell && (
              <div className="mx-5 my-3 flex-shrink-0 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">
                    {formEditId ? 'Редактировать' : 'Новый'} переход{' '}
                    <span className="font-normal text-gray-400">
                      ({formCell.y + 1}, {formCell.x + 1})
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFormCell(null);
                      setFormEditId(null);
                      setPickingOnMap(false);
                      setPickHint(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-col gap-2.5">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-gray-400 uppercase">
                      Куда ведёт
                    </label>
                    <LocationPicker
                      value={formTarget}
                      onChange={(value) => {
                        setPickingOnMap(false);
                        setPickHint(null);
                        setFormTarget(value);
                        setFormBidir(false);
                        if (value === NEW_LOCATION_TARGET) {
                          setFormNewName(nextLocationName(map));
                        }
                      }}
                      locations={map.locations
                        .filter((l) => l.id !== selectedId)
                        .map((l) => ({
                          value: l.id,
                          label: locationLabel(l, map.locations),
                        }))}
                      pinnedTop={[
                        { value: NEW_LOCATION_TARGET, label: 'Новая локация…' },
                      ]}
                      pinnedBottom={[
                        { value: 'self', label: 'Сама в себя' },
                        ...OFFMAP_KINDS.map((kind) => ({
                          value: kind,
                          label: EDGE_KIND_UI[kind].label,
                        })),
                      ]}
                      pinnedBottomTitle="Другое"
                      pinnedAction={{
                        label: 'Выбрать на карте',
                        active: pickingOnMap,
                        onClick: () => {
                          setPickingOnMap((active) => !active);
                          setPickHint(null);
                        },
                      }}
                    />
                    {pickingOnMap && (
                      <p className="mt-1 text-[11px] text-gray-500">
                        {pickHint ?? 'Кликните локацию на карте'}
                      </p>
                    )}
                  </div>
                  {formTarget === NEW_LOCATION_TARGET && (
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold text-gray-400 uppercase">
                        Имя новой локации
                      </label>
                      <input
                        className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs focus:ring-1 focus:ring-gray-400 focus:outline-none"
                        value={formNewName}
                        onChange={(e) => setFormNewName(e.target.value)}
                        placeholder="Новая локация"
                      />
                    </div>
                  )}
                  {isOtherGroupKind(formTarget) && (
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold text-gray-400 uppercase">
                        Подпись (необязательно)
                      </label>
                      <input
                        className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs focus:ring-1 focus:ring-gray-400 focus:outline-none"
                        value={formLabel}
                        onChange={(e) => setFormLabel(e.target.value)}
                        placeholder="Название той карты или лагеря"
                      />
                      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-gray-700 select-none">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded"
                          checked={formShowLabel}
                          onChange={(e) => setFormShowLabel(e.target.checked)}
                          style={{ accentColor: '#2c2c2c' }}
                        />
                        Показать подпись на карте
                      </label>
                    </div>
                  )}
                  {formTarget !== 'self' && !isOffmapKind(formTarget) && (
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700 select-none">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded"
                        checked={formBidir}
                        onChange={(e) => setFormBidir(e.target.checked)}
                        style={{ accentColor: '#2c2c2c' }}
                      />
                      Двусторонний (с обратным переходом)
                    </label>
                  )}
                  <div className="flex gap-2 pt-0.5">
                    {formEditId && (
                      <button
                        type="button"
                        onClick={onDeleteFromForm}
                        className="flex-none rounded-lg border border-red-200 px-3 py-2 text-xs text-red-500 transition-colors hover:bg-red-50"
                      >
                        Удалить
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onFormConfirm}
                      className="flex-1 rounded-lg py-2 text-xs font-medium text-white transition-opacity hover:opacity-85"
                      style={{ backgroundColor: '#2c2c2c' }}
                    >
                      {formEditId ? 'Обновить' : 'Добавить'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="px-5 py-3">
              <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                Переходы ({editTrans.length})
              </span>
              {editTrans.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-400">
                  Нажмите на клетку выше, чтобы добавить переход
                </p>
              ) : (
                <div className="mt-2 flex flex-col gap-1.5">
                  {editTrans.map((t) => {
                    const kind = edgeKindOf(t);
                    const off = isOffmapEdge(t);
                    const self = isSelfLoop(t);
                    const other = isOtherGroupEdge(t);
                    const tName = off
                      ? t.label
                        ? `${EDGE_KIND_UI[kind].label} · ${t.label}`
                        : EDGE_KIND_UI[kind].label
                      : self
                        ? t.label
                          ? `Сама в себя · ${t.label}`
                          : 'Сама в себя'
                        : (map.locations.find((l) => l.id === t.toLocationId)
                            ?.name ?? '?');
                    const isActive = formEditId === t.id;
                    const bidir = Boolean(findReverse(map, t));
                    const hasNote = Boolean(t.label?.trim());
                    return (
                      <div
                        key={t.id}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                          isActive
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                        onClick={() => onEditorCellClick(t.fromCell)}
                      >
                        <div
                          className="h-4 w-4 flex-shrink-0 rounded-sm"
                          style={{
                            backgroundColor: cellFill(kind === 'self' ? 'self' : off ? kind : 'location'),
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-gray-800">
                            Строка {t.fromCell.y + 1}, столбец {t.fromCell.x + 1}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-500">
                            {bidir ? (
                              <ArrowLeftRight className="h-3 w-3 flex-shrink-0 text-indigo-400" />
                            ) : (
                              <ArrowRight className="h-3 w-3 flex-shrink-0 text-gray-400" />
                            )}
                            <span className="truncate">{tName}</span>
                          </div>
                        </div>
                        {other && (
                          <label
                            className={`flex flex-shrink-0 cursor-pointer items-center gap-1 text-[10px] select-none ${
                              hasNote ? 'text-gray-500' : 'text-gray-300'
                            }`}
                            title={
                              hasNote
                                ? 'Показать подпись на карте'
                                : 'Сначала укажите подпись'
                            }
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              className="h-3 w-3 rounded"
                              checked={t.showLabel === true && hasNote}
                              disabled={!hasNote}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                applyMap(
                                  patchEdge(map, t.id, {
                                    showLabel: checked,
                                  }),
                                );
                                if (formEditId === t.id) {
                                  setFormShowLabel(checked);
                                }
                              }}
                              style={{ accentColor: '#2c2c2c' }}
                            />
                            на карте
                          </label>
                        )}
                        <button
                          type="button"
                          className="flex-shrink-0 text-gray-300 transition-colors hover:text-red-400"
                          onClick={(e) => onDeleteTransition(t.id, e)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div>
            <div className="flex flex-col gap-5 p-5">
              <div className="flex flex-col items-center gap-4 pt-4">
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 2,
                    overflow: 'hidden',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(10, 1fr)',
                    gridTemplateRows: 'repeat(6, 1fr)',
                    gap: '0.5px',
                    backgroundColor: '#4a4a4a',
                    opacity: 0.4,
                  }}
                >
                  {Array.from({ length: 60 }, (_, i) => (
                    <div
                      key={i}
                      style={{
                        backgroundColor: [2, 15, 37, 59].includes(i)
                          ? '#d4d4d4'
                          : '#727272',
                      }}
                    />
                  ))}
                </div>
                <p className="text-center text-sm leading-relaxed text-gray-400">
                  Выберите локацию на карте
                  <br />
                  для редактирования
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                  Свойства карты
                </h3>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-gray-400 uppercase">
                      Название
                    </label>
                    <input
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:ring-1 focus:ring-gray-400 focus:outline-none"
                      value={map.name}
                      placeholder="Название карты"
                      onChange={(e) =>
                        setMap((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-gray-400 uppercase">
                      Комментарий
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Описание карты, видно при открытии по ссылке…"
                      className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-300 focus:ring-1 focus:ring-gray-400 focus:outline-none"
                      value={map.comment ?? ''}
                      onChange={(e) =>
                        setMap((prev) => ({ ...prev, comment: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={onAddLocation}
                  className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm text-white transition-opacity hover:opacity-85"
                  style={{ backgroundColor: '#2c2c2c' }}
                >
                  <Plus className="h-4 w-4" />
                  Добавить локацию
                </button>
                <button
                  type="button"
                  onClick={startEmpty}
                  className="w-full rounded-lg border border-gray-300 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-100"
                >
                  Новая пустая
                </button>
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
                    Готовые карты
                  </p>
                  <div className="flex gap-2">
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => cloneReadyMap(preset.id)}
                        className="flex-1 rounded-lg border border-gray-300 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-100"
                      >
                        Копия «{preset.name}»
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleImport()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-100"
                  >
                    <Upload className="h-3.5 w-3.5" /> Импорт
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-100"
                  >
                    <Download className="h-3.5 w-3.5" /> Экспорт
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-100"
                  >
                    <Share2 className="h-3.5 w-3.5" /> Ссылка
                  </button>
                </div>
              </div>

              <p className="-mt-2 text-center text-xs text-gray-300">
                {map.locations.length} локаций на карте · черновик только у вас
              </p>
            </div>
          </div>
        )}
      </div>

      {shareUrl && (
        <ShareModal
          url={shareUrl}
          mapName={map.name}
          locationCount={map.locations.length}
          comment={map.comment}
          onClose={() => setShareUrl(null)}
        />
      )}
    </div>
  );
}

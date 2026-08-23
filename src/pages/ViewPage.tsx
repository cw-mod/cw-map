import { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuthorContacts } from '../components/AuthorContacts';
import { ExportPngButton } from '../components/ExportPngButton';
import { HelpButton } from '../components/HelpButton';
import { LocationPicker } from '../components/LocationPicker';
import { MapCanvas } from '../components/MapCanvas';
import { ShareModal } from '../components/ShareModal';
import { cloneIntoDraft, loadDraft } from '../draft';
import { shortestPath } from '../graph';
import { cloneMap, downloadJson, emptyMap, locationLabel } from '../mapModel';
import {
  DEFAULT_PRESET_ID,
  PRESETS,
  getPreset,
  isPresetId,
} from '../presets';
import {
  decodeMapHash,
  encodeMapHash,
  readShareHash,
  ShareTooLargeError,
  viewUrlWithHash,
} from '../share';
import type { CwMap } from '../types';

type ViewSource = (typeof PRESETS)[number]['id'] | 'share';

export function ViewPage() {
  const navigate = useNavigate();
  const [source, setSource] = useState<ViewSource>(DEFAULT_PRESET_ID);
  const [map, setMap] = useState<CwMap>(() => cloneMap(getPreset().map));
  const [hashError, setHashError] = useState<string | null>(null);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(() => Boolean(loadDraft()));

  useEffect(() => {
    const applyHash = () => {
      const payload = readShareHash(window.location.hash);
      if (!payload) {
        const preset = getPreset();
        setSource(preset.id);
        setMap(cloneMap(preset.map));
        setHashError(null);
        return;
      }
      try {
        const parsed = decodeMapHash(payload);
        setMap(parsed);
        setSource('share');
        setHashError(null);
        setFromId('');
        setToId('');
      } catch {
        const preset = getPreset();
        setHashError(
          'Не удалось прочитать карту из ссылки. Проверьте URL или откройте JSON.',
        );
        setSource(preset.id);
        setMap(cloneMap(preset.map));
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const path = useMemo(() => {
    if (!fromId || !toId) return null;
    return shortestPath(map, fromId, toId);
  }, [map, fromId, toId]);

  const copyToEditor = () => {
    cloneIntoDraft(map);
    setHasDraft(true);
    navigate('/edit');
  };

  const openDraft = () => {
    navigate('/edit');
  };

  const startEmpty = () => {
    cloneIntoDraft(emptyMap());
    setHasDraft(true);
    navigate('/edit');
  };

  const selectPreset = (value: string) => {
    if (!isPresetId(value)) return;
    const preset = getPreset(value);
    setSource(preset.id);
    setMap(cloneMap(preset.map));
    setFromId('');
    setToId('');
    setHashError(null);
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', pathname + search);
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

  const pickerLocations = useMemo(
    () =>
      map.locations.map((l) => ({
        value: l.id,
        label: locationLabel(l, map.locations),
      })),
    [map.locations],
  );

  const pickRouteLocation = (id: string) => {
    if (fromId && id === fromId) {
      setFromId('');
      setToId('');
      return;
    }
    if (!fromId) {
      setFromId(id);
      return;
    }
    setToId(id);
  };

  const fromLoc = map.locations.find((l) => l.id === fromId);
  const toLoc = map.locations.find((l) => l.id === toId);
  const fromLabel = fromLoc ? locationLabel(fromLoc, map.locations) : '';
  const toLabel = toLoc ? locationLabel(toLoc, map.locations) : '';

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="@container flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b border-gray-200 bg-white">
          <div className="flex min-w-0 items-center gap-1 px-3 py-2.5 @[36rem]:gap-2.5 @[36rem]:px-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-gray-800">
                {map.name || 'Без названия'}
              </div>
              <div className="truncate text-[10px] text-gray-400">
                {source === 'share'
                  ? 'Карта по ссылке · только просмотр'
                  : `Канонический пресет «${getPreset(source).name}»`}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 @[36rem]:gap-1">
            {(PRESETS.length > 1 || source === 'share') && (
            <select
              className="max-w-[7.5rem] shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 @[36rem]:max-w-none"
              value={source}
              onChange={(e) => selectPreset(e.target.value)}
              aria-label="Пресет карты"
            >
              {PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
              {source === 'share' && (
                <option value="share">По ссылке</option>
              )}
            </select>
            )}
            <button
              type="button"
              onClick={() => downloadJson(map, `${map.name || 'карта'}.json`)}
              title="Скачать JSON"
              aria-label="Скачать JSON"
              className="flex items-center gap-1 rounded-md p-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 @[36rem]:px-2.5 @[36rem]:py-1.5"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden @[36rem]:inline">JSON</span>
            </button>
            <ExportPngButton map={map} onError={setExportError} />
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
        </div>

        {(hashError || shareError || exportError) && (
          <div className="flex-shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
            {hashError || shareError || exportError}
          </div>
        )}

        <MapCanvas
          map={map}
          readOnly
          pathLocationIds={path?.locationIds ?? []}
          pathEdgeIds={path?.edgeIds ?? []}
          routeFromId={fromId || null}
          routeToId={toId || null}
          onLocationClick={pickRouteLocation}
        />
      </div>

      <div className="flex w-[360px] flex-shrink-0 flex-col overflow-hidden border-l border-gray-300 bg-[#f2f0ed]">
        <div className="flex-shrink-0 border-b border-gray-200 px-5 pt-5 pb-4">
          <h2 className="text-sm font-semibold text-gray-800">Просмотр</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
            Хеш-ссылки только для просмотра. Редактор открывается после «Копия
            себе».
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {map.comment ? (
            <p className="mb-4 rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-gray-600">
              {map.comment}
            </p>
          ) : null}

          <label className="mb-1.5 block text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Маршрут (по числу переходов)
          </label>
          <p className="mb-2 text-[11px] leading-relaxed text-gray-400">
            Можно выбрать локации кликом по карте.
          </p>
          <div className="mb-3 flex flex-col gap-3">
            <LocationPicker
              value={fromId}
              onChange={setFromId}
              locations={pickerLocations}
              noneLabel="Откуда"
            />
            <LocationPicker
              value={toId}
              onChange={setToId}
              locations={pickerLocations}
              noneLabel="Куда"
            />
          </div>

          {!fromId || !toId ? (
            <p className="mb-4 text-xs text-gray-400">
              Выберите две локации — путь считается по направленным рёбрам,
              петли в себя не участвуют.
            </p>
          ) : path && path.hops.length === 0 ? (
            <p className="mb-4 text-xs text-gray-600">
              Вы уже здесь — {fromLabel || 'эта локация'}.
            </p>
          ) : path ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-semibold text-gray-800">
                {path.hops.length}{' '}
                {path.hops.length === 1
                  ? 'переход'
                  : path.hops.length < 5
                    ? 'перехода'
                    : 'переходов'}
              </div>
              <ol className="mt-2 flex flex-col gap-1">
                {path.locationIds.map((id, i) => {
                  const loc = map.locations.find((l) => l.id === id);
                  return (
                    <li key={`${id}-${i}`} className="text-xs text-gray-700">
                      {i + 1}.{' '}
                      {loc ? locationLabel(loc, map.locations) : id}
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
            <p className="mb-4 text-xs text-red-500">
              Пути из «{fromLabel}» в «{toLabel}» нет.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={copyToEditor}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm text-white transition-opacity hover:opacity-85"
              style={{ backgroundColor: '#2c2c2c' }}
            >
              <Pencil className="h-4 w-4" />
              Копия себе
            </button>
            {hasDraft && (
              <button
                type="button"
                onClick={openDraft}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-100"
              >
                Открыть в редакторе
              </button>
            )}
            <button
              type="button"
              onClick={startEmpty}
              className="rounded-lg border border-gray-300 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-100"
            >
              Новая пустая
            </button>
          </div>
        </div>
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

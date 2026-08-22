import { useState } from 'react';
import { ImageDown } from 'lucide-react';
import { downloadMapPng } from '../exportPng';
import type { CwMap } from '../types';

interface ExportPngButtonProps {
  map: CwMap;
  onError?: (message: string) => void;
}

export function ExportPngButton({ map, onError }: ExportPngButtonProps) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await downloadMapPng(map);
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : 'Не удалось сохранить PNG.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      title="Скачать карту PNG"
      aria-label="Скачать карту PNG"
      aria-busy={busy}
      className="flex items-center gap-1 rounded-md p-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-wait disabled:opacity-50 @[36rem]:px-2.5 @[36rem]:py-1.5"
    >
      <ImageDown className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden @[36rem]:inline">{busy ? 'PNG…' : 'PNG'}</span>
    </button>
  );
}

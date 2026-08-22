import { Check, Copy, X } from 'lucide-react';
import { useState } from 'react';

interface ShareModalProps {
  url: string;
  mapName: string;
  locationCount: number;
  comment?: string;
  onClose: () => void;
}

export function ShareModal({
  url,
  mapName,
  locationCount,
  comment,
  onClose,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="mx-4 flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-2xl"
        style={{ width: 480, maxWidth: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">
            Поделиться картой
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl bg-gray-50 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">
              {mapName || 'Без названия'}
            </span>
            <span className="text-xs text-gray-400">
              · {locationCount} локаций
            </span>
          </div>
          {comment ? (
            <p className="text-xs leading-relaxed text-gray-500">{comment}</p>
          ) : null}
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-semibold text-gray-400 uppercase">
            Ссылка на просмотр
          </label>
          <div className="flex gap-2">
            <input
              readOnly
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600"
              value={url}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-white transition-all"
              style={{ backgroundColor: copied ? '#16a34a' : '#2c2c2c' }}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? 'Скопировано!' : 'Копировать'}
            </button>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-gray-400">
          Получатель откроет карту <strong>только для просмотра</strong> — без
          редактора. Чтобы править, ему нужно нажать «Копия себе». Если ссылка
          не влезает в адрес, скачайте JSON.
        </p>
      </div>
    </div>
  );
}

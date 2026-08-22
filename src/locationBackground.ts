import { useEffect, useState, type CSSProperties } from 'react';

export function normalizeBackgroundUrl(value: string | undefined): string {
  return (value ?? '').trim();
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Empty is valid. Non-empty must be http(s). */
export function isBackgroundUrlValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '' || isHttpUrl(trimmed);
}

/** URL to paint on a card, or undefined if none / invalid. */
export function usableBackgroundUrl(
  value: string | undefined,
): string | undefined {
  const trimmed = normalizeBackgroundUrl(value);
  return trimmed && isHttpUrl(trimmed) ? trimmed : undefined;
}

function cssUrl(url: string): string {
  return `url(${JSON.stringify(url)})`;
}

const CARD_FALLBACK = '#4a4a4a';
const IMAGE_DIM = 'rgba(0,0,0,0.42)';

export function locationCardBackground(
  value: string | undefined,
): CSSProperties {
  const url = usableBackgroundUrl(value);
  if (!url) return { backgroundColor: CARD_FALLBACK };
  return {
    backgroundColor: CARD_FALLBACK,
    backgroundImage: `linear-gradient(${IMAGE_DIM}, ${IMAGE_DIM}), ${cssUrl(url)}`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

export function emptyCellFill(hasBackground: boolean): string {
  return hasBackground ? 'rgba(0,0,0,0.22)' : '#727272';
}

/** URLs whose images actually loaded (failed / invalid URLs stay out). */
export function useLoadedBackgrounds(
  values: Iterable<string | undefined>,
): Set<string> {
  const key = [...values]
    .map((value) => usableBackgroundUrl(value) ?? '')
    .filter(Boolean)
    .sort()
    .join('\n');
  const [ready, setReady] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const wanted = key ? key.split('\n') : [];
    if (wanted.length === 0) return;

    let cancelled = false;
    const imgs: HTMLImageElement[] = [];
    for (const url of wanted) {
      const img = new Image();
      imgs.push(img);
      img.onload = () => {
        if (cancelled) return;
        setReady((prev) => {
          if (prev.has(url)) return prev;
          const next = new Set(prev);
          next.add(url);
          return next;
        });
      };
      img.src = url;
    }
    return () => {
      cancelled = true;
      for (const img of imgs) {
        img.onload = null;
        img.onerror = null;
      }
    };
  }, [key]);

  if (!key) return EMPTY_URL_SET;
  const wanted = new Set(key.split('\n'));
  return new Set([...ready].filter((url) => wanted.has(url)));
}

const EMPTY_URL_SET: Set<string> = new Set();

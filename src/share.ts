import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';
import { parseMapJson } from './mapModel';
import type { CwMap } from './types';

/** Conservative limit so the view URL stays pasteable. */
export const MAX_SHARE_HASH_LENGTH = 7000;

export class ShareTooLargeError extends Error {
  constructor() {
    super(
      'Карта слишком большая для ссылки. Скачайте JSON и передайте файл.',
    );
    this.name = 'ShareTooLargeError';
  }
}

export function encodeMapHash(map: CwMap): string {
  const compressed = compressToEncodedURIComponent(JSON.stringify(map));
  if (!compressed) {
    throw new Error('Не удалось сжать карту');
  }
  if (compressed.length > MAX_SHARE_HASH_LENGTH) {
    throw new ShareTooLargeError();
  }
  return compressed;
}

export function decodeMapHash(payload: string): CwMap {
  const json = decompressFromEncodedURIComponent(payload);
  if (!json) {
    throw new Error('Не удалось распаковать карту из ссылки');
  }
  return parseMapJson(JSON.parse(json));
}

export function readShareHash(hash: string): string | null {
  if (!hash.startsWith('#m=')) return null;
  const payload = hash.slice(3);
  return payload.length > 0 ? payload : null;
}

export function viewUrlWithHash(payload: string): string {
  const origin = window.location.origin;
  const path = viewPath();
  return `${origin}${path}#m=${payload}`;
}

export function viewPath(): string {
  const { pathname } = window.location;
  if (pathname.endsWith('/edit') || pathname.endsWith('/edit/')) {
    const trimmed = pathname.replace(/\/edit\/?$/, '/');
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }
  if (pathname.endsWith('/index.html')) {
    return pathname.slice(0, pathname.lastIndexOf('/') + 1);
  }
  if (pathname.endsWith('/')) return pathname;
  return `${pathname.replace(/\/[^/]*$/, '')}/`;
}

export function routerBasename(): string {
  const { pathname } = window.location;
  if (pathname.endsWith('/edit') || pathname.endsWith('/edit/')) {
    const base = pathname.replace(/\/edit\/?$/, '');
    return base || '/';
  }
  if (pathname.endsWith('/index.html')) {
    const dir = pathname.slice(0, pathname.lastIndexOf('/'));
    return dir || '/';
  }
  if (pathname.endsWith('/')) {
    const trimmed = pathname.slice(0, -1);
    return trimmed || '/';
  }
  return pathname || '/';
}

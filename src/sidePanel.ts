import { useCallback, useEffect, useState } from 'react';

const NARROW_QUERY = '(max-width: 639px)';

export function isNarrowViewport(): boolean {
  return window.matchMedia(NARROW_QUERY).matches;
}

function storageKey(id: 'view' | 'edit'): string {
  return `cw-map-sidebar-${id}`;
}

function readPref(id: 'view' | 'edit'): boolean | null {
  const raw = sessionStorage.getItem(storageKey(id));
  if (raw === 'open') return true;
  if (raw === 'closed') return false;
  return null;
}

function writePref(id: 'view' | 'edit', open: boolean): void {
  sessionStorage.setItem(storageKey(id), open ? 'open' : 'closed');
}

export function useSidePanel(id: 'view' | 'edit') {
  const [narrow, setNarrow] = useState(isNarrowViewport);
  const [open, setOpenState] = useState(() => {
    const pref = readPref(id);
    return pref ?? !isNarrowViewport();
  });

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const sync = () => {
      setNarrow(mq.matches);
      if (readPref(id) === null) {
        setOpenState(!mq.matches);
      }
    };
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [id]);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    writePref(id, next);
  }, [id]);

  return { open, setOpen, narrow, overlay: narrow };
}

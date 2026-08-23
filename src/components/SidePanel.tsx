import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

const SWIPE_CLOSE_PX = 56;

interface SidePanelProps {
  open: boolean;
  overlay: boolean;
  onOpenChange: (open: boolean) => void;
  toggleLabel: string;
  children: ReactNode;
}

export function SidePanelHideButton({
  overlay,
  onHide,
}: {
  overlay: boolean;
  onHide: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onHide}
      title={overlay ? 'Закрыть' : 'Свернуть панель'}
      aria-label={overlay ? 'Закрыть' : 'Свернуть панель'}
      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
    >
      {overlay ? <X className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </button>
  );
}

export function SidePanel({
  open,
  overlay,
  onOpenChange,
  toggleLabel,
  children,
}: SidePanelProps) {
  const swipe = useRef<{ x: number; y: number } | null>(null);

  return (
    <>
      {overlay && open ? (
        <div
          className="fixed inset-0 z-20"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
          onClick={() => onOpenChange(false)}
          aria-hidden
        />
      ) : null}
      {!open ? (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          title={toggleLabel}
          aria-label={`Открыть: ${toggleLabel}`}
          className="fixed right-0 z-20 flex items-center gap-1 rounded-l-lg border border-r-0 border-gray-300 bg-[#f2f0ed] px-2 py-2.5 text-xs font-medium text-gray-700 shadow-sm"
          style={{ top: '7.5rem' }}
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
          {toggleLabel}
        </button>
      ) : null}
      {open ? (
        <aside
          className={
            overlay
              ? 'fixed inset-y-0 right-0 z-30 flex h-full min-h-0 w-[min(22.5rem,92vw)] max-w-full flex-col overflow-y-auto border-l border-gray-300 bg-[#f2f0ed] shadow-xl'
              : 'flex h-full max-h-screen min-h-0 w-[360px] flex-shrink-0 flex-col overflow-y-auto border-l border-gray-300 bg-[#f2f0ed]'
          }
          onTouchStart={(event) => {
            if (!overlay) return;
            const touch = event.touches[0];
            if (touch) swipe.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(event) => {
            const start = swipe.current;
            swipe.current = null;
            if (!start || !overlay) return;
            const touch = event.changedTouches[0];
            if (!touch) return;
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (dx > SWIPE_CLOSE_PX && dx > Math.abs(dy)) onOpenChange(false);
          }}
        >
          {children}
        </aside>
      ) : null}
    </>
  );
}

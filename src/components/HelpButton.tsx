import { CircleHelp } from 'lucide-react';
import { useState } from 'react';
import { HelpModal } from './HelpModal';

export function HelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Справка"
        aria-label="Справка"
        className="flex items-center gap-1 rounded-md p-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 @[36rem]:px-2.5 @[36rem]:py-1.5"
      >
        <CircleHelp className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden @[36rem]:inline">Справка</span>
      </button>
      {open && <HelpModal onClose={() => setOpen(false)} />}
    </>
  );
}

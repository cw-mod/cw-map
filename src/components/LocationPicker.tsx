import { useMemo, useState } from 'react';

export interface PickerItem {
  value: string;
  label: string;
}

interface LocationPickerProps {
  value: string;
  onChange: (value: string) => void;
  locations: PickerItem[];
  pinnedTop?: PickerItem[];
  pinnedBottom?: PickerItem[];
  pinnedBottomTitle?: string;
  searchPlaceholder?: string;
  noneLabel?: string;
}

function matchesQuery(label: string, query: string): boolean {
  if (!query) return true;
  return label.toLocaleLowerCase('ru').includes(query);
}

export function LocationPicker({
  value,
  onChange,
  locations,
  pinnedTop = [],
  pinnedBottom = [],
  pinnedBottomTitle,
  searchPlaceholder = 'Найти локацию…',
  noneLabel,
}: LocationPickerProps) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase('ru');

  const filtered = useMemo(
    () => locations.filter((item) => matchesQuery(item.label, normalized)),
    [locations, normalized],
  );

  const selectedLabel = useMemo(() => {
    if (noneLabel && !value) return noneLabel;
    const all = [
      ...pinnedTop,
      ...locations,
      ...pinnedBottom,
    ];
    return all.find((item) => item.value === value)?.label ?? 'Не выбрано';
  }, [noneLabel, value, pinnedTop, locations, pinnedBottom]);

  const pick = (next: string) => {
    onChange(next);
    setQuery('');
  };

  const rowClass = (itemValue: string) =>
    `flex w-full cursor-pointer items-center px-2.5 py-1.5 text-left text-xs transition-colors ${
      itemValue === value
        ? 'bg-gray-800 text-white'
        : 'text-gray-700 hover:bg-gray-100'
    }`;

  return (
    <div>
      <div className="mb-1 truncate text-[11px] text-gray-500">
        Выбрано: <span className="font-medium text-gray-800">{selectedLabel}</span>
      </div>
      <input
        type="search"
        className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs focus:ring-1 focus:ring-gray-400 focus:outline-none"
        placeholder={searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={searchPlaceholder}
      />
      <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white">
        {noneLabel && (
          <button type="button" className={rowClass('')} onClick={() => pick('')}>
            {noneLabel}
          </button>
        )}
        {pinnedTop.map((item) => (
          <button
            type="button"
            key={item.value}
            className={rowClass(item.value)}
            onClick={() => pick(item.value)}
          >
            {item.label}
          </button>
        ))}
        {filtered.length === 0 ? (
          <div className="px-2.5 py-2 text-xs text-gray-400">Ничего не найдено</div>
        ) : (
          filtered.map((item) => (
            <button
              type="button"
              key={item.value}
              className={rowClass(item.value)}
              onClick={() => pick(item.value)}
            >
              {item.label}
            </button>
          ))
        )}
        {pinnedBottom.length > 0 && (
          <>
            {pinnedBottomTitle && (
              <div className="border-t border-gray-100 px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
                {pinnedBottomTitle}
              </div>
            )}
            {pinnedBottom.map((item) => (
              <button
                type="button"
                key={item.value}
                className={rowClass(item.value)}
                onClick={() => pick(item.value)}
              >
                {item.label}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

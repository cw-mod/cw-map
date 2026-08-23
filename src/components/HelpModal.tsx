import { X } from 'lucide-react';
import { useEffect } from 'react';
import { AUTHOR_CW_URL, AUTHOR_TELEGRAM_URL } from './AuthorContacts';

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cw-map-help-title"
        className="mx-4 flex max-h-[min(36rem,calc(100vh-2rem))] w-[480px] max-w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-6 pt-5 pb-3">
          <h3
            id="cw-map-help-title"
            className="text-sm font-semibold text-gray-800"
          >
            Справка
          </h3>
          <button
            type="button"
            onClick={onClose}
            title="Закрыть"
            aria-label="Закрыть"
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6 text-xs leading-relaxed text-gray-600">
          <section>
            <h4 className="mb-1.5 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
              Что это
            </h4>
            <p>
              Здесь карты территорий CatWar. Можно смотреть готовые или
              рисовать свои и делиться ими.
            </p>
          </section>

          <section>
            <h4 className="mb-1.5 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
              Просмотр
            </h4>
            <ul className="list-disc space-y-1 pl-4">
              <li>Сначала открывается карта Эгиды.</li>
              <li>
                Чтобы найти путь, выберите «Откуда» и «Куда» в списке или
                кликните локации на карте. Самый короткий маршрут посчитается
                сам.
              </li>
              <li>
                «Поделиться» даёт ссылку на просмотр. По ней карту нельзя
                править.
              </li>
              <li>«Копия себе» открывает эту карту в редакторе.</li>
              <li>JSON — файл карты. PNG — картинка всей карты.</li>
              <li>Карту можно приближать и двигать.</li>
            </ul>
          </section>

          <section>
            <h4 className="mb-1.5 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
              Редактор
            </h4>
            <ul className="list-disc space-y-1 pl-4">
              <li>Можно начать с пустой карты или скопировать готовую.</li>
              <li>
                У локации можно задать имя, племена, картинку фона, ресурсы и
                действия. Если племя не выбрать, локация нейтральная. Можно
                отметить несколько племён. Локацию можно удалить.
              </li>
              <li>
                Чтобы добавить переход, нажмите клетку на сетке и выберите, куда
                он ведёт. Можно найти локацию по имени, нажать «Выбрать на
                карте» и кликнуть её карточку, или создать новую. Галочка
                «Двусторонний» добавляет обратный переход.
              </li>
              <li>
                В списке «Другое» — выход в себя, лагерь, лазалки, плавательные,
                туннели, запрещённый проход и тупик. Для них не появляется
                новая карточка. Подпись можно показать на карте рядом с клеткой.
              </li>
              <li>
                В редакторе можно потянуть точку на линии перехода, чтобы
                отрегулировать её положение.
              </li>
              <li>
                Готовые карты на сайте не меняются. Правки остаются у вас.
              </li>
            </ul>
          </section>

          <section>
            <h4 className="mb-1.5 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
              Контакты
            </h4>
            <p>
              Написать можно в{' '}
              <a
                href={AUTHOR_CW_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-800 underline underline-offset-2 hover:text-gray-600"
              >
                профиль CW
              </a>
              {' или в '}
              <a
                href={AUTHOR_TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-800 underline underline-offset-2 hover:text-gray-600"
              >
                Telegram
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

import { Cat, Send } from 'lucide-react';

export const AUTHOR_CW_URL = 'https://catwar.su/cat965285';
export const AUTHOR_TELEGRAM_URL = 'https://t.me/polexka';

const linkClass =
  'inline-flex items-center gap-1 rounded-md p-1 text-gray-500 underline-offset-2 transition-colors hover:text-gray-700 hover:underline @[36rem]:px-1.5 @[36rem]:py-0.5';

export function AuthorContacts() {
  return (
    <nav
      aria-label="Контакты автора"
      className="flex min-w-0 items-center gap-0.5 text-[11px] leading-none text-gray-400 @[36rem]:gap-1.5"
    >
      <span className="hidden shrink-0 @[36rem]:inline">
        Вопросы, предложения, помощь:
      </span>
      <a
        href={AUTHOR_CW_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Профиль CW"
        aria-label="Профиль CW"
        className={linkClass}
      >
        <Cat className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden @[36rem]:inline">Профиль CW</span>
      </a>
      <a
        href={AUTHOR_TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Telegram"
        aria-label="Telegram"
        className={linkClass}
      >
        <Send className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden @[36rem]:inline">Telegram</span>
      </a>
    </nav>
  );
}

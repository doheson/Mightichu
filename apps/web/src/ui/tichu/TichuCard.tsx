import { isSpecial, rankOf, suitOf } from '@mightichu/tichu';

const SUIT_SYMBOL: Record<string, string> = { S: '♠', D: '♦', H: '♥', C: '♣' };
/** 다이아·하트는 빨강 — 표준 트럼프 관례. */
const RED_SUITS = new Set(['D', 'H']);
const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
/**
 * 특수카드 그림.
 *
 * 이모지는 플랫폼마다 모양이 달라지고(안드로이드·윈도우에서 어색해진다)
 * 봉황은 아예 해당 이모지가 없어 공작으로 때워야 했다.
 * 그래서 **인라인 SVG** 로 직접 그린다 — 어디서나 같게 보이고 색도 테마에 맞출 수 있다.
 */
const SPECIAL: Record<string, { label: string; art: React.JSX.Element }> = {
  DRAGON: { label: '용', art: <DragonArt /> },
  PHOENIX: { label: '봉황', art: <PhoenixArt /> },
  DOG: { label: '개', art: <DogArt /> },
  SPARROW: { label: '참새', art: <SparrowArt /> },
};

interface Props {
  readonly card: string;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly small?: boolean;
  readonly onClick?: () => void;
}

export function TichuCard({
  card,
  disabled = false,
  selected = false,
  small = false,
  onClick,
}: Props): React.JSX.Element {
  const special = SPECIAL[card];
  const suit = special === undefined ? (suitOf(card) as string) : null;
  const rank = special === undefined ? (rankOf(card) as number) : null;

  const classes = [
    'card',
    'tcard',
    special !== undefined ? 'tcard--special' : RED_SUITS.has(suit as string) ? 'card--red' : '',
    disabled ? 'card--disabled' : '',
    selected ? 'card--selected' : '',
    small ? 'card--small' : '',
    onClick !== undefined && !disabled ? 'card--clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || onClick === undefined}
      onClick={onClick}
      aria-label={special?.label ?? `${suit}${rank}`}
      title={special?.label ?? undefined}
    >
      <span className="card__rank">
        {special !== undefined ? special.art : (RANK_LABEL[rank as number] ?? String(rank))}
      </span>
      <span className="card__suit">
        {special !== undefined ? special.label : SUIT_SYMBOL[suit as string]}
      </span>
    </button>
  );
}

export function isTichuSpecial(card: string): boolean {
  return isSpecial(card);
}

/* ── 특수카드 그림 (인라인 SVG) ───────────────────────────────
 * **채운 실루엣**으로 그린다. 26px 에서는 얇은 선이 뭉개져 네 장이 구분되지 않는다.
 * 이모지 대신 직접 그리는 이유: 플랫폼마다 모양이 달라지고(안드로이드·윈도우에서 어색),
 * 봉황은 아예 해당 이모지가 없어 공작으로 때워야 했다.
 * 구분 포인트 — 용: 뿔과 각진 머리 / 봉황: 솟구치는 꼬리 / 개: 늘어진 귀 / 참새: 통통한 몸집.
 */

function Art({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <svg className="tcard__art" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      {children}
    </svg>
  );
}

function DragonArt(): React.JSX.Element {
  return (
    <Art>
      {/* 각진 머리 + 뿔 두 개 + 굽이치는 몸 */}
      <path d="M5.2 2.4 7.9 6l1.6-.6zM12.9 2.2l-1.1 3.7 1.7.2z" />
      <path d="M9.6 4.8c3 0 5.3 1.9 5.3 4.4 0 1.3-.6 2-.6 2.9 0 1.5 1.9 1.9 3.5 3.1 2 1.5 2.6 4 1.7 5.9l-2-.9c.5-1.1.2-2.4-1-3.3-1.7-1.3-4.2-1.7-4.2-4.8 0-1.3.6-2 .6-2.9 0-1.3-1.4-2.2-3.3-2.2S6.3 7.9 6.3 9.2H4.1c0-2.5 2.4-4.4 5.5-4.4Z" />
      <path d="M13.3 12.9c-2.6.8-4.7 2.4-5.6 4.6-.6 1.4-.5 2.7 0 3.7l-2 1c-.9-1.7-1-3.8-.1-5.7 1.2-2.6 3.6-4.5 6.6-5.5Z" />
      <path d="M15.4 8.1 21.5 6l-3.3 4.2z" />
      <circle cx="8.6" cy="8" r="1.1" />
    </Art>
  );
}

function PhoenixArt(): React.JSX.Element {
  return (
    <Art>
      {/* 몸 + 위로 뻗은 볏 + 아래로 퍼지는 꼬리 세 갈래 */}
      <path d="M12.2 2.2c1.9 1.9 2.6 3.9 2.1 5.9l-2-.6c.3-1.2 0-2.3-1.1-3.6Z" />
      <path d="M12 6.4c2 0 3.5 1.7 3.5 3.9 0 1.5-.7 2.3-.7 3 0 .6.4 1 1 1.5l-1.4 1.7c-1-.8-1.8-1.7-1.8-3.2 0-1.3.7-2 .7-3 0-.9-.5-1.5-1.3-1.5s-1.3.6-1.3 1.5h-2.2c0-2.2 1.5-3.9 3.5-3.9Z" />
      <path d="M11.1 13.2c-2.6 1.6-4.5 4.2-5 7.5l-2.1-.4c.6-4 3-7.2 6.2-9.1ZM12.6 13.9c-.6 2.8-.3 5.1.9 7l-1.8 1.1c-1.5-2.4-1.8-5.3-1.1-8.5ZM14 13.4c2.1 1.3 3.6 3.5 4.3 6.4l-2.1.5c-.5-2.3-1.6-3.9-3.2-4.9Z" />
      <circle cx="11.3" cy="10" r="1" />
    </Art>
  );
}

function DogArt(): React.JSX.Element {
  return (
    <Art>
      {/* 둥근 머리 + 길게 늘어진 귀 */}
      <path d="M6.9 5.9c-1.9.7-2.9 3-2.6 5.6.3 2.4 1.7 4 3.4 4.3l.5-2.2c-.8-.2-1.6-1.1-1.8-2.4-.2-1.6.4-2.8 1.2-3.1ZM17.1 5.9l-.7 2.2c.8.3 1.4 1.5 1.2 3.1-.2 1.3-1 2.2-1.8 2.4l.5 2.2c1.7-.3 3.1-1.9 3.4-4.3.3-2.6-.7-4.9-2.6-5.6Z" />
      <path d="M12 4.6c3.3 0 5.9 2.4 5.9 5.8 0 2.3-.9 3.8-2.2 4.9-.6.5-.8 1-.8 1.7v3.4h-5.8V17c0-.7-.2-1.2-.8-1.7-1.3-1.1-2.2-2.6-2.2-4.9 0-3.4 2.6-5.8 5.9-5.8Z" />
      {/* 눈만 뚫는다. 코까지 뚫으면 작게 봤을 때 해골처럼 읽힌다 */}
      <circle cx="10" cy="10" r="0.8" fill="var(--card-face, #fff)" />
      <circle cx="14" cy="10" r="0.8" fill="var(--card-face, #fff)" />
    </Art>
  );
}

function SparrowArt(): React.JSX.Element {
  return (
    <Art>
      {/* 통통한 몸 + 짧고 뾰족한 꼬리 + 작은 부리 */}
      <path d="M14.8 5.4c3 0 5.2 2 5.2 4.6 0 1.4-.6 2.5-1.6 3.3l-1.4-1.8c.5-.4.8-.9.8-1.5 0-1.3-1.2-2.3-3-2.3-3.2 0-5.7 2.3-5.7 5.2 0 1.9 1.1 3.3 2.8 4.1l-1.3 3.1-2.1-.9 .6-1.4C7 16.7 5.9 14.8 5.9 12.5c0-4.1 3.7-7.1 8.9-7.1Z" />
      <path d="M9.4 12.3 2.6 15.5l6 2.4.8-2.1-2.3-.9 2.9-1.4Z" />
      <path d="M19.3 7.3 23 6.1l-2.9 3z" />
      <circle cx="16.3" cy="8.6" r="1" fill="var(--card-face, #fff)" />
    </Art>
  );
}

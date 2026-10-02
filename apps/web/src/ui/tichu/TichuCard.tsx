import { isSpecial, rankOf, suitOf } from '@mightichu/tichu';

const SUIT_SYMBOL: Record<string, string> = { S: '♠', D: '♦', H: '♥', C: '♣' };
/** 다이아·하트는 빨강 — 표준 트럼프 관례. */
const RED_SUITS = new Set(['D', 'H']);
const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
/**
 * 특수카드는 그림으로 보여준다. 한자는 읽는 데 부담이 있고 한눈에 구분되지도 않는다.
 * 나중에 전용 일러스트로 바꿀 자리 — 지금은 이모지로 둔다.
 */
const SPECIAL: Record<string, { mark: string; label: string }> = {
  DRAGON: { mark: '🐉', label: '용' },
  PHOENIX: { mark: '🦚', label: '봉황' },
  DOG: { mark: '🐕', label: '개' },
  SPARROW: { mark: '🐦', label: '참새' },
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
        {special !== undefined ? special.mark : (RANK_LABEL[rank as number] ?? String(rank))}
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

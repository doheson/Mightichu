import { isSpecial, rankOf, suitOf } from '@mightichu/tichu';

const SUIT_SYMBOL: Record<string, string> = { J: '◆', S: '⚔', P: '⛩', B: '★' };
const SUIT_CLASS: Record<string, string> = { J: 'jade', S: 'sword', P: 'pagoda', B: 'star' };
const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SPECIAL: Record<string, { mark: string; label: string }> = {
  DRAGON: { mark: '龍', label: '용' },
  PHOENIX: { mark: '鳳', label: '봉황' },
  DOG: { mark: '犬', label: '개' },
  SPARROW: { mark: '雀', label: '참새' },
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
    special !== undefined ? 'tcard--special' : `tcard--${SUIT_CLASS[suit as string]}`,
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

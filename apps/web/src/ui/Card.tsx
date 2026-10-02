import { isJoker, rankOf, suitOf } from '@mightichu/mighty';
import type { Card } from '../game/types.js';

const SUIT_SYMBOL: Record<string, string> = { S: '♠', D: '♦', H: '♥', C: '♣' };
const RANK_LABEL: Record<number, string> = { 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function cardText(card: Card): { suit: string; rank: string; red: boolean } {
  if (isJoker(card)) return { suit: '★', rank: 'JK', red: false };
  const suit = suitOf(card) as string;
  const rank = rankOf(card) as number;
  return {
    suit: SUIT_SYMBOL[suit] ?? suit,
    rank: RANK_LABEL[rank] ?? String(rank),
    red: suit === 'D' || suit === 'H',
  };
}

interface CardProps {
  readonly card: Card;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly small?: boolean;
  readonly onClick?: () => void;
}

export function CardView({
  card,
  disabled = false,
  selected = false,
  small = false,
  onClick,
}: CardProps): React.JSX.Element {
  const { suit, rank, red } = cardText(card);
  const classes = [
    'card',
    red ? 'card--red' : '',
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
      aria-label={`${suit}${rank}`}
    >
      <span className="card__rank">{rank}</span>
      <span className="card__suit">{suit}</span>
    </button>
  );
}

export function CardBack({ count }: { readonly count: number }): React.JSX.Element {
  return (
    <span className="card-back" title={`${count}장`}>
      {count}
    </span>
  );
}

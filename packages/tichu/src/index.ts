export type { Rank, Suit } from './cards.js';
export {
  DECK_SIZE,
  DOG,
  DRAGON,
  FIRST_DEAL,
  HAND_SIZE,
  PHOENIX,
  PLAYER_COUNT,
  RANK_ACE,
  SPARROW,
  SPECIALS,
  SUITS,
  SUIT_NAME,
  SUIT_SYMBOL,
  TOTAL_POINTS,
  cardLabel,
  cardPoints,
  countPoints,
  fullDeck,
  isSpecial,
  makeCard,
  rank2Of,
  rankOf,
  sortHand,
  suitOf,
} from './cards.js';

export type { Combo, ComboType } from './combos.js';
export {
  beats,
  bombsIn,
  canFulfillWish,
  enumerateCombos,
  isBomb,
  legalPlays,
  parseCards,
} from './combos.js';

export type { ScoringInput, TichuScoringDetail } from './scoring.js';
export { DOUBLE_WIN, GRAND_TICHU, SMALL_TICHU, computeScore } from './scoring.js';

export type {
  Card,
  CompletedTrick,
  Phase,
  Play,
  RoundOutcome,
  TichuAction,
  TichuCall,
  TichuConfig,
  TichuState,
  TichuView,
} from './types.js';

export { tichuEngine } from './engine.js';

/**
 * 티츄 카드 모델.
 *
 * 카드 식별자는 **구별되는 토큰 문자열**이다. 일반 카드는 `무늬1자 + 끗2자리`,
 * 특수카드는 대문자 단어. 0 패딩은 리댁션 테스트의 문자열 검사에서
 * `J2` ⊂ `J12` 같은 거짓 양성을 막기 위한 것이다(core/README 규약).
 *
 * 무늬 토큰: 옥 `J`(Jade) · 검 `S`(Sword) · 탑 `P`(Pagoda) · 별 `B`(별)
 * 특수카드 이름은 한국어가 정식이다 — 용 / 봉황 / 개 / 참새. (docs/rules-tichu.md)
 */

import type { Card } from './types.js';

export const SUITS = ['J', 'S', 'P', 'B'] as const;
export type Suit = (typeof SUITS)[number];

export const SUIT_NAME: Record<Suit, string> = {
  J: '옥',
  S: '검',
  P: '탑',
  B: '별',
};

/** 2~14. 11=J, 12=Q, 13=K, 14=A */
export type Rank = number;
export const RANK_ACE = 14;

/** 용 — 최강 싱글, +25점. 스트레이트에 넣을 수 없다. */
export const DRAGON: Card = 'DRAGON';
/** 봉황 — −25점. 싱글은 직전보다 0.5 높고, 조합에서는 2~A 와일드. 폭탄 불가. */
export const PHOENIX: Card = 'PHOENIX';
/** 개 — 리드로만 낼 수 있고 리드권을 파트너에게 넘긴다. */
export const DOG: Card = 'DOG';
/** 참새 — 값 1, 최약. 첫 리드를 가지며 소원을 건다. */
export const SPARROW: Card = 'SPARROW';

export const SPECIALS: readonly Card[] = [DRAGON, PHOENIX, DOG, SPARROW];

/**
 * 비교용 끗은 **2배 정수 스케일**이다.
 * 봉황 싱글의 "직전보다 0.5 높음" 을 부동소수점 없이 다루기 위해 —
 * 일반 끗 r 은 2r, 봉황은 홀수값을 갖는다.
 */
export const SCALE = 2;
/** 참새 = 1 */
export const SPARROW_RANK2 = 1 * SCALE;
/** 용은 A(14) 보다 위 */
export const DRAGON_RANK2 = 15 * SCALE;
/** 봉황을 리드로 낼 때는 1½ */
export const PHOENIX_LEAD_RANK2 = 3;

const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SPECIAL_LABEL: Record<string, string> = {
  DRAGON: '용',
  PHOENIX: '봉황',
  DOG: '개',
  SPARROW: '참새',
};

export function makeCard(suit: Suit, rank: Rank): Card {
  return `${suit}${String(rank).padStart(2, '0')}`;
}

export function isSpecial(card: Card): boolean {
  return SPECIALS.includes(card);
}

/** 특수카드는 무늬가 없으므로 null. */
export function suitOf(card: Card): Suit | null {
  if (isSpecial(card)) return null;
  return card.slice(0, 1) as Suit;
}

/** 특수카드는 일반 끗이 없으므로 null. 참새의 1 은 `rank2Of` 로 다룬다. */
export function rankOf(card: Card): Rank | null {
  if (isSpecial(card)) return null;
  return Number.parseInt(card.slice(1), 10);
}

/**
 * 싱글로 냈을 때의 비교값(2배 스케일).
 * 봉황은 문맥에 따라 달라지므로 여기서 다루지 않는다 — `combos.ts` 참고.
 */
export function rank2Of(card: Card): number | null {
  if (card === DRAGON) return DRAGON_RANK2;
  if (card === SPARROW) return SPARROW_RANK2;
  if (card === PHOENIX || card === DOG) return null;
  return (rankOf(card) as Rank) * SCALE;
}

export function cardLabel(card: Card): string {
  const special = SPECIAL_LABEL[card];
  if (special !== undefined) return special;
  const suit = suitOf(card) as Suit;
  const rank = rankOf(card) as Rank;
  return `${SUIT_NAME[suit]}${RANK_LABEL[rank] ?? String(rank)}`;
}

/** 56장 = 4무늬 × 13장 + 특수카드 4장. */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= RANK_ACE; rank++) deck.push(makeCard(suit, rank));
  }
  deck.push(...SPECIALS);
  return deck;
}

export const DECK_SIZE = 56;
export const HAND_SIZE = 14;
/** 첫 배분 — 이만큼 보고 라지 티츄를 선언한다. */
export const FIRST_DEAL = 8;
export const PLAYER_COUNT = 4;
/** 한 라운드 카드 점수 총합. 용 +25 와 봉황 −25 가 상쇄된다. */
export const TOTAL_POINTS = 100;

/** 5=5점, 10·K=10점, 용 +25, 봉황 −25, 그 외 0. */
export function cardPoints(card: Card): number {
  if (card === DRAGON) return 25;
  if (card === PHOENIX) return -25;
  const rank = rankOf(card);
  if (rank === null) return 0;
  if (rank === 5) return 5;
  if (rank === 10 || rank === 13) return 10;
  return 0;
}

export function countPoints(cards: readonly Card[]): number {
  return cards.reduce((sum, card) => sum + cardPoints(card), 0);
}

/** 손패 정렬 — UI 표시 안정화용. */
export function sortHand(hand: readonly Card[]): Card[] {
  const order = (card: Card): number => {
    if (card === SPARROW) return -3;
    if (card === DOG) return -2;
    if (card === PHOENIX) return 1000;
    if (card === DRAGON) return 1001;
    const suitIndex = SUITS.indexOf(suitOf(card) as Suit);
    return (rankOf(card) as Rank) * 10 + suitIndex;
  };
  return hand.slice().sort((a, b) => order(a) - order(b));
}

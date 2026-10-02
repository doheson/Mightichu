/**
 * 마이티 카드 모델.
 *
 * 카드 식별자는 **구별되는 토큰 문자열**이다 (`'S14'`, `'H10'`, `'JK'`).
 * 랭크를 2자리로 0 패딩하는 이유: 리댁션 테스트가 "뷰 JSON 에 남의 카드 토큰이
 * 들어있지 않은지" 문자열로 검사하므로, `'S2'` 가 `'S12'` 의 부분문자열이 되는
 * 류의 거짓 양성을 원천 차단해야 한다. (core/README 규약)
 */

import type { Card } from './types.js';

export const SUITS = ['S', 'D', 'H', 'C'] as const;
export type Suit = (typeof SUITS)[number];

/** 기루다 선택지 — 무늬 4종 + 노기루다. */
export const TRUMP_CHOICES = ['S', 'D', 'H', 'C', 'NT'] as const;
export type Trump = (typeof TRUMP_CHOICES)[number];

/** 2~14. 11=J, 12=Q, 13=K, 14=A */
export type Rank = number;

export const RANK_JACK = 11;
export const RANK_QUEEN = 12;
export const RANK_KING = 13;
export const RANK_ACE = 14;
export const RANK_TEN = 10;

export const JOKER: Card = 'JK';

const SUIT_LABEL: Record<Suit, string> = { S: '♠', D: '♦', H: '♥', C: '♣' };
const RANK_LABEL: Record<number, string> = {
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

export function makeCard(suit: Suit, rank: Rank): Card {
  return `${suit}${String(rank).padStart(2, '0')}`;
}

export function isJoker(card: Card): boolean {
  return card === JOKER;
}

/** 조커는 무늬가 없으므로 null. */
export function suitOf(card: Card): Suit | null {
  if (isJoker(card)) return null;
  return card.slice(0, 1) as Suit;
}

/** 조커는 끗이 없으므로 null. */
export function rankOf(card: Card): Rank | null {
  if (isJoker(card)) return null;
  return Number.parseInt(card.slice(1), 10);
}

/** 사람이 읽는 표기 — 로그·에러 메시지용. */
export function cardLabel(card: Card): string {
  if (isJoker(card)) return '조커';
  const suit = suitOf(card) as Suit;
  const rank = rankOf(card) as Rank;
  return `${SUIT_LABEL[suit]}${RANK_LABEL[rank] ?? String(rank)}`;
}

/** 53장. 조커 포함. */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= RANK_ACE; rank++) {
      deck.push(makeCard(suit, rank));
    }
  }
  deck.push(JOKER);
  return deck;
}

/** 점수카드 = 각 무늬의 10·J·Q·K·A. 장당 1점, 덱 전체에 20장. */
export function isPointCard(card: Card): boolean {
  const rank = rankOf(card);
  return rank !== null && rank >= RANK_TEN;
}

export function countPoints(cards: readonly Card[]): number {
  return cards.reduce((sum, card) => sum + (isPointCard(card) ? 1 : 0), 0);
}

/** 덱 전체 점수카드 수. 보존 불변식의 기준값. */
export const TOTAL_POINTS = 20;

/**
 * 마이티 카드 — 기본 ♠A.
 * 기루다가 스페이드면 ♠A 는 일반 기루다로 강등되고 **♦A** 가 마이티가 된다.
 */
export function mightyCard(trump: Trump): Card {
  return trump === 'S' ? makeCard('D', RANK_ACE) : makeCard('S', RANK_ACE);
}

/**
 * 조커콜(리퍼) 카드 — 기본 ♣3.
 * 기루다가 클럽이면 **♠3**.
 */
export function jokerCallCard(trump: Trump): Card {
  return trump === 'C' ? makeCard('S', 3) : makeCard('C', 3);
}

/** 해당 카드가 기루다 무늬인지. 노기루다면 항상 false. */
export function isTrumpCard(card: Card, trump: Trump): boolean {
  if (trump === 'NT') return false;
  return suitOf(card) === trump;
}

/**
 * 비딜(재딜) 판정용 핸드 가치 — **2배 정수 스케일**.
 * 부동소수점을 피하려고 ½점을 1로 센다. `value2 <= 1` ⟺ "½점 이하".
 *
 * 마이티(♠A) 0 / 조커 −1 / ♠A 외 A·K·Q·J 각 +1 / 10 각 +½ / 그 외 0
 * 이 시점에는 기루다가 미정이므로 마이티는 기본값 ♠A 로 본다.
 */
export function misdealValue2(hand: readonly Card[]): number {
  const defaultMighty = makeCard('S', RANK_ACE);
  let value2 = 0;
  for (const card of hand) {
    if (isJoker(card)) {
      value2 -= 2;
      continue;
    }
    if (card === defaultMighty) continue; // 마이티는 0점
    const rank = rankOf(card) as Rank;
    if (rank >= RANK_JACK) value2 += 2;
    else if (rank === RANK_TEN) value2 += 1;
  }
  return value2;
}

/** 재딜을 요구할 수 있는 핸드인가 (½점 이하). */
export function canDemandMisdeal(hand: readonly Card[]): boolean {
  return misdealValue2(hand) <= 1;
}

/** 손패 정렬 — UI 표시 안정화용. 기루다·마이티 등 강약과는 무관하다. */
export function sortHand(hand: readonly Card[]): Card[] {
  const suitOrder: Record<Suit, number> = { S: 0, D: 1, H: 2, C: 3 };
  return hand.slice().sort((a, b) => {
    if (isJoker(a)) return 1;
    if (isJoker(b)) return -1;
    const sa = suitOrder[suitOf(a) as Suit];
    const sb = suitOrder[suitOf(b) as Suit];
    if (sa !== sb) return sa - sb;
    return (rankOf(b) as Rank) - (rankOf(a) as Rank);
  });
}

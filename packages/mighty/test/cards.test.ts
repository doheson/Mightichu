import { describe, expect, it } from 'vitest';
import {
  JOKER,
  RANK_ACE,
  TOTAL_POINTS,
  canDemandMisdeal,
  countPoints,
  fullDeck,
  isPointCard,
  isTrumpCard,
  jokerCallCard,
  makeCard,
  mightyCard,
  misdealValue2,
  rankOf,
  suitOf,
} from '../src/cards.js';

describe('덱', () => {
  it('조커 포함 53장', () => {
    expect(fullDeck()).toHaveLength(53);
  });

  it('중복이 없다', () => {
    const deck = fullDeck();
    expect(new Set(deck).size).toBe(53);
  });

  it('점수카드가 정확히 20장', () => {
    expect(countPoints(fullDeck())).toBe(TOTAL_POINTS);
  });

  it('점수카드는 10·J·Q·K·A 뿐', () => {
    for (const card of fullDeck()) {
      const rank = rankOf(card);
      expect(isPointCard(card)).toBe(rank !== null && rank >= 10);
    }
  });
});

describe('카드 토큰', () => {
  it('랭크를 2자리로 패딩한다 — 부분문자열 충돌 방지', () => {
    expect(makeCard('S', 2)).toBe('S02');
    expect(makeCard('S', 14)).toBe('S14');
    expect(makeCard('H', 10)).toBe('H10');
  });

  it('어떤 카드도 다른 카드의 부분문자열이 아니다', () => {
    const deck = fullDeck();
    for (const a of deck) {
      for (const b of deck) {
        if (a === b) continue;
        expect(b.includes(a)).toBe(false);
      }
    }
  });

  it('조커는 무늬도 끗도 없다', () => {
    expect(suitOf(JOKER)).toBeNull();
    expect(rankOf(JOKER)).toBeNull();
  });
});

describe('마이티 카드', () => {
  it('기본은 ♠A', () => {
    for (const trump of ['D', 'H', 'C', 'NT'] as const) {
      expect(mightyCard(trump)).toBe(makeCard('S', RANK_ACE));
    }
  });

  it('기루다가 스페이드면 ♦A 가 마이티', () => {
    expect(mightyCard('S')).toBe(makeCard('D', RANK_ACE));
  });

  it('마이티는 결코 기루다 카드가 아니다', () => {
    for (const trump of ['S', 'D', 'H', 'C', 'NT'] as const) {
      expect(isTrumpCard(mightyCard(trump), trump)).toBe(false);
    }
  });
});

describe('조커콜(리퍼)', () => {
  it('기본은 ♣3', () => {
    for (const trump of ['S', 'D', 'H', 'NT'] as const) {
      expect(jokerCallCard(trump)).toBe(makeCard('C', 3));
    }
  });

  it('기루다가 클럽이면 ♠3', () => {
    expect(jokerCallCard('C')).toBe(makeCard('S', 3));
  });
});

describe('비딜 판정 (pagat ½점 공식, 2배 정수 스케일)', () => {
  it('마이티(♠A)는 0점', () => {
    expect(misdealValue2([makeCard('S', RANK_ACE)])).toBe(0);
  });

  it('조커는 −1점 (= −2)', () => {
    expect(misdealValue2([JOKER])).toBe(-2);
  });

  it('♠A 외 A·K·Q·J 는 각 +1점 (= +2)', () => {
    expect(misdealValue2([makeCard('H', RANK_ACE)])).toBe(2);
    expect(misdealValue2([makeCard('C', 13)])).toBe(2);
    expect(misdealValue2([makeCard('D', 12)])).toBe(2);
    expect(misdealValue2([makeCard('S', 11)])).toBe(2);
  });

  it('10 은 각 +½점 (= +1)', () => {
    expect(misdealValue2([makeCard('H', 10)])).toBe(1);
  });

  it('2~9 는 0점', () => {
    expect(misdealValue2([makeCard('H', 2), makeCard('C', 9)])).toBe(0);
  });

  it('½점 이하면 재딜 요구 가능', () => {
    // 10 한 장뿐 = ½점 → 가능
    expect(canDemandMisdeal([makeCard('H', 10)])).toBe(true);
    // 점수카드 없음 = 0점 → 가능
    expect(canDemandMisdeal([makeCard('H', 2), makeCard('C', 7)])).toBe(true);
    // ♠A 만 = 0점 → 가능
    expect(canDemandMisdeal([makeCard('S', RANK_ACE)])).toBe(true);
  });

  it('1점이면 재딜 불가', () => {
    expect(canDemandMisdeal([makeCard('H', RANK_ACE)])).toBe(false);
    expect(canDemandMisdeal([makeCard('H', 10), makeCard('C', 10)])).toBe(false);
  });

  it('조커가 가치를 깎는다 — K 하나 + 조커는 −1점이 되어 재딜 가능', () => {
    expect(misdealValue2([makeCard('H', 13), JOKER])).toBe(0);
    expect(canDemandMisdeal([makeCard('H', 13), JOKER])).toBe(true);
  });
});

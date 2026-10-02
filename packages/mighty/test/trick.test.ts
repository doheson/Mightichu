import { describe, expect, it } from 'vitest';
import { JOKER, makeCard, mightyCard } from '../src/cards.js';
import {
  LAST_TRICK,
  canCallJoker,
  cardStrength,
  isJokerEffective,
  legalPlays,
  resolveLeadSuit,
  trickWinner,
  type LegalPlayContext,
  type TrickContext,
} from '../src/trick.js';
import type { TrickPlay } from '../src/types.js';

const C = makeCard;

/** 기루다 하트, 중간 트릭(조커 유효), 리드 무늬 스페이드. */
const ctx = (over: Partial<TrickContext> = {}): TrickContext => ({
  trump: 'H',
  trickNo: 3,
  leadSuit: 'S',
  jokerCalled: false,
  ...over,
});

describe('조커 효력', () => {
  it('중간 트릭에서는 유효', () => {
    expect(isJokerEffective(ctx({ trickNo: 1 }))).toBe(true);
    expect(isJokerEffective(ctx({ trickNo: 8 }))).toBe(true);
  });

  it('첫 트릭에서는 무효', () => {
    expect(isJokerEffective(ctx({ trickNo: 0 }))).toBe(false);
  });

  it('마지막 트릭에서는 무효', () => {
    expect(isJokerEffective(ctx({ trickNo: LAST_TRICK }))).toBe(false);
  });

  it('조커콜에 걸리면 무효', () => {
    expect(isJokerEffective(ctx({ jokerCalled: true }))).toBe(false);
  });
});

describe('강약 서열', () => {
  it('마이티 > 조커 > 기루다 > 리드 무늬 > 나머지', () => {
    const c = ctx();
    const mighty = cardStrength(mightyCard('H'), c);
    const joker = cardStrength(JOKER, c);
    const trump = cardStrength(C('H', 14), c);
    const lead = cardStrength(C('S', 13), c); // ♠A 는 마이티이므로 ♠K 를 쓴다
    const other = cardStrength(C('C', 14), c);

    expect(mighty).toBeGreaterThan(joker);
    expect(joker).toBeGreaterThan(trump);
    expect(trump).toBeGreaterThan(lead);
    expect(lead).toBeGreaterThan(other);
    expect(other).toBe(0);
  });

  it('기루다끼리는 끗 비교', () => {
    expect(cardStrength(C('H', 14), ctx())).toBeGreaterThan(
      cardStrength(C('H', 13), ctx()),
    );
  });

  it('리드 무늬끼리는 끗 비교', () => {
    expect(cardStrength(C('S', 13), ctx())).toBeGreaterThan(
      cardStrength(C('S', 12), ctx()),
    );
  });

  it('가장 낮은 기루다가 가장 높은 리드 무늬를 이긴다', () => {
    expect(cardStrength(C('H', 2), ctx())).toBeGreaterThan(
      cardStrength(C('S', 13), ctx()),
    );
  });

  it('노기루다에서는 기루다 우대가 없다', () => {
    const c = ctx({ trump: 'NT' });
    expect(cardStrength(C('H', 14), c)).toBe(0); // 리드 무늬(S)가 아니므로 승리 불가
    expect(cardStrength(C('S', 2), c)).toBeGreaterThan(0);
  });

  it('무력화된 조커는 이길 수 없다', () => {
    expect(cardStrength(JOKER, ctx({ trickNo: 0 }))).toBeLessThan(
      cardStrength(C('S', 2), ctx({ trickNo: 0 })),
    );
  });

  it('무력화된 조커도 완전 무가치 카드보다는 앞선다 (리드로 낸 경우 유지)', () => {
    const c = ctx({ trickNo: 0, leadSuit: null });
    expect(cardStrength(JOKER, c)).toBeGreaterThan(cardStrength(C('C', 14), c));
  });
});

describe('함정: 기루다에 따라 ♠A 의 정체가 바뀐다', () => {
  it('기루다가 하트면 ♠A 는 평범한 스페이드가 아니라 마이티다', () => {
    expect(mightyCard('H')).toBe(C('S', 14));
    expect(cardStrength(C('S', 14), ctx())).toBe(1000);
  });

  it('기루다가 스페이드면 ♠A 는 일반 기루다로 강등되고 ♦A 가 마이티다', () => {
    const c = ctx({ trump: 'S', leadSuit: 'S' });
    expect(mightyCard('S')).toBe(C('D', 14));
    expect(cardStrength(C('S', 14), c)).toBe(514);
    expect(cardStrength(C('D', 14), c)).toBe(1000);
  });
});

describe('트릭 승자', () => {
  const play = (player: string, card: string): TrickPlay => ({ player, card });

  it('마이티가 항상 이긴다', () => {
    const trick = [
      play('p1', C('S', 13)),
      play('p2', JOKER),
      play('p3', C('H', 14)),
      play('p4', mightyCard('H')),
      play('p5', C('S', 2)),
    ];
    expect(trickWinner(trick, ctx())).toBe('p4');
  });

  it('마이티가 없으면 유효한 조커가 이긴다', () => {
    const trick = [play('p1', C('S', 13)), play('p2', JOKER), play('p3', C('H', 14))];
    expect(trickWinner(trick, ctx())).toBe('p2');
  });

  it('첫 트릭의 조커는 이기지 못한다', () => {
    const c = ctx({ trickNo: 0 });
    const trick = [play('p1', C('S', 5)), play('p2', JOKER), play('p3', C('S', 7))];
    expect(trickWinner(trick, c)).toBe('p3');
  });

  it('조커콜에 걸린 조커는 이기지 못한다', () => {
    const c = ctx({ jokerCalled: true });
    const trick = [play('p1', C('S', 5)), play('p2', JOKER)];
    expect(trickWinner(trick, c)).toBe('p1');
  });

  it('기루다가 리드 무늬를 이긴다', () => {
    const trick = [play('p1', C('S', 13)), play('p2', C('H', 2))];
    expect(trickWinner(trick, ctx())).toBe('p2');
  });

  it('리드 무늬도 기루다도 아닌 카드는 못 이긴다', () => {
    const trick = [play('p1', C('S', 2)), play('p2', C('C', 14)), play('p3', C('D', 14))];
    expect(trickWinner(trick, ctx())).toBe('p1');
  });

  it('빈 트릭은 null', () => {
    expect(trickWinner([], ctx())).toBeNull();
  });
});

describe('리드 무늬 결정', () => {
  it('일반 카드는 자기 무늬', () => {
    expect(resolveLeadSuit(C('D', 7), null)).toBe('D');
  });

  it('조커 리드는 지정 무늬가 리드 무늬', () => {
    expect(resolveLeadSuit(JOKER, 'C')).toBe('C');
  });
});

describe('합법 제출 카드', () => {
  const playCtx = (over: Partial<LegalPlayContext> = {}): LegalPlayContext => ({
    ...ctx(),
    isLeading: false,
    isFirstTrickLead: false,
    ...over,
  });

  it('리드 무늬를 갖고 있으면 따라야 한다', () => {
    const hand = [C('S', 5), C('S', 9), C('C', 14), C('D', 3)];
    expect(legalPlays(hand, playCtx()).sort()).toEqual([C('S', 5), C('S', 9)].sort());
  });

  it('리드 무늬가 없으면 아무 카드나', () => {
    const hand = [C('C', 14), C('D', 3)];
    expect(legalPlays(hand, playCtx()).sort()).toEqual(hand.slice().sort());
  });

  it('마이티와 조커는 팔로우 의무를 무시하고 낼 수 있다', () => {
    const hand = [C('S', 5), mightyCard('H'), JOKER, C('C', 2)];
    const allowed = legalPlays(hand, playCtx());
    expect(allowed).toContain(C('S', 5));
    expect(allowed).toContain(mightyCard('H'));
    expect(allowed).toContain(JOKER);
    expect(allowed).not.toContain(C('C', 2));
  });

  it('리드 무늬 카드가 마이티 한 장뿐이면 마이티를 반드시 내야 한다', () => {
    // 기루다 하트, 리드 스페이드, 마이티는 ♠A — 스페이드가 마이티뿐
    const hand = [mightyCard('H'), C('C', 2), JOKER];
    expect(legalPlays(hand, playCtx())).toEqual([mightyCard('H')]);
  });

  describe('조커콜 강제', () => {
    it('조커를 내야 한다', () => {
      const hand = [JOKER, C('S', 5), C('C', 2)];
      expect(legalPlays(hand, playCtx({ jokerCalled: true }))).toEqual([JOKER]);
    });

    it('마이티도 함께 쥐었으면 마이티를 내고 조커를 지킬 수 있다', () => {
      const hand = [JOKER, mightyCard('H'), C('C', 2)];
      const allowed = legalPlays(hand, playCtx({ jokerCalled: true }));
      expect(allowed.sort()).toEqual([JOKER, mightyCard('H')].sort());
    });

    it('조커가 없으면 평소 팔로우 규칙 그대로', () => {
      const hand = [C('S', 5), C('C', 2)];
      expect(legalPlays(hand, playCtx({ jokerCalled: true }))).toEqual([C('S', 5)]);
    });
  });

  describe('첫 트릭 리드 제한', () => {
    it('기루다를 리드할 수 없다', () => {
      const hand = [C('H', 14), C('S', 5), C('C', 2)];
      const allowed = legalPlays(hand, playCtx({ isLeading: true, isFirstTrickLead: true }));
      expect(allowed).not.toContain(C('H', 14));
      expect(allowed.sort()).toEqual([C('S', 5), C('C', 2)].sort());
    });

    it('전부 기루다면 기루다 리드가 허용된다', () => {
      const hand = [C('H', 14), C('H', 2)];
      const allowed = legalPlays(hand, playCtx({ isLeading: true, isFirstTrickLead: true }));
      expect(allowed.sort()).toEqual(hand.slice().sort());
    });

    it('마이티는 기루다가 아니므로 첫 트릭에 리드 가능', () => {
      const hand = [mightyCard('H'), C('H', 2)];
      const allowed = legalPlays(hand, playCtx({ isLeading: true, isFirstTrickLead: true }));
      expect(allowed).toContain(mightyCard('H'));
    });

    it('노기루다면 제한이 없다', () => {
      const hand = [C('H', 14), C('S', 5)];
      const allowed = legalPlays(
        hand,
        playCtx({ trump: 'NT', isLeading: true, isFirstTrickLead: true }),
      );
      expect(allowed.sort()).toEqual(hand.slice().sort());
    });

    it('두 번째 트릭부터는 기루다 리드 자유', () => {
      const hand = [C('H', 14), C('S', 5)];
      const allowed = legalPlays(hand, playCtx({ isLeading: true, isFirstTrickLead: false }));
      expect(allowed.sort()).toEqual(hand.slice().sort());
    });
  });
});

describe('조커콜 선언 가능 여부', () => {
  it('조커콜 카드를 첫 트릭이 아닌 트릭에 리드하면 가능', () => {
    expect(canCallJoker(makeCard('C', 3), 'H', 1)).toBe(true);
  });

  it('첫 트릭에서는 불가', () => {
    expect(canCallJoker(makeCard('C', 3), 'H', 0)).toBe(false);
  });

  it('기루다가 클럽이면 ♠3 가 조커콜', () => {
    expect(canCallJoker(makeCard('S', 3), 'C', 1)).toBe(true);
    expect(canCallJoker(makeCard('C', 3), 'C', 1)).toBe(false);
  });

  it('조커콜 카드가 아니면 불가', () => {
    expect(canCallJoker(makeCard('C', 4), 'H', 1)).toBe(false);
  });
});

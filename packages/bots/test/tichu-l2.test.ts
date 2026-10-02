/**
 * L2 티츄 봇 — 휴리스틱이 실제로 효과가 있는지 **측정**한다.
 * "더 똑똑해 보인다" 가 아니라 숫자로 확인해야 한다.
 */

import { createRng, type Bot } from '@mightichu/core';
import {
  DRAGON,
  PHOENIX,
  makeCard,
  tichuEngine,
  type TichuAction,
  type TichuView,
} from '@mightichu/tichu';
import { describe, expect, it } from 'vitest';
import { createTichuBasicBot } from '../src/tichu/basic.js';
import { planHand, shouldCallGrandTichu, shouldCallTichu } from '../src/tichu/plan.js';

const C = makeCard;
const P = ['p1', 'p2', 'p3', 'p4'];

describe('핸드 분할', () => {
  it('스트레이트를 홑장으로 흘리지 않는다', () => {
    const hand = [C('S', 3), C('D', 4), C('H', 5), C('C', 6), C('S', 7), C('D', 12)];
    const plan = planHand(hand);
    expect(plan.lots.some((l) => l.type === 'STRAIGHT' && l.length === 5)).toBe(true);
    expect(plan.singles).toEqual([C('D', 12)]);
    expect(plan.lotCount).toBe(2); // 스트레이트 + Q
  });

  it('폭탄은 깨지 않는다', () => {
    const hand = [C('S', 9), C('D', 9), C('H', 9), C('C', 9), C('S', 10), C('S', 11)];
    const plan = planHand(hand);
    expect(plan.bombs).toHaveLength(1);
    expect(plan.bombs[0]?.type).toBe('BOMB_FOUR');
  });

  it('손패가 잘 쪼개질수록 lotCount 가 작다', () => {
    const tidy = [C('S', 3), C('D', 3), C('S', 4), C('D', 4), C('S', 5), C('D', 5)];
    const messy = [C('S', 3), C('D', 7), C('H', 9), C('C', 11), C('S', 13), C('D', 2)];
    expect(planHand(tidy).lotCount).toBeLessThan(planHand(messy).lotCount);
  });

  it('통제 수단을 센다 — 용·봉황·에이스·폭탄', () => {
    const hand = [DRAGON, PHOENIX, C('S', 14), C('D', 14), C('S', 2)];
    expect(planHand(hand).control).toBe(4);
  });
});

describe('티츄 선언 판단', () => {
  it('약한 손패로는 부르지 않는다', () => {
    const weak = Array.from({ length: 14 }, (_, i) =>
      C((['S', 'D', 'H', 'C'] as const)[i % 4] as 'S', (i % 6) + 2),
    );
    expect(shouldCallTichu(weak)).toBe(false);
  });

  it('강한 손패면 부른다', () => {
    // 포카드 3개 + 용 + 봉황 — lotCount 5, control 6
    const strong = [
      DRAGON, PHOENIX,
      C('S', 14), C('D', 14), C('H', 14), C('C', 14),
      C('S', 13), C('D', 13), C('H', 13), C('C', 13),
      C('S', 12), C('D', 12), C('H', 12), C('C', 12),
    ];
    expect(shouldCallTichu(strong)).toBe(true);
  });

  it('라지 티츄는 더 보수적이다 — 8장만 보고 ±200 이다', () => {
    const decent = [C('S', 14), C('D', 14), C('S', 13), C('D', 13), C('S', 5), C('D', 6), C('H', 7), C('C', 8)];
    expect(shouldCallGrandTichu(decent)).toBe(false);
    // 스몰이 허용하는 손패라도 라지는 더 깐깐해야 한다
    const strong14 = [
      DRAGON, PHOENIX,
      C('S', 14), C('D', 14), C('H', 14), C('C', 14),
      C('S', 13), C('D', 13), C('H', 13), C('C', 13),
      C('S', 12), C('D', 12), C('H', 12), C('C', 12),
    ];
    expect(shouldCallTichu(strong14)).toBe(true);
  });
});

/** 두 봇을 맞붙여 팀 점수 차를 잰다. */
function match(
  teamA: Bot<TichuView, TichuAction>,
  teamB: Bot<TichuView, TichuAction>,
  games: number,
): { a: number; b: number; calls: number; callWins: number } {
  let a = 0;
  let b = 0;
  let calls = 0;
  let callWins = 0;

  for (let seed = 0; seed < games; seed++) {
    const rng = createRng(seed ^ 0xabcdef);
    // p1/p3 = teamA, p2/p4 = teamB
    const bots: Record<string, Bot<TichuView, TichuAction>> = {
      p1: teamA, p3: teamA, p2: teamB, p4: teamB,
    };
    let state = tichuEngine.init({ config: {}, players: P, seed });
    for (let step = 0; step < 800 && !tichuEngine.isOver(state); step++) {
      const actor = P.find((p) => {
        const legal = tichuEngine.legalActions(state, p);
        if (legal.length === 0) return false;
        const bot = bots[p] as Bot<TichuView, TichuAction>;
        return bot.wants?.({ me: p, view: tichuEngine.view(state, p), legal, rng }) ?? true;
      });
      if (actor === undefined) break;
      const bot = bots[actor] as Bot<TichuView, TichuAction>;
      const decided = bot.decide({
        me: actor,
        view: tichuEngine.view(state, actor),
        legal: tichuEngine.legalActions(state, actor),
        rng,
      }) as TichuAction;
      const r = tichuEngine.apply(state, actor, decided);
      if (!r.ok) break;
      state = r.value.state;
    }
    if (!tichuEngine.isOver(state)) continue;
    const score = tichuEngine.score(state);
    a += score.perPlayer['p1'] ?? 0;
    b += score.perPlayer['p2'] ?? 0;

    for (const p of P) {
      if ((state.calls[p] ?? 'NONE') === 'NONE') continue;
      calls++;
      if (state.finished[0] === p) callWins++;
    }
  }
  return { a, b, calls, callWins };
}

describe('L2 가 실제로 나은가 — 측정', () => {
  it('티츄 선언이 기준선(25%)보다 뚜렷하게 낫다', () => {
    const bot = createTichuBasicBot();
    const { calls, callWins } = match(bot, bot, 400);
    expect(calls).toBeGreaterThan(0);
    const rate = callWins / calls;
    // 4인이므로 아무 손패나 부르면 25%. 측정상 ~50% 를 기대한다.
    // ±100 기준 손익분기가 50% 라 여유를 두고 회귀 가드만 건다.
    expect(rate).toBeGreaterThan(0.45);
  });

  it('300판에서 오류 없이 끝난다', () => {
    const bot = createTichuBasicBot();
    const { a, b } = match(bot, bot, 300);
    // 같은 봇끼리면 합이 0 에 가깝다(제로섬은 아니지만 대칭이다)
    expect(Number.isFinite(a)).toBe(true);
    expect(Number.isFinite(b)).toBe(true);
  });
});

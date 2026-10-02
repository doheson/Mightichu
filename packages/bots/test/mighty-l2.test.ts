/** L2 마이티 봇 — 공약이 실제로 달성 가능한 수준인지 **측정**한다. */

import { createRng, type Bot } from '@mightichu/core';
import { mightyEngine, type MightyAction, type MightyView } from '@mightichu/mighty';
import { describe, expect, it } from 'vitest';
import { createMightyBasicBot } from '../src/mighty/basic.js';
import { createRandomBot } from '../src/random.js';

const P = ['p1', 'p2', 'p3', 'p4', 'p5'];

function run(bot: Bot<MightyView, MightyAction>, games: number) {
  let played = 0;
  let declarerWins = 0;
  let totalBid = 0;
  let totalGot = 0;

  for (let seed = 0; seed < games; seed++) {
    const rng = createRng(seed ^ 0x5151);
    let state = mightyEngine.init({ config: {}, players: P, seed });
    for (let step = 0; step < 400 && !mightyEngine.isOver(state); step++) {
      const actor = P.find((p) => {
        const legal = mightyEngine.legalActions(state, p);
        if (legal.length === 0) return false;
        return bot.wants?.({ me: p, view: mightyEngine.view(state, p), legal, rng }) ?? true;
      });
      if (actor === undefined) break;
      const d = bot.decide({
        me: actor, view: mightyEngine.view(state, actor),
        legal: mightyEngine.legalActions(state, actor), rng,
      }) as MightyAction;
      const r = mightyEngine.apply(state, actor, d);
      if (!r.ok) break;
      state = r.value.state;
    }
    if (!mightyEngine.isOver(state)) continue;
    if (state.outcome?.kind !== 'PLAYED') continue;
    played++;
    const detail = mightyEngine.score(state).detail as unknown as {
      won: boolean; declarerPoints: number; contract: { count: number };
    };
    if (detail.won) declarerWins++;
    totalBid += detail.contract.count;
    totalGot += detail.declarerPoints;
  }
  return { played, declarerWins, avgBid: totalBid / played, avgGot: totalGot / played };
}

describe('공약이 현실적인가', () => {
  const l2 = run(createMightyBasicBot(), 400);

  it('여당이 절반 이상 성공한다 — 공약이 허황되지 않다', () => {
    expect(l2.played).toBeGreaterThan(100);
    expect(l2.declarerWins / l2.played).toBeGreaterThan(0.5);
  });

  it('평균 공약과 평균 획득이 거의 같다 — 과대·과소 공약이 아니다', () => {
    // 측정: 평균 공약 14.20 vs 평균 획득 14.00, 중앙값 차이 0
    expect(Math.abs(l2.avgBid - l2.avgGot)).toBeLessThan(1);
  });

  it('랜덤 봇보다 공약 달성률이 높다', () => {
    const random = run(createRandomBot<MightyView, MightyAction>(), 400);
    if (random.played < 50) return;
    expect(l2.declarerWins / l2.played).toBeGreaterThan(
      random.declarerWins / random.played,
    );
  });
});

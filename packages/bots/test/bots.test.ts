import { playWithBots } from '@mightichu/core/testing';
import { mightyEngine, type MightyAction, type MightyView } from '@mightichu/mighty';
import type { Bot, PlayerId } from '@mightichu/core';
import { describe, expect, it } from 'vitest';
import { createMightyBasicBot } from '../src/mighty/basic.js';
import { createRandomBot } from '../src/random.js';

const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;

function allSeats(
  bot: Bot<MightyView, MightyAction>,
): Record<PlayerId, Bot<MightyView, MightyAction>> {
  const map: Record<PlayerId, Bot<MightyView, MightyAction>> = {};
  for (const p of PLAYERS) map[p] = bot;
  return map;
}

function run(bot: Bot<MightyView, MightyAction>, games: number) {
  const contracts: number[] = [];
  const outcomes = { PLAYED: 0, MISDEAL: 0, ALL_PASSED: 0 };
  for (let seed = 0; seed < games; seed++) {
    const { finalState, finished } = playWithBots(
      mightyEngine,
      {},
      PLAYERS,
      seed,
      allSeats(bot),
      500,
    );
    expect(finished).toBe(true);
    const outcome = finalState.outcome;
    if (outcome === null) throw new Error(`시드 ${seed}: 종료되지 않음`);
    if (outcome.kind === 'PLAYED') {
      outcomes.PLAYED++;
      if (finalState.contract !== null) contracts.push(finalState.contract.count);
    } else outcomes[outcome.reason]++;
  }
  return { contracts, outcomes };
}

describe('랜덤 봇 (L1)', () => {
  it('500판을 오류 없이 끝낸다', () => {
    const { outcomes } = run(createRandomBot<MightyView, MightyAction>(), 500);
    expect(outcomes.PLAYED + outcomes.MISDEAL + outcomes.ALL_PASSED).toBe(500);
  });

  it('합법 수만 낸다 — playWithBots 가 위반 시 던진다', () => {
    expect(() => run(createRandomBot<MightyView, MightyAction>(), 100)).not.toThrow();
  });
});

describe('기본 봇 (L1.5)', () => {
  const result = run(createMightyBasicBot(), 500);

  it('500판을 오류 없이 끝낸다', () => {
    expect(result.outcomes.PLAYED + result.outcomes.ALL_PASSED).toBe(500);
  });

  it('재딜을 부르지 않는다 — 게임을 굴리는 쪽을 택한다', () => {
    expect(result.outcomes.MISDEAL).toBe(0);
  });

  it('공약이 20 에 쏠리지 않는다 — 손패를 감안해 부른다', () => {
    if (result.contracts.length === 0) return;
    const maxed = result.contracts.filter((c) => c === 20).length;
    expect(maxed / result.contracts.length).toBeLessThan(0.1);
  });

  it('공약이 최저선(13~16)에 주로 분포한다', () => {
    if (result.contracts.length === 0) return;
    const sane = result.contracts.filter((c) => c >= 13 && c <= 17).length;
    expect(sane / result.contracts.length).toBeGreaterThan(0.7);
  });
});

describe('구조적 치팅 불가', () => {
  it('봇은 View 만 받는다 — BotContext 에 State 가 없다', () => {
    const bot = createMightyBasicBot();
    let seen: unknown = null;
    const spy: Bot<MightyView, MightyAction> = {
      id: 'spy',
      label: 'spy',
      decide(ctx) {
        seen = ctx;
        return bot.decide(ctx);
      },
    };
    playWithBots(mightyEngine, {}, PLAYERS, 1, allSeats(spy), 500);
    expect(seen).not.toBeNull();
    expect(Object.keys(seen as object).sort()).toEqual(['legal', 'me', 'rng', 'view']);
  });
});

describe('팀 패를 밟지 않는다', () => {
  it('티츄: 파트너가 이기고 있으면 넘긴다', async () => {
    const { tichuEngine } = await import('@mightichu/tichu');
    const { createTichuBasicBot } = await import('../src/tichu/basic.js');
    const { createRng } = await import('@mightichu/core');

    const bot = createTichuBasicBot();
    const rng = createRng(1);
    const P = ['p1', 'p2', 'p3', 'p4'];
    const bots: Record<string, typeof bot> = {};
    for (const p of P) bots[p] = bot;

    let overtookPartner = 0;
    let chances = 0;

    for (let seed = 0; seed < 200; seed++) {
      let state = tichuEngine.init({ config: {}, players: P, seed });
      for (let step = 0; step < 600 && !tichuEngine.isOver(state); step++) {
        const actor = P.find((p) => {
          const legal = tichuEngine.legalActions(state, p);
          if (legal.length === 0) return false;
          return bot.wants?.({ me: p, view: tichuEngine.view(state, p), legal, rng }) ?? true;
        });
        if (actor === undefined) break;

        const view = tichuEngine.view(state, actor);
        const last = view.currentTrick[view.currentTrick.length - 1];
        const partnerWinning = last !== undefined && last.player === view.partner;

        const decided = bot.decide({
          me: actor,
          view,
          legal: tichuEngine.legalActions(state, actor),
          rng,
        }) as { type: string };

        if (partnerWinning && view.turn === actor && view.phase === 'PLAY') {
          chances++;
          if (decided.type === 'PLAY') overtookPartner++;
        }

        const r = tichuEngine.apply(state, actor, decided as never);
        if (!r.ok) break;
        state = r.value.state;
      }
    }

    expect(chances).toBeGreaterThan(0);
    expect(overtookPartner).toBe(0);
  });
});

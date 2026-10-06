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
    // 측정: 평균 공약 13.39 vs 평균 획득 13.35
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

describe('판 읽기 — 공개 정보만으로', () => {
  it('팔로우하지 않은 무늬를 보이드로 기록한다', async () => {
    const { knownVoids } = await import('../src/mighty/read.js');
    const view = {
      me: 'p1',
      contract: { trump: 'H', count: 14 },
      jokerNomination: null,
      currentTrick: [],
      trickHistory: [
        {
          trickNo: 0,
          plays: [
            { player: 'p1', card: 'S13' },
            { player: 'p2', card: 'S05' },
            { player: 'p3', card: 'C02' }, // 스페이드 없음
            { player: 'p4', card: 'H03' }, // 스페이드 없음
            { player: 'p5', card: 'S07' },
          ],
          winner: 'p1',
          points: 1,
        },
      ],
    } as unknown as MightyView;

    const voids = knownVoids(view);
    expect([...(voids.get('p3') ?? [])]).toEqual(['S']);
    expect([...(voids.get('p4') ?? [])]).toEqual(['S']);
    expect(voids.get('p2')).toBeUndefined();
  });

  it('마이티·조커는 보이드 근거가 되지 않는다 — 아무 때나 낼 수 있다', async () => {
    const { knownVoids } = await import('../src/mighty/read.js');
    const view = {
      me: 'p1',
      contract: { trump: 'H', count: 14 },
      jokerNomination: null,
      currentTrick: [],
      trickHistory: [
        {
          trickNo: 0,
          plays: [
            { player: 'p1', card: 'S13' },
            { player: 'p2', card: 'S14' }, // 마이티 (기루다 하트 → ♠A)
            { player: 'p3', card: 'JK' },  // 조커
          ],
          winner: 'p2',
          points: 2,
        },
      ],
    } as unknown as MightyView;

    const voids = knownVoids(view);
    expect(voids.get('p2')).toBeUndefined();
    expect(voids.get('p3')).toBeUndefined();
  });
});

describe('프렌드는 주공이 이미 이기는 트릭을 밟지 않는다', () => {
  /**
   * 실제 제보 상황.
   * 주공이 기루다(다이아) A 로 리드했다 — 마이티·조커 말고는 질 수가 없다.
   * 그런데 프렌드가 마이티를 꺼내 날려버렸다.
   *
   * 좌석은 p1..p5 시계방향이므로 **currentTrick 의 마지막 다음 좌석이 차례**다.
   * 프렌드 p2 가 움직이게 하려면 트릭이 p1 까지만 차 있어야 한다.
   */
  function playState(over: {
    readonly declarer: string;
    readonly friend: string;
    readonly leader: string;
    readonly trick: readonly { player: string; card: string }[];
    readonly hands: Record<string, string[]>;
    readonly trump: 'S' | 'D' | 'H' | 'C';
  }): Parameters<typeof mightyEngine.view>[0] {
    const base = mightyEngine.init({ config: {}, players: P, seed: 1 });
    const points: Record<string, number> = {};
    for (const p of P) points[p] = 0;
    return {
      ...base,
      phase: 'PLAY',
      hands: over.hands,
      kitty: [],
      discarded: [],
      misdealEligible: [],
      currentBidder: null,
      passed: [],
      highestBid: { player: over.declarer, bid: { trump: over.trump, count: 15 } },
      declarer: over.declarer,
      contract: { trump: over.trump, count: 15 },
      friendCall: { kind: 'MIGHTY' },
      friend: over.friend,
      friendRevealed: false,
      trickNo: 3,
      leader: over.leader,
      currentTrick: over.trick,
      jokerCalled: false,
      jokerNomination: null,
      points,
      playedCards: over.trick.map((t) => t.card),
      trickHistory: [],
      lastTrick: null,
      outcome: null,
    } as unknown as Parameters<typeof mightyEngine.view>[0];
  }

  function decide(state: Parameters<typeof mightyEngine.view>[0], seat: string) {
    const legal = mightyEngine.legalActions(state, seat);
    expect(legal.length, `${seat} 차례가 아님`).toBeGreaterThan(0);
    return createMightyBasicBot().decide({
      me: seat,
      view: mightyEngine.view(state, seat),
      legal,
      rng: createRng(1),
    }) as { type: string; card?: string };
  }

  it('주공이 기루다 A 로 리드하면 프렌드는 마이티를 내지 않는다', () => {
    const state = playState({
      declarer: 'p1',
      friend: 'p2',
      leader: 'p1',
      trump: 'D',
      trick: [{ player: 'p1', card: 'D14' }], // 기루다 에이스 — 질 수가 없다
      hands: {
        p1: ['D13', 'S02'],
        p2: ['S14', 'C05', 'H03'], // 프렌드 — 마이티(♠A) 보유
        p3: ['C09', 'H07'],
        p4: ['C10', 'H08'],
        p5: ['C11', 'H09'],
      },
    });
    expect(mightyEngine.view(state, 'p2').iAmFriend).toBe(true);
    expect(decide(state, 'p2').card).not.toBe('S14');
  });

  it('주공의 리드 자체가 점수카드여도 밟지 않는다', () => {
    const state = playState({
      declarer: 'p1',
      friend: 'p2',
      leader: 'p1',
      trump: 'D',
      trick: [{ player: 'p1', card: 'D14' }],
      hands: {
        p1: ['D13'],
        p2: ['S14', 'H13'], // 마이티 + 점수카드
        p3: ['C09'],
        p4: ['C10'],
        p5: ['C11'],
      },
    });
    expect(decide(state, 'p2').card).not.toBe('S14');
  });

  it('주공이 야당에게 밀리고 있으면 프렌드가 마이티로 구해준다', () => {
    // 주공 p5 가 리드 → p1(야당)이 K 로 넘어섬 → 프렌드 p2 차례
    const state = playState({
      declarer: 'p5',
      friend: 'p2',
      leader: 'p5',
      trump: 'D',
      trick: [
        { player: 'p5', card: 'C03' },
        { player: 'p1', card: 'C13' }, // 야당이 K 로 이기는 중 (점수카드)
      ],
      hands: {
        p5: ['C04'],
        p1: ['C02'],
        p2: ['S14', 'C06'], // 마이티 보유, 클럽도 있다
        p3: ['C09'],
        p4: ['C10'],
      },
    });
    expect(decide(state, 'p2').card).toBe('S14'); // 이제는 써야 한다
  });
});

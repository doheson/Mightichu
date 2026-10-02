/**
 * 대본(scripted) 시나리오 테스트.
 *
 * 무작위 대국이 닿지 못하거나 확률이 너무 낮은 경로를 명시적으로 덮는다:
 *  - 전원 패스 재딜 (랜덤으로는 사실상 도달 불가 — 비드 40종 vs 패스 1종)
 *  - 재딜 요구/거절 흐름
 *  - 주공이 버린 점수카드가 여당 점수에 포함되는지 (속성 테스트로는 안 잡힘)
 *  - 조커콜 강제, 숨은 노프렌드
 */

import { unwrap, type PlayerId } from '@mightichu/core';
import { describe, expect, it } from 'vitest';
import { JOKER, countPoints, isPointCard, makeCard, mightyCard } from '../src/cards.js';
import { mightyEngine } from '../src/engine.js';
import type { MightyAction, MightyState } from '../src/types.js';

const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;
const CONFIG = {};

function init(seed: number): MightyState {
  return mightyEngine.init({ config: CONFIG, players: PLAYERS, seed });
}

/** 액션을 차례로 적용. 실패하면 어디서 깨졌는지 담아 던진다. */
function drive(
  state: MightyState,
  steps: readonly (readonly [PlayerId, MightyAction])[],
): MightyState {
  let current = state;
  steps.forEach(([player, action], i) => {
    const result = mightyEngine.apply(current, player, action);
    if (!result.ok) {
      throw new Error(
        `step ${i} (${player} / ${action.type}) 실패: ${result.error.code} ${result.error.message}`,
      );
    }
    current = result.value.state;
  });
  return current;
}

/** 조건을 만족하는 첫 시드를 찾는다. 대본 테스트의 출발 상태 확보용. */
function findSeed(predicate: (s: MightyState) => boolean, limit = 5000): number {
  for (let seed = 0; seed < limit; seed++) {
    if (predicate(init(seed))) return seed;
  }
  throw new Error('조건을 만족하는 시드를 찾지 못함');
}

describe('재딜 경로', () => {
  it('전원 패스하면 재딜로 끝난다', () => {
    const seed = findSeed((s) => s.phase === 'BIDDING');
    let state = init(seed);
    // 비딩 순서대로 5명 모두 패스
    for (let i = 0; i < PLAYERS.length; i++) {
      const bidder = state.currentBidder;
      expect(bidder).not.toBeNull();
      state = drive(state, [[bidder as PlayerId, { type: 'PASS' }]]);
    }
    expect(state.phase).toBe('DONE');
    expect(state.outcome).toEqual({ kind: 'REDEAL', reason: 'ALL_PASSED' });

    const score = mightyEngine.score(state);
    for (const p of PLAYERS) expect(score.perPlayer[p]).toBe(0);
  });

  it('재딜을 요구하면 즉시 재딜로 끝난다', () => {
    const seed = findSeed((s) => s.phase === 'MISDEAL');
    const state = init(seed);
    const claimant = state.misdealEligible[0] as PlayerId;
    const after = drive(state, [[claimant, { type: 'DEMAND_MISDEAL' }]]);
    expect(after.outcome).toEqual({ kind: 'REDEAL', reason: 'MISDEAL' });
  });

  it('자격자 전원이 거절하면 비딩으로 넘어간다', () => {
    const seed = findSeed((s) => s.phase === 'MISDEAL');
    let state = init(seed);
    for (const claimant of state.misdealEligible) {
      state = drive(state, [[claimant, { type: 'DECLINE_MISDEAL' }]]);
    }
    expect(state.phase).toBe('BIDDING');
    expect(state.misdealEligible).toHaveLength(0);
  });

  it('자격 없는 플레이어는 재딜을 요구할 수 없다', () => {
    const seed = findSeed(
      (s) => s.phase === 'MISDEAL' && s.misdealEligible.length < PLAYERS.length,
    );
    const state = init(seed);
    const outsider = PLAYERS.find((p) => !state.misdealEligible.includes(p)) as PlayerId;
    const result = mightyEngine.apply(state, outsider, { type: 'DEMAND_MISDEAL' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_ELIGIBLE');
  });
});

describe('비딩 → 바닥 → 프렌드 흐름', () => {
  /** 한 명이 비드하고 나머지가 패스해 KITTY 단계까지 간 상태. */
  function toKitty(): { state: MightyState; declarer: PlayerId } {
    const seed = findSeed((s) => s.phase === 'BIDDING');
    let state = init(seed);
    const declarer = state.currentBidder as PlayerId;
    state = drive(state, [[declarer, { type: 'BID', bid: { trump: 'H', count: 15 } }]]);
    while (state.phase === 'BIDDING') {
      const bidder = state.currentBidder as PlayerId;
      state = drive(state, [[bidder, { type: 'PASS' }]]);
    }
    return { state, declarer };
  }

  it('낙찰되면 주공이 바닥 3장을 받아 13장이 된다', () => {
    const { state, declarer } = toKitty();
    expect(state.phase).toBe('KITTY');
    expect(state.declarer).toBe(declarer);
    expect(state.contract).toEqual({ trump: 'H', count: 15 });
    expect(state.hands[declarer]).toHaveLength(13);
    expect(state.kitty).toHaveLength(0);
  });

  it('주공만 바닥을 처리할 수 있다', () => {
    const { state, declarer } = toKitty();
    const other = PLAYERS.find((p) => p !== declarer) as PlayerId;
    const cards = (state.hands[other] ?? []).slice(0, 3);
    const result = mightyEngine.apply(state, other, { type: 'DISCARD', cards });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_DECLARER');
  });

  it('기루다 변경은 요구 공약을 못 채우면 거부된다', () => {
    const { state, declarer } = toKitty(); // 하트 15
    const tooLow = mightyEngine.apply(state, declarer, {
      type: 'DISCARD',
      cards: [],
      changeTo: { trump: 'S', count: 16 }, // 무늬 변경은 +2 → 17 필요
    });
    expect(tooLow.ok).toBe(false);
    if (!tooLow.ok) expect(tooLow.error.code).toBe('BID_TOO_LOW');

    const okChange = mightyEngine.apply(state, declarer, {
      type: 'DISCARD',
      cards: [],
      changeTo: { trump: 'S', count: 17 },
    });
    expect(okChange.ok).toBe(true);
    if (okChange.ok) expect(okChange.value.state.contract).toEqual({ trump: 'S', count: 17 });
  });

  it('무늬 → 노기루다는 +1 로 충분하다', () => {
    const { state, declarer } = toKitty(); // 하트 15
    const result = mightyEngine.apply(state, declarer, {
      type: 'DISCARD',
      cards: [],
      changeTo: { trump: 'NT', count: 16 },
    });
    expect(result.ok).toBe(true);
  });

  it('3장을 버려야 하고, 버리면 프렌드 지정 단계로 간다', () => {
    const { state, declarer } = toKitty();
    const hand = state.hands[declarer] ?? [];

    const twoCards = mightyEngine.apply(state, declarer, {
      type: 'DISCARD',
      cards: hand.slice(0, 2),
    });
    expect(twoCards.ok).toBe(false);
    if (!twoCards.ok) expect(twoCards.error.code).toBe('BAD_DISCARD');

    const after = drive(state, [
      [declarer, { type: 'DISCARD', cards: hand.slice(0, 3) }],
    ]);
    expect(after.phase).toBe('FRIEND');
    expect(after.hands[declarer]).toHaveLength(10);
    expect(after.discarded).toHaveLength(3);
  });

  it('손에 없는 카드는 버릴 수 없다', () => {
    const { state, declarer } = toKitty();
    const notMine = PLAYERS.filter((p) => p !== declarer)
      .flatMap((p) => state.hands[p] ?? [])
      .slice(0, 3);
    const result = mightyEngine.apply(state, declarer, {
      type: 'DISCARD',
      cards: notMine,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CARD_NOT_IN_HAND');
  });
});

describe('프렌드 지정', () => {
  /** FRIEND 단계까지 진행. */
  function toFriend(): { state: MightyState; declarer: PlayerId } {
    const seed = findSeed((s) => s.phase === 'BIDDING');
    let state = init(seed);
    const declarer = state.currentBidder as PlayerId;
    state = drive(state, [[declarer, { type: 'BID', bid: { trump: 'H', count: 15 } }]]);
    while (state.phase === 'BIDDING') {
      state = drive(state, [[state.currentBidder as PlayerId, { type: 'PASS' }]]);
    }
    const hand = state.hands[declarer] ?? [];
    state = drive(state, [[declarer, { type: 'DISCARD', cards: hand.slice(0, 3) }]]);
    return { state, declarer };
  }

  it('카드 콜 — 보유자가 프렌드가 되지만 공개되지 않는다', () => {
    const { state, declarer } = toFriend();
    const other = PLAYERS.find((p) => p !== declarer) as PlayerId;
    const target = (state.hands[other] ?? [])[0] as string;

    const after = drive(state, [
      [declarer, { type: 'CALL_FRIEND', call: { kind: 'CARD', card: target } }],
    ]);
    expect(after.friend).toBe(other);
    expect(after.friendRevealed).toBe(false);
    // 뷰에는 아직 안 드러난다
    for (const viewer of PLAYERS) {
      expect(mightyEngine.view(after, viewer).friend).toBeNull();
    }
    expect(mightyEngine.view(after, other).iAmFriend).toBe(true);
    expect(mightyEngine.view(after, declarer).iAmFriend).toBe(false);
  });

  it('지명 카드가 주공 손에 있으면 숨은 노프렌드가 된다', () => {
    const { state, declarer } = toFriend();
    const own = (state.hands[declarer] ?? [])[0] as string;
    const after = drive(state, [
      [declarer, { type: 'CALL_FRIEND', call: { kind: 'CARD', card: own } }],
    ]);
    expect(after.friend).toBeNull();
    expect(after.phase).toBe('PLAY');
  });

  it('노프렌드를 선언하면 즉시 공개된다', () => {
    const { state, declarer } = toFriend();
    const after = drive(state, [
      [declarer, { type: 'CALL_FRIEND', call: { kind: 'NONE' } }],
    ]);
    expect(after.friend).toBeNull();
    expect(after.friendRevealed).toBe(true);
  });

  it('주공이 첫 트릭을 리드한다', () => {
    const { state, declarer } = toFriend();
    const after = drive(state, [
      [declarer, { type: 'CALL_FRIEND', call: { kind: 'NONE' } }],
    ]);
    expect(after.leader).toBe(declarer);
    expect(after.trickNo).toBe(0);
  });
});

describe('주공이 버린 점수카드는 여당 몫이다', () => {
  it('버린 패의 점수가 여당 집계에 포함된다', () => {
    // 버린 3장에 점수카드가 들어가도록 시드를 고른다.
    const seed = findSeed((s) => s.phase === 'BIDDING');
    let state = init(seed);
    const declarer = state.currentBidder as PlayerId;
    state = drive(state, [[declarer, { type: 'BID', bid: { trump: 'H', count: 13 } }]]);
    while (state.phase === 'BIDDING') {
      state = drive(state, [[state.currentBidder as PlayerId, { type: 'PASS' }]]);
    }
    // 점수카드를 우선 골라 버린다
    const hand = state.hands[declarer] ?? [];
    const pointCards = hand.filter(isPointCard).slice(0, 3);
    const filler = hand.filter((c) => !pointCards.includes(c));
    const toDiscard = [...pointCards, ...filler].slice(0, 3);
    expect(countPoints(toDiscard)).toBeGreaterThan(0);

    state = drive(state, [
      [declarer, { type: 'DISCARD', cards: toDiscard }],
      [declarer, { type: 'CALL_FRIEND', call: { kind: 'NONE' } }],
    ]);

    // 끝까지 아무렇게나 진행
    while (!mightyEngine.isOver(state)) {
      const actor = PLAYERS.find(
        (p) => mightyEngine.legalActions(state, p).length > 0,
      ) as PlayerId;
      const action = mightyEngine.legalActions(state, actor)[0] as MightyAction;
      state = unwrap(mightyEngine.apply(state, actor, action)).state;
    }

    const trickPoints = PLAYERS.reduce((n, p) => n + (state.points[p] ?? 0), 0);
    const discardPoints = countPoints(state.discarded);
    expect(trickPoints + discardPoints).toBe(20);

    const detail = mightyEngine.score(state).detail as unknown as {
      declarerPoints: number;
    };
    // 주공 획득 트릭 점수 + 버린 점수
    expect(detail.declarerPoints).toBe((state.points[declarer] ?? 0) + discardPoints);
    expect(discardPoints).toBeGreaterThan(0);
  });
});

describe('조커콜 강제 — 실제 플레이 상태에서', () => {
  /** PLAY 단계 상태를 직접 구성한다. 특정 상황을 재현하려면 이게 가장 확실하다. */
  function playState(hands: Record<PlayerId, string[]>, trickNo: number): MightyState {
    const base = init(1);
    const points: Record<PlayerId, number> = {};
    for (const p of PLAYERS) points[p] = 0;
    return {
      ...base,
      phase: 'PLAY',
      hands,
      kitty: [],
      discarded: [],
      misdealEligible: [],
      currentBidder: null,
      passed: [],
      highestBid: { player: 'p1', bid: { trump: 'H', count: 15 } },
      declarer: 'p1',
      contract: { trump: 'H', count: 15 },
      friendCall: { kind: 'NONE' },
      friend: null,
      friendRevealed: true,
      trickNo,
      leader: 'p1',
      currentTrick: [],
      jokerCalled: false,
      jokerNomination: null,
      points,
      outcome: null,
    };
  }

  it('조커콜이 리드되면 조커 보유자는 조커를 내야 한다', () => {
    const jokerCall = makeCard('C', 3); // 기루다 하트 → ♣3
    const state = playState(
      {
        p1: [jokerCall, makeCard('S', 5)],
        p2: [JOKER, makeCard('C', 9)],
        p3: [makeCard('C', 7), makeCard('S', 6)],
        p4: [makeCard('C', 8), makeCard('S', 7)],
        p5: [makeCard('C', 10), makeCard('S', 8)],
      },
      3,
    );

    const led = drive(state, [
      ['p1', { type: 'PLAY_CARD', card: jokerCall, callJoker: true }],
    ]);
    expect(led.jokerCalled).toBe(true);

    const legal = mightyEngine.legalActions(led, 'p2');
    expect(legal).toEqual([{ type: 'PLAY_CARD', card: JOKER }]);
  });

  it('마이티도 함께 쥐었으면 마이티를 내고 조커를 지킬 수 있다', () => {
    const jokerCall = makeCard('C', 3);
    const mighty = mightyCard('H'); // ♠A
    const state = playState(
      {
        p1: [jokerCall, makeCard('S', 5)],
        p2: [JOKER, mighty],
        p3: [makeCard('C', 7), makeCard('S', 6)],
        p4: [makeCard('C', 8), makeCard('S', 7)],
        p5: [makeCard('C', 10), makeCard('S', 8)],
      },
      3,
    );
    const led = drive(state, [
      ['p1', { type: 'PLAY_CARD', card: jokerCall, callJoker: true }],
    ]);
    const cards = mightyEngine
      .legalActions(led, 'p2')
      .map((a) => (a.type === 'PLAY_CARD' ? a.card : ''));
    expect(cards.sort()).toEqual([JOKER, mighty].sort());
  });

  it('첫 트릭에서는 조커콜을 할 수 없다', () => {
    const jokerCall = makeCard('C', 3);
    const state = playState(
      {
        p1: [jokerCall, makeCard('S', 5)],
        p2: [JOKER, makeCard('C', 9)],
        p3: [makeCard('C', 7), makeCard('S', 6)],
        p4: [makeCard('C', 8), makeCard('S', 7)],
        p5: [makeCard('C', 10), makeCard('S', 8)],
      },
      0,
    );
    const result = mightyEngine.apply(state, 'p1', {
      type: 'PLAY_CARD',
      card: jokerCall,
      callJoker: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CANNOT_CALL_JOKER');
  });

  it('조커를 리드할 때는 무늬를 지정해야 한다', () => {
    const state = playState(
      {
        p1: [JOKER, makeCard('S', 5)],
        p2: [makeCard('C', 9), makeCard('D', 9)],
        p3: [makeCard('C', 7), makeCard('S', 6)],
        p4: [makeCard('C', 8), makeCard('S', 7)],
        p5: [makeCard('C', 10), makeCard('S', 8)],
      },
      3,
    );
    const noNomination = mightyEngine.apply(state, 'p1', {
      type: 'PLAY_CARD',
      card: JOKER,
    });
    expect(noNomination.ok).toBe(false);
    if (!noNomination.ok) expect(noNomination.error.code).toBe('NOMINATION_REQUIRED');

    const withNomination = drive(state, [
      ['p1', { type: 'PLAY_CARD', card: JOKER, nominate: 'C' }],
    ]);
    expect(withNomination.jokerNomination).toBe('C');
    // 지정한 클럽을 따라야 한다
    const legal = mightyEngine
      .legalActions(withNomination, 'p2')
      .map((a) => (a.type === 'PLAY_CARD' ? a.card : ''));
    expect(legal).toEqual([makeCard('C', 9)]);
  });
});

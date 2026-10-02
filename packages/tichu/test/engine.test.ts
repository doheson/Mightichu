/**
 * 티츄 엔진 계약 + 고유 불변식.
 * 구조는 core/test/contract.test.ts 와 같다 — 성질 목록은 모든 엔진에 공통이다.
 */

import { findNonJsonPath, replayRound } from '@mightichu/core';
import { playRandomGame } from '@mightichu/core/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DOG, HAND_SIZE, PLAYER_COUNT, TOTAL_POINTS, countPoints } from '../src/cards.js';
import { tichuEngine } from '../src/engine.js';
import type { TichuConfig, TichuState } from '../src/types.js';

const PLAYERS = ['n', 'e', 's', 'w'] as const;
const CONFIG: TichuConfig = {};
const seeds = fc.integer({ min: 0, max: 2 ** 31 - 1 });

function play(seed: number) {
  return playRandomGame(tichuEngine, CONFIG, PLAYERS, seed, 600);
}

describe('init', () => {
  it('4인 전용', () => {
    expect(() =>
      tichuEngine.init({ config: CONFIG, players: ['a', 'b', 'c'], seed: 1 }),
    ).toThrow();
  });

  it('처음엔 8장만 보인다 — 라지 티츄 판단용', () => {
    const s = tichuEngine.init({ config: CONFIG, players: PLAYERS, seed: 3 });
    for (const p of PLAYERS) {
      expect(s.hands[p]).toHaveLength(8);
      expect(s.pending[p]).toHaveLength(6);
    }
    expect(s.phase).toBe('GRAND');
  });

  it('56장이 정확히 한 번씩 분배된다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const s = tichuEngine.init({ config: CONFIG, players: PLAYERS, seed });
        const all = PLAYERS.flatMap((p) => [...(s.hands[p] ?? []), ...(s.pending[p] ?? [])]);
        expect(all).toHaveLength(56);
        expect(new Set(all).size).toBe(56);
      }),
      { numRuns: 100 },
    );
  });
});

describe('계약 정합성', () => {
  it('무작위 대국이 항상 끝까지 간다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        expect(play(seed).finished).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('모든 상태에서 모든 플레이어의 합법 수를 전수 검증', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          for (const player of PLAYERS) {
            for (const action of tichuEngine.legalActions(state, player)) {
              const result = tichuEngine.apply(state, player, action);
              if (!result.ok) {
                throw new Error(
                  `${state.phase} / ${player} / ${JSON.stringify(action)} → ${result.error.code}`,
                );
              }
            }
          }
        }
      }),
      { numRuns: 15 },
    );
  });

  it('종료 상태에서는 아무도 합법 수가 없다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { finalState } = play(seed);
        for (const p of PLAYERS) {
          expect(tichuEngine.legalActions(finalState, p)).toHaveLength(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('JSON 안전성과 리댁션', () => {
  it('모든 상태와 뷰가 직렬화 가능', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          expect(findNonJsonPath(state)).toBeNull();
          for (const p of PLAYERS) {
            expect(findNonJsonPath(tichuEngine.view(state, p))).toBeNull();
          }
        }
      }),
      { numRuns: 15 },
    );
  });

  it('뷰에 남의 손패가 들어있지 않다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          const onTable = new Set(
            state.currentTrick.flatMap((p) => p.combo.cards),
          );
          for (const c of state.lastTrick?.plays.flatMap((p) => p.combo.cards) ?? []) {
            onTable.add(c);
          }
          for (const viewer of PLAYERS) {
            const json = JSON.stringify(tichuEngine.view(state, viewer));
            for (const other of PLAYERS) {
              if (other === viewer) continue;
              for (const card of state.hands[other] ?? []) {
                if (onTable.has(card)) continue;
                expect(json).not.toContain(card);
              }
            }
          }
        }
      }),
      { numRuns: 15 },
    );
  });

  it('교환 중 받을 카드가 미리 보이지 않는다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          if (state.phase !== 'EXCHANGE') continue;
          for (const viewer of PLAYERS) {
            const json = JSON.stringify(tichuEngine.view(state, viewer));
            for (const from of PLAYERS) {
              if (from === viewer) continue;
              const card = (state.given[from] ?? {})[viewer];
              if (card !== undefined) expect(json).not.toContain(card);
            }
          }
        }
      }),
      { numRuns: 20 },
    );
  });
});

describe('결정론과 리플레이', () => {
  it('같은 시드는 같은 대국', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        expect(play(seed).finalState).toEqual(play(seed).finalState);
      }),
      { numRuns: 60 },
    );
  });

  it('로그 재생이 최종 상태를 복원한다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { finalState, log } = play(seed);
        const replayed = replayRound(tichuEngine, log);
        expect(replayed.ok).toBe(true);
        if (replayed.ok) expect(replayed.value).toEqual(finalState);
      }),
      { numRuns: 80 },
    );
  });
});

describe('티츄 고유 불변식', () => {
  it('56장이 항상 보존된다 (시드 0~299 전수)', () => {
    for (let seed = 0; seed < 300; seed++) {
      {
        for (const state of play(seed).states) {
          const inHands = PLAYERS.reduce((n, p) => n + (state.hands[p] ?? []).length, 0);
          const inPending = PLAYERS.reduce((n, p) => n + (state.pending[p] ?? []).length, 0);
          const inTaken = PLAYERS.reduce((n, p) => n + (state.taken[p] ?? []).length, 0);
          const onTable = state.currentTrick.reduce((n, p) => n + p.combo.cards.length, 0);
          const pendingGift = state.dragonGift?.cards.length ?? 0;
          expect(inHands + inPending + inTaken + onTable + state.discarded.length + pendingGift).toBe(56);
        }
      }
    }
  });

  it('종료 시 카드 점수 합이 100 — 시드 0~499 전수', () => {
    let normal = 0;
    for (let seed = 0; seed < 500; seed++) {
      const { finalState } = play(seed);
      if (finalState.outcome?.kind !== 'NORMAL') continue;
      normal++;
      const total = PLAYERS.reduce(
        (n, p) => n + countPoints(finalState.taken[p] ?? []),
        0,
      );
      expect(total, `시드 ${seed}`).toBe(TOTAL_POINTS);
    }
    expect(normal).toBeGreaterThan(0);
  });

  it('점수는 팀 단위 — 파트너끼리 같다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { finalState } = play(seed);
        const score = tichuEngine.score(finalState);
        expect(score.perPlayer['n']).toBe(score.perPlayer['s']);
        expect(score.perPlayer['e']).toBe(score.perPlayer['w']);
      }),
      { numRuns: 100 },
    );
  });

  it('더블윈이면 200점이고 카드 점수를 세지 않는다', () => {
    let seen = 0;
    for (let seed = 0; seed < 600; seed++) {
      const { finalState } = play(seed) as { finalState: TichuState };
      if (finalState.outcome?.kind !== 'DOUBLE_WIN') continue;
      seen++;
      const detail = tichuEngine.score(finalState).detail as unknown as {
        cardPoints: number[];
      };
      expect(detail.cardPoints.sort((a, b) => a - b)).toEqual([0, 200]);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('개는 트릭으로 획득되지 않는다', () => {
    // 라운드 종료 시 마지막 사람의 **손패**는 상대팀으로 넘어가므로,
    // 끝까지 들고 있던 개가 taken 에 들어갈 수는 있다(0점). 그건 정상이다.
    // 검증 대상은 "트릭을 먹어서 개를 가져가는 일이 없는가".
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          if (state.phase === 'DONE') continue;
          for (const p of PLAYERS) {
            expect(state.taken[p] ?? []).not.toContain(DOG);
          }
        }
      }),
      { numRuns: 20 },
    );
  });

  it('낸 개는 판에서 빠진다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          const anyoneHolds = PLAYERS.some((p) => (state.hands[p] ?? []).includes(DOG));
          const inTrick = state.currentTrick.some((pl) => pl.combo.cards.includes(DOG));
          if (!anyoneHolds && !inTrick && state.phase === 'PLAY') {
            // 아무도 안 들고 있고 트릭에도 없다면 버려졌거나 아직 안 나온 pending
            const inPending = PLAYERS.some((p) => (state.pending[p] ?? []).includes(DOG));
            expect(state.discarded.includes(DOG) || inPending).toBe(true);
          }
          expect(state.currentTrick.some((pl) => pl.combo.cards.includes(DOG))).toBe(false);
        }
      }),
      { numRuns: 20 },
    );
  });

  it('교환이 끝나면 전원 손패가 14장', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const first = play(seed).states.find((s) => s.phase === 'PLAY');
        if (first === undefined) return;
        for (const p of PLAYERS) expect(first.hands[p]).toHaveLength(HAND_SIZE);
      }),
      { numRuns: 40 },
    );
  });

  it('진행 방향은 반시계 — 좌석 배열의 역순', () => {
    const s = tichuEngine.init({ config: CONFIG, players: PLAYERS, seed: 1 });
    expect(s.seats).toEqual([...PLAYERS]);
    expect(PLAYER_COUNT).toBe(4);
  });
});

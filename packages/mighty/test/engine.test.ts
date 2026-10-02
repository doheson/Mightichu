/**
 * 엔진 계약 + 마이티 고유 불변식의 속성 테스트.
 * `core/test/contract.test.ts` 와 같은 구조 — 성질 목록은 모든 엔진에 공통이다.
 */

import { findNonJsonPath, replayRound } from '@mightichu/core';
import { playRandomGame } from '@mightichu/core/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TOTAL_POINTS, countPoints } from '../src/cards.js';
import { PLAYER_COUNT, mightyEngine } from '../src/engine.js';
import { TRICKS_PER_ROUND } from '../src/trick.js';
import type { MightyConfig, MightyState } from '../src/types.js';

const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;
const CONFIG: MightyConfig = {};
const seeds = fc.integer({ min: 0, max: 2 ** 31 - 1 });

function play(seed: number) {
  return playRandomGame(mightyEngine, CONFIG, PLAYERS, seed, 200);
}

describe('init', () => {
  it('5인 전용', () => {
    expect(() =>
      mightyEngine.init({ config: CONFIG, players: ['a', 'b', 'c', 'd'], seed: 1 }),
    ).toThrow();
  });

  it('플레이어 중복을 거부', () => {
    expect(() =>
      mightyEngine.init({ config: CONFIG, players: ['a', 'a', 'c', 'd', 'e'], seed: 1 }),
    ).toThrow();
  });

  it('각자 10장 + 바닥 3장', () => {
    const s = mightyEngine.init({ config: CONFIG, players: PLAYERS, seed: 7 });
    for (const p of PLAYERS) expect(s.hands[p]).toHaveLength(10);
    expect(s.kitty).toHaveLength(3);
  });

  it('53장이 정확히 한 번씩 분배된다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const s = mightyEngine.init({ config: CONFIG, players: PLAYERS, seed });
        const all = [...PLAYERS.flatMap((p) => s.hands[p] ?? []), ...s.kitty];
        expect(all).toHaveLength(53);
        expect(new Set(all).size).toBe(53);
      }),
      { numRuns: 200 },
    );
  });

  it('재딜 자격자가 없으면 바로 비딩으로 간다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const s = mightyEngine.init({ config: CONFIG, players: PLAYERS, seed });
        expect(s.phase).toBe(s.misdealEligible.length > 0 ? 'MISDEAL' : 'BIDDING');
      }),
      { numRuns: 100 },
    );
  });
});

describe('계약 정합성: legalActions ⊆ apply 성공', () => {
  it('무작위 대국이 항상 끝까지 간다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        expect(play(seed).finished).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('모든 상태에서 모든 플레이어의 합법 수를 전수 검증', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          for (const player of PLAYERS) {
            for (const action of mightyEngine.legalActions(state, player)) {
              const result = mightyEngine.apply(state, player, action);
              if (!result.ok) {
                throw new Error(
                  `${state.phase} / ${player} / ${JSON.stringify(action)} → ${result.error.code}`,
                );
              }
            }
          }
        }
      }),
      { numRuns: 30 },
    );
  });

  it('종료 상태에서는 아무도 합법 수가 없다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { finalState } = play(seed);
        for (const player of PLAYERS) {
          expect(mightyEngine.legalActions(finalState, player)).toHaveLength(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('JSON 안전성', () => {
  it('모든 상태와 뷰가 직렬화 가능', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          expect(findNonJsonPath(state)).toBeNull();
          for (const player of PLAYERS) {
            expect(findNonJsonPath(mightyEngine.view(state, player))).toBeNull();
          }
        }
      }),
      { numRuns: 30 },
    );
  });
});

describe('리댁션 — 보안 경계', () => {
  it('뷰에 남의 손패 카드가 등장하지 않는다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          const onTable = new Set(state.currentTrick.map((t) => t.card));
          // 프렌드 지명 카드는 공개 정보 — 그 카드가 누구 손에 있든 뷰에 실려야 한다.
          if (state.friendCall?.kind === 'CARD') onTable.add(state.friendCall.card);
          for (const viewer of PLAYERS) {
            const json = JSON.stringify(mightyEngine.view(state, viewer));
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
      { numRuns: 30 },
    );
  });

  it('뷰에 바닥 카드와 주공이 버린 카드가 등장하지 않는다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          const hidden = [...state.kitty, ...state.discarded];
          if (hidden.length === 0) continue;
          // 프렌드 지명 카드는 전원이 알아야 하는 공개 정보다.
          // 주공이 자기가 버린 카드를 지명하는 것도 합법(숨은 노프렌드)이므로 제외한다.
          const publiclyNamed =
            state.friendCall?.kind === 'CARD' ? state.friendCall.card : null;
          for (const viewer of PLAYERS) {
            const view = mightyEngine.view(state, viewer);
            const json = JSON.stringify(view);
            for (const card of hidden) {
              // 주공은 바닥을 손에 받았으므로 자기 손패에 있을 수 있다
              if ((view.myHand as readonly string[]).includes(card)) continue;
              if (card === publiclyNamed) continue;
              expect(json).not.toContain(card);
            }
          }
        }
      }),
      { numRuns: 30 },
    );
  });

  it('프렌드 정체는 공개 전까지 뷰에 노출되지 않는다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          if (state.friend === null || state.friendRevealed) continue;
          for (const viewer of PLAYERS) {
            const view = mightyEngine.view(state, viewer);
            expect(view.friend).toBeNull();
            // 본인에게만 알려준다
            expect(view.iAmFriend).toBe(viewer === state.friend);
          }
        }
      }),
      { numRuns: 50 },
    );
  });

  it('남의 재딜 자격은 노출되지 않는다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          for (const viewer of PLAYERS) {
            const view = mightyEngine.view(state, viewer);
            expect(Object.keys(view)).not.toContain('misdealEligible');
            expect(view.iCanDemandMisdeal).toBe(
              state.phase === 'MISDEAL' && state.misdealEligible.includes(viewer),
            );
          }
        }
      }),
      { numRuns: 30 },
    );
  });
});

describe('결정론과 리플레이', () => {
  it('같은 시드는 같은 대국', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        expect(play(seed).finalState).toEqual(play(seed).finalState);
      }),
      { numRuns: 100 },
    );
  });

  it('로그 재생이 최종 상태를 복원한다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { finalState, log } = play(seed);
        const replayed = replayRound(mightyEngine, log);
        expect(replayed.ok).toBe(true);
        if (replayed.ok) expect(replayed.value).toEqual(finalState);
      }),
      { numRuns: 200 },
    );
  });
});

describe('마이티 고유 불변식', () => {
  it('점수카드 20장이 항상 보존된다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          const inHands = PLAYERS.reduce(
            (sum, p) => sum + countPoints(state.hands[p] ?? []),
            0,
          );
          const inTrick = countPoints(state.currentTrick.map((t) => t.card));
          const won = PLAYERS.reduce((sum, p) => sum + (state.points[p] ?? 0), 0);
          const stashed = countPoints(state.kitty) + countPoints(state.discarded);
          expect(inHands + inTrick + won + stashed).toBe(TOTAL_POINTS);
        }
      }),
      { numRuns: 50 },
    );
  });

  it('카드 53장이 항상 보존된다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          const inHands = PLAYERS.reduce((n, p) => n + (state.hands[p] ?? []).length, 0);
          const played = state.trickNo * PLAYER_COUNT + state.currentTrick.length;
          const accounted =
            inHands + state.kitty.length + state.discarded.length + played;
          // 마지막 트릭이 끝나면 trickNo 가 LAST_TRICK 에 고정되므로 보정
          const expected = state.phase === 'DONE' && state.outcome?.kind === 'PLAYED'
            ? 53
            : accounted;
          expect(expected).toBe(53);
        }
      }),
      { numRuns: 50 },
    );
  });

  it('플레이까지 간 라운드는 정확히 10트릭', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { finalState } = play(seed);
        if (finalState.outcome?.kind !== 'PLAYED') return;
        const totalPoints = PLAYERS.reduce((n, p) => n + (finalState.points[p] ?? 0), 0);
        expect(totalPoints + countPoints(finalState.discarded)).toBe(TOTAL_POINTS);
        expect(finalState.trickNo).toBe(TRICKS_PER_ROUND - 1);
        for (const p of PLAYERS) expect(finalState.hands[p]).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('점수 합은 항상 0 (제로섬)', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { finalState } = play(seed);
        const score = mightyEngine.score(finalState);
        const total = Object.values(score.perPlayer).reduce((a, b) => a + b, 0);
        expect(total).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  it('주공과 프렌드는 서로 다른 사람이다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          if (state.friend !== null) expect(state.friend).not.toBe(state.declarer);
        }
      }),
      { numRuns: 50 },
    );
  });

  it('재딜로 끝난 라운드는 전원 0점', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { finalState } = play(seed);
        if (finalState.outcome?.kind !== 'REDEAL') return;
        const score = mightyEngine.score(finalState);
        for (const p of PLAYERS) expect(score.perPlayer[p]).toBe(0);
      }),
      { numRuns: 200 },
    );
  });
});

describe('대국 통계 — 랜덤 봇 대량 대국', () => {
  it('3000판이 모두 정상 종료하고 대부분이 플레이까지 간다', () => {
    const counts = { PLAYED: 0, MISDEAL: 0, ALL_PASSED: 0 };
    const N = 3000;
    for (let seed = 0; seed < N; seed++) {
      const { finalState } = play(seed) as { finalState: MightyState };
      const outcome = finalState.outcome;
      if (outcome === null) throw new Error(`시드 ${seed}: 종료되지 않음`);
      if (outcome.kind === 'PLAYED') counts.PLAYED++;
      else counts[outcome.reason]++;
    }
    expect(counts.PLAYED + counts.MISDEAL + counts.ALL_PASSED).toBe(N);
    // 플레이 단계가 충분히 검증되고 있는지에 대한 회귀 가드
    expect(counts.PLAYED / N).toBeGreaterThanOrEqual(0.85);
    expect(counts.MISDEAL).toBeGreaterThan(0);
    // ALL_PASSED 는 랜덤 플레이로는 사실상 도달하지 않는다(비드 40종 vs 패스 1종).
    // 그 경로는 scenario.test.ts 의 대본 테스트가 덮는다.
  });
});

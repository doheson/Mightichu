/**
 * `GameEngine` 계약의 속성 테스트.
 *
 * 여기 있는 성질은 **마이티·티츄 엔진에도 그대로 적용**된다.
 * 1단계에서 마이티 엔진을 넣을 때 이 파일의 구조를 복사해 쓴다.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findNonJsonPath } from '../src/json.js';
import { replayRound } from '../src/replay.js';
import { miniEngine, type MiniState } from './fixture-engine.js';
import { playRandomGame } from './driver.js';

const PLAYERS = ['p1', 'p2', 'p3', 'p4'] as const;
const CONFIG = { handSize: 4 } as const;

const seeds = fc.integer({ min: 0, max: 2 ** 31 - 1 });

function play(seed: number) {
  return playRandomGame(miniEngine, CONFIG, PLAYERS, seed);
}

describe('정합성: legalActions ⊆ apply 성공', () => {
  it('무작위 대국 중 합법 수가 거부되는 일이 없다', () => {
    // playRandomGame 이 위반 시 던진다 — 이 성질이 가장 강력하다.
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
            for (const action of miniEngine.legalActions(state, player)) {
              expect(miniEngine.apply(state, player, action).ok).toBe(true);
            }
          }
        }
      }),
      { numRuns: 50 },
    );
  });
});

describe('JSON 안전성', () => {
  it('모든 상태가 JSON 직렬화 가능', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          expect(findNonJsonPath(state)).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('모든 뷰가 JSON 직렬화 가능', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          for (const player of PLAYERS) {
            expect(findNonJsonPath(miniEngine.view(state, player))).toBeNull();
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('리댁션: 뷰에 타인의 손패가 새지 않는다', () => {
  it('직렬화된 뷰에 남의 카드가 등장하지 않는다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          for (const viewer of PLAYERS) {
            const json = JSON.stringify(miniEngine.view(state, viewer));
            const onTable = new Set(state.table.map((t) => t.card));

            for (const other of PLAYERS) {
              if (other === viewer) continue;
              for (const card of state.hands[other] ?? []) {
                // 테이블에 공개된 카드는 보여도 된다
                if (onTable.has(card)) continue;
                expect(json).not.toContain(card);
              }
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('결정론', () => {
  it('같은 시드는 같은 초기 상태', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const a = miniEngine.init({ config: CONFIG, players: PLAYERS, seed });
        const b = miniEngine.init({ config: CONFIG, players: PLAYERS, seed });
        expect(a).toEqual(b);
      }),
    );
  });

  it('같은 시드는 같은 전체 대국', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        expect(play(seed).finalState).toEqual(play(seed).finalState);
      }),
      { numRuns: 100 },
    );
  });

  it('init 은 입력을 변경하지 않는다', () => {
    const players = [...PLAYERS];
    const snapshot = [...players];
    miniEngine.init({ config: CONFIG, players, seed: 1 });
    expect(players).toEqual(snapshot);
  });
});

describe('리플레이', () => {
  it('로그 재생이 원래 최종 상태를 복원한다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { finalState, log } = play(seed);
        const replayed = replayRound(miniEngine, log);
        expect(replayed.ok).toBe(true);
        if (replayed.ok) expect(replayed.value).toEqual(finalState);
      }),
      { numRuns: 200 },
    );
  });

  it('로그가 작다 — 상태 스냅샷 없이 복구 가능', () => {
    const { log } = play(4242);
    const bytes = JSON.stringify(log).length;
    expect(bytes).toBeLessThan(4_000);
    expect(log.actions.length).toBe(PLAYERS.length * CONFIG.handSize);
  });

  it('게임 id 가 다른 로그는 거부한다', () => {
    const { log } = play(1);
    const bad = { ...log, game: 'tichu' };
    const result = replayRound(miniEngine, bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('REPLAY_GAME_MISMATCH');
  });

  it('깨진 로그는 어느 seq 에서 실패했는지 알려준다', () => {
    const { log } = play(2);
    const tampered = {
      ...log,
      actions: log.actions.map((a, i) =>
        i === 3 ? { ...a, action: { type: 'PLAY' as const, card: 'c999' } } : a,
      ),
    };
    const result = replayRound(miniEngine, tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('REPLAY_FAILED');
      expect(result.error.detail).toMatchObject({ seq: 4 });
    }
  });
});

describe('보존 불변식 (게임별 룰의 본보기)', () => {
  const totalCards = PLAYERS.length * CONFIG.handSize;

  it('카드가 생기거나 사라지지 않는다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of play(seed).states) {
          const inHands = PLAYERS.reduce(
            (sum, p) => sum + (state.hands[p] ?? []).length,
            0,
          );
          const inTricks = PLAYERS.reduce(
            (sum, p) => sum + (state.won[p] ?? 0) * PLAYERS.length,
            0,
          );
          expect(inHands + state.table.length + inTricks).toBe(totalCards);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('종료 시 점수 합이 전체 트릭 수와 같다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { finalState } = play(seed);
        const total = Object.values(miniEngine.score(finalState).perPlayer).reduce(
          (a, b) => a + b,
          0,
        );
        expect(total).toBe(totalCards / PLAYERS.length);
      }),
      { numRuns: 100 },
    );
  });

  it('종료 상태에서는 아무도 합법 수가 없다', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { finalState } = play(seed) as { finalState: MiniState };
        for (const player of PLAYERS) {
          expect(miniEngine.legalActions(finalState, player)).toHaveLength(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

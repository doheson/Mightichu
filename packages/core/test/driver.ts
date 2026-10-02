/** 무작위 자동 대국 드라이버 — 속성 테스트의 엔진 구동부. */

import type { GameEngine } from '../src/engine.js';
import { createRng, pick } from '../src/rng.js';
import { appendAction, createRoundLog, type RoundLog } from '../src/replay.js';
import type { PlayerId, Seed } from '../src/types.js';

export interface PlaythroughResult<State, Config, Action> {
  readonly finalState: State;
  readonly log: RoundLog<Config, Action>;
  /** 거쳐간 모든 상태 (초기 상태 포함) — 불변식 전수 검사용. */
  readonly states: readonly State[];
  readonly finished: boolean;
}

/**
 * 합법 수 중 무작위로 골라 게임이 끝날 때까지 진행한다.
 * 액션 선택에도 시드 RNG 를 쓰므로 이 함수 자체가 결정론적이다.
 */
export function playRandomGame<State, Action, View, Config>(
  engine: GameEngine<State, Action, View, Config>,
  config: Config,
  players: readonly PlayerId[],
  seed: Seed,
  maxSteps = 10_000,
): PlaythroughResult<State, Config, Action> {
  const rng = createRng(seed ^ 0x5f3759df);
  let state = engine.init({ config, players, seed });
  let log = createRoundLog<Config, Action>(engine.id, config, players, seed);
  const states: State[] = [state];

  for (let step = 0; step < maxSteps; step++) {
    if (engine.isOver(state)) {
      return { finalState: state, log, states, finished: true };
    }

    // 행동 가능한 플레이어를 모은다 — 턴 보유자만이 아니다(폭탄·선언 대비).
    const actors = players.filter((p) => engine.legalActions(state, p).length > 0);
    if (actors.length === 0) break;

    const actor = pick(actors, rng) as PlayerId;
    const legal = engine.legalActions(state, actor);
    const action = pick(legal, rng) as Action;

    const applied = engine.apply(state, actor, action);
    if (!applied.ok) {
      throw new Error(
        `계약 위반: legalActions 가 돌려준 액션이 apply 에서 실패 — ` +
          `${actor} / ${applied.error.code}: ${applied.error.message}`,
      );
    }
    state = applied.value.state;
    log = appendAction(log, actor, action);
    states.push(state);
  }

  return { finalState: state, log, states, finished: engine.isOver(state) };
}

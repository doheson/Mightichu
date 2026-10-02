/**
 * 테스트 하네스 — 무작위 자동 대국 드라이버.
 *
 * 모든 룰 엔진이 공유한다. `legalActions` 가 돌려준 액션만 쓰면서 게임이 끝날 때까지
 * 진행하므로, "합법 수인데 apply 가 실패" 하는 계약 위반을 즉시 잡아낸다.
 * 액션 선택에도 시드 RNG 를 쓰므로 이 함수 자체가 결정론적이다.
 */

import type { Bot } from './bot.js';
import type { GameEngine } from './engine.js';
import { createRng, pick } from './rng.js';
import { appendAction, createRoundLog, type RoundLog } from './replay.js';
import type { PlayerId, Seed } from './types.js';

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

/**
 * 지정한 봇들로 대국을 진행한다. 봇은 **리댁션된 뷰만** 받는다 —
 * 로컬 대국에서도 같은 리댁션 경로를 거치므로 치팅이 구조적으로 불가능하다.
 *
 * 테스트 전용이므로 동기 봇만 받는다. 비동기 봇은 `Promise` 를 돌려주는데,
 * 조용히 잘못된 결과를 내지 않도록 즉시 던진다.
 */
export function playWithBots<State, Action, View, Config>(
  engine: GameEngine<State, Action, View, Config>,
  config: Config,
  players: readonly PlayerId[],
  seed: Seed,
  bots: Readonly<Record<PlayerId, Bot<View, Action>>>,
  maxSteps = 10_000,
): PlaythroughResult<State, Config, Action> {
  const rng = createRng(seed ^ 0x9e3779b9);
  let state = engine.init({ config, players, seed });
  let log = createRoundLog<Config, Action>(engine.id, config, players, seed);
  const states: State[] = [state];

  for (let step = 0; step < maxSteps; step++) {
    if (engine.isOver(state)) {
      return { finalState: state, log, states, finished: true };
    }

    const actor = players.find((p) => {
      const legal = engine.legalActions(state, p);
      if (legal.length === 0) return false;
      const bot = bots[p];
      if (bot === undefined) return false;
      return (
        bot.wants?.({ me: p, view: engine.view(state, p), legal, rng }) ?? true
      );
    });
    if (actor === undefined) break;

    const bot = bots[actor];
    if (bot === undefined) throw new Error(`${actor} 의 봇이 지정되지 않았다`);

    const decided = bot.decide({
      me: actor,
      view: engine.view(state, actor),
      legal: engine.legalActions(state, actor),
      rng,
    });
    if (decided instanceof Promise) {
      throw new Error('playWithBots 는 동기 봇만 받는다');
    }

    const applied = engine.apply(state, actor, decided);
    if (!applied.ok) {
      throw new Error(
        `봇이 불법 액션을 냈다 — ${actor} / ${applied.error.code}: ${applied.error.message}`,
      );
    }
    state = applied.value.state;
    log = appendAction(log, actor, decided);
    states.push(state);
  }

  return { finalState: state, log, states, finished: engine.isOver(state) };
}

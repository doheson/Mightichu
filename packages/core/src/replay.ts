/**
 * 액션 로그와 리플레이.
 *
 * 결정론 덕분에 **한 라운드 전체가 `{ seed, actions[] }` 몇 KB로 표현된다.**
 * 이게 다음을 동시에 해결한다:
 *  - 서버 재배포 시 진행 중인 방 복구 (전체 상태 스냅샷 불필요)
 *  - 버그 리포트 (시드 + 액션 두 줄로 완전 재현)
 *  - 리플레이·관전·전적 저장 (DB 한 행이 판 전체)
 */

import type { GameEngine } from './engine.js';
import type { PlayerId, Result, Seed } from './types.js';
import { err, ok } from './types.js';

export interface LoggedAction<Action> {
  /** 1부터 증가. 서버의 낙관적 동시성 제어(stale 액션 거부)에도 쓴다. */
  readonly seq: number;
  readonly player: PlayerId;
  readonly action: Action;
}

/** 한 라운드를 완전히 재구성하는 데 필요한 전부. */
export interface RoundLog<Config, Action> {
  readonly game: string;
  readonly config: Config;
  readonly players: readonly PlayerId[];
  readonly seed: Seed;
  readonly actions: readonly LoggedAction<Action>[];
}

export function createRoundLog<Config, Action>(
  game: string,
  config: Config,
  players: readonly PlayerId[],
  seed: Seed,
): RoundLog<Config, Action> {
  return { game, config, players, seed, actions: [] };
}

export function appendAction<Config, Action>(
  log: RoundLog<Config, Action>,
  player: PlayerId,
  action: Action,
): RoundLog<Config, Action> {
  const entry: LoggedAction<Action> = {
    seq: log.actions.length + 1,
    player,
    action,
  };
  return { ...log, actions: [...log.actions, entry] };
}

/**
 * 로그를 엔진에 재생해 상태를 복원한다.
 * 중간에 실패하면 어느 seq 에서 깨졌는지 담아 반환한다 — 룰 변경으로
 * 과거 로그가 재생 불가해지는 경우를 조용히 넘기지 않기 위해.
 */
export function replayRound<State, Action, View, Config>(
  engine: GameEngine<State, Action, View, Config>,
  log: RoundLog<Config, Action>,
): Result<State> {
  if (log.game !== engine.id) {
    return err('REPLAY_GAME_MISMATCH', `로그는 '${log.game}' 인데 엔진은 '${engine.id}'`);
  }

  let state = engine.init({
    config: log.config,
    players: log.players,
    seed: log.seed,
  });

  for (const entry of log.actions) {
    const applied = engine.apply(state, entry.player, entry.action);
    if (!applied.ok) {
      return err('REPLAY_FAILED', `seq ${entry.seq} 재생 실패: ${applied.error.message}`, {
        seq: entry.seq,
        player: entry.player,
        cause: applied.error.code,
      });
    }
    state = applied.value.state;
  }

  return ok(state);
}

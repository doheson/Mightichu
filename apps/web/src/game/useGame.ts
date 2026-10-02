/** AI 모드 — 워커를 감싼 훅. 게임에 무관하다. */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FromWorker, ToWorker } from './protocol.js';
import type { GameId } from './registry.js';

export interface GameState {
  readonly game: GameId;
  readonly view: unknown;
  readonly legal: readonly unknown[];
  readonly log: readonly string[];
  readonly score: unknown;
  readonly error: string | null;
  /** 매치 누적 점수. 라운드가 아니라 매치가 게임의 단위다. */
  readonly totals: Readonly<Record<string, number>>;
  readonly history: readonly Readonly<Record<string, number>>[];
}

export function useGame(game: GameId): {
  state: GameState;
  send: (action: unknown) => void;
  /** 같은 매치의 다음 라운드. 누적 점수가 이어진다. */
  nextRound: () => void;
  /** 새 매치 — 누적 점수를 초기화한다. */
  newMatch: () => void;
} {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<GameState>({
    game,
    view: null,
    legal: [],
    log: [],
    score: null,
    error: null,
    totals: {},
    history: [],
  });

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (message: MessageEvent<FromWorker>): void => {
      const data = message.data;
      if (data.type === 'STATE') {
        setState((prev) => ({
          ...prev,
          game: data.game,
          view: data.view,
          legal: data.legal,
          log: data.log,
          error: null,
          totals: data.totals,
          history: data.history,
          score:
            (data.view as { outcome?: unknown } | null)?.outcome == null ? null : prev.score,
        }));
      } else if (data.type === 'SCORE') {
        setState((prev) => ({ ...prev, score: data.score }));
      } else {
        setState((prev) => ({ ...prev, error: data.message }));
      }
    };

    worker.postMessage({
      type: 'NEW_MATCH',
      game,
      seed: Math.floor(Math.random() * 2 ** 31),
    } satisfies ToWorker);

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [game]);

  const send = useCallback((action: unknown) => {
    workerRef.current?.postMessage({ type: 'ACTION', action } satisfies ToWorker);
  }, []);

  const nextRound = useCallback(() => {
    setState((prev) => ({ ...prev, view: null, score: null, log: [], error: null }));
    workerRef.current?.postMessage({
      type: 'NEXT_ROUND',
      seed: Math.floor(Math.random() * 2 ** 31),
    } satisfies ToWorker);
  }, []);

  const newMatch = useCallback(() => {
    setState((prev) => ({
      ...prev,
      view: null,
      score: null,
      log: [],
      error: null,
      totals: {},
      history: [],
    }));
    workerRef.current?.postMessage({
      type: 'NEW_MATCH',
      game,
      seed: Math.floor(Math.random() * 2 ** 31),
    } satisfies ToWorker);
  }, [game]);

  return { state, send, nextRound, newMatch };
}

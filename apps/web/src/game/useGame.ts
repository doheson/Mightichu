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
}

export function useGame(game: GameId): {
  state: GameState;
  send: (action: unknown) => void;
  newGame: (seed?: number) => void;
} {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<GameState>({
    game,
    view: null,
    legal: [],
    log: [],
    score: null,
    error: null,
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
      type: 'NEW_GAME',
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

  const newGame = useCallback(
    (seed?: number) => {
      setState((prev) => ({ ...prev, view: null, score: null, log: [], error: null }));
      workerRef.current?.postMessage({
        type: 'NEW_GAME',
        game,
        seed: seed ?? Math.floor(Math.random() * 2 ** 31),
      } satisfies ToWorker);
    },
    [game],
  );

  return { state, send, newGame };
}

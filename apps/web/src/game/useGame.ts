/** 워커를 감싼 React 훅. UI 는 뷰와 합법 수만 다룬다. */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FromWorker, ToWorker } from './protocol.js';
import type { MightyAction, MightyView, RoundScore } from './types.js';

export interface GameState {
  readonly view: MightyView | null;
  readonly legal: readonly MightyAction[];
  readonly log: readonly string[];
  readonly score: RoundScore | null;
  readonly error: string | null;
}

const EMPTY: GameState = { view: null, legal: [], log: [], score: null, error: null };

export function useGame(): {
  state: GameState;
  send: (action: MightyAction) => void;
  newGame: (seed?: number) => void;
} {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<GameState>(EMPTY);

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (message: MessageEvent<FromWorker>): void => {
      const data = message.data;
      if (data.type === 'STATE') {
        setState((prev) => ({
          ...prev,
          view: data.view,
          legal: data.legal,
          log: data.log,
          error: null,
          // 새 라운드가 시작되면 이전 점수를 지운다
          score: data.view.outcome === null ? null : prev.score,
        }));
      } else if (data.type === 'SCORE') {
        setState((prev) => ({ ...prev, score: data.score }));
      } else {
        setState((prev) => ({ ...prev, error: data.message }));
      }
    };

    const seed = Math.floor(Math.random() * 2 ** 31);
    worker.postMessage({ type: 'NEW_GAME', seed } satisfies ToWorker);

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const send = useCallback((action: MightyAction) => {
    workerRef.current?.postMessage({ type: 'ACTION', action } satisfies ToWorker);
  }, []);

  const newGame = useCallback((seed?: number) => {
    setState(EMPTY);
    workerRef.current?.postMessage({
      type: 'NEW_GAME',
      seed: seed ?? Math.floor(Math.random() * 2 ** 31),
    } satisfies ToWorker);
  }, []);

  return { state, send, newGame };
}

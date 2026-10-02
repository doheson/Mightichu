/**
 * UI ↔ Web Worker 메시지.
 *
 * 워커가 **게임 상태의 권위**를 갖는다. UI 는 리댁션된 뷰와 합법 수만 받는다.
 * 멀티플레이에서 워커를 서버로 바꿔도 이 계약은 그대로다 —
 * 그래서 AI 모드를 먼저 만드는 것이 서버 설계 검증도 겸한다.
 */

import type { GameId } from './registry.js';

export type ToWorker =
  | { readonly type: 'NEW_GAME'; readonly game: GameId; readonly seed: number }
  | { readonly type: 'ACTION'; readonly action: unknown };

export type FromWorker =
  | {
      readonly type: 'STATE';
      readonly game: GameId;
      readonly view: unknown;
      readonly legal: readonly unknown[];
      readonly log: readonly string[];
    }
  | { readonly type: 'SCORE'; readonly score: unknown }
  | { readonly type: 'ERROR'; readonly message: string };

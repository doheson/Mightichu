/**
 * UI ↔ Web Worker 메시지.
 *
 * 워커가 **게임 상태의 권위**를 갖는다. UI 는 리댁션된 뷰와 합법 수만 받는다.
 * 멀티플레이(3단계)에서 워커를 서버로 바꿔도 UI 쪽 계약은 그대로다 —
 * 그래서 AI 모드를 먼저 만드는 것이 서버 설계 검증도 겸한다.
 */

import type { MightyAction, MightyView, RoundScore } from './types.js';

export type ToWorker =
  | { readonly type: 'NEW_GAME'; readonly seed: number }
  | { readonly type: 'ACTION'; readonly action: MightyAction };

export type FromWorker =
  | {
      readonly type: 'STATE';
      readonly view: MightyView;
      readonly legal: readonly MightyAction[];
      readonly log: readonly string[];
    }
  | { readonly type: 'SCORE'; readonly score: RoundScore }
  | { readonly type: 'ERROR'; readonly message: string };

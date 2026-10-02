/**
 * UI ↔ Web Worker 메시지.
 *
 * 워커가 **게임 상태의 권위**를 갖는다. UI 는 리댁션된 뷰와 합법 수만 받는다.
 * 멀티플레이에서 워커를 서버로 바꿔도 이 계약은 그대로다 —
 * 그래서 AI 모드를 먼저 만드는 것이 서버 설계 검증도 겸한다.
 */

import type { GameId } from './registry.js';

export type ToWorker =
  /** 새 **매치**를 시작한다 — 누적 점수를 초기화한다. */
  | { readonly type: 'NEW_MATCH'; readonly game: GameId; readonly seed: number }
  /** 같은 매치 안에서 다음 라운드. 누적 점수는 이어진다. */
  | { readonly type: 'NEXT_ROUND'; readonly seed: number }
  | { readonly type: 'ACTION'; readonly action: unknown };

/** 한 라운드의 플레이어별 증감. 팀 합산은 UI 가 한다. */
export type RoundResult = Readonly<Record<string, number>>;

export type FromWorker =
  | {
      readonly type: 'STATE';
      readonly game: GameId;
      readonly view: unknown;
      readonly legal: readonly unknown[];
      readonly log: readonly string[];
      /** 매치 누적 점수. */
      readonly totals: Readonly<Record<string, number>>;
      /** 라운드별 결과 — 점수표에 쓴다. */
      readonly history: readonly RoundResult[];
    }
  | { readonly type: 'SCORE'; readonly score: unknown }
  | { readonly type: 'ERROR'; readonly message: string };

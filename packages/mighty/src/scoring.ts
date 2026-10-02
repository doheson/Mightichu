/**
 * 점수 계산.
 *
 * 성공 (P >= B):  S = 2×(B − 13) + (P − B)
 * 실패 (P <  B):  S = B − P
 *
 * 지급:
 *  - 프렌드 있음: 성공 시 주공 +2S, 프렌드 +S, 야당 3명 각 −S  (합 0)
 *  - 프렌드 없음: 성공 시 주공 +4S, 야당 4명 각 −S            (합 0)
 *  - 실패는 부호 반대
 *
 * 배수는 **누적** (×2, ×4, ×8…):
 *  런(여당 20장) / 백런(야당 11장 이상) / 노기루다 / 노프렌드 선언
 *
 * 노프렌드 배수 주의: **선언한** 노프렌드만 ×2 다.
 * 지명 카드가 주공 손·바닥·버린 패에 있어 프렌드가 안 생긴 "숨은 노프렌드"나,
 * 초구 프렌드에서 주공이 첫 트릭을 먹어 프렌드가 없어진 경우는 배수 없이
 * 지급만 노프렌드 방식(4S)으로 한다.
 */

import type { PlayerId, RoundScore } from '@mightichu/core';
import { MIN_BID } from './bidding.js';
import { TOTAL_POINTS } from './cards.js';
import type { Bid, FriendCall } from './types.js';

/** 백런 기준 — 야당이 이 장수 이상 획득하면 ×2. */
export const BACK_RUN_THRESHOLD = 11;

export interface ScoringInput {
  readonly seats: readonly PlayerId[];
  readonly declarer: PlayerId;
  /** 드러난 프렌드. 없으면 null (노프렌드 또는 숨은 노프렌드). */
  readonly friend: PlayerId | null;
  readonly friendCall: FriendCall;
  readonly contract: Bid;
  /** 여당(주공+프렌드)이 획득한 점수카드 수. 주공이 버린 3장의 점수 포함. */
  readonly declarerPoints: number;
}

export type ScoringDetail = {
  readonly outcome: 'PLAYED';
  readonly won: boolean;
  readonly contract: Bid;
  readonly declarerPoints: number;
  readonly defenderPoints: number;
  /** 배수 적용 전 기본 점수. */
  readonly baseScore: number;
  readonly multiplier: number;
  readonly multipliers: readonly string[];
  readonly solo: boolean;
  readonly declarer: PlayerId;
  readonly friend: PlayerId | null;
};

export function computeScore(input: ScoringInput): RoundScore {
  const { seats, declarer, friend, friendCall, contract, declarerPoints } = input;
  const defenderPoints = TOTAL_POINTS - declarerPoints;
  const won = declarerPoints >= contract.count;

  const baseScore = won
    ? 2 * (contract.count - MIN_BID) + (declarerPoints - contract.count)
    : contract.count - declarerPoints;

  const multipliers: string[] = [];
  let multiplier = 1;

  if (declarerPoints === TOTAL_POINTS) {
    multiplier *= 2;
    multipliers.push('RUN');
  }
  if (defenderPoints >= BACK_RUN_THRESHOLD) {
    multiplier *= 2;
    multipliers.push('BACK_RUN');
  }
  if (contract.trump === 'NT') {
    multiplier *= 2;
    multipliers.push('NO_TRUMP');
  }
  // 선언한 노프렌드만 배수를 받는다.
  if (friendCall.kind === 'NONE') {
    multiplier *= 2;
    multipliers.push('NO_FRIEND');
  }

  const score = baseScore * multiplier;
  const sign = won ? 1 : -1;
  // 프렌드가 실제로 존재하지 않으면 지급은 노프렌드 방식.
  const solo = friend === null;

  const perPlayer: Record<PlayerId, number> = {};
  for (const seat of seats) perPlayer[seat] = 0;

  if (solo) {
    const opponents = seats.filter((s) => s !== declarer);
    perPlayer[declarer] = sign * score * opponents.length;
    for (const opponent of opponents) perPlayer[opponent] = -sign * score;
  } else {
    const opponents = seats.filter((s) => s !== declarer && s !== friend);
    perPlayer[declarer] = sign * score * 2;
    perPlayer[friend] = sign * score;
    for (const opponent of opponents) perPlayer[opponent] = -sign * score;
  }

  const detail: ScoringDetail = {
    outcome: 'PLAYED',
    won,
    contract,
    declarerPoints,
    defenderPoints,
    baseScore,
    multiplier,
    multipliers,
    solo,
    declarer,
    friend,
  };

  return { perPlayer, detail };
}

/** 재딜 — 전원 0점. */
export function redealScore(
  seats: readonly PlayerId[],
  reason: 'MISDEAL' | 'ALL_PASSED',
): RoundScore {
  const perPlayer: Record<PlayerId, number> = {};
  for (const seat of seats) perPlayer[seat] = 0;
  return { perPlayer, detail: { outcome: 'REDEAL', reason } };
}

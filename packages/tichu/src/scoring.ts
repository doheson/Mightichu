/**
 * 티츄 점수 계산.
 *
 * 한 라운드 카드 점수 총합은 **100점 고정**이다(용 +25, 봉황 −25 가 상쇄).
 * 더블윈이면 카드 점수를 세지 않고 즉시 **200점**.
 * 티츄 선언은 카드 점수와 **별도로** 가감한다 — 더블윈일 때도 적용된다.
 */

import type { PlayerId, RoundScore } from '@mightichu/core';
import { countPoints } from './cards.js';
import type { Card, RoundOutcome, TichuCall } from './types.js';

export const SMALL_TICHU = 100;
export const GRAND_TICHU = 200;
export const DOUBLE_WIN = 200;

export type ScoringInput = {
  readonly seats: readonly PlayerId[];
  /** 같은 팀끼리 묶은 두 팀. 마주 앉은 둘이 한 팀이다. */
  readonly teams: readonly (readonly PlayerId[])[];
  readonly calls: Readonly<Record<PlayerId, TichuCall>>;
  /** 각자 최종적으로 보유한 트릭 카드. */
  readonly taken: Readonly<Record<PlayerId, readonly Card[]>>;
  /** 손패를 턴 순서. 1등이 티츄 성공 판정 기준. */
  readonly finished: readonly PlayerId[];
  readonly outcome: RoundOutcome;
};

export type TichuScoringDetail = {
  readonly outcome: RoundOutcome['kind'];
  readonly cardPoints: readonly number[];
  readonly callPoints: readonly number[];
  readonly teamTotals: readonly number[];
  readonly winner: PlayerId | null;
};

function callValue(call: TichuCall): number {
  if (call === 'GRAND') return GRAND_TICHU;
  if (call === 'SMALL') return SMALL_TICHU;
  return 0;
}

export function computeScore(input: ScoringInput): RoundScore {
  const { seats, teams, calls, taken, finished, outcome } = input;
  const winner = finished[0] ?? null;

  const cardPoints = teams.map((team) =>
    outcome.kind === 'DOUBLE_WIN'
      ? outcome.team.includes(team[0] as PlayerId)
        ? DOUBLE_WIN
        : 0
      : team.reduce((sum, p) => sum + countPoints(taken[p] ?? []), 0),
  );

  // 티츄 선언 — 본인이 1등이어야 성공. 파트너가 1등이어도 안 된다.
  const callPoints = teams.map((team) =>
    team.reduce((sum, p) => {
      const value = callValue(calls[p] ?? 'NONE');
      if (value === 0) return sum;
      return sum + (p === winner ? value : -value);
    }, 0),
  );

  const teamTotals = teams.map((_, i) => (cardPoints[i] ?? 0) + (callPoints[i] ?? 0));

  const perPlayer: Record<PlayerId, number> = {};
  for (const seat of seats) perPlayer[seat] = 0;
  teams.forEach((team, i) => {
    for (const p of team) perPlayer[p] = teamTotals[i] ?? 0;
  });

  const detail: TichuScoringDetail = {
    outcome: outcome.kind,
    cardPoints,
    callPoints,
    teamTotals,
    winner,
  };
  return { perPlayer, detail };
}

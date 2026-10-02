/**
 * 좌석과 진행 방향.
 *
 * 두 게임이 **진행 방향이 다르다**:
 *  - 마이티: 시계 방향 (cw)
 *  - 티츄:   반시계 방향 (ccw) — 공식 룰북 명시. 흔한 구현 실수 지점
 *
 * `seats` 는 항상 **물리적 시계방향 배치**로 두고, 진행 방향만 `direction` 으로 바꾼다.
 * 이렇게 해야 "마주 앉은 파트너"(티츄) 계산이 방향과 무관하게 성립한다.
 */

import type { PlayerId } from './types.js';

export type Direction = 'cw' | 'ccw';

export interface Seating {
  /** 시계방향 물리 배치. 중복 없는 플레이어 목록. */
  readonly seats: readonly PlayerId[];
  readonly direction: Direction;
}

export function createSeating(
  seats: readonly PlayerId[],
  direction: Direction,
): Seating {
  if (seats.length < 2) {
    throw new Error('좌석은 최소 2명 필요');
  }
  if (new Set(seats).size !== seats.length) {
    throw new Error('좌석에 중복 플레이어가 있음');
  }
  return { seats, direction };
}

/** 좌석 인덱스. 없으면 -1. */
export function seatIndex(seating: Seating, player: PlayerId): number {
  return seating.seats.indexOf(player);
}

function step(seating: Seating, index: number, count = 1): number {
  const n = seating.seats.length;
  const delta = seating.direction === 'cw' ? count : -count;
  return (((index + delta) % n) + n) % n;
}

export interface NextOptions {
  /** true 를 반환하는 플레이어는 건너뛴다. (티츄: 손패가 빈 플레이어) */
  readonly skip?: (player: PlayerId) => boolean;
}

/**
 * 진행 방향의 다음 플레이어.
 * 모두 skip 대상이면 null (호출부에서 라운드 종료 등으로 처리).
 * `from` 자신은 후보에 포함하지 않는다.
 */
export function nextPlayer(
  seating: Seating,
  from: PlayerId,
  options: NextOptions = {},
): PlayerId | null {
  const start = seatIndex(seating, from);
  if (start < 0) throw new Error(`좌석에 없는 플레이어: ${from}`);

  const n = seating.seats.length;
  const skip = options.skip;
  for (let k = 1; k <= n; k++) {
    const candidate = seating.seats[step(seating, start, k)] as PlayerId;
    if (candidate === from) continue;
    if (skip === undefined || !skip(candidate)) return candidate;
  }
  return null;
}

/** `from` 부터 진행 방향으로 전원을 한 바퀴. `from` 포함. */
export function playersFrom(seating: Seating, from: PlayerId): PlayerId[] {
  const start = seatIndex(seating, from);
  if (start < 0) throw new Error(`좌석에 없는 플레이어: ${from}`);
  return seating.seats.map(
    (_, k) => seating.seats[step(seating, start, k)] as PlayerId,
  );
}

/**
 * 마주 앉은 플레이어 (티츄 파트너).
 * 좌석 수가 짝수일 때만 의미가 있으므로, 홀수(마이티 5인)면 null.
 */
export function oppositeOf(seating: Seating, player: PlayerId): PlayerId | null {
  const n = seating.seats.length;
  if (n % 2 !== 0) return null;
  const i = seatIndex(seating, player);
  if (i < 0) throw new Error(`좌석에 없는 플레이어: ${player}`);
  return seating.seats[(i + n / 2) % n] as PlayerId;
}

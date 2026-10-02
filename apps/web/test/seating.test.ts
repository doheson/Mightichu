/**
 * 좌석 배치가 **진행 순서와 같은 방향**인지.
 *
 * 실제로 났던 버그: 엔진은 반시계(좌석 인덱스 감소)로 도는데
 * UI 는 인덱스 증가 순으로 앉혀서 화면상 시계방향으로 흘렀다.
 * 엔진 테스트로는 잡히지 않는다 — 배치는 UI 에만 있기 때문.
 */

import { createSeating, nextPlayer } from '@mightichu/core';
import { describe, expect, it } from 'vitest';
import { orderedFromMe } from '../src/ui/tichu/TichuTable.js';

const SEATS = ['p1', 'p2', 'p3', 'p4'];

describe('티츄 좌석 배치', () => {
  it('나부터 진행 순서대로 늘어선다', () => {
    const seating = createSeating(SEATS, 'ccw');
    for (const me of SEATS) {
      const ordered = orderedFromMe(SEATS, me);
      expect(ordered[0]).toBe(me);
      // 배치 순서가 엔진의 다음 차례와 일치해야 한다
      for (let k = 0; k < SEATS.length - 1; k++) {
        const here = ordered[k] as string;
        const next = ordered[k + 1] as string;
        expect(nextPlayer(seating, here)).toBe(next);
      }
    }
  });

  it('내 다음 차례는 화면 오른쪽에 온다 (반시계 = to his right)', () => {
    // polar 에서 index 1 은 START_ANGLE - 90° = 0° = 오른쪽
    const ordered = orderedFromMe(SEATS, 'p1');
    expect(ordered[1]).toBe('p4');
    expect(nextPlayer(createSeating(SEATS, 'ccw'), 'p1')).toBe('p4');
  });

  it('파트너는 맞은편(index 2)에 온다', () => {
    for (const me of SEATS) {
      const ordered = orderedFromMe(SEATS, me);
      const i = SEATS.indexOf(me);
      expect(ordered[2]).toBe(SEATS[(i + 2) % 4]);
    }
  });
});

describe('마이티 좌석 배치', () => {
  const MIGHTY_SEATS = ['p1', 'p2', 'p3', 'p4', 'p5'];

  it('시계 진행과 배치 방향이 같다', async () => {
    const { orderedFromMe: mightyOrder } = await import('../src/ui/Table.js');
    const seating = createSeating(MIGHTY_SEATS, 'cw');
    for (const me of MIGHTY_SEATS) {
      const ordered = mightyOrder(MIGHTY_SEATS, me);
      expect(ordered[0]).toBe(me);
      for (let k = 0; k < MIGHTY_SEATS.length - 1; k++) {
        expect(nextPlayer(seating, ordered[k] as string)).toBe(ordered[k + 1]);
      }
    }
  });
});

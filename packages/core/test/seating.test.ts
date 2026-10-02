import { describe, expect, it } from 'vitest';
import {
  createSeating,
  nextPlayer,
  oppositeOf,
  playersFrom,
  seatIndex,
} from '../src/seating.js';

const MIGHTY = createSeating(['p1', 'p2', 'p3', 'p4', 'p5'], 'cw');
const TICHU = createSeating(['n', 'e', 's', 'w'], 'ccw');

describe('createSeating', () => {
  it('2명 미만은 거부', () => {
    expect(() => createSeating(['solo'], 'cw')).toThrow();
  });

  it('중복 플레이어는 거부', () => {
    expect(() => createSeating(['a', 'b', 'a'], 'cw')).toThrow();
  });
});

describe('nextPlayer', () => {
  it('마이티는 시계방향', () => {
    expect(nextPlayer(MIGHTY, 'p1')).toBe('p2');
    expect(nextPlayer(MIGHTY, 'p5')).toBe('p1');
  });

  it('티츄는 반시계방향 — 공식 룰', () => {
    expect(nextPlayer(TICHU, 'n')).toBe('w');
    expect(nextPlayer(TICHU, 'w')).toBe('s');
    expect(nextPlayer(TICHU, 's')).toBe('e');
    expect(nextPlayer(TICHU, 'e')).toBe('n');
  });

  it('skip 대상을 건너뛴다 (손패 빈 플레이어)', () => {
    const empty = new Set(['p2', 'p3']);
    expect(nextPlayer(MIGHTY, 'p1', { skip: (p) => empty.has(p) })).toBe('p4');
  });

  it('자기 자신은 후보가 아니다', () => {
    const others = new Set(['p2', 'p3', 'p4', 'p5']);
    expect(nextPlayer(MIGHTY, 'p1', { skip: (p) => others.has(p) })).toBeNull();
  });

  it('전원이 skip 대상이면 null', () => {
    expect(nextPlayer(MIGHTY, 'p1', { skip: () => true })).toBeNull();
  });

  it('좌석에 없는 플레이어는 예외', () => {
    expect(() => nextPlayer(MIGHTY, 'nobody')).toThrow();
  });
});

describe('playersFrom', () => {
  it('자신을 포함해 진행 방향으로 한 바퀴', () => {
    expect(playersFrom(MIGHTY, 'p3')).toEqual(['p3', 'p4', 'p5', 'p1', 'p2']);
  });

  it('반시계 방향도 올바르게', () => {
    expect(playersFrom(TICHU, 'n')).toEqual(['n', 'w', 's', 'e']);
  });
});

describe('oppositeOf', () => {
  it('티츄 파트너는 마주 앉은 사람', () => {
    expect(oppositeOf(TICHU, 'n')).toBe('s');
    expect(oppositeOf(TICHU, 'e')).toBe('w');
    expect(oppositeOf(TICHU, 's')).toBe('n');
  });

  it('파트너 관계는 대칭이다', () => {
    for (const seat of TICHU.seats) {
      const partner = oppositeOf(TICHU, seat);
      expect(partner).not.toBeNull();
      expect(oppositeOf(TICHU, partner as string)).toBe(seat);
    }
  });

  it('홀수 인원(마이티 5인)에는 마주 앉은 사람이 없다', () => {
    expect(oppositeOf(MIGHTY, 'p1')).toBeNull();
  });

  it('진행 방향과 무관하다 — 물리 배치로만 결정', () => {
    const cw = createSeating(['n', 'e', 's', 'w'], 'cw');
    expect(oppositeOf(cw, 'n')).toBe(oppositeOf(TICHU, 'n'));
  });
});

describe('seatIndex', () => {
  it('없는 플레이어는 -1', () => {
    expect(seatIndex(MIGHTY, 'ghost')).toBe(-1);
  });
});

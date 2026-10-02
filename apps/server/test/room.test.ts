import type { MightyView } from '@mightichu/mighty';
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room.js';
import { RoomRegistry } from '../src/rooms.js';

function roomWith(humans: number): Room {
  const room = new Room('TEST1', 'mighty');
  for (let i = 0; i < humans; i++) {
    const result = room.join(`사람${i + 1}`, `token${i + 1}`, `socket${i + 1}`);
    expect('code' in result).toBe(false);
  }
  while (room.members.length < 5) {
    const result = room.addBot();
    expect('code' in result).toBe(false);
  }
  return room;
}

describe('입장과 좌석', () => {
  it('좌석을 순서대로 배정한다', () => {
    const room = roomWith(2);
    expect(room.members.map((m) => m.seat)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(room.members.filter((m) => m.isBot)).toHaveLength(3);
  });

  it('첫 사람이 방장이다', () => {
    expect(roomWith(2).hostSeat).toBe('p1');
  });

  it('자리가 차면 거부한다', () => {
    const room = roomWith(1);
    const result = room.join('늦은사람', 'tokenX', 'socketX');
    expect(result).toMatchObject({ code: 'ROOM_FULL' });
  });

  it('같은 토큰이면 같은 자리로 돌아온다 (재접속)', () => {
    const room = roomWith(2);
    const again = room.join('사람1', 'token1', 'newsocket');
    expect('code' in again).toBe(false);
    if (!('code' in again)) {
      expect(again.seat).toBe('p1');
      expect(again.socketId).toBe('newsocket');
    }
    expect(room.members).toHaveLength(5);
  });

  it('시작 전 연결이 끊기면 자리를 비운다', () => {
    const room = roomWith(2);
    room.disconnect('socket2');
    expect(room.members.map((m) => m.token)).not.toContain('token2');
  });

  it('시작 후 연결이 끊겨도 자리를 지킨다 — 재접속을 위해', () => {
    const room = roomWith(2);
    room.start(7);
    room.disconnect('socket2');
    const member = room.findByToken('token2');
    expect(member).toBeDefined();
    expect(member?.socketId).toBeNull();
  });
});

describe('시작', () => {
  it('인원이 모자라면 거부한다', () => {
    const room = new Room('TEST2', 'mighty');
    room.join('혼자', 't', 's');
    expect(room.start()).toMatchObject({ code: 'NOT_ENOUGH' });
  });

  it('시작하면 봇이 사람 차례까지 알아서 진행한다', () => {
    const room = roomWith(1);
    expect(room.start(42)).toBeNull();
    expect(room.started).toBe(true);
    // p1 이 사람 — 사람이 할 일이 있거나 라운드가 이미 끝났다
    const hasWork = room.legalFor('p1').length > 0;
    expect(hasWork || room.isOver()).toBe(true);
  });

  it('봇만 5명이면 사람 개입 없이 라운드가 끝난다', () => {
    const room = new Room('TEST3', 'mighty');
    for (let i = 0; i < 5; i++) room.addBot();
    room.hostSeat = 'p1';
    // 봇만 있는 방은 start 가 바로 끝까지 돌린다
    const error = room.start(11);
    expect(error).toBeNull();
    expect(room.isOver()).toBe(true);
  });
});

describe('낙관적 동시성 (seq)', () => {
  it('어긋난 seq 는 거부한다', () => {
    const room = roomWith(1);
    room.start(42);
    if (room.legalFor('p1').length === 0) return;
    const action = room.legalFor('p1')[0];
    const stale = room.applyHuman('p1', room.seq + 99, action);
    expect(stale).toMatchObject({ code: 'STALE' });
  });

  it('맞는 seq 는 통과하고 seq 가 올라간다', () => {
    const room = roomWith(1);
    room.start(42);
    if (room.legalFor('p1').length === 0) return;
    const before = room.seq;
    const error = room.applyHuman('p1', before, room.legalFor('p1')[0]);
    expect(error).toBeNull();
    expect(room.seq).toBeGreaterThan(before);
  });

  it('불법 액션은 엔진 오류 코드를 그대로 돌려준다', () => {
    const room = roomWith(1);
    room.start(42);
    const error = room.applyHuman('p1', room.seq, { type: 'PLAY_CARD', card: 'S14' });
    expect(error).not.toBeNull();
  });
});

describe('리댁션 — 뷰는 자리마다 다르다', () => {
  it('남의 손패가 뷰에 들어있지 않다', () => {
    const room = roomWith(5);
    room.start(99);
    for (const member of room.members) {
      const view = room.viewFor(member.seat) as MightyView;
      expect(view.me).toBe(member.seat);
      expect(view.myHand.length).toBeGreaterThan(0);
      const json = JSON.stringify(view);
      for (const other of room.members) {
        if (other.seat === member.seat) continue;
        const otherView = room.viewFor(other.seat) as MightyView;
        const unique = otherView.myHand.filter((c) => !view.myHand.includes(c));
        // 프렌드 지명 카드는 공개 정보이므로 제외
        const named =
          view.friendCall?.kind === 'CARD' ? view.friendCall.card : null;
        for (const card of unique) {
          if (card === named) continue;
          expect(json).not.toContain(card);
        }
      }
    }
  });

  it('두 사람의 뷰가 서로 다르다', () => {
    const room = roomWith(5);
    room.start(99);
    const a = JSON.stringify(room.viewFor('p1'));
    const b = JSON.stringify(room.viewFor('p2'));
    expect(a).not.toBe(b);
  });
});

describe('매치 누적 점수', () => {
  it('라운드가 끝나면 totals 에 누적된다', () => {
    const room = new Room('TEST4', 'mighty');
    for (let i = 0; i < 5; i++) room.addBot();
    room.hostSeat = 'p1';
    room.start(5);
    expect(room.isOver()).toBe(true);
    const first = { ...room.totals };
    const sum = Object.values(first).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0); // 제로섬

    room.nextRound(6);
    expect(room.isOver()).toBe(true);
    const second = Object.values(room.totals).reduce((a, b) => a + b, 0);
    expect(second).toBe(0);
  });

  it('라운드 진행 중에는 다음 라운드를 시작할 수 없다', () => {
    const room = roomWith(1);
    room.start(42);
    if (room.isOver()) return;
    expect(room.nextRound()).toMatchObject({ code: 'ROUND_RUNNING' });
  });
});

describe('방 레지스트리', () => {
  it('방 ID 는 혼동되는 글자를 쓰지 않는다', () => {
    const registry = new RoomRegistry();
    for (let i = 0; i < 50; i++) {
      expect(registry.create('mighty').id).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
    }
  });

  it('방 ID 가 중복되지 않는다', () => {
    const registry = new RoomRegistry();
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) ids.add(registry.create('mighty').id);
    expect(ids.size).toBe(200);
  });

  it('사람이 없는 오래된 방을 정리한다', () => {
    const registry = new RoomRegistry();
    const room = registry.create('mighty');
    room.lastActivity = Date.now() - 20 * 60 * 1000;
    expect(registry.sweep()).toBe(1);
    expect(registry.get(room.id)).toBeUndefined();
  });

  it('사람이 접속해 있으면 정리하지 않는다', () => {
    const registry = new RoomRegistry();
    const room = registry.create('mighty');
    room.join('사람', 't', 's');
    room.lastActivity = Date.now() - 20 * 60 * 1000;
    expect(registry.sweep()).toBe(0);
  });
});

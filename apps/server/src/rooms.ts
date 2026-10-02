/** 방 레지스트리 — 인메모리. 다중 인스턴스가 필요해지면 Redis 로 옮긴다. */

import type { GameId } from '@mightichu/protocol';
import { Room } from './room.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동되는 0/O/1/I 제외
const ROOM_ID_LENGTH = 5;

/** 시작 전 방은 10분, 진행 중인 방은 2시간 뒤 정리한다. */
const IDLE_LOBBY_MS = 10 * 60 * 1000;
const IDLE_GAME_MS = 2 * 60 * 60 * 1000;

export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();

  private newId(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let id = '';
      for (let i = 0; i < ROOM_ID_LENGTH; i++) {
        id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      }
      if (!this.rooms.has(id)) return id;
    }
    throw new Error('방 ID 생성 실패');
  }

  create(game: GameId): Room {
    const room = new Room(this.newId(), game);
    this.rooms.set(room.id, room);
    return room;
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  forSocket(socketId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.members.some((m) => m.socketId === socketId)) return room;
    }
    return undefined;
  }

  remove(id: string): void {
    this.rooms.delete(id);
  }

  /** 빈 방 정리. 주기적으로 호출한다. */
  sweep(now = Date.now()): number {
    let removed = 0;
    for (const [id, room] of this.rooms) {
      if (room.connectedHumans > 0) continue;
      const idle = now - room.lastActivity;
      const limit = room.started ? IDLE_GAME_MS : IDLE_LOBBY_MS;
      if (idle > limit) {
        this.rooms.delete(id);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.rooms.size;
  }
}

/**
 * 멀티플레이 서버 — Node + Socket.IO.
 *
 * ⚠️ **상태를 브로드캐스트하지 않는다.** 히든 정보 게임이라 플레이어마다
 * 다른 뷰를 보내야 한다. `io.to(room).emit(state)` 는 전체 손패 유출이다.
 * 공개 정보(방 구성)만 브로드캐스트하고, 게임 상태는 항상 소켓별 개별 전송이다.
 */

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import {
  CHANNEL,
  ClientMessageSchema,
  PROTOCOL_VERSION,
  type ServerMessage,
} from '@mightichu/protocol';
import type { PlayerId } from '@mightichu/core';
import { RoomRegistry } from './rooms.js';
import type { Room } from './room.js';

export interface AppOptions {
  readonly origin?: string;
  /**
   * 봇이 생각하는 시간(ms). 사람이 **봇들이 뭘 냈는지** 볼 수 있어야 하므로
   * 한 수마다 뷰를 내보내고 간격을 둔다. 테스트는 0 으로 둔다.
   */
  readonly botStepMs?: number;
  /** 트릭이 끝난 뒤 "누가 먹었는지" 를 보여주는 시간(ms). */
  readonly trickHoldMs?: number;
}

export interface AppHandle {
  readonly http: ReturnType<typeof createServer>;
  readonly io: Server;
  readonly registry: RoomRegistry;
  close(): Promise<void>;
}

/** 서버를 만든다(listen 은 호출부에서). 테스트가 임의 포트로 띄울 수 있게 분리했다. */
export function createApp(options: AppOptions | string = {}): AppHandle {
const opts: AppOptions = typeof options === 'string' ? { origin: options } : options;
const ORIGIN = opts.origin ?? '*';
const BOT_STEP_MS = opts.botStepMs ?? 650;
const TRICK_HOLD_MS = opts.trickHoldMs ?? 1500;

const registry = new RoomRegistry();
const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: registry.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(http, { cors: { origin: ORIGIN } });

function send(socket: Socket, message: ServerMessage): void {
  socket.emit(CHANNEL.server, message);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function fail(socket: Socket, code: string, message: string): void {
  send(socket, { type: 'ERROR', code, message });
}

/** 방 구성은 공개 정보 — 브로드캐스트해도 된다. */
function broadcastRoom(room: Room): void {
  const message: ServerMessage = { type: 'ROOM', room: room.info() };
  for (const member of room.members) {
    if (member.socketId === null) continue;
    io.to(member.socketId).emit(CHANNEL.server, message);
  }
}

/**
 * 게임 상태는 **반드시 개별 전송.** 각자 자기 뷰만 받는다.
 * 이 함수가 서버 쪽 리댁션 경계다.
 */
function sendViews(room: Room): void {
  if (!room.started) return;
  for (const member of room.members) {
    if (member.isBot || member.socketId === null) continue;
    io.to(member.socketId).emit(CHANNEL.server, {
      type: 'VIEW',
      seq: room.seq,
      view: room.viewFor(member.seat),
      legal: room.legalFor(member.seat),
      log: room.log,
    } satisfies ServerMessage);
  }
  if (room.isOver()) {
    const message: ServerMessage = {
      type: 'SCORE',
      score: room.scoreOf(),
      totals: room.totals,
    };
    for (const member of room.members) {
      if (member.socketId === null) continue;
      io.to(member.socketId).emit(CHANNEL.server, message);
    }
  }
}

/**
 * 봇을 한 수씩 두며 매번 뷰를 내보낸다.
 * 방당 하나만 돌고, 사람 액션이 중간에 들어와도 다음 반복에서 최신 상태를 다시 읽는다.
 */
async function driveBots(room: Room): Promise<void> {
  if (room.botLoopRunning) return;
  room.botLoopRunning = true;
  try {
    for (let guard = 0; guard < 500; guard++) {
      await sleep(BOT_STEP_MS);
      const step = room.stepBot();
      if (step === null) break;
      sendViews(room);
      if (step.trickCompleted) await sleep(TRICK_HOLD_MS);
    }
  } finally {
    room.botLoopRunning = false;
  }
  sendViews(room);
}

io.on('connection', (socket) => {
  socket.on(CHANNEL.client, (raw: unknown) => {
    const parsed = ClientMessageSchema.safeParse(raw);
    if (!parsed.success) {
      fail(socket, 'BAD_MESSAGE', '알 수 없는 메시지입니다.');
      return;
    }
    const message = parsed.data;

    if (message.type === 'JOIN') {
      const room =
        message.roomId === undefined
          ? registry.create(message.game)
          : registry.get(message.roomId);
      if (room === undefined) {
        fail(socket, 'NO_ROOM', '그런 방이 없습니다.');
        return;
      }
      const token = message.token ?? randomBytes(12).toString('hex');
      const result = room.join(message.nickname, token, socket.id);
      if ('code' in result) {
        fail(socket, result.code, result.message);
        return;
      }
      send(socket, {
        type: 'JOINED',
        roomId: room.id,
        seat: result.seat,
        token,
        protocol: PROTOCOL_VERSION,
      });
      broadcastRoom(room);
      // 재접속이면 현재 뷰를 통째로 다시 보낸다 (델타 아님 — 단순함이 버그를 줄인다)
      sendViews(room);
      return;
    }

    const room = registry.forSocket(socket.id);
    if (room === undefined) {
      fail(socket, 'NOT_IN_ROOM', '방에 들어있지 않습니다.');
      return;
    }
    const me = room.members.find((m) => m.socketId === socket.id);
    if (me === undefined) {
      fail(socket, 'NOT_IN_ROOM', '방에 들어있지 않습니다.');
      return;
    }

    switch (message.type) {
      case 'LEAVE': {
        room.disconnect(socket.id);
        broadcastRoom(room);
        return;
      }
      case 'ADD_BOT': {
        if (room.hostSeat !== me.seat) {
          fail(socket, 'NOT_HOST', '방장만 할 수 있습니다.');
          return;
        }
        const result = room.addBot();
        if ('code' in result) fail(socket, result.code, result.message);
        broadcastRoom(room);
        return;
      }
      case 'REMOVE_BOT': {
        if (room.hostSeat !== me.seat) {
          fail(socket, 'NOT_HOST', '방장만 할 수 있습니다.');
          return;
        }
        const error = room.removeBot(message.seat as PlayerId);
        if (error !== null) fail(socket, error.code, error.message);
        broadcastRoom(room);
        return;
      }
      case 'START': {
        if (room.hostSeat !== me.seat) {
          fail(socket, 'NOT_HOST', '방장만 시작할 수 있습니다.');
          return;
        }
        const error = room.start();
        if (error !== null) {
          fail(socket, error.code, error.message);
          return;
        }
        broadcastRoom(room);
        sendViews(room);
        void driveBots(room);
        return;
      }
      case 'NEXT_ROUND': {
        if (room.hostSeat !== me.seat) {
          fail(socket, 'NOT_HOST', '방장만 할 수 있습니다.');
          return;
        }
        const error = room.nextRound();
        if (error !== null) {
          fail(socket, error.code, error.message);
          return;
        }
        sendViews(room);
        void driveBots(room);
        return;
      }
      case 'ACTION': {
        const error = room.applyHuman(me.seat, message.seq, message.action);
        if (error !== null) fail(socket, error.code, error.message);
        sendViews(room);
        void driveBots(room);
        return;
      }
    }
  });

  socket.on('disconnect', () => {
    const room = registry.forSocket(socket.id);
    if (room === undefined) return;
    room.disconnect(socket.id);
    broadcastRoom(room);
  });
});

const sweeper = setInterval(() => registry.sweep(), 60_000);
sweeper.unref();

return {
  http,
  io,
  registry,
  async close(): Promise<void> {
    clearInterval(sweeper);
    await io.close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  },
};
}

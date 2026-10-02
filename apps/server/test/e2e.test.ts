/**
 * 와이어 경로까지 포함한 e2e.
 *
 * 가장 중요한 검증: **두 플레이어가 서로 다른 뷰를 받는가.**
 * 상태를 브로드캐스트하는 실수는 여기서만 잡힌다.
 */

import type { AddressInfo } from 'node:net';
import { CHANNEL, type ClientMessage, type ServerMessage } from '@mightichu/protocol';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { MightyView } from '@mightichu/mighty';

let app: ReturnType<typeof createApp>;
let url: string;

beforeAll(async () => {
  // 테스트에서는 봇 연출 지연을 끈다
  app = createApp({ botStepMs: 0, trickHoldMs: 0 });
  await new Promise<void>((resolve) => app.http.listen(0, resolve));
  const address = app.http.address() as AddressInfo;
  url = `http://localhost:${address.port}`;
});

afterAll(async () => {
  await app.close();
});

interface Client {
  socket: Socket;
  messages: ServerMessage[];
  send(message: ClientMessage): void;
  /** 조건을 만족하는 메시지를 기다린다. */
  wait<T extends ServerMessage['type']>(type: T, timeout?: number): Promise<Extract<ServerMessage, { type: T }>>;
  latest<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined;
  close(): void;
}

async function client(): Promise<Client> {
  const socket = connect(url, { transports: ['websocket'], forceNew: true });
  const messages: ServerMessage[] = [];
  socket.on(CHANNEL.server, (m: ServerMessage) => messages.push(m));
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });

  return {
    socket,
    messages,
    send(message) {
      socket.emit(CHANNEL.client, message);
    },
    async wait(type, timeout = 2000) {
      const deadline = Date.now() + timeout;
      for (;;) {
        const found = [...messages].reverse().find((m) => m.type === type);
        if (found !== undefined) return found as never;
        if (Date.now() > deadline) throw new Error(`${type} 메시지를 기다리다 시간 초과`);
        await new Promise((r) => setTimeout(r, 15));
      }
    },
    latest(type) {
      return [...messages].reverse().find((m) => m.type === type) as never;
    },
    close() {
      socket.disconnect();
    },
  };
}

describe('방 만들기와 입장', () => {
  it('방을 만들고 좌석과 토큰을 받는다', async () => {
    const host = await client();
    host.send({ type: 'JOIN', nickname: '방장', game: 'mighty' });
    const joined = await host.wait('JOINED');
    expect(joined.seat).toBe('p1');
    expect(joined.token).toMatch(/^[a-f0-9]{24}$/);
    expect(joined.roomId).toHaveLength(5);
    host.close();
  });

  it('다른 사람이 방 코드로 들어온다', async () => {
    const host = await client();
    host.send({ type: 'JOIN', nickname: '방장', game: 'mighty' });
    const joined = await host.wait('JOINED');

    const guest = await client();
    guest.send({ type: 'JOIN', roomId: joined.roomId, nickname: '손님', game: 'mighty' });
    const guestJoined = await guest.wait('JOINED');
    expect(guestJoined.seat).toBe('p2');

    const room = await host.wait('ROOM');
    expect(room.room.members).toHaveLength(2);
    host.close();
    guest.close();
  });

  it('없는 방은 거부한다', async () => {
    const c = await client();
    c.send({ type: 'JOIN', roomId: 'ZZZZZ', nickname: '손님', game: 'mighty' });
    const error = await c.wait('ERROR');
    expect(error.code).toBe('NO_ROOM');
    c.close();
  });

  it('잘못된 메시지는 스키마에서 걸러진다', async () => {
    const c = await client();
    c.socket.emit(CHANNEL.client, { type: 'JOIN', nickname: '' });
    const error = await c.wait('ERROR');
    expect(error.code).toBe('BAD_MESSAGE');
    c.close();
  });
});

describe('게임 진행', () => {
  it('두 사람 + 봇 3 으로 시작하면 각자 다른 뷰를 받는다', async () => {
    const host = await client();
    host.send({ type: 'JOIN', nickname: '사람1', game: 'mighty' });
    const joined = await host.wait('JOINED');

    const guest = await client();
    guest.send({ type: 'JOIN', roomId: joined.roomId, nickname: '사람2', game: 'mighty' });
    await guest.wait('JOINED');

    for (let i = 0; i < 3; i++) host.send({ type: 'ADD_BOT' });
    await new Promise((r) => setTimeout(r, 120));

    host.send({ type: 'START' });
    const hostView = await host.wait('VIEW');
    const guestView = await guest.wait('VIEW');

    const a = hostView.view as MightyView;
    const b = guestView.view as MightyView;

    expect(a.me).toBe('p1');
    expect(b.me).toBe('p2');
    expect(a.myHand).toHaveLength(10);
    expect(b.myHand).toHaveLength(10);

    // ⚠️ 핵심: 서로의 손패가 섞여 들어가지 않았다
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    const aJson = JSON.stringify(a);
    for (const card of b.myHand) {
      expect(aJson).not.toContain(card);
    }

    host.close();
    guest.close();
  });

  it('방장이 아니면 시작할 수 없다', async () => {
    const host = await client();
    host.send({ type: 'JOIN', nickname: '사람1', game: 'mighty' });
    const joined = await host.wait('JOINED');
    const guest = await client();
    guest.send({ type: 'JOIN', roomId: joined.roomId, nickname: '사람2', game: 'mighty' });
    await guest.wait('JOINED');

    guest.send({ type: 'START' });
    const error = await guest.wait('ERROR');
    expect(error.code).toBe('NOT_HOST');
    host.close();
    guest.close();
  });

  it('인원이 모자라면 시작할 수 없다', async () => {
    const host = await client();
    host.send({ type: 'JOIN', nickname: '혼자', game: 'mighty' });
    await host.wait('JOINED');
    host.send({ type: 'START' });
    const error = await host.wait('ERROR');
    expect(error.code).toBe('NOT_ENOUGH');
    host.close();
  });

  it('낡은 seq 로 보낸 액션은 거부된다', async () => {
    const host = await client();
    host.send({ type: 'JOIN', nickname: '사람1', game: 'mighty' });
    await host.wait('JOINED');
    for (let i = 0; i < 4; i++) host.send({ type: 'ADD_BOT' });
    await new Promise((r) => setTimeout(r, 120));
    host.send({ type: 'START' });
    const view = await host.wait('VIEW');
    if (view.legal.length === 0) {
      host.close();
      return;
    }
    host.send({ type: 'ACTION', seq: view.seq + 50, action: view.legal[0] as Record<string, unknown> });
    const error = await host.wait('ERROR');
    expect(error.code).toBe('STALE');
    host.close();
  });
});

describe('재접속', () => {
  it('같은 토큰으로 돌아오면 자리와 뷰를 되찾는다', async () => {
    const host = await client();
    host.send({ type: 'JOIN', nickname: '사람1', game: 'mighty' });
    const joined = await host.wait('JOINED');
    for (let i = 0; i < 4; i++) host.send({ type: 'ADD_BOT' });
    await new Promise((r) => setTimeout(r, 120));
    host.send({ type: 'START' });
    const before = await host.wait('VIEW');
    const hand = (before.view as MightyView).myHand;

    host.close();
    await new Promise((r) => setTimeout(r, 120));

    const again = await client();
    again.send({
      type: 'JOIN',
      roomId: joined.roomId,
      nickname: '사람1',
      token: joined.token,
      game: 'mighty',
    });
    const rejoined = await again.wait('JOINED');
    expect(rejoined.seat).toBe(joined.seat);

    const after = await again.wait('VIEW');
    expect((after.view as MightyView).myHand).toEqual(hand);
    again.close();
  });
});

/**
 * 온라인 모드 — Socket.IO.
 *
 * AI 모드(`useGame`)와 **같은 모양**을 돌려준다. 워커를 서버로 바꿔도
 * UI 가 다루는 것은 여전히 "리댁션된 뷰 + 합법 수" 뿐이기 때문이다.
 * 추가로 방 정보(`room`)와 방 조작만 더 노출한다.
 */

import { CHANNEL, type ClientMessage, type RoomInfo, type ServerMessage } from '@mightichu/protocol';
import { io as connect, type Socket } from 'socket.io-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerId, RoundScore } from './types.js';
import type { GameId } from './registry.js';

const SERVER_URL = import.meta.env['VITE_SERVER_URL'] ?? 'http://localhost:3001';
const TOKEN_KEY = 'mightichu.token';
const ROOM_KEY = 'mightichu.room';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 사생활 모드 등 — 무시한다 */
  }
}

export interface OnlineState {
  readonly connected: boolean;
  readonly room: RoomInfo | null;
  readonly seat: PlayerId | null;
  readonly seq: number;
  readonly game: GameId;
  readonly view: unknown;
  readonly legal: readonly unknown[];
  readonly log: readonly string[];
  readonly score: RoundScore | null;
  readonly totals: Readonly<Record<string, number>>;
  readonly error: string | null;
}

const EMPTY: OnlineState = {
  game: 'mighty',
  connected: false,
  room: null,
  seat: null,
  seq: 0,
  view: null,
  legal: [],
  log: [],
  score: null,
  totals: {},
  error: null,
};

export interface OnlineApi {
  readonly state: OnlineState;
  join(nickname: string, game: GameId, roomId?: string): void;
  addBot(): void;
  removeBot(seat: PlayerId): void;
  start(): void;
  nextRound(): void;
  send(action: unknown): void;
  leave(): void;
}

export function useOnline(): OnlineApi {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<OnlineState>(EMPTY);

  useEffect(() => {
    const socket = connect(SERVER_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => setState((s) => ({ ...s, connected: true, error: null })));
    socket.on('disconnect', () => setState((s) => ({ ...s, connected: false })));
    socket.on('connect_error', () =>
      setState((s) => ({ ...s, connected: false, error: '서버에 연결할 수 없습니다.' })),
    );

    socket.on(CHANNEL.server, (message: ServerMessage) => {
      switch (message.type) {
        case 'JOINED':
          writeStorage(TOKEN_KEY, message.token);
          writeStorage(ROOM_KEY, message.roomId);
          setState((s) => ({ ...s, seat: message.seat, error: null }));
          break;
        case 'ROOM':
          setState((s) => ({
            ...s,
            game: message.room.game,
            room: message.room,
            // 로비로 돌아오면 이전 판 흔적을 지운다
            ...(message.room.started ? {} : { view: null, score: null, log: [] }),
          }));
          break;
        case 'VIEW':
          setState((s) => ({
            ...s,
            seq: message.seq,
            view: message.view,
            legal: message.legal,
            log: message.log,
            error: null,
            score:
              (message.view as { outcome?: unknown } | null)?.outcome == null ? null : s.score,
          }));
          break;
        case 'SCORE':
          setState((s) => ({
            ...s,
            score: message.score as RoundScore,
            totals: message.totals,
          }));
          break;
        case 'ERROR':
          setState((s) => ({ ...s, error: message.message }));
          break;
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const emit = useCallback((message: ClientMessage) => {
    socketRef.current?.emit(CHANNEL.client, message);
  }, []);

  const join = useCallback(
    (nickname: string, game: GameId, roomId?: string) => {
      const token = readStorage(TOKEN_KEY);
      setState((s) => ({ ...s, game }));
      emit({
        type: 'JOIN',
        nickname,
        game,
        ...(roomId === undefined ? {} : { roomId }),
        ...(token === null ? {} : { token }),
      } as ClientMessage);
    },
    [emit],
  );

  return {
    state,
    join,
    addBot: useCallback(() => emit({ type: 'ADD_BOT' }), [emit]),
    removeBot: useCallback((seat: PlayerId) => emit({ type: 'REMOVE_BOT', seat }), [emit]),
    start: useCallback(() => emit({ type: 'START' }), [emit]),
    nextRound: useCallback(() => emit({ type: 'NEXT_ROUND' }), [emit]),
    send: useCallback(
      (action: unknown) =>
        setState((s) => {
          emit({ type: 'ACTION', seq: s.seq, action: action as Record<string, unknown> });
          return s;
        }),
      [emit],
    ),
    leave: useCallback(() => emit({ type: 'LEAVE' }), [emit]),
  };
}

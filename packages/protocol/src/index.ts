/**
 * 서버↔클라 메시지 계약.
 *
 * **같은 zod 스키마를 양쪽이 쓴다.** 서버는 들어오는 메시지를 반드시 파싱해서
 * 신뢰하지 않은 입력을 거른다. 클라는 타입만 가져다 쓴다.
 *
 * 액션 자체(`MightyAction` 등)는 게임별 타입이라 여기서 구조 검증을 하지 않는다 —
 * 어차피 엔진의 `legalActions`/`apply` 가 최종 판정을 하므로,
 * 여기서는 "JSON 객체인가" 수준만 보고 통과시킨다.
 */

import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

export const GameIdSchema = z.enum(['mighty', 'tichu']);
export type GameId = z.infer<typeof GameIdSchema>;

export const NicknameSchema = z.string().trim().min(1).max(12);
export const RoomIdSchema = z.string().regex(/^[A-Z0-9]{4,8}$/);
/** 재접속 신원. 클라가 localStorage 에 보관한다. */
export const PlayerTokenSchema = z.string().regex(/^[a-z0-9]{8,40}$/);

/** 게임별 액션은 엔진이 검증한다. 여기서는 형태만 본다. */
const ActionSchema = z.record(z.string(), z.unknown());

// ─────────────────────────────── 클라 → 서버

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('JOIN'),
    roomId: RoomIdSchema.optional(),
    nickname: NicknameSchema,
    token: PlayerTokenSchema.optional(),
    game: GameIdSchema.default('mighty'),
  }),
  z.object({ type: z.literal('LEAVE') }),
  z.object({ type: z.literal('ADD_BOT') }),
  z.object({ type: z.literal('REMOVE_BOT'), seat: z.string() }),
  z.object({ type: z.literal('START') }),
  z.object({ type: z.literal('NEXT_ROUND') }),
  z.object({
    type: z.literal('ACTION'),
    /** 이 액션이 기반한 상태 버전. 어긋나면 서버가 거부한다(낙관적 동시성). */
    seq: z.number().int().nonnegative(),
    action: ActionSchema,
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ─────────────────────────────── 서버 → 클라

export interface MemberInfo {
  readonly seat: string;
  readonly nickname: string;
  readonly isBot: boolean;
  readonly connected: boolean;
}

export interface RoomInfo {
  readonly roomId: string;
  readonly game: GameId;
  readonly hostSeat: string;
  readonly members: readonly MemberInfo[];
  readonly started: boolean;
  readonly requiredPlayers: number;
}

export type ServerMessage =
  | {
      readonly type: 'JOINED';
      readonly roomId: string;
      readonly seat: string;
      readonly token: string;
      readonly protocol: number;
    }
  | { readonly type: 'ROOM'; readonly room: RoomInfo }
  | {
      readonly type: 'VIEW';
      /** 상태 버전. 클라는 액션에 이 값을 실어 보낸다. */
      readonly seq: number;
      readonly view: unknown;
      readonly legal: readonly unknown[];
      readonly log: readonly string[];
    }
  | {
      readonly type: 'SCORE';
      readonly score: unknown;
      /** 매치 누적 점수. */
      readonly totals: Readonly<Record<string, number>>;
      /** 라운드별 결과 — 점수표에 쓴다. */
      readonly history: readonly Readonly<Record<string, number>>[];
    }
  | { readonly type: 'ERROR'; readonly code: string; readonly message: string };

/** 소켓 이벤트 이름 — 양쪽이 같은 상수를 쓴다. */
export const CHANNEL = {
  client: 'c',
  server: 's',
} as const;

/**
 * 클라이언트 게임 레지스트리 — 서버의 `games.ts` 와 같은 역할.
 * 워커가 어떤 게임인지 모른 채 `GameEngine` 만 들고 돌 수 있게 한다.
 */

import { createMightyBasicBot, createTichuBasicBot } from '@mightichu/bots';
import type { Bot, GameEngine, PlayerId } from '@mightichu/core';
import { mightyEngine } from '@mightichu/mighty';
import { tichuEngine } from '@mightichu/tichu';

export type GameId = 'mighty' | 'tichu';

export interface GameEntry {
  readonly engine: GameEngine<never, never, unknown, never>;
  readonly bot: Bot<unknown, never>;
  readonly seats: readonly PlayerId[];
  readonly label: string;
  readonly subtitle: string;
}

const MIGHTY_SEATS: readonly PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5'];
const TICHU_SEATS: readonly PlayerId[] = ['p1', 'p2', 'p3', 'p4'];

export const GAMES: Record<GameId, GameEntry> = {
  mighty: {
    engine: mightyEngine as unknown as GameEntry['engine'],
    bot: createMightyBasicBot() as unknown as GameEntry['bot'],
    seats: MIGHTY_SEATS,
    label: '마이티',
    subtitle: '5인 · 숨은 프렌드',
  },
  tichu: {
    engine: tichuEngine as unknown as GameEntry['engine'],
    bot: createTichuBasicBot() as unknown as GameEntry['bot'],
    seats: TICHU_SEATS,
    label: '티츄',
    subtitle: '4인 · 2:2 팀',
  },
};

/** AI 모드에서 사람이 앉는 자리. */
export const HUMAN: PlayerId = 'p1';

/**
 * 게임 레지스트리.
 *
 * 서버는 **어떤 게임인지 모른다** — `GameEngine` 계약만 보고 라우팅한다.
 * 티츄(4단계)를 넣을 때 서버 코드는 이 파일의 한 줄 외에 바뀌지 않는다.
 */

import { createMightyBasicBot, createTichuBasicBot } from '@mightichu/bots';
import type { Bot, GameEngine } from '@mightichu/core';
import { mightyEngine } from '@mightichu/mighty';
import { tichuEngine } from '@mightichu/tichu';
import type { GameId } from '@mightichu/protocol';

export interface GameEntry {
  readonly engine: GameEngine<never, never, unknown, never>;
  readonly bot: Bot<unknown, never>;
  readonly players: number;
  readonly label: string;
}

const registry: Record<GameId, GameEntry> = {
  mighty: {
    engine: mightyEngine as unknown as GameEntry['engine'],
    bot: createMightyBasicBot() as unknown as GameEntry['bot'],
    players: mightyEngine.maxPlayers,
    label: '마이티',
  },
  tichu: {
    engine: tichuEngine as unknown as GameEntry['engine'],
    bot: createTichuBasicBot() as unknown as GameEntry['bot'],
    players: tichuEngine.maxPlayers,
    label: '티츄',
  },
};

export function gameEntry(id: GameId): GameEntry {
  return registry[id];
}

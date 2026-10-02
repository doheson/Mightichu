/**
 * 계약 검증용 최소 게임 "미니".
 *
 * 실제 게임이 아니라 `GameEngine` 계약이 구현 가능한지, 그리고 속성 테스트
 * (합법수↔apply 정합성, 리댁션, JSON 안전성, 리플레이)가 작동하는지 확인하는 하네스다.
 * 마이티/티츄가 들어오기 전에 계약의 모양을 검증하는 역할.
 *
 * 룰: 각자 숫자 카드를 N장 받고 한 장씩 낸다. 전원이 내면 가장 큰 수가 그 트릭을 먹는다.
 *     숨은 정보 = 남의 손패.
 */

import type { Applied, GameEngine, InitContext, RoundScore } from '../src/engine.js';
import { createRng, shuffle } from '../src/rng.js';
import { createSeating, nextPlayer, type Seating } from '../src/seating.js';
import { err, ok, type PlayerId, type Result } from '../src/types.js';

export interface MiniConfig {
  readonly handSize: number;
}

/**
 * 카드 식별자는 **구별되는 토큰 문자열**로 둔다 (`'c001'`, `'c014'`).
 * 맨 정수를 쓰면 리댁션 테스트의 문자열 검사가 플레이어 이름('p2')이나
 * 장수 카운트와 충돌해 거짓 양성이 난다. 실제 게임도 같은 이유로
 * 카드 id 를 토큰(`'S_A'`, `'DRAGON'`)으로 둘 것. 0 패딩이라 사전순 비교가 끗 비교와 일치한다.
 */
export type MiniCard = string;

function makeCard(n: number): MiniCard {
  return `c${String(n).padStart(3, '0')}`;
}

export interface MiniPlay {
  readonly player: PlayerId;
  readonly card: MiniCard;
}

export interface MiniState {
  readonly seating: Seating;
  readonly hands: Readonly<Record<PlayerId, readonly MiniCard[]>>;
  readonly table: readonly MiniPlay[];
  readonly won: Readonly<Record<PlayerId, number>>;
  readonly turn: PlayerId | null;
}

export type MiniAction = { readonly type: 'PLAY'; readonly card: MiniCard };

export interface MiniView {
  readonly me: PlayerId;
  readonly myHand: readonly MiniCard[];
  readonly handCounts: Readonly<Record<PlayerId, number>>;
  readonly table: readonly MiniPlay[];
  readonly won: Readonly<Record<PlayerId, number>>;
  readonly turn: PlayerId | null;
}

function handOf(state: MiniState, player: PlayerId): readonly MiniCard[] {
  return state.hands[player] ?? [];
}

function resolveTrick(state: MiniState): MiniState {
  let best = state.table[0] as MiniPlay;
  for (const play of state.table) {
    if (play.card > best.card) best = play;
  }
  const won = { ...state.won, [best.player]: (state.won[best.player] ?? 0) + 1 };
  const stillHolding = handOf({ ...state, won }, best.player).length > 0;
  const turn = stillHolding
    ? best.player
    : nextPlayer(state.seating, best.player, {
        skip: (p) => handOf(state, p).length === 0,
      });
  return { ...state, table: [], won, turn };
}

export const miniEngine: GameEngine<MiniState, MiniAction, MiniView, MiniConfig> = {
  id: 'mini',
  minPlayers: 2,
  maxPlayers: 6,

  init({ config, players, seed }: InitContext<MiniConfig>): MiniState {
    const rng = createRng(seed);
    const total = players.length * config.handSize;
    const deck = shuffle(
      Array.from({ length: total }, (_, i) => makeCard(i + 1)),
      rng,
    );

    const hands: Record<PlayerId, readonly MiniCard[]> = {};
    const won: Record<PlayerId, number> = {};
    players.forEach((player, index) => {
      hands[player] = deck.slice(index * config.handSize, (index + 1) * config.handSize);
      won[player] = 0;
    });

    return {
      seating: createSeating(players, 'cw'),
      hands,
      table: [],
      won,
      turn: players[0] ?? null,
    };
  },

  legalActions(state, player) {
    if (state.turn !== player) return [];
    return handOf(state, player).map((card) => ({ type: 'PLAY', card }) as const);
  },

  apply(state, player, action): Result<Applied<MiniState>> {
    if (state.turn !== player) {
      return err('NOT_YOUR_TURN', `${player} 의 차례가 아님`);
    }
    const hand = handOf(state, player);
    if (!hand.includes(action.card)) {
      return err('CARD_NOT_IN_HAND', `${player} 는 ${action.card} 를 갖고 있지 않음`);
    }

    const removed = hand.filter((c) => c !== action.card);
    const table = [...state.table, { player, card: action.card }];
    let next: MiniState = {
      ...state,
      hands: { ...state.hands, [player]: removed },
      table,
    };

    if (table.length === next.seating.seats.length) {
      next = resolveTrick(next);
    } else {
      next = {
        ...next,
        turn: nextPlayer(next.seating, player, {
          skip: (p) => p !== player && handOf(next, p).length === 0,
        }),
      };
    }

    return ok({
      state: next,
      events: [{ type: 'PLAYED', payload: { player, card: action.card } }],
    });
  },

  view(state, viewer): MiniView {
    const handCounts: Record<PlayerId, number> = {};
    for (const seat of state.seating.seats) {
      handCounts[seat] = handOf(state, seat).length;
    }
    return {
      me: viewer,
      myHand: handOf(state, viewer),
      handCounts,
      table: state.table,
      won: state.won,
      turn: state.turn,
    };
  },

  isOver(state) {
    return state.seating.seats.every((p) => handOf(state, p).length === 0);
  },

  score(state): RoundScore {
    return { perPlayer: state.won };
  },
};

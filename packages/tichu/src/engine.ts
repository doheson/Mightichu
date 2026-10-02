/**
 * 티츄 룰 엔진 — `GameEngine` 구현.
 *
 * 상태 흐름:
 *   GRAND(8장) → EXCHANGE(14장, 3명에게 1장씩) → PLAY → DONE
 *   용으로 트릭을 먹으면 중간에 DRAGON_GIFT 를 거친다.
 *
 * 설계 요점:
 *  - **진행 방향은 반시계(ccw)** — 공식 룰. 흔한 구현 실수 지점이다.
 *  - `legalActions` 는 턴을 묻지 않는다. 폭탄(아웃 오브 턴)과 스몰 티츄 선언이
 *    비차례 플레이어의 합법 수로 그냥 나타난다 — 인터럽트 개념이 필요 없어진다.
 *  - 교환은 받는 사람별 `GIVE` 한 장씩. 한 번에 묶으면 합법 수가 2000가지를 넘는다.
 */

import {
  createRng,
  createSeating,
  err,
  nextPlayer,
  ok,
  oppositeOf,
  shuffle,
  type Applied,
  type GameEngine,
  type GameEvent,
  type PlayerId,
  type Result,
  type RoundScore,
} from '@mightichu/core';

import {
  DOG,
  DRAGON,
  FIRST_DEAL,
  HAND_SIZE,
  PLAYER_COUNT,
  SPARROW,
  cardLabel,
  countPoints,
  fullDeck,
  rankOf,
} from './cards.js';
import {
  beats,
  canFulfillWish,
  isBomb,
  legalPlays,
  parseCards,
} from './combos.js';
import { computeScore } from './scoring.js';
import type {
  Card,
  CompletedTrick,
  Play,
  TichuAction,
  TichuConfig,
  TichuState,
  TichuView,
} from './types.js';

export { PLAYER_COUNT, HAND_SIZE, FIRST_DEAL };

// ─────────────────────────────── 보조

function handOf(state: TichuState, player: PlayerId): readonly Card[] {
  return state.hands[player] ?? [];
}

function seating(state: TichuState) {
  // 진행 방향은 반시계 — 공식 룰
  return createSeating(state.seats, 'ccw');
}

function partnerOf(state: TichuState, player: PlayerId): PlayerId | null {
  return oppositeOf(createSeating(state.seats, 'cw'), player);
}

function teamsOf(state: TichuState): PlayerId[][] {
  const [a, b, c, d] = state.seats as readonly PlayerId[];
  return [
    [a as PlayerId, c as PlayerId],
    [b as PlayerId, d as PlayerId],
  ];
}

function activePlayers(state: TichuState): PlayerId[] {
  return state.seats.filter((p) => handOf(state, p).length > 0);
}

/** 진행 방향의 다음, 손패가 남은 사람만. */
function nextWithCards(state: TichuState, from: PlayerId): PlayerId | null {
  return nextPlayer(seating(state), from, {
    skip: (p) => handOf(state, p).length === 0,
  });
}

function isLeading(state: TichuState): boolean {
  return state.currentCombo === null;
}

// ─────────────────────────────── init

function deal(config: TichuConfig, players: readonly PlayerId[], seed: number): TichuState {
  void config;
  const rng = createRng(seed);
  const deck = shuffle(fullDeck(), rng);
  const seats = [...players];

  const hands: Record<PlayerId, readonly Card[]> = {};
  const pending: Record<PlayerId, readonly Card[]> = {};
  const calls: Record<PlayerId, 'NONE'> = {};
  const hasPlayed: Record<PlayerId, boolean> = {};
  const given: Record<PlayerId, Record<PlayerId, Card>> = {};
  const taken: Record<PlayerId, readonly Card[]> = {};

  seats.forEach((player, index) => {
    const whole = deck.slice(index * HAND_SIZE, (index + 1) * HAND_SIZE);
    hands[player] = whole.slice(0, FIRST_DEAL);
    pending[player] = whole.slice(FIRST_DEAL);
    calls[player] = 'NONE';
    hasPlayed[player] = false;
    given[player] = {};
    taken[player] = [];
  });

  return {
    phase: 'GRAND',
    seats,
    hands,
    pending,
    calls,
    grandDecided: [],
    hasPlayed,
    given,
    leader: null,
    turn: null,
    currentTrick: [],
    currentCombo: null,
    lastPlayer: null,
    passStreak: 0,
    wish: null,
    taken,
    discarded: [],
    finished: [],
    lastTrick: null,
    dragonGift: null,
    outcome: null,
  };
}

// ─────────────────────────────── 단계 전이

function finishGrand(state: TichuState): TichuState {
  const hands: Record<PlayerId, readonly Card[]> = {};
  const pending: Record<PlayerId, readonly Card[]> = {};
  for (const seat of state.seats) {
    hands[seat] = [...handOf(state, seat), ...(state.pending[seat] ?? [])];
    pending[seat] = [];
  }
  return { ...state, phase: 'EXCHANGE', hands, pending };
}

function exchangeDone(state: TichuState, player: PlayerId): boolean {
  return Object.keys(state.given[player] ?? {}).length === PLAYER_COUNT - 1;
}

/** 전원이 3장씩 넘겼으면 실제로 교환하고 플레이를 시작한다. */
function finishExchange(state: TichuState): TichuState {
  const hands: Record<PlayerId, Card[]> = {};
  for (const seat of state.seats) {
    const sent = new Set(Object.values(state.given[seat] ?? {}));
    hands[seat] = handOf(state, seat).filter((c) => !sent.has(c));
  }
  for (const from of state.seats) {
    for (const [to, card] of Object.entries(state.given[from] ?? {})) {
      (hands[to] as Card[]).push(card);
    }
  }
  // 참새를 쥔 사람이 첫 리드
  const leader =
    state.seats.find((p) => (hands[p] as Card[]).includes(SPARROW)) ??
    (state.seats[0] as PlayerId);

  return {
    ...state,
    phase: 'PLAY',
    hands,
    leader,
    turn: leader,
    currentTrick: [],
    currentCombo: null,
    lastPlayer: null,
    passStreak: 0,
  };
}

// ─────────────────────────────── 트릭 종료

/** 이 트릭을 닫아야 하는가 — 마지막으로 낸 사람 외 모두가 패스했는가. */
function shouldCloseTrick(state: TichuState): boolean {
  if (state.lastPlayer === null) return false;
  const others = state.seats.filter(
    (p) => p !== state.lastPlayer && handOf(state, p).length > 0,
  );
  return state.passStreak >= others.length;
}

function closeTrick(state: TichuState): { state: TichuState; events: GameEvent[] } {
  const winner = state.lastPlayer as PlayerId;
  const cards = state.currentTrick.flatMap((p) => p.combo.cards);
  const points = countPoints(cards);
  const events: GameEvent[] = [];

  // 용으로 먹은 트릭은 상대팀 한 명에게 넘겨야 한다. 폭탄으로 깨진 트릭은 예외.
  const winningCombo = state.currentTrick[state.currentTrick.length - 1]?.combo;
  const wonWithDragon = winningCombo?.cards.includes(DRAGON) === true;

  if (wonWithDragon) {
    return {
      state: {
        ...state,
        phase: 'DRAGON_GIFT',
        turn: winner,
        dragonGift: { winner, cards, points, plays: state.currentTrick },
        // 카드는 dragonGift 가 들고 있다. 여기 남겨두면 이중 계산이 된다.
        currentTrick: [],
        currentCombo: null,
        lastPlayer: null,
        passStreak: 0,
      },
      events: [{ type: 'DRAGON_TRICK', payload: { winner } }],
    };
  }

  events.push({
    type: 'TRICK_WON',
    payload: { winner, points, cards: cards.length },
  });

  const taken = { ...state.taken, [winner]: [...(state.taken[winner] ?? []), ...cards] };
  const completed: CompletedTrick = {
    plays: state.currentTrick,
    winner,
    points,
    giftedTo: null,
  };

  return {
    state: startNextTrick({ ...state, taken, lastTrick: completed }, winner),
    events,
  };
}

/** 다음 트릭 리드를 정한다. 승자가 이미 나갔으면 진행 방향 다음 사람. */
function startNextTrick(state: TichuState, winner: PlayerId): TichuState {
  const leader =
    handOf(state, winner).length > 0 ? winner : nextWithCards(state, winner);

  return {
    ...state,
    currentTrick: [],
    currentCombo: null,
    lastPlayer: null,
    passStreak: 0,
    leader,
    turn: leader,
  };
}

/** 라운드 종료 판정. */
function settleIfOver(state: TichuState): TichuState {
  if (state.outcome !== null) return state;
  // 용으로 먹은 트릭을 아직 넘기지 않았다면 끝낼 수 없다 —
  // 여기서 끝내면 그 트릭의 카드와 점수가 통째로 사라진다.
  if (state.dragonGift !== null) return state;

  // 더블윈 — 한 팀이 1·2등
  if (state.finished.length >= 2) {
    const [first, second] = state.finished;
    if (partnerOf(state, first as PlayerId) === second) {
      return {
        ...state,
        phase: 'DONE',
        turn: null,
        outcome: { kind: 'DOUBLE_WIN', team: [first as PlayerId, second as PlayerId] },
      };
    }
  }

  if (activePlayers(state).length > 1) return state;

  // 진행 중인 트릭이 남아 있으면 먼저 닫는다.
  // 마지막 사람이 트릭 도중에 나가면 테이블 위 카드가 통째로 사라진다.
  if (state.currentTrick.length > 0 && state.lastPlayer !== null) {
    const closed = closeTrick(state);
    // 용으로 먹었다면 양도 단계를 거쳐야 한다 — 거기서 다시 settleIfOver 가 돈다
    if (closed.state.phase === 'DRAGON_GIFT') return closed.state;
    return settleIfOver(closed.state);
  }

  // 마지막 한 명: 손패는 상대팀에게, 모은 트릭은 1등에게
  const loser = activePlayers(state)[0];
  const first = state.finished[0] as PlayerId;
  let taken = { ...state.taken };

  if (loser !== undefined) {
    const opponents = teamsOf(state).find((t) => !t.includes(loser)) ?? [];
    const opponent = opponents[0];
    if (opponent !== undefined) {
      taken = {
        ...taken,
        [opponent]: [...(taken[opponent] ?? []), ...handOf(state, loser)],
      };
    }
    taken = {
      ...taken,
      [first]: [...(taken[first] ?? []), ...(taken[loser] ?? [])],
      [loser]: [],
    };
  }

  return {
    ...state,
    phase: 'DONE',
    turn: null,
    taken,
    hands: loser === undefined ? state.hands : { ...state.hands, [loser]: [] },
    finished: loser === undefined ? state.finished : [...state.finished, loser],
    outcome: { kind: 'NORMAL' },
  };
}

// ─────────────────────────────── legalActions

function legalGrand(state: TichuState, player: PlayerId): TichuAction[] {
  const actions: TichuAction[] = [];
  if (!state.grandDecided.includes(player)) {
    actions.push({ type: 'DECLARE_GRAND' }, { type: 'PASS_GRAND' });
  }
  if (state.calls[player] === 'NONE' && !state.grandDecided.includes(player)) {
    // 라지를 포기하기 전에도 스몰은 선언할 수 있다
    actions.push({ type: 'DECLARE_TICHU' });
  }
  return actions;
}

function legalExchange(state: TichuState, player: PlayerId): TichuAction[] {
  const actions: TichuAction[] = [];
  if (state.calls[player] === 'NONE' && !state.hasPlayed[player]) {
    actions.push({ type: 'DECLARE_TICHU' });
  }
  const given = state.given[player] ?? {};
  const committed = new Set(Object.values(given));
  for (const to of state.seats) {
    if (to === player || given[to] !== undefined) continue;
    for (const card of handOf(state, player)) {
      if (committed.has(card)) continue;
      actions.push({ type: 'GIVE', to, card });
    }
  }
  return actions;
}

function legalPlayPhase(state: TichuState, player: PlayerId): TichuAction[] {
  const actions: TichuAction[] = [];
  const hand = handOf(state, player);
  if (hand.length === 0) return actions;

  // 스몰 티츄 — 내 첫 카드를 내기 전이면 **남의 차례 중에도** 가능
  if (state.calls[player] === 'NONE' && !state.hasPlayed[player]) {
    actions.push({ type: 'DECLARE_TICHU' });
  }

  const myTurn = state.turn === player;
  const leading = isLeading(state) && myTurn;
  const plays = legalPlays(hand, state.currentCombo, { isLeading: leading });

  for (const combo of plays) {
    // 내 차례가 아니면 폭탄만 — 아웃 오브 턴
    if (!myTurn && !isBomb(combo)) continue;
    if (!myTurn && !beats(combo, state.currentCombo)) continue;

    if (combo.cards.includes(SPARROW)) {
      // 참새를 내면 소원을 건다 (걸지 않을 수도 있다)
      actions.push({ type: 'PLAY', cards: combo.cards });
      for (let wish = 2; wish <= 14; wish++) {
        actions.push({ type: 'PLAY', cards: combo.cards, wish });
      }
      continue;
    }
    actions.push({ type: 'PLAY', cards: combo.cards });
  }

  // 소원이 걸려 있고 이행할 수 있으면 **반드시 이행**해야 한다
  if (
    state.wish !== null &&
    myTurn &&
    canFulfillWish(hand, state.wish, state.currentCombo, { isLeading: leading })
  ) {
    const wish = state.wish;
    const forced = actions.filter(
      (a) => a.type === 'PLAY' && a.cards.some((c) => rankOf(c) === wish),
    );
    const keep = actions.filter((a) => a.type === 'DECLARE_TICHU');
    return [...keep, ...forced];
  }

  if (myTurn && !isLeading(state)) actions.push({ type: 'PASS' });
  return actions;
}

function legalDragonGift(state: TichuState, player: PlayerId): TichuAction[] {
  const gift = state.dragonGift;
  if (gift === null || gift.winner !== player) return [];
  const opponents = teamsOf(state).find((t) => !t.includes(player)) ?? [];
  return opponents.map((to) => ({ type: 'GIVE_DRAGON', to }) as const);
}

// ─────────────────────────────── apply

function applyAction(
  state: TichuState,
  player: PlayerId,
  action: TichuAction,
): Result<Applied<TichuState>> {
  switch (action.type) {
    case 'DECLARE_GRAND':
    case 'PASS_GRAND': {
      if (state.phase !== 'GRAND') return err('WRONG_PHASE', '라지 티츄 단계가 아님');
      if (state.grandDecided.includes(player)) {
        return err('ALREADY_DECIDED', '이미 정했음');
      }
      const calls =
        action.type === 'DECLARE_GRAND'
          ? { ...state.calls, [player]: 'GRAND' as const }
          : state.calls;
      const decided = [...state.grandDecided, player];
      let next: TichuState = { ...state, calls, grandDecided: decided };
      if (decided.length === PLAYER_COUNT) next = finishGrand(next);
      return ok({
        state: next,
        events:
          action.type === 'DECLARE_GRAND'
            ? [{ type: 'TICHU_CALLED', payload: { player, call: 'GRAND' } }]
            : [],
      });
    }

    case 'DECLARE_TICHU': {
      if (state.phase === 'DONE') return err('WRONG_PHASE', '라운드가 끝남');
      if (state.calls[player] !== 'NONE') return err('ALREADY_CALLED', '이미 선언함');
      if (state.hasPlayed[player] === true) {
        return err('TOO_LATE', '첫 카드를 낸 뒤에는 선언할 수 없음');
      }
      return ok({
        state: { ...state, calls: { ...state.calls, [player]: 'SMALL' } },
        events: [{ type: 'TICHU_CALLED', payload: { player, call: 'SMALL' } }],
      });
    }

    case 'GIVE': {
      if (state.phase !== 'EXCHANGE') return err('WRONG_PHASE', '교환 단계가 아님');
      if (action.to === player) return err('BAD_TARGET', '자기 자신에게는 못 보냄');
      if (!state.seats.includes(action.to)) return err('BAD_TARGET', '없는 플레이어');
      const given = state.given[player] ?? {};
      if (given[action.to] !== undefined) return err('ALREADY_GIVEN', '이미 보냄');
      if (!handOf(state, player).includes(action.card)) {
        return err('CARD_NOT_IN_HAND', `${cardLabel(action.card)} 를 갖고 있지 않음`);
      }
      if (Object.values(given).includes(action.card)) {
        return err('CARD_COMMITTED', '이미 다른 사람에게 배정한 카드');
      }

      let next: TichuState = {
        ...state,
        given: { ...state.given, [player]: { ...given, [action.to]: action.card } },
      };
      if (next.seats.every((p) => exchangeDone(next, p))) next = finishExchange(next);
      return ok({ state: next, events: [] });
    }

    case 'PLAY': {
      if (state.phase !== 'PLAY') return err('WRONG_PHASE', '플레이 단계가 아님');
      const hand = handOf(state, player);
      for (const card of action.cards) {
        if (!hand.includes(card)) {
          return err('CARD_NOT_IN_HAND', `${cardLabel(card)} 를 갖고 있지 않음`);
        }
      }
      if (new Set(action.cards).size !== action.cards.length) {
        return err('DUPLICATE_CARD', '같은 카드를 중복 지정함');
      }

      const myTurn = state.turn === player;
      const leading = isLeading(state) && myTurn;
      const combo = parseCards(action.cards, state.currentCombo);
      if (combo === null) return err('NOT_A_COMBO', '유효한 조합이 아님');

      if (!myTurn) {
        // 아웃 오브 턴은 폭탄만
        if (!isBomb(combo)) return err('NOT_YOUR_TURN', '차례가 아님 (폭탄만 가능)');
        if (!beats(combo, state.currentCombo)) {
          return err('TOO_WEAK', '현재 조합을 이기지 못함');
        }
      } else if (combo.type === 'DOG') {
        if (!leading) return err('DOG_LEAD_ONLY', '개는 리드로만 낼 수 있음');
      } else if (!leading && !beats(combo, state.currentCombo)) {
        return err('TOO_WEAK', '현재 조합을 이기지 못함');
      }

      // 소원 강제
      if (
        state.wish !== null &&
        myTurn &&
        canFulfillWish(hand, state.wish, state.currentCombo, { isLeading: leading }) &&
        !action.cards.some((c) => rankOf(c) === state.wish)
      ) {
        return err('WISH_UNFULFILLED', `소원(${state.wish})을 이행해야 함`);
      }

      const events: GameEvent[] = [
        { type: 'PLAYED', payload: { player, cards: action.cards.length, combo: combo.type } },
      ];

      const rest = hand.filter((c) => !action.cards.includes(c));
      let next: TichuState = {
        ...state,
        hands: { ...state.hands, [player]: rest },
        hasPlayed: { ...state.hasPlayed, [player]: true },
      };

      if (rest.length === 0 && !next.finished.includes(player)) {
        next = { ...next, finished: [...next.finished, player] };
        events.push({ type: 'FINISHED', payload: { player, place: next.finished.length } });
      }

      // 개 — 트릭이 아니다. 리드권이 즉시 파트너에게 넘어간다(폭탄 끼어들 틈 없음)
      if (combo.type === 'DOG') {
        const partner = partnerOf(next, player) as PlayerId;
        const target =
          handOf(next, partner).length > 0 ? partner : nextWithCards(next, partner);
        next = {
          ...next,
          discarded: [...next.discarded, DOG],
          currentTrick: [],
          currentCombo: null,
          lastPlayer: null,
          passStreak: 0,
          leader: target,
          turn: target,
        };
        events.push({ type: 'DOG_PLAYED', payload: { player, to: target } });
        return ok({ state: settleIfOver(next), events });
      }

      const play: Play = { player, combo };
      next = {
        ...next,
        currentTrick: [...next.currentTrick, play],
        currentCombo: combo,
        lastPlayer: player,
        passStreak: 0,
      };

      // 참새 소원
      if (action.cards.includes(SPARROW)) {
        next = { ...next, wish: action.wish ?? null };
        if (action.wish !== undefined) {
          events.push({ type: 'WISH_MADE', payload: { player, wish: action.wish } });
        }
      }
      if (state.wish !== null && action.cards.some((c) => rankOf(c) === state.wish)) {
        next = { ...next, wish: null };
        events.push({ type: 'WISH_FULFILLED', payload: { player, wish: state.wish } });
      }

      if (shouldCloseTrick(next)) {
        const closed = closeTrick(next);
        return ok({
          state: settleIfOver(closed.state),
          events: [...events, ...closed.events],
        });
      }

      const turn = nextWithCards(next, player);
      next = { ...next, turn };
      return ok({ state: settleIfOver(next), events });
    }

    case 'PASS': {
      if (state.phase !== 'PLAY') return err('WRONG_PHASE', '플레이 단계가 아님');
      if (state.turn !== player) return err('NOT_YOUR_TURN', '차례가 아님');
      if (isLeading(state)) return err('CANNOT_PASS', '리드는 패스할 수 없음');

      let next: TichuState = { ...state, passStreak: state.passStreak + 1 };
      if (shouldCloseTrick(next)) {
        const closed = closeTrick(next);
        return ok({ state: settleIfOver(closed.state), events: closed.events });
      }
      next = { ...next, turn: nextWithCards(next, player) };
      return ok({ state: settleIfOver(next), events: [{ type: 'PASS', payload: { player } }] });
    }

    case 'GIVE_DRAGON': {
      if (state.phase !== 'DRAGON_GIFT') return err('WRONG_PHASE', '용 양도 단계가 아님');
      const gift = state.dragonGift;
      if (gift === null || gift.winner !== player) return err('NOT_WINNER', '권한 없음');
      const opponents = teamsOf(state).find((t) => !t.includes(player)) ?? [];
      if (!opponents.includes(action.to)) {
        return err('BAD_TARGET', '상대팀에게만 넘길 수 있음');
      }

      const taken = {
        ...state.taken,
        [action.to]: [...(state.taken[action.to] ?? []), ...gift.cards],
      };
      const completed: CompletedTrick = {
        plays: gift.plays,
        winner: player,
        points: gift.points,
        giftedTo: action.to,
      };
      const next = startNextTrick(
        { ...state, phase: 'PLAY', taken, dragonGift: null, lastTrick: completed },
        player,
      );
      return ok({
        state: settleIfOver(next),
        events: [{ type: 'DRAGON_GIVEN', payload: { from: player, to: action.to } }],
      });
    }
  }
}

// ─────────────────────────────── view

function buildView(state: TichuState, viewer: PlayerId): TichuView {
  const handCounts: Record<PlayerId, number> = {};
  const takenCounts: Record<PlayerId, number> = {};
  const takenPoints: Record<PlayerId, number> = {};
  for (const seat of state.seats) {
    handCounts[seat] = handOf(state, seat).length;
    takenCounts[seat] = (state.taken[seat] ?? []).length;
    takenPoints[seat] = countPoints(state.taken[seat] ?? []);
  }

  const given = state.given[viewer] ?? {};
  const givePending = state.seats.filter(
    (p) => p !== viewer && given[p] === undefined,
  );

  return {
    me: viewer,
    phase: state.phase,
    seats: state.seats,
    partner: partnerOf(state, viewer),
    myHand: handOf(state, viewer),
    handCounts,
    calls: state.calls,
    grandDecided: state.grandDecided,
    givePending,
    exchangeDone: state.seats.filter((p) => exchangeDone(state, p)),
    leader: state.leader,
    turn: state.turn,
    currentTrick: state.currentTrick,
    currentCombo: state.currentCombo,
    passStreak: state.passStreak,
    wish: state.wish,
    takenCounts,
    takenPoints,
    finished: state.finished,
    lastTrick: state.lastTrick,
    dragonGift:
      state.dragonGift === null
        ? null
        : { winner: state.dragonGift.winner, points: state.dragonGift.points },
    outcome: state.outcome,
  };
}

// ─────────────────────────────── 엔진

export const tichuEngine: GameEngine<TichuState, TichuAction, TichuView, TichuConfig> = {
  id: 'tichu',
  minPlayers: PLAYER_COUNT,
  maxPlayers: PLAYER_COUNT,

  init({ config, players, seed }) {
    if (players.length !== PLAYER_COUNT) {
      throw new Error(`티츄는 ${PLAYER_COUNT}인 전용 (받은 인원: ${players.length})`);
    }
    if (new Set(players).size !== players.length) throw new Error('플레이어 중복');
    return deal(config, players, seed);
  },

  legalActions(state, player) {
    if (!state.seats.includes(player)) return [];
    switch (state.phase) {
      case 'GRAND':
        return legalGrand(state, player);
      case 'EXCHANGE':
        return legalExchange(state, player);
      case 'PLAY':
        return legalPlayPhase(state, player);
      case 'DRAGON_GIFT':
        return legalDragonGift(state, player);
      case 'DONE':
        return [];
    }
  },

  apply(state, player, action) {
    if (!state.seats.includes(player)) {
      return err('UNKNOWN_PLAYER', `좌석에 없는 플레이어: ${player}`);
    }
    if (state.phase === 'DONE') return err('ROUND_OVER', '라운드가 이미 끝남');
    return applyAction(state, player, action);
  },

  view: buildView,

  isOver(state) {
    return state.phase === 'DONE';
  },

  score(state): RoundScore {
    if (state.outcome === null) {
      throw new Error('score() 는 라운드가 끝난 뒤에만 호출할 수 있다');
    }
    return computeScore({
      seats: state.seats,
      teams: teamsOf(state),
      calls: state.calls,
      taken: state.taken,
      finished: state.finished,
      outcome: state.outcome,
    });
  },
};

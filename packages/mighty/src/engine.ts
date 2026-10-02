/**
 * 마이티 룰 엔진 — `GameEngine` 구현.
 *
 * 상태 흐름:
 *   MISDEAL? → BIDDING → KITTY → FRIEND → PLAY(10트릭) → DONE
 *
 * MISDEAL 은 재딜 자격자(½점 이하)가 있을 때만 거친다.
 * 전원 패스나 재딜 요구는 라운드를 무효화한다 — `outcome.kind === 'REDEAL'`.
 */

import {
  createRng,
  createSeating,
  err,
  nextPlayer,
  ok,
  shuffle,
  type Applied,
  type GameEngine,
  type GameEvent,
  type InitContext,
  type PlayerId,
  type Result,
  type RoundScore,
} from '@mightichu/core';

import {
  JOKER,
  SUITS,
  canDemandMisdeal,
  cardLabel,
  countPoints,
  fullDeck,
  isJoker,
  jokerCallCard,
  mightyCard,
  suitOf,
  type Suit,
} from './cards.js';
import {
  MIN_BID,
  isHigherBid,
  isValidBidCount,
  legalBids,
  legalContractChanges,
  requiredCountForTrumpChange,
} from './bidding.js';
import {
  LAST_TRICK,
  TRICKS_PER_ROUND,
  canCallJoker,
  legalPlays,
  resolveLeadSuit,
  trickWinner,
  type LegalPlayContext,
  type TrickContext,
} from './trick.js';
import { computeScore, redealScore } from './scoring.js';
import type {
  Bid,
  Card,
  FriendCall,
  MightyAction,
  MightyConfig,
  MightyState,
  MightyView,
  TrickPlay,
} from './types.js';

export const PLAYER_COUNT = 5;
export const HAND_SIZE = 10;
export const KITTY_SIZE = 3;
export const DISCARD_SIZE = 3;

// ─────────────────────────────────────────── 보조

function handOf(state: MightyState, player: PlayerId): readonly Card[] {
  return state.hands[player] ?? [];
}

function seating(state: MightyState) {
  return createSeating(state.seats, 'cw');
}

/** 현재 트릭에서 카드를 낼 차례인 플레이어. */
function currentTurn(state: MightyState): PlayerId | null {
  if (state.phase !== 'PLAY' || state.leader === null) return null;
  if (state.currentTrick.length === 0) return state.leader;
  if (state.currentTrick.length >= PLAYER_COUNT) return null;
  const last = state.currentTrick[state.currentTrick.length - 1] as TrickPlay;
  return nextPlayer(seating(state), last.player);
}

function trickContext(state: MightyState): TrickContext {
  const contract = state.contract;
  const lead = state.currentTrick[0];
  return {
    trump: contract === null ? 'NT' : contract.trump,
    trickNo: state.trickNo,
    leadSuit:
      lead === undefined
        ? null
        : resolveLeadSuit(lead.card, state.jokerNomination),
    jokerCalled: state.jokerCalled,
  };
}

/** n개 중 k개 조합. 버릴 카드 후보 생성용 (C(13,3)=286). */
function combinations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  const walk = (start: number): void => {
    if (pick.length === k) {
      out.push([...pick]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      pick.push(items[i] as T);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return out;
}


/** 지명 카드 보유자를 찾는다. 주공 자신이거나 아무도 없으면 null (숨은 노프렌드). */
function findHolder(
  state: MightyState,
  card: Card,
  declarer: PlayerId,
): PlayerId | null {
  for (const seat of state.seats) {
    if (seat === declarer) continue;
    if (handOf(state, seat).includes(card)) return seat;
  }
  return null;
}

function resolveFriend(
  state: MightyState,
  call: FriendCall,
  declarer: PlayerId,
): { friend: PlayerId | null; revealed: boolean } {
  const trump = state.contract?.trump ?? 'NT';
  switch (call.kind) {
    case 'NONE':
      return { friend: null, revealed: true };
    case 'FIRST_TRICK':
      return { friend: null, revealed: false }; // 첫 트릭 후 확정
    case 'MIGHTY':
      return { friend: findHolder(state, mightyCard(trump), declarer), revealed: false };
    case 'JOKER':
      return { friend: findHolder(state, JOKER, declarer), revealed: false };
    case 'CARD':
      return { friend: findHolder(state, call.card, declarer), revealed: false };
  }
}

/** 지명된 카드 — 이 카드가 나오면 프렌드가 공개된다. */
function calledCard(call: FriendCall, trump: Bid['trump']): Card | null {
  switch (call.kind) {
    case 'CARD':
      return call.card;
    case 'MIGHTY':
      return mightyCard(trump);
    case 'JOKER':
      return JOKER;
    default:
      return null;
  }
}

// ─────────────────────────────────────────── init

function deal(ctx: InitContext<MightyConfig>): MightyState {
  const rng = createRng(ctx.seed);
  const deck = shuffle(fullDeck(), rng);
  const seats = [...ctx.players];

  const hands: Record<PlayerId, readonly Card[]> = {};
  const points: Record<PlayerId, number> = {};
  seats.forEach((player, index) => {
    hands[player] = deck.slice(index * HAND_SIZE, (index + 1) * HAND_SIZE);
    points[player] = 0;
  });
  const kitty = deck.slice(PLAYER_COUNT * HAND_SIZE);

  const eligible = seats.filter((p) => canDemandMisdeal(hands[p] ?? []));

  return {
    phase: eligible.length > 0 ? 'MISDEAL' : 'BIDDING',
    seats,
    hands,
    kitty,
    discarded: [],
    misdealEligible: eligible,
    currentBidder: seats[0] ?? null,
    passed: [],
    highestBid: null,
    declarer: null,
    contract: null,
    friendCall: null,
    friend: null,
    friendRevealed: false,
    trickNo: 0,
    leader: null,
    currentTrick: [],
    jokerCalled: false,
    jokerNomination: null,
    points,
    outcome: null,
  };
}

// ─────────────────────────────────────────── legalActions

function legalMisdeal(state: MightyState, player: PlayerId): MightyAction[] {
  if (!state.misdealEligible.includes(player)) return [];
  return [{ type: 'DEMAND_MISDEAL' }, { type: 'DECLINE_MISDEAL' }];
}

function legalBidding(state: MightyState, player: PlayerId): MightyAction[] {
  if (state.currentBidder !== player) return [];
  const actions: MightyAction[] = [{ type: 'PASS' }];
  for (const bid of legalBids(state.highestBid?.bid ?? null)) {
    actions.push({ type: 'BID', bid });
  }
  return actions;
}

function legalKitty(state: MightyState, player: PlayerId): MightyAction[] {
  if (state.declarer !== player) return [];
  const hand = handOf(state, player);
  const actions: MightyAction[] = [];

  // 기루다 변경은 버리기와 분리한 별개 액션 — 곱집합 폭발을 피한다.
  if (state.highestBid !== null) {
    for (const bid of legalContractChanges(state.highestBid.bid)) {
      if (bid.trump === state.contract?.trump && bid.count === state.contract.count) {
        continue; // 현재 계약과 동일 — 바꿀 게 없다
      }
      actions.push({ type: 'DISCARD', cards: [], changeTo: bid });
    }
  }

  for (const cards of combinations(hand, DISCARD_SIZE)) {
    actions.push({ type: 'DISCARD', cards });
  }
  return actions;
}

function legalFriend(state: MightyState, player: PlayerId): MightyAction[] {
  if (state.declarer !== player) return [];
  const calls: FriendCall[] = [
    { kind: 'NONE' },
    { kind: 'FIRST_TRICK' },
    { kind: 'MIGHTY' },
    { kind: 'JOKER' },
  ];
  for (const card of fullDeck()) calls.push({ kind: 'CARD', card });
  return calls.map((call) => ({ type: 'CALL_FRIEND', call }));
}

function legalPlay(state: MightyState, player: PlayerId): MightyAction[] {
  if (currentTurn(state) !== player) return [];
  const ctx = trickContext(state);
  const isLeading = state.currentTrick.length === 0;
  const playCtx: LegalPlayContext = {
    ...ctx,
    isLeading,
    isFirstTrickLead: isLeading && state.trickNo === 0,
  };

  const actions: MightyAction[] = [];
  for (const card of legalPlays(handOf(state, player), playCtx)) {
    if (isLeading && isJoker(card)) {
      // 조커 리드는 팔로우 무늬를 지정해야 한다.
      for (const suit of SUITS) actions.push({ type: 'PLAY_CARD', card, nominate: suit });
      continue;
    }
    if (isLeading && canCallJoker(card, ctx.trump, state.trickNo)) {
      actions.push({ type: 'PLAY_CARD', card, callJoker: true });
      actions.push({ type: 'PLAY_CARD', card, callJoker: false });
      continue;
    }
    actions.push({ type: 'PLAY_CARD', card });
  }
  return actions;
}

// ─────────────────────────────────────────── apply 헬퍼

function advanceBidding(state: MightyState): MightyState {
  const allPassed = state.passed.length === PLAYER_COUNT;
  if (allPassed) {
    return {
      ...state,
      phase: 'DONE',
      currentBidder: null,
      outcome: { kind: 'REDEAL', reason: 'ALL_PASSED' },
    };
  }

  const remaining = state.seats.filter((p) => !state.passed.includes(p));
  if (state.highestBid !== null && remaining.length === 1) {
    const declarer = remaining[0] as PlayerId;
    // 바닥 3장을 주공 손으로.
    const hand = [...handOf(state, declarer), ...state.kitty];
    return {
      ...state,
      phase: 'KITTY',
      currentBidder: null,
      declarer,
      contract: state.highestBid.bid,
      hands: { ...state.hands, [declarer]: hand },
      kitty: [],
    };
  }

  const from = state.currentBidder as PlayerId;
  const next = nextPlayer(seating(state), from, {
    skip: (p) => state.passed.includes(p),
  });
  return { ...state, currentBidder: next };
}

function finishTrick(state: MightyState): Applied<MightyState> {
  const ctx = trickContext(state);
  const winner = trickWinner(state.currentTrick, ctx) as PlayerId;
  const gained = countPoints(state.currentTrick.map((t) => t.card));

  const events: GameEvent[] = [
    {
      type: 'TRICK_WON',
      payload: { winner, trickNo: state.trickNo, points: gained },
    },
  ];

  let friend = state.friend;
  let friendRevealed = state.friendRevealed;

  // 초구 프렌드 확정 — 첫 트릭 승자. 주공이 먹었으면 노프렌드.
  if (state.trickNo === 0 && state.friendCall?.kind === 'FIRST_TRICK') {
    friend = winner === state.declarer ? null : winner;
    friendRevealed = true;
    events.push({ type: 'FRIEND_REVEALED', payload: { friend, by: 'FIRST_TRICK' } });
  }

  const points = {
    ...state.points,
    [winner]: (state.points[winner] ?? 0) + gained,
  };
  const nextTrickNo = state.trickNo + 1;
  const done = nextTrickNo >= TRICKS_PER_ROUND;

  const next: MightyState = {
    ...state,
    phase: done ? 'DONE' : 'PLAY',
    points,
    friend,
    friendRevealed: done ? true : friendRevealed,
    trickNo: done ? LAST_TRICK : nextTrickNo,
    leader: done ? null : winner,
    currentTrick: [],
    jokerCalled: false,
    jokerNomination: null,
    outcome: done ? { kind: 'PLAYED' } : null,
  };
  return { state: next, events };
}

// ─────────────────────────────────────────── apply

function applyAction(
  state: MightyState,
  player: PlayerId,
  action: MightyAction,
): Result<Applied<MightyState>> {
  switch (action.type) {
    case 'DEMAND_MISDEAL': {
      if (state.phase !== 'MISDEAL') return err('WRONG_PHASE', '재딜 단계가 아님');
      if (!state.misdealEligible.includes(player)) {
        return err('NOT_ELIGIBLE', '재딜을 요구할 수 있는 손패가 아님');
      }
      return ok({
        state: {
          ...state,
          phase: 'DONE',
          outcome: { kind: 'REDEAL', reason: 'MISDEAL' },
        },
        events: [{ type: 'MISDEAL_DEMANDED', payload: { player } }],
      });
    }

    case 'DECLINE_MISDEAL': {
      if (state.phase !== 'MISDEAL') return err('WRONG_PHASE', '재딜 단계가 아님');
      if (!state.misdealEligible.includes(player)) {
        return err('NOT_ELIGIBLE', '재딜 자격자가 아님');
      }
      const eligible = state.misdealEligible.filter((p) => p !== player);
      return ok({
        state: {
          ...state,
          misdealEligible: eligible,
          phase: eligible.length === 0 ? 'BIDDING' : 'MISDEAL',
        },
        events: [],
      });
    }

    case 'BID': {
      if (state.phase !== 'BIDDING') return err('WRONG_PHASE', '비딩 단계가 아님');
      if (state.currentBidder !== player) return err('NOT_YOUR_TURN', '비딩 차례가 아님');
      if (!isValidBidCount(action.bid.count)) {
        return err('BAD_BID', `공약은 ${MIN_BID}~20 이어야 함`);
      }
      if (state.highestBid !== null && !isHigherBid(action.bid, state.highestBid.bid)) {
        return err('BID_TOO_LOW', '앞선 공약보다 높아야 함');
      }
      const bidded: MightyState = {
        ...state,
        highestBid: { player, bid: action.bid },
      };
      return ok({
        state: advanceBidding(bidded),
        events: [{ type: 'BID', payload: { player, bid: action.bid } }],
      });
    }

    case 'PASS': {
      if (state.phase !== 'BIDDING') return err('WRONG_PHASE', '비딩 단계가 아님');
      if (state.currentBidder !== player) return err('NOT_YOUR_TURN', '비딩 차례가 아님');
      const passed: MightyState = { ...state, passed: [...state.passed, player] };
      return ok({
        state: advanceBidding(passed),
        events: [{ type: 'PASS', payload: { player } }],
      });
    }

    case 'DISCARD': {
      if (state.phase !== 'KITTY') return err('WRONG_PHASE', '바닥 처리 단계가 아님');
      if (state.declarer !== player) return err('NOT_DECLARER', '주공만 가능');

      // 기루다 변경만 하는 액션
      if (action.changeTo !== undefined) {
        const won = state.highestBid;
        if (won === null) return err('NO_BID', '낙찰된 공약이 없음');
        const required = requiredCountForTrumpChange(won.bid, action.changeTo.trump);
        if (required === null) {
          return err('CANNOT_CHANGE_TRUMP', '그 기루다로는 바꿀 수 없음');
        }
        if (action.changeTo.count < required || !isValidBidCount(action.changeTo.count)) {
          return err('BID_TOO_LOW', `기루다 변경에는 공약 ${required} 이상 필요`);
        }
        if (action.cards.length > 0) {
          return err('BAD_ACTION', '기루다 변경과 카드 버리기는 별개 액션');
        }
        return ok({
          state: { ...state, contract: action.changeTo },
          events: [{ type: 'CONTRACT_CHANGED', payload: { bid: action.changeTo } }],
        });
      }

      const hand = handOf(state, player);
      if (action.cards.length !== DISCARD_SIZE) {
        return err('BAD_DISCARD', `${DISCARD_SIZE}장을 버려야 함`);
      }
      if (new Set(action.cards).size !== action.cards.length) {
        return err('BAD_DISCARD', '같은 카드를 중복 지정함');
      }
      for (const card of action.cards) {
        if (!hand.includes(card)) {
          return err('CARD_NOT_IN_HAND', `${cardLabel(card)} 를 갖고 있지 않음`);
        }
      }
      const remaining = hand.filter((card) => !action.cards.includes(card));
      return ok({
        state: {
          ...state,
          phase: 'FRIEND',
          hands: { ...state.hands, [player]: remaining },
          discarded: [...action.cards],
        },
        events: [{ type: 'DISCARDED', payload: { count: DISCARD_SIZE } }],
      });
    }

    case 'CALL_FRIEND': {
      if (state.phase !== 'FRIEND') return err('WRONG_PHASE', '프렌드 지정 단계가 아님');
      if (state.declarer !== player) return err('NOT_DECLARER', '주공만 가능');
      const resolved = resolveFriend(state, action.call, player);
      return ok({
        state: {
          ...state,
          phase: 'PLAY',
          friendCall: action.call,
          friend: resolved.friend,
          friendRevealed: resolved.revealed,
          leader: player,
          trickNo: 0,
          currentTrick: [],
        },
        events: [{ type: 'FRIEND_CALLED', payload: { call: action.call } }],
      });
    }

    case 'PLAY_CARD': {
      if (state.phase !== 'PLAY') return err('WRONG_PHASE', '플레이 단계가 아님');
      if (currentTurn(state) !== player) return err('NOT_YOUR_TURN', '차례가 아님');

      const ctx = trickContext(state);
      const isLeading = state.currentTrick.length === 0;
      const playCtx: LegalPlayContext = {
        ...ctx,
        isLeading,
        isFirstTrickLead: isLeading && state.trickNo === 0,
      };
      const allowed = legalPlays(handOf(state, player), playCtx);
      if (!allowed.includes(action.card)) {
        return err('ILLEGAL_PLAY', `${cardLabel(action.card)} 는 지금 낼 수 없음`);
      }

      if (isLeading && isJoker(action.card) && action.nominate === undefined) {
        return err('NOMINATION_REQUIRED', '조커를 리드할 때는 무늬를 지정해야 함');
      }
      if (
        action.callJoker === true &&
        !canCallJoker(action.card, ctx.trump, state.trickNo)
      ) {
        return err('CANNOT_CALL_JOKER', '이 카드로는 조커콜을 할 수 없음');
      }

      const hand = handOf(state, player).filter((card) => card !== action.card);
      const trick: TrickPlay[] = [...state.currentTrick, { player, card: action.card }];

      let friendRevealed = state.friendRevealed;
      const events: GameEvent[] = [
        { type: 'CARD_PLAYED', payload: { player, card: action.card } },
      ];
      const called =
        state.friendCall === null ? null : calledCard(state.friendCall, ctx.trump);
      if (!friendRevealed && called !== null && action.card === called) {
        friendRevealed = true;
        events.push({ type: 'FRIEND_REVEALED', payload: { friend: player, by: 'CARD' } });
      }

      let next: MightyState = {
        ...state,
        hands: { ...state.hands, [player]: hand },
        currentTrick: trick,
        friendRevealed,
        jokerCalled: isLeading ? action.callJoker === true : state.jokerCalled,
        jokerNomination: isLeading
          ? (action.nominate ?? null)
          : state.jokerNomination,
      };

      if (trick.length === PLAYER_COUNT) {
        const finished = finishTrick(next);
        return ok({ state: finished.state, events: [...events, ...finished.events] });
      }
      next = { ...next };
      return ok({ state: next, events });
    }
  }
}

// ─────────────────────────────────────────── view

function buildView(state: MightyState, viewer: PlayerId): MightyView {
  const handCounts: Record<PlayerId, number> = {};
  for (const seat of state.seats) handCounts[seat] = handOf(state, seat).length;

  return {
    me: viewer,
    phase: state.phase,
    seats: state.seats,
    myHand: handOf(state, viewer),
    handCounts,
    kittyCount: state.kitty.length,
    iCanDemandMisdeal:
      state.phase === 'MISDEAL' && state.misdealEligible.includes(viewer),
    currentBidder: state.currentBidder,
    passed: state.passed,
    highestBid: state.highestBid,
    declarer: state.declarer,
    contract: state.contract,
    friendCall: state.friendCall,
    friend: state.friendRevealed ? state.friend : null,
    iAmFriend: state.friend === viewer,
    trickNo: state.trickNo,
    leader: state.leader,
    currentTrick: state.currentTrick,
    jokerCalled: state.jokerCalled,
    jokerNomination: state.jokerNomination,
    points: state.points,
    outcome: state.outcome,
  };
}

// ─────────────────────────────────────────── score

function scoreRound(state: MightyState): RoundScore {
  if (state.outcome === null) {
    throw new Error('score() 는 라운드가 끝난 뒤에만 호출할 수 있다');
  }
  if (state.outcome.kind === 'REDEAL') {
    return redealScore(state.seats, state.outcome.reason);
  }

  const declarer = state.declarer as PlayerId;
  const contract = state.contract as Bid;
  const friend = state.friend;

  // 주공이 버린 3장의 점수카드도 여당 몫이다.
  const declarerPoints =
    (state.points[declarer] ?? 0) +
    (friend === null ? 0 : (state.points[friend] ?? 0)) +
    countPoints(state.discarded);

  return computeScore({
    seats: state.seats,
    declarer,
    friend,
    friendCall: state.friendCall ?? { kind: 'NONE' },
    contract,
    declarerPoints,
  });
}

// ─────────────────────────────────────────── 엔진

export const mightyEngine: GameEngine<
  MightyState,
  MightyAction,
  MightyView,
  MightyConfig
> = {
  id: 'mighty',
  minPlayers: PLAYER_COUNT,
  maxPlayers: PLAYER_COUNT,

  init(ctx) {
    if (ctx.players.length !== PLAYER_COUNT) {
      throw new Error(`마이티는 ${PLAYER_COUNT}인 전용 (받은 인원: ${ctx.players.length})`);
    }
    if (new Set(ctx.players).size !== ctx.players.length) {
      throw new Error('플레이어 중복');
    }
    return deal(ctx);
  },

  legalActions(state, player) {
    if (!state.seats.includes(player)) return [];
    switch (state.phase) {
      case 'MISDEAL':
        return legalMisdeal(state, player);
      case 'BIDDING':
        return legalBidding(state, player);
      case 'KITTY':
        return legalKitty(state, player);
      case 'FRIEND':
        return legalFriend(state, player);
      case 'PLAY':
        return legalPlay(state, player);
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

  score: scoreRound,
};

/** 조커콜 카드 — UI 표기용 재노출. */
export { jokerCallCard, mightyCard, suitOf };
export type { Suit };

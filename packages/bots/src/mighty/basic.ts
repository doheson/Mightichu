/**
 * 마이티 휴리스틱 봇 (L2).
 *
 * 설계 제약: 입력은 **리댁션된 `MightyView`** 뿐이다. 남의 손패를 볼 수 없다.
 *
 * L1.5 에서 달라진 점:
 *  - **공약 추정** 을 무늬 길이 기반으로 다시 짰다. 기루다 장수가 핵심이다
 *  - **아군 추론** — 프렌드가 숨어 있어도 아는 범위에서는 팀 패를 밟지 않는다
 *  - **카운팅** — 이미 나온 카드를 보고 내 카드가 최고인지 안다
 */

import type { Bot, BotContext } from '@mightichu/core';
import { knownAllies, likelyAlly, ruffRisk } from './read.js';
import {
  JOKER,
  MIN_BID,
  cardStrength,
  fullDeck,
  isJoker,
  isPointCard,
  isTrumpCard,
  mightyCard,
  rankOf,
  resolveLeadSuit,
  suitOf,
  type Card,
  type MightyAction,
  type MightyView,
  type Trump,
  type TrickContext,
} from '@mightichu/mighty';

/**
 * 공약 추정 — 여당이 딸 수 있는 **점수카드 수**를 센다.
 *
 * 마이티에서 점수를 가져오는 경로는 둘뿐이다:
 *  1. 기루다로 남의 점수 트릭을 베어내기 → 기루다 **장수**가 거의 전부다
 *  2. 내 무늬의 높은 카드로 직접 먹기
 *
 * 그래서 기루다 장수에 가장 큰 가중치를 준다. 바닥 3장을 받으면 보통 기루다가
 * 늘어나므로 약간의 여유를 더한다.
 */
function estimateBid(hand: readonly Card[], trump: Trump): number {
  const trumps = hand.filter((c) => isTrumpCard(c, trump));
  const hasMighty = hand.includes(mightyCard(trump));
  const hasJoker = hand.includes(JOKER);

  // 기루다 안의 높은 카드는 베어내기에 더 확실하다
  const highTrumps = trumps.filter((c) => (rankOf(c) ?? 0) >= 12).length;

  // 기루다가 아닌 무늬의 A·K — 직접 먹을 수 있는 카드
  const offSuitWinners = hand.filter(
    (c) => !isTrumpCard(c, trump) && !isJoker(c) && (rankOf(c) ?? 0) >= 13,
  ).length;

  /**
   * 기준 상수는 **측정**으로 잡는다. 수비·아군 플레이가 달라지면 같은 손패로 딸 수 있는
   * 점수가 달라지므로 이 값도 함께 움직인다.
   *
   * ```
   * 7  성공 46.0%  공약 15.18  획득 14.04            (초기 — 과대 공약)
   * 6  성공 57.2%  공약 14.20  획득 14.00            (공약 보정)
   * 5  성공 56.8%  공약 13.39  획득 13.35            (보이드·야당연대로 수비가 세진 뒤)
   * 5  성공 63.2%  공약 13.40  획득 13.98  EV 1.77   (프렌드 마이티 낭비 버그 수정 후) ← 현재
   * ```
   *
   * 더 낮추면 주공 기대점수는 오르지만 **전원 패스 재딜이 급증**한다 —
   * 기준 4.5 는 83%, 3.5 는 36% 만 실제로 플레이된다(기준 5 는 93%).
   * 재딜이 잦으면 게임 자체가 성립하지 않으므로 플레이 비율을 우선한다.
   */
  const estimate =
    5 +
    trumps.length * 1.1 +
    highTrumps * 0.4 +
    offSuitWinners * 0.8 +
    (hasMighty ? 1.5 : 0) +
    (hasJoker ? 1 : 0) +
    1.0 + // 바닥 3장 보정
    (trump === 'NT' ? -3 : 0); // 노기루다는 베어낼 수단이 없다

  return Math.min(20, Math.max(0, Math.round(estimate)));
}

/** 이 카드보다 센 같은 무늬 카드가 아직 남아 있는가 — 카운팅. */
function isTopOfSuit(card: Card, view: MightyView): boolean {
  const suit = suitOf(card);
  const rank = rankOf(card);
  if (suit === null || rank === null) return false;
  const seen = new Set<Card>([...view.myHand, ...view.playedCards]);
  for (let r = rank + 1; r <= 14; r++) {
    const other = `${suit}${String(r).padStart(2, '0')}`;
    if (!seen.has(other)) return false;
  }
  return true;
}

/** 가장 아까운 카드 순서 — 값이 작으면 버려도 되는 카드. */
function keepValue(card: Card, trump: Trump): number {
  if (card === mightyCard(trump)) return 1000;
  if (isJoker(card)) return 900;
  const rank = rankOf(card) ?? 0;
  const base = isTrumpCard(card, trump) ? 300 : 0;
  return base + rank + (isPointCard(card) ? 20 : 0);
}

function trickContextOf(view: MightyView): TrickContext {
  const lead = view.currentTrick[0];
  return {
    trump: view.contract?.trump ?? 'NT',
    trickNo: view.trickNo,
    leadSuit:
      lead === undefined ? null : resolveLeadSuit(lead.card, view.jokerNomination),
    jokerCalled: view.jokerCalled,
  };
}

/** 지금 테이블에서 가장 센 카드의 강도. 빈 트릭이면 -1. */
function bestOnTable(view: MightyView, ctx: TrickContext): number {
  let best = -1;
  for (const play of view.currentTrick) {
    best = Math.max(best, cardStrength(play.card, ctx));
  }
  return best;
}

function cardsOf(actions: readonly MightyAction[]): MightyAction[] {
  return actions.filter((a) => a.type === 'PLAY_CARD');
}

/** 휴리스틱을 켜고 끌 수 있게 — A/B 로 효과를 재기 위해서다. */
export interface MightyBotOptions {
  /** 프렌드는 선을 잡으면 낮은 기루다를 돌린다. */
  readonly friendReturnsTrump?: boolean;
  /** 야당은 마이티 무늬를 쳐서 마이티를 끌어낸다(마공). */
  readonly defenderAttacksMighty?: boolean;
}

export function createMightyBasicBot(
  options: MightyBotOptions = {},
): Bot<MightyView, MightyAction> {
  const friendReturnsTrump = options.friendReturnsTrump ?? true;
  const defenderAttacksMighty = options.defenderAttacksMighty ?? true;

  return {
    id: 'mighty-basic',
    label: '기본 봇',

    decide(ctx: BotContext<MightyView, MightyAction>): MightyAction {
      const { view, legal } = ctx;
      const trump = view.contract?.trump ?? 'NT';
      const hand = view.myHand;

      // ── 재딜: 게임을 굴리는 쪽을 택한다 (랜덤 봇은 재딜을 너무 자주 부른다)
      const decline = legal.find((a) => a.type === 'DECLINE_MISDEAL');
      if (decline !== undefined) return decline;

      // ── 비딩: 손패가 감당할 수 있는 선까지만 부른다
      const bids = legal.filter((a) => a.type === 'BID');
      if (bids.length > 0) {
        const pass = legal.find((a) => a.type === 'PASS');
        let best: MightyAction | null = null;
        let bestMargin = 0;
        for (const action of bids) {
          if (action.type !== 'BID') continue;
          const estimate = estimateBid(hand, action.bid.trump);
          const margin = estimate - action.bid.count;
          // 추정보다 낮은 공약만, 그중 가장 높은 것을 고른다
          if (margin >= 0 && action.bid.count >= MIN_BID && margin >= bestMargin) {
            if (best === null || action.bid.count > (best as { bid: { count: number } }).bid.count) {
              best = action;
              bestMargin = margin;
            }
          }
        }
        if (best !== null) return best;
        if (pass !== undefined) return pass;
      }

      // ── 바닥 버리기: 가장 아깝지 않은 3장
      const discards = legal.filter(
        (a) => a.type === 'DISCARD' && a.cards.length === 3,
      );
      if (discards.length > 0) {
        let bestAction = discards[0] as MightyAction;
        let bestCost = Number.POSITIVE_INFINITY;
        for (const action of discards) {
          if (action.type !== 'DISCARD') continue;
          const cost = action.cards.reduce((s, c) => s + keepValue(c, trump), 0);
          if (cost < bestCost) {
            bestCost = cost;
            bestAction = action;
          }
        }
        return bestAction;
      }

      // ── 프렌드: 내가 없는 강한 카드를 부른다
      const friendCalls = legal.filter((a) => a.type === 'CALL_FRIEND');
      if (friendCalls.length > 0) {
        const mighty = mightyCard(trump);
        if (!hand.includes(mighty)) {
          const call = friendCalls.find(
            (a) => a.type === 'CALL_FRIEND' && a.call.kind === 'MIGHTY',
          );
          if (call !== undefined) return call;
        }
        if (!hand.includes(JOKER)) {
          const call = friendCalls.find(
            (a) => a.type === 'CALL_FRIEND' && a.call.kind === 'JOKER',
          );
          if (call !== undefined) return call;
        }
        // 손에 없는 가장 센 카드를 지명
        const outside = fullDeck()
          .filter((c) => !hand.includes(c) && !isJoker(c))
          .sort((a, b) => keepValue(b, trump) - keepValue(a, trump));
        const target = outside[0];
        if (target !== undefined) {
          const call = friendCalls.find(
            (a) =>
              a.type === 'CALL_FRIEND' &&
              a.call.kind === 'CARD' &&
              a.call.card === target,
          );
          if (call !== undefined) return call;
        }
        return friendCalls[0] as MightyAction;
      }

      // ── 플레이
      const plays = cardsOf(legal);
      if (plays.length > 0) {
        const tctx = trickContextOf(view);
        const isLeading = view.currentTrick.length === 0;
        const threshold = bestOnTable(view, tctx);
        const trickHasPoints = view.currentTrick.some((p) => isPointCard(p.card));

        if (isLeading) {
          /**
           * 리드: **확실히 먹을 수 있는 카드**가 있으면 그걸로 간다.
           * 같은 무늬에서 나보다 센 카드가 전부 나갔다면 그 카드는 안전하다 —
           * 아껴둘 이유가 없고, 늦게 내면 기루다에 베인다.
           */
          const allies = knownAllies(view);
          /**
           * 상대가 **보이드인 무늬는 리드하지 않는다.** 기루다로 잘라먹히면
           * 그 트릭의 점수를 그대로 헌납한다. 공개 정보(누가 뭘 못 따라갔는지)로 안다.
           */
          const safeToLead = (card: Card): boolean => {
            const suit = suitOf(card);
            if (suit === null) return true;
            return ruffRisk(suit, view, allies) === 0;
          };

          const mighty = mightyCard(trump);
          const mightyOut = view.playedCards.includes(mighty);

          /**
           * **프렌드는 선을 잡으면 낮은 기루다를 돌린다.** (마이티 정석)
           *
           * 낮은 기루다를 흘려야 주공이 마이티나 높은 기루다로 턴을 회수하면서
           * 야당의 기루다를 뽑아낼 수 있다. 높은 기루다를 내면 주공이 회수할 수가
           * 없어 턴이 야당에게 넘어간다.
           */
          if (friendReturnsTrump && view.iAmFriend && trump !== 'NT') {
            const myTrumps = plays.filter((a) =>
              isTrumpCard(a.type === 'PLAY_CARD' ? a.card : '', trump),
            );
            if (myTrumps.length > 0) {
              return [...myTrumps].sort(
                (a, b) =>
                  (rankOf(a.type === 'PLAY_CARD' ? a.card : '') ?? 0) -
                  (rankOf(b.type === 'PLAY_CARD' ? b.card : '') ?? 0),
              )[0] as MightyAction;
            }
          }

          /**
           * **야당의 마공** — 마이티 무늬를 쳐서 마이티를 끌어낸다.
           *
           * 마이티는 자기 무늬가 리드됐을 때 그 무늬 카드가 그것뿐이면 반드시 나와야 한다.
           * 계속 치면 결국 끌려 나오고, 그 뒤로는 여당의 최강 카드가 사라진다.
           */
          const amDefender = view.declarer !== view.me && !view.iAmFriend;
          if (defenderAttacksMighty && amDefender && !mightyOut) {
            const attack = plays.filter((a) => {
              const card = a.type === 'PLAY_CARD' ? a.card : '';
              return suitOf(card) === suitOf(mighty) && card !== mighty;
            });
            if (attack.length > 0) {
              // 점수카드를 헌납하지 않게 낮은 것부터
              return [...attack].sort(
                (a, b) =>
                  keepValue(a.type === 'PLAY_CARD' ? a.card : '', trump) -
                  keepValue(b.type === 'PLAY_CARD' ? b.card : '', trump),
              )[0] as MightyAction;
            }
          }

          const sureWinners = plays.filter((a) => {
            const card = a.type === 'PLAY_CARD' ? a.card : '';
            return isTopOfSuit(card, view) && safeToLead(card);
          });
          if (sureWinners.length > 0) {
            return [...sureWinners].sort((a, b) => {
              const ca = a.type === 'PLAY_CARD' ? a.card : '';
              const cb = b.type === 'PLAY_CARD' ? b.card : '';
              return keepValue(cb, trump) - keepValue(ca, trump);
            })[0] as MightyAction;
          }
          // 아니면 아깝지 않은 카드부터. 단 잘라먹힐 무늬는 뒤로 민다.
          return [...plays].sort((a, b) => {
            const ca = a.type === 'PLAY_CARD' ? a.card : '';
            const cb = b.type === 'PLAY_CARD' ? b.card : '';
            const ra = safeToLead(ca) ? 0 : 1000;
            const rb = safeToLead(cb) ? 0 : 1000;
            if (ra !== rb) return ra - rb;
            return keepValue(ca, trump) - keepValue(cb, trump);
          })[0] as MightyAction;
        }

        /**
         * **팀 패는 밟지 않는다.**
         *
         * 마이티는 프렌드가 숨어 있어 확실히 아는 범위가 좁다. 하지만 야당 입장에서
         * 주공이 아닌 나머지 셋은 "프렌드 1 + 야당 2" 라 **2/3 확률로 같은 편**이다.
         * 야당끼리 서로 잡아먹는 게 가장 큰 손해이므로, 주공이 이기는 게 아니라면
         * 굳이 밟지 않는 쪽이 기대값상 낫다.
         */
        const lead = view.currentTrick[0];
        const bestSoFar = view.currentTrick.reduce<{ player: string; s: number } | null>(
          (best, play) => {
            const s = cardStrength(play.card, tctx);
            return best === null || s > best.s ? { player: play.player, s } : best;
          },
          null,
        );
        const allyWinning =
          lead !== undefined &&
          bestSoFar !== null &&
          likelyAlly(view, bestSoFar.player);

        const winners = plays.filter((a) => {
          const card = a.type === 'PLAY_CARD' ? a.card : '';
          return cardStrength(card, tctx) > threshold;
        });

        // 점수카드가 걸린 트릭이면 가장 싼 승리 카드로 먹는다 (아군이 이기고 있으면 놔둔다)
        if (trickHasPoints && winners.length > 0 && !allyWinning) {
          return [...winners].sort((a, b) => {
            const ca = a.type === 'PLAY_CARD' ? a.card : '';
            const cb = b.type === 'PLAY_CARD' ? b.card : '';
            return keepValue(ca, trump) - keepValue(cb, trump);
          })[0] as MightyAction;
        }

        // 아니면 가장 아깝지 않은 카드를 버린다
        return [...plays].sort((a, b) => {
          const ca = a.type === 'PLAY_CARD' ? a.card : '';
          const cb = b.type === 'PLAY_CARD' ? b.card : '';
          return keepValue(ca, trump) - keepValue(cb, trump);
        })[0] as MightyAction;
      }

      // ── 그 외: 첫 합법 수
      const fallback = legal[0];
      if (fallback === undefined) throw new Error('합법 수가 없는데 봇이 호출되었다');
      return fallback;
    },
  };
}

/**
 * 마이티 기본 봇 (L1.5) — 사람이 실제로 상대해볼 수 있는 최소 수준.
 *
 * ⚠️ 이건 **임시 수준**이다. 제대로 된 휴리스틱(L2)은 5단계 과제다.
 * 랜덤 봇만으로는 비딩이 난장판이 되어 플레이 자체가 성립하지 않으므로,
 * 2단계에서 UI 를 검증할 수 있을 정도의 최소 판단만 넣었다.
 *
 * 설계 제약: 입력은 **리댁션된 `MightyView`** 뿐이다. 남의 손패를 볼 수 없다.
 */

import type { Bot, BotContext } from '@mightichu/core';
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
  type Card,
  type MightyAction,
  type MightyView,
  type Trump,
  type TrickContext,
} from '@mightichu/mighty';

/** 공약 추정 — 손패로 여당이 딸 수 있는 점수카드 수를 거칠게 센다. */
function estimateBid(hand: readonly Card[], trump: Trump): number {
  const trumps = hand.filter((c) => isTrumpCard(c, trump)).length;
  const hasMighty = hand.includes(mightyCard(trump));
  const hasJoker = hand.includes(JOKER);
  const offSuitHighs = hand.filter(
    (c) => !isTrumpCard(c, trump) && !isJoker(c) && (rankOf(c) ?? 0) >= 13,
  ).length;

  const estimate =
    9 +
    trumps +
    (hasMighty ? 2 : 0) +
    (hasJoker ? 1 : 0) +
    offSuitHighs +
    (trump === 'NT' ? -2 : 0); // 노기루다는 어렵다

  return Math.min(20, Math.max(0, Math.round(estimate)));
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

export function createMightyBasicBot(): Bot<MightyView, MightyAction> {
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
          // 리드: 아깝지 않은 카드부터 내보낸다 (마이티·조커는 아껴둔다)
          return [...plays].sort((a, b) => {
            const ca = a.type === 'PLAY_CARD' ? a.card : '';
            const cb = b.type === 'PLAY_CARD' ? b.card : '';
            return keepValue(ca, trump) - keepValue(cb, trump);
          })[0] as MightyAction;
        }

        const winners = plays.filter((a) => {
          const card = a.type === 'PLAY_CARD' ? a.card : '';
          return cardStrength(card, tctx) > threshold;
        });

        // 점수카드가 걸린 트릭이면 가장 싼 승리 카드로 먹는다
        if (trickHasPoints && winners.length > 0) {
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

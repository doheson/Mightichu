/**
 * 티츄 휴리스틱 봇 (L2).
 *
 * 입력은 리댁션된 `TichuView` 뿐이다 — 남의 손패를 볼 수 없다.
 *
 * L1.5 에서 달라진 점:
 *  - **핸드 분할**(`plan.ts`)로 손패를 낼 단위로 미리 쪼갠다.
 *    스트레이트가 될 카드를 홑장으로 흘리지 않는다
 *  - **티츄 선언** 을 손패 가치로 판단한다
 *  - **카운팅** — 이미 나온 카드를 보고 내 카드가 최고인지 안다
 *  - **파트너 지원** — 파트너 패를 밟지 않고, 파트너가 티츄를 불렀으면 길을 터준다
 */

import type { Bot, BotContext } from '@mightichu/core';
import {
  DRAGON,
  PHOENIX,
  cardPoints,
  countPoints,
  isBomb,
  parseCards,
  rankOf,
  type Card,
  type Combo,
  type TichuAction,
  type TichuView,
} from '@mightichu/tichu';
import {
  isHighestLeft,
  planHand,
  shouldCallGrandTichu,
  shouldCallTichu,
} from './plan.js';

/** 값이 작을수록 내보내기 쉬운 카드. */
function keepValue(card: Card): number {
  if (card === DRAGON) return 1000;
  if (card === PHOENIX) return 900;
  const rank = rankOf(card);
  if (rank === null) return 10; // 개·참새는 일찍 처리하는 편이 낫다
  return rank * 10 + cardPoints(card);
}

function comboCost(cards: readonly Card[]): number {
  return cards.reduce((sum, c) => sum + keepValue(c), 0);
}

function playsOf(actions: readonly TichuAction[]): Extract<TichuAction, { type: 'PLAY' }>[] {
  return actions.filter((a): a is Extract<TichuAction, { type: 'PLAY' }> => a.type === 'PLAY');
}

/**
 * 지금 트릭을 이기고 있는 사람. 빈 트릭이면 null.
 * 마지막으로 낸 사람이 곧 현재 승자다 — 뒤에 냈다는 건 앞을 이겼다는 뜻이므로.
 */
function currentWinner(view: TichuView): string | null {
  const last = view.currentTrick[view.currentTrick.length - 1];
  return last?.player ?? null;
}

export function createTichuBasicBot(): Bot<TichuView, TichuAction> {
  return {
    id: 'tichu-basic',
    label: '기본 봇',

    /**
     * 선택적 액션만 있을 때는 두지 않는다.
     *  - 티츄 선언: 이 수준의 봇에게는 ±100 도박이라 부르지 않는다
     *  - 아웃 오브 턴 폭탄: 점수가 큰 트릭에서만 쓴다
     * 이게 없으면 봇이 매 순간 티츄를 선언하고 사람 차례가 오지 않는다.
     */
    wants(ctx: BotContext<TichuView, TichuAction>): boolean {
      const { view, legal } = ctx;
      const meaningful = legal.filter((a) => a.type !== 'DECLARE_TICHU');
      if (meaningful.length === 0) return false;
      if (view.phase !== 'PLAY') return true;
      if (view.turn === view.me) return true;
      // 내 차례가 아니면 폭탄만 가능하다 — 큰 트릭에서만, 그리고 **파트너가 이기고 있으면 안 쓴다**
      if (view.partner !== null && currentWinner(view) === view.partner) return false;
      const points = countPoints(view.currentTrick.flatMap((p) => p.combo.cards));
      return points >= 15;
    },

    decide(ctx: BotContext<TichuView, TichuAction>): TichuAction {
      const { view, legal } = ctx;
      const hand = view.myHand;

      // ── 라지 티츄: 8장만 보고 판단하므로 훨씬 보수적으로
      const grand = legal.find((a) => a.type === 'DECLARE_GRAND');
      const passGrand = legal.find((a) => a.type === 'PASS_GRAND');
      if (passGrand !== undefined) {
        if (grand !== undefined && shouldCallGrandTichu(hand)) return grand;
        return passGrand;
      }

      /**
       * ── 스몰 티츄
       *
       * **교환이 끝난 뒤에** 판단한다. 교환 전 손패로 재면 받을 3장을 모르는 채
       * 재는 셈이라 예측력이 크게 떨어진다(실측: 교환 전 기준 37%, 교환 후 기준 ~50%).
       * 룰상 첫 카드를 내기 전이면 언제든 선언할 수 있으므로 이게 가능하다.
       */
      const callTichu = legal.find((a) => a.type === 'DECLARE_TICHU');
      if (
        callTichu !== undefined &&
        view.phase === 'PLAY' &&
        view.turn === view.me &&
        shouldCallTichu(hand)
      ) {
        return callTichu;
      }

      const options = legal.filter((a) => a.type !== 'DECLARE_TICHU');
      if (options.length === 0) return legal[0] as TichuAction;

      // ── 교환: 상대에게는 가장 약한 카드, 파트너에게는 괜찮은 카드
      const gives = options.filter((a): a is Extract<TichuAction, { type: 'GIVE' }> => a.type === 'GIVE');
      if (gives.length > 0) {
        const partner = view.partner;
        const toPartner = gives.filter((a) => a.to === partner);
        const pool = toPartner.length > 0 ? toPartner : gives;
        // 파트너에게는 센 카드, 상대에게는 약한 카드
        const wantHigh = toPartner.length > 0;
        return [...pool].sort((a, b) =>
          wantHigh ? keepValue(b.card) - keepValue(a.card) : keepValue(a.card) - keepValue(b.card),
        )[0] as TichuAction;
      }

      // ── 용 양도: 점수를 덜 모은 상대에게
      const gifts = options.filter(
        (a): a is Extract<TichuAction, { type: 'GIVE_DRAGON' }> => a.type === 'GIVE_DRAGON',
      );
      if (gifts.length > 0) {
        return [...gifts].sort(
          (a, b) => (view.takenPoints[a.to] ?? 0) - (view.takenPoints[b.to] ?? 0),
        )[0] as TichuAction;
      }

      // ── 플레이
      const plays = playsOf(options);
      const pass = options.find((a) => a.type === 'PASS');

      if (plays.length > 0) {
        const leading = view.currentCombo === null && view.turn === view.me;
        const trickPoints = countPoints(
          view.currentTrick.flatMap((p) => p.combo.cards),
        );
        // **팀 패는 밟지 않는다.** 파트너가 이기고 있으면 그 점수는 우리 팀 것이다.
        const partnerWinning =
          view.partner !== null && currentWinner(view) === view.partner;

        // 소원 지정은 하지 않는다(파트너의 폭탄을 깨뜨릴 수 있다)
        const simple = plays.filter((a) => a.wish === undefined);
        const pool = simple.length > 0 ? simple : plays;

        // 폭탄은 점수가 걸린 트릭에서만
        const nonBomb = pool.filter((a) => {
          const combo = parseCards(a.cards, view.currentCombo);
          return combo === null || !isBomb(combo);
        });
        const usable = trickPoints >= 10 ? pool : nonBomb.length > 0 ? nonBomb : pool;

        /**
         * **파트너가 티츄를 불렀고 내가 선을 잡았으면 싱글로 돌려준다.**
         *
         * 티츄는 선언자가 **먼저** 손을 털어야 성공이다. 내가 긴 조합으로 리드하면
         * 파트너가 그 형태·장수를 맞춰야만 받을 수 있어 길이 막힌다.
         * 싱글이 파트너가 가장 받기 쉬운 형태라 선을 넘겨주기 좋다.
         */
        const partnerCalledTichu =
          view.partner !== null && (view.calls[view.partner] ?? 'NONE') !== 'NONE';
        if (leading && partnerCalledTichu) {
          const singles = usable.filter((a) => a.cards.length === 1);
          if (singles.length > 0) {
            return [...singles].sort(
              (a, b) => comboCost(a.cards) - comboCost(b.cards),
            )[0] as TichuAction;
          }
        }

        if (leading) {
          /**
           * 리드는 **계획에 있는 단위**부터 낸다. 계획을 깨면 남은 카드가 애매해진다.
           * 폭탄은 아껴두고, 통제 카드(최고 카드)는 마지막에 쓴다.
           */
          const plan = planHand(hand);
          const planned = new Set(
            [...plan.lots].map((lot) => [...lot.cards].sort().join(',')),
          );
          const inPlan = usable.filter(
            (a) => planned.has([...a.cards].sort().join(',')),
          );
          const pool2 = inPlan.length > 0 ? inPlan : usable;

          return [...pool2].sort((a, b) => {
            // 긴 것부터 털고, 같으면 싼 것부터
            const lengthDiff = b.cards.length - a.cards.length;
            if (lengthDiff !== 0) return lengthDiff;
            return comboCost(a.cards) - comboCost(b.cards);
          })[0] as TichuAction;
        }

        // 파트너가 이기고 있으면 넘긴다 — 우리 팀 점수를 내가 뺏을 이유가 없다
        if (partnerWinning && pass !== undefined) return pass;

        /**
         * 파트너가 티츄를 불렀으면 **길을 터준다**.
         * 파트너가 먼저 손을 털어야 성공이므로, 내가 굳이 트릭을 가져가
         * 리드를 쥐고 있을 이유가 없다. 점수가 큰 트릭만 챙긴다.
         */
        const partnerCalled =
          view.partner !== null && (view.calls[view.partner] ?? 'NONE') !== 'NONE';
        if (partnerCalled && trickPoints < 10 && pass !== undefined) return pass;

        // 따라가기: 점수가 없는 트릭이면 아끼고 패스
        if (trickPoints <= 0 && pass !== undefined && usable.length > 0) {
          const cheapest = [...usable].sort(
            (a, b) => comboCost(a.cards) - comboCost(b.cards),
          )[0] as Extract<TichuAction, { type: 'PLAY' }>;
          // 싼 카드로 먹을 수 있으면 먹고, 아니면 패스
          if (comboCost(cheapest.cards) > 90) return pass;
          return cheapest;
        }
        /**
         * 먹어야 하는 상황 — **최고 카드는 아껴둔다.**
         * 이미 나온 카드를 세어(카운팅) 내 카드가 최고라면 더 급할 때 쓴다.
         */
        const sorted = [...usable].sort((a, b) => comboCost(a.cards) - comboCost(b.cards));

        /**
         * **용·봉황 타이밍.**
         *
         * 용은 +25점짜리이고 최강 싱글이지만, 먹으면 **트릭을 상대에게 넘겨야 한다**.
         * 작은 트릭에 쓰면 25점을 그냥 상대에게 주는 꼴이다. 큰 트릭에서만 쓴다.
         * 봉황은 −25점이라 내 트릭에 섞이면 손해다 — 상대가 먹을 트릭에 흘리거나
         * 꼭 이겨야 할 때만 쓴다.
         */
        const isPremium = (a: Extract<TichuAction, { type: 'PLAY' }>): boolean =>
          a.cards.includes(DRAGON) || a.cards.includes(PHOENIX);
        const dragonWorthIt = trickPoints >= 15 || hand.length <= 3;
        const cheap = sorted.filter((a) => !isPremium(a));
        const afterPremium = dragonWorthIt || cheap.length === 0 ? sorted : cheap;

        const notTopCard = afterPremium.filter(
          (a) =>
            a.cards.length !== 1 ||
            !isHighestLeft(a.cards[0] as Card, hand, view.playedCards),
        );
        const pick = notTopCard.length > 0 && trickPoints < 20 ? notTopCard : afterPremium;
        return pick[0] as TichuAction;
      }

      if (pass !== undefined) return pass;

      const fallback = options[0];
      if (fallback === undefined) throw new Error('합법 수가 없는데 봇이 호출되었다');
      return fallback;
    },
  };
}

export type { Combo };

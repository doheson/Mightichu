/**
 * 티츄 기본 봇 (L1.5) — 사람이 상대해볼 수 있는 최소 수준.
 *
 * ⚠️ 임시 수준이다. 제대로 된 휴리스틱(L2)은 5단계 과제다.
 * 티츄의 진짜 난점은 **핸드 분할**(14장을 어떤 조합들로 쪼갤지)인데 여기서는 다루지 않는다.
 *
 * 입력은 리댁션된 `TichuView` 뿐이다 — 남의 손패를 볼 수 없다.
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

      // ── 라지 티츄는 부르지 않는다 (−200 위험이 크다)
      const passGrand = legal.find((a) => a.type === 'PASS_GRAND');
      if (passGrand !== undefined) return passGrand;

      // 티츄 선언은 선택지에서 제외한다 (wants 가 이미 걸러주지만 방어적으로)
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

        if (leading) {
          // 리드: 가장 싼 조합부터 털어낸다. 장수가 많으면 더 좋다.
          return [...usable].sort((a, b) => {
            const lengthDiff = b.cards.length - a.cards.length;
            if (lengthDiff !== 0) return lengthDiff;
            return comboCost(a.cards) - comboCost(b.cards);
          })[0] as TichuAction;
        }

        // 파트너가 이기고 있으면 넘긴다 — 우리 팀 점수를 내가 뺏을 이유가 없다
        if (partnerWinning && pass !== undefined) return pass;

        // 따라가기: 점수가 없는 트릭이면 아끼고 패스
        if (trickPoints <= 0 && pass !== undefined && usable.length > 0) {
          const cheapest = [...usable].sort(
            (a, b) => comboCost(a.cards) - comboCost(b.cards),
          )[0] as Extract<TichuAction, { type: 'PLAY' }>;
          // 싼 카드로 먹을 수 있으면 먹고, 아니면 패스
          if (comboCost(cheapest.cards) > 90) return pass;
          return cheapest;
        }
        return [...usable].sort((a, b) => comboCost(a.cards) - comboCost(b.cards))[0] as TichuAction;
      }

      if (pass !== undefined) return pass;

      const fallback = options[0];
      if (fallback === undefined) throw new Error('합법 수가 없는데 봇이 호출되었다');
      return fallback;
    },
  };
}

export type { Combo };

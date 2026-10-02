/**
 * 트릭 규칙 — 강약 판정, 승자 결정, 합법 제출 카드.
 *
 * 강약 (높은 순):
 *   마이티 > 조커(효력 있을 때) > 기루다 > 리드 무늬 > 나머지(승리 불가)
 */

import type { Rank, Suit, Trump } from './cards.js';
import {
  JOKER,
  isJoker,
  jokerCallCard,
  mightyCard,
  rankOf,
  suitOf,
} from './cards.js';
import type { Card, TrickPlay } from './types.js';

export const TRICKS_PER_ROUND = 10;
export const LAST_TRICK = TRICKS_PER_ROUND - 1;

export interface TrickContext {
  readonly trump: Trump;
  /** 0-based. 조커 효력 판정에 쓴다. */
  readonly trickNo: number;
  /** 리드로 확정된 무늬. 아직 리드 전이면 null. */
  readonly leadSuit: Suit | null;
  /** 이 트릭에 조커콜이 리드되어 조커가 무력화되었는가. */
  readonly jokerCalled: boolean;
}

/**
 * 조커가 효력을 갖는가.
 * 첫 트릭·마지막 트릭·조커콜에 걸린 트릭에서는 효력이 없어 트릭을 이길 수 없다.
 */
export function isJokerEffective(ctx: TrickContext): boolean {
  return !ctx.jokerCalled && ctx.trickNo !== 0 && ctx.trickNo !== LAST_TRICK;
}

/**
 * 조커를 **낼 수 없는** 트릭인가.
 *
 * 확정 룰: **첫 트릭에만** 조커를 낼 수 없다 (리드도 팔로우도).
 *
 * 마지막 트릭은 제한하지 않는다 — 그 시점엔 전원 손패가 1장이므로
 * "못 낸다" 와 "효력 없다" 가 결과적으로 같아진다(조커가 유일한 카드면 어차피 내게 된다).
 * 마지막 트릭의 조커는 낼 수 있지만 트릭을 이기지 못한다 → `isJokerEffective`.
 */
export function isJokerRestrictedTrick(trickNo: number): boolean {
  return trickNo === 0;
}

/**
 * 강약 점수. 클수록 강하다. 0 은 "이길 수 없음".
 * 동점은 호출부에서 **먼저 낸 쪽** 우선으로 처리한다.
 */
export function cardStrength(card: Card, ctx: TrickContext): number {
  if (card === mightyCard(ctx.trump)) return 1000;

  if (isJoker(card)) {
    // 효력 없는 조커도 리드였다면 아무것도 못 내는 카드들보다는 앞선다(1).
    return isJokerEffective(ctx) ? 900 : 1;
  }

  const suit = suitOf(card) as Suit;
  const rank = rankOf(card) as Rank;

  if (ctx.trump !== 'NT' && suit === ctx.trump) return 500 + rank;
  if (ctx.leadSuit !== null && suit === ctx.leadSuit) return 100 + rank;
  return 0;
}

/** 트릭 승자. 빈 트릭이면 null. */
export function trickWinner(
  trick: readonly TrickPlay[],
  ctx: TrickContext,
): PlayerIdLike | null {
  if (trick.length === 0) return null;
  let best = trick[0] as TrickPlay;
  let bestStrength = cardStrength(best.card, ctx);
  for (let i = 1; i < trick.length; i++) {
    const play = trick[i] as TrickPlay;
    const strength = cardStrength(play.card, ctx);
    if (strength > bestStrength) {
      best = play;
      bestStrength = strength;
    }
  }
  return best.player;
}

type PlayerIdLike = string;

/**
 * 리드 무늬 결정.
 * 조커를 리드하면 지정 무늬가 리드 무늬가 된다(효력 유무와 무관 — 팔로우 의무만 정하는 것).
 */
export function resolveLeadSuit(
  leadCard: Card,
  nomination: Suit | null,
): Suit | null {
  if (isJoker(leadCard)) return nomination;
  return suitOf(leadCard);
}

export interface LegalPlayContext extends TrickContext {
  /** 내가 리드인가 (트릭의 첫 카드). */
  readonly isLeading: boolean;
  /** 라운드 첫 트릭의 리드인가 — 기루다 리드 제한이 걸린다. */
  readonly isFirstTrickLead: boolean;
}

/**
 * 낼 수 있는 카드 목록.
 *
 * 우선순위:
 *  1. **조커콜 강제** — 조커 보유자는 조커를 내야 한다.
 *     단 마이티도 함께 쥐었다면 마이티를 내고 조커를 지킬 수 있다.
 *  2. 리드일 때 — 첫 트릭이면 기루다 리드 금지(전부 기루다면 예외)
 *  3. 팔로우 — 리드 무늬가 있으면 따라야 한다.
 *     마이티·조커는 팔로우 의무를 무시하고 낼 수 있다.
 *     예외: 리드 무늬 카드가 **마이티 한 장뿐**이면 마이티를 반드시 내야 한다.
 */
export function legalPlays(
  hand: readonly Card[],
  ctx: LegalPlayContext,
): Card[] {
  const mighty = mightyCard(ctx.trump);
  const hasMighty = hand.includes(mighty);
  const hasJoker = hand.includes(JOKER);
  const jokerBanned = isJokerRestrictedTrick(ctx.trickNo);

  /** 조커를 걸러낸다. 그러면 낼 게 없어지는 경우엔 어쩔 수 없이 원본을 돌려준다. */
  const dropJoker = (cards: readonly Card[]): Card[] => {
    if (!jokerBanned) return cards.slice();
    const without = cards.filter((card) => !isJoker(card));
    return without.length > 0 ? without : cards.slice();
  };

  // 1. 조커콜 강제 — 팔로우보다 우선한다.
  //    (조커콜은 첫 트릭에 할 수 없으므로 여기서 조커 금지와 겹치지 않는다)
  if (ctx.jokerCalled && hasJoker && !ctx.isLeading) {
    return hasMighty ? [JOKER, mighty] : [JOKER];
  }

  // 2. 리드
  if (ctx.isLeading) {
    if (!ctx.isFirstTrickLead) return dropJoker(hand);

    // 첫 트릭 리드에는 금지가 둘 겹친다: 조커 금지 + 기루다 리드 금지.
    // 조커 금지를 먼저 적용하고, 그 결과가 전부 기루다면 기루다 리드를 허용한다
    // (예: 기루다 9장 + 조커 → 조커를 강제로 내게 하는 것보다 기루다 리드가 자연스럽다).
    let candidates = dropJoker(hand);
    if (ctx.trump !== 'NT') {
      const nonTrump = candidates.filter((card) => suitOf(card) !== ctx.trump);
      if (nonTrump.length > 0) candidates = nonTrump;
    }
    return candidates;
  }

  // 3. 팔로우
  if (ctx.leadSuit === null) return dropJoker(hand);

  const inSuit = hand.filter((card) => suitOf(card) === ctx.leadSuit);
  if (inSuit.length === 0) return dropJoker(hand);

  // 리드 무늬가 마이티 한 장뿐이면 강제 제출 — 조커로 빠져나갈 수 없다.
  if (inSuit.length === 1 && inSuit[0] === mighty) return [mighty];

  const allowed = new Set(inSuit);
  if (hasMighty) allowed.add(mighty);
  if (hasJoker && !jokerBanned) allowed.add(JOKER);
  return [...allowed];
}

/**
 * 이 카드를 리드하며 조커를 강제 호출할 수 있는가.
 * 조커콜 카드를 **첫 트릭이 아닌 트릭에 리드**할 때만 가능하다.
 */
export function canCallJoker(card: Card, trump: Trump, trickNo: number): boolean {
  return trickNo !== 0 && card === jokerCallCard(trump);
}

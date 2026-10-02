/** 비딩과 기루다 변경 규칙. */

import type { Trump } from './cards.js';
import { TRUMP_CHOICES } from './cards.js';
import type { Bid } from './types.js';

export const MIN_BID = 13;
export const MAX_BID = 20;

/**
 * 비드 서열. 숫자가 크면 강하고, **같은 숫자면 노기루다가 강하다.**
 * 2배 스케일로 두어 NT 를 +1 로 표현 — 정수 비교만으로 끝난다.
 */
export function bidRank(bid: Bid): number {
  return bid.count * 2 + (bid.trump === 'NT' ? 1 : 0);
}

export function isHigherBid(candidate: Bid, current: Bid): boolean {
  return bidRank(candidate) > bidRank(current);
}

export function isValidBidCount(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_BID && count <= MAX_BID;
}

/**
 * 현재 최고 비드 위에서 부를 수 있는 모든 비드.
 * 확정 룰: 노기루다도 최저 13 — 깎아주지 않는다.
 */
export function legalBids(current: Bid | null): Bid[] {
  const out: Bid[] = [];
  for (let count = MIN_BID; count <= MAX_BID; count++) {
    for (const trump of TRUMP_CHOICES) {
      const bid: Bid = { trump, count };
      if (current === null || isHigherBid(bid, current)) out.push(bid);
    }
  }
  return out;
}

/**
 * 바닥 수령 후 기루다를 `newTrump` 로 바꾸려면 공약을 몇으로 올려야 하는가.
 * 불가능하면 null.
 *
 * pagat 규칙:
 *  - 무늬 → 다른 무늬, 노기루다 → 무늬 : **+2** (19 에서 20 으로 가는 경우 +1 로 상한)
 *  - 무늬 → 노기루다 : **+1** (단 공약 20 이면 "20 노기루다" 로 무상 변경)
 *  - 그대로 두면 변동 없음
 */
export function requiredCountForTrumpChange(
  current: Bid,
  newTrump: Trump,
): number | null {
  if (newTrump === current.trump) return current.count;

  const toNoTrump = current.trump !== 'NT' && newTrump === 'NT';

  // 20 → 20 노기루다는 무상
  if (toNoTrump && current.count === MAX_BID) return MAX_BID;

  const bump = toNoTrump ? 1 : 2;
  const required = Math.min(current.count + bump, MAX_BID);
  return required > current.count ? required : null;
}

/** 주공이 바꿀 수 있는 모든 계약 (변경 없음 포함). */
export function legalContractChanges(current: Bid): Bid[] {
  const out: Bid[] = [{ ...current }];
  for (const trump of TRUMP_CHOICES) {
    if (trump === current.trump) continue;
    const required = requiredCountForTrumpChange(current, trump);
    if (required === null) continue;
    for (let count = required; count <= MAX_BID; count++) {
      out.push({ trump, count });
    }
  }
  return out;
}

export function bidLabel(bid: Bid): string {
  const label: Record<Trump, string> = {
    S: '스페이드',
    D: '다이아',
    H: '하트',
    C: '클럽',
    NT: '노기루다',
  };
  return `${label[bid.trump]} ${bid.count}`;
}

import { describe, expect, it } from 'vitest';
import {
  MAX_BID,
  MIN_BID,
  bidRank,
  isHigherBid,
  isValidBidCount,
  legalBids,
  legalContractChanges,
  requiredCountForTrumpChange,
} from '../src/bidding.js';
import type { Bid } from '../src/types.js';

const bid = (trump: Bid['trump'], count: number): Bid => ({ trump, count });

describe('비드 서열', () => {
  it('숫자가 크면 강하다', () => {
    expect(isHigherBid(bid('S', 15), bid('S', 14))).toBe(true);
    expect(isHigherBid(bid('S', 14), bid('S', 15))).toBe(false);
  });

  it('같은 숫자면 노기루다가 강하다', () => {
    expect(isHigherBid(bid('NT', 14), bid('S', 14))).toBe(true);
    expect(isHigherBid(bid('S', 14), bid('NT', 14))).toBe(false);
  });

  it('무늬끼리는 같은 숫자면 동급 — 더 높지 않다', () => {
    expect(isHigherBid(bid('S', 14), bid('H', 14))).toBe(false);
    expect(bidRank(bid('S', 14))).toBe(bidRank(bid('H', 14)));
  });

  it('노기루다 13 은 유기루다 14 보다 약하다', () => {
    expect(isHigherBid(bid('NT', 13), bid('S', 14))).toBe(false);
  });
});

describe('공약 범위', () => {
  it('최저 13, 최고 20', () => {
    expect(MIN_BID).toBe(13);
    expect(MAX_BID).toBe(20);
    expect(isValidBidCount(12)).toBe(false);
    expect(isValidBidCount(13)).toBe(true);
    expect(isValidBidCount(20)).toBe(true);
    expect(isValidBidCount(21)).toBe(false);
  });

  it('정수가 아니면 거부', () => {
    expect(isValidBidCount(14.5)).toBe(false);
  });

  it('노기루다도 최저 13 — 깎아주지 않는다 (확정 룰)', () => {
    const first = legalBids(null);
    expect(first.some((b) => b.trump === 'NT' && b.count === 13)).toBe(true);
    expect(first.some((b) => b.count < 13)).toBe(false);
  });

  it('첫 비딩은 5종 기루다 × 8단계 = 40가지', () => {
    expect(legalBids(null)).toHaveLength(40);
  });

  it('현재 최고 비드보다 높은 것만 나온다', () => {
    for (const candidate of legalBids(bid('H', 16))) {
      expect(isHigherBid(candidate, bid('H', 16))).toBe(true);
    }
  });

  it('20 노기루다 위에는 아무것도 없다', () => {
    expect(legalBids(bid('NT', MAX_BID))).toHaveLength(0);
  });
});

describe('바닥 수령 후 기루다 변경 (pagat)', () => {
  it('그대로 두면 공약 변동 없음', () => {
    expect(requiredCountForTrumpChange(bid('H', 15), 'H')).toBe(15);
  });

  it('무늬 → 다른 무늬는 +2', () => {
    expect(requiredCountForTrumpChange(bid('H', 15), 'S')).toBe(17);
  });

  it('노기루다 → 무늬도 +2', () => {
    expect(requiredCountForTrumpChange(bid('NT', 15), 'S')).toBe(17);
  });

  it('무늬 → 노기루다는 +1', () => {
    expect(requiredCountForTrumpChange(bid('H', 15), 'NT')).toBe(16);
  });

  it('19 에서 다른 무늬로는 +1 로 상한 (20)', () => {
    expect(requiredCountForTrumpChange(bid('H', 19), 'S')).toBe(20);
  });

  it('20 에서 다른 무늬로는 불가', () => {
    expect(requiredCountForTrumpChange(bid('H', 20), 'S')).toBeNull();
    expect(requiredCountForTrumpChange(bid('NT', 20), 'S')).toBeNull();
  });

  it('20 → 20 노기루다는 무상', () => {
    expect(requiredCountForTrumpChange(bid('H', 20), 'NT')).toBe(20);
  });

  it('변경 목록에는 항상 "변경 없음"이 포함된다', () => {
    const changes = legalContractChanges(bid('H', 15));
    expect(changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ trump: 'H', count: 15 })]),
    );
  });

  it('변경 목록의 모든 항목이 요구 공약을 만족한다', () => {
    const current = bid('D', 16);
    for (const change of legalContractChanges(current)) {
      const required = requiredCountForTrumpChange(current, change.trump);
      expect(required).not.toBeNull();
      expect(change.count).toBeGreaterThanOrEqual(required as number);
      expect(change.count).toBeLessThanOrEqual(MAX_BID);
    }
  });
});

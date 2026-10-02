import { describe, expect, it } from 'vitest';
import { BACK_RUN_THRESHOLD, computeScore, redealScore } from '../src/scoring.js';
import type { ScoringDetail, ScoringInput } from '../src/scoring.js';
import type { Bid, FriendCall } from '../src/types.js';

const SEATS = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;

const input = (over: Partial<ScoringInput> = {}): ScoringInput => ({
  seats: SEATS,
  declarer: 'p1',
  friend: 'p2',
  friendCall: { kind: 'CARD', card: 'H14' } as FriendCall,
  contract: { trump: 'H', count: 14 } as Bid,
  declarerPoints: 14,
  ...over,
});

const detailOf = (over: Partial<ScoringInput> = {}): ScoringDetail =>
  computeScore(input(over)).detail as unknown as ScoringDetail;

const sum = (perPlayer: Readonly<Record<string, number>>): number =>
  Object.values(perPlayer).reduce((a, b) => a + b, 0);

describe('기본 공식', () => {
  it('기준선은 최저 공약 13 — 13 공약 13장이 0점', () => {
    const d = detailOf({ contract: { trump: 'H', count: 13 }, declarerPoints: 13 });
    expect(d.won).toBe(true);
    expect(d.baseScore).toBe(0);
  });

  it('공약 14 로 14장 획득 — 2×(14−13) + 0 = 2', () => {
    const d = detailOf({ contract: { trump: 'H', count: 14 }, declarerPoints: 14 });
    expect(d.won).toBe(true);
    expect(d.baseScore).toBe(2);
  });

  it('공약 16 으로 17장 획득 — 2×(16−13) + (17−16) = 7', () => {
    const d = detailOf({ contract: { trump: 'H', count: 16 }, declarerPoints: 17 });
    expect(d.baseScore).toBe(7);
  });

  it('실패하면 부족한 장수가 기본 점수', () => {
    const d = detailOf({ contract: { trump: 'H', count: 16 }, declarerPoints: 12 });
    expect(d.won).toBe(false);
    expect(d.baseScore).toBe(4);
  });

  it('야당 점수는 20 − 여당 점수', () => {
    const d = detailOf({ declarerPoints: 13 });
    expect(d.defenderPoints).toBe(7);
  });
});

describe('지급 (제로섬)', () => {
  it('성공: 주공 +2S, 프렌드 +S, 야당 3명 각 −S', () => {
    const score = computeScore(
      input({ contract: { trump: 'H', count: 16 }, declarerPoints: 17 }),
    );
    expect(score.perPlayer['p1']).toBe(14); // 2 × 7
    expect(score.perPlayer['p2']).toBe(7);
    expect(score.perPlayer['p3']).toBe(-7);
    expect(score.perPlayer['p4']).toBe(-7);
    expect(score.perPlayer['p5']).toBe(-7);
    expect(sum(score.perPlayer)).toBe(0);
  });

  it('실패: 부호가 반대', () => {
    const score = computeScore(
      input({ contract: { trump: 'H', count: 16 }, declarerPoints: 12 }),
    );
    expect(score.perPlayer['p1']).toBe(-8); // −2 × 4
    expect(score.perPlayer['p2']).toBe(-4);
    expect(score.perPlayer['p3']).toBe(4);
    expect(sum(score.perPlayer)).toBe(0);
  });

  it('노프렌드 성공: 주공 +4S, 야당 4명 각 −S', () => {
    const score = computeScore(
      input({
        friend: null,
        friendCall: { kind: 'NONE' },
        contract: { trump: 'H', count: 15 },
        declarerPoints: 15,
      }),
    );
    // baseScore = 2×(15−13) + 0 = 4, 노프렌드 배수 ×2 → 8
    expect(score.perPlayer['p1']).toBe(32); // 4 × 8
    expect(score.perPlayer['p2']).toBe(-8);
    expect(sum(score.perPlayer)).toBe(0);
  });

  it('어떤 경우에도 합이 0 이다', () => {
    for (let points = 0; points <= 20; points++) {
      for (const count of [13, 16, 20]) {
        for (const friend of ['p2', null]) {
          const score = computeScore(
            input({ declarerPoints: points, contract: { trump: 'H', count }, friend }),
          );
          expect(sum(score.perPlayer)).toBe(0);
        }
      }
    }
  });
});

describe('배수 (누적)', () => {
  it('런 — 여당이 20장 전부', () => {
    const d = detailOf({ contract: { trump: 'H', count: 20 }, declarerPoints: 20 });
    expect(d.multipliers).toContain('RUN');
  });

  it('백런 — 야당이 11장 이상', () => {
    const d = detailOf({ declarerPoints: 20 - BACK_RUN_THRESHOLD });
    expect(d.multipliers).toContain('BACK_RUN');
  });

  it('야당 10장이면 백런 아님', () => {
    const d = detailOf({ declarerPoints: 10 });
    expect(d.multipliers).not.toContain('BACK_RUN');
  });

  it('노기루다 ×2', () => {
    const d = detailOf({ contract: { trump: 'NT', count: 14 } });
    expect(d.multipliers).toContain('NO_TRUMP');
  });

  it('선언한 노프렌드 ×2', () => {
    const d = detailOf({ friend: null, friendCall: { kind: 'NONE' } });
    expect(d.multipliers).toContain('NO_FRIEND');
  });

  it('배수가 누적된다 — 노기루다 런은 ×4', () => {
    const d = detailOf({ contract: { trump: 'NT', count: 20 }, declarerPoints: 20 });
    expect(d.multipliers).toEqual(expect.arrayContaining(['RUN', 'NO_TRUMP']));
    expect(d.multiplier).toBe(4);
  });

  it('노기루다 + 노프렌드 + 런 = ×8', () => {
    const d = detailOf({
      contract: { trump: 'NT', count: 20 },
      declarerPoints: 20,
      friend: null,
      friendCall: { kind: 'NONE' },
    });
    expect(d.multiplier).toBe(8);
  });
});

describe('숨은 노프렌드 — 지급은 4S 지만 배수는 없다', () => {
  it('지명 카드가 주공에게 있어 프렌드가 안 생긴 경우', () => {
    const score = computeScore(
      input({
        friend: null,
        friendCall: { kind: 'CARD', card: 'H14' },
        contract: { trump: 'H', count: 15 },
        declarerPoints: 15,
      }),
    );
    const d = score.detail as unknown as ScoringDetail;
    expect(d.solo).toBe(true);
    expect(d.multipliers).not.toContain('NO_FRIEND');
    expect(d.multiplier).toBe(1);
    expect(score.perPlayer['p1']).toBe(16); // 4 × 4, 배수 없음
  });

  it('초구 프렌드에서 주공이 첫 트릭을 먹은 경우도 배수 없음', () => {
    const d = detailOf({ friend: null, friendCall: { kind: 'FIRST_TRICK' } });
    expect(d.solo).toBe(true);
    expect(d.multipliers).not.toContain('NO_FRIEND');
  });
});

describe('재딜', () => {
  it('전원 0점', () => {
    const score = redealScore(SEATS, 'MISDEAL');
    for (const seat of SEATS) expect(score.perPlayer[seat]).toBe(0);
    expect(score.detail).toMatchObject({ outcome: 'REDEAL', reason: 'MISDEAL' });
  });

  it('전원 패스도 마찬가지', () => {
    expect(redealScore(SEATS, 'ALL_PASSED').detail).toMatchObject({
      reason: 'ALL_PASSED',
    });
  });
});

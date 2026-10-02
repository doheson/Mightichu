import { describe, expect, it } from 'vitest';
import { createRng, pick, randomInt, shuffle } from '../src/rng.js';

describe('createRng', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 50 }, () => a());
    const seqB = Array.from({ length: 50 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('다른 시드는 다른 수열을 낸다', () => {
    const a = Array.from({ length: 20 }, createRng(1));
    const b = Array.from({ length: 20 }, createRng(2));
    expect(a).not.toEqual(b);
  });

  it('[0, 1) 범위를 벗어나지 않는다', () => {
    const rng = createRng(999);
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('분포가 한쪽으로 쏠리지 않는다', () => {
    const rng = createRng(7);
    const n = 100_000;
    const counts = new Array<number>(10).fill(0);
    for (let i = 0; i < n; i++) {
      const bucket = Math.floor(rng() * 10);
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    const expected = n / 10;
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.9);
      expect(c).toBeLessThan(expected * 1.1);
    }
  });
});

describe('randomInt', () => {
  it('0 이상 max 미만', () => {
    const rng = createRng(42);
    for (let i = 0; i < 5_000; i++) {
      const v = randomInt(rng, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('max 가 0 이하면 0', () => {
    const rng = createRng(1);
    expect(randomInt(rng, 0)).toBe(0);
    expect(randomInt(rng, -3)).toBe(0);
  });
});

describe('shuffle', () => {
  const source = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  it('입력을 변경하지 않는다', () => {
    const copy = [...source];
    shuffle(source, createRng(3));
    expect([...source]).toEqual(copy);
  });

  it('원소를 잃거나 더하지 않는다 (순열)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const out = shuffle(source, createRng(seed));
      expect(out.slice().sort((a, b) => a - b)).toEqual([...source]);
    }
  });

  it('같은 시드면 같은 결과', () => {
    expect(shuffle(source, createRng(77))).toEqual(shuffle(source, createRng(77)));
  });

  it('실제로 섞인다', () => {
    const shuffled = shuffle(source, createRng(5));
    expect(shuffled).not.toEqual([...source]);
  });
});

describe('pick', () => {
  it('빈 배열이면 undefined', () => {
    expect(pick([], createRng(1))).toBeUndefined();
  });

  it('항상 원소 중 하나', () => {
    const rng = createRng(11);
    for (let i = 0; i < 500; i++) {
      expect(['a', 'b', 'c']).toContain(pick(['a', 'b', 'c'], rng));
    }
  });
});

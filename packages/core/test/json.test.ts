import { describe, expect, it } from 'vitest';
import {
  assertJsonSerializable,
  findNonJsonPath,
  isJsonSerializable,
} from '../src/json.js';

describe('findNonJsonPath', () => {
  it('평범한 JSON 값은 통과', () => {
    expect(findNonJsonPath({ a: 1, b: 'x', c: null, d: [1, 2, { e: true }] })).toBeNull();
  });

  it('빈 객체와 빈 배열도 통과', () => {
    expect(findNonJsonPath({})).toBeNull();
    expect(findNonJsonPath([])).toBeNull();
  });

  it.each([
    ['Map', new Map()],
    ['Set', new Set()],
    ['Date', new Date()],
    ['함수', () => undefined],
    ['undefined', undefined],
    ['BigInt', 10n],
    ['Symbol', Symbol('s')],
  ])('%s 를 거부한다', (_label, value) => {
    expect(isJsonSerializable(value)).toBe(false);
  });

  it('NaN 과 Infinity 는 거부 — stringify 가 조용히 null 로 바꾼다', () => {
    expect(isJsonSerializable(Number.NaN)).toBe(false);
    expect(isJsonSerializable(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('클래스 인스턴스를 거부한다', () => {
    class Card {
      constructor(public rank = 1) {}
    }
    expect(isJsonSerializable(new Card())).toBe(false);
  });

  it('위반 지점의 경로를 알려준다', () => {
    expect(findNonJsonPath({ hands: { p2: [{ rank: new Date() }] } })).toBe(
      '$.hands.p2[0].rank',
    );
  });

  it('중첩 배열 인덱스를 경로에 담는다', () => {
    expect(findNonJsonPath([0, 1, new Map()])).toBe('$[2]');
  });

  it('assertJsonSerializable 은 경로를 담아 던진다', () => {
    expect(() => assertJsonSerializable({ turn: undefined }, 'state')).toThrow(
      /state 가 JSON 직렬화 불가: \$\.turn/,
    );
  });

  it('정상 값에는 던지지 않는다', () => {
    expect(() => assertJsonSerializable({ ok: true })).not.toThrow();
  });
});

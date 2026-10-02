import { describe, expect, it } from 'vitest';
import {
  DOG,
  DRAGON,
  PHOENIX,
  SPARROW,
  countPoints,
  fullDeck,
  makeCard,
} from '../src/cards.js';
import {
  beats,
  bombsIn,
  canFulfillWish,
  enumerateCombos,
  isBomb,
  legalPlays,
  parseCards,
  type Combo,
} from '../src/combos.js';

const C = makeCard;

/** 특정 조합을 찾는다. */
function find(hand: string[], type: string, length?: number, current: Combo | null = null) {
  return enumerateCombos(hand, current).filter(
    (c) => c.type === type && (length === undefined || c.length === length),
  );
}

describe('덱', () => {
  it('56장, 중복 없음', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(56);
    expect(new Set(deck).size).toBe(56);
  });

  it('카드 점수 합이 100 — 용 +25 와 봉황 −25 가 상쇄된다', () => {
    expect(countPoints(fullDeck())).toBe(100);
  });

  it('어떤 카드도 다른 카드의 부분문자열이 아니다', () => {
    const deck = fullDeck();
    for (const a of deck) for (const b of deck) {
      if (a !== b) expect(b.includes(a)).toBe(false);
    }
  });
});

describe('기본 조합', () => {
  it('싱글', () => {
    expect(find([C('S', 7)], 'SINGLE')).toHaveLength(1);
  });

  it('페어', () => {
    expect(find([C('S', 7), C('D', 7)], 'PAIR')).toHaveLength(1);
  });

  it('트리플', () => {
    expect(find([C('S', 7), C('D', 7), C('H', 7)], 'TRIPLE')).toHaveLength(1);
  });

  it('풀하우스 — 트리플 끗으로 비교한다', () => {
    const hand = [C('S', 7), C('D', 7), C('H', 7), C('S', 4), C('D', 4)];
    const full = find(hand, 'FULL_HOUSE', 5);
    expect(full).toHaveLength(1);
    expect((full[0] as Combo).rank2).toBe(14); // 7 × 2
  });

  it('연속 페어(계단)', () => {
    const hand = [C('S', 5), C('D', 5), C('S', 6), C('D', 6)];
    const stairs = find(hand, 'STAIRS', 4);
    expect(stairs).toHaveLength(1);
    expect((stairs[0] as Combo).rank2).toBe(12); // 6 × 2
  });

  it('연속되지 않은 두 페어는 계단이 아니다', () => {
    const hand = [C('S', 5), C('D', 5), C('S', 8), C('D', 8)];
    expect(find(hand, 'STAIRS')).toHaveLength(0);
  });

  it('스트레이트는 5장 이상', () => {
    const four = [C('S', 3), C('D', 4), C('H', 5), C('C', 6)];
    expect(find(four, 'STRAIGHT')).toHaveLength(0);
    const five = [...four, C('S', 7)];
    expect(find(five, 'STRAIGHT', 5)).toHaveLength(1);
  });

  it('참새는 스트레이트에서 1 로 쓸 수 있다', () => {
    const hand = [SPARROW, C('S', 2), C('D', 3), C('H', 4), C('C', 5)];
    const straight = find(hand, 'STRAIGHT', 5);
    expect(straight).toHaveLength(1);
    expect((straight[0] as Combo).cards).toContain(SPARROW);
  });

  it('용은 스트레이트에 넣을 수 없다', () => {
    const hand = [C('S', 10), C('D', 11), C('H', 12), C('C', 13), DRAGON];
    expect(find(hand, 'STRAIGHT')).toHaveLength(0);
  });
});

describe('폭탄', () => {
  it('포카드', () => {
    const hand = [C('S', 9), C('D', 9), C('H', 9), C('C', 9)];
    const bombs = bombsIn(hand);
    expect(bombs).toHaveLength(1);
    expect((bombs[0] as Combo).type).toBe('BOMB_FOUR');
  });

  it('같은 무늬 연속 5장은 스트레이트 플러시 폭탄', () => {
    const hand = [C('S', 3), C('S', 4), C('S', 5), C('S', 6), C('S', 7)];
    const bombs = bombsIn(hand);
    expect(bombs.some((b) => b.type === 'BOMB_STRAIGHT' && b.length === 5)).toBe(true);
  });

  it('무늬가 섞이면 폭탄이 아니다', () => {
    const hand = [C('S', 3), C('D', 4), C('S', 5), C('S', 6), C('S', 7)];
    expect(bombsIn(hand)).toHaveLength(0);
  });

  it('봉황은 폭탄에 쓸 수 없다', () => {
    const hand = [C('S', 9), C('D', 9), C('H', 9), PHOENIX];
    expect(bombsIn(hand)).toHaveLength(0);
  });

  it('참새도 폭탄에 쓸 수 없다', () => {
    const hand = [SPARROW, C('S', 2), C('S', 3), C('S', 4), C('S', 5)];
    expect(bombsIn(hand).some((b) => b.cards.includes(SPARROW))).toBe(false);
  });
});

describe('강약 비교', () => {
  const single = (card: string, current: Combo | null = null): Combo =>
    enumerateCombos([card], current).find((c) => c.type === 'SINGLE') as Combo;

  it('같은 형태·같은 장수만 비교 가능', () => {
    const pair = find([C('S', 9), C('D', 9)], 'PAIR')[0] as Combo;
    expect(beats(single(C('S', 14)), pair)).toBe(false);
  });

  it('8장 스트레이트는 8장 스트레이트로만 이긴다', () => {
    const eight = Array.from({ length: 8 }, (_, i) => C('S', i + 2));
    const nine = Array.from({ length: 9 }, (_, i) => C('D', i + 3));
    const a = find(eight, 'STRAIGHT', 8)[0] as Combo;
    const b = find(nine, 'STRAIGHT', 9)[0] as Combo;
    expect(beats(b, a)).toBe(false); // 장수가 다르다
  });

  it('용이 에이스를 이긴다', () => {
    expect(beats(single(DRAGON), single(C('S', 14)))).toBe(true);
  });

  it('폭탄은 어떤 조합도 이긴다', () => {
    const bomb = bombsIn([C('S', 2), C('D', 2), C('H', 2), C('C', 2)])[0] as Combo;
    expect(beats(bomb, single(DRAGON))).toBe(true);
  });

  it('스트레이트 폭탄이 포카드를 이긴다 — 장수가 많아서', () => {
    const four = bombsIn([C('S', 14), C('D', 14), C('H', 14), C('C', 14)])[0] as Combo;
    const straight = bombsIn([
      C('S', 2), C('S', 3), C('S', 4), C('S', 5), C('S', 6),
    ]).find((b) => b.type === 'BOMB_STRAIGHT') as Combo;
    expect(beats(straight, four)).toBe(true);
    expect(beats(four, straight)).toBe(false);
  });

  it('개는 아무것도 이기지 못한다', () => {
    const dog = enumerateCombos([DOG], null).find((c) => c.type === 'DOG') as Combo;
    expect(beats(dog, null)).toBe(false);
  });
});

describe('봉황', () => {
  const single = (card: string, current: Combo | null = null): Combo =>
    enumerateCombos([card], current).find((c) => c.type === 'SINGLE') as Combo;

  it('리드로 내면 1½', () => {
    expect(single(PHOENIX).rank2).toBe(3);
  });

  it('직전 싱글보다 ½ 높다', () => {
    const eight = single(C('S', 8));
    const phoenix = enumerateCombos([PHOENIX], eight).find((c) => c.type === 'SINGLE') as Combo;
    expect(phoenix.rank2).toBe(17); // 8½
    expect(beats(phoenix, eight)).toBe(true);
  });

  it('9 가 봉황(8½)을 이긴다', () => {
    const eight = single(C('S', 8));
    const phoenix = enumerateCombos([PHOENIX], eight).find((c) => c.type === 'SINGLE') as Combo;
    const nine = single(C('D', 9));
    expect(beats(nine, phoenix)).toBe(true);
  });

  it('에이스는 이기지만 용은 이기지 못한다', () => {
    const ace = single(C('S', 14));
    const overAce = enumerateCombos([PHOENIX], ace).find((c) => c.type === 'SINGLE') as Combo;
    expect(beats(overAce, ace)).toBe(true);

    const dragon = single(DRAGON);
    expect(enumerateCombos([PHOENIX], dragon).filter((c) => c.type === 'SINGLE')).toHaveLength(0);
  });

  it('페어를 완성한다', () => {
    const pairs = find([C('S', 9), PHOENIX], 'PAIR');
    expect(pairs).toHaveLength(1);
    expect((pairs[0] as Combo).rank2).toBe(18);
  });

  it('트리플을 완성한다', () => {
    expect(find([C('S', 9), C('D', 9), PHOENIX], 'TRIPLE')).toHaveLength(1);
  });

  it('풀하우스의 페어 쪽을 메운다', () => {
    const hand = [C('S', 7), C('D', 7), C('H', 7), C('S', 4), PHOENIX];
    expect(find(hand, 'FULL_HOUSE', 5).length).toBeGreaterThan(0);
  });

  it('스트레이트의 빈칸을 메운다', () => {
    const hand = [C('S', 3), C('D', 4), PHOENIX, C('C', 6), C('S', 7)];
    const straight = find(hand, 'STRAIGHT', 5);
    expect(straight.length).toBeGreaterThan(0);
    expect((straight[0] as Combo).cards).toContain(PHOENIX);
  });

  it('계단의 빈칸을 메운다', () => {
    const hand = [C('S', 5), C('D', 5), C('S', 6), PHOENIX];
    expect(find(hand, 'STAIRS', 4).length).toBeGreaterThan(0);
  });

  it('봉황 + 트리플은 포카드 폭탄이 되지 않는다', () => {
    const hand = [C('S', 9), C('D', 9), C('H', 9), PHOENIX];
    expect(enumerateCombos(hand, null).some((c) => isBomb(c))).toBe(false);
  });
});

describe('고른 카드 해석 (parseCards)', () => {
  it('유효한 조합을 해석한다', () => {
    const parsed = parseCards([C('S', 9), C('D', 9)], null);
    expect(parsed?.type).toBe('PAIR');
  });

  it('무효한 조합은 null', () => {
    expect(parseCards([C('S', 9), C('D', 4)], null)).toBeNull();
  });

  it('무늬가 달라도 같은 끗이면 페어로 받아들인다 — 대표 선택에 묶이지 않는다', () => {
    expect(parseCards([C('H', 9), C('C', 9)], null)?.type).toBe('PAIR');
  });

  it('해석이 여럿이면 가장 높은 끗을 택한다', () => {
    // 3 4 5 6 + 봉황 → 2~6 또는 3~7 둘 다 가능 → 7 로 해석
    const hand = [C('S', 3), C('D', 4), C('H', 5), C('C', 6), PHOENIX];
    const parsed = parseCards(hand, null);
    expect(parsed?.type).toBe('STRAIGHT');
    expect(parsed?.rank2).toBe(14); // 7 × 2
  });
});

describe('합법 수 거르기', () => {
  it('리드할 때는 모든 조합이 가능하다', () => {
    const hand = [C('S', 9), C('D', 9), C('S', 3)];
    const plays = legalPlays(hand, null, { isLeading: true });
    expect(plays.some((c) => c.type === 'PAIR')).toBe(true);
    expect(plays.some((c) => c.type === 'SINGLE')).toBe(true);
  });

  it('따라갈 때는 이기는 조합만 나온다', () => {
    const current = parseCards([C('H', 10), C('C', 10)], null) as Combo;
    const hand = [C('S', 9), C('D', 9), C('S', 12), C('D', 12)];
    const plays = legalPlays(hand, current, { isLeading: false });
    expect(plays.every((c) => beats(c, current))).toBe(true);
    expect(plays.some((c) => c.rank2 === 24)).toBe(true); // Q 페어
    expect(plays.some((c) => c.rank2 === 18)).toBe(false); // 9 페어는 불가
  });

  it('개는 리드로만 낼 수 있다', () => {
    const current = parseCards([C('H', 10)], null) as Combo;
    expect(legalPlays([DOG], current, { isLeading: false })).toHaveLength(0);
    expect(legalPlays([DOG], null, { isLeading: true }).some((c) => c.type === 'DOG')).toBe(true);
  });

  it('폭탄은 어떤 트릭에도 끼어들 수 있다', () => {
    const current = parseCards([C('H', 10), C('C', 10)], null) as Combo;
    const hand = [C('S', 2), C('D', 2), C('H', 2), C('C', 2)];
    const plays = legalPlays(hand, current, { isLeading: false });
    expect(plays.some(isBomb)).toBe(true);
  });
});

describe('참새 소원 이행 판정', () => {
  it('해당 끗을 낼 수 있으면 이행 가능', () => {
    const hand = [C('S', 8), C('D', 3)];
    expect(canFulfillWish(hand, 8, null, { isLeading: true })).toBe(true);
  });

  it('없으면 이행 불가', () => {
    expect(canFulfillWish([C('S', 3)], 8, null, { isLeading: true })).toBe(false);
  });

  it('가졌어도 합법 조합을 못 만들면 이행 불가', () => {
    // 10 페어 위에 8 한 장뿐 — 이길 수 없다
    const current = parseCards([C('H', 10), C('C', 10)], null) as Combo;
    expect(canFulfillWish([C('S', 8)], 8, current, { isLeading: false })).toBe(false);
  });

  it('폭탄으로라도 낼 수 있으면 이행 의무가 있다', () => {
    const current = parseCards([C('H', 10), C('C', 10)], null) as Combo;
    const hand = [C('S', 8), C('D', 8), C('H', 8), C('C', 8)];
    expect(canFulfillWish(hand, 8, current, { isLeading: false })).toBe(true);
  });
});

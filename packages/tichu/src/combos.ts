/**
 * 조합 판정 — 티츄 엔진에서 가장 까다로운 부분.
 *
 * 핵심 제약: **같은 형태 · 같은 장수만 비교 가능.** 8장 스트레이트는 8장 스트레이트로만
 * 이길 수 있다. 유일한 예외가 폭탄이다.
 *
 * 비교값(`rank2`)은 **2배 정수 스케일**이다. 봉황 싱글의 "직전보다 0.5 높음" 을
 * 부동소수점 없이 다루기 위해 — 일반 끗 r 은 2r 이고 봉황은 홀수값을 갖는다.
 *
 * 봉황은 조합에서 2~A 와일드카드다. 구현은 **대입 열거**로 푼다:
 * 봉황을 끗 r 로 바꾼 가상 손패에 평범한 열거기를 돌리고, 결과를 합친 뒤 중복을 지운다.
 * 특수 규칙을 조합 인식기 안에 끼워 넣는 것보다 훨씬 덜 틀린다.
 */

import {
  DOG,
  DRAGON,
  DRAGON_RANK2,
  PHOENIX,
  PHOENIX_LEAD_RANK2,
  RANK_ACE,
  SCALE,
  SPARROW,
  SPARROW_RANK2,
  rank2Of,
  rankOf,
  suitOf,
  type Suit,
} from './cards.js';
import type { Card } from './types.js';

export type ComboType =
  | 'SINGLE'
  | 'PAIR'
  | 'TRIPLE'
  | 'FULL_HOUSE'
  | 'STAIRS'
  | 'STRAIGHT'
  | 'BOMB_FOUR'
  | 'BOMB_STRAIGHT'
  /** 개 — 트릭 조합이 아니다. 리드로만 낼 수 있고 리드권을 파트너에게 넘긴다. */
  | 'DOG';

export type Combo = {
  readonly type: ComboType;
  /** 2배 정수 스케일 비교값. */
  readonly rank2: number;
  readonly length: number;
  readonly cards: readonly Card[];
};

export function isBomb(combo: Combo): boolean {
  return combo.type === 'BOMB_FOUR' || combo.type === 'BOMB_STRAIGHT';
}

/**
 * `candidate` 가 `current` 를 이기는가.
 *
 * - 폭탄은 폭탄 아닌 모든 것을 이긴다
 * - 폭탄끼리는 **장수가 많은 쪽**이 강하다(스트레이트 폭탄 > 포카드), 같으면 끗
 * - 그 외에는 같은 형태 · 같은 장수 · 더 높은 끗
 */
export function beats(candidate: Combo, current: Combo | null): boolean {
  if (candidate.type === 'DOG') return false;
  if (current === null) return true;

  const a = isBomb(candidate);
  const b = isBomb(current);
  if (a && !b) return true;
  if (!a && b) return false;
  if (a && b) {
    if (candidate.length !== current.length) return candidate.length > current.length;
    return candidate.rank2 > current.rank2;
  }
  return (
    candidate.type === current.type &&
    candidate.length === current.length &&
    candidate.rank2 > current.rank2
  );
}

// ───────────────────────────────── 내부 표현

/** 조합 판정용 가상 카드. 봉황을 끗 r 로 대입할 때 쓴다(무늬 없음 → 폭탄 불가). */
interface Virtual {
  readonly card: Card;
  readonly rank: number;
  readonly suit: Suit | null;
}

function toVirtual(card: Card): Virtual | null {
  if (card === SPARROW) return { card, rank: 1, suit: null };
  if (card === DRAGON || card === DOG || card === PHOENIX) return null;
  return { card, rank: rankOf(card) as number, suit: suitOf(card) };
}

function phoenixAs(rank: number): Virtual {
  return { card: PHOENIX, rank, suit: null };
}

function byRank(vs: readonly Virtual[]): Map<number, Virtual[]> {
  const map = new Map<number, Virtual[]>();
  for (const v of vs) {
    const list = map.get(v.rank) ?? [];
    list.push(v);
    map.set(v.rank, list);
  }
  // 무늬 순서를 고정해 같은 손패에서 항상 같은 카드를 고르게 한다
  for (const list of map.values()) list.sort((a, b) => a.card.localeCompare(b.card));
  return map;
}

function combo(type: ComboType, rank: number, vs: readonly Virtual[]): Combo {
  return {
    type,
    rank2: rank * SCALE,
    length: vs.length,
    cards: vs.map((v) => v.card),
  };
}

/** 연속된 끗의 구간들. `minCount` 장 이상 가진 끗만 이어붙인다. */
function runs(ranks: readonly number[], has: (r: number) => boolean): number[][] {
  const out: number[][] = [];
  let current: number[] = [];
  for (const rank of ranks) {
    if (has(rank)) {
      if (current.length > 0 && rank !== (current[current.length - 1] as number) + 1) {
        if (current.length > 0) out.push(current);
        current = [];
      }
      current.push(rank);
    } else if (current.length > 0) {
      out.push(current);
      current = [];
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

const ALL_RANKS = Array.from({ length: RANK_ACE }, (_, i) => i + 1); // 1(참새) ~ 14

/**
 * 와일드카드 없는 평범한 열거.
 * 봉황은 호출부가 `phoenixAs(r)` 로 미리 대입해 넣는다.
 */
function plainCombos(vs: readonly Virtual[]): Combo[] {
  const out: Combo[] = [];
  const groups = byRank(vs);

  const pairs: Virtual[][] = [];
  const triples: Virtual[][] = [];

  for (const [rank, list] of groups) {
    if (rank === 1) continue; // 참새는 스트레이트에서만 쓴다
    if (list.length >= 2) {
      const take = list.slice(0, 2);
      pairs.push(take);
      out.push(combo('PAIR', rank, take));
    }
    if (list.length >= 3) {
      const take = list.slice(0, 3);
      triples.push(take);
      out.push(combo('TRIPLE', rank, take));
    }
    // 포카드 폭탄 — 네 장 모두 진짜 카드여야 한다(봉황 불가)
    if (list.length >= 4 && list.every((v) => v.suit !== null)) {
      out.push(combo('BOMB_FOUR', rank, list.slice(0, 4)));
    }
  }

  // 풀하우스 = 트리플 + 페어 (끗이 달라야 한다)
  for (const triple of triples) {
    const tripleRank = (triple[0] as Virtual).rank;
    for (const pair of pairs) {
      const pairRank = (pair[0] as Virtual).rank;
      if (pairRank === tripleRank) continue;
      // 같은 카드를 두 번 쓰지 않는다
      const used = new Set(triple.map((v) => v.card));
      if (pair.some((v) => used.has(v.card))) continue;
      out.push(combo('FULL_HOUSE', tripleRank, [...triple, ...pair]));
    }
  }

  // 연속 페어(계단) — 2쌍 이상
  for (const run of runs(ALL_RANKS, (r) => r !== 1 && (groups.get(r)?.length ?? 0) >= 2)) {
    for (let start = 0; start < run.length; start++) {
      for (let end = start + 1; end < run.length; end++) {
        const window = run.slice(start, end + 1);
        const cards = window.flatMap((r) => (groups.get(r) as Virtual[]).slice(0, 2));
        out.push(combo('STAIRS', window[window.length - 1] as number, cards));
      }
    }
  }

  // 스트레이트 — 5장 이상. 참새는 1 로 쓸 수 있다.
  for (const run of runs(ALL_RANKS, (r) => (groups.get(r)?.length ?? 0) >= 1)) {
    for (let start = 0; start < run.length; start++) {
      for (let end = start + 4; end < run.length; end++) {
        const window = run.slice(start, end + 1);
        const cards = window.map((r) => (groups.get(r) as Virtual[])[0] as Virtual);
        out.push(combo('STRAIGHT', window[window.length - 1] as number, cards));
      }
    }
  }

  // 스트레이트 플러시 폭탄 — 같은 무늬 5장 이상. 특수카드는 무늬가 없어 포함될 수 없다.
  const suits = new Set(vs.map((v) => v.suit).filter((s): s is Suit => s !== null));
  for (const suit of suits) {
    const inSuit = new Map<number, Virtual>();
    for (const v of vs) if (v.suit === suit) inSuit.set(v.rank, v);
    for (const run of runs(ALL_RANKS, (r) => inSuit.has(r))) {
      for (let start = 0; start < run.length; start++) {
        for (let end = start + 4; end < run.length; end++) {
          const window = run.slice(start, end + 1);
          const cards = window.map((r) => inSuit.get(r) as Virtual);
          out.push(combo('BOMB_STRAIGHT', window[window.length - 1] as number, cards));
        }
      }
    }
  }

  return out;
}

function keyOf(combo: Combo): string {
  return `${combo.type}|${combo.rank2}|${[...combo.cards].sort().join(',')}`;
}

/**
 * 손패에서 낼 수 있는 모든 조합.
 *
 * `current` 는 봉황 싱글의 값을 정하는 데만 쓴다(직전보다 0.5 높음).
 * 트릭을 이기는지 거르는 것은 `legalPlays` 의 몫이다.
 */
export function enumerateCombos(hand: readonly Card[], current: Combo | null): Combo[] {
  const out: Combo[] = [];
  const seen = new Set<string>();
  const push = (c: Combo): void => {
    const key = keyOf(c);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };

  // ── 싱글
  for (const card of hand) {
    if (card === DOG) {
      push({ type: 'DOG', rank2: 0, length: 1, cards: [card] });
      continue;
    }
    if (card === PHOENIX) continue; // 아래에서 따로
    const rank2 = rank2Of(card);
    if (rank2 === null) continue;
    push({ type: 'SINGLE', rank2, length: 1, cards: [card] });
  }

  // 봉황 싱글 — 리드면 1½, 아니면 직전 싱글보다 ½ 높다. **용은 이기지 못한다.**
  if (hand.includes(PHOENIX)) {
    const currentIsSingle = current === null || current.type === 'SINGLE';
    const currentIsDragon = current !== null && current.cards[0] === DRAGON;
    if (currentIsSingle && !currentIsDragon) {
      const rank2 = current === null ? PHOENIX_LEAD_RANK2 : current.rank2 + 1;
      push({ type: 'SINGLE', rank2, length: 1, cards: [PHOENIX] });
    }
  }

  // ── 여러 장 조합
  const real = hand.map(toVirtual).filter((v): v is Virtual => v !== null);
  for (const c of plainCombos(real)) push(c);

  // 봉황을 끗 r 로 대입해 다시 열거한다
  if (hand.includes(PHOENIX)) {
    for (let r = 2; r <= RANK_ACE; r++) {
      for (const c of plainCombos([...real, phoenixAs(r)])) {
        // 봉황은 폭탄에 쓸 수 없다
        if (isBomb(c) && c.cards.includes(PHOENIX)) continue;
        push(c);
      }
    }
  }

  return out;
}

/** 지금 트릭에서 **실제로 낼 수 있는** 조합. */
export function legalPlays(
  hand: readonly Card[],
  current: Combo | null,
  options: { readonly isLeading: boolean },
): Combo[] {
  return enumerateCombos(hand, current).filter((c) => {
    if (c.type === 'DOG') return options.isLeading;
    if (options.isLeading) return true;
    return beats(c, current);
  });
}

/**
 * 플레이어가 **고른 카드**를 조합으로 해석한다.
 *
 * `legalPlays` 는 대표 선택(같은 끗이면 무늬 순서가 앞선 카드)만 돌려주므로,
 * 사람이 고른 동등한 다른 조합을 받아들이려면 이 함수로 직접 검증해야 한다.
 * 가능한 해석이 여럿이면(봉황이 스트레이트의 서로 다른 칸을 메우는 경우 등)
 * **가장 높은 끗**을 택한다 — 낸 사람에게 유리한 해석.
 */
export function parseCards(
  cards: readonly Card[],
  current: Combo | null,
): Combo | null {
  if (cards.length === 0) return null;
  const wanted = [...cards].sort().join(',');
  const candidates = enumerateCombos(cards, current).filter(
    (c) => [...c.cards].sort().join(',') === wanted,
  );
  if (candidates.length === 0) return null;

  // 같은 카드가 여러 해석을 가질 수 있다. 우선순위:
  //  1. **폭탄** — 같은 무늬 연속 5장은 스트레이트이자 스트레이트 플러시 폭탄이다.
  //     룰상 폭탄으로 내는 것이지 "평범한 스트레이트로 내기" 를 고를 수는 없다.
  //  2. 더 높은 끗 — 봉황이 스트레이트의 서로 다른 칸을 메울 수 있는 경우.
  return candidates.reduce((best, c) => {
    const a = isBomb(c);
    const b = isBomb(best);
    if (a !== b) return a ? c : best;
    return c.rank2 > best.rank2 ? c : best;
  });
}

/** 손패에 있는 모든 폭탄 — 순서를 무시하고 끼어들 수 있다. */
export function bombsIn(hand: readonly Card[]): Combo[] {
  return enumerateCombos(hand, null).filter(isBomb);
}

/**
 * 참새 소원을 이 손패로 이행할 수 있는가.
 * 해당 끗을 포함하면서 지금 낼 수 있는 조합이 하나라도 있으면 이행 의무가 생긴다.
 */
export function canFulfillWish(
  hand: readonly Card[],
  wish: number,
  current: Combo | null,
  options: { readonly isLeading: boolean },
): boolean {
  return legalPlays(hand, current, options).some((c) =>
    c.cards.some((card) => rankOf(card) === wish),
  );
}

export { SPARROW_RANK2, DRAGON_RANK2 };

/**
 * 핸드 분할 — 티츄 봇의 핵심.
 *
 * L1.5 봇의 가장 큰 약점이 이것이었다: 14장을 **어떤 조합들로 쪼갤지** 전혀 계획하지 않고
 * 매 턴 즉흥적으로 가장 싼 카드를 냈다. 그러면 스트레이트가 될 카드를 홑장으로 흘리고,
 * 마지막에 아무도 못 이기는 애매한 카드만 남는다.
 *
 * 여기서는 손패를 **낼 단위(lot)들로 미리 분해**해서
 *  - 손을 비우는 데 몇 번 내야 하는지(`lotCount`)
 *  - 확실히 이길 수 있는 카드가 몇 장인지(`control`)
 * 를 추정한다. 티츄 선언 여부와 무엇부터 낼지가 전부 여기서 나온다.
 *
 * 완전 탐색이 아니라 **탐욕적 분해**다. 긴 조합부터, 같은 길이면 낮은 끗부터 가져간다
 * (높은 카드는 통제용으로 남겨두는 편이 낫다).
 */

import {
  DRAGON,
  PHOENIX,
  RANK_ACE,
  enumerateCombos,
  isBomb,
  rankOf,
  type Card,
  type Combo,
} from '@mightichu/tichu';

export interface HandPlan {
  /** 여러 장으로 낼 단위들. */
  readonly lots: readonly Combo[];
  /** 분해하고 남은 홑장. */
  readonly singles: readonly Card[];
  readonly bombs: readonly Combo[];
  /** 손을 비우는 데 필요한 플레이 횟수(추정). 작을수록 좋다. */
  readonly lotCount: number;
  /** 거의 확실히 트릭을 가져올 수 있는 수단의 개수(용·봉황·에이스·폭탄). */
  readonly control: number;
}

/** 조합의 "쓰기 좋은 정도" — 길수록, 낮을수록 먼저 분해해 쓴다. */
function lotPriority(combo: Combo): number {
  return combo.length * 100 - combo.rank2;
}

function overlaps(used: ReadonlySet<Card>, combo: Combo): boolean {
  return combo.cards.some((c) => used.has(c));
}

/**
 * 손패를 낼 단위로 분해한다.
 *
 * 폭탄은 깨지 않고 통째로 남긴다 — 쪼개면 가장 강한 수단을 잃는다.
 */
export function planHand(hand: readonly Card[]): HandPlan {
  const all = enumerateCombos(hand, null).filter(
    (c) => c.type !== 'DOG' && c.type !== 'SINGLE',
  );

  const used = new Set<Card>();
  const bombs: Combo[] = [];
  const lots: Combo[] = [];

  // 1. 폭탄은 먼저 확보하고 건드리지 않는다
  for (const bomb of all.filter(isBomb).sort((a, b) => b.length - a.length)) {
    if (overlaps(used, bomb)) continue;
    bombs.push(bomb);
    for (const c of bomb.cards) used.add(c);
  }

  // 2. 나머지는 긴 것부터, 같은 길이면 낮은 끗부터
  for (const combo of all
    .filter((c) => !isBomb(c))
    .sort((a, b) => lotPriority(b) - lotPriority(a))) {
    if (overlaps(used, combo)) continue;
    lots.push(combo);
    for (const c of combo.cards) used.add(c);
  }

  const singles = hand.filter((c) => !used.has(c));

  // 통제 수단: 용·봉황·에이스·폭탄
  const control =
    bombs.length +
    (hand.includes(DRAGON) ? 1 : 0) +
    (hand.includes(PHOENIX) ? 1 : 0) +
    hand.filter((c) => rankOf(c) === RANK_ACE).length;

  return {
    lots,
    singles,
    bombs,
    lotCount: bombs.length + lots.length + singles.length,
    control,
  };
}

/**
 * 티츄 선언 가치 — 클수록 "먼저 손을 털 수 있다".
 *
 * 손을 비우는 데 필요한 횟수가 적고, 트릭을 가져올 수단이 많을수록 좋다.
 * 임계값은 `shouldCallTichu` 에서 쓴다.
 */
export function tichuScore(hand: readonly Card[]): number {
  const plan = planHand(hand);
  // 8장만 보는 라지 티츄 판단에서도 쓰므로 장수로 정규화한다
  const perCard = plan.lotCount / Math.max(1, hand.length);
  return plan.control * 2 - perCard * 10;
}

/**
 * 스몰 티츄를 부를 만한가. **교환이 끝난 손패**로 판단해야 한다.
 *
 * 임계값은 추측이 아니라 **측정**으로 잡았다. 600판을 돌려 선언 조건별
 * 성공률과 판당 기대값을 잰 결과(±100 이므로 손익분기 50%):
 *
 * ```
 * lot<=3 ctrl>=2   선언 13   성공 69.2%   판당 +0.8   ← 표본 부족
 * lot<=5 ctrl>=3   선언 53   성공 52.8%   판당 +0.5   ← 채택
 * lot<=5 ctrl>=2   선언 150  성공 48.7%   판당 -0.7
 * lot<=6 ctrl>=3   선언 115  성공 46.1%   판당 -1.5
 * ```
 *
 * 솔직한 평가: **+0.5/판은 미미하다.** 병목은 선언 규칙이 아니라 플레이 실력이다.
 * 이 봇이 더 잘 두게 되면 같은 조건에서도 성공률이 올라가고, 그때 기준을 완화하면 된다.
 *
 * 교환 **전** 손패로 재면 받을 3장을 모른 채 재는 셈이라 성공률이 37% 로 떨어진다.
 */
export function shouldCallTichu(hand: readonly Card[]): boolean {
  const plan = planHand(hand);
  return plan.lotCount <= 5 && plan.control >= 3;
}

/**
 * 라지 티츄(8장만 보고)를 부를 만한가.
 * ±200 인데 정보는 절반뿐이라 훨씬 보수적으로 간다 — 측정에서도 거의 안 불렀다.
 */
export function shouldCallGrandTichu(hand: readonly Card[]): boolean {
  const plan = planHand(hand);
  return plan.control >= 4 && plan.lotCount <= 3;
}

/** 이 카드보다 센 카드가 아직 남아 있는가 — 카운팅. */
export function isHighestLeft(
  card: Card,
  hand: readonly Card[],
  played: readonly Card[],
): boolean {
  const rank = rankOf(card);
  if (rank === null) return card === DRAGON;
  const seen = new Set<Card>([...hand, ...played]);
  // 나보다 높은 끗이 한 장이라도 남의 손에 있을 수 있으면 false
  for (let r = rank + 1; r <= RANK_ACE; r++) {
    for (const suit of ['S', 'D', 'H', 'C']) {
      const other = `${suit}${String(r).padStart(2, '0')}`;
      if (!seen.has(other)) return false;
    }
  }
  if (!seen.has(DRAGON)) return false;
  return true;
}

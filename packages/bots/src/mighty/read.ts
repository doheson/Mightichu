/**
 * 마이티 판 읽기 — 공개 정보만으로 할 수 있는 추론.
 *
 * 남의 손패는 못 보지만, **누가 어느 무늬를 못 따라갔는지**는 모두가 봤다.
 * 그 정보를 안 쓰면 점수 트릭을 상대 기루다에 그대로 헌납하게 된다.
 */

import {
  isJoker,
  mightyCard,
  resolveLeadSuit,
  suitOf,
  type Card,
  type MightyView,
  type Suit,
  type Trump,
} from '@mightichu/mighty';

/**
 * 플레이어별로 **확실히 없는 무늬**.
 *
 * 리드 무늬를 따라가지 않았다면 그 무늬가 없다는 뜻이다.
 * 단 마이티·조커는 팔로우 의무를 무시하고 낼 수 있으므로 근거가 되지 않는다.
 */
export function knownVoids(view: MightyView): Map<string, Set<Suit>> {
  const voids = new Map<string, Set<Suit>>();
  const trump = view.contract?.trump ?? 'NT';
  const mighty = mightyCard(trump);

  const tricks = [
    ...view.trickHistory.map((t) => ({ plays: t.plays, nomination: null as Suit | null })),
    { plays: view.currentTrick, nomination: view.jokerNomination },
  ];

  for (const trick of tricks) {
    const lead = trick.plays[0];
    if (lead === undefined) continue;
    const leadSuit = resolveLeadSuit(lead.card, trick.nomination);
    if (leadSuit === null) continue;

    for (const play of trick.plays.slice(1)) {
      // 마이티·조커는 아무 때나 낼 수 있어 "없어서 못 낸 것"이 아니다
      if (play.card === mighty || isJoker(play.card)) continue;
      if (suitOf(play.card) === leadSuit) continue;
      const set = voids.get(play.player) ?? new Set<Suit>();
      set.add(leadSuit);
      voids.set(play.player, set);
    }
  }
  return voids;
}

/**
 * 이 무늬를 리드하면 **누가 기루다로 잘라먹을 수 있는가**.
 * 보이드이면서 기루다가 남아 있을 법한 상대를 센다.
 */
export function ruffRisk(
  suit: Suit,
  view: MightyView,
  allies: ReadonlySet<string>,
): number {
  const trump = view.contract?.trump ?? 'NT';
  if (trump === 'NT' || suit === trump) return 0;
  const voids = knownVoids(view);
  let risk = 0;
  for (const [player, suits] of voids) {
    if (player === view.me || allies.has(player)) continue;
    if (suits.has(suit)) risk++;
  }
  return risk;
}

/**
 * 내가 아는 **아군**.
 *
 * 마이티는 프렌드가 숨어 있어 아는 범위가 좁다:
 *  - 내가 주공이면 공개된 프렌드
 *  - 내가 프렌드면 주공
 *  - 내가 야당이면 공개된 프렌드를 뺀 나머지가 "아마" 야당이다(확정은 아니다)
 */
export function knownAllies(view: MightyView): Set<string> {
  const allies = new Set<string>();
  if (view.declarer === view.me) {
    if (view.friend !== null) allies.add(view.friend);
    return allies;
  }
  if (view.iAmFriend && view.declarer !== null) {
    allies.add(view.declarer);
    return allies;
  }
  return allies;
}

/**
 * 이 사람이 **아군일 가능성이 높은가** (야당 입장).
 *
 * 야당 입장에서 주공이 아닌 나머지 셋은 "프렌드 1 + 야당 2" 다.
 * 즉 **2/3 확률로 같은 편**이다. 그래서 주공이 아닌 사람이 이기고 있는 트릭을
 * 굳이 밟지 않는 편이 기대값상 낫다 — 야당끼리 서로 잡아먹는 게 가장 큰 손해다.
 */
export function likelyAlly(view: MightyView, player: string): boolean {
  if (player === view.me) return true;

  /**
   * **내가 프렌드면 주공은 아군이다.**
   *
   * 여기를 무조건 false 로 두면 프렌드가 주공이 이미 이기고 있는 트릭에
   * 마이티를 던진다. 실제로 그 버그가 있었다 —
   * 주공이 기루다 A 로 리드했는데(질 수가 없다) 프렌드가 마이티를 꺼내 날렸다.
   */
  if (view.declarer === player) return view.iAmFriend;

  if (view.friend === player) return view.iAmFriend || view.declarer === view.me;
  // 나도 야당이고 상대도 주공이 아니면 아군일 확률이 높다
  return view.declarer !== view.me && !view.iAmFriend;
}

export function suitsOf(cards: readonly Card[]): Set<Suit> {
  const out = new Set<Suit>();
  for (const card of cards) {
    const suit = suitOf(card);
    if (suit !== null) out.add(suit);
  }
  return out;
}

export type { Trump };

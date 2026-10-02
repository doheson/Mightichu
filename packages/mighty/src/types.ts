/** 마이티 상태·액션·뷰 타입. 전부 JSON 직렬화 가능해야 한다. */

import type { PlayerId } from '@mightichu/core';
import type { Suit, Trump } from './cards.js';

/** `'S14'`, `'H10'`, `'JK'` 형태의 토큰. `cards.ts` 참고. */
export type Card = string;

export type Phase =
  | 'MISDEAL'  // 재딜 요구 가능한 플레이어가 있을 때만 거친다
  | 'BIDDING'
  | 'KITTY'    // 주공이 바닥 3장 수령 → 3장 버리기 (+ 기루다 변경)
  | 'FRIEND'   // 프렌드 지정
  | 'PLAY'
  | 'DONE';

/**
 * `interface` 가 아니라 `type` 인 이유: core 의 `Json` 이 인덱스 시그니처 기반이라
 * interface 는 `Json` 에 할당되지 않는다(TS 의 알려진 제약 — interface 는 나중에
 * 확장될 수 있다고 보기 때문). 이벤트 payload 와 점수 detail 에 실리므로 type 으로 둔다.
 */
export type Bid = {
  readonly trump: Trump;
  /** 13~20 */
  readonly count: number;
};

export type FriendCall =
  | { readonly kind: 'CARD'; readonly card: Card }
  | { readonly kind: 'MIGHTY' }
  | { readonly kind: 'JOKER' }
  | { readonly kind: 'FIRST_TRICK' }
  | { readonly kind: 'NONE' };

export type TrickPlay = {
  readonly player: PlayerId;
  readonly card: Card;
};

/**
 * 방금 끝난 트릭. **표시 전용**이다.
 *
 * 엔진은 5번째 카드가 나오는 순간 `currentTrick` 을 비우므로,
 * 그대로 두면 UI 가 "누가 뭘 냈고 누가 먹었는지" 를 영원히 볼 수 없다.
 * 다음 트릭의 첫 카드가 나올 때까지 이 값이 남아 있고,
 * UI 는 `currentTrick` 이 비었을 때 이걸 대신 보여준다.
 *
 * 점수·보존 계산에는 쓰지 않는다 — `points` 에 이미 반영돼 있다.
 */
export type CompletedTrick = {
  readonly trickNo: number;
  readonly plays: readonly TrickPlay[];
  readonly winner: PlayerId;
  readonly points: number;
};

export type RoundOutcome =
  | { readonly kind: 'REDEAL'; readonly reason: 'MISDEAL' | 'ALL_PASSED' }
  | { readonly kind: 'PLAYED' };

export interface MightyState {
  readonly phase: Phase;
  /** 시계방향. 마이티는 cw. */
  readonly seats: readonly PlayerId[];
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>;

  /** 바닥 3장. 주공이 수령하면 빈 배열. */
  readonly kitty: readonly Card[];
  /** 주공이 버린 3장. **비공개.** 점수카드는 여당 집계에 포함된다. */
  readonly discarded: readonly Card[];

  // ─ 비딜
  /** 재딜을 요구할 수 있는(아직 포기하지 않은) 플레이어. */
  readonly misdealEligible: readonly PlayerId[];

  // ─ 비딩
  readonly currentBidder: PlayerId | null;
  readonly passed: readonly PlayerId[];
  readonly highestBid: { readonly player: PlayerId; readonly bid: Bid } | null;

  // ─ 계약
  readonly declarer: PlayerId | null;
  readonly contract: Bid | null;
  readonly friendCall: FriendCall | null;
  /**
   * 내부적으로 확정된 프렌드. **비공개** — `view()` 는 `friendRevealed` 가 true 일 때만 노출한다.
   * 노프렌드이거나 지명 카드가 주공 손·바닥·버린 패에 있었으면 null(숨은 노프렌드).
   */
  readonly friend: PlayerId | null;
  readonly friendRevealed: boolean;

  // ─ 플레이
  /** 0부터. 10트릭이면 종료. */
  readonly trickNo: number;
  readonly leader: PlayerId | null;
  readonly currentTrick: readonly TrickPlay[];
  /** 이 트릭에 조커콜이 리드되어 조커가 무력화되는가. */
  readonly jokerCalled: boolean;
  /** 조커를 리드하며 지정한 무늬. */
  readonly jokerNomination: Suit | null;
  /** 획득한 점수카드 수. */
  readonly points: Readonly<Record<PlayerId, number>>;
  /** 이번 라운드에 이미 나온 카드 전부 (공개 정보). */
  readonly playedCards: readonly Card[];
  /** 방금 끝난 트릭 (표시 전용). */
  readonly lastTrick: CompletedTrick | null;

  readonly outcome: RoundOutcome | null;
}

export type MightyAction =
  | { readonly type: 'DEMAND_MISDEAL' }
  | { readonly type: 'DECLINE_MISDEAL' }
  | { readonly type: 'BID'; readonly bid: Bid }
  | { readonly type: 'PASS' }
  | {
      readonly type: 'DISCARD';
      readonly cards: readonly Card[];
      /** 기루다를 바꿀 때만. 공약 상향 규칙은 `bidding.ts` 참고. */
      readonly changeTo?: Bid;
    }
  | { readonly type: 'CALL_FRIEND'; readonly call: FriendCall }
  | {
      readonly type: 'PLAY_CARD';
      readonly card: Card;
      /** 조커를 리드할 때 지정하는 무늬. */
      readonly nominate?: Suit;
      /** 조커콜 카드를 리드하며 조커를 강제 호출할지. */
      readonly callJoker?: boolean;
    };

export interface MightyConfig {
  /** 지금은 비어 있다. 하우스 룰 토글이 생기면 여기에 넣는다. */
  readonly house?: Record<string, never>;
}

/** 리댁션된 뷰 — 남의 손패·바닥·버린 카드·미공개 프렌드는 들어있지 않다. */
export interface MightyView {
  readonly me: PlayerId;
  readonly phase: Phase;
  readonly seats: readonly PlayerId[];
  readonly myHand: readonly Card[];
  readonly handCounts: Readonly<Record<PlayerId, number>>;
  /** 바닥 카드는 장수만. 주공이 수령 전이면 3. */
  readonly kittyCount: number;

  /**
   * 내가 재딜을 요구할 수 있는가. **다른 사람의 자격은 노출하지 않는다** —
   * 누가 약한 손패인지 알려주는 유출이 되기 때문.
   *
   * 잔여 유출: `phase === 'MISDEAL'` 이라는 사실 자체가 "누군가 ½점 이하"를 알린다.
   * 실전에서도 재딜 요구는 공개 행위이므로 수용 범위로 본다.
   */
  readonly iCanDemandMisdeal: boolean;
  readonly currentBidder: PlayerId | null;
  readonly passed: readonly PlayerId[];
  readonly highestBid: { readonly player: PlayerId; readonly bid: Bid } | null;

  readonly declarer: PlayerId | null;
  readonly contract: Bid | null;
  /** 프렌드 "지정 방식"은 공개 정보다. 누가 프렌드인지는 아니다. */
  readonly friendCall: FriendCall | null;
  /** 공개된 프렌드. 아직 안 드러났으면 null. */
  readonly friend: PlayerId | null;
  /** 내가 프렌드인지는 나만 안다. */
  readonly iAmFriend: boolean;

  readonly trickNo: number;
  readonly leader: PlayerId | null;
  readonly currentTrick: readonly TrickPlay[];
  readonly jokerCalled: boolean;
  readonly jokerNomination: Suit | null;
  readonly points: Readonly<Record<PlayerId, number>>;
  /**
   * 이번 라운드에 이미 나온 카드 전부. 모두가 보는 앞에서 플레이됐으므로 공개 정보다.
   * 봇의 카운팅에 쓴다(어떤 높은 카드가 남았는지).
   */
  readonly playedCards: readonly Card[];
  /** 방금 끝난 트릭 — 전원 공개 정보다. */
  readonly lastTrick: CompletedTrick | null;

  readonly outcome: RoundOutcome | null;
}

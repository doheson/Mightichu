/** 티츄 상태·액션·뷰 타입. 전부 JSON 직렬화 가능해야 한다. */

import type { PlayerId } from '@mightichu/core';
import type { Combo } from './combos.js';

/** `'J05'`, `'B14'`, `'DRAGON'` 형태의 토큰. `cards.ts` 참고. */
export type Card = string;

export type Phase =
  | 'GRAND'       // 8장을 보고 라지 티츄 선언 여부를 정한다
  | 'EXCHANGE'    // 14장을 받고 3명에게 1장씩 넘긴다
  | 'PLAY'
  | 'DRAGON_GIFT' // 용으로 먹은 트릭을 상대팀 한 명에게 넘긴다
  | 'DONE';

export type TichuCall = 'NONE' | 'SMALL' | 'GRAND';

export type Play = {
  readonly player: PlayerId;
  readonly combo: Combo;
};

export type CompletedTrick = {
  readonly plays: readonly Play[];
  readonly winner: PlayerId;
  readonly points: number;
  /** 용으로 먹어 상대에게 넘긴 경우 받은 사람. */
  readonly giftedTo: PlayerId | null;
};

export type RoundOutcome =
  | { readonly kind: 'NORMAL' }
  /** 한 팀이 1·2등을 모두 — 즉시 200점, 카드 점수 계산 없음. */
  | { readonly kind: 'DOUBLE_WIN'; readonly team: readonly PlayerId[] };

export type TichuState = {
  readonly phase: Phase;
  /** 물리 배치(시계방향). 진행은 **반시계**다. */
  readonly seats: readonly PlayerId[];
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>;
  /** 아직 돌리지 않은 뒤쪽 6장. GRAND 가 끝나면 손패로 들어간다. */
  readonly pending: Readonly<Record<PlayerId, readonly Card[]>>;

  readonly calls: Readonly<Record<PlayerId, TichuCall>>;
  /** 라지 티츄 여부를 정한 사람. 전원이 정하면 나머지를 돌린다. */
  readonly grandDecided: readonly PlayerId[];
  /** 첫 카드를 낸 사람 — 스몰 티츄 선언 창이 닫힌다. */
  readonly hasPlayed: Readonly<Record<PlayerId, boolean>>;

  /** 교환으로 보낸 카드: 보낸사람 → 받는사람 → 카드 */
  readonly given: Readonly<Record<PlayerId, Readonly<Record<PlayerId, Card>>>>;
  /**
   * 교환으로 받은 카드: 받는사람 → 보낸사람 → 카드.
   * **교환이 모두 끝난 뒤에만** 채워진다 — 그전에 채우면 미리 들여다볼 수 있다.
   */
  readonly received: Readonly<Record<PlayerId, Readonly<Record<PlayerId, Card>>>>;

  readonly leader: PlayerId | null;
  readonly turn: PlayerId | null;
  readonly currentTrick: readonly Play[];
  readonly currentCombo: Combo | null;
  /** 마지막으로 조합을 낸 사람 — 트릭 종료 판정 기준. */
  readonly lastPlayer: PlayerId | null;
  readonly passStreak: number;
  /** 이번 트릭에 패스한 사람. 트릭이 닫히거나 누가 내면 초기화된다. */
  readonly passedThisTrick: readonly PlayerId[];
  /** 참새 소원. 누군가 이행할 때까지 유지된다. */
  readonly wish: number | null;

  /** 각자 모은 트릭 카드. */
  readonly taken: Readonly<Record<PlayerId, readonly Card[]>>;
  /** 개 — 트릭 가치가 없어 판에서 빠진다. 보존 검사를 위해 남겨둔다. */
  readonly discarded: readonly Card[];
  /** 손패를 턴 순서. */
  readonly finished: readonly PlayerId[];

  readonly lastTrick: CompletedTrick | null;
  /** 용으로 먹어 넘겨줄 트릭이 대기 중일 때. */
  readonly dragonGift: {
    readonly winner: PlayerId;
    readonly cards: readonly Card[];
    readonly points: number;
    readonly plays: readonly Play[];
  } | null;

  readonly outcome: RoundOutcome | null;
};

export type TichuAction =
  | { readonly type: 'DECLARE_GRAND' }
  | { readonly type: 'PASS_GRAND' }
  | { readonly type: 'DECLARE_TICHU' }
  /** 교환은 **받는 사람별로 한 장씩** 보낸다 — 한 번에 묶으면 합법 수가 폭발한다. */
  | { readonly type: 'GIVE'; readonly to: PlayerId; readonly card: Card }
  | {
      readonly type: 'PLAY';
      readonly cards: readonly Card[];
      /** 참새를 낼 때 거는 소원(2~14). */
      readonly wish?: number;
    }
  | { readonly type: 'PASS' }
  | { readonly type: 'GIVE_DRAGON'; readonly to: PlayerId };

export type TichuConfig = {
  readonly house?: Record<string, never>;
};

export type TichuView = {
  readonly me: PlayerId;
  readonly phase: Phase;
  readonly seats: readonly PlayerId[];
  readonly partner: PlayerId | null;
  readonly myHand: readonly Card[];
  readonly handCounts: Readonly<Record<PlayerId, number>>;

  readonly calls: Readonly<Record<PlayerId, TichuCall>>;
  readonly grandDecided: readonly PlayerId[];
  /** 내가 아직 교환으로 보내지 않은 상대. */
  readonly givePending: readonly PlayerId[];
  /** 교환을 끝낸 사람 (공개 — 누가 아직인지 알아야 기다릴 수 있다). */
  readonly exchangeDone: readonly PlayerId[];
  /** **나에게** 온 카드: 보낸사람 → 카드. 교환이 끝나야 채워진다. */
  readonly received: Readonly<Record<PlayerId, Card>>;

  readonly leader: PlayerId | null;
  readonly turn: PlayerId | null;
  readonly currentTrick: readonly Play[];
  readonly currentCombo: Combo | null;
  readonly passStreak: number;
  /** 이번 트릭에 패스한 사람 — 전원 공개. */
  readonly passedThisTrick: readonly PlayerId[];
  readonly wish: number | null;

  /**
   * 이번 라운드에 **이미 나온 카드 전부**. 공개 정보다 —
   * 모두가 보는 앞에서 플레이됐으므로 세고 있으면 알 수 있다.
   * 봇의 카운팅과 UI 의 "남은 카드" 표시에 쓴다.
   */
  readonly playedCards: readonly Card[];
  readonly takenCounts: Readonly<Record<PlayerId, number>>;
  readonly takenPoints: Readonly<Record<PlayerId, number>>;
  readonly finished: readonly PlayerId[];
  readonly lastTrick: CompletedTrick | null;
  readonly dragonGift: { readonly winner: PlayerId; readonly points: number } | null;
  readonly outcome: RoundOutcome | null;
};

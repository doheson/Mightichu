/**
 * 게임 계약 — 이 프로젝트의 척추.
 *
 * 마이티와 티츄는 카드 모델부터 다르다(53장/기루다 vs 56장/특수카드 4종).
 * 그래서 **도메인 모델을 공유하지 않는다.** 공유하는 것은 "계약의 모양"뿐이고,
 * 각 게임은 자기 타입으로 이 인터페이스를 구현한다.
 *
 * 그 결과:
 *  1. 서버가 게임을 모른다 — `GameEngine` 만 들고 라우팅한다. 게임 추가 시 서버 무변경.
 *  2. 턴을 깨는 액션(티츄 폭탄·스몰티츄 선언)이 특수 처리 없이 흡수된다 — `legalActions` 참고.
 *  3. AI 가 구조적으로 치팅할 수 없다 — 봇은 `View` 만 본다. `bot.ts` 참고.
 */

import type { Json, PlayerId, Result, Seed } from './types.js';

/**
 * 클라이언트 연출·로그용 사건. 상태 전이의 "원인"이 아니라 "서술"이다.
 * (권위는 언제나 State. 이벤트를 재생해 상태를 만들지 않는다 — 그건 액션 로그의 역할)
 */
export interface GameEvent {
  readonly type: string;
  readonly payload?: Json;
  /**
   * 이 이벤트를 받을 플레이어. 생략하면 전체 공개.
   * 이벤트도 리댁션 대상이다 — 예: 티츄 카드 교환에서 "누가 무엇을 받았는지".
   */
  readonly visibleTo?: readonly PlayerId[];
}

export interface Applied<State> {
  readonly state: State;
  readonly events: readonly GameEvent[];
}

/** 한 라운드(한 판)의 정산 결과. */
export interface RoundScore {
  /** 플레이어별 증감. 마이티는 제로섬, 티츄는 팀 양쪽에 같은 값. */
  readonly perPlayer: Readonly<Record<PlayerId, number>>;
  /** 게임별 상세(공약 달성 여부, 티츄 성공/실패, 적용된 배수 등). UI 표기용. */
  readonly detail?: Json;
}

export interface InitContext<Config> {
  readonly config: Config;
  /** 좌석 순서대로. 길이는 엔진의 min/maxPlayers 범위 안이어야 한다. */
  readonly players: readonly PlayerId[];
  readonly seed: Seed;
}

/**
 * 한 **라운드**의 룰 엔진. 매치(티츄 1000점, 마이티 N판) 누적은
 * 게임과 무관한 상위 계층의 몫이므로 엔진에 넣지 않는다.
 *
 * 구현 규약 (속성 테스트로 검증한다):
 *  - 순수함수: `init`/`apply` 는 입력을 변경하지 않고 새 State 를 반환한다.
 *  - 결정론: 모든 무작위성은 `init` 에서만 소비한다. `rng.ts` 참고.
 *  - JSON: State / Action / View 는 JSON 직렬화 가능해야 한다. `json.ts` 참고.
 *  - 정합성: `legalActions` 가 돌려준 모든 액션은 `apply` 가 **반드시 성공**한다.
 */
export interface GameEngine<State, Action, View, Config> {
  readonly id: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;

  init(ctx: InitContext<Config>): State;

  /**
   * 해당 플레이어가 **지금** 할 수 있는 모든 액션.
   *
   * 핵심: **현재 턴 보유자인지 묻지 않는다.** 턴이 아닌 플레이어도 호출 가능하고,
   * 할 게 없으면 빈 배열이다. 티츄의 폭탄(아웃 오브 턴)과 스몰 티츄 선언
   * (남의 차례 중에도 가능)이 그냥 비차례 플레이어의 합법 수로 나타난다.
   * 덕분에 "턴 루프 + 인터럽트 예외처리"가 필요 없고, 인터럽트라는 개념 자체가 사라진다.
   */
  legalActions(state: State, player: PlayerId): readonly Action[];

  /** 불법 액션은 예외가 아니라 `Result` 실패로 돌려준다. */
  apply(state: State, player: PlayerId, action: Action): Result<Applied<State>>;

  /**
   * 리댁션 — **유일한 정보 유출 지점이자 보안 경계.**
   * 남의 손패, 마이티의 프렌드 정체, 바닥/버린 카드, 티츄 교환 중 카드가
   * 여기서 전부 제거되어야 한다. 구조적 전수 검사로 테스트한다.
   */
  view(state: State, viewer: PlayerId): View;

  isOver(state: State): boolean;

  /** `isOver` 가 true 일 때만 호출한다. */
  score(state: State): RoundScore;
}

/** 어떤 엔진이든 받는 자리(서버 레지스트리 등)를 위한 느슨한 별칭. */
export type AnyGameEngine = GameEngine<never, never, unknown, never>;

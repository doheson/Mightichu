/**
 * AI 계약.
 *
 * 봇은 `State` 가 아니라 **`View`** 를 받는다. 즉 남의 손패에 **타입 레벨에서 접근할 수 없다.**
 * "봇이 상대 패를 본다" 는 버그가 애초에 컴파일되지 않는다.
 *
 * `rng` 를 주입받는 이유: 봇이 `Math.random()` 을 쓰면 AI 모드의 리플레이가 깨진다.
 * 무작위성이 필요한 봇은 반드시 이 rng 만 쓴다.
 */

import type { Rng } from './rng.js';
import type { PlayerId } from './types.js';

export interface BotContext<View, Action> {
  readonly me: PlayerId;
  /** 리댁션된 뷰. 숨은 정보는 애초에 들어있지 않다. */
  readonly view: View;
  /** 엔진이 계산한 합법 수. 비어 있으면 호출되지 않는다. */
  readonly legal: readonly Action[];
  readonly rng: Rng;
}

export interface Bot<View, Action> {
  readonly id: string;
  /** 사람에게 보여줄 이름 (예: "초보 봇"). */
  readonly label: string;
  decide(ctx: BotContext<View, Action>): Action | Promise<Action>;
}

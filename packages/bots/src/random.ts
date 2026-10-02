/**
 * L1 랜덤 봇 — 합법 수 중 균등 선택.
 *
 * 목적은 "강한 AI" 가 아니라 **엔진 테스트 하네스**다.
 * 랜덤 봇끼리 수천 판을 돌리면 룰 엔진의 크래시·불변식 위반이 전부 드러난다.
 * 게임에 의존하지 않으므로 마이티·티츄 양쪽에 그대로 쓴다.
 */

import { pick, type Bot, type BotContext } from '@mightichu/core';

export function createRandomBot<View, Action>(): Bot<View, Action> {
  return {
    id: 'random',
    label: '랜덤 봇',
    decide(ctx: BotContext<View, Action>): Action {
      const chosen = pick(ctx.legal, ctx.rng);
      if (chosen === undefined) {
        throw new Error('합법 수가 없는데 봇이 호출되었다');
      }
      return chosen;
    },
  };
}

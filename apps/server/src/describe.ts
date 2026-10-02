/** 게임 이벤트를 사람이 읽는 한 줄로. 비공개 이벤트는 걸러낸다. */

import type { GameEvent, PlayerId } from '@mightichu/core';
import { bidLabel, cardLabel } from '@mightichu/mighty';

export function describeEvent(
  event: GameEvent,
  nameOf: (seat: PlayerId) => string,
): string | null {
  // visibleTo 가 있으면 비공개 이벤트 — 공용 로그에는 넣지 않는다
  if (event.visibleTo !== undefined) return null;

  const p = (event.payload ?? {}) as Record<string, unknown>;
  const who = typeof p['player'] === 'string' ? nameOf(p['player']) : '';

  switch (event.type) {
    case 'MISDEAL_DEMANDED':
      return `${who} 가 재딜을 요구했습니다.`;
    case 'BID':
      return `${who}: ${bidLabel(p['bid'] as never)}`;
    case 'PASS':
      return `${who}: 패스`;
    case 'CONTRACT_CHANGED':
      return `기루다 변경 → ${bidLabel(p['bid'] as never)}`;
    case 'DISCARDED':
      return '주공이 3장을 버렸습니다.';
    case 'FRIEND_CALLED': {
      const call = p['call'] as { kind: string; card?: string };
      const label =
        call.kind === 'CARD'
          ? `${cardLabel(call.card as string)} 프렌드`
          : call.kind === 'MIGHTY'
            ? '마이티 프렌드'
            : call.kind === 'JOKER'
              ? '조커 프렌드'
              : call.kind === 'FIRST_TRICK'
                ? '초구 프렌드'
                : '노프렌드';
      return `프렌드 지정: ${label}`;
    }
    case 'FRIEND_REVEALED': {
      const friend = p['friend'];
      return friend === null
        ? '프렌드 없음(노프렌드)으로 확정됐습니다.'
        : `프렌드 공개: ${nameOf(friend as string)}`;
    }
    case 'CARD_PLAYED':
      return `${who} → ${cardLabel(p['card'] as string)}`;
    case 'TRICK_WON': {
      const points = p['points'] as number;
      const trickNo = (p['trickNo'] as number) + 1;
      return `${trickNo}트릭: ${nameOf(p['winner'] as string)} 획득${points > 0 ? ` (+${points}점)` : ''}`;
    }
    default:
      return null;
  }
}

/** 게임 이벤트를 사람이 읽는 한 줄로. 서버의 describe.ts 와 같은 역할. */

import type { GameEvent, PlayerId } from '@mightichu/core';
import { bidLabel, cardLabel } from '@mightichu/mighty';
import type { GameId } from './registry.js';

const COMBO_LABEL: Record<string, string> = {
  SINGLE: '싱글',
  PAIR: '페어',
  TRIPLE: '트리플',
  FULL_HOUSE: '풀하우스',
  STAIRS: '계단',
  STRAIGHT: '스트레이트',
  BOMB_FOUR: '폭탄(포카드)',
  BOMB_STRAIGHT: '폭탄(스플)',
  DOG: '개',
};

export function describeEvent(
  game: GameId,
  event: GameEvent,
  nameOf: (seat: PlayerId) => string,
  viewer: PlayerId,
): string | null {
  if (event.visibleTo !== undefined && !event.visibleTo.includes(viewer)) return null;
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const who = typeof p['player'] === 'string' ? nameOf(p['player']) : '';

  if (game === 'tichu') {
    switch (event.type) {
      case 'TICHU_CALLED':
        return `${who}: ${p['call'] === 'GRAND' ? '라지 티츄!' : '티츄!'}`;
      case 'PLAYED':
        return `${who} → ${COMBO_LABEL[String(p['combo'])] ?? String(p['combo'])} ${String(p['cards'])}장`;
      case 'PASS':
        return `${who}: 패스`;
      case 'DOG_PLAYED':
        return `${who} 가 개를 내 ${nameOf(p['to'] as string)} 에게 리드를 넘겼습니다.`;
      case 'WISH_MADE':
        return `${who} 소원: ${String(p['wish'])}`;
      case 'WISH_FULFILLED':
        return `${who} 가 소원(${String(p['wish'])})을 이행했습니다.`;
      case 'TRICK_WON':
        return `${nameOf(p['winner'] as string)} 트릭 획득 (${String(p['points'])}점)`;
      case 'DRAGON_TRICK':
        return `${nameOf(p['winner'] as string)} 가 용으로 먹었습니다 — 상대에게 넘깁니다.`;
      case 'DRAGON_GIVEN':
        return `용 트릭 → ${nameOf(p['to'] as string)}`;
      case 'FINISHED':
        return `${who} 손패 비움 (${String(p['place'])}등)`;
      default:
        return null;
    }
  }

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
    case 'FRIEND_REVEALED':
      return p['friend'] === null
        ? '프렌드 없음(노프렌드)으로 확정됐습니다.'
        : `프렌드 공개: ${nameOf(p['friend'] as string)}`;
    case 'CARD_PLAYED':
      return `${who} → ${cardLabel(p['card'] as string)}`;
    case 'TRICK_WON': {
      const points = p['points'] as number;
      return `${(p['trickNo'] as number) + 1}트릭: ${nameOf(p['winner'] as string)} 획득${points > 0 ? ` (+${points}점)` : ''}`;
    }
    default:
      return null;
  }
}

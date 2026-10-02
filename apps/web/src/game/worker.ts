/// <reference lib="webworker" />
/**
 * 게임 워커 — AI 모드의 **권위**.
 *
 * 전체 상태(모든 손패)는 이 워커 안에만 있다. UI 로는 `view()` 를 거친
 * 리댁션된 뷰만 나간다. 봇도 같은 `view()` 를 거치므로 로컬 대국에서도
 * 치팅 경로가 존재하지 않는다.
 *
 * AI 탐색이 무거워져도 UI 가 멈추지 않도록 워커에 둔다.
 */

import { createRng, type PlayerId, type Rng } from '@mightichu/core';
import { createMightyBasicBot } from '@mightichu/bots';
import {
  cardLabel,
  bidLabel,
  mightyEngine,
  type MightyAction,
  type MightyState,
} from '@mightichu/mighty';
import type { FromWorker, ToWorker } from './protocol.js';

export const HUMAN: PlayerId = 'p1';
export const SEATS: readonly PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5'];

const SEAT_LABEL: Record<PlayerId, string> = {
  p1: '나',
  p2: '봇 2',
  p3: '봇 3',
  p4: '봇 4',
  p5: '봇 5',
};

/**
 * 연출 간격.
 *
 * 봇을 한꺼번에 처리하면 사람은 **봇들이 뭘 냈는지도, 누가 먹었는지도** 볼 수 없다.
 * 한 수마다 뷰를 내보내고 간격을 둔다.
 */
const BOT_STEP_MS = 650;
const TRICK_HOLD_MS = 1500;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const bot = createMightyBasicBot();

let state: MightyState | null = null;
/** 봇 루프 중복 구동 방지. */
let driving = false;
let rng: Rng = createRng(1);
let log: string[] = [];

function seatName(player: PlayerId): string {
  return SEAT_LABEL[player] ?? player;
}

/** 이벤트를 사람이 읽는 한 줄로. 비공개 이벤트는 사람 것만 남긴다. */
function describe(event: { type: string; payload?: unknown; visibleTo?: readonly PlayerId[] }): string | null {
  if (event.visibleTo !== undefined && !event.visibleTo.includes(HUMAN)) return null;
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const who = typeof p['player'] === 'string' ? seatName(p['player']) : '';

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
        : `프렌드 공개: ${seatName(friend as string)}`;
    }
    case 'CARD_PLAYED':
      return `${who} → ${cardLabel(p['card'] as string)}`;
    case 'TRICK_WON': {
      const points = p['points'] as number;
      const trickNo = (p['trickNo'] as number) + 1;
      return `${trickNo}트릭: ${seatName(p['winner'] as string)} 획득${points > 0 ? ` (+${points}점)` : ''}`;
    }
    default:
      return null;
  }
}

function post(message: FromWorker): void {
  self.postMessage(message);
}

function publish(): void {
  if (state === null) return;
  post({
    type: 'STATE',
    view: mightyEngine.view(state, HUMAN),
    legal: mightyEngine.legalActions(state, HUMAN),
    log: [...log],
  });
  if (mightyEngine.isOver(state)) {
    post({ type: 'SCORE', score: mightyEngine.score(state) });
  }
}

/** 방금 끝난 트릭 번호 — 바뀌면 트릭이 완성된 것. */
function trickMarker(): number {
  return state?.lastTrick?.trickNo ?? -1;
}

/** 사람 차례가 오거나 라운드가 끝날 때까지, **한 수씩 간격을 두고** 봇을 돌린다. */
async function advance(): Promise<void> {
  if (driving) return;
  driving = true;
  try {
    let guard = 0;
    while (state !== null && !mightyEngine.isOver(state) && guard++ < 500) {
      if (mightyEngine.legalActions(state, HUMAN).length > 0) break;

      const actor = SEATS.find(
        (p) => p !== HUMAN && mightyEngine.legalActions(state as MightyState, p).length > 0,
      );
      if (actor === undefined) break;

      await sleep(BOT_STEP_MS);

      const decided = bot.decide({
        me: actor,
        view: mightyEngine.view(state, actor),
        legal: mightyEngine.legalActions(state, actor),
        rng,
      });
      if (decided instanceof Promise) {
        post({ type: 'ERROR', message: '비동기 봇은 아직 지원하지 않습니다.' });
        return;
      }

      const before = trickMarker();
      const applied = mightyEngine.apply(state, actor, decided);
      if (!applied.ok) {
        post({
          type: 'ERROR',
          message: `봇이 불법 액션을 냈습니다: ${applied.error.code} ${applied.error.message}`,
        });
        return;
      }
      state = applied.value.state;
      record(applied.value.events);
      publish();

      if (trickMarker() !== before) await sleep(TRICK_HOLD_MS);
    }
  } finally {
    driving = false;
  }
  publish();
}

function record(events: readonly { type: string; payload?: unknown; visibleTo?: readonly PlayerId[] }[]): void {
  for (const event of events) {
    const line = describe(event);
    if (line !== null) log.push(line);
  }
}

self.onmessage = (message: MessageEvent<ToWorker>): void => {
  const data = message.data;

  if (data.type === 'NEW_GAME') {
    rng = createRng(data.seed ^ 0x5bf03635);
    log = [];
    state = mightyEngine.init({ config: {}, players: SEATS, seed: data.seed });
    publish();
    void advance();
    return;
  }

  if (data.type === 'ACTION') {
    if (state === null) {
      post({ type: 'ERROR', message: '게임이 시작되지 않았습니다.' });
      return;
    }
    const applied = mightyEngine.apply(state, HUMAN, data.action as MightyAction);
    if (!applied.ok) {
      post({ type: 'ERROR', message: applied.error.message });
      publish();
      return;
    }
    const before = trickMarker();
    state = applied.value.state;
    record(applied.value.events);
    publish();
    // 사람이 트릭을 끝냈으면 결과를 보여줄 시간을 준다
    const held = trickMarker() !== before ? sleep(TRICK_HOLD_MS) : Promise.resolve();
    void held.then(() => advance());
  }
};

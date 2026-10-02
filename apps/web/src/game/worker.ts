/// <reference lib="webworker" />
/**
 * 게임 워커 — AI 모드의 **권위**.
 *
 * 전체 상태(모든 손패)는 이 워커 안에만 있다. UI 로는 `view()` 를 거친
 * 리댁션된 뷰만 나간다. 봇도 같은 `view()` 를 거치므로 로컬 대국에서도
 * 치팅 경로가 존재하지 않는다.
 *
 * 어떤 게임인지 모른다 — `registry.ts` 에서 `GameEngine` 만 꺼내 돌린다.
 */

import { createRng, type GameEvent, type PlayerId, type Rng } from '@mightichu/core';
import { GAMES, HUMAN, type GameEntry, type GameId } from './registry.js';
import { describeEvent } from './describe.js';
import type { FromWorker, ToWorker } from './protocol.js';

/** 봇이 생각하는 시간 — 사람이 봇들이 뭘 냈는지 볼 수 있어야 한다. */
const BOT_STEP_MS = 650;
/** 트릭이 끝난 뒤 "누가 먹었는지" 를 보여주는 시간. */
const TRICK_HOLD_MS = 1500;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let game: GameId = 'mighty';
let entry: GameEntry = GAMES.mighty;
let state: unknown = null;
let rng: Rng = createRng(1);
let log: string[] = [];
let driving = false;
/** 매치 누적 점수와 라운드 기록. 라운드가 아니라 **매치**가 게임의 단위다. */
let totals: Record<string, number> = {};
let history: Record<string, number>[] = [];
/** 이번 라운드 점수를 두 번 더하지 않기 위한 가드. */
let settled = false;

const SEAT_LABEL: Record<string, string> = {
  p1: '나',
  p2: '봇 2',
  p3: '봇 3',
  p4: '봇 4',
  p5: '봇 5',
};

function seatName(seat: PlayerId): string {
  return SEAT_LABEL[seat] ?? seat;
}

function post(message: FromWorker): void {
  self.postMessage(message);
}

function publish(): void {
  if (state === null) return;
  settle();
  post({
    type: 'STATE',
    game,
    view: entry.engine.view(state as never, HUMAN),
    legal: entry.engine.legalActions(state as never, HUMAN),
    log: [...log],
    totals: { ...totals },
    history: history.map((h) => ({ ...h })),
  });
  if (entry.engine.isOver(state as never)) {
    post({ type: 'SCORE', score: entry.engine.score(state as never) });
  }
}

/** 라운드가 끝났으면 매치 누적에 더한다. 한 번만. */
function settle(): void {
  if (settled || state === null || !entry.engine.isOver(state as never)) return;
  const score = entry.engine.score(state as never);
  for (const [seat, delta] of Object.entries(score.perPlayer)) {
    totals[seat] = (totals[seat] ?? 0) + delta;
  }
  history.push({ ...score.perPlayer });
  settled = true;
}

function beginRound(seed: number): void {
  log = [];
  settled = false;
  state = entry.engine.init({
    config: {} as never,
    players: entry.seats,
    seed,
  });
  publish();
  void advance();
}

function record(events: readonly GameEvent[]): void {
  for (const event of events) {
    const line = describeEvent(game, event, seatName, HUMAN);
    if (line !== null) log.push(line);
  }
}

/** 방금 끝난 트릭 식별자 — 바뀌면 트릭이 완성된 것. */
function trickMarker(): string {
  const s = state as { lastTrick?: unknown } | null;
  return JSON.stringify(s?.lastTrick ?? null);
}

/** 사람 차례가 오거나 라운드가 끝날 때까지, 한 수씩 간격을 두고 봇을 돌린다. */
async function advance(): Promise<void> {
  if (driving) return;
  driving = true;
  try {
    let guard = 0;
    while (state !== null && !entry.engine.isOver(state as never) && guard++ < 800) {
      // 사람이 할 일이 있는지로 멈추지 않는다 — 티츄에서는 "티츄 선언" 같은
      // 선택적 액션이 거의 항상 합법이라 그러면 영영 봇 차례가 오지 않는다.
      // 봇이 "지금 꼭 둬야 한다"(wants)고 할 때만 둔다.
      const actor = entry.seats.find((p) => {
        if (p === HUMAN) return false;
        const legal = entry.engine.legalActions(state as never, p);
        if (legal.length === 0) return false;
        return (
          entry.bot.wants?.({
            me: p,
            view: entry.engine.view(state as never, p),
            legal,
            rng,
          }) ?? true
        );
      });
      if (actor === undefined) break;

      await sleep(BOT_STEP_MS);

      const decided = entry.bot.decide({
        me: actor,
        view: entry.engine.view(state as never, actor),
        legal: entry.engine.legalActions(state as never, actor),
        rng,
      });
      if (decided instanceof Promise) {
        post({ type: 'ERROR', message: '비동기 봇은 아직 지원하지 않습니다.' });
        return;
      }

      const before = trickMarker();
      const applied = entry.engine.apply(state as never, actor, decided);
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

self.onmessage = (message: MessageEvent<ToWorker>): void => {
  const data = message.data;

  if (data.type === 'NEW_MATCH') {
    game = data.game;
    entry = GAMES[data.game];
    rng = createRng(data.seed ^ 0x5bf03635);
    totals = {};
    history = [];
    for (const seat of entry.seats) totals[seat] = 0;
    beginRound(data.seed);
    return;
  }

  if (data.type === 'NEXT_ROUND') {
    beginRound(data.seed);
    return;
  }

  if (data.type === 'ACTION') {
    if (state === null) {
      post({ type: 'ERROR', message: '게임이 시작되지 않았습니다.' });
      return;
    }
    const before = trickMarker();
    const applied = entry.engine.apply(state as never, HUMAN, data.action as never);
    if (!applied.ok) {
      post({ type: 'ERROR', message: applied.error.message });
      publish();
      return;
    }
    state = applied.value.state;
    record(applied.value.events);
    publish();
    const held = trickMarker() !== before ? sleep(TRICK_HOLD_MS) : Promise.resolve();
    void held.then(() => advance());
  }
};

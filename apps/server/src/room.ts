/**
 * 한 방의 상태와 전이.
 *
 * **방이 동시성 단위다.** Node 단일 스레드라 한 방 안의 액션은 자연히 직렬화되므로
 * 락이 없다. 액션에 실린 `seq`(상태 버전)가 어긋나면 거부해 낡은 입력을 막는다.
 *
 * 영속성: 결정론 덕분에 방 하나를 `{ seed, actions[] }` 로 복원할 수 있다.
 * `roundLog` 를 그대로 저장하면 전체 스냅샷 없이 재배포 복구가 된다(미사용, 3단계 이후).
 */

import {
  appendAction,
  createRng,
  createRoundLog,
  type GameEvent,
  type PlayerId,
  type RoundLog,
  type Rng,
} from '@mightichu/core';
import type { GameId, MemberInfo, RoomInfo } from '@mightichu/protocol';
import { gameEntry, type GameEntry } from './games.js';
import { describeEvent } from './describe.js';

export interface Member {
  readonly seat: PlayerId;
  nickname: string;
  isBot: boolean;
  /** 사람만. 재접속 신원. */
  token: string | null;
  socketId: string | null;
}

export type RoomError = { readonly code: string; readonly message: string };

/** 좌석 이름. 필요한 수는 게임마다 다르다(마이티 5인, 티츄 4인). */
const SEATS: readonly PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5'];

export class Room {
  readonly id: string;
  readonly game: GameId;
  readonly entry: GameEntry;
  readonly members: Member[] = [];

  hostSeat: PlayerId | null = null;
  state: unknown = null;
  seq = 0;
  log: string[] = [];
  roundLog: RoundLog<unknown, unknown> | null = null;
  totals: Record<PlayerId, number> = {};
  lastActivity = Date.now();
  /** 라운드 점수를 totals 에 한 번만 더하기 위한 가드. */
  private settled = false;
  /** 봇 루프가 이미 돌고 있는지 — 중복 구동을 막는다. */
  botLoopRunning = false;

  private rng: Rng = createRng(1);

  constructor(id: string, game: GameId) {
    this.id = id;
    this.game = game;
    this.entry = gameEntry(game);
    for (const seat of SEATS.slice(0, this.entry.players)) this.totals[seat] = 0;
  }

  // ── 멤버

  get started(): boolean {
    return this.state !== null;
  }

  private freeSeat(): PlayerId | null {
    const taken = new Set(this.members.map((m) => m.seat));
    return SEATS.slice(0, this.entry.players).find((s) => !taken.has(s)) ?? null;
  }

  findByToken(token: string): Member | undefined {
    return this.members.find((m) => m.token === token);
  }

  join(nickname: string, token: string, socketId: string): Member | RoomError {
    const existing = this.findByToken(token);
    if (existing !== undefined) {
      existing.socketId = socketId;
      existing.nickname = nickname;
      this.touch();
      return existing;
    }
    if (this.started) {
      return { code: 'ROOM_STARTED', message: '이미 시작된 방입니다.' };
    }
    const seat = this.freeSeat();
    if (seat === null) return { code: 'ROOM_FULL', message: '자리가 가득 찼습니다.' };

    const member: Member = { seat, nickname, isBot: false, token, socketId };
    this.members.push(member);
    if (this.hostSeat === null) this.hostSeat = seat;
    this.touch();
    return member;
  }

  addBot(): Member | RoomError {
    if (this.started) return { code: 'ROOM_STARTED', message: '이미 시작됐습니다.' };
    const seat = this.freeSeat();
    if (seat === null) return { code: 'ROOM_FULL', message: '자리가 가득 찼습니다.' };
    const index = this.members.filter((m) => m.isBot).length + 1;
    const member: Member = {
      seat,
      nickname: `봇 ${index}`,
      isBot: true,
      token: null,
      socketId: null,
    };
    this.members.push(member);
    this.touch();
    return member;
  }

  removeBot(seat: PlayerId): RoomError | null {
    if (this.started) return { code: 'ROOM_STARTED', message: '이미 시작됐습니다.' };
    const index = this.members.findIndex((m) => m.seat === seat && m.isBot);
    if (index < 0) return { code: 'NOT_FOUND', message: '그 자리에 봇이 없습니다.' };
    this.members.splice(index, 1);
    this.touch();
    return null;
  }

  disconnect(socketId: string): Member | undefined {
    const member = this.members.find((m) => m.socketId === socketId);
    if (member === undefined) return undefined;
    member.socketId = null;
    // 시작 전이면 자리를 비워준다. 시작 후엔 재접속을 위해 자리를 지킨다.
    if (!this.started) {
      this.members.splice(this.members.indexOf(member), 1);
      if (this.hostSeat === member.seat) {
        this.hostSeat = this.members.find((m) => !m.isBot)?.seat ?? null;
      }
    }
    this.touch();
    return member;
  }

  get connectedHumans(): number {
    return this.members.filter((m) => !m.isBot && m.socketId !== null).length;
  }

  // ── 라운드

  start(seed = Math.floor(Math.random() * 2 ** 31)): RoomError | null {
    if (this.started) return { code: 'ROOM_STARTED', message: '이미 시작됐습니다.' };
    if (this.members.length !== this.entry.players) {
      return {
        code: 'NOT_ENOUGH',
        message: `${this.entry.players}명이 모여야 시작할 수 있습니다.`,
      };
    }
    this.beginRound(seed);
    return null;
  }

  nextRound(seed = Math.floor(Math.random() * 2 ** 31)): RoomError | null {
    if (!this.started) return { code: 'NOT_STARTED', message: '시작되지 않았습니다.' };
    if (!this.entry.engine.isOver(this.state as never)) {
      return { code: 'ROUND_RUNNING', message: '라운드가 진행 중입니다.' };
    }
    this.beginRound(seed);
    return null;
  }

  private beginRound(seed: number): void {
    const players = this.members.map((m) => m.seat);
    this.rng = createRng(seed ^ 0x2545f491);
    this.log = [];
    this.seq = 0;
    this.state = this.entry.engine.init({ config: {} as never, players, seed });
    this.roundLog = createRoundLog('', {}, players, seed) as RoundLog<unknown, unknown>;
    this.settled = false;
    this.touch();
  }

  /** 사람의 액션. `seq` 가 어긋나면 거부한다(낙관적 동시성). */
  applyHuman(seat: PlayerId, seq: number, action: unknown): RoomError | null {
    if (!this.started) return { code: 'NOT_STARTED', message: '시작되지 않았습니다.' };
    if (seq !== this.seq) {
      return { code: 'STALE', message: '상태가 바뀌었습니다. 다시 시도하세요.' };
    }
    const result = this.entry.engine.apply(this.state as never, seat, action as never);
    if (!result.ok) return { code: result.error.code, message: result.error.message };

    this.state = result.value.state;
    this.seq += 1;
    this.record(result.value.events);
    this.roundLog = appendAction(
      this.roundLog as RoundLog<unknown, unknown>,
      seat,
      action,
    ) as RoundLog<unknown, unknown>;
    this.settle();
    this.touch();
    return null;
  }

  /**
   * 봇 한 수만 둔다. 둘 수 있는 봇이 없으면 null.
   *
   * 루프가 아니라 **한 수 단위**인 이유: 사람이 "봇들이 뭘 냈는지" 를 볼 수 있어야 하므로,
   * 호출부(서버)가 수 사이에 간격을 두고 매번 뷰를 내보낸다.
   */
  stepBot(): { seat: PlayerId; trickCompleted: boolean } | null {
    const engine = this.entry.engine;
    if (this.state === null || engine.isOver(this.state as never)) return null;

    const bot = this.members.find(
      (m) => m.isBot && engine.legalActions(this.state as never, m.seat).length > 0,
    );
    if (bot === undefined) return null;

    const decided = this.entry.bot.decide({
      me: bot.seat,
      view: engine.view(this.state as never, bot.seat),
      legal: engine.legalActions(this.state as never, bot.seat),
      rng: this.rng,
    });
    if (decided instanceof Promise) return null;

    const before = this.trickMarker();
    const result = engine.apply(this.state as never, bot.seat, decided);
    if (!result.ok) return null;

    this.state = result.value.state;
    this.seq += 1;
    this.record(result.value.events);
    this.roundLog = appendAction(
      this.roundLog as RoundLog<unknown, unknown>,
      bot.seat,
      decided,
    ) as RoundLog<unknown, unknown>;
    this.settle();
    this.touch();

    return { seat: bot.seat, trickCompleted: this.trickMarker() !== before };
  }

  /** 간격 없이 끝까지 — 테스트와 봇만 있는 방의 빠른 경로. */
  drainBots(limit = 500): number {
    let steps = 0;
    while (steps < limit && this.stepBot() !== null) steps++;
    return steps;
  }

  /** 방금 끝난 트릭의 번호. 바뀌면 트릭이 완성된 것. */
  private trickMarker(): number {
    const state = this.state as { lastTrick?: { trickNo: number } | null } | null;
    return state?.lastTrick?.trickNo ?? -1;
  }

  /** 라운드가 끝났으면 점수를 누적한다. 두 번 더하지 않는다. */
  private settle(): void {
    const engine = this.entry.engine;
    if (this.settled || this.state === null || !engine.isOver(this.state as never)) return;
    const score = engine.score(this.state as never);
    for (const [seat, delta] of Object.entries(score.perPlayer)) {
      this.totals[seat] = (this.totals[seat] ?? 0) + delta;
    }
    this.settled = true;
  }

  private record(events: readonly GameEvent[]): void {
    for (const event of events) {
      const line = describeEvent(event, (seat) => this.nameOf(seat), this.game);
      if (line !== null) this.log.push(line);
    }
  }

  nameOf(seat: PlayerId): string {
    return this.members.find((m) => m.seat === seat)?.nickname ?? seat;
  }

  private touch(): void {
    this.lastActivity = Date.now();
  }

  // ── 조회

  isOver(): boolean {
    return this.started && this.entry.engine.isOver(this.state as never);
  }

  scoreOf(): unknown {
    return this.isOver() ? this.entry.engine.score(this.state as never) : null;
  }

  viewFor(seat: PlayerId): unknown {
    return this.entry.engine.view(this.state as never, seat);
  }

  legalFor(seat: PlayerId): readonly unknown[] {
    return this.entry.engine.legalActions(this.state as never, seat);
  }

  info(): RoomInfo {
    const members: MemberInfo[] = this.members.map((m) => ({
      seat: m.seat,
      nickname: m.nickname,
      isBot: m.isBot,
      connected: m.isBot || m.socketId !== null,
    }));
    return {
      roomId: this.id,
      game: this.game,
      hostSeat: this.hostSeat ?? '',
      members,
      started: this.started,
      requiredPlayers: this.entry.players,
    };
  }
}

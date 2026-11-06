/**
 * 오프라인 마이티 점수판.
 *
 * 실제 카드로 둘러앉아 치면서 **공약과 점수만 기록**하는 용도다.
 * 점수 계산은 엔진의 `computeScore` 를 그대로 쓴다 —
 * 배수(런·백런·노기루다·노프렌드)와 제로섬 지급이 이미 구현돼 있어
 * 여기서 규칙을 다시 쓰지 않는다.
 *
 * 오프라인이라 새로고침·앱 전환으로 기록이 날아가면 안 된다 → localStorage 에 저장한다.
 */

import {
  MAX_BID,
  bidLabel,
  cardLabel,
  computeScore,
  jokerCallCard,
  mightyCard,
  type ScoringDetail,
  type Trump,
} from '@mightichu/mighty';
import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'mightichu.tally.v1';
const PLAYER_COUNT = 5;

/**
 * 실물 비딩판의 배열을 그대로 옮긴다 — **기루 없음이 맨 위**, 그 아래 ♠ ♦ ♥ ♣.
 * 칸은 11~20. 실물 판이 11부터라 그대로 두되, 기본 최저 공약(13) 미만은 흐리게 표시한다.
 */
const BOARD_ROWS: readonly Trump[] = ['NT', 'S', 'D', 'H', 'C'];
const BOARD_MIN = 11;
/** 점수 공식의 기준선. S = 2×(공약 − 기준) + (획득 − 공약). */
const DEFAULT_BASE = 13;

/** 프렌드 처리 — 배수가 달라지므로 셋을 구분해야 한다. */
type FriendMode =
  /** 프렌드가 나왔다. */
  | { readonly kind: 'PLAYER'; readonly seat: string }
  /** 노프렌드를 **선언**했다 → 점수 2배. */
  | { readonly kind: 'DECLARED_NONE' }
  /** 지명 카드가 주공 손·바닥에 있어 프렌드가 안 나왔다 → 지급만 혼자, 배수 없음. */
  | { readonly kind: 'HIDDEN_NONE' };

interface Round {
  readonly declarer: string;
  readonly friend: FriendMode;
  readonly trump: Trump;
  readonly count: number;
  readonly declarerPoints: number;
}

interface TallyState {
  readonly names: readonly string[];
  readonly rounds: readonly Round[];
  /** 점수 공식의 기준선. 모임마다 최저 공약이 달라 열어둔다. */
  readonly base: number;
  /** 이름을 넣고 시작했는가. 처음엔 이름 입력 화면부터 보여준다. */
  readonly started: boolean;
}

/** 시작 화면에서 직접 입력한다. 빈칸이면 자리 번호로 대신 부른다. */
const DEFAULT_NAMES = ['', '', '', '', ''];
const SEAT_PLACEHOLDER = ['1번', '2번', '3번', '4번', '5번'];
const SEATS = Array.from({ length: PLAYER_COUNT }, (_, i) => `p${i + 1}`);

function load(): TallyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { names: DEFAULT_NAMES, rounds: [], base: DEFAULT_BASE, started: false };
    const parsed = JSON.parse(raw) as TallyState;
    if (!Array.isArray(parsed.names) || parsed.names.length !== PLAYER_COUNT) {
      return { names: DEFAULT_NAMES, rounds: [], base: DEFAULT_BASE, started: false };
    }
    return {
      names: parsed.names,
      rounds: parsed.rounds ?? [],
      base: parsed.base ?? DEFAULT_BASE,
      // 예전 저장본에는 started 가 없다 — 기록이 있으면 이미 시작한 것으로 본다
      started: parsed.started ?? (parsed.rounds ?? []).length > 0,
    };
  } catch {
    return { names: DEFAULT_NAMES, rounds: [], base: DEFAULT_BASE, started: false };
  }
}

function save(state: TallyState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 사생활 모드 등 — 저장만 못 할 뿐 쓰는 데는 지장 없다 */
  }
}

/** 엔진의 점수 계산을 그대로 쓴다. 규칙을 두 번 쓰지 않는다. */
function scoreRound(
  round: Round,
  base: number,
): { perPlayer: Record<string, number>; detail: ScoringDetail } {
  const friendSeat = round.friend.kind === 'PLAYER' ? round.friend.seat : null;
  const result = computeScore({
    seats: SEATS,
    declarer: round.declarer,
    friend: friendSeat,
    friendCall:
      round.friend.kind === 'DECLARED_NONE'
        ? { kind: 'NONE' }
        : round.friend.kind === 'PLAYER'
          ? { kind: 'CARD', card: 'S14' } // 카드 콜 — 배수 없음
          : { kind: 'CARD', card: 'S14' }, // 숨은 노프렌드도 배수 없음
    contract: { trump: round.trump, count: round.count },
    declarerPoints: round.declarerPoints,
    base,
  });
  return {
    perPlayer: result.perPlayer as Record<string, number>,
    detail: result.detail as unknown as ScoringDetail,
  };
}

const TRUMP_LABEL: Record<Trump, string> = {
  S: '♠',
  D: '♦',
  H: '♥',
  C: '♣',
  NT: '노기루다',
};
const MULTIPLIER_LABEL: Record<string, string> = {
  RUN: '런',
  BACK_RUN: '백런',
  NO_TRUMP: '노기루다',
  NO_FRIEND: '노프렌드',
};

export function Tally(): React.JSX.Element {
  const [state, setState] = useState<TallyState>(load);
  const [editingNames, setEditingNames] = useState(false);

  useEffect(() => {
    save(state);
  }, [state]);

  const nameOf = useCallback(
    (seat: string) => {
      const i = SEATS.indexOf(seat);
      const name = (state.names[i] ?? '').trim();
      return name !== '' ? name : (SEAT_PLACEHOLDER[i] ?? seat);
    },
    [state.names],
  );

  // ── 입력 중인 라운드
  const [declarer, setDeclarer] = useState<string>('p1');
  const [friend, setFriend] = useState<FriendMode>({ kind: 'PLAYER', seat: 'p2' });
  const [trump, setTrump] = useState<Trump>('S');
  const [count, setCount] = useState(14);
  const [points, setPoints] = useState(14);

  const draft: Round = useMemo(
    () => ({ declarer, friend, trump, count, declarerPoints: points }),
    [declarer, friend, trump, count, points],
  );
  const preview = useMemo(() => scoreRound(draft, state.base), [draft, state.base]);

  const totals = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const seat of SEATS) sums[seat] = 0;
    for (const round of state.rounds) {
      const { perPlayer } = scoreRound(round, state.base);
      for (const seat of SEATS) sums[seat] = (sums[seat] ?? 0) + (perPlayer[seat] ?? 0);
    }
    return sums;
  }, [state.rounds, state.base]);

  const commit = (): void => {
    setState((prev) => ({ ...prev, rounds: [...prev.rounds, draft] }));
    // 다음 판은 보통 주공이 바뀐다 — 한 칸 넘겨 둔다
    const next = SEATS[(SEATS.indexOf(declarer) + 1) % PLAYER_COUNT] as string;
    setDeclarer(next);
    setFriend({ kind: 'PLAYER', seat: SEATS[(SEATS.indexOf(next) + 1) % PLAYER_COUNT] as string });
  };

  const undo = (): void =>
    setState((prev) => ({ ...prev, rounds: prev.rounds.slice(0, -1) }));

  const reset = (): void => {
    if (!confirm('기록을 전부 지울까요? 되돌릴 수 없습니다.')) return;
    setState((prev) => ({ ...prev, rounds: [], started: false }));
  };

  const leader = [...SEATS].sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0))[0];

  const setName = (i: number, value: string): void =>
    setState((prev) => ({
      ...prev,
      names: prev.names.map((n, j) => (j === i ? value : n)),
    }));

  /** 처음엔 이름부터 받는다. 판에서 "3번" 보다 이름이 훨씬 잘 읽힌다. */
  if (!state.started) {
    const filled = state.names.filter((n) => n.trim() !== '').length;
    return (
      <div className="panel">
        <p className="panel__hint">
          둘러앉은 순서대로 <strong>5명의 이름</strong>을 넣어주세요.
          비워두면 자리 번호로 부릅니다.
        </p>
        <div className="tally__setup">
          {SEATS.map((seat, i) => (
            <label key={seat} className="tally__setupRow">
              <span className="tally__seatNo">{i + 1}</span>
              <input
                className="input"
                maxLength={8}
                placeholder={SEAT_PLACEHOLDER[i]}
                value={state.names[i] ?? ''}
                onChange={(e) => setName(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const inputs = [
                    ...document.querySelectorAll<HTMLInputElement>('.tally__setup input'),
                  ];
                  (inputs[i + 1] ?? inputs[i])?.focus();
                }}
              />
            </label>
          ))}
        </div>

        <div className="panel__row">
          <span className="label">점수 기준선</span>
          <select
            className="select"
            value={state.base}
            onChange={(e) => setState((prev) => ({ ...prev, base: Number(e.target.value) }))}
          >
            {[11, 12, 13, 14].map((b) => (
              <option key={b} value={b}>
                {b} (최저 공약)
              </option>
            ))}
          </select>
          <span className="panel__count">
            S = 2×(공약 − {state.base}) + (획득 − 공약)
          </span>
        </div>

        <div className="panel__row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setState((prev) => ({ ...prev, started: true }))}
          >
            시작하기
          </button>
          <span className="panel__count">{filled} / 5명 입력됨</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── 누적 점수 */}
      <section className="tally__totals">
        {SEATS.map((seat) => {
          const value = totals[seat] ?? 0;
          return (
            <div
              key={seat}
              className={`tallycard ${seat === leader && value > 0 ? 'tallycard--lead' : ''}`}
            >
              <span className="tallycard__name">{nameOf(seat)}</span>
              <span className={`tallycard__score ${value > 0 ? 'pos' : value < 0 ? 'neg' : ''}`}>
                {value > 0 ? '+' : ''}
                {value}
              </span>
            </div>
          );
        })}
      </section>

      <div className="panel__row">
        <button
          type="button"
          className="btn btn--ghost btn--tiny"
          onClick={() => setEditingNames((v) => !v)}
        >
          {editingNames ? '이름 편집 끝' : '이름 편집'}
        </button>
        <span className="panel__count">{state.rounds.length}판 기록됨</span>
        {state.rounds.length > 0 ? (
          <>
            <button type="button" className="btn btn--ghost btn--tiny" onClick={undo}>
              마지막 판 취소
            </button>
            <button type="button" className="btn btn--ghost btn--tiny" onClick={reset}>
              전체 초기화
            </button>
          </>
        ) : null}
      </div>

      {editingNames ? (
        <div className="panel">
          <p className="panel__hint">이름을 바꾸면 기록에도 바로 반영됩니다.</p>
          <div className="panel__row">
            <span className="label">점수 기준선</span>
            <select
              className="select"
              value={state.base}
              onChange={(e) =>
                setState((prev) => ({ ...prev, base: Number(e.target.value) }))
              }
            >
              {[11, 12, 13, 14].map((b) => (
                <option key={b} value={b}>
                  {b} (최저 공약)
                </option>
              ))}
            </select>
            <span className="panel__count">
              S = 2×(공약 − {state.base}) + (획득 − 공약)
            </span>
          </div>
          <div className="tally__names">
            {SEATS.map((seat, i) => (
              <input
                key={seat}
                className="input"
                maxLength={8}
                value={state.names[i] ?? ''}
                placeholder={SEAT_PLACEHOLDER[i]}
                onChange={(e) => setName(i, e.target.value)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── 이번 판 입력 */}
      <div className="panel">
        <div className="field">
          <span className="label">주공</span>
          <div className="chips chips--wrap">
            {SEATS.map((seat) => (
              <button
                key={seat}
                type="button"
                className={`chip ${declarer === seat ? 'chip--on' : ''}`}
                onClick={() => {
                  setDeclarer(seat);
                  if (friend.kind === 'PLAYER' && friend.seat === seat) {
                    setFriend({ kind: 'HIDDEN_NONE' });
                  }
                }}
              >
                {nameOf(seat)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">공약 (비딩판)</span>
          {/*
            실물 비딩판 그대로 — 기루 없음이 맨 위, 그 아래 ♠ ♦ ♥ ♣.
            줄마다 **그 기루다일 때의 마이티·조커콜**을 같이 띄운다.
            판에서 제일 자주 헷갈리는 게 이거라 한눈에 보여야 한다.
          */}
          <div className="board">
            <div className="board__head">
              <span className="board__headnote">마이티 · 조커콜</span>
            </div>
            {BOARD_ROWS.map((t) => (
              <div key={t} className={`board__row board__row--${t.toLowerCase()}`}>
                <span className="board__suit">{TRUMP_LABEL[t]}</span>
                <div className="board__cells">
                  {Array.from(
                    { length: MAX_BID - BOARD_MIN + 1 },
                    (_, i) => BOARD_MIN + i,
                  ).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={[
                        'board__cell',
                        trump === t && count === c ? 'board__cell--on' : '',
                        c < state.base ? 'board__cell--low' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        setTrump(t);
                        setCount(c);
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <span className="board__legend">
                  <span className="board__chip" title="마이티">
                    {cardLabel(mightyCard(t))}
                  </span>
                  <span className="board__chip" title="조커콜">
                    {cardLabel(jokerCallCard(t))}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">프렌드</span>
          <div className="chips chips--wrap">
            {SEATS.filter((s) => s !== declarer).map((seat) => (
              <button
                key={seat}
                type="button"
                className={`chip ${friend.kind === 'PLAYER' && friend.seat === seat ? 'chip--on' : ''}`}
                onClick={() => setFriend({ kind: 'PLAYER', seat })}
              >
                {nameOf(seat)}
              </button>
            ))}
            <button
              type="button"
              className={`chip ${friend.kind === 'DECLARED_NONE' ? 'chip--on' : ''}`}
              onClick={() => setFriend({ kind: 'DECLARED_NONE' })}
            >
              노프렌드 선언 (×2)
            </button>
            <button
              type="button"
              className={`chip ${friend.kind === 'HIDDEN_NONE' ? 'chip--on' : ''}`}
              onClick={() => setFriend({ kind: 'HIDDEN_NONE' })}
              title="지명 카드가 주공 손이나 바닥에 있어 프렌드가 안 나온 경우 — 배수는 없습니다"
            >
              프렌드 안 나옴
            </button>
          </div>
        </div>

        <div className="field">
          <span className="label">여당이 먹은 점수카드</span>
          <div className="pointpad">
            {Array.from({ length: 21 }, (_, i) => i).map((n) => (
              <button
                key={n}
                type="button"
                className={`pointpad__cell ${points === n ? 'pointpad__cell--on' : ''}`}
                onClick={() => setPoints(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="panel__count">야당 {20 - points}장</span>
        </div>

        {/* ── 미리보기 */}
        <div className={`preview ${preview.detail.won ? 'preview--won' : 'preview--lost'}`}>
          <div className="preview__head">
            <strong>{preview.detail.won ? '여당 성공' : '여당 실패'}</strong>
            <span className="preview__formula">
              {bidLabel({ trump, count })} · 여당 {preview.detail.declarerPoints}장
              {' → '}
              기본 {preview.detail.baseScore}
              {preview.detail.multiplier > 1
                ? ` × ${preview.detail.multiplier} (${preview.detail.multipliers
                    .map((m) => MULTIPLIER_LABEL[m] ?? m)
                    .join(', ')})`
                : ''}
            </span>
          </div>
          <div className="preview__row">
            {SEATS.map((seat) => {
              const v = preview.perPlayer[seat] ?? 0;
              return (
                <span key={seat} className="preview__cell">
                  <span className="preview__who">{nameOf(seat)}</span>
                  <span className={v > 0 ? 'pos' : v < 0 ? 'neg' : ''}>
                    {v > 0 ? '+' : ''}
                    {v}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        <button type="button" className="btn btn--primary" onClick={commit}>
          이번 판 기록하기
        </button>
      </div>

      {/* ── 라운드별 기록 */}
      {state.rounds.length > 0 ? (
        <div className="panel scoretable">
          <table className="scores scores--match tally__table">
            <thead>
              <tr>
                <th>판</th>
                <th>공약</th>
                {SEATS.map((seat) => (
                  <th key={seat}>{nameOf(seat)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.rounds.map((round, i) => {
                const { perPlayer, detail } = scoreRound(round, state.base);
                return (
                  <tr key={`r${i}`}>
                    <td>{i + 1}</td>
                    <td className="tally__bid">
                      {bidLabel({ trump: round.trump, count: round.count })}
                      <span className="tally__who">
                        {nameOf(round.declarer)}
                        {round.friend.kind === 'PLAYER'
                          ? ` · ${nameOf(round.friend.seat)}`
                          : round.friend.kind === 'DECLARED_NONE'
                            ? ' · 노프렌드'
                            : ' · 프렌드 없음'}
                        {detail.multiplier > 1 ? ` ×${detail.multiplier}` : ''}
                      </span>
                    </td>
                    {SEATS.map((seat) => {
                      const v = perPlayer[seat] ?? 0;
                      return (
                        <td key={seat} className={v > 0 ? 'pos' : v < 0 ? 'neg' : ''}>
                          {v > 0 ? '+' : ''}
                          {v}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>누적</td>
                {SEATS.map((seat) => {
                  const v = totals[seat] ?? 0;
                  return (
                    <td key={seat} className={v > 0 ? 'pos' : v < 0 ? 'neg' : ''}>
                      {v > 0 ? '+' : ''}
                      {v}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="panel__hint">
          실제 카드로 치면서 판마다 공약과 결과만 눌러 넣으세요. 점수는 자동으로 계산됩니다.
        </p>
      )}
    </>
  );
}

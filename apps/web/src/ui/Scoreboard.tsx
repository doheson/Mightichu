/**
 * 매치 점수표.
 *
 * 티츄는 **1000점 선취**라 한 라운드로 끝나지 않는다. 지금 몇 대 몇인지,
 * 각 라운드에서 어느 팀이 몇 점 먹었는지를 볼 수 있어야 한다.
 */

import { useState } from 'react';
import type { PlayerId } from '../game/types.js';
import { useSeatName } from './names.js';

export interface TeamSpec {
  readonly key: string;
  readonly name: string;
  readonly color: 'blue' | 'red' | null;
  readonly seats: readonly PlayerId[];
}

function sumFor(row: Readonly<Record<string, number>>, seats: readonly PlayerId[]): number {
  // 팀 점수는 구성원이 같은 값을 갖는다(티츄). 중복으로 더하지 않도록 첫 좌석만 본다.
  const first = seats[0];
  return first === undefined ? 0 : (row[first] ?? 0);
}

export function MatchScore({
  teams,
  totals,
  history,
  target,
  teamed,
  me,
}: {
  readonly teams: readonly TeamSpec[];
  readonly totals: Readonly<Record<string, number>>;
  readonly history: readonly Readonly<Record<string, number>>[];
  readonly target: number | null;
  readonly teamed: boolean;
  /** 팀전이 아닐 때 요약에 띄울 좌석(보통 나). */
  readonly me?: PlayerId;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const seatName = useSeatName();

  const value = (t: TeamSpec, row: Readonly<Record<string, number>>): number =>
    teamed ? sumFor(row, t.seats) : (row[t.seats[0] as string] ?? 0);

  const leader = [...teams].sort((a, b) => value(b, totals) - value(a, totals))[0];
  const won = target !== null && leader !== undefined && value(leader, totals) >= target;

  return (
    <>
      <button
        type="button"
        className={`matchscore ${won ? 'matchscore--won' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="눌러서 라운드별 점수 보기"
      >
        {/* 팀전이면 "N : M", 아니면(마이티 5인) 늘어놓으면 읽히지 않으므로 내 점수만 */}
        {teamed ? (
          teams.map((t, i) => (
            <span key={t.key}>
              {i > 0 ? <span className="matchscore__vs">:</span> : null}
              <span className={t.color === null ? '' : `team--${t.color}`}>
                {value(t, totals)}
              </span>
            </span>
          ))
        ) : (
          <>
            <span className="matchscore__mine">{totals[me ?? ''] ?? 0}</span>
            <span className="matchscore__target">내 점수</span>
          </>
        )}
        {target !== null ? <span className="matchscore__target">/ {target}</span> : null}
        <span className="matchscore__caret">{open ? '▴' : '▾'}</span>
      </button>

      {open ? (
        <div className="panel scoretable">
          {won && leader !== undefined ? (
            <p className="scoretable__won">
              <strong className={leader.color === null ? '' : `team--${leader.color}`}>
                {leader.name}
              </strong>{' '}
              {target}점 달성 — 매치 승리
            </p>
          ) : null}
          <table className="scores scores--match">
            <thead>
              <tr>
                <th>라운드</th>
                {teams.map((t) => (
                  <th key={t.key} className={t.color === null ? '' : `team--${t.color}`}>
                    {t.name}
                    <span className="scoretable__members">
                      {t.seats.map(seatName).join(' · ')}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={teams.length + 1} className="scoretable__empty">
                    아직 끝난 라운드가 없습니다.
                  </td>
                </tr>
              ) : (
                history.map((row, i) => (
                  <tr key={`r${i}`}>
                    <td>{i + 1}</td>
                    {teams.map((t) => {
                      const v = value(t, row);
                      return (
                        <td key={t.key} className={v > 0 ? 'pos' : v < 0 ? 'neg' : ''}>
                          {v > 0 ? '+' : ''}
                          {v}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td>누적</td>
                {teams.map((t) => (
                  <td key={t.key} className={t.color === null ? '' : `team--${t.color}`}>
                    {value(t, totals)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </>
  );
}

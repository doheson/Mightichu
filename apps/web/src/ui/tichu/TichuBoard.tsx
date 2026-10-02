/** 티츄 게임판 — AI 모드와 온라인 모드가 함께 쓴다. */

import type { RoundScore } from '@mightichu/core';
import type { TichuAction, TichuView } from '../../game/tichuTypes.js';
import { Log } from '../Table.js';
import { useSeatName } from '../names.js';
import { TichuTable } from './TichuTable.js';
import { DragonPanel, ExchangePanel, GrandPanel, PlayPanel } from './panels.js';

export interface TichuBoardProps {
  readonly view: TichuView;
  readonly legal: readonly TichuAction[];
  readonly log: readonly string[];
  readonly score: RoundScore | null;
  readonly error: string | null;
  readonly send: (action: TichuAction) => void;
  readonly onNext: (() => void) | null;
  readonly nextLabel: string;
}

const PHASE_LABEL: Record<string, string> = {
  GRAND: '라지 티츄',
  EXCHANGE: '카드 교환',
  PLAY: '플레이',
  DRAGON_GIFT: '용 양도',
  DONE: '종료',
};

export function TichuBoard({
  view,
  legal,
  log,
  score,
  error,
  send,
  onNext,
  nextLabel,
}: TichuBoardProps): React.JSX.Element {
  const seatName = useSeatName();
  const teamMine = [view.me, view.partner].filter((p): p is string => p !== null);

  return (
    <>
      <header className="header">
        <div className="header__item">
          <span className="label">단계</span>
          <strong>{PHASE_LABEL[view.phase] ?? view.phase}</strong>
        </div>
        <div className="header__item">
          <span className="label">우리 팀</span>
          <strong>{teamMine.map(seatName).join(' · ')}</strong>
        </div>
        <div className="header__item">
          <span className="label">우리 점수</span>
          <strong>
            {teamMine.reduce((n, p) => n + (view.takenPoints[p] ?? 0), 0)}점
          </strong>
        </div>
        <div className="header__item">
          <span className="label">소원</span>
          <strong>{view.wish ?? '—'}</strong>
        </div>
        <div className="header__item">
          <span className="label">남은 인원</span>
          <strong>{view.seats.length - view.finished.length}명</strong>
        </div>
      </header>

      {error !== null ? <div className="error">{error}</div> : null}

      <TichuTable view={view} />

      <section className="main">
        <div className="main__left">
          {view.phase === 'DONE' ? (
            <TichuResult view={view} score={score} onNext={onNext} nextLabel={nextLabel} />
          ) : view.phase === 'GRAND' ? (
            <GrandPanel view={view} legal={legal} send={send} />
          ) : view.phase === 'EXCHANGE' ? (
            <ExchangePanel view={view} legal={legal} send={send} />
          ) : view.phase === 'DRAGON_GIFT' ? (
            <DragonPanel view={view} legal={legal} send={send} />
          ) : (
            <PlayPanel view={view} legal={legal} send={send} />
          )}
        </div>
        <Log lines={log} />
      </section>
    </>
  );
}

interface TichuDetail {
  readonly outcome?: string;
  readonly cardPoints?: readonly number[];
  readonly callPoints?: readonly number[];
  readonly teamTotals?: readonly number[];
  readonly winner?: string | null;
}

function TichuResult({
  view,
  score,
  onNext,
  nextLabel,
}: {
  readonly view: TichuView;
  readonly score: RoundScore | null;
  readonly onNext: (() => void) | null;
  readonly nextLabel: string;
}): React.JSX.Element {
  const seatName = useSeatName();
  const detail = (score?.detail ?? {}) as TichuDetail;
  const double = detail.outcome === 'DOUBLE_WIN';

  const teams = [
    [view.seats[0] as string, view.seats[2] as string],
    [view.seats[1] as string, view.seats[3] as string],
  ];

  return (
    <div className="panel">
      <h2 className="result__title">
        {double ? '더블윈! (200점)' : '라운드 종료'}
      </h2>
      {detail.winner != null ? (
        <p className="panel__hint">1등: {seatName(detail.winner)}</p>
      ) : null}

      <table className="scores">
        <tbody>
          {teams.map((team, i) => (
            <tr key={team.join('-')} className={team.includes(view.me) ? 'scores__me' : ''}>
              <td>{team.map(seatName).join(' · ')}</td>
              <td>
                카드 {detail.cardPoints?.[i] ?? 0}
                {(detail.callPoints?.[i] ?? 0) !== 0
                  ? ` · 선언 ${(detail.callPoints?.[i] ?? 0) > 0 ? '+' : ''}${detail.callPoints?.[i] ?? 0}`
                  : ''}
              </td>
              <td
                className={
                  (detail.teamTotals?.[i] ?? 0) > 0
                    ? 'pos'
                    : (detail.teamTotals?.[i] ?? 0) < 0
                      ? 'neg'
                      : ''
                }
              >
                {(detail.teamTotals?.[i] ?? 0) > 0 ? '+' : ''}
                {detail.teamTotals?.[i] ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {onNext === null ? (
        <p className="panel__hint">방장이 다음 판을 시작하기를 기다립니다…</p>
      ) : (
        <button type="button" className="btn btn--primary" onClick={onNext}>
          {nextLabel}
        </button>
      )}
    </div>
  );
}

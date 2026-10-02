/** 게임판 — AI 모드와 온라인 모드가 함께 쓴다. */

import { sortHand } from '@mightichu/mighty';
import type { MightyAction, MightyView, RoundScore } from '../game/types.js';
import { CardView } from './Card.js';
import { Header, Log, Seats } from './Table.js';
import { useSeatName } from './names.js';
import {
  BiddingPanel,
  FriendPanel,
  KittyPanel,
  MisdealPanel,
  PlayPanel,
} from './panels.js';

export interface BoardProps {
  readonly view: MightyView;
  readonly legal: readonly MightyAction[];
  readonly log: readonly string[];
  readonly score: RoundScore | null;
  readonly error: string | null;
  readonly send: (action: MightyAction) => void;
  /** 라운드가 끝났을 때 다음 판으로. 온라인에서는 방장만 활성화한다. */
  readonly onNext: (() => void) | null;
  readonly nextLabel: string;
}

export function Board({
  view,
  legal,
  log,
  score,
  error,
  send,
  onNext,
  nextLabel,
}: BoardProps): React.JSX.Element {
  return (
    <>
      <Header view={view} />
      {error !== null ? <div className="error">{error}</div> : null}

      <div className="board">
        <Seats view={view} />
        <Log lines={log} />
      </div>

      <section className="main">
        <div className="main__left">
          {view.phase === 'DONE' ? (
            <Result view={view} score={score} onNext={onNext} nextLabel={nextLabel} />
          ) : (
            <Panel view={view} legal={legal} send={send} />
          )}
        </div>
      </section>

      {view.phase !== 'KITTY' && view.phase !== 'PLAY' && view.phase !== 'DONE' ? (
        <section className="myhand">
          <div className="myhand__title">내 손패 ({view.myHand.length}장)</div>
          <div className="hand">
            {sortHand(view.myHand).map((card) => (
              <CardView key={card} card={card} disabled />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Panel(props: {
  readonly view: MightyView;
  readonly legal: readonly MightyAction[];
  readonly send: (action: MightyAction) => void;
}): React.JSX.Element {
  const seatName = useSeatName();
  const { view } = props;
  if (view.phase === 'MISDEAL') {
    return view.iCanDemandMisdeal ? (
      <MisdealPanel {...props} />
    ) : (
      <Waiting text="다른 플레이어의 재딜 확인을 기다립니다…" />
    );
  }
  if (view.phase === 'BIDDING') {
    return view.currentBidder === view.me ? (
      <BiddingPanel {...props} />
    ) : (
      <Waiting text={`${view.currentBidder === null ? '' : seatName(view.currentBidder)} 의 공약을 기다립니다…`} />
    );
  }
  if (view.phase === 'KITTY') {
    return view.declarer === view.me ? (
      <KittyPanel {...props} />
    ) : (
      <Waiting text="주공이 바닥을 처리하는 중…" />
    );
  }
  if (view.phase === 'FRIEND') {
    return view.declarer === view.me ? (
      <FriendPanel {...props} />
    ) : (
      <Waiting text="주공이 프렌드를 지정하는 중…" />
    );
  }
  return <PlayPanel {...props} />;
}

function Waiting({ text }: { readonly text: string }): React.JSX.Element {
  return (
    <div className="panel">
      <p className="panel__hint">{text}</p>
    </div>
  );
}

interface ScoringDetailLike {
  readonly outcome?: string;
  readonly reason?: string;
  readonly won?: boolean;
  readonly declarerPoints?: number;
  readonly defenderPoints?: number;
  readonly baseScore?: number;
  readonly multiplier?: number;
  readonly multipliers?: readonly string[];
  readonly solo?: boolean;
}

const MULTIPLIER_LABEL: Record<string, string> = {
  RUN: '런',
  BACK_RUN: '백런',
  NO_TRUMP: '노기루다',
  NO_FRIEND: '노프렌드',
};

function Result({
  view,
  score,
  onNext,
  nextLabel,
}: {
  readonly view: MightyView;
  readonly score: RoundScore | null;
  readonly onNext: (() => void) | null;
  readonly nextLabel: string;
}): React.JSX.Element {
  const seatName = useSeatName();
  const detail = (score?.detail ?? {}) as ScoringDetailLike;
  const redeal = view.outcome?.kind === 'REDEAL';

  return (
    <div className="panel">
      <h2 className="result__title">
        {redeal
          ? `재딜 — ${view.outcome?.kind === 'REDEAL' && view.outcome.reason === 'ALL_PASSED' ? '전원 패스' : '재딜 요구'}`
          : detail.won === true
            ? '여당 성공'
            : '여당 실패'}
      </h2>

      {!redeal ? (
        <div className="result__grid">
          <div>
            <span className="label">여당 / 야당</span>
            <strong>
              {detail.declarerPoints ?? 0} / {detail.defenderPoints ?? 0}
            </strong>
          </div>
          <div>
            <span className="label">기본 점수</span>
            <strong>{detail.baseScore ?? 0}</strong>
          </div>
          <div>
            <span className="label">배수</span>
            <strong>
              ×{detail.multiplier ?? 1}
              {(detail.multipliers ?? []).length > 0
                ? ` (${(detail.multipliers ?? []).map((m) => MULTIPLIER_LABEL[m] ?? m).join(', ')})`
                : ''}
            </strong>
          </div>
          {detail.solo === true ? (
            <div>
              <span className="label">형태</span>
              <strong>노프렌드</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      <table className="scores">
        <tbody>
          {view.seats.map((seat) => {
            const value = score?.perPlayer[seat] ?? 0;
            return (
              <tr key={seat} className={seat === view.me ? 'scores__me' : ''}>
                <td>{seatName(seat)}</td>
                <td>{view.points[seat] ?? 0}점 획득</td>
                <td className={value > 0 ? 'pos' : value < 0 ? 'neg' : ''}>
                  {value > 0 ? `+${value}` : value}
                </td>
              </tr>
            );
          })}
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

/** 티츄 원형 테이블 — 나를 하단 중앙에 두고 **반시계** 진행. */

import type { PlayerId, TichuView } from '../../game/tichuTypes.js';
import { useSeatName } from '../names.js';
import { TichuCard } from './TichuCard.js';

/**
 * 티츄는 **반시계(ccw)** 로 진행한다. 화면에서는 각도를 줄여가면 반시계가 된다.
 * 나는 하단 중앙(90°), 4등분이니 90° 간격 → 90, 0, 270, 180.
 * 시계 눈금으로 6시 → 3시 → 12시 → 9시 — 다음 차례가 오른쪽으로 간다.
 */
const START_ANGLE = 90;
const RADIUS_X = 37;
const RADIUS_Y = 33;

function polar(index: number, count: number, scale: number): React.CSSProperties {
  const angle = ((START_ANGLE - (360 / count) * index) * Math.PI) / 180;
  return {
    left: `${50 + RADIUS_X * scale * Math.cos(angle)}%`,
    top: `${50 + RADIUS_Y * scale * Math.sin(angle)}%`,
  };
}

function orderedFromMe(seats: readonly PlayerId[], me: PlayerId): readonly PlayerId[] {
  const start = seats.indexOf(me);
  if (start < 0) return seats;
  return seats.map((_, k) => seats[(start + k) % seats.length] as PlayerId);
}

const CALL_LABEL: Record<string, string> = { SMALL: '티츄', GRAND: '라지 티츄' };

/**
 * 팀 색: 좌석 0·2 가 파랑, 1·3 이 빨강.
 * 마주 앉은 둘이 한 팀이므로 색만 보면 편이 바로 읽힌다.
 */
export function teamOf(seats: readonly PlayerId[], seat: PlayerId): 'blue' | 'red' {
  return seats.indexOf(seat) % 2 === 0 ? 'blue' : 'red';
}

export function TichuTable({ view }: { readonly view: TichuView }): React.JSX.Element {
  const seatName = useSeatName();
  const ordered = orderedFromMe(view.seats, view.me);

  const showingLast = view.currentTrick.length === 0 && view.lastTrick !== null;
  const shown = showingLast ? (view.lastTrick?.plays ?? []) : view.currentTrick;
  const winner = showingLast ? (view.lastTrick?.winner ?? null) : null;
  const wonPoints = showingLast ? (view.lastTrick?.points ?? 0) : 0;
  const giftedTo = showingLast ? (view.lastTrick?.giftedTo ?? null) : null;

  const playedBy = new Map<PlayerId, string[]>();
  for (const play of shown) playedBy.set(play.player, [...play.combo.cards]);

  return (
    <div className={`table table--tichu ${showingLast ? 'table--resolved' : ''}`}>
      <div className="table__center">
        {showingLast && winner !== null ? (
          <>
            <span className="table__winner">{seatName(winner)} 획득</span>
            <span className="table__hint">
              {wonPoints}점{giftedTo !== null ? ` → ${seatName(giftedTo)}` : ''}
            </span>
          </>
        ) : view.wish !== null ? (
          <>
            <span className="table__trickno">소원 {view.wish}</span>
            <span className="table__hint">이행 의무</span>
          </>
        ) : view.phase === 'PLAY' ? (
          // 플레이 중에는 비워둔다 — 여기가 카드가 놓이는 자리다
          null
        ) : (
          <span className="table__hint">
            {view.phase === 'GRAND' ? '라지 티츄' : view.phase === 'EXCHANGE' ? '카드 교환' : ''}
          </span>
        )}
      </div>

      {ordered.map((seat, index) => {
        const cards = playedBy.get(seat) ?? [];
        const isTurn = view.turn === seat;
        const isWinner = winner === seat;
        const call = view.calls[seat];
        const place = view.finished.indexOf(seat);
        return (
          <div key={`seat-${seat}`}>
            <div
              className={[
                'seat',
                `seat--${teamOf(view.seats, seat)}`,
                seat === view.me ? 'seat--me' : '',
                isTurn ? 'seat--turn' : '',
                isWinner ? 'seat--won' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={polar(index, ordered.length, 1)}
            >
              <div className="seat__name">
                {seatName(seat)}
                {seat === view.partner ? ' 🤝' : ''}
                {place >= 0 ? ` ${place + 1}등` : ''}
              </div>
              {/* 라운드 중에는 획득 점수를 보여주지 않는다 — 끝날 때 팀 점수로 한 번에 공개한다 */}
              <div className="seat__meta">
                <span className="pill">{view.handCounts[seat] ?? 0}장</span>
                {(view.takenCounts[seat] ?? 0) > 0 ? (
                  <span className="seat__points">먹은 {view.takenCounts[seat]}장</span>
                ) : null}
              </div>
              {call !== undefined && call !== 'NONE' ? (
                <div className={`seat__tag seat__tag--${call === 'GRAND' ? 'grand' : 'tichu'}`}>
                  {CALL_LABEL[call]}
                </div>
              ) : null}
              {isWinner ? <div className="seat__tag seat__tag--won">획득 {wonPoints}</div> : null}
            </div>

            <div className="trickslot trickslot--combo" style={polar(index, ordered.length, 0.3)}>
              {cards.map((card) => (
                <TichuCard key={card} card={card} small disabled />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

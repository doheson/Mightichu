import { bidLabel } from '@mightichu/mighty';
import type { MightyView, PlayerId } from '../game/types.js';
import { CardBack, CardView } from './Card.js';

import { useSeatName } from './names.js';

export function Header({ view }: { readonly view: MightyView }): React.JSX.Element {
  const seatName = useSeatName();
  const contract = view.contract;
  return (
    <header className="header">
      <div className="header__item">
        <span className="label">단계</span>
        <strong>{phaseLabel(view.phase)}</strong>
      </div>
      <div className="header__item">
        <span className="label">계약</span>
        <strong>{contract === null ? '—' : bidLabel(contract)}</strong>
      </div>
      <div className="header__item">
        <span className="label">주공</span>
        <strong>{view.declarer === null ? '—' : seatName(view.declarer)}</strong>
      </div>
      <div className="header__item">
        <span className="label">프렌드</span>
        <strong>
          {view.friend !== null
            ? seatName(view.friend)
            : view.iAmFriend
              ? '나 (비공개)'
              : '비공개'}
        </strong>
      </div>
      <div className="header__item">
        <span className="label">트릭</span>
        <strong>{view.phase === 'PLAY' ? `${view.trickNo + 1} / 10` : '—'}</strong>
      </div>
    </header>
  );
}

function phaseLabel(phase: MightyView['phase']): string {
  switch (phase) {
    case 'MISDEAL':
      return '재딜 확인';
    case 'BIDDING':
      return '공약';
    case 'KITTY':
      return '바닥 처리';
    case 'FRIEND':
      return '프렌드 지정';
    case 'PLAY':
      return '플레이';
    case 'DONE':
      return '종료';
  }
}

/**
 * 원형 테이블.
 *
 * **나는 항상 하단 중앙**이고 거기서 **시계방향**으로 앉는다 — 마이티의 진행 방향과 일치시킨다.
 * 좌석 배열(`view.seats`)이 이미 시계방향이므로, 나를 맨 앞으로 회전시키기만 하면 된다.
 *
 * 화면 좌표는 y 가 아래로 향하므로 각도가 커질수록 시계방향이다.
 * 하단 중앙 = 90°, 5등분이니 72° 간격 → 90, 162, 234, 306, 18.
 * 시계 눈금으로 6시 → 7시 → 10시 → 2시 → 4시 순이 된다.
 */
const START_ANGLE = 90;
const RADIUS_X = 37;
const RADIUS_Y = 33;

function polar(index: number, count: number, scale: number): React.CSSProperties {
  const angle = ((START_ANGLE + (360 / count) * index) * Math.PI) / 180;
  return {
    left: `${50 + RADIUS_X * scale * Math.cos(angle)}%`,
    top: `${50 + RADIUS_Y * scale * Math.sin(angle)}%`,
  };
}

/** 나를 맨 앞으로 회전시킨 좌석 순서. 시계방향은 그대로 유지된다. */
function orderedFromMe(seats: readonly PlayerId[], me: PlayerId): readonly PlayerId[] {
  const start = seats.indexOf(me);
  if (start < 0) return seats;
  return seats.map((_, k) => seats[(start + k) % seats.length] as PlayerId);
}

export function Seats({ view }: { readonly view: MightyView }): React.JSX.Element {
  const seatName = useSeatName();
  const played = new Map(view.currentTrick.map((t) => [t.player, t.card]));
  const ordered = orderedFromMe(view.seats, view.me);
  const turn = nextToPlay(view);

  return (
    <div className="table">
      <div className="table__center">
        {view.phase === 'PLAY' ? (
          <>
            <span className="table__trickno">{view.trickNo + 1} / 10</span>
            <span className="table__hint">트릭</span>
          </>
        ) : (
          <span className="table__hint">{view.seats.length}인</span>
        )}
      </div>

      {ordered.map((seat, index) => {
        const card = played.get(seat);
        const isTurn =
          (view.phase === 'BIDDING' && view.currentBidder === seat) ||
          (view.phase === 'PLAY' && turn === seat);
        return (
          <div key={`seat-${seat}`}>
            <div
              className={[
                'seat',
                seat === view.me ? 'seat--me' : '',
                isTurn ? 'seat--turn' : '',
                view.passed.includes(seat) && view.phase === 'BIDDING' ? 'seat--passed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={polar(index, ordered.length, 1)}
            >
              <div className="seat__name">
                {seatName(seat)}
                {view.declarer === seat ? ' 👑' : ''}
                {view.friend === seat ? ' 🤝' : ''}
              </div>
              <div className="seat__meta">
                <CardBack count={view.handCounts[seat] ?? 0} />
                <span className="seat__points">{view.points[seat] ?? 0}점</span>
              </div>
              {view.passed.includes(seat) && view.phase === 'BIDDING' ? (
                <div className="seat__tag">패스</div>
              ) : null}
            </div>

            <div className="trickslot" style={polar(index, ordered.length, 0.44)}>
              {card === undefined ? null : <CardView card={card} small disabled />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 다음에 카드를 낼 사람 — 표시용 추정. 권위는 워커에 있다. */
function nextToPlay(view: MightyView): PlayerId | null {
  if (view.phase !== 'PLAY' || view.leader === null) return null;
  if (view.currentTrick.length === 0) return view.leader;
  const last = view.currentTrick[view.currentTrick.length - 1];
  if (last === undefined) return view.leader;
  const index = view.seats.indexOf(last.player);
  return view.seats[(index + 1) % view.seats.length] ?? null;
}

export function Log({ lines }: { readonly lines: readonly string[] }): React.JSX.Element {
  const recent = lines.slice(-40);
  return (
    <div className="log">
      <div className="log__title">진행</div>
      <ol className="log__list">
        {recent.map((line, i) => (
          <li key={`${i}-${line}`}>{line}</li>
        ))}
      </ol>
    </div>
  );
}

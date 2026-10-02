import { bidLabel } from '@mightichu/mighty';
import type { MightyView, PlayerId } from '../game/types.js';
import { CardBack, CardView } from './Card.js';

const SEAT_LABEL: Record<string, string> = {
  p1: '나',
  p2: '봇 2',
  p3: '봇 3',
  p4: '봇 4',
  p5: '봇 5',
};

export function seatName(player: PlayerId): string {
  return SEAT_LABEL[player] ?? player;
}

export function Header({ view }: { readonly view: MightyView }): React.JSX.Element {
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

export function Seats({ view }: { readonly view: MightyView }): React.JSX.Element {
  const played = new Map(view.currentTrick.map((t) => [t.player, t.card]));
  return (
    <div className="seats">
      {view.seats.map((seat) => {
        const card = played.get(seat);
        const isTurn =
          (view.phase === 'BIDDING' && view.currentBidder === seat) ||
          (view.phase === 'PLAY' && nextToPlay(view) === seat);
        return (
          <div
            key={seat}
            className={`seat ${seat === view.me ? 'seat--me' : ''} ${isTurn ? 'seat--turn' : ''}`}
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
            <div className="seat__card">
              {card === undefined ? (
                <span className="seat__empty">—</span>
              ) : (
                <CardView card={card} small disabled />
              )}
            </div>
            {view.passed.includes(seat) && view.phase === 'BIDDING' ? (
              <div className="seat__tag">패스</div>
            ) : null}
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

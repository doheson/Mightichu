/** 온라인 로비 — 방 만들기 / 코드로 입장 / 봇 채우기 / 시작. */

import { useState } from 'react';
import type { RoomInfo } from '@mightichu/protocol';
import type { PlayerId } from '../game/types.js';

export function JoinForm({
  connected,
  onJoin,
}: {
  readonly connected: boolean;
  readonly onJoin: (nickname: string, roomId?: string) => void;
}): React.JSX.Element {
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const name = nickname.trim();

  return (
    <div className="panel">
      <p className="panel__hint">
        {connected ? '방을 만들거나 코드로 입장하세요.' : '서버에 연결하는 중…'}
      </p>
      <div className="panel__row">
        <input
          className="input"
          placeholder="닉네임"
          maxLength={12}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
      </div>
      <div className="panel__row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!connected || name === ''}
          onClick={() => onJoin(name)}
        >
          방 만들기
        </button>
        <span className="panel__count">또는</span>
        <input
          className="input input--code"
          placeholder="방 코드"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button
          type="button"
          className="btn"
          disabled={!connected || name === '' || code.length < 4}
          onClick={() => onJoin(name, code)}
        >
          입장
        </button>
      </div>
    </div>
  );
}

export function RoomPanel({
  room,
  seat,
  onAddBot,
  onRemoveBot,
  onStart,
  onLeave,
}: {
  readonly room: RoomInfo;
  readonly seat: PlayerId | null;
  readonly onAddBot: () => void;
  readonly onRemoveBot: (seat: PlayerId) => void;
  readonly onStart: () => void;
  readonly onLeave: () => void;
}): React.JSX.Element {
  const isHost = seat !== null && room.hostSeat === seat;
  const free = room.requiredPlayers - room.members.length;

  return (
    <div className="panel">
      <div className="panel__row">
        <span className="label">방 코드</span>
        <strong className="roomcode">{room.roomId}</strong>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => void navigator.clipboard?.writeText(room.roomId)}
        >
          복사
        </button>
        <span className="panel__count">
          {room.members.length} / {room.requiredPlayers}명
        </span>
      </div>

      <ul className="members">
        {room.members.map((m) => (
          <li key={m.seat} className={m.seat === seat ? 'members__me' : ''}>
            <span className={`dot ${m.connected ? 'dot--on' : ''}`} />
            <span className="members__name">
              {m.nickname}
              {m.seat === room.hostSeat ? ' (방장)' : ''}
              {m.seat === seat ? ' — 나' : ''}
            </span>
            {m.isBot ? <span className="members__tag">봇</span> : null}
            {!m.connected && !m.isBot ? <span className="members__tag">끊김</span> : null}
            {isHost && m.isBot ? (
              <button
                type="button"
                className="btn btn--ghost btn--tiny"
                onClick={() => onRemoveBot(m.seat)}
              >
                빼기
              </button>
            ) : null}
          </li>
        ))}
        {Array.from({ length: Math.max(0, free) }, (_, i) => (
          <li key={`empty-${i}`} className="members__empty">
            <span className="dot" />
            <span className="members__name">빈 자리</span>
          </li>
        ))}
      </ul>

      <div className="panel__row">
        {isHost ? (
          <>
            <button type="button" className="btn" disabled={free <= 0} onClick={onAddBot}>
              봇 추가
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={free !== 0}
              onClick={onStart}
            >
              시작
            </button>
          </>
        ) : (
          <span className="panel__count">방장이 시작하기를 기다립니다…</span>
        )}
        <button type="button" className="btn btn--ghost" onClick={onLeave}>
          나가기
        </button>
      </div>
    </div>
  );
}

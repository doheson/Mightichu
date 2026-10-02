import { useMemo, useState } from 'react';
import { useGame } from './game/useGame.js';
import { useOnline } from './game/useOnline.js';
import type { PlayerId } from './game/types.js';
import { Board } from './ui/Board.js';
import { JoinForm, RoomPanel } from './ui/Lobby.js';
import { SeatNames } from './ui/names.js';

type Mode = 'menu' | 'ai' | 'online';

export default function App(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('menu');

  return (
    <main className="app">
      <div className="topbar">
        <h1 className="title">Mightichu</h1>
        <span className="subtitle">
          마이티 {mode === 'ai' ? '· AI 대전' : mode === 'online' ? '· 온라인' : ''}
        </span>
        {mode !== 'menu' ? (
          <button type="button" className="btn btn--ghost" onClick={() => setMode('menu')}>
            메뉴
          </button>
        ) : null}
      </div>

      {mode === 'menu' ? <Menu onPick={setMode} /> : null}
      {mode === 'ai' ? <AiMode /> : null}
      {mode === 'online' ? <OnlineMode /> : null}
    </main>
  );
}

function Menu({ onPick }: { readonly onPick: (mode: Mode) => void }): React.JSX.Element {
  return (
    <div className="panel">
      <p className="panel__hint">어떻게 플레이할까요?</p>
      <div className="panel__row">
        <button type="button" className="btn btn--primary" onClick={() => onPick('ai')}>
          AI 대전 (혼자)
        </button>
        <button type="button" className="btn" onClick={() => onPick('online')}>
          온라인 (친구와)
        </button>
      </div>
      <p className="panel__hint">
        AI 대전은 서버 없이 브라우저 안에서 돌아갑니다. 온라인은 방 코드를 공유해 함께합니다.
      </p>
    </div>
  );
}

const AI_NAMES: Record<string, string> = {
  p1: '나',
  p2: '봇 2',
  p3: '봇 3',
  p4: '봇 4',
  p5: '봇 5',
};

function AiMode(): React.JSX.Element {
  const { state, send, newGame } = useGame();
  const { view, legal, log, score, error } = state;

  if (view === null) return <p className="loading">딜 중…</p>;

  return (
    <SeatNames nameOf={(seat) => AI_NAMES[seat] ?? seat}>
      <Board
        view={view}
        legal={legal}
        log={log}
        score={score}
        error={error}
        send={send}
        onNext={() => newGame()}
        nextLabel="새 게임"
      />
    </SeatNames>
  );
}

function OnlineMode(): React.JSX.Element {
  const online = useOnline();
  const { state } = online;
  const { room, seat, view, connected, error } = state;

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of room?.members ?? []) {
      map.set(m.seat, m.seat === seat ? `${m.nickname} (나)` : m.nickname);
    }
    return (s: PlayerId): string => map.get(s) ?? s;
  }, [room, seat]);

  if (room === null) {
    return (
      <>
        {error !== null ? <div className="error">{error}</div> : null}
        <JoinForm connected={connected} onJoin={online.join} />
      </>
    );
  }

  const isHost = seat !== null && room.hostSeat === seat;

  return (
    <SeatNames nameOf={nameOf}>
      {!connected ? <div className="error">연결이 끊겼습니다. 다시 연결하는 중…</div> : null}
      {view === null || !room.started ? (
        <>
          {error !== null ? <div className="error">{error}</div> : null}
          <RoomPanel
            room={room}
            seat={seat}
            onAddBot={online.addBot}
            onRemoveBot={online.removeBot}
            onStart={online.start}
            onLeave={online.leave}
          />
        </>
      ) : (
        <Board
          view={view}
          legal={state.legal}
          log={state.log}
          score={state.score}
          error={error}
          send={online.send}
          onNext={isHost ? online.nextRound : null}
          nextLabel="다음 판"
        />
      )}
    </SeatNames>
  );
}

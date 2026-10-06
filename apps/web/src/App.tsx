import { useMemo, useState } from 'react';
import { useGame } from './game/useGame.js';
import { useOnline } from './game/useOnline.js';
import { GAMES, type GameId } from './game/registry.js';
import type { MightyAction, MightyView, PlayerId } from './game/types.js';
import type { TichuAction, TichuView } from './game/tichuTypes.js';
import { Board } from './ui/Board.js';
import { TichuBoard } from './ui/tichu/TichuBoard.js';
import { JoinForm, RoomPanel } from './ui/Lobby.js';
import { AccountPanel } from './ui/Account.js';
import { SeatNames } from './ui/names.js';

type Mode = 'menu' | 'ai' | 'online';

export default function App(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('menu');
  const [game, setGame] = useState<GameId>('mighty');

  return (
    <main className="app">
      <div className="topbar">
        <h1 className="title">Mightichu</h1>
        <span className="subtitle">
          {mode === 'menu'
            ? '마이티 · 티츄'
            : `${GAMES[game].label} · ${mode === 'ai' ? 'AI 대전' : '온라인'}`}
        </span>
        {mode !== 'menu' ? (
          <button type="button" className="btn btn--ghost" onClick={() => setMode('menu')}>
            메뉴
          </button>
        ) : null}
      </div>

      {mode === 'menu' ? (
        <Menu
          game={game}
          onPickGame={setGame}
          onPickMode={(m) => setMode(m)}
        />
      ) : null}
      {mode === 'ai' ? <AiMode game={game} /> : null}
      {mode === 'online' ? <OnlineMode game={game} /> : null}
    </main>
  );
}

function Menu({
  game,
  onPickGame,
  onPickMode,
}: {
  readonly game: GameId;
  readonly onPickGame: (game: GameId) => void;
  readonly onPickMode: (mode: Mode) => void;
}): React.JSX.Element {
  return (
    <div className="panel">
      <p className="panel__hint">게임을 고르세요.</p>
      <div className="gamepick">
        {(Object.keys(GAMES) as GameId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`gamecard ${game === id ? 'gamecard--on' : ''}`}
            onClick={() => onPickGame(id)}
          >
            <span className="gamecard__name">{GAMES[id].label}</span>
            <span className="gamecard__sub">{GAMES[id].subtitle}</span>
          </button>
        ))}
      </div>
      <div className="panel__row">
        <button type="button" className="btn btn--primary" onClick={() => onPickMode('ai')}>
          AI 대전 (혼자)
        </button>
        <button type="button" className="btn" onClick={() => onPickMode('online')}>
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

function AiMode({ game }: { readonly game: GameId }): React.JSX.Element {
  const { state, send, nextRound, newMatch } = useGame(game);
  const { view, legal, log, score, error, totals, history } = state;
  const target = GAMES[game].target;

  if (view === null) return <p className="loading">딜 중…</p>;

  // 1000점을 넘겼으면 다음 라운드가 아니라 새 매치를 시작한다
  const reached =
    target !== null && Object.values(totals).some((v) => v >= target);

  return (
    <SeatNames nameOf={(seat) => AI_NAMES[seat] ?? seat}>
      <GameBoard
        game={game}
        view={view}
        legal={legal}
        log={log}
        score={score}
        error={error}
        send={send}
        totals={totals}
        history={history}
        target={target}
        onNext={reached ? () => newMatch() : () => nextRound()}
        nextLabel={reached ? '새 매치' : '다음 판'}
      />
    </SeatNames>
  );
}

function OnlineMode({ game }: { readonly game: GameId }): React.JSX.Element {
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
        <AccountPanel
          account={state.account}
          error={state.authError}
          onRegister={online.register}
          onLogIn={online.logIn}
          onLogOut={online.logOut}
        />
        {error !== null ? <div className="error">{error}</div> : null}
        <JoinForm
          connected={connected}
          gameLabel={GAMES[game].label}
          fixedNickname={state.account?.nickname ?? null}
          onJoin={(nickname, roomId) => online.join(nickname, game, roomId)}
        />
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
        <GameBoard
          game={state.game}
          view={view}
          legal={state.legal}
          log={state.log}
          score={state.score}
          error={error}
          send={online.send}
          totals={state.totals}
          history={state.history}
          target={GAMES[state.game].target}
          onNext={isHost ? online.nextRound : null}
          nextLabel="다음 판"
        />
      )}
    </SeatNames>
  );
}

/** 게임별 보드 분기 — 여기 말고는 UI 가 게임을 구분하지 않는다. */
function GameBoard(props: {
  readonly game: GameId;
  readonly view: unknown;
  readonly legal: readonly unknown[];
  readonly log: readonly string[];
  readonly score: unknown;
  readonly error: string | null;
  readonly send: (action: unknown) => void;
  readonly onNext: (() => void) | null;
  readonly nextLabel: string;
  readonly totals: Readonly<Record<string, number>>;
  readonly history: readonly Readonly<Record<string, number>>[];
  readonly target: number | null;
}): React.JSX.Element {
  const common = {
    log: props.log,
    score: props.score as never,
    error: props.error,
    onNext: props.onNext,
    nextLabel: props.nextLabel,
  };
  if (props.game === 'tichu') {
    return (
      <TichuBoard
        {...common}
        view={props.view as TichuView}
        legal={props.legal as readonly TichuAction[]}
        send={props.send as (a: TichuAction) => void}
        totals={props.totals}
        history={props.history}
        target={props.target}
      />
    );
  }
  return (
    <Board
      {...common}
      view={props.view as MightyView}
      legal={props.legal as readonly MightyAction[]}
      send={props.send as (a: MightyAction) => void}
      totals={props.totals}
      history={props.history}
      target={props.target}
    />
  );
}

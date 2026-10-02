/** 티츄 단계별 조작 패널. */

import { beats, parseCards, sortHand, SPARROW } from '@mightichu/tichu';
import { useMemo, useState } from 'react';
import type { Card, PlayerId, TichuAction, TichuView } from '../../game/tichuTypes.js';
import { useSeatName } from '../names.js';
import { TichuCard } from './TichuCard.js';

interface PanelProps {
  readonly view: TichuView;
  readonly legal: readonly TichuAction[];
  readonly send: (action: TichuAction) => void;
}

function TichuCallButton({ legal, send }: PanelProps): React.JSX.Element | null {
  const call = legal.find((a) => a.type === 'DECLARE_TICHU');
  if (call === undefined) return null;
  return (
    <button type="button" className="btn btn--tichu" onClick={() => send(call)}>
      티츄 선언 (±100)
    </button>
  );
}

export function GrandPanel(props: PanelProps): React.JSX.Element {
  const { view, legal, send } = props;
  const grand = legal.find((a) => a.type === 'DECLARE_GRAND');
  const skip = legal.find((a) => a.type === 'PASS_GRAND');
  const waiting = grand === undefined && skip === undefined;

  return (
    <div className="panel">
      <p className="panel__hint">
        {waiting
          ? '다른 사람의 라지 티츄 결정을 기다립니다…'
          : '첫 8장입니다. 라지 티츄(±200)를 선언할지 정하세요. 나머지 6장은 그 다음에 받습니다.'}
      </p>
      <div className="hand">
        {sortHand(view.myHand).map((card) => (
          <TichuCard key={card} card={card} disabled />
        ))}
      </div>
      <div className="panel__row">
        {grand !== undefined ? (
          <button type="button" className="btn btn--grand" onClick={() => send(grand)}>
            라지 티츄! (±200)
          </button>
        ) : null}
        {skip !== undefined ? (
          <button type="button" className="btn" onClick={() => send(skip)}>
            넘기기
          </button>
        ) : null}
        <TichuCallButton {...props} />
      </div>
    </div>
  );
}

export function ExchangePanel(props: PanelProps): React.JSX.Element {
  const { view, legal, send } = props;
  const seatName = useSeatName();
  const [target, setTarget] = useState<PlayerId | null>(null);

  const gives = useMemo(
    () => legal.filter((a): a is Extract<TichuAction, { type: 'GIVE' }> => a.type === 'GIVE'),
    [legal],
  );
  const pending = view.givePending;
  const active = target !== null && pending.includes(target) ? target : (pending[0] ?? null);
  const giveable = new Set(gives.filter((a) => a.to === active).map((a) => a.card));

  if (pending.length === 0) {
    return (
      <div className="panel">
        <p className="panel__hint">
          교환을 끝냈습니다. 다른 사람들을 기다립니다… ({view.exchangeDone.length} / {view.seats.length})
        </p>
        {/* 기다리는 동안에도 손패는 보여준다 — 넘길 카드를 되짚어볼 수 있어야 한다 */}
        <div className="hand">
          {sortHand(view.myHand).map((card) => (
            <TichuCard key={card} card={card} disabled />
          ))}
        </div>
        <div className="panel__row">
          <TichuCallButton {...props} />
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <p className="panel__hint">
        세 사람에게 <strong>한 장씩</strong> 넘깁니다. 받을 사람을 고르고 카드를 누르세요.
      </p>
      <div className="chips">
        {pending.map((seat) => (
          <button
            key={seat}
            type="button"
            className={`chip ${active === seat ? 'chip--on' : ''}`}
            onClick={() => setTarget(seat)}
          >
            {seatName(seat)}
            {seat === view.partner ? ' 🤝' : ''}
          </button>
        ))}
      </div>
      <div className="hand">
        {sortHand(view.myHand).map((card) => (
          <TichuCard
            key={card}
            card={card}
            disabled={!giveable.has(card)}
            onClick={
              giveable.has(card) && active !== null
                ? () => send({ type: 'GIVE', to: active, card })
                : undefined
            }
          />
        ))}
      </div>
      <div className="panel__row">
        <span className="panel__count">남은 상대 {pending.length}명</span>
        <TichuCallButton {...props} />
      </div>
    </div>
  );
}

export function DragonPanel({ view, legal, send }: PanelProps): React.JSX.Element {
  const seatName = useSeatName();
  const gifts = legal.filter(
    (a): a is Extract<TichuAction, { type: 'GIVE_DRAGON' }> => a.type === 'GIVE_DRAGON',
  );
  if (gifts.length === 0) {
    return (
      <div className="panel">
        <p className="panel__hint">용으로 먹은 트릭을 넘기는 중입니다…</p>
      </div>
    );
  }
  return (
    <div className="panel">
      <p className="panel__hint">
        용으로 트릭을 먹었습니다 ({view.dragonGift?.points ?? 0}점).
        <strong> 상대팀 한 명에게 넘겨야 합니다.</strong>
      </p>
      <div className="chips">
        {gifts.map((gift) => (
          <button
            key={gift.to}
            type="button"
            className="chip"
            onClick={() => send(gift)}
          >
            {seatName(gift.to)} 에게
          </button>
        ))}
      </div>
    </div>
  );
}

const COMBO_LABEL: Record<string, string> = {
  SINGLE: '싱글',
  PAIR: '페어',
  TRIPLE: '트리플',
  FULL_HOUSE: '풀하우스',
  STAIRS: '계단',
  STRAIGHT: '스트레이트',
  BOMB_FOUR: '폭탄 (포카드)',
  BOMB_STRAIGHT: '폭탄 (스트레이트 플러시)',
  DOG: '개 — 파트너에게 리드를 넘깁니다',
};

export function PlayPanel(props: PanelProps): React.JSX.Element {
  const { view, legal, send } = props;
  const [picked, setPicked] = useState<readonly Card[]>([]);
  const [wish, setWish] = useState<number | null>(null);

  const pass = legal.find((a) => a.type === 'PASS');
  const canAct = legal.some((a) => a.type === 'PLAY');
  const myTurn = view.turn === view.me;

  // UI 가 룰을 다시 구현하지 않는다 — 엔진의 판정기를 그대로 쓴다
  const combo = useMemo(
    () => (picked.length === 0 ? null : parseCards(picked, view.currentCombo)),
    [picked, view.currentCombo],
  );
  const playable =
    combo !== null &&
    (view.currentCombo === null ? myTurn : beats(combo, view.currentCombo)) &&
    (myTurn || combo.type === 'BOMB_FOUR' || combo.type === 'BOMB_STRAIGHT');

  const toggle = (card: Card): void =>
    setPicked((prev) => (prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card]));

  const hasSparrow = picked.includes(SPARROW);

  const submit = (): void => {
    if (!playable) return;
    send(
      hasSparrow && wish !== null
        ? { type: 'PLAY', cards: picked, wish }
        : { type: 'PLAY', cards: picked },
    );
    setPicked([]);
    setWish(null);
  };

  return (
    <div className="panel">
      <p className="panel__hint">
        {view.currentCombo === null
          ? myTurn
            ? '리드입니다. 낼 조합을 고르세요.'
            : '다른 사람이 리드하는 중…'
          : `현재: ${COMBO_LABEL[view.currentCombo.type] ?? view.currentCombo.type} ${view.currentCombo.length}장`}
        {view.wish !== null ? ` · 소원 ${view.wish} 이행 의무` : ''}
        {!myTurn && canAct ? ' · 폭탄으로 끼어들 수 있습니다' : ''}
      </p>

      <div className="hand">
        {sortHand(view.myHand).map((card) => (
          <TichuCard
            key={card}
            card={card}
            selected={picked.includes(card)}
            onClick={() => toggle(card)}
          />
        ))}
      </div>

      <div className="panel__row">
        <span className={`combo ${combo === null ? 'combo--bad' : playable ? 'combo--ok' : 'combo--weak'}`}>
          {picked.length === 0
            ? '카드를 고르세요'
            : combo === null
              ? '유효한 조합이 아닙니다'
              : playable
                ? `${COMBO_LABEL[combo.type] ?? combo.type} · ${combo.length}장`
                : `${COMBO_LABEL[combo.type] ?? combo.type} — 이기지 못합니다`}
        </span>
        <button type="button" className="btn btn--primary" disabled={!playable} onClick={submit}>
          내기
        </button>
        {pass !== undefined ? (
          <button type="button" className="btn" onClick={() => send(pass)}>
            패스
          </button>
        ) : null}
        {picked.length > 0 ? (
          <button type="button" className="btn btn--ghost" onClick={() => setPicked([])}>
            선택 해제
          </button>
        ) : null}
        <TichuCallButton {...props} />
      </div>

      {hasSparrow ? (
        <div className="panel__row panel__row--variants">
          <span className="panel__count">참새 소원 (선택)</span>
          <select
            className="select"
            value={wish ?? ''}
            onChange={(e) => setWish(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">걸지 않음</option>
            {Array.from({ length: 13 }, (_, i) => i + 2).map((r) => (
              <option key={r} value={r}>
                {r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : r === 14 ? 'A' : r}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

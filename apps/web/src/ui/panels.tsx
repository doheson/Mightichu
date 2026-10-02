/** 단계별 조작 패널. 합법 수 목록에서 선택지를 만들어, UI 가 룰을 중복 구현하지 않는다. */

import { bidLabel, cardLabel, sortHand } from '@mightichu/mighty';
import { useMemo, useState } from 'react';
import type { Bid, Card, MightyAction, MightyView, Suit } from '../game/types.js';
import { CardView } from './Card.js';
import { seatName } from './Table.js';

interface PanelProps {
  readonly view: MightyView;
  readonly legal: readonly MightyAction[];
  readonly send: (action: MightyAction) => void;
}

export function MisdealPanel({ legal, send }: PanelProps): React.JSX.Element {
  const demand = legal.find((a) => a.type === 'DEMAND_MISDEAL');
  const decline = legal.find((a) => a.type === 'DECLINE_MISDEAL');
  return (
    <div className="panel">
      <p className="panel__hint">
        손패 가치가 ½점 이하입니다. 재딜(판 무효)을 요구할 수 있습니다.
      </p>
      <div className="panel__row">
        {demand !== undefined ? (
          <button type="button" className="btn btn--danger" onClick={() => send(demand)}>
            재딜 요구
          </button>
        ) : null}
        {decline !== undefined ? (
          <button type="button" className="btn" onClick={() => send(decline)}>
            그대로 진행
          </button>
        ) : null}
      </div>
    </div>
  );
}

const TRUMPS: readonly { value: Bid['trump']; label: string }[] = [
  { value: 'S', label: '♠' },
  { value: 'D', label: '♦' },
  { value: 'H', label: '♥' },
  { value: 'C', label: '♣' },
  { value: 'NT', label: '노기루다' },
];

export function BiddingPanel({ view, legal, send }: PanelProps): React.JSX.Element {
  const bids = useMemo(
    () => legal.flatMap((a) => (a.type === 'BID' ? [a.bid] : [])),
    [legal],
  );
  const pass = legal.find((a) => a.type === 'PASS');

  const [trump, setTrump] = useState<Bid['trump']>('S');
  const counts = useMemo(
    () => bids.filter((b) => b.trump === trump).map((b) => b.count).sort((a, b) => a - b),
    [bids, trump],
  );
  const [count, setCount] = useState<number | null>(null);
  const effectiveCount = count !== null && counts.includes(count) ? count : (counts[0] ?? null);

  const availableTrumps = TRUMPS.filter((t) => bids.some((b) => b.trump === t.value));

  return (
    <div className="panel">
      <p className="panel__hint">
        현재 최고 공약:{' '}
        <strong>
          {view.highestBid === null
            ? '없음'
            : `${bidLabel(view.highestBid.bid)} (${seatName(view.highestBid.player)})`}
        </strong>
      </p>
      <div className="panel__row">
        <div className="chips">
          {availableTrumps.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`chip ${trump === t.value ? 'chip--on' : ''}`}
              onClick={() => {
                setTrump(t.value);
                setCount(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          className="select"
          value={effectiveCount ?? ''}
          onChange={(e) => setCount(Number(e.target.value))}
          disabled={counts.length === 0}
        >
          {counts.map((c) => (
            <option key={c} value={c}>
              {c}장
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn--primary"
          disabled={effectiveCount === null}
          onClick={() => {
            if (effectiveCount === null) return;
            send({ type: 'BID', bid: { trump, count: effectiveCount } });
          }}
        >
          공약
        </button>
        {pass !== undefined ? (
          <button type="button" className="btn" onClick={() => send(pass)}>
            패스
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function KittyPanel({ view, legal, send }: PanelProps): React.JSX.Element {
  const [picked, setPicked] = useState<readonly Card[]>([]);
  const changes = useMemo(
    () => legal.flatMap((a) => (a.type === 'DISCARD' && a.changeTo !== undefined ? [a.changeTo] : [])),
    [legal],
  );
  const hand = sortHand(view.myHand);

  const toggle = (card: Card): void => {
    setPicked((prev) =>
      prev.includes(card) ? prev.filter((c) => c !== card) : prev.length < 3 ? [...prev, card] : prev,
    );
  };

  return (
    <div className="panel">
      <p className="panel__hint">
        바닥 3장을 받아 13장입니다. <strong>버릴 3장</strong>을 고르세요. 버린 점수카드는 여당 몫입니다.
      </p>
      <div className="hand">
        {hand.map((card) => (
          <CardView
            key={card}
            card={card}
            selected={picked.includes(card)}
            onClick={() => toggle(card)}
          />
        ))}
      </div>
      <div className="panel__row">
        <span className="panel__count">{picked.length} / 3 선택</span>
        <button
          type="button"
          className="btn btn--primary"
          disabled={picked.length !== 3}
          onClick={() => {
            send({ type: 'DISCARD', cards: picked });
            setPicked([]);
          }}
        >
          버리기
        </button>
      </div>

      {changes.length > 0 ? (
        <details className="details">
          <summary>기루다 변경 (공약 상향 필요)</summary>
          <div className="chips chips--wrap">
            {changes.map((bid) => (
              <button
                key={`${bid.trump}-${bid.count}`}
                type="button"
                className="chip"
                onClick={() => send({ type: 'DISCARD', cards: [], changeTo: bid })}
              >
                {bidLabel(bid)}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function FriendPanel({ legal, send }: PanelProps): React.JSX.Element {
  const calls = useMemo(
    () => legal.flatMap((a) => (a.type === 'CALL_FRIEND' ? [a.call] : [])),
    [legal],
  );
  const simple = calls.filter((c) => c.kind !== 'CARD');
  const cards = calls.flatMap((c) => (c.kind === 'CARD' ? [c.card] : []));
  const [showCards, setShowCards] = useState(false);

  const KIND_LABEL: Record<string, string> = {
    MIGHTY: '마이티 프렌드',
    JOKER: '조커 프렌드',
    FIRST_TRICK: '초구 프렌드',
    NONE: '노프렌드 (점수 2배)',
  };

  return (
    <div className="panel">
      <p className="panel__hint">프렌드를 지정하세요. 프렌드의 정체는 공개되지 않습니다.</p>
      <div className="chips chips--wrap">
        {simple.map((call) => (
          <button
            key={call.kind}
            type="button"
            className="chip"
            onClick={() => send({ type: 'CALL_FRIEND', call })}
          >
            {KIND_LABEL[call.kind] ?? call.kind}
          </button>
        ))}
        <button
          type="button"
          className={`chip ${showCards ? 'chip--on' : ''}`}
          onClick={() => setShowCards((v) => !v)}
        >
          카드 지명…
        </button>
      </div>
      {showCards ? (
        <div className="hand hand--wrap">
          {cards.map((card) => (
            <CardView
              key={card}
              card={card}
              small
              onClick={() => send({ type: 'CALL_FRIEND', call: { kind: 'CARD', card } })}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const SUIT_LABEL: Record<Suit, string> = { S: '♠', D: '♦', H: '♥', C: '♣' };

export function PlayPanel({ view, legal, send }: PanelProps): React.JSX.Element {
  /** 카드별 합법 액션. 변형이 여러 개면(조커 무늬 지정, 조커콜) 추가 선택을 띄운다. */
  const byCard = useMemo(() => {
    const map = new Map<Card, MightyAction[]>();
    for (const action of legal) {
      if (action.type !== 'PLAY_CARD') continue;
      const list = map.get(action.card) ?? [];
      list.push(action);
      map.set(action.card, list);
    }
    return map;
  }, [legal]);

  const [pending, setPending] = useState<Card | null>(null);
  const variants = pending === null ? [] : (byCard.get(pending) ?? []);
  const hand = sortHand(view.myHand);
  const myTurn = byCard.size > 0;

  return (
    <div className="panel">
      <p className="panel__hint">
        {myTurn ? '낼 카드를 고르세요. 낼 수 없는 카드는 흐리게 표시됩니다.' : '봇이 진행 중입니다…'}
      </p>
      <div className="hand">
        {hand.map((card) => {
          const actions = byCard.get(card);
          const playable = actions !== undefined && actions.length > 0;
          return (
            <CardView
              key={card}
              card={card}
              disabled={!playable}
              selected={pending === card}
              onClick={
                playable
                  ? () => {
                      if (actions.length === 1) {
                        send(actions[0] as MightyAction);
                        setPending(null);
                      } else {
                        setPending(card);
                      }
                    }
                  : undefined
              }
            />
          );
        })}
      </div>

      {variants.length > 1 ? (
        <div className="panel__row panel__row--variants">
          <span className="panel__count">{cardLabel(pending as Card)} —</span>
          {variants.map((action, i) => {
            if (action.type !== 'PLAY_CARD') return null;
            const label =
              action.nominate !== undefined
                ? `${SUIT_LABEL[action.nominate]} 지정`
                : action.callJoker === true
                  ? '조커콜 (조커 강제)'
                  : '그냥 내기';
            return (
              <button
                key={`${i}-${label}`}
                type="button"
                className="chip"
                onClick={() => {
                  send(action);
                  setPending(null);
                }}
              >
                {label}
              </button>
            );
          })}
          <button type="button" className="btn btn--ghost" onClick={() => setPending(null)}>
            취소
          </button>
        </div>
      ) : null}
    </div>
  );
}

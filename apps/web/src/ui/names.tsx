/** 좌석 이름. AI 모드는 "봇 2", 온라인은 방 멤버의 닉네임을 쓴다. */

import { createContext, useContext, type ReactNode } from 'react';
import type { PlayerId } from '../game/types.js';

const SeatNameContext = createContext<(seat: PlayerId) => string>((seat) => seat);

export function SeatNames({
  nameOf,
  children,
}: {
  readonly nameOf: (seat: PlayerId) => string;
  readonly children: ReactNode;
}): React.JSX.Element {
  return <SeatNameContext.Provider value={nameOf}>{children}</SeatNameContext.Provider>;
}

export function useSeatName(): (seat: PlayerId) => string {
  return useContext(SeatNameContext);
}

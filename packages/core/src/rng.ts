/**
 * 결정론적 난수.
 *
 * **`Math.random()` 사용 금지.** 이 프로젝트의 재현성 전체가 여기에 걸려 있다:
 *  - 버그 리포트가 `{ seed, actions[] }` 만으로 완전 재현
 *  - 리플레이 / 방 상태 복구 (전체 스냅샷 없이 몇 KB)
 *  - AI 평가: 고정 시드로 동일 대국 반복
 *
 * 규칙: **모든 무작위성은 `GameEngine.init` 안에서만 소비한다.**
 * 라운드 중간에 난수가 필요해지면 RNG 상태를 State 에 실어야 하므로(= JSON 제약과 충돌)
 * 그 설계는 피한다. 마이티·티츄 모두 무작위성은 초기 셔플뿐이라 문제 없음.
 */

export type Rng = () => number;

/** mulberry32 — 32bit 시드, 빠르고 분포가 충분하며 구현이 짧아 이식·검증이 쉽다. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 이상 max 미만의 정수. max <= 0 이면 0. */
export function randomInt(rng: Rng, max: number): number {
  if (max <= 0) return 0;
  return Math.floor(rng() * max) % max;
}

/** Fisher–Yates. 입력을 변경하지 않는다. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** 균등 선택. 빈 배열이면 undefined. */
export function pick<T>(items: readonly T[], rng: Rng): T | undefined {
  if (items.length === 0) return undefined;
  return items[randomInt(rng, items.length)];
}

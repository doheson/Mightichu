/**
 * 전 패키지 공용 기본 타입.
 *
 * 설계 불변식: State / Action / View 는 **전부 JSON 직렬화 가능**해야 한다.
 * (서버↔클라 전송, 리플레이 로그 영속화, 구조적 리댁션 검사가 모두 이에 의존)
 * Map / Set / Date / class 인스턴스 / 함수 / undefined 를 넣지 말 것.
 * 검증: {@link findNonJsonPath}
 */

export type PlayerId = string;

/** 결정론적 딜을 위한 시드. 같은 시드 + 같은 액션 로그 = 같은 게임. */
export type Seed = number;

export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };

/** 규칙 위반. 예외가 아니라 값으로 다룬다 — 서버가 클라 입력을 거부하는 정상 경로이므로. */
export interface RuleError {
  readonly code: string;
  readonly message: string;
  readonly detail?: Json;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RuleError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(
  code: string,
  message: string,
  detail?: Json,
): Result<T> {
  return {
    ok: false,
    error: detail === undefined ? { code, message } : { code, message, detail },
  };
}

export function isOk<T>(r: Result<T>): r is { ok: true; value: T } {
  return r.ok;
}

/** 실패를 예외로 승격. 테스트와 "절대 실패하지 않아야 하는" 호출부에서만 사용. */
export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  throw new Error(`[${r.error.code}] ${r.error.message}`);
}

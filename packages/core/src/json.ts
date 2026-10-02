/**
 * JSON 직렬화 가능성 검사.
 *
 * State/View 에 Map·Set·Date·undefined 가 섞여 들어가는 사고를
 * 타입이 아니라 테스트에서 잡는다. (TS 로 Json 제약을 강제하면
 * interface 가 index signature 에 할당 불가한 문제로 마찰이 커서 의도적으로 런타임 검사를 택함)
 */

/**
 * JSON 으로 표현 불가한 첫 값의 경로를 반환. 전부 정상이면 null.
 * 경로 예: `"hands.p2[0].rank"`
 */
export function findNonJsonPath(value: unknown, path = '$'): string | null {
  if (value === null) return null;

  switch (typeof value) {
    case 'boolean':
    case 'string':
      return null;
    case 'number':
      // NaN / Infinity 는 JSON.stringify 가 null 로 바꿔버린다 — 조용한 손실이므로 거부
      return Number.isFinite(value) ? null : path;
    case 'undefined':
    case 'function':
    case 'symbol':
    case 'bigint':
      return path;
    case 'object':
      break;
    default:
      return path;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findNonJsonPath(value[i], `${path}[${i}]`);
      if (found !== null) return found;
    }
    return null;
  }

  // 평범한 객체만 허용 (Map, Set, Date, 클래스 인스턴스 전부 거부)
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return path;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const found = findNonJsonPath(child, `${path}.${key}`);
    if (found !== null) return found;
  }
  return null;
}

export function isJsonSerializable(value: unknown): boolean {
  return findNonJsonPath(value) === null;
}

/** 테스트 헬퍼 — 위반 시 경로를 담아 던진다. */
export function assertJsonSerializable(value: unknown, label = 'value'): void {
  const bad = findNonJsonPath(value);
  if (bad !== null) {
    throw new Error(`${label} 가 JSON 직렬화 불가: ${bad}`);
  }
}

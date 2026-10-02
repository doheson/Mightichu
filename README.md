# Mightichu

마이티(5인)와 티츄(4인)를 담는 웹 기반 카드게임 플랫폼.
**멀티플레이(사람)** 와 **AI 대전** 두 모드를 지원하고, 웹으로 구현해 Capacitor로 감싸 앱 출시.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 프로젝트 설계 — 계약, 리댁션, 서버/DB, 구현 순서 |
| [docs/rules-mighty.md](docs/rules-mighty.md) | 마이티 규칙 (pagat 표준 기준 + 변형 체크리스트) |
| [docs/rules-tichu.md](docs/rules-tichu.md) | 티츄 규칙 (공식 룰북 기준) |

## 현재 상태

**3단계 완료** — AI 대전과 온라인 멀티플레이 모두 동작한다. 테스트 241개 통과.

```bash
pnpm --filter @mightichu/web dev        # http://localhost:5173
pnpm --filter @mightichu/server dev     # http://localhost:3001  (온라인 모드용)
```

| 패키지 | 상태 |
|---|---|
| `packages/core` | ✅ 계약, 결정론 RNG, 좌석/방향, 리플레이, JSON 검사 |
| `packages/mighty` | ✅ 룰 엔진 전체 (비딜·비딩·바닥·프렌드·10트릭·점수) |
| `packages/tichu` | ⬜ 4단계 |
| `packages/bots` | ✅ L1 랜덤 + L1.5 기본 봇 (제대로 된 L2 는 5단계) |
| `apps/web` | ✅ AI 모드(Web Worker) + 온라인 모드(Socket.IO) |
| `packages/protocol` | ✅ zod 스키마 — 서버·클라 공용 |
| `apps/server` | ✅ Socket.IO, 인메모리 방, 재접속, 봇 채우기 |

## 개발

```bash
pnpm install
pnpm test          # vitest (속성 테스트 포함)
pnpm typecheck     # tsc -b
```

## 지켜야 할 규약

`packages/core` 가 강제하는 네 가지. 룰 엔진을 추가할 때 전부 지켜야 한다.

1. **`Math.random()` 금지** — `createRng(seed)` 만 사용. 모든 무작위성은 `init` 에서만 소비.
   재현·리플레이·방 복구가 전부 여기에 걸려 있다.
2. **State / Action / View 는 JSON 직렬화 가능** — Map·Set·Date·클래스 인스턴스 금지.
   `findNonJsonPath()` 로 검사.
3. **`legalActions` 는 턴을 묻지 않는다** — 턴이 아닌 플레이어도 호출 가능.
   티츄의 폭탄(아웃 오브 턴)과 스몰 티츄 선언이 이걸로 흡수된다.
4. **`view()` 가 유일한 정보 유출 지점** — 남의 손패, 마이티 프렌드 정체,
   바닥/버린 카드, 티츄 교환 중 카드를 전부 제거. 구조적 전수 검사로 테스트.

`packages/core/test/contract.test.ts` 가 이 성질들의 속성 테스트 본보기다.
마이티·티츄 엔진도 같은 구조로 검증한다.

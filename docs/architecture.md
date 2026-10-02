# Mightichu 프로젝트 설계

> 마이티(5인)와 티츄(4인)를 담는 웹 기반 카드게임 플랫폼.
> **멀티플레이(사람)** 과 **AI 대전** 두 모드를 모두 지원.
> 웹으로 구현하고 Capacitor로 감싸 앱 출시.

관련 문서: [마이티 룰](rules-mighty.md) · [티츄 룰](rules-tichu.md)

---

## 1. 설계를 지배하는 제약 4가지

설계의 거의 모든 결정이 이 네 가지에서 파생된다.

### C1. 두 게임은 히든 정보 게임이다
남의 손패, 마이티의 숨은 프렌드, 티츄의 교환 전 카드 — 클라이언트를 신뢰할 수 없다.
→ **서버가 게임 상태의 유일한 권위.** 클라이언트는 **리댁션된 뷰**만 받는다.

### C2. 룰 엔진은 서버·클라이언트·AI 세 곳에서 똑같이 필요하다
- 서버: 권위 판정
- 클라이언트: "지금 낼 수 있는 카드" 즉시 표시 (불가능한 카드 회색 처리)
- AI: 합법 수 목록에서 선택

→ **언어 통일(TypeScript)** + **의존성 0의 순수 룰 엔진 패키지**.
   같은 코드가 Node, 브라우저, Web Worker에서 전부 돈다.

### C3. AI 모드는 서버가 필요 없다
룰 엔진이 순수 TS면 AI 모드는 **브라우저 안에서 완결**된다.
→ 오프라인 동작 → **App Store 4.2(Minimum Functionality) 통과 근거**가 공짜로 생긴다.
→ 서버 장애와 무관하게 항상 플레이 가능한 모드가 존재한다.

### C4. 티츄는 턴 순서를 깨는 액션이 둘 있다
**폭탄**(아웃 오브 턴)과 **스몰 티츄 선언**(남의 차례 중에도 가능).
→ 턴을 **루프로 모델링하면 안 된다.** 뒤에서 다루는 핵심 설계 포인트(§3).

---

## 2. 패키지 구조

```
Mightichu/
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ docs/
│  ├─ rules-mighty.md          ✅ 작성 완료
│  ├─ rules-tichu.md           ✅ 작성 완료
│  └─ architecture.md          ← 이 문서
├─ packages/
│  ├─ core/        @mightichu/core      게임 계약 + 시드 RNG + 공용 타입
│  ├─ mighty/      @mightichu/mighty    마이티 룰 엔진   (deps: core만)
│  ├─ tichu/       @mightichu/tichu     티츄 룰 엔진     (deps: core만)
│  ├─ bots/        @mightichu/bots      AI (뷰만 입력받음)
│  └─ protocol/    @mightichu/protocol  서버↔클라 메시지 스키마 (zod)
└─ apps/
   ├─ web/         React + Vite
   ├─ server/      Node + Socket.IO
   └─ mobile/      Capacitor            (6단계에서 추가)
```

### 의존성 방향 (단방향, 순환 금지)

```
core ← mighty ─┐
core ← tichu  ─┼→ bots
               └→ protocol → server
                           → web
```

**`packages/mighty`, `packages/tichu`는 런타임 의존성 0.**
Node도 DOM도 모른다. 순수 함수뿐. 이게 이 프로젝트의 핵심 자산이다.

---

## 3. 핵심 설계: 게임 계약 (`@mightichu/core`)

### 두 게임을 "억지로" 합치지 않는다

마이티와 티츄는 **카드 모델조차 다르다**(53장 vs 56장, 기루다 vs 특수카드 4종).
공통 `Card` 타입을 만들면 최소공배수 쓰레기가 된다.

→ **공유하는 것은 도메인 모델이 아니라 "계약의 모양"이다.**

```ts
// packages/core/src/engine.ts
export interface GameEngine<State, Action, View, Config> {
  /** 결정론적 초기화 — 같은 seed면 항상 같은 딜 */
  init(config: Config, players: PlayerId[], seed: number): State;

  /** 특정 플레이어가 "지금" 할 수 있는 모든 액션.
   *  현재 턴 보유자가 아니어도 호출 가능 — 폭탄/티츄 선언이 여기서 나온다. */
  legalActions(state: State, player: PlayerId): Action[];

  /** 액션 적용. 불법이면 실패를 반환(예외 아님). */
  apply(state: State, player: PlayerId, action: Action): Result<Applied<State>>;

  /** 리댁션 — 이 함수가 보안 경계다 (§4) */
  view(state: State, viewer: PlayerId): View;

  isOver(state: State): boolean;
  score(state: State): ScoreDelta[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: RuleError };

export interface Applied<S> {
  state: S;
  events: GameEvent[];   // 클라이언트 애니메이션/로그용
}
```

각 게임이 자기 타입으로 이 계약을 구현한다:

```ts
const mighty: GameEngine<MightyState, MightyAction, MightyView, MightyConfig>
const tichu:  GameEngine<TichuState,  TichuAction,  TichuView,  TichuConfig>
```

### 효과 1 — 서버가 게임을 모른다

서버는 `GameEngine`만 들고 있다. 액션 라우팅 + 뷰 전송만 한다.
**세 번째 게임을 추가해도 서버 코드는 한 줄도 안 바뀐다.**

### 효과 2 — C4(턴 깨는 액션) 문제가 사라진다

`legalActions(state, player)`를 **턴 보유자 여부와 무관하게** 정의한 게 핵심이다.

```ts
// 티츄: 내 차례가 아니어도 폭탄과 티츄 선언이 합법 수에 나타난다
legalActions(s, me) → [
  { type: 'BOMB', cards: [...] },        // 아웃 오브 턴
  { type: 'DECLARE_TICHU' },             // 첫 카드 안 냈으면 언제든
]
```

"턴 루프 + 인터럽트 예외처리"가 아니라 **"상태 → 합법 수 집합"** 으로 통일된다.
인터럽트라는 개념 자체가 필요 없어진다.

### 효과 3 — AI가 구조적으로 치팅할 수 없다

```ts
// packages/bots/src/types.ts
export type Bot<View, Action> = (view: View, legal: Action[]) => Action | Promise<Action>;
```

봇은 `State`가 아니라 **`View`만** 받는다. 숨은 정보에 **타입 레벨에서 접근 불가**.
"봇이 남의 패를 본다"는 버그가 컴파일되지 않는다.

### 효과 4 — 결정론으로 테스트·재현·리플레이가 공짜

`Math.random()` **금지**. 시드 PRNG만 사용.

```ts
// packages/core/src/rng.ts  — mulberry32
export function createRng(seed: number): () => number;
export function shuffle<T>(items: readonly T[], rng: () => number): T[];
```

얻는 것:
- 버그 리포트가 `{ seed, actions[] }` 두 줄로 완전 재현
- 리플레이 기능이 사실상 무료
- AI 평가: 고정 시드 10,000판 자동 대국

---

## 4. 상태 리댁션 — 가장 중요한 보안 경계

`view()`가 유일한 유출 지점이다. **1일차부터 넣는다.** 나중에 끼워넣으면 구조를 다 뜯는다.

### 숨겨야 하는 것

| 게임 | 숨길 대상 | 공개 시점 |
|---|---|---|
| 공통 | 다른 플레이어의 손패 | 끝까지 (장수만 공개) |
| 마이티 | **프렌드의 정체** | 지명 카드가 나오거나 점수 트릭을 먹을 때 |
| 마이티 | 바닥 3장 / 주공이 버린 3장 | 끝까지 (버린 점수는 여당 집계에만 반영) |
| 마이티 | 각자의 비딩 중 손패 | 끝까지 |
| 티츄 | 교환용 3장 | 전원이 넘긴 뒤 각자 받은 것만 |

### 검증 전략

리댁션 버그는 조용하고 치명적이다. 자동 테스트로 막는다.

```ts
// 구조적 불변식 테스트
test('뷰에 타인의 카드가 절대 직렬화되지 않는다', () => {
  const s = randomMidGameState(seed);
  for (const me of s.players) {
    const json = JSON.stringify(engine.view(s, me));
    for (const other of s.players.filter(p => p !== me)) {
      for (const card of s.hands[other]) {
        expect(json).not.toContain(cardId(card));   // 전수 검사
      }
    }
  }
});
```

---

## 5. 두 모드

### 모드 A — AI 대전 (서버 불필요)

```
브라우저
├─ UI (React)
└─ Web Worker
   ├─ GameEngine (권위 역할을 로컬에서 수행)
   └─ Bot × N   ← view만 받음
```

- **서버 통신 0.** 오프라인 완전 동작.
- Worker에 둬서 AI 탐색이 UI를 멈추지 않게 한다.
- 로컬에서도 `view()`를 거친다 → **같은 리댁션 경로를 공유** → UI가 숨은 정보를 받을 길이 없다.

### 모드 B — 멀티플레이 (서버 권위)

```
클라이언트                        서버
  Action 전송          ──→   legalActions 검증 → apply
  View 수신            ←──   플레이어별 view() 전송 (각자 다른 내용)
  낙관적 UI (로컬 엔진)       이벤트 로그 append
```

- 클라이언트도 룰 엔진을 갖고 있으므로 **낙관적 렌더링** 가능 → 체감 지연 0.
  서버 응답이 다르면 서버 쪽으로 되돌린다(서버가 항상 맞다).
- **사람이 부족한 자리는 서버 측 봇으로 채운다.** `bots` 패키지 그대로 재사용.

### 재접속 (모드 B 필수)

모바일은 끊긴다. 턴제라서 다행히 해결 가능.

- 방 상태는 서버 메모리에 유지, `playerId`로 재입장 허용
- 재입장 시 **전체 뷰 재전송**(델타 아님 — 단순함이 안전함보다 우선하지 않지만 여기선 둘 다 만족)
- 이벤트 로그가 있으니 끊긴 동안의 진행도 재생 가능
- 장시간 이탈 → 봇이 대리 플레이 (옵션, 나중)

### 동시성 — 폭탄 경쟁

두 명이 동시에 폭탄을 던질 수 있다. 처리:

1. 모든 액션에 **상태 버전(seq)** 을 실어 보낸다. 버전이 어긋난 액션은 거부 → 클라이언트가 재시도.
2. 3명 패스 후 트릭 수거 전 **짧은 폭탄 윈도우**(≈1.5s)를 서버가 연다.
3. Node 단일 스레드라 방 내부 액션 처리는 자연히 직렬화된다.

---

## 6. 기술 선택과 근거

| 영역 | 선택 | 근거 |
|---|---|---|
| 언어 | **TypeScript (strict)** | C2 — 룰 엔진 공유. 이것만으로 결정됨 |
| 패키지 | **pnpm workspaces** | 모노레포 최소 구성. Turborepo는 느려질 때 추가 |
| 클라이언트 | **React + Vite** | 생태계/애니메이션 라이브러리. Svelte가 더 가볍지만 이점이 결정적이지 않음 |
| 클라 상태 | **Zustand** | Redux는 이 규모에 과함 |
| 실시간 | **Socket.IO** | 재접속·폴백 내장. §5의 재접속 리스크를 라이브러리가 흡수. 턴제라 오버헤드 무의미 |
| 서버 | **Node + 인메모리 방** | 초기엔 DB 불필요 |
| 검증 | **zod** (`protocol`) | 서버·클라가 **같은 스키마**로 런타임 검증 |
| 테스트 | **Vitest + fast-check** | 아래 참조 |
| 애니메이션 | CSS transform 우선 | 카드게임에 무거운 엔진 불필요 |

### 속성 기반 테스트(fast-check)를 권하는 이유

카드게임은 **불변식이 명확**해서 속성 테스트가 유난히 잘 맞는다. 단위 테스트로는 못 잡는 조합 버그를 잡는다.

```
티츄  : 어떤 라운드든 양 팀 카드점수 합 = 100 (더블윈 제외)
티츄  : 56장이 손패 + 트릭 + 교환중 어딘가에 정확히 한 번 존재
마이티: 점수카드 20장이 항상 보존 (주공이 버린 3장 포함)
마이티: 여당 획득 + 야당 획득 = 20
공통  : legalActions가 빈 배열이면 게임이 진행 불가 상태가 아님
공통  : legalActions의 모든 원소는 apply가 반드시 성공
```

마지막 줄이 특히 강력하다 — `legalActions`와 `apply`의 **불일치**를 자동으로 잡아낸다.

### DB는 나중

초기: 인메모리. 필요해지는 시점에 추가.
- 계정·전적·랭킹이 필요해지면 → PostgreSQL
- 서버 다중화 시 → Redis (방 상태 공유 / Socket.IO 어댑터)

---

## 7. 서버와 DB

### 3단계까지는 둘 다 필요 없다

AI 모드가 클라이언트 완결형이라 **0~2단계는 정적 호스팅만으로 끝난다.** 비용 0, 프로비저닝 0.

| 단계 | 서버 | DB | 호스팅 |
|---|---|---|---|
| 0~2 (AI 모드) | 불필요 | 불필요 | 정적 — Cloudflare Pages (무료) |
| 3~5 (멀티) | Node 1대 | 인메모리 | Fly.io `nrt` (~$5/mo) |
| 계정·전적 | ↑ | PostgreSQL | Neon 무료 티어 |
| 서버 2대 이상 | ↑ | + Redis | 그때 판단 |

### 방(Room)이 동시성 단위

```
Map<RoomId, Room>
  Room = { engine, state, seed, actionLog[], sockets, bots }
```

Node 단일 스레드라 **한 방 안의 액션은 자연히 직렬화**된다. 락이 필요 없고,
폭탄 경쟁(두 명이 동시에 폭탄)도 도착 순서로 자동 해결된다.

### ⚠️ 상태를 브로드캐스트하면 안 된다

히든 정보 게임의 가장 흔한 사고 지점:

```ts
io.to(roomId).emit('state', state)          // ❌ 전원 동일 → 전체 손패 유출
for (const [pid, sock] of room.sockets)     // ✅ 플레이어별 리댁션
  sock.emit('view', engine.view(state, pid))
```

공개 이벤트(`GameEvent` 중 `visibleTo` 없는 것)만 브로드캐스트한다.
상태는 **항상 개별 전송**.

### 영속성: 결정론이 문제를 녹인다

서버 재배포 시 인메모리 상태가 날아간다. 티츄는 1000점까지 30~60분이라 실제로 아프다.

그런데 모든 무작위성이 `init` 의 시드 셔플에만 있으므로, 방 하나를 저장하는 데
필요한 건 `RoundLog` 뿐이다 — **몇 KB**:

```ts
{ game: 'tichu', config, players, seed: 48271, actions: [...] }
```

복구는 `replayRound()` 로 끝. 전체 상태 스냅샷도, 트릭별 기록도 불필요.
(0단계에 이미 구현됨)

### 재접속

모바일은 끊긴다. 턴제라 해결 가능.

- 방 상태는 서버 메모리에 유지, `playerId` 로 재입장 허용
- 재입장 시 **전체 뷰 재전송** (델타 아님 — 단순함이 버그를 줄인다)
- 장시간 이탈 시 봇 대리 플레이 (옵션, 나중)

### 동시성 — 낙관적 제어

- 모든 액션에 **상태 버전(seq)** 을 실어 보낸다. 어긋나면 거부 → 클라 재시도
- 3명 패스 후 트릭 수거 전 **짧은 폭탄 윈도우**(≈1.5s)를 서버가 연다

### 서버 측 봇

L1/L2 휴리스틱은 마이크로초라 같은 프로세스에서 돌려도 된다.
L3 MCTS 를 넣으면 **이벤트 루프를 막으므로** 그때 `worker_threads` 로 옮긴다. 지금 할 일 아님.

### DB 스키마 — 역시 작다

트릭 단위 기록이 불필요하므로:

```sql
users         (id, nickname, created_at)
matches       (id, game, config jsonb, seed, action_log jsonb, started_at, ended_at)
match_players (match_id, user_id, seat, score_delta)
```

`matches` 한 행으로 **그 판 전체를 리플레이**할 수 있다.

### 호스팅 근거

핵심 제약: **WebSocket 은 상시 연결이라 서버리스(Vercel/Netlify Functions)로 안 된다.**

Fly.io 를 고른 이유는 WS 처리가 좋고 저렴하며 운영 부담이 적어서다.
Tokyo(`nrt`)는 서울에서 35~40ms 인데 턴제라 체감 차이가 없다 — 여기에 비용·복잡도를 쓸 이유가 없다.

> Cloudflare Durable Objects 는 "방 하나 = 객체 하나"가 개념적으로 완벽히 맞는다.
> 다만 벤더 종속과 다른 프로그래밍 모델이 따라오니, 규모가 커진 뒤 재검토할 선택지로 남긴다.

## 8. AI 설계

### 레벨 단계

| 레벨 | 방식 | 목적 | 시점 |
|---|---|---|---|
| **L1** | 합법 수 중 랜덤 | 엔진 검증용 베이스라인. **가장 먼저 필요** | 2단계 |
| **L2** | 휴리스틱 (규칙 기반) | **실제로 재미있는 수준.** 출시 목표 | 5단계 |
| **L3** | MCTS + 결정화(determinization) | 강한 AI | 나중 |

L1을 먼저 만드는 건 AI가 목적이 아니라 **엔진 테스트 하네스**이기 때문이다.
랜덤 봇끼리 10,000판 돌리면 룰 엔진 크래시·불변식 위반이 전부 드러난다.

### 게임별 난점

**마이티**
- **비딩이 판단 문제** — 손패 가치 평가 함수가 필요(룰 문서의 비딜 점수 공식이 출발점)
- **숨은 프렌드 추론** — 누가 아군인지 플레이에서 역추론. 야당 AI의 핵심
- 트릭 플레이 자체는 표준 트릭테이킹이라 상대적으로 쉬움

**티츄**
- **핸드 분할 문제** — 14장을 어떤 조합들로 쪼갤지. 조합 폭발. L2의 최대 난관
- 폭탄 타이밍, 봉황 사용 시점
- 파트너 지원 (티츄 선언을 밀어줄지)

L3의 히든 정보 처리는 **PIMC(Perfect Information Monte Carlo)** — 남의 패를 여러 번 무작위 가정하고 각각 완전정보로 풀어 평균. 구현 난도가 급증하므로 별도 과제로 분리.

---

## 9. 구현 순서

**원칙: 각 단계가 끝나면 "직접 플레이해볼 수 있는 것"이 나온다.**

### 0단계 — 기반
- pnpm 모노레포, tsconfig, Vitest
- `core`: `GameEngine` 계약, 시드 RNG, `Result`, 이벤트 타입
- ⚠️ 계약은 **티츄의 어려운 케이스(폭탄 아웃오브턴, 봉황 와일드카드)를 기준으로** 설계한다.
  마이티만 보고 설계하면 4단계에서 계약을 다시 뜯는다.

### 1단계 — 마이티 룰 엔진
- 왜 마이티 먼저: 트릭테이킹이라 **티츄보다 훨씬 단순**. 첫 수직 슬라이스의 리스크를 낮춘다
- 선행 작업: **룰 변형 체크리스트 확정** ([rules-mighty.md](rules-mighty.md) §7)
- 산출: `legalActions`/`apply`/`view`/`score` 완비 + 단위·속성 테스트

### 2단계 — AI 모드 (서버 없이 플레이 가능)
- L1 랜덤 봇 + Web Worker 연결
- 최소 UI (카드 렌더, 손패, 트릭, 비딩/프렌드 지정)
- ✅ **이 시점에 마이티를 혼자 끝까지 플레이할 수 있다**
- 랜덤 봇 대량 자동 대국으로 엔진 검증

### 3단계 — 서버 + 멀티플레이
- `protocol`(zod), Socket.IO, 방/로비, 재접속, 빈자리 봇 채우기
- ✅ **사람끼리 마이티 플레이 가능**

### 4단계 — 티츄 룰 엔진
- 0단계 계약이 제대로면 서버·UI 변경 최소
- 가장 복잡한 부분: 조합 인식, 봉황 와일드, 참새 소원 이행 가능 판정
- ✅ **두 게임 모두 멀티·AI 양 모드로 플레이 가능**

### 5단계 — L2 휴리스틱 AI
- 여기까지가 "재미있는 게임"의 최소선

### 6단계 — Capacitor + 스토어
- 푸시 알림(턴 알림), 오프라인 AI 모드, 화면 켜짐 유지, 햅틱
- 4.2 대응: 웹 자산 **번들**(원격 URL 로딩 금지) + 위 네이티브 기능을 코어 루프에 연결

---

## 10. 확정이 필요한 사항

| # | 항목 | 권장안 |
|---|---|---|
| 1 | 마이티 룰 변형 ([체크리스트](rules-mighty.md) §7) | pagat 표준 그대로 시작 |
| 2 | 구현 순서 (마이티 먼저 vs 티츄 먼저) | **마이티 먼저** (단순해서 리스크 낮음) |
| 3 | 계정 체계 | 1차는 **게스트(닉네임)만**, 전적 저장 없음 → DB 불필요 |
| 4 | 언어 | 한국어 전용으로 시작, i18n 구조만 열어둠 |
| 5 | 클라이언트 프레임워크 | React + Vite |
| 6 | 마이티 조커콜 용어 | 코드 `JOKER_CALL`, UI "조커콜" |

---

## 11. 알려진 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| **티츄 조합 판정 버그** | 치명 — 게임이 깨짐 | 속성 테스트 + 랜덤 봇 대량 대국 |
| **리댁션 누락** | 치명 — 치팅 가능 | §4 구조적 전수 검사 테스트 |
| **0단계 계약 오설계** | 4단계에서 대규모 재작업 | 계약을 티츄 기준으로 먼저 설계 |
| **L2 AI가 약해서 재미없음** | 제품 실패 | 5단계에 충분한 시간 배정. L1으로는 출시 불가 |
| **마이티 5인 모집 실패** | 멀티 모드 공전 | 봇 채우기를 3단계에 포함(나중 아님) |
| **App Store 4.2 거절** | 앱 출시 지연 | 6단계에서 네이티브 기능을 코어 루프에 연결 |

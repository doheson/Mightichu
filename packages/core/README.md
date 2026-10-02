# @mightichu/core

게임 계약과 결정론 기반 유틸리티. **런타임 의존성 0** — Node도 DOM도 모른다.

| 모듈 | 역할 |
|---|---|
| `engine.ts` | `GameEngine` 계약 — 프로젝트의 척추 |
| `bot.ts` | `Bot` 계약 — 봇은 `View` 만 받아 구조적으로 치팅 불가 |
| `rng.ts` | 시드 RNG (mulberry32), 셔플 — `Math.random()` 대체 |
| `seating.ts` | 좌석과 진행 방향 (마이티 cw / 티츄 ccw), 마주 앉은 파트너 |
| `replay.ts` | 액션 로그와 `replayRound()` — 방 복구·전적·버그 재현 |
| `json.ts` | JSON 직렬화 가능성 검사 (위반 경로 보고) |
| `types.ts` | `Result`, `RuleError`, `PlayerId`, `Seed`, `Json` |

## 왜 도메인 모델을 공유하지 않는가

마이티와 티츄는 카드 모델부터 다르다(53장/기루다 vs 56장/특수카드 4종).
공통 `Card` 타입을 만들면 최소공배수 쓰레기가 된다.

공유하는 것은 **계약의 모양**뿐이고, 각 게임이 자기 타입으로 구현한다:

```ts
const mighty: GameEngine<MightyState, MightyAction, MightyView, MightyConfig>
const tichu:  GameEngine<TichuState,  TichuAction,  TichuView,  TichuConfig>
```

덕분에 서버는 게임을 모른다 — `GameEngine` 만 들고 라우팅한다.

## test/fixture-engine.ts

계약 검증용 최소 게임 "미니". 실제 게임이 아니라
`GameEngine` 이 구현 가능한지와 속성 테스트가 작동하는지 확인하는 하네스다.
마이티 엔진을 쓸 때 `test/contract.test.ts` 의 구조를 그대로 복사해 쓴다.

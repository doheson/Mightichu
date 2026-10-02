# @mightichu/web

마이티 AI 대전 — **서버 없이 브라우저에서 완결**된다.

```bash
pnpm --filter @mightichu/web dev     # http://localhost:5173
```

## 구조

```
UI (React)  ──Action──▶  Web Worker
            ◀──View───   ├ mightyEngine  (권위)
                         └ 기본 봇 × 4   (View 만 입력)
```

`src/game/worker.ts` 가 **게임 상태의 권위**다. 전체 손패는 워커 안에만 있고,
UI 로는 `mightyEngine.view()` 를 거친 리댁션된 뷰만 나간다.
봇도 같은 `view()` 를 거치므로 로컬 대국에서도 치팅 경로가 존재하지 않는다.

AI 탐색이 무거워져도(L3 MCTS) UI 가 멈추지 않도록 워커에 둔다.

## 왜 AI 모드를 먼저 만드는가

1. **서버가 필요 없다** → 정적 호스팅만으로 배포. 0단계부터 비용 0
2. **오프라인 동작** → App Store 4.2(Minimum Functionality) 통과 근거
3. **서버 설계를 미리 검증한다** — `src/game/protocol.ts` 의 UI↔워커 계약은
   3단계에서 워커를 서버로 바꿔도 그대로다. 메시지 경계가 같기 때문

## UI 가 룰을 중복 구현하지 않는다

모든 선택지는 엔진의 `legalActions` 에서 만든다.

- 낼 수 없는 카드는 자동으로 흐려진다 (첫 트릭 기루다 리드 금지, 팔로우 의무, 조커 제한…)
- 기루다 변경 버튼은 요구 공약을 만족하는 것만 나온다
- 한 카드에 변형이 여럿이면(조커 무늬 지정, 조커콜) 추가 선택을 띄운다

덕분에 룰이 바뀌어도 UI 는 대부분 손댈 필요가 없다.

## 파일

| 경로 | 역할 |
|---|---|
| `src/game/worker.ts` | 권위 — 엔진 + 봇 구동, 이벤트를 한국어 로그로 |
| `src/game/protocol.ts` | UI ↔ 워커 메시지 계약 |
| `src/game/useGame.ts` | 워커를 감싼 React 훅 |
| `src/ui/Card.tsx` | 카드 렌더 |
| `src/ui/Table.tsx` | 헤더 · 좌석 · 로그 |
| `src/ui/panels.tsx` | 단계별 조작 패널 |

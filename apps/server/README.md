# @mightichu/server

멀티플레이 서버 — Node + Socket.IO, 인메모리 방.

```bash
pnpm --filter @mightichu/server dev     # :3001
curl localhost:3001/health
```

## ⚠️ 상태를 브로드캐스트하지 않는다

히든 정보 게임의 가장 흔한 사고 지점이다.

```ts
io.to(roomId).emit('state', state)        // ❌ 전원 동일 → 전체 손패 유출
for (const member of room.members)        // ✅ 플레이어별 리댁션
  io.to(member.socketId).emit(CHANNEL.server, { type:'VIEW', view: room.viewFor(member.seat), ... })
```

공개 정보(방 구성)만 브로드캐스트한다. `sendViews()` 가 서버 쪽 리댁션 경계다.
`test/e2e.test.ts` 가 "두 사람이 와이어로 받은 뷰에 서로의 카드가 없는지" 를 검증한다.

## 방이 동시성 단위

Node 단일 스레드라 한 방 안의 액션은 자연히 직렬화된다 — 락이 없다.
낡은 입력은 액션에 실린 `seq`(상태 버전)로 거른다(낙관적 동시성).

## 서버는 게임을 모른다

`games.ts` 의 레지스트리에서 `GameEngine` 만 꺼내 라우팅한다.
티츄를 넣을 때 바뀌는 건 레지스트리 한 줄뿐이다.

## 재접속

모바일은 끊긴다. 턴제라 해결 가능하다.

- 클라가 `token` 을 localStorage 에 보관하고 입장 시 보낸다
- 같은 토큰이면 같은 자리로 복귀
- 시작 **전** 연결이 끊기면 자리를 비우고, 시작 **후**엔 자리를 지킨다
- 복귀 시 **전체 뷰 재전송** (델타 아님 — 단순함이 버그를 줄인다)

## 영속성 (아직 미사용)

결정론 덕분에 방 하나가 `{ seed, actions[] }` 몇 KB다 (`room.roundLog`).
서버 재배포 복구나 전적 저장이 필요해지면 이걸 저장하고 `replayRound()` 로 복원한다.
전체 상태 스냅샷도 트릭별 기록도 필요 없다.

## 파일

| 경로 | 역할 |
|---|---|
| `src/app.ts` | 소켓 핸들러 — 리댁션 전송 경계 |
| `src/index.ts` | 부팅 진입점 |
| `src/room.ts` | 한 방의 상태와 전이, 봇 구동 |
| `src/rooms.ts` | 방 레지스트리, 유휴 방 정리 |
| `src/games.ts` | 게임 레지스트리 |
| `src/describe.ts` | 이벤트 → 한국어 로그 |

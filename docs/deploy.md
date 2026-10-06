# 배포

```
웹    Cloudflare Pages (정적, 무료)
서버  Fly.io 도쿄(nrt)  ~$5/mo
DB    SQLite 파일 — Fly 볼륨에 올린다
```

## 왜 이 조합인가

**WebSocket 은 상시 연결이라 서버리스로 못 간다.** Vercel/Netlify Functions 는
온라인 모드를 돌릴 수 없다. 실제 프로세스가 필요하다.

AI 모드는 서버가 없어도 돌아가므로 **웹만 올려도 게임이 된다.**
온라인 모드를 쓸 때만 서버가 필요하다.

도쿄를 쓰는 이유: 서울에서 35~40ms 인데 **턴제라 체감 차이가 없다.**
여기에 비용이나 복잡도를 더 쓸 이유가 없다.

---

## 1. 웹 — Cloudflare Pages

Pages 프로젝트를 만들고 아래로 설정한다.

| 항목 | 값 |
|---|---|
| Build command | `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @mightichu/web build` |
| Build output | `apps/web/dist` |
| Root directory | (비움 — 저장소 루트) |
| Node version | `24` 이상 |

환경변수:

```
VITE_SERVER_URL = https://<앱이름>.fly.dev
```

> 서버를 올리기 전이라면 비워둬도 된다. 그러면 온라인 모드만 안 되고
> AI 모드는 정상 동작한다.

## 2. 서버 — Fly.io

**이 부분은 직접 하셔야 합니다** — Fly 계정과 CLI 인증이 필요합니다.

```bash
brew install flyctl
fly auth login
```

저장소 루트에서:

```bash
fly launch --no-deploy --copy-config --config apps/server/fly.toml
```

`app` 이름이 이미 쓰이고 있으면 `fly.toml` 의 `app` 을 바꾼다.

계정·세션이 재배포에도 남아야 하므로 볼륨을 만든다:

```bash
fly volumes create mightichu_data --region nrt --size 1
```

CORS 를 Pages 도메인으로 좁힌다 (`*` 로 두면 아무 사이트나 붙을 수 있다):

```bash
fly secrets set CORS_ORIGIN=https://<프로젝트>.pages.dev
```

배포:

```bash
fly deploy --config apps/server/fly.toml --dockerfile apps/server/Dockerfile
```

확인:

```bash
curl https://<앱이름>.fly.dev/health
```

## ⚠️ 인스턴스는 하나로 둔다

지금 구조는 **단일 인스턴스 전제**다.

- 방 상태가 **서버 메모리**에 있다 → 여러 대면 방이 갈라진다
- 계정 DB 가 **볼륨의 SQLite** 다 → 여러 대가 같은 파일을 쓸 수 없다

`fly.toml` 에 `auto_stop_machines = false`, `min_machines_running = 1` 로 박아뒀다.
상시 연결이라 0 대로 줄면 접속이 끊긴다.

늘려야 할 만큼 커지면 순서는 이렇다:

1. 계정 DB 를 **Postgres** 로 (Neon 무료 티어). 스키마가 작아 옮기기 쉽다
2. 방 상태를 **Redis** 로 (Socket.IO 어댑터 + 방 소유권)

결정론 덕분에 방 하나가 `{seed, actions[]}` 몇 KB라 Redis 이전도 가볍다.

## 재배포와 데이터

- **계정·세션**: 볼륨에 있어 살아남는다
- **진행 중인 방**: 메모리라 날아간다. 티츄는 1000점까지 30~60분이라 아프다.
  필요해지면 `Room.roundLog` 를 저장하고 `replayRound()` 로 복구한다 — 몇 KB면 된다

## 로컬에서 프로덕션 빌드 확인

```bash
pnpm --filter @mightichu/web build && pnpm --filter @mightichu/web preview
```

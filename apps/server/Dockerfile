# syntax=docker/dockerfile:1

# Node 25 를 쓰는 이유: SQLite 를 **내장 node:sqlite** 로 쓴다.
# 네이티브 빌드가 없으므로 이미지가 작고 빌드가 빠르다.
FROM node:25-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

WORKDIR /app

# 워크스페이스 전체가 필요하다 — 서버가 packages/* 를 소스로 참조한다
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server

RUN pnpm install --frozen-lockfile --filter @mightichu/server...

# SQLite 파일은 볼륨에 둔다 (재배포해도 계정이 남아야 한다)
ENV DB_FILE=/data/mightichu.db
ENV PORT=3001
EXPOSE 3001

# 헬스체크는 서버가 이미 제공한다
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:3001/health || exit 1

WORKDIR /app/apps/server
CMD ["pnpm", "start"]

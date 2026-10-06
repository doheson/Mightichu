/**
 * 스키마와 마이그레이션.
 *
 * SQLite 로 시작하되 **Postgres 로 옮길 수 있게** 특수 기능을 쓰지 않는다.
 * 타입은 TEXT/INTEGER 만, 시간은 epoch ms 정수로 둔다.
 */

import type { DatabaseSync } from 'node:sqlite';

/** 마이그레이션은 순서대로 한 번씩만 적용된다. 기존 항목을 고치지 말고 뒤에 추가할 것. */
const MIGRATIONS: readonly { readonly name: string; readonly sql: string }[] = [
  {
    name: '001_accounts',
    sql: `
      CREATE TABLE users (
        id          TEXT PRIMARY KEY,
        nickname    TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );

      -- 인증 수단은 user 와 분리한다. 소셜 로그인을 나중에 붙이려면
      -- 한 계정이 여러 수단을 가질 수 있어야 한다(이메일 + 구글 + 애플…).
      CREATE TABLE credentials (
        user_id     TEXT NOT NULL REFERENCES users(id),
        provider    TEXT NOT NULL,   -- 'password' | 'google' | 'kakao' | 'apple'
        identifier  TEXT NOT NULL,   -- 이메일 또는 제공자 고유 id
        secret      TEXT,            -- password 일 때만: scrypt 해시. 소셜은 null
        created_at  INTEGER NOT NULL,
        PRIMARY KEY (provider, identifier)
      );
      CREATE INDEX credentials_user ON credentials(user_id);

      CREATE TABLE sessions (
        token       TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id),
        created_at  INTEGER NOT NULL,
        expires_at  INTEGER NOT NULL
      );
      CREATE INDEX sessions_user ON sessions(user_id);
    `,
  },
  {
    name: '002_matches',
    sql: `
      -- 결정론 덕분에 한 판이 {seed, actions} 로 끝난다.
      -- 트릭별 기록이 필요 없어 테이블이 작다.
      CREATE TABLE matches (
        id          TEXT PRIMARY KEY,
        game        TEXT NOT NULL,
        config      TEXT NOT NULL,
        seed        INTEGER NOT NULL,
        action_log  TEXT NOT NULL,
        started_at  INTEGER NOT NULL,
        ended_at    INTEGER
      );

      CREATE TABLE match_players (
        match_id    TEXT NOT NULL REFERENCES matches(id),
        user_id     TEXT,            -- 게스트는 null
        seat        TEXT NOT NULL,
        nickname    TEXT NOT NULL,
        score_delta INTEGER NOT NULL,
        PRIMARY KEY (match_id, seat)
      );
      CREATE INDEX match_players_user ON match_players(user_id);
    `,
  },
];

export function migrate(db: DatabaseSync): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL
  )`);

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );

  const ran: string[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
        migration.name,
        Date.now(),
      );
      db.exec('COMMIT');
      ran.push(migration.name);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return ran;
}

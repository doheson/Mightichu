/**
 * 계정과 세션.
 *
 * 지금은 이메일+비밀번호만 쓰지만 `credentials.provider` 로 분리해 두어
 * 소셜 로그인은 **행 하나 추가**로 붙는다 — 계정 모델을 다시 짤 필요가 없다.
 *
 * 비밀번호는 `node:crypto` 의 scrypt 로 해시한다(의존성 0).
 * 평문은 어디에도 남기지 않는다.
 */

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Db } from './index.js';

export const PASSWORD_PROVIDER = 'password';
const SCRYPT_KEYLEN = 64;
const SESSION_DAYS = 90;

export interface User {
  readonly id: string;
  readonly nickname: string;
}

export type AuthError = { readonly code: string; readonly message: string };

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || salt === undefined || hash === undefined) return false;
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  // 길이가 같을 때만 비교해야 timingSafeEqual 이 던지지 않는다
  return timingSafeEqual(candidate, expected);
}

/** 이메일은 대소문자를 구분하지 않는다. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createSession(db: Db, userId: string): string {
  const token = randomBytes(24).toString('hex');
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(token, userId, now, now + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return token;
}

export function register(
  db: Db,
  email: string,
  password: string,
  nickname: string,
): { user: User; token: string } | AuthError {
  const id = normalizeEmail(email);
  const existing = db
    .prepare('SELECT user_id FROM credentials WHERE provider = ? AND identifier = ?')
    .get(PASSWORD_PROVIDER, id);
  if (existing !== undefined) {
    return { code: 'EMAIL_TAKEN', message: '이미 가입된 이메일입니다.' };
  }

  const userId = randomUUID();
  const now = Date.now();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO users (id, nickname, created_at) VALUES (?, ?, ?)').run(
      userId,
      nickname,
      now,
    );
    db.prepare(
      'INSERT INTO credentials (user_id, provider, identifier, secret, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(userId, PASSWORD_PROVIDER, id, hashPassword(password), now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { user: { id: userId, nickname }, token: createSession(db, userId) };
}

export function login(
  db: Db,
  email: string,
  password: string,
): { user: User; token: string } | AuthError {
  const row = db
    .prepare(
      `SELECT c.user_id AS userId, c.secret AS secret, u.nickname AS nickname
       FROM credentials c JOIN users u ON u.id = c.user_id
       WHERE c.provider = ? AND c.identifier = ?`,
    )
    .get(PASSWORD_PROVIDER, normalizeEmail(email)) as
    | { userId: string; secret: string | null; nickname: string }
    | undefined;

  // 계정이 없을 때와 비밀번호가 틀렸을 때를 **같은 메시지**로 돌려준다 —
  // 어느 이메일이 가입돼 있는지 알려주지 않기 위해.
  const fail: AuthError = {
    code: 'BAD_CREDENTIALS',
    message: '이메일 또는 비밀번호가 올바르지 않습니다.',
  };
  if (row === undefined || row.secret === null) return fail;
  if (!verifyPassword(password, row.secret)) return fail;

  return {
    user: { id: row.userId, nickname: row.nickname },
    token: createSession(db, row.userId),
  };
}

/** 세션 토큰으로 사용자를 찾는다. 만료됐으면 null. */
export function resume(db: Db, token: string): User | null {
  const row = db
    .prepare(
      `SELECT u.id AS id, u.nickname AS nickname, s.expires_at AS expiresAt
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    )
    .get(token) as { id: string; nickname: string; expiresAt: number } | undefined;
  if (row === undefined) return null;
  if (row.expiresAt < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { id: row.id, nickname: row.nickname };
}

export function logout(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function setNickname(db: Db, userId: string, nickname: string): void {
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, userId);
}

/** 만료 세션 정리. 주기적으로 호출한다. */
export function sweepSessions(db: Db): number {
  const result = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  return Number(result.changes ?? 0);
}

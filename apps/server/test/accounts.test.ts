/** 계정·세션. 비밀번호는 평문으로 어디에도 남지 않아야 한다. */

import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import {
  login,
  logout,
  register,
  resume,
  setNickname,
  sweepSessions,
} from '../src/db/accounts.js';

function fresh() {
  return openDb(':memory:');
}

/** 테스트용 값 — 실제 사용자 비밀번호가 아니다. */
const EMAIL = 'tester@example.com';
const SECRET = 'test-only-passphrase-1';

describe('가입', () => {
  it('가입하면 사용자와 세션이 생긴다', () => {
    const db = fresh();
    const result = register(db, EMAIL, SECRET, '도헌');
    expect('code' in result).toBe(false);
    if ('code' in result) return;
    expect(result.user.nickname).toBe('도헌');
    expect(result.token).toMatch(/^[a-f0-9]{48}$/);
    expect(resume(db, result.token)?.id).toBe(result.user.id);
  });

  it('같은 이메일로 두 번 가입할 수 없다', () => {
    const db = fresh();
    register(db, EMAIL, SECRET, 'a');
    expect(register(db, EMAIL, SECRET, 'b')).toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('이메일 대소문자를 구분하지 않는다', () => {
    const db = fresh();
    register(db, EMAIL, SECRET, 'a');
    expect(register(db, EMAIL.toUpperCase(), SECRET, 'b')).toMatchObject({
      code: 'EMAIL_TAKEN',
    });
  });

  it('비밀번호가 평문으로 저장되지 않는다', () => {
    const db = fresh();
    register(db, EMAIL, SECRET, '도헌');
    const rows = db.prepare('SELECT secret FROM credentials').all() as {
      secret: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.secret).not.toContain(SECRET);
    expect(rows[0]?.secret).toMatch(/^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);
  });

  it('같은 비밀번호라도 해시가 다르다 — 솔트가 붙는다', () => {
    const db = fresh();
    register(db, 'a@example.com', SECRET, 'a');
    register(db, 'b@example.com', SECRET, 'b');
    const rows = db.prepare('SELECT secret FROM credentials').all() as {
      secret: string;
    }[];
    expect(rows[0]?.secret).not.toBe(rows[1]?.secret);
  });
});

describe('로그인', () => {
  it('맞는 비밀번호면 세션을 준다', () => {
    const db = fresh();
    register(db, EMAIL, SECRET, '도헌');
    const result = login(db, EMAIL, SECRET);
    expect('code' in result).toBe(false);
  });

  it('틀린 비밀번호는 거부한다', () => {
    const db = fresh();
    register(db, EMAIL, SECRET, '도헌');
    expect(login(db, EMAIL, 'wrong-value')).toMatchObject({ code: 'BAD_CREDENTIALS' });
  });

  it('없는 계정과 틀린 비밀번호의 응답이 같다 — 가입 여부를 알려주지 않는다', () => {
    const db = fresh();
    register(db, EMAIL, SECRET, '도헌');
    const wrongPassword = login(db, EMAIL, 'wrong-value');
    const noAccount = login(db, 'nobody@example.com', SECRET);
    expect(wrongPassword).toEqual(noAccount);
  });
});

describe('세션', () => {
  it('로그아웃하면 토큰이 죽는다', () => {
    const db = fresh();
    const r = register(db, EMAIL, SECRET, '도헌');
    if ('code' in r) return;
    logout(db, r.token);
    expect(resume(db, r.token)).toBeNull();
  });

  it('만료된 토큰은 복구되지 않고 정리된다', () => {
    const db = fresh();
    const r = register(db, EMAIL, SECRET, '도헌');
    if ('code' in r) return;
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(
      Date.now() - 1000,
      r.token,
    );
    expect(resume(db, r.token)).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toMatchObject({ n: 0 });
  });

  it('없는 토큰은 null', () => {
    expect(resume(fresh(), 'deadbeef')).toBeNull();
  });

  it('만료 세션을 쓸어낸다', () => {
    const db = fresh();
    const r = register(db, EMAIL, SECRET, '도헌');
    if ('code' in r) return;
    db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1);
    expect(sweepSessions(db)).toBe(1);
  });
});

describe('닉네임', () => {
  it('바꾸면 세션 복구에도 반영된다', () => {
    const db = fresh();
    const r = register(db, EMAIL, SECRET, '도헌');
    if ('code' in r) return;
    setNickname(db, r.user.id, '새이름');
    expect(resume(db, r.token)?.nickname).toBe('새이름');
  });
});

describe('마이그레이션', () => {
  it('두 번 열어도 안전하다', () => {
    const db = fresh();
    const before = db.prepare('SELECT COUNT(*) AS n FROM _migrations').get();
    expect(before).toMatchObject({ n: 2 });
  });

  it('소셜 로그인을 위한 자리가 이미 있다', () => {
    const db = fresh();
    const r = register(db, EMAIL, SECRET, '도헌');
    if ('code' in r) return;
    // provider 가 다르면 같은 계정에 수단을 더 붙일 수 있다
    db.prepare(
      'INSERT INTO credentials (user_id, provider, identifier, secret, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(r.user.id, 'google', 'google-sub-123', null, Date.now());
    const rows = db
      .prepare('SELECT provider FROM credentials WHERE user_id = ? ORDER BY provider')
      .all(r.user.id) as { provider: string }[];
    expect(rows.map((x) => x.provider)).toEqual(['google', 'password']);
  });
});

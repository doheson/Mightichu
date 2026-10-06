/**
 * DB 연결.
 *
 * Node 25 의 **내장 `node:sqlite`** 를 쓴다 — 네이티브 빌드도 의존성도 없다.
 * 테스트는 `:memory:` 로 연다.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrate } from './schema.js';

export type Db = DatabaseSync;

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

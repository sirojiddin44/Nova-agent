import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Jadvallar. IF NOT EXISTS — har ishga tushganda xavfsiz qayta bajariladi.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  telegram_id  INTEGER PRIMARY KEY,
  first_name   TEXT,
  status       TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'allowed', 'blocked')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Suhbat tarixi. Har bir qator bitta foydalanuvchiga tegishli (user_id).
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages (user_id, id);

-- Kunlik sarf: limitlar va xarajatni nazorat qilish uchun.
CREATE TABLE IF NOT EXISTS usage (
  user_id        INTEGER NOT NULL,
  day            TEXT NOT NULL,
  message_count  INTEGER NOT NULL DEFAULT 0,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
`;

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

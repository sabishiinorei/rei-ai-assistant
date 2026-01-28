const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "rei.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  type TEXT,
  content TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS state (
  user_id TEXT PRIMARY KEY,
  mood TEXT,
  energy REAL,
  attachment REAL,
  personality TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS short_term (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  role TEXT,
  content TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  remind_at TEXT NOT NULL,   -- ISO datetime string
  created_at TEXT NOT NULL,
  fired_at TEXT             -- NULL пока не сработало
);
`);

module.exports = db;

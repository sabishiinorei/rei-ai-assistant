const db = require("./db");
const ALLOWED_MEMORY_TYPES = new Set(["note", "fact", "preference", "system"]);

// memory (под твою таблицу memory)
function addMemory(userId, type, content) {
  const stmt = db.prepare(`
    INSERT INTO memory (user_id, type, content, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const createdAt = new Date().toISOString();
  const info = stmt.run(userId, type, content, createdAt);
  return { id: info.lastInsertRowid, user_id: userId, type, content, created_at: createdAt };
}

function listMemory(userId, limit = 50) {
  const stmt = db.prepare(`
    SELECT id, user_id, type, content, created_at
    FROM memory
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `);
  return stmt.all(userId, limit);
}

function findDuplicateMemory(userId, type, content) {
  const stmt = db.prepare(`
    SELECT id, user_id, type, content, created_at
    FROM memory
    WHERE user_id = ?
      AND type = ?
      AND LOWER(TRIM(content)) = LOWER(TRIM(?))
    ORDER BY id DESC
    LIMIT 1
  `);
  return stmt.get(userId, type, content) || null;
}

// reminders
function addReminder(userId, text, remindAtIso) {
  const stmt = db.prepare(`
    INSERT INTO reminders (user_id, text, remind_at, created_at, fired_at)
    VALUES (?, ?, ?, ?, NULL)
  `);
  const createdAt = new Date().toISOString();
  const info = stmt.run(userId, text, remindAtIso, createdAt);
  return { id: info.lastInsertRowid, user_id: userId, text, remind_at: remindAtIso, created_at: createdAt, fired_at: null };
}

function listReminders(userId, limit = 100) {
  const stmt = db.prepare(`
    SELECT id, user_id, text, remind_at, created_at, fired_at
    FROM reminders
    WHERE user_id = ?
    ORDER BY remind_at ASC
    LIMIT ?
  `);
  return stmt.all(userId, limit);
}

function clearMemory(userId) {
  const stmt = db.prepare(`DELETE FROM memory WHERE user_id = ?`);
  const info = stmt.run(userId);
  return { deleted: info.changes };
}

function clearReminders(userId) {
  const stmt = db.prepare(`DELETE FROM reminders WHERE user_id = ?`);
  const info = stmt.run(userId);
  return { deleted: info.changes };
}

function getDueReminders(userId, nowISO) {
  const stmt = db.prepare(`
    SELECT *
    FROM reminders
    WHERE user_id = ?
      AND fired_at IS NULL
      AND remind_at <= ?
    ORDER BY remind_at ASC
  `);
  return stmt.all(userId, nowISO);
}

function markReminderFired(id, firedAt) {
  const stmt = db.prepare(`
    UPDATE reminders
    SET fired_at = ?
    WHERE id = ?
  `);
  stmt.run(firedAt, id);
}

module.exports = {
  addMemory,
  listMemory,
  findDuplicateMemory,
  addReminder,
  listReminders,
  clearMemory,
  clearReminders,
  getDueReminders,      // ✅ добавь
  markReminderFired
};


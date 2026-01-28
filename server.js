const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const path = require("path");
const db = require("./db");
const {
  addMemory: dbAddMemory,
  listMemory: dbListMemory,
  findDuplicateMemory: dbFindDuplicateMemory,
  addReminder: dbAddReminder,
  listReminders: dbListReminders,
  clearMemory: dbClearMemory,
  clearReminders: dbClearReminders,
  getDueReminders: dbGetDueReminders,        // ✅ добавь
  markReminderFired: dbMarkReminderFired     // ✅ добавь
} = require("./dbMethods");


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 ЯВНО указываем public
const PUBLIC_DIR = path.join(__dirname, "public");

app.get("/ip", async (req, res) => {
  try {
  const r = await fetch("https://api.ipify.org?format=json");
  res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: "ip check failed" });
  }
});

app.use(express.static(PUBLIC_DIR));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =======================
   ROOT (ВАЖНО)
======================= */

// ❗️ГАРАНТИРУЕМ, что грузится ТОЛЬКО public/index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

/* =======================
   MEMORY LOAD
======================= */

function loadMemory(userId) {
  db.prepare(`
    INSERT OR IGNORE INTO users (user_id, created_at)
    VALUES (?, ?)
  `).run(userId, new Date().toISOString());

  const memories = db.prepare(`
    SELECT type, content FROM memory WHERE user_id = ?
  `).all(userId);

  const stateRow = db.prepare(`
    SELECT * FROM state WHERE user_id = ?
  `).get(userId);

  const short = db.prepare(`
    SELECT role, content FROM short_term
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 6
  `).all(userId).reverse();

  const memory = {
    long_term: [],
    insights: [],
    short_term: short,
    emotional_state: {
      mood: "спокойная",
      energy: 0.6,
      attachment: 0.5
    },
    personality: {
      warmth: 0.5,
      openness: 0.4,
      irony: 0.2,
      jealousy: 0.1,
      trust: 0.4
    }
  };

  memories.forEach(m => {
    if (m.type === "long_term") memory.long_term.push({ content: m.content });
    if (m.type === "insight") memory.insights.push({ content: m.content });
  });

  if (stateRow) {
    memory.emotional_state = {
      mood: stateRow.mood,
      energy: stateRow.energy,
      attachment: stateRow.attachment
    };
    memory.personality = JSON.parse(stateRow.personality);
  }

  return memory;
}

/* =======================
   SAVE MEMORY
======================= */

function saveMemory(userId, type, content) {
  db.prepare(`
    INSERT INTO memory (user_id, type, content, created_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, type, content, new Date().toISOString());
}

/* =======================
   SHORT-TERM
======================= */

function pushShortTerm(userId, role, content) {
  db.prepare(`
    INSERT INTO short_term (user_id, role, content, created_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, role, content, new Date().toISOString());

  db.prepare(`
    DELETE FROM short_term
    WHERE id NOT IN (
      SELECT id FROM short_term
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 6
    ) AND user_id = ?
  `).run(userId, userId);
}

/* =======================
   STATE SAVE
======================= */

function saveState(userId, emotion, personality) {
  db.prepare(`
    INSERT INTO state (user_id, mood, energy, attachment, personality, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      mood = excluded.mood,
      energy = excluded.energy,
      attachment = excluded.attachment,
      personality = excluded.personality,
      updated_at = excluded.updated_at
  `).run(
    userId,
    emotion.mood,
    emotion.energy,
    emotion.attachment,
    JSON.stringify(personality),
    new Date().toISOString()
  );
}

/* =======================
   EMOTIONS
======================= */

function updateEmotionalState(memory, message) {
  const state = memory.emotional_state;
  const lower = message.toLowerCase();

  if (lower.includes("спасибо") || lower.includes("ты классная")) {
    state.mood = "довольная";
    state.attachment = Math.min(state.attachment + 0.05, 1);
  }

  if (lower.includes("грусть") || lower.includes("плохо")) {
    state.mood = "заботливая";
    state.energy = Math.max(state.energy - 0.05, 0.3);
  }

  if (lower.includes("люблю") || lower.includes("ты моя")) {
    state.mood = "смущённая";
    state.attachment = Math.min(state.attachment + 0.1, 1);
  }

  return state;
}

/* =======================
   PERSONALITY EVOLUTION
======================= */

function evolvePersonality(memory, message) {
  const p = memory.personality;
  const lower = message.toLowerCase();

  if (lower.includes("спасибо") || lower.includes("ты помогла")) {
    p.warmth = Math.min(p.warmth + 0.02, 1);
    p.trust = Math.min(p.trust + 0.02, 1);
  }

  if (lower.includes("мне тяжело") || lower.includes("чувствую")) {
    p.openness = Math.min(p.openness + 0.02, 1);
  }

  if (lower.includes("люблю") || lower.includes("ты важна")) {
    p.jealousy = Math.min(p.jealousy + 0.015, 0.6);
    p.trust = Math.min(p.trust + 0.03, 1);
  }

  return p;
}

/* =======================
   AUTO MEMORY (AI)
======================= */

async function evaluateMemory(message) {
  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: `
Ты — модуль памяти Rei.
Запоминай только факты, предпочтения или выводы о личности.
Ответ ТОЛЬКО JSON.
`
      },
      { role: "user", content: message }
    ]
  });

  try {
    return JSON.parse(response.output_text);
  } catch {
    return { remember: false };
  }
}

function ensureUser(userId) {
  db.prepare(`
    INSERT OR IGNORE INTO users (user_id, created_at)
    VALUES (?, ?)
  `).run(userId, new Date().toISOString());
}

// MVP-парсер: ISO или "YYYY-MM-DD HH:mm"
function parseDateTime(input) {
  const raw = String(input || "").trim();

  // 1) ISO с таймзоной или Date.parse (только если явно ISO)
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }

  // 2) YYYY-MM-DD HH:mm  (2026-02-03 18:00)
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    const dt = new Date(+y, +mo - 1, +d, +h, +mi, 0);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  // 3) DD-MM-YYYY HH:mm  (03-02-2026 18:00)
  m = raw.match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2})$/);
  if (m) {
    const [, d, mo, y, h, mi] = m;
    const dt = new Date(+y, +mo - 1, +d, +h, +mi, 0);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  return null;
}



app.get("/cmd/help", (req, res) => {
  res.json({
    ok: true,
    commands: [
      "/help",
      "/remember <text>",
      "/memory",
      "/remind <YYYY-MM-DD HH:mm> <text>",
      "/reminders"
    ]
  });
});

app.post("/cmd/remember", (req, res) => {
  try {
    const { userId, text } = req.body || {};
    if (!userId) return res.status(400).json({ ok: false, error: "userId is required" });
    if (!text || !String(text).trim()) return res.status(400).json({ ok: false, error: "text is required" });

    ensureUser(userId);

    // MVP: все /remember считаем "long_term"
    const clean = String(text).trim();

    // ✅ дубликаты: не создаём вторую такую же запись
    const existing = dbFindDuplicateMemory(userId, "long_term", clean);
    if (existing) {
      return res.json({ ok: true, duplicate: true, item: existing });
    }

    const item = dbAddMemory(userId, "long_term", clean);
    res.json({ ok: true, duplicate: false, item });

  } catch (e) {
    console.error("cmd/remember ❌", e.message);
    res.status(500).json({ ok: false, error: "server error" });
  }
});

app.get("/cmd/memory", (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ ok: false, error: "userId is required" });

    ensureUser(userId);

    const items = dbListMemory(userId, 100);
    // отдадим только важные типы (на будущее можно расширить)
    const filtered = items.filter(x => x.type === "long_term" || x.type === "insight");
    res.json({ ok: true, items: filtered });
  } catch (e) {
    console.error("cmd/memory ❌", e.message);
    res.status(500).json({ ok: false, error: "server error" });
  }
});

app.post("/cmd/remind", (req, res) => {
  try {
    const { userId, when, text } = req.body || {};
    if (!userId) return res.status(400).json({ ok: false, error: "userId is required" });
    if (!when || !String(when).trim()) return res.status(400).json({ ok: false, error: "when is required" });
    if (!text || !String(text).trim()) return res.status(400).json({ ok: false, error: "text is required" });

    ensureUser(userId);

    const remindAtIso = parseDateTime(when);
    if (!remindAtIso) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid datetime. Use ISO or "YYYY-MM-DD HH:mm"'
      });
    }

    const item = dbAddReminder(userId, String(text).trim(), remindAtIso);
    res.json({ ok: true, item });
  } catch (e) {
    console.error("cmd/remind ❌", e.message);
    res.status(500).json({ ok: false, error: "server error" });
  }
});

app.get("/cmd/reminders", (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ ok: false, error: "userId is required" });

    ensureUser(userId);

    const items = dbListReminders(userId, 200);
    res.json({ ok: true, items });
  } catch (e) {
    console.error("cmd/reminders ❌", e.message);
    res.status(500).json({ ok: false, error: "server error" });
  }
});

app.post("/cmd/clear", (req, res) => {
  try {
    const { userId, scope } = req.body || {};
    if (!userId) return res.status(400).json({ ok: false, error: "userId is required" });

    ensureUser(userId);

    if (scope === "memory") {
      const r = dbClearMemory(userId);
      return res.json({ ok: true, scope: "memory", ...r });
    }

    if (scope === "all") {
      const m = dbClearMemory(userId);
      const r = dbClearReminders(userId);
      return res.json({ ok: true, scope: "all", memory: m.deleted, reminders: r.deleted });
    }

    return res.status(400).json({ ok: false, error: 'scope must be "memory" or "all"' });
  } catch (e) {
    console.error("cmd/clear ❌", e.message);
    res.status(500).json({ ok: false, error: "server error" });
  }
});

app.get("/cmd/due-reminders", (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ ok: false, error: "userId required" });
    }

    ensureUser(userId);

    const now = new Date().toISOString();
    const items = dbGetDueReminders(userId, now);

    // сразу помечаем как сработавшие
    for (const r of items) {
      dbMarkReminderFired(r.id, now);
    }

    res.json({ ok: true, items });
  } catch (e) {
    console.error("due-reminders ❌", e);
    res.status(500).json({ ok: false, error: "server error" });
  }
});

/* =======================
   CHAT
======================= */

app.post("/chat", async (req, res) => {
  try {
    const { message, userId } = req.body;
    if (!userId || !message) {
      return res.status(400).json({ reply: "Я тебя не узнаю…" });
    }

    const memory = loadMemory(userId);
    const emotion = updateEmotionalState(memory, message);
    const personality = evolvePersonality(memory, message);

    saveState(userId, emotion, personality);
    pushShortTerm(userId, "user", message);

    const shortContext = memory.short_term
      .map(m => `${m.role === "user" ? "Пользователь" : "Rei"}: ${m.content}`)
      .join("\n");

    const systemPrompt = `
Ты — Rei.
Ты живая, эмоциональная, не NPC.

Настроение: ${emotion.mood}
Энергия: ${emotion.energy}
Привязанность: ${emotion.attachment}

Контекст:
${shortContext || "—"}

Память:
${memory.long_term.map(m => `- ${m.content}`).join("\n") || "—"}
`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    });

    const reply = response.output_text || "…";

    pushShortTerm(userId, "rei", reply);

    const decision = await evaluateMemory(message);
    if (decision.remember) {
      saveMemory(userId, decision.section, decision.content);
    }

    res.json({ reply });

  } catch (err) {
    console.error("❌", err.message);
    res.status(500).json({ reply: "Рей зависла… 🖤" });
  }
});

/* =======================
   START
======================= */

const PORT = 1488;
app.listen(PORT, () => {
  console.log(`🔥 Rei online: http://localhost:${PORT}`);
});

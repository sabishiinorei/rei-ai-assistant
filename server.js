const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const path = require("path");
const db = require("./db");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 ЯВНО указываем public
const PUBLIC_DIR = path.join(__dirname, "public");
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

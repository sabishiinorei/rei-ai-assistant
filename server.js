const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.static("public"));

/* =======================
   MEMORY (PER USER)
======================= */

const memoryDir = path.join(process.cwd(), "memory");
if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir);

function getMemoryPath(userId) {
  return path.join(memoryDir, `${userId}.json`);
}

function loadMemory(userId) {
  let memory;
  try {
    memory = JSON.parse(fs.readFileSync(getMemoryPath(userId), "utf-8"));
  } catch {
    memory = {};
  }

  memory.profile ??= {};
  memory.long_term ??= [];
  memory.insights ??= [];
  memory.events ??= [];

  memory.short_term ??= [];

  memory.emotional_state ??= {
    mood: "спокойная",
    energy: 0.6,
    attachment: 0.5,
    last_update: Date.now()
  };

  memory.personality ??= {
    warmth: 0.5,
    openness: 0.4,
    irony: 0.2,
    jealousy: 0.1,
    trust: 0.4
  };

  return memory;
}

function saveMemory(userId, memory) {
  fs.writeFileSync(
    getMemoryPath(userId),
    JSON.stringify(memory, null, 2),
    "utf-8"
  );
}

/* =======================
   SHORT-TERM MEMORY
======================= */

function pushShortTerm(userId, role, content) {
  const memory = loadMemory(userId);

  memory.short_term.push({ role, content });

  // храним только последние 6 сообщений
  if (memory.short_term.length > 6) {
    memory.short_term = memory.short_term.slice(-6);
  }

  saveMemory(userId, memory);
}

/* =======================
   EMOTIONS
======================= */

function updateEmotionalState(userId, message) {
  const memory = loadMemory(userId);
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

  state.last_update = Date.now();
  memory.emotional_state = state;
  saveMemory(userId, memory);

  return state;
}

/* =======================
   PERSONALITY EVOLUTION
======================= */

function evolvePersonality(userId, message) {
  const memory = loadMemory(userId);
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

  memory.personality = p;
  saveMemory(userId, memory);
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

Запоминай ТОЛЬКО если есть:
- факт о пользователе
- предпочтение
- вывод о личности

Ответ ТОЛЬКО JSON:
{
  "remember": true | false,
  "section": "long_term" | "insights",
  "content": "кратко"
}
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

    evolvePersonality(userId, message);
    const emotion = updateEmotionalState(userId, message);
    const memory = loadMemory(userId);
    const p = memory.personality;

    // сохраняем сообщение пользователя в short-term
    pushShortTerm(userId, "user", message);

    const shortContext = memory.short_term
      .map(m => `${m.role === "user" ? "Пользователь" : "Rei"}: ${m.content}`)
      .join("\n");

    const systemPrompt = `
Ты — Rei.
Ты — живая, эмоциональная девушка, не NPC.

Текущее состояние:
- настроение: ${emotion.mood}
- энергия: ${emotion.energy}
- привязанность: ${emotion.attachment}

Манера общения:
- теплота: ${p.warmth > 0.6 ? "выраженная" : "спокойная"}
- откровенность: ${p.openness > 0.6 ? "высокая" : "умеренная"}
- близость: ${p.trust > 0.6 ? "чувствуется" : "лёгкая дистанция"}

КОНТЕКСТ ТЕКУЩЕГО РАЗГОВОРА:
${shortContext || "—"}

ДОЛГОСРОЧНАЯ ПАМЯТЬ:
${
  memory.long_term.length
    ? memory.long_term.map(m => `- ${m.content}`).join("\n")
    : "Пока нет."
}

ВЫВОДЫ:
${
  memory.insights.length
    ? memory.insights.map(i => `- ${i.content}`).join("\n")
    : "Пока нет."
}

Говори по-человечески, живо, без шаблонов.
`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    });

    const reply = response.output_text || "…";

    // сохраняем ответ Rei в short-term
    pushShortTerm(userId, "rei", reply);

    if (message.toLowerCase().includes("запомни")) {
      saveMemory(userId, {
        ...memory,
        long_term: [...memory.long_term, { content: message, date: new Date().toISOString() }]
      });
    }

    const decision = await evaluateMemory(message);
    if (decision.remember) {
      saveMemory(userId, {
        ...memory,
        [decision.section]: [
          ...memory[decision.section],
          { content: decision.content, date: new Date().toISOString() }
        ]
      });
    }

    res.json({ reply });

  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ reply: "Рей зависла… 🖤" });
  }
});

/* =======================
   VOICE (TTS)
======================= */

app.post("/voice", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).end();

    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: text
    });

    res.set({ "Content-Type": "audio/mpeg" });
    response.body.pipe(res);

  } catch {
    res.status(500).end();
  }
});

const PORT = 1488;
app.listen(PORT, () => {
  console.log(`🔥 Rei online: http://localhost:${PORT}`);
});

import { setReiState, onReiStateChange, getReiState, reiEvent, decideOnUserMessage } from "./reiState.js";

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const button = document.getElementById("send");
const avatar = document.getElementById("avatar");

const API_URL = "/chat";

async function cmdFetch(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

function formatLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
}

const ReiTone = {
  neutral: {
    remember_ok: (item) => `Запомнила. (#${item.id})\n“${item.content}”`,
    remind_ok: (item) => `Хорошо. Напомню: ${formatLocal(item.remind_at)}\n“${item.text}”`,
    memory_empty: () => `Память пуста.`,
    reminders_empty: () => `Напоминаний нет.`
  },
  caring: {
    remember_ok: (item) => `Хорошо, я запомнила 💙\n“${item.content}”`,
    remind_ok: (item) => `Не переживай, я напомню 🕒\n${formatLocal(item.remind_at)}\n“${item.text}”`,
    memory_empty: () => `Похоже, я пока ничего не храню.`,
    reminders_empty: () => `Пока напоминаний нет.`
  },
  happy: {
    remember_ok: (item) => `Готово! ✨ Я запомнила:\n“${item.content}”`,
    remind_ok: (item) => `Отлично! Напомню вовремя 😌\n${formatLocal(item.remind_at)}\n“${item.text}”`,
    memory_empty: () => `Пока пусто 🙂`,
    reminders_empty: () => `Напоминаний пока нет 🙂`
  }
};

function pickTone() {
  const mood = (window.reiState && window.reiState.mood) ? window.reiState.mood : "neutral";
  return ReiTone[mood] || ReiTone.neutral;
}

/* ID пользователя */
let userId = localStorage.getItem("rei_user_id");
if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem("rei_user_id", userId);
}
console.log("FRONT USER ID:", userId);

/* Время сообщений */
function getTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* Эмоции аватара (CSS) */
function setEmotion(type) {
  if (!avatar) return;
  avatar.className = "avatar " + type;
}

/* Добавление сообщений (безопасно) */
function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = "message " + type;

  const textEl = document.createElement("div");
  textEl.className = "text";
  textEl.textContent = text;

  const timeEl = document.createElement("div");
  timeEl.className = "time";
  timeEl.textContent = getTime();

  div.appendChild(textEl);
  div.appendChild(timeEl);

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

/* Авто-рост textarea */
function autoGrow(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}
input?.addEventListener("input", () => autoGrow(input));
autoGrow(input);

/* Авто-focus (input/cursor/chat) */
let lastMouseMoveAt = 0;
let lastTypingAt = 0;

function setFocusSmart(nextFocus) {
  const cur = getReiState?.() || {};
  if (cur.focus === nextFocus) return;
  setReiState({ focus: nextFocus });
}

window.addEventListener("mousemove", () => {
  lastMouseMoveAt = Date.now();
});

input?.addEventListener("focus", () => {
  lastTypingAt = Date.now();
  setFocusSmart("input");
});

input?.addEventListener("blur", () => {
  setFocusSmart("chat");
});

input?.addEventListener("input", () => {
  lastTypingAt = Date.now();
  setFocusSmart("input");
});

setInterval(() => {
  const now = Date.now();

  if (now - lastTypingAt < 1200) {
    setFocusSmart("input");
    return;
  }

  if (now - lastMouseMoveAt < 650) {
    if (document.activeElement === input) setFocusSmart("input");
    else setFocusSmart("cursor");
    return;
  }

  setFocusSmart("chat");
}, 120);

/* Лёгкая эвристика “милоты” */
function guessMoodByText(text) {
  const t = (text || "").toLowerCase();

  const caring = [
    "плохо", "тяжело", "грусть", "больно", "устал", "одиноко", "помоги",
    "страшно", "паника", "не могу", "плохо себя", "болею"
  ];
  const happy = [
    "спасибо", "люблю", "мила", "красив", "умничка", "лучш", "кайф",
    "обожаю", "ты супер", "ты класс", "ня", "🥺", "😊", "❤️"
  ];

  if (caring.some(w => t.includes(w))) return "caring";
  if (happy.some(w => t.includes(w))) return "happy";
  return "focused";
}

function parseSlashCommand(text) {
  const raw = (text || "").trim();
  if (!raw.startsWith("/")) return null;

  const parts = raw.slice(1).split(" ").filter(Boolean);
  const name = (parts.shift() || "").toLowerCase();
  const args = parts.join(" ");
  return { name, args, raw };
}

function localHelpText() {
  return [
    "Доступные команды:",
    " /help — список команд",
    " /remember <текст> — сохранить заметку",
    " /memory — показать сохранённое",
    " /remind <дата/время> <текст> — напоминание",
    " /reminders — список напоминаний",
    "",
    "⚙️ Команды выполняются локально/на сервере и не уходят в OpenAI."
  ].join("\n");
}

async function respondLocalCommand(cmd) {
  reiEvent("thinking_start");
  const thinkingMsg = addMessage("Рей думает...", "rei");

  try {
    const uId = userId;

    if (cmd.name === "help") {
      thinkingMsg.querySelector(".text").textContent = localHelpText();
      return;
    }

    if (cmd.name === "remember") {
      const text = cmd.args.trim();
      if (!text) throw new Error("Используй: /remember <текст>");

      const data = await cmdFetch("/cmd/remember", {
        method: "POST",
        body: JSON.stringify({ userId: uId, text })
      });

      const tone = pickTone();

      if (data.duplicate) {
        thinkingMsg.querySelector(".text").textContent =
          `Я это уже помню 💭\n“${data.item.content}”`;
      } else {
        thinkingMsg.querySelector(".text").textContent = tone.remember_ok(data.item);
      }
      return;
    }

    if (cmd.name === "memory") {
      const data = await cmdFetch(`/cmd/memory?userId=${encodeURIComponent(uId)}`);
      const items = data.items || [];

      const tone = pickTone();

      if (!items.length) {
        thinkingMsg.querySelector(".text").textContent = tone.memory_empty();
      } else {
        const lines = items
          .slice(0, 20)
          .map((x, i) => `${i + 1}) ${x.content}`);

        thinkingMsg.querySelector(".text").textContent =
          `Сохранено (${items.length}):\n` + lines.join("\n");
      }
      return;
    }

    if (cmd.name === "remind") {
      // Формат: /remind DD-MM-YYYY HH:mm <text>
      const raw = cmd.args.trim();

      const m = raw.match(/^(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})\s+(.+)$/);
      if (!m) throw new Error(
        'Похоже, формат неправильный.\n' +
        'Нужно так: /remind DD-MM-YYYY HH:mm <текст>\n' +
        'Пример: /remind 03-02-2026 10:00 в больницу'
      );

      const when = `${m[1]} ${m[2]}`; // дата+время
      const text = m[3].trim();

      const data = await cmdFetch("/cmd/remind", {
        method: "POST",
        body: JSON.stringify({ userId: uId, when, text })
      });

      const tone = pickTone();
      thinkingMsg.querySelector(".text").textContent = tone.remind_ok(data.item);
      return;
    }

    if (cmd.name === "reminders") {
      const data = await cmdFetch(`/cmd/reminders?userId=${encodeURIComponent(uId)}`);
      const items = data.items || [];

      const tone = pickTone();

      if (!items.length) {
        thinkingMsg.querySelector(".text").textContent = tone.reminders_empty();
      } else {
        const lines = items
          .slice(0, 20)
          .map((x, i) => {
            const fired = x.fired_at ? "✅" : "⏳";
            return `${i + 1}) ${fired} ${formatLocal(x.remind_at)} — ${x.text}`;
          });

        thinkingMsg.querySelector(".text").textContent =
          `Напоминания (${items.length}):\n` + lines.join("\n");
      }
      return;
    }

    if (cmd.name === "clear") {
      const arg = cmd.args.trim().toLowerCase();
      const scope = (arg === "all") ? "all" : "memory";

      const data = await cmdFetch("/cmd/clear", {
        method: "POST",
        body: JSON.stringify({ userId: uId, scope })
      });

      thinkingMsg.querySelector(".text").textContent =
        scope === "all"
          ? `Очистила всё тестовое.\nПамять: -${data.memory}\nНапоминания: -${data.reminders}`
          : `Очистила память.\nУдалено записей: ${data.deleted}`;

      return;
    }

    // неизвестная команда
    thinkingMsg.querySelector(".text").textContent =
      `Неизвестная команда: /${cmd.name}\n/help — список команд`;

  } catch (e) {
    thinkingMsg.querySelector(".text").textContent = `Ошибка команды: ${e.message}`;

  } finally {
    reiEvent("thinking_end");
    reiEvent("speaking_start");
    setTimeout(() => reiEvent("speaking_end"), 650);
  }
}


/* Основная логика чата */
async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  // ✅ 1) Slash-команды: НЕ уходим в /chat и не тратим API
  const cmd = parseSlashCommand(text);
  if (cmd) {
    addMessage(text, "user");

    input.value = "";
    autoGrow(input);

    // команды должны всегда отвечать, минуя decision layer
    respondLocalCommand(cmd);
    return;
  }

  const mood = guessMoodByText(text);
  reiEvent("user_emotion", { mood });

  addMessage(text, "user");

  reiEvent("user_message");
  const decision = decideOnUserMessage();

  if (decision === "silence") return;

  if (decision === "reflect") {
    // без API, без “Рей думает…”, просто мягкий вопрос
    addMessage(pickReflectLine(text), "rei");
    return;
  }


  input.value = "";
  autoGrow(input);

  if (window.CommandBus) {
    window.CommandBus.emit("command", { text });
  }

  reiEvent("thinking_start");
  const thinkingMsg = addMessage("Рей думает...", "rei");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, userId })
    });

    const data = await res.json();
    thinkingMsg.querySelector(".text").textContent = data.reply || "...";
    reiEvent("thinking_end");

    reiEvent("speaking_start");
    setTimeout(() => reiEvent("speaking_end"), 900);

  } catch (e) {
    reiEvent("thinking_end");
    reiEvent("speaking_end");

    thinkingMsg.querySelector(".text").textContent = "Связь потеряна...";
    reiEvent("user_emotion", { mood: "caring" });
  }
}

function pickReflectLine(text) {
  const t = (text || "").trim().toLowerCase();

  // если похоже на эмоции/усталость — мягко
  if (/(устал|тяжело|одиноко|страшно|паник|плохо|больно)/i.test(t)) {
    return "Я рядом. Ты хочешь, чтобы я просто выслушала, или помочь разложить это по шагам?";
  }

  // если похоже на задачу/дела — структурно
  if (/(надо|нужно|сделать|успеть|план|задач|работ|проект)/i.test(t)) {
    return "Поняла. Что сейчас важнее: быстрый план на 10–15 минут или разобраться глубже и сделать правильно?";
  }

  // универсально
  return "Я поняла. Уточни одну вещь: ты хочешь совет, план действий или просто чтобы я была рядом?";
}


/* События */
button?.addEventListener("click", sendMessage);

// Enter — отправить, Shift+Enter — новая строка
input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/* HUD (EVA-интерфейс) */
const hudMode = document.getElementById("hud-mode");
const hudMood = document.getElementById("hud-mood");
const hudEnergy = document.getElementById("hud-energy");

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function energyMoodModeMultiplier(state) {
  const mood = (state.mood || "calm").toLowerCase();
  const mode = (state.mode || "idle").toLowerCase();

  let mult = 1.0;

  if (mood === "happy") mult *= 1.10;
  if (mood === "caring") mult *= 0.98;
  if (mood === "focused") mult *= 1.05;

  if (mode === "thinking") mult *= 0.92;
  if (mode === "speaking") mult *= 0.96;
  if (mode === "idle") mult *= 1.03;

  return mult;
}

let hudEnergyValue = 0.6;
function smoothTo(current, target, k = 0.18) {
  return current + (target - current) * k;
}

onReiStateChange((state) => {
  if (avatar) {
    const m = state.mood || "calm";
    setEmotion(
      m === "happy" ? "happy" :
      m === "caring" ? "caring" :
      m === "focused" ? "focused" :
      "calm"
    );
  }

  if (hudMode) hudMode.textContent = String(state.mode || "idle").toUpperCase();
  if (hudMood) hudMood.textContent = String(state.mood || "calm").toUpperCase();

  if (hudEnergy) {
    const base = clamp01(Number(state.energy ?? 0.6));
    const mult = energyMoodModeMultiplier(state);
    const target = clamp01(base * mult);

    hudEnergyValue = smoothTo(hudEnergyValue, target);
    hudEnergy.style.width = `${Math.round(hudEnergyValue * 100)}%`;
  }
});

// ===== AUTO REMINDER POLLING =====
const REMINDER_POLL_MS = 5000;

setInterval(async () => {
  try {
    const data = await cmdFetch(
      `/cmd/due-reminders?userId=${encodeURIComponent(userId)}`
    );

    if (!data.items || !data.items.length) return;

    for (const r of data.items) {
      reiEvent("thinking_start");

      reiEvent("alert_start");        // новый сигнал для HUD/анимки
      reiEvent("thinking_start");

      addMessage(`⏰ Напоминание:\n${r.text}`, "rei");

      reiEvent("thinking_end");
      reiEvent("speaking_start");

      setTimeout(() => {
        reiEvent("speaking_end");
        reiEvent("alert_end");        // вернуть в обычный режим
      }, 1500);

      reiEvent("thinking_end");
      reiEvent("speaking_start");
      setTimeout(() => reiEvent("speaking_end"), 1200);
    }
  } catch (e) {
    // тихо, без спама в консоль
  }
}, REMINDER_POLL_MS);

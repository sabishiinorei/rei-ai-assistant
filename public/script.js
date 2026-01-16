import { setReiState, onReiStateChange, getReiState } from "./reiState.js";

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const button = document.getElementById("send");
const avatar = document.getElementById("avatar");

const API_URL = "/chat";

/* =======================
   ID пользователя
======================= */
let userId = localStorage.getItem("rei_user_id");
if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem("rei_user_id", userId);
}
console.log("FRONT USER ID:", userId);

/* =======================
   Время сообщений
======================= */
function getTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* =======================
   Эмоции аватара (CSS)
======================= */
function setEmotion(type) {
  if (!avatar) return;
  avatar.className = "avatar " + type;
}

/* =======================
   Добавление сообщений
======================= */
function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = "message " + type;

  div.innerHTML = `
    <div class="text">${text}</div>
    <div class="time">${getTime()}</div>
  `;

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

/* =======================
   Авто-focus (input/cursor/chat)
======================= */
let lastMouseMoveAt = 0;
let lastTypingAt = 0;
let focusTick = null;

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
  // при уходе из поля — пусть смотрит в чат
  setFocusSmart("chat");
});

input?.addEventListener("input", () => {
  lastTypingAt = Date.now();
  setFocusSmart("input");
});

focusTick = setInterval(() => {
  const now = Date.now();

  // приоритет 1: если недавно печатали
  if (now - lastTypingAt < 1200) {
    setFocusSmart("input");
    return;
  }

  // приоритет 2: если недавно двигали мышь
  if (now - lastMouseMoveAt < 650) {
    // если фокус реально на input — не перебиваем
    if (document.activeElement === input) {
      setFocusSmart("input");
    } else {
      setFocusSmart("cursor");
    }
    return;
  }

  // иначе: чат
  setFocusSmart("chat");
}, 120);

/* =======================
   Лёгкая эвристика “милоты”
   (чтобы happy не было просто так)
======================= */
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

/* =======================
   Основная логика чата
======================= */
async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  // Пользователь написал → Рей думает + настроение по тексту
  const mood = guessMoodByText(text);
  setReiState({ mode: "thinking", mood });

  addMessage(text, "user");
  input.value = "";

  if (window.CommandBus) {
    window.CommandBus.emit("command", { text });
  }

  const thinkingMsg = addMessage("Рей думает...", "rei");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, userId })
    });

    const data = await res.json();
    thinkingMsg.querySelector(".text").textContent = data.reply || "...";

    // Рей говорит
    setReiState({ mode: "speaking" });
    setEmotion(mood === "caring" ? "caring" : mood === "happy" ? "happy" : "calm");

    // Возврат в ожидание (НЕ делаем happy автоматически)
    setTimeout(() => {
      const cur = getReiState?.() || {};
      setReiState({
        mode: "idle",
        mood: cur.mood || "calm"
      });
      setEmotion(cur.mood === "caring" ? "caring" : cur.mood === "happy" ? "happy" : "calm");
    }, 900);

  } catch (e) {
    thinkingMsg.querySelector(".text").textContent = "Связь потеряна...";
    setReiState({ mode: "idle", mood: "caring" });
    setEmotion("caring");
  }
}

/* =======================
   События
======================= */
button?.addEventListener("click", sendMessage);
input?.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

/* =======================
   HUD (EVA-интерфейс)
======================= */
const hudMode = document.getElementById("hud-mode");
const hudMood = document.getElementById("hud-mood");
const hudEnergy = document.getElementById("hud-energy");

onReiStateChange((state) => {
  if (hudMode) hudMode.textContent = String(state.mode || "idle").toUpperCase();
  if (hudMood) hudMood.textContent = String(state.mood || "calm").toUpperCase();

  if (hudEnergy) {
    const e = Math.max(0, Math.min(1, Number(state.energy ?? 0.6)));
    hudEnergy.style.width = `${Math.round(e * 100)}%`;
  }
});

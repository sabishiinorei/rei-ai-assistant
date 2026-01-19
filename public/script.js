import { setReiState, onReiStateChange, getReiState, reiEvent, decideOnUserMessage } from "./reiState.js";

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const button = document.getElementById("send");
const avatar = document.getElementById("avatar");

const API_URL = "/chat";

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

/* Основная логика чата */
async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  const mood = guessMoodByText(text);
  reiEvent("user_emotion", { mood });

  addMessage(text, "user");

  reiEvent("user_message");
  const decision = decideOnUserMessage();
  if (decision === "silence") return;

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

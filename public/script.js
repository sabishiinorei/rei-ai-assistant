import { setReiState, onReiStateChange } from "./reiState.js";

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
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

/* =======================
   Эмоции (CSS / модель)
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
   Основная логика чата
======================= */
async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  // Пользователь написал → Рей думает
  setReiState({ mode: "thinking", mood: "focused" });

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
    setReiState({ mode: "speaking", mood: "calm" });
    setEmotion("calm");

    // Возврат в ожидание
    setTimeout(() => {
      setReiState({ mode: "listening", mood: "happy" });
    }, 1200);

  } catch (e) {
    thinkingMsg.querySelector(".text").textContent = "Связь потеряна...";
    setReiState({ mode: "idle", mood: "caring" });
    setEmotion("caring");
  }
}

/* =======================
   События
======================= */
button.addEventListener("click", sendMessage);

input.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

/* =======================
   HUD (EVA-интерфейс)
======================= */
const hudMode = document.getElementById("hud-mode");
const hudMood = document.getElementById("hud-mood");

onReiStateChange(state => {
  if (hudMode) hudMode.textContent = state.mode.toUpperCase();
  if (hudMood) hudMood.textContent = state.mood.toUpperCase();
});

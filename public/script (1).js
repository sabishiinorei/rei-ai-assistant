const chat = document.getElementById("chat");
const input = document.getElementById("input");
const button = document.getElementById("send");
const avatar = document.getElementById("avatar");

const API_URL = "https://rei-ai-assistant-1.onrender.com/chat";

// ID пользователя
let userId = localStorage.getItem("rei_user_id");
if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem("rei_user_id", userId);
}

// время
function getTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

// эмоции
function setEmotion(type) {
  if (!avatar) return;
  avatar.className = "avatar " + type;
}

// сообщение
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

// чат
async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  // реакция на пользователя
  if (text.match(/люблю|милая|спасибо|классная/i)) {
    setEmotion("happy");
  } else if (text.match(/плохо|грусть|тяжело/i)) {
    setEmotion("caring");
  } else if (text.match(/моя|ревную|только ты/i)) {
    setEmotion("jealous");
  } else {
    setEmotion("calm");
  }

  addMessage(text, "user");
  input.value = "";

  const thinking = addMessage("Рей думает...", "rei");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, userId })
    });

    const data = await res.json();
    thinking.querySelector(".text").textContent = data.reply || "...";

    setTimeout(() => setEmotion("calm"), 4000);

  } catch {
    thinking.querySelector(".text").textContent = "Связь потеряна...";
    setEmotion("caring");
  }
}

button.addEventListener("click", sendMessage);
input.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

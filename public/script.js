const chat = document.getElementById("chat");
const input = document.getElementById("input");
const button = document.getElementById("send");

const API_URL = "https://rei-ai-assistant-1.onrender.com/chat";

// приватный айди

let userId = localStorage.getItem("rei_user_id");

if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem("rei_user_id", userId);
}

// помощь с айди

function getTime() {
  const now = new Date();
  return now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

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

// логика чата

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "user");
  input.value = "";

  const thinking = addMessage("Рей думает...", "rei");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        userId // новый айди пользователя
      })
    });

    if (!res.ok) throw new Error("Bad response");

    const data = await res.json();
    thinking.querySelector(".text").textContent = data.reply || "...";
    thinking.querySelector(".time").textContent = getTime();

  } catch (e) {
    thinking.querySelector(".text").textContent = "Связь потеряна...";
    thinking.querySelector(".time").textContent = getTime();
    console.error(e);
  }
}

// ивенты

button.addEventListener("click", sendMessage);
input.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

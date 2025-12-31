const chat = document.getElementById("chat");
const input = document.getElementById("input");
const button = document.getElementById("send");

const API_URL = "https://rei-ai-assistant-1.onrender.com/chat";

function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = "message " + type;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "user");
  input.value = "";

  const thinking = document.createElement("div");
  thinking.className = "message rei";
  thinking.textContent = "Рей думает…";
  chat.appendChild(thinking);
  chat.scrollTop = chat.scrollHeight;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });

    if (!res.ok) throw new Error("Bad response");

    const data = await res.json();
    thinking.textContent = data.reply || "…";

  } catch (e) {
    thinking.textContent = "Связь потеряна…";
    console.error(e);
  }
}

button.addEventListener("click", sendMessage);
input.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});
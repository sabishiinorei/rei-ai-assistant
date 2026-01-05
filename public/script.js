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

// эмоции аватара
function setEmotion(type) {
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

  // реакции
  if (/люблю|милая|спасибо|классная/i.test(text)) {
    setEmotion("happy");
  } else if (/плохо|грусть|тяжело/i.test(text)) {
    setEmotion("caring");
  } else if (/моя|ревную|только ты/i.test(text)) {
    setEmotion("jealous");
  } else {
    setEmotion("calm");
  }

  addMessage(text, "user");
  input.value = "";

  const thinking = addMessage("Рей думает…", "rei");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, userId })
    });

    const data = await res.json();
    thinking.querySelector(".text").textContent = data.reply || "…";

    setTimeout(() => setEmotion("calm"), 3000);

  } catch (e) {
    thinking.querySelector(".text").textContent = "Связь потеряна…";
    setEmotion("caring");
  }
}

// события
button.addEventListener("click", sendMessage);
input.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

// === LOAD REI MODEL ===
const loader = new THREE.GLTFLoader();

loader.load(
  "/models/rei.glb",
  (gltf) => {
    const model = gltf.scene;
    model.scale.set(1.2, 1.2, 1.2);
    model.position.y = -1;
    scene.add(model);

    // лёгкий idle
    function animate() {
      requestAnimationFrame(animate);
      model.rotation.y += 0.002;
      renderer.render(scene, camera);
    }
    animate();
  },
  undefined,
  (err) => {
    console.error("Model load error:", err);
  }
);


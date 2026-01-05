// ===============================
// CHAT
// ===============================
const chat = document.getElementById("chat");
const input = document.getElementById("input");
const button = document.getElementById("send");
const avatar = document.getElementById("avatar");

const API_URL = "https://rei-ai-assistant-1.onrender.com/chat";

let userId = localStorage.getItem("rei_user_id");
if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem("rei_user_id", userId);
}

function getTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function setEmotion(type) {
  avatar.className = "avatar " + type;
}

function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = "message " + type;
  div.style.animation = "fadeIn 0.25s ease";

  div.innerHTML = `
    <div class="text">${text}</div>
    <div class="time">${getTime()}</div>
  `;

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

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

button.addEventListener("click", sendMessage);
input.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

// ===============================
// 3D REI
// ===============================
const container = document.getElementById("rei-3d");

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  35,
  container.clientWidth / 300,
  0.1,
  100
);
camera.position.set(0, 1.4, 2.2);

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true
});
renderer.setSize(container.clientWidth, 300);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const light = new THREE.HemisphereLight(0xffffff, 0x223355, 1.4);
scene.add(light);

const loader = new THREE.GLTFLoader();
let reiModel = null;

loader.load(
  "/models/rei.glb",
  (gltf) => {
    reiModel = gltf.scene;
    reiModel.scale.set(1.1, 1.1, 1.1);
    reiModel.position.set(0, -1.25, 0);
    scene.add(reiModel);
  },
  undefined,
  (err) => console.error("Model load error:", err)
);

function animate() {
  requestAnimationFrame(animate);
  if (reiModel) reiModel.rotation.y += 0.002;
  renderer.render(scene, camera);
}
animate();

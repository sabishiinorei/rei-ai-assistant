// ===============================
// IMPORTS (ОБЯЗАТЕЛЬНО)
// ===============================
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/GLTFLoader.js";

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

  if (window.setReiEmotion) {
    window.setReiEmotion(type);
  }
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
  } catch {
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
const canvas = document.getElementById("rei-3d");

const scene = new THREE.Scene();

const width = canvas.clientWidth || 52;
const height = canvas.clientHeight || 52;

const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 10);
camera.position.set(0, 1.4, 2.2);

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true
});
renderer.setSize(width, height, false);
renderer.setPixelRatio(window.devicePixelRatio);

// СВЕТ (КРИТИЧНО)
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 2, 2);
scene.add(light);

const loader = new GLTFLoader();
let reiModel = null;

loader.load(
  "/models/rei.glb",
  (gltf) => {
    reiModel = gltf.scene;
    reiModel.position.set(0, 0, 0);
    reiModel.scale.set(1, 1, 1);
    scene.add(reiModel);
  },
  undefined,
  (err) => console.error("GLB LOAD ERROR:", err)
);

// эмоции → движения
window.setReiEmotion = (emotion) => {
  if (!reiModel) return;

  switch (emotion) {
    case "happy":
      reiModel.rotation.y = 0.15;
      break;
    case "caring":
      reiModel.rotation.x = -0.1;
      break;
    case "jealous":
      reiModel.rotation.y = -0.2;
      break;
    default:
      reiModel.rotation.set(0, 0, 0);
  }
};

function animate() {
  requestAnimationFrame(animate);
  if (reiModel) reiModel.rotation.y += 0.002;
  renderer.render(scene, camera);
}
animate();

// ================== CHAT ==================
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
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function setEmotion(type) {
  avatar.className = "avatar " + type;
}

function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = "message " + type;
  div.innerHTML = `<div class="text">${text}</div><div class="time">${getTime()}</div>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  setEmotion("calm");
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
  } catch {
    thinking.querySelector(".text").textContent = "Связь потеряна…";
    setEmotion("caring");
  }
}

button.addEventListener("click", sendMessage);
input.addEventListener("keydown", e => e.key === "Enter" && sendMessage());


// ================== THREE.JS ==================
const container = document.getElementById("rei-3d");

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  35,
  container.clientWidth / container.clientHeight,
  0.1,
  100
);
camera.position.set(0, 1.45, 2.4);

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true
});
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// свет
scene.add(new THREE.AmbientLight(0xffffff, 1.1));

const keyLight = new THREE.DirectionalLight(0xbfdfff, 1.4);
keyLight.position.set(2, 4, 2);
scene.add(keyLight);

// загрузка модели
const loader = new THREE.GLTFLoader();
loader.load(
  "/models/rei.glb",
  (gltf) => {
    const model = gltf.scene;
    model.scale.set(1.15, 1.15, 1.15);
    model.position.set(0, -1.1, 0);
    scene.add(model);

    function animate() {
      requestAnimationFrame(animate);
      model.rotation.y += 0.0015;
      renderer.render(scene, camera);
    }
    animate();
  },
  undefined,
  (err) => console.error("GLB load error:", err)
);

// resize
window.addEventListener("resize", () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

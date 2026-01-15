import * as THREE from './libs/three.module.js';
import { GLTFLoader } from './libs/GLTFLoader.js';

import { onReiStateChange, setReiState } from "./reiState.js";

console.log('rei3d.js module loaded');

/* контейнер */
const container = document.getElementById('rei-3d-container');
if (!container) throw new Error('rei-3d-container NOT found');

/* сцена */
const scene = new THREE.Scene();

/* камера */
const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  100
);
camera.position.set(0, 1.65, 5.1);
camera.lookAt(0, 0.95, 0);

/* рендерер */
const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

/* свет */
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(2, 3, 4);
scene.add(dirLight);

/* модель */
let reiModel = null;

// кости головы/шеи
let reiHead = null;
let reiNeck = null;
let headBaseRot = null;
let neckBaseRot = null;

function findBoneByName(root, keywords) {
  let found = null;
  root.traverse((obj) => {
    if (found) return;
    if (!obj.name) return;
    const n = obj.name.toLowerCase();
    if (keywords.some(k => n.includes(k))) found = obj;
  });
  return found;
}

/* базовая поза */
const basePose = {
  y: -1.22,
  rotY: 0
};

/* idle параметры (только дыхание) */
const idle = {
  breathSpeed: 1.0,
  breathPower: 0.022
};

const loader = new GLTFLoader();
loader.load('./models/rei.glb', (gltf) => {
  reiModel = gltf.scene;
  reiModel.scale.set(2, 2, 2);
  reiModel.position.set(0, basePose.y, 0);
  reiModel.rotation.set(0, basePose.rotY, 0);
  scene.add(reiModel);

  // кости
  reiHead = findBoneByName(reiModel, ["head", "skull", "голов", "head_"]);
  reiNeck = findBoneByName(reiModel, ["neck", "spine2", "шея", "c_p_neck"]);

  if (reiHead) headBaseRot = reiHead.rotation.clone();
  if (reiNeck) neckBaseRot = reiNeck.rotation.clone();

  console.log('REI MODEL LOADED');
  console.log('FOUND HEAD:', reiHead?.name || "no");
  console.log('FOUND NECK:', reiNeck?.name || "no");
});

/* =========================
   Мышь (НОРМАЛЬНО):
   считаем относительно контейнера модели,
   чтобы не было "слева хуже/надо тащить к краю"
========================= */
let pointer = { x: 0, y: 0, has: false };

function updatePointerFromEvent(e) {
  const rect = container.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  // нормализация относительно контейнера
  const dx = (e.clientX - cx) / (rect.width / 2);
  const dy = (e.clientY - cy) / (rect.height / 2);

  pointer.x = THREE.MathUtils.clamp(dx, -1, 1);
  pointer.y = THREE.MathUtils.clamp(dy, -1, 1);
  pointer.has = true;
}

window.addEventListener("mousemove", updatePointerFromEvent, { passive: true });

/* часы */
const clock = new THREE.Clock();

/* =========================
   ВАЖНО: направление yaw
   Если вдруг снова "влево = вправо", меняешь -1 на +1
========================= */
const YAW_SIGN = -1;   // <- если инверт, поставь +1
const PITCH_SIGN = -1; // обычно ок, но оставим на всякий

/* контроллер поведения */
const ReiController = {
  state: {
    mode: "idle",
    mood: "calm",
    energy: 0.6,
    focus: "chat",
    idlePhase: Math.random() * Math.PI * 2,

    // сглаженный взгляд
    lookYaw: 0,
    lookPitch: 0
  },

  update(delta) {
    this.state.idlePhase += delta;
    this._dt = delta || (1 / 60);
  },

  apply(model) {
    const { mode, mood, energy, idlePhase } = this.state;
    let focus = this.state.focus;

    // если реально активен input — принудительно focus=input
    const active = document.activeElement;
    if (active && active.id === "input") focus = "input";

    const e = THREE.MathUtils.clamp(energy, 0, 1);

    // --- дыхание (без вращения тела) ---
    model.position.y =
      basePose.y + Math.sin(idlePhase * idle.breathSpeed) * idle.breathPower * e;

    // тело стабильно
    model.rotation.y = basePose.rotY;
    model.rotation.x = 0;

    /* =========================
       ВЗГЛЯД (только голова/шея)
    ========================= */

    const DEADZONE = 0.05;

    // базовые настройки
    let LOOK_SMOOTH = 26;      // скорость реакции
    let MAX_YAW = 0.24;        // общий лимит
    let MAX_PITCH = 0.14;

    // mood влияет на характер
    if (mood === "happy") {
      LOOK_SMOOTH = 32;
      MAX_YAW = 0.28;
      MAX_PITCH = 0.16;
    } else if (mood === "caring") {
      LOOK_SMOOTH = 20;
      MAX_YAW = 0.22;
      MAX_PITCH = 0.13;
    } else if (mood === "focused") {
      LOOK_SMOOTH = 34;
      MAX_YAW = 0.20;
      MAX_PITCH = 0.12;
    }

    // mode влияет чуть-чуть
    if (mode === "thinking") {
      MAX_YAW *= 0.9;
      MAX_PITCH *= 0.95;
    } else if (mode === "speaking") {
      MAX_YAW *= 1.05;
      MAX_PITCH *= 1.05;
    }

    // энергия
    MAX_YAW *= (0.65 + 0.35 * e);
    MAX_PITCH *= (0.65 + 0.35 * e);

    // лимиты отдельно для головы/шеи
    const HEAD_YAW_LIMIT = Math.min(0.30, MAX_YAW * 1.15);
    const HEAD_PITCH_LIMIT = Math.min(0.18, MAX_PITCH * 1.15);

    const NECK_YAW_LIMIT = Math.min(0.16, MAX_YAW * 0.65);
    const NECK_PITCH_LIMIT = Math.min(0.11, MAX_PITCH * 0.65);

    let targetYaw = 0;
    let targetPitch = 0;

    if (focus === "input") {
      // аккуратный взгляд на поле ввода (НЕ уезжает влево)
      targetYaw = 0.04 * YAW_SIGN;
      targetPitch = 0.03 * PITCH_SIGN;

    } else if (focus === "cursor") {
      // берём мышь относительно контейнера
      let dx0 = pointer.has ? pointer.x : 0;
      let dy0 = pointer.has ? pointer.y : 0;

      // deadzone
      if (Math.abs(dx0) < DEADZONE) dx0 = 0;
      if (Math.abs(dy0) < DEADZONE) dy0 = 0;

      // нелинейность (чтобы середина была живее, края не “ломали”)
      // tanh даёт красивый плавный характер
      const nonLinear = (v) => Math.tanh(v * 1.25);

      const dx = nonLinear(dx0);
      const dy = nonLinear(dy0);

      // итог
      targetYaw = (dx * MAX_YAW) * YAW_SIGN;
      targetPitch = (dy * MAX_PITCH) * PITCH_SIGN;

    } else {
      // chat: лёгкий “внимательный” взгляд
      targetYaw = 0.06 * YAW_SIGN;
      targetPitch = 0.02 * PITCH_SIGN;
    }

    // clamp финально
    targetYaw = THREE.MathUtils.clamp(targetYaw, -MAX_YAW, MAX_YAW);
    targetPitch = THREE.MathUtils.clamp(targetPitch, -MAX_PITCH, MAX_PITCH);

    // сглаживание
    const dt = this._dt || (1 / 60);
    const k = 1 - Math.exp(-LOOK_SMOOTH * dt);

    this.state.lookYaw += (targetYaw - this.state.lookYaw) * k;
    this.state.lookPitch += (targetPitch - this.state.lookPitch) * k;

    // лимитим под голову/шею
    const headYaw = THREE.MathUtils.clamp(this.state.lookYaw, -HEAD_YAW_LIMIT, HEAD_YAW_LIMIT);
    const headPitch = THREE.MathUtils.clamp(this.state.lookPitch, -HEAD_PITCH_LIMIT, HEAD_PITCH_LIMIT);

    const neckYaw = THREE.MathUtils.clamp(this.state.lookYaw * 0.55, -NECK_YAW_LIMIT, NECK_YAW_LIMIT);
    const neckPitch = THREE.MathUtils.clamp(this.state.lookPitch * 0.45, -NECK_PITCH_LIMIT, NECK_PITCH_LIMIT);

    // применяем к шее/голове
    if (reiNeck && neckBaseRot) {
      reiNeck.rotation.y = neckBaseRot.y + neckYaw;
      reiNeck.rotation.x = neckBaseRot.x + neckPitch;
    }

    if (reiHead && headBaseRot) {
      reiHead.rotation.y = headBaseRot.y + headYaw;
      reiHead.rotation.x = headBaseRot.x + headPitch;
    }
  }
};

/* подписка 3D на reiState */
onReiStateChange((s) => {
  ReiController.state.mode = s.mode || "idle";
  ReiController.state.mood = s.mood || "calm";
  ReiController.state.energy = (typeof s.energy === "number") ? s.energy : 0.6;
  ReiController.state.focus = s.focus || "chat";
});

/* CommandBus */
const CommandBus = {
  listeners: {},
  on(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  },
  emit(type, payload) {
    this.listeners[type]?.forEach(fn => fn(payload));
  }
};

CommandBus.on('command', ({ text }) => {
  const t = (text || "").toLowerCase();

  if (t.includes('успокой')) {
    setReiState({ mood: 'calm', mode: 'idle', energy: 0.25, focus: "chat" });
  }

  if (t.includes('улыб') || t.includes('рад')) {
    setReiState({ mood: 'happy', mode: 'listening', energy: 0.75, focus: "chat" });
  }

  if (t.includes('стоп')) {
    setReiState({ energy: 0.0 });
  }
});

window.CommandBus = CommandBus;

/* анимация */
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  if (reiModel) {
    ReiController.update(delta);
    ReiController.apply(reiModel);
  }

  renderer.render(scene, camera);
}
animate();

/* resize */
window.addEventListener('resize', () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

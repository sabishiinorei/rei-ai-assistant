import * as THREE from './libs/three.module.js';
import { GLTFLoader } from './libs/GLTFLoader.js';

console.log('rei3d.js module loaded');

/* контейнер */
const container = document.getElementById('rei-3d-container');
if (!container) {
  console.error('rei-3d-container NOT found');
  throw new Error('no container');
}

/* сцена */
const scene = new THREE.Scene();

/* камера — СТАБИЛЬНАЯ */
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
const baseY = -1.8;

const loader = new GLTFLoader();
loader.load(
  './models/rei.glb',
  (gltf) => {
    reiModel = gltf.scene;

    reiModel.scale.set(1.45, 1.45, 1.45);
    reiModel.position.set(0, baseY, 0);

    scene.add(reiModel);
    console.log('REI MODEL LOADED');
  },
  undefined,
  (err) => console.error('GLTF ERROR', err)
);

// панель контроля Рей
const ReiController = {
  state: {
    mood: 'calm',        // calm | caring | alert | shy | serious
    energy: 0.3,         // 0..1 — общая живость
    attention: 0.0,      // 0..1 — интерес к пользователю
    idlePhase: Math.random() * Math.PI * 2
  },

  update(delta) {
    this.state.idlePhase += delta;
  },

  apply(model, baseY) {
    const { mood, energy, idlePhase } = this.state;

    /* ---- Idle posture ---- */
    let headTilt = 0;
    let bodySway = 0;

    switch (mood) {
      case 'calm':
        headTilt = 0.04;
        bodySway = 0.06;
        break;
      case 'caring':
        headTilt = 0.08;
        bodySway = 0.08;
        break;
      case 'alert':
        headTilt = 0.02;
        bodySway = 0.1;
        break;
    }

    /* ---- Apply transforms ---- */
    model.position.y = baseY;

    model.rotation.y =
      Math.sin(idlePhase * 0.6) * bodySway * energy;

    model.rotation.x =
      Math.sin(idlePhase * 0.4) * headTilt * energy;
  }
};

// команды

const CommandBus = {
  listeners: {},

  on(type, handler) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(handler);
  },

  emit(type, payload) {
    if (!this.listeners[type]) return;
    this.listeners[type].forEach(fn => fn(payload));
  }
};

// связка команд с Рей
CommandBus.on('command', ({ text }) => {
  const t = text.toLowerCase();

  if (t.includes('смотри')) {
    ReiController.state.attention = 1.0;
  }

  if (t.includes('успокой')) {
    ReiController.state.mood = 'calm';
    ReiController.state.energy = 0.2;
  }

  if (t.includes('рад') || t.includes('улыб')) {
    ReiController.state.mood = 'caring';
    ReiController.state.energy = 0.5;
  }

  if (t.includes('стоп')) {
    ReiController.state.energy = 0.0;
  }
});

/* анимация */
function animate() {
  requestAnimationFrame(animate);

  if (reiModel) {
  const delta = clock.getDelta();
  ReiController.update(delta);
  ReiController.apply(reiModel, baseY);
}

  renderer.render(scene, camera);
}

animate();

/* resize — ПРОСТОЙ И НАДЁЖНЫЙ */
window.addEventListener('resize', () => {
  const width = container.clientWidth;
  const height = container.clientHeight;

  if (width === 0 || height === 0) return;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

// команды
window.CommandBus = CommandBus;
import * as THREE from './libs/three.module.js';
import { GLTFLoader } from './libs/GLTFLoader.js';

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

/* базовая поза */
const basePose = {
  y: -1.22,
  rotY: 0
};

/* idle параметры */
const idle = {
  breathSpeed: 1.2,
  breathPower: 0.04,
  swaySpeed: 0.6,
  swayPower: 0.12
};

const loader = new GLTFLoader();
loader.load('./models/rei.glb', (gltf) => {
  reiModel = gltf.scene;
  reiModel.scale.set(1.55, 1.55, 1.55);
  reiModel.position.set(0, basePose.y, 0);
  scene.add(reiModel);
  console.log('REI MODEL LOADED');
});

/* часы */
const clock = new THREE.Clock();

/* контроллер Рей */
const ReiController = {
  state: {
    mood: 'calm',
    energy: 0.4,
    attention: 0.0,
    idlePhase: Math.random() * Math.PI * 2
  },

  update(delta) {
    this.state.idlePhase += delta;
  },

  apply(model) {
    const { mood, energy, idlePhase } = this.state;

    let headTilt = 0.04;
    let bodySway = 0.06;
    let breath = idle.breathPower;

    switch (mood) {
      case 'caring':
        headTilt = 0.07;
        bodySway = 0.09;
        breath *= 1.2;
        break;
      case 'alert':
        headTilt = 0.02;
        bodySway = 0.12;
        breath *= 0.8;
        break;
    }

    /* дыхание */
    model.position.y =
      basePose.y +
      Math.sin(idlePhase * idle.breathSpeed) * breath * energy;

    /* покачивание */
    model.rotation.y =
      basePose.rotY +
      Math.sin(idlePhase * idle.swaySpeed) * bodySway * energy;

    /* лёгкий наклон головы */
    model.rotation.x =
      Math.sin(idlePhase * 0.4) * headTilt * energy;
  }
};

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

/* команды */
CommandBus.on('command', ({ text }) => {
  const t = text.toLowerCase();

  if (t.includes('успокой')) {
    ReiController.state.mood = 'calm';
    ReiController.state.energy = 0.25;
  }

  if (t.includes('улыб') || t.includes('рад')) {
    ReiController.state.mood = 'caring';
    ReiController.state.energy = 0.55;
  }

  if (t.includes('стоп')) {
    ReiController.state.energy = 0.0;
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

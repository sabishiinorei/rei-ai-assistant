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
camera.lookAt(0, 0/95, 0);

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

/* анимация */
function animate() {
  requestAnimationFrame(animate);

  if (reiModel) {
    reiModel.rotation.y = 0;
    reiModel.position.y = baseY;

    const breathe = 1 + Math.sin(Date.now() * 0.0015) * 0.01;
    reiModel.scale.y = 1.35 * breathe;
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

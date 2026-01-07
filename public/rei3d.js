import * as THREE from './libs/three.module.js';
import { GLTFLoader } from './libs/GLTFLoader.js';

console.log('rei3d.js module loaded');

const container = document.getElementById('rei-3d-container');
if (!container) {
  console.error('rei-3d-container NOT found');
  throw new Error('no container');
}

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  35,
  container.clientWidth / container.clientHeight,
  0.1,
  100
);
camera.position.set(0, 1.4, 3);

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true
});
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

/* свет */
scene.add(new THREE.AmbientLight(0xffffff, 0.7));

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(2, 3, 4);
scene.add(dirLight);

/* загрузка модели */
const loader = new GLTFLoader();
loader.load(
  './models/rei.glb',
  (gltf) => {
    const model = gltf.scene;
    model.scale.set(1, 1, 1);
    scene.add(model);
    console.log('REI MODEL LOADED');
  },
  undefined,
  (err) => console.error('GLTF ERROR', err)
);

/* рендер */
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

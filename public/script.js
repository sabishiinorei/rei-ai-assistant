import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const container = document.getElementById("rei-3d");
if (!container) throw new Error("rei-3d not found");

// сцена
const scene = new THREE.Scene();

// камера — ДАЛЬШЕ и НИЖЕ
const camera = new THREE.PerspectiveCamera(
  35,
  container.clientWidth / container.clientHeight,
  0.1,
  2000
);
camera.position.set(0, 1.6, 6);

// рендер
const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true
});
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// 🌍 ENV LIGHT (КЛЮЧ!)
scene.add(new THREE.AmbientLight(0xffffff, 1.5));

const keyLight = new THREE.DirectionalLight(0xffffff, 3);
keyLight.position.set(5, 10, 5);
scene.add(keyLight);

// загрузка
const loader = new GLTFLoader();
loader.load(
  "./rei.glb",
  (gltf) => {
    const model = gltf.scene;

    // 🔥 СКЕТЧФАБ = ОЧЕНЬ БОЛЬШОЙ
    model.scale.setScalar(0.02);

    // центрирование
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    scene.add(model);

    // авто-наведение камеры
    camera.lookAt(0, 1, 0);

    function animate() {
      requestAnimationFrame(animate);
      model.rotation.y += 0.002;
      renderer.render(scene, camera);
    }

    animate();
  },
  undefined,
  (e) => console.error("GLB ERROR", e)
);

// resize
window.addEventListener("resize", () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

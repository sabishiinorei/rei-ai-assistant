import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const container = document.getElementById("rei-3d");
if (!container) throw new Error("Контейнер #rei-3d не найден");

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  35,
  container.clientWidth / container.clientHeight,
  0.1,
  100
);
camera.position.set(0, 1.4, 2.5);

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true
});
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// 💡 свет
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));

const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
dirLight.position.set(2, 5, 2);
scene.add(dirLight);

// 🔥 ЗАГРУЗКА МОДЕЛИ
const loader = new GLTFLoader();

loader.load(
  "/rei.glb", // ⬅️ ВАЖНО
  (gltf) => {
    const model = gltf.scene;

    model.scale.set(1, 1, 1); // ⬅️ ВАЖНО
    
    // центрирование
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    model.position.y = -1;

    scene.add(model);

    // анимация
    function animate() {
      requestAnimationFrame(animate);
      model.rotation.y += 0.002;
      renderer.render(scene, camera);
    }
    animate();
  },
  undefined,
  (err) => {
    console.error("GLB LOAD ERROR:", err);
  }
);

// resize
window.addEventListener("resize", () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const container = document.getElementById("rei-3d");
if (!container) throw new Error("rei-3d not found");

// === SCENE ===
const scene = new THREE.Scene();

// === CAMERA ===
const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.01,
  1000
);
camera.position.set(0, 1.4, 3);

// === RENDERER ===
const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true
});
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// === LIGHTS (ВАЖНО) ===
scene.add(new THREE.AmbientLight(0xffffff, 1.2));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(5, 10, 5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
fillLight.position.set(-5, 5, 5);
scene.add(fillLight);

// === LOADER ===
const loader = new GLTFLoader();

loader.load(
  "./rei.glb",
  (gltf) => {
    const model = gltf.scene;

    // 🔥 МАГИЯ ДЛЯ SKETCHFAB
    model.scale.setScalar(0.01); // ← если не видно — меняй на 0.005 или 0.02
    model.rotation.y = Math.PI; // разворачиваем к камере

    // центрируем модель
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    model.position.y -= 0.9;

    // фиксим материалы
    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.material.side = THREE.FrontSide;
        obj.material.transparent = true;
      }
    });

    scene.add(model);

    // === ANIMATE ===
    function animate() {
      requestAnimationFrame(animate);
      model.rotation.y += 0.003;
      renderer.render(scene, camera);
    }
    animate();
  },
  undefined,
  (err) => {
    console.error("GLB ERROR:", err);
  }
);

// === RESIZE ===
window.addEventListener("resize", () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

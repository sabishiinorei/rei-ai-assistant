import * as THREE from "https://unpkg.com/three@0.159.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.159.0/examples/jsm/loaders/GLTFLoader.js";

const container = document.getElementById("rei-3d-container");
if (!container) {
  throw new Error("rei-3d-container not found");
}

// ===== SCENE =====
const scene = new THREE.Scene();

// ===== CAMERA =====
const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  100
);
camera.position.set(0, 1.4, 3);

// ===== RENDERER =====
const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true
});
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// ===== LIGHT =====
scene.add(new THREE.AmbientLight(0xffffff, 0.7));

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(2, 4, 3);
scene.add(dirLight);

// ===== MODEL =====
const loader = new GLTFLoader();

loader.load(
  "/models/rei.glb",
  (gltf) => {
    const model = gltf.scene;
    model.position.set(0, -1.2, 0);
    model.scale.set(1.1, 1.1, 1.1);
    scene.add(model);
    console.log("Rei загружена");
  },
  undefined,
  (err) => {
    console.error("GLB error:", err);
  }
);

// ===== LOOP =====
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

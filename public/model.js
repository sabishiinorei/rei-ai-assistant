import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

// === SCENE ===
const scene = new THREE.Scene();

// === CAMERA ===
const camera = new THREE.PerspectiveCamera(35, 400 / 600, 0.1, 100);
camera.position.set(0, 1.4, 2.5);

// === RENDERER ===
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(400, 600);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// === CONTAINER ===
const container = document.getElementById("rei-3d");
container.appendChild(renderer.domElement);

// === LIGHT ===
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(2, 5, 3);
scene.add(light);

// === MODEL ===
const loader = new GLTFLoader();
let rei;

loader.load(
  "/models/rei.glb",
  (gltf) => {
    rei = gltf.scene;
    rei.position.set(0, -1.1, 0);
    scene.add(rei);
  },
  undefined,
  (err) => console.error("GLB error:", err)
);

// === LOOP ===
function animate() {
  requestAnimationFrame(animate);
  if (rei) rei.rotation.y += 0.002;
  renderer.render(scene, camera);
}
animate();

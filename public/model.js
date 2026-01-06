import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

console.log("MODEL.JS START");

// scene
const scene = new THREE.Scene();

// camera
const camera = new THREE.PerspectiveCamera(35, 400 / 600, 0.1, 100);
camera.position.set(0, 1.4, 2.5);

// renderer
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(400, 600);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;

document.getElementById("rei-3d").appendChild(renderer.domElement);

// light
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dir = new THREE.DirectionalLight(0xffffff, 1.2);
dir.position.set(2, 5, 3);
scene.add(dir);

// model
const loader = new GLTFLoader();
let rei;

loader.load(
  "/models/rei.glb",
  (gltf) => {
    rei = gltf.scene;
    rei.scale.set(1.2, 1.2, 1.2);
    rei.position.set(0, -1.2, 0);
    scene.add(rei);
    console.log("MODEL LOADED");
  },
  undefined,
  (e) => console.error("GLB ERROR", e)
);

// loop
function animate() {
  requestAnimationFrame(animate);
  if (rei) rei.rotation.y += 0.002;
  renderer.render(scene, camera);
}
animate();

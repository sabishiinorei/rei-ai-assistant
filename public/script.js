const container3D = document.getElementById("rei-3d-container");

if (!container3D) {
  console.error("Нет контейнера 3D");
}

// ===== SCENE =====
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  container3D.clientWidth / container3D.clientHeight,
  0.1,
  100
);
camera.position.set(0, 1.3, 3);

// ===== RENDERER =====
const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true
});
renderer.setSize(container3D.clientWidth, container3D.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container3D.appendChild(renderer.domElement);

// ===== LIGHT =====
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

const light = new THREE.DirectionalLight(0xffffff, 0.9);
light.position.set(2, 4, 3);
scene.add(light);

// ===== MODEL =====
const loader = new THREE.GLTFLoader();

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
    console.error("Ошибка загрузки GLB:", err);
  }
);

// ===== LOOP =====
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

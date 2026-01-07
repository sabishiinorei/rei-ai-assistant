// Проверки
(function () {
  console.log('rei3d.js loaded');

  if (!window.THREE) {
    console.error('THREE not found');
    return;
  }

  const container = document.getElementById('rei-3d-container');
  if (!container) {
    console.error('rei-3d-container NOT found');
    return;
  }

  console.log('rei-3d-container found');

// Сцены
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  const camera = new THREE.PerspectiveCamera(
    35,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.z = 3;

// Рендерер
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

// Свет
  const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(1, 2, 3);
scene.add(light);

const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

// Загружаем модельку Рей
const loader = new THREE.GLTFLoader();

loader.load(
  '/models/rei.glb',
  (gltf) => {
    const model = gltf.scene;

    // База
    model.scale.set(1.2, 1.2, 1.2);
    model.position.set(0, -1.1, 0);
    model.rotation.y = Math.PI;

    // Фиксы
    model.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        obj.material.transparent = true;
        obj.material.depthWrite = false;
        obj.material.needsUpdate = true;
      }
    });

    scene.add(model);
    console.log('Rei model loaded');
  },
  undefined,
  (error) => {
    console.error('Rei model load error:', error);
  }
);


  animate();
})();

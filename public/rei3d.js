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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  const camera = new THREE.PerspectiveCamera(
    35,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.z = 3;

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(1, 1, 2);
  scene.add(light);

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  animate();
})();

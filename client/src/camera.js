import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createOrbitCamera(domElement) {
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.05,
    50
  );
  camera.position.set(-1.6, 1.8, 1.4);

  const controls = new OrbitControls(camera, domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.8;
  controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.update();

  let topDown = false;
  const saved = { pos: camera.position.clone(), target: controls.target.clone() };

  function toggleTopDown() {
    topDown = !topDown;
    if (topDown) {
      saved.pos.copy(camera.position);
      saved.target.copy(controls.target);
      camera.position.set(0, 3.2, 0.01);
      controls.target.set(0, 0, 0);
      controls.update();
    } else {
      camera.position.copy(saved.pos);
      controls.target.copy(saved.target);
      controls.update();
    }
    return topDown;
  }

  return { camera, controls, toggleTopDown };
}

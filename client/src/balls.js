import * as THREE from 'three';
import { TABLE, BALL_COLORS } from '@shared/constants.js';

const R = TABLE.ballRadius;

/**
 * Creates visual ball meshes (Groups). Physics state lives on the server.
 * Returns Map<id, THREE.Group>
 */
export function createBallMeshes() {
  const map = new Map();

  for (let id = 0; id <= 9; id++) {
    const group = new THREE.Group();

    const geom = new THREE.SphereGeometry(R, 32, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: BALL_COLORS[id],
      roughness: 0.25,
      metalness: 0.1
    });
    const sphere = new THREE.Mesh(geom, mat);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    group.add(sphere);

    if (id > 0) {
      const label = createNumberSprite(id);
      label.position.y = R * 0.15;
      group.add(label);
    }

    group.position.set(0, R, 0);
    group.visible = true;
    map.set(id, group);
  }
  return map;
}

/** Apply a server ball-state array to the visual meshes. */
export function syncBallMeshes(meshes, states) {
  for (const s of states) {
    const mesh = meshes.get(s.id);
    if (!mesh) continue;
    if (s.pocketed) {
      mesh.visible = false;
    } else {
      mesh.visible = true;
      mesh.position.set(s.x, R, s.z);
    }
  }
}

function createNumberSprite(number) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), size / 2, size / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const scale = R * 1.1;
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

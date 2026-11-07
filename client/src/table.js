import * as THREE from 'three';
import { TABLE, getPocketPositions } from '@shared/constants.js';

/**
 * Visual table only. Physics uses the same TABLE constants.
 */
export function createTable() {
  const group = new THREE.Group();

  // Cloth
  const clothGeom = new THREE.PlaneGeometry(TABLE.length, TABLE.width);
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0x0d5c2e,
    roughness: 0.85,
    metalness: 0.05
  });
  const cloth = new THREE.Mesh(clothGeom, clothMat);
  cloth.rotation.x = -Math.PI / 2;
  cloth.receiveShadow = true;
  group.add(cloth);

  // Rails
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x3a2a1a,
    roughness: 0.7,
    metalness: 0.1
  });

  const hw = TABLE.width / 2;
  const hl = TABLE.length / 2;
  const rw = TABLE.railWidth;
  const rh = TABLE.height;

  const longRailGeom = new THREE.BoxGeometry(TABLE.length + rw * 2, rh, rw);
  const railTop = new THREE.Mesh(longRailGeom, railMat);
  railTop.position.set(0, rh / 2, hw + rw / 2);
  railTop.castShadow = true;
  group.add(railTop);

  const railBottom = railTop.clone();
  railBottom.position.z = -(hw + rw / 2);
  group.add(railBottom);

  const shortRailGeom = new THREE.BoxGeometry(rw, rh, TABLE.width);
  const railLeft = new THREE.Mesh(shortRailGeom, railMat);
  railLeft.position.set(-(hl + rw / 2), rh / 2, 0);
  railLeft.castShadow = true;
  group.add(railLeft);

  const railRight = railLeft.clone();
  railRight.position.x = hl + rw / 2;
  group.add(railRight);

  // Corner posts
  const postGeom = new THREE.BoxGeometry(rw, rh, rw);
  [[-(hl + rw / 2), hw + rw / 2], [-(hl + rw / 2), -(hw + rw / 2)],
   [hl + rw / 2, hw + rw / 2], [hl + rw / 2, -(hw + rw / 2)]].forEach(([x, z]) => {
    const post = new THREE.Mesh(postGeom, railMat);
    post.position.set(x, rh / 2, z);
    group.add(post);
  });

  // Pockets
  const pocketMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
  getPocketPositions().forEach(pos => {
    const geom = new THREE.CylinderGeometry(TABLE.pocketRadius, TABLE.pocketRadius, 0.02, 24);
    const mesh = new THREE.Mesh(geom, pocketMat);
    mesh.position.set(pos.x, -0.005, pos.z);
    group.add(mesh);
  });

  // Edge line
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x0a4020 });
  const edgePoints = [
    new THREE.Vector3(-hl, 0.001, -hw),
    new THREE.Vector3(hl, 0.001, -hw),
    new THREE.Vector3(hl, 0.001, hw),
    new THREE.Vector3(-hl, 0.001, hw),
    new THREE.Vector3(-hl, 0.001, -hw)
  ];
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePoints), edgeMat));

  return group;
}

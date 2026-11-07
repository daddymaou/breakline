import * as THREE from 'three';
import { TABLE } from '@shared/constants.js';

const R = TABLE.ballRadius;

/**
 * Simple cue stick visual + aim line.
 */
export function createCue() {
  const group = new THREE.Group();

  // Stick
  const stickGeom = new THREE.CylinderGeometry(0.008, 0.012, 1.35, 12);
  const stickMat = new THREE.MeshStandardMaterial({ color: 0xc4a35a, roughness: 0.5 });
  const stick = new THREE.Mesh(stickGeom, stickMat);
  stick.rotation.z = Math.PI / 2;
  stick.position.x = -0.75;
  group.add(stick);

  // Tip
  const tipGeom = new THREE.CylinderGeometry(0.007, 0.008, 0.03, 10);
  const tipMat = new THREE.MeshStandardMaterial({ color: 0x2255aa });
  const tip = new THREE.Mesh(tipGeom, tipMat);
  tip.rotation.z = Math.PI / 2;
  tip.position.x = -0.08;
  group.add(tip);

  group.visible = false;
  return group;
}

/**
 * Aim line (thin cylinder or line) from cue ball in aim direction.
 */
export function createAimLine() {
  const mat = new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.7 });
  const geom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0)
  ]);
  const line = new THREE.Line(geom, mat);
  line.visible = false;
  return line;
}

/**
 * Position the cue behind the cue ball, pointing in the aim direction.
 * powerOffset pulls the cue back for a charging animation.
 */
export function updateCue(cue, cueBallPos, angle, powerOffset = 0) {
  if (!cueBallPos) {
    cue.visible = false;
    return;
  }
  cue.visible = true;
  const back = 0.18 + powerOffset * 0.55;
  cue.position.set(
    cueBallPos.x - Math.cos(angle) * back,
    R + 0.01,
    cueBallPos.z - Math.sin(angle) * back
  );
  cue.rotation.y = -angle;
}

export function updateAimLine(line, cueBallPos, angle, length = 1.6) {
  if (!cueBallPos) {
    line.visible = false;
    return;
  }
  line.visible = true;
  const points = [
    new THREE.Vector3(cueBallPos.x, 0.005, cueBallPos.z),
    new THREE.Vector3(
      cueBallPos.x + Math.cos(angle) * length,
      0.005,
      cueBallPos.z + Math.sin(angle) * length
    )
  ];
  line.geometry.setFromPoints(points);
}

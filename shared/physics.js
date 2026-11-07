/**
 * Pure deterministic-ish physics simulation.
 * No rendering, no DOM, no Three.js – safe to import on server and client.
 *
 * Fixed timestep. Balls are circles on a 2-D plane (y is always radius).
 * Supports: sphere-sphere collisions, cushion bounces, rolling friction,
 * pocket detection, optional english (side spin) that affects cue-ball path
 * after first contact in a simple way.
 */

import { TABLE, getPocketPositions } from './constants.js';

const R = TABLE.ballRadius;
const DT = 1 / 120; // fixed physics step
const MAX_STEPS = 120 * 25; // safety: 25 seconds max

/**
 * @typedef {Object} BallState
 * @property {number} id
 * @property {number} x
 * @property {number} z
 * @property {number} vx
 * @property {number} vz
 * @property {number} [wx]  // angular vel (for future spin)
 * @property {number} [wz]
 * @property {boolean} pocketed
 * @property {boolean} [active]
 */

/**
 * Create a fresh set of ball states (cue + 1-9) in a legal 9-ball rack.
 */
export function createInitialBalls() {
  const balls = [];
  for (let id = 0; id <= 9; id++) {
    balls.push({
      id,
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      wx: 0,
      wz: 0,
      pocketed: false,
      active: true
    });
  }
  rackNineBall(balls);
  return balls;
}

/** Standard diamond 9-ball rack. */
export function rackNineBall(balls) {
  const r = R;
  const footX = TABLE.length / 4;
  const headX = -TABLE.length / 4;
  const s = 2 * r * 1.02; // slight gap so they aren't perfectly overlapping at start

  const layout = [
    { id: 0, x: headX - 0.12, z: 0.06 },
    { id: 1, x: footX, z: 0 },
    { id: 2, x: footX + s * Math.sqrt(3) / 2, z: -s / 2 },
    { id: 3, x: footX + s * Math.sqrt(3) / 2, z:  s / 2 },
    { id: 4, x: footX + s * Math.sqrt(3), z: -s },
    { id: 9, x: footX + s * Math.sqrt(3), z: 0 },
    { id: 5, x: footX + s * Math.sqrt(3), z:  s },
    { id: 6, x: footX + 1.5 * s * Math.sqrt(3), z: -s / 2 },
    { id: 7, x: footX + 1.5 * s * Math.sqrt(3), z:  s / 2 },
    { id: 8, x: footX + 2 * s * Math.sqrt(3), z: 0 }
  ];

  layout.forEach(p => {
    const b = balls.find(bb => bb.id === p.id);
    if (b) {
      b.x = p.x;
      b.z = p.z;
      b.vx = 0;
      b.vz = 0;
      b.pocketed = false;
      b.active = true;
    }
  });
}

/**
 * Apply a shot to the cue ball.
 * @param {BallState[]} balls
 * @param {number} angle  radians (0 = +X, positive toward +Z)
 * @param {number} power  0..1
 * @param {number} [side] english -1..1 (simple lateral spin)
 * @param {number} [vert]  english -1..1 (follow / draw) – currently only affects first hit a little
 */
export function applyShot(balls, angle, power, side = 0, vert = 0) {
  const cue = balls.find(b => b.id === 0 && !b.pocketed);
  if (!cue) return;

  // Max cue speed ~ 8 m/s for a hard break
  const speed = power * 8.0;
  cue.vx = Math.cos(angle) * speed;
  cue.vz = Math.sin(angle) * speed;

  // Simple english: store as angular velocity; applied as a small velocity
  // correction after the first collision in the integrator.
  cue.wx = side * 30;
  cue.wz = vert * 20;
}

/**
 * Run the full simulation until everything stops (or max time).
 * Returns an array of snapshots for smooth client playback + final state.
 *
 * @param {BallState[]} startBalls  deep-copied inside
 * @returns {{ frames: BallState[][], final: BallState[], events: object[] }}
 */
export function simulateShot(startBalls) {
  // Deep copy
  let balls = startBalls.map(b => ({ ...b }));
  const frames = [];
  const events = [];
  const pockets = getPocketPositions();

  // Record initial
  frames.push(snapshot(balls));

  let firstContact = null; // { cueId, targetId } for rules
  let steps = 0;
  let frameInterval = 4; // record every 4 physics steps (~30 fps)
  let stepCounter = 0;

  while (steps < MAX_STEPS) {
    const moving = balls.some(b => !b.pocketed && (Math.hypot(b.vx, b.vz) > TABLE.minSpeed));
    if (!moving) break;

    // Integrate one fixed step
    integrate(balls, DT, pockets, events, (a, b) => {
      if (firstContact === null && (a.id === 0 || b.id === 0)) {
        firstContact = { a: a.id, b: b.id };
      }
    });

    steps++;
    stepCounter++;
    if (stepCounter >= frameInterval) {
      frames.push(snapshot(balls));
      stepCounter = 0;
    }
  }

  // Always push final resting state
  // Zero tiny velocities
  balls.forEach(b => {
    if (Math.hypot(b.vx, b.vz) < TABLE.minSpeed) {
      b.vx = 0;
      b.vz = 0;
    }
  });
  frames.push(snapshot(balls));

  return {
    frames,
    final: snapshot(balls),
    events,
    firstContact,
    duration: steps * DT
  };
}

function snapshot(balls) {
  return balls.map(b => ({
    id: b.id,
    x: b.x,
    z: b.z,
    vx: b.vx,
    vz: b.vz,
    pocketed: b.pocketed,
    active: b.active
  }));
}

function integrate(balls, dt, pockets, events, onCollision) {
  // 1. Apply friction & move
  for (const b of balls) {
    if (b.pocketed) continue;

    const speed = Math.hypot(b.vx, b.vz);
    if (speed > TABLE.minSpeed) {
      const decel = TABLE.rollingFriction * dt;
      const factor = Math.max(0, 1 - decel / speed);
      b.vx *= factor;
      b.vz *= factor;
    } else {
      b.vx = 0;
      b.vz = 0;
    }

    b.x += b.vx * dt;
    b.z += b.vz * dt;
  }

  // 2. Ball-ball collisions (simple sequential, good enough for pool)
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.pocketed) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.pocketed) continue;

      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      const minDist = 2 * R;

      if (dist < minDist && dist > 1e-8) {
        // Resolve overlap
        const overlap = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        a.x -= nx * overlap * 0.5;
        a.z -= nz * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.z += nz * overlap * 0.5;

        // Relative velocity along normal
        const dvx = a.vx - b.vx;
        const dvz = a.vz - b.vz;
        const vn = dvx * nx + dvz * nz;

        if (vn > 0) continue; // separating

        // Impulse (equal mass)
        const e = TABLE.ballRestitution;
        const jImp = -(1 + e) * vn / 2;
        a.vx += jImp * nx;
        a.vz += jImp * nz;
        b.vx -= jImp * nx;
        b.vz -= jImp * nz;

        // Simple english transfer from cue
        if (a.id === 0 && (a.wx || a.wz)) {
          b.vx += a.wx * 0.015;
          b.vz += a.wz * 0.015;
          a.wx *= 0.3;
          a.wz *= 0.3;
        } else if (b.id === 0 && (b.wx || b.wz)) {
          a.vx += b.wx * 0.015;
          a.vz += b.wz * 0.015;
          b.wx *= 0.3;
          b.wz *= 0.3;
        }

        onCollision?.(a, b);
        events.push({ type: 'hit', a: a.id, b: b.id, t: 0 });
      }
    }
  }

  // 3. Cushion collisions
  const hl = TABLE.length / 2 - R;
  const hw = TABLE.width / 2 - R;
  const eC = TABLE.cushionRestitution;

  for (const b of balls) {
    if (b.pocketed) continue;

    if (b.x < -hl) {
      b.x = -hl;
      b.vx = -b.vx * eC;
      events.push({ type: 'cushion', id: b.id });
    } else if (b.x > hl) {
      b.x = hl;
      b.vx = -b.vx * eC;
      events.push({ type: 'cushion', id: b.id });
    }
    if (b.z < -hw) {
      b.z = -hw;
      b.vz = -b.vz * eC;
      events.push({ type: 'cushion', id: b.id });
    } else if (b.z > hw) {
      b.z = hw;
      b.vz = -b.vz * eC;
      events.push({ type: 'cushion', id: b.id });
    }
  }

  // 4. Pocket detection
  for (const b of balls) {
    if (b.pocketed) continue;
    for (const p of pockets) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < TABLE.pocketRadius - R * 0.25) {
        b.pocketed = true;
        b.vx = 0;
        b.vz = 0;
        b.x = p.x;
        b.z = p.z;
        events.push({ type: 'pocket', id: b.id });
        break;
      }
    }
  }
}

/**
 * Quick helper used by the server rules engine.
 */
export function getLowestUnpocketed(balls) {
  let lowest = 10;
  for (const b of balls) {
    if (!b.pocketed && b.id >= 1 && b.id < lowest) lowest = b.id;
  }
  return lowest === 10 ? null : lowest;
}

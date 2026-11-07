/**
 * Shared constants used by both client (visuals) and server (physics + rules).
 * Units: meters, seconds, radians.
 */

export const TABLE = {
  length: 2.84,          // long axis (X)
  width: 1.42,           // short axis (Z)
  height: 0.05,          // rail height
  railWidth: 0.08,
  pocketRadius: 0.055,
  ballRadius: 0.0286,    // ~2¼ inch
  cushionRestitution: 0.82,
  ballRestitution: 0.94,
  rollingFriction: 0.18, // linear deceleration (m/s²)
  spinningFriction: 1.2, // angular deceleration
  minSpeed: 0.005,       // below this → stop
  gravity: 9.81
};

/** Pocket centers on the cloth plane (y = 0). */
export function getPocketPositions() {
  const hl = TABLE.length / 2;
  const hw = TABLE.width / 2;
  const inset = 0.012;
  return [
    { x: -hl + inset, z: -hw + inset },
    { x:  0,          z: -hw + inset },
    { x:  hl - inset, z: -hw + inset },
    { x: -hl + inset, z:  hw - inset },
    { x:  0,          z:  hw - inset },
    { x:  hl - inset, z:  hw - inset }
  ];
}

export const BALL_COLORS = [
  0xffffff, // 0 cue
  0xf0c000, // 1
  0x0055cc, // 2
  0xcc0000, // 3
  0x4b0082, // 4
  0xff6600, // 5
  0x006600, // 6
  0x660000, // 7
  0x111111, // 8
  0xf0c000  // 9
];

/**
 * Aim + power while it is the local player's turn.
 *
 * Controls (kept simple for learning):
 *   A / ←   rotate aim left
 *   D / →   rotate aim right
 *   Hold Space  charge power
 *   Release Space  shoot
 *   Mouse drag left/right  also adjusts aim
 */

export function createInputController({ onAim, onPower, onShoot, getCueBallPos, isMyTurn }) {
  let angle = 0;
  let power = 0;
  let charging = false;
  let enabled = false;

  const powerEl = document.getElementById('powerFill');
  const powerPct = document.getElementById('powerPct');
  const powerWrap = document.getElementById('powerWrap');

  function setEnabled(v) {
    enabled = v;
    if (powerWrap) powerWrap.style.display = v ? 'flex' : 'none';
    if (!v) {
      charging = false;
      power = 0;
      updatePowerUI();
    }
  }

  function updatePowerUI() {
    if (!powerEl) return;
    const pct = Math.round(power * 100);
    powerEl.style.width = pct + '%';
    if (powerPct) powerPct.textContent = pct + '%';
  }

  const keys = new Set();

  window.addEventListener('keydown', e => {
    keys.add(e.code);
    if (!enabled || !isMyTurn()) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!charging) {
        charging = true;
        power = 0;
        updatePowerUI();
        onPower?.(0);
      }
    }
  });

  window.addEventListener('keyup', e => {
    keys.delete(e.code);
    if (e.code === 'Space' && charging) {
      charging = false;
      if (power > 0.04) {
        onShoot?.({ angle, power });
      }
      power = 0;
      updatePowerUI();
      onPower?.(0);
    }
  });

  // Mouse drag for aim
  let dragging = false;
  let lastX = 0;

  function onDown(e) {
    if (!enabled || !isMyTurn()) return;
    if (e.button === 0) {
      dragging = true;
      lastX = e.clientX;
    }
  }
  function onMove(e) {
    if (!enabled || !isMyTurn() || !dragging || charging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    angle -= dx * 0.005;
    onAim?.(angle);
  }
  function onUp() {
    dragging = false;
  }

  function tick(dt) {
    if (!enabled || !isMyTurn()) return;

    const speed = 1.5 * dt;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) {
      angle += speed;
      onAim?.(angle);
    }
    if (keys.has('KeyD') || keys.has('ArrowRight')) {
      angle -= speed;
      onAim?.(angle);
    }

    if (charging && keys.has('Space')) {
      power = Math.min(1, power + dt * 0.6);
      updatePowerUI();
      onPower?.(power);
    }
  }

  return {
    setEnabled,
    getAngle: () => angle,
    setAngle: (a) => { angle = a; onAim?.(angle); },
    tick,
    bind(dom) {
      dom.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
  };
}

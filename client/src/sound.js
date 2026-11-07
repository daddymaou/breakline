/**
 * Minimal sound effects using Web Audio API (no external files).
 */
let ctx = null;

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function beep(freq, duration, type = 'sine', gain = 0.08) {
  try {
    const c = ensure();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(g);
    g.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + duration);
  } catch (_) {}
}

export const sound = {
  hit() { beep(180 + Math.random() * 80, 0.06, 'triangle', 0.1); },
  cushion() { beep(90, 0.08, 'sine', 0.07); },
  pocket() { beep(120, 0.15, 'sine', 0.12); beep(80, 0.25, 'sine', 0.08); },
  shoot() { beep(60, 0.1, 'sawtooth', 0.05); }
};

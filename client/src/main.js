import * as THREE from 'three';
import { createTable } from './table.js';
import { createBallMeshes, syncBallMeshes } from './balls.js';
import { createOrbitCamera } from './camera.js';
import { createCue, createAimLine, updateCue, updateAimLine } from './cue.js';
import { createInputController } from './input.js';
import { createNetwork } from './network.js';
import { sound } from './sound.js';
import { TABLE } from '@shared/constants.js';

// ---------- Renderer & Scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0x404060, 0.6);
scene.add(ambient);
const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(2, 8, 3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 20;
keyLight.shadow.camera.left = -3;
keyLight.shadow.camera.right = 3;
keyLight.shadow.camera.top = 3;
keyLight.shadow.camera.bottom = -3;
scene.add(keyLight);
const fill = new THREE.DirectionalLight(0x8899ff, 0.35);
fill.position.set(-4, 4, -2);
scene.add(fill);

// ---------- Table & balls ----------
scene.add(createTable());
const ballMeshes = createBallMeshes();
ballMeshes.forEach(m => scene.add(m));

const cue = createCue();
scene.add(cue);
const aimLine = createAimLine();
scene.add(aimLine);

const { camera, controls, toggleTopDown } = createOrbitCamera(renderer.domElement);

// ---------- Game state (client mirror) ----------
let mySeat = -1;
let roomState = null;
let animating = false;
let animFrames = [];
let animStart = 0;
let animDuration = 1;
let currentAngle = 0;
let currentPower = 0;

// ---------- UI helpers ----------
const $ = (id) => document.getElementById(id);
const lobby = $('lobby');
const ui = $('ui');
const statusEl = $('status');
const roomEl = $('room');
const messageEl = $('message');
const gameoverEl = $('gameover');
const winnerText = $('winnerText');
const connectionEl = $('connection');
const lobbyErrorEl = $('lobbyError');
const createButton = $('btnCreate');
const joinButton = $('btnJoin');
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const placementPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const placementPoint = new THREE.Vector3();
let placementPending = false;
let messageTimer = null;

function showMessage(msg) {
  messageEl.textContent = msg || '';
  clearTimeout(messageTimer);
  if (msg) messageTimer = setTimeout(() => { messageEl.textContent = ''; }, 5000);
}

function updateStatus() {
  if (!roomState) return;
  const players = roomState.players || [];
  const names = [0, 1].map(seat => {
    const player = players.find(p => p.seat === seat);
    return player ? `${player.name}${player.connected === false ? ' (offline)' : ''}` : 'Waiting…';
  });
  roomEl.textContent = `ROOM ${roomState.code}  ·  ${names[0]}  VS  ${names[1]}`;

  if (roomState.phase === 'waiting') {
    statusEl.textContent = 'Waiting for your opponent';
    input.setEnabled(false);
  } else if (animating) {
    statusEl.textContent = 'Watching the shot…';
    input.setEnabled(false);
  } else if (roomState.phase === 'gameover') {
    statusEl.textContent = 'Game over';
    input.setEnabled(false);
    gameoverEl.style.display = 'grid';
    const w = roomState.winner;
    winnerText.textContent = w === mySeat ? 'You win!' : (players[w]?.name || 'Opponent') + ' wins';
    $('resultDetail').textContent = 'The nine is down. Ready to play another rack?';
  } else if (roomState.turn === mySeat) {
    statusEl.textContent = roomState.ballInHand ? 'Ball in hand — choose a clear spot' : 'Your shot';
    input.setEnabled(!roomState.ballInHand);
  } else {
    statusEl.textContent = `${players[roomState.turn]?.name || 'Opponent'} is shooting`;
    input.setEnabled(false);
  }
  $('btnCopy').disabled = !roomState.code;
  updateCueVisual();
}

// ---------- Network ----------
const net = createNetwork({
  onState(state) {
    roomState = state;
    placementPending = false;
    syncBallMeshes(ballMeshes, state.balls);
    animating = false;
    if (state.phase !== 'gameover') gameoverEl.style.display = 'none';
    updateStatus();
    if (state.lastResult) showShotFeedback(state.lastResult);
  },
  onShotResult(data) {
    // Play trajectory
    animFrames = data.frames || [];
    animDuration = Math.max(0.4, data.duration || 1);
    animStart = performance.now();
    animating = true;
    roomState = {
      ...roomState,
      turn: data.turn,
      phase: data.phase,
      ballInHand: data.ballInHand,
      winner: data.winner,
      lastResult: data.result
    };
    updateStatus();
    cue.visible = false;
    aimLine.visible = false;
    sound.shoot();

    // Play event sounds roughly
    if (data.result?.pocketed?.length) {
      setTimeout(() => sound.pocket(), 300);
    }
  },
  onMessage(msg) {
    showMessage(msg);
  },
  onConnection(connected, error) {
    connectionEl.dataset.online = String(connected);
    connectionEl.textContent = connected ? 'SERVER CONNECTED' : 'RECONNECTING…';
    if (connected && !roomState) lobbyErrorEl.textContent = '';
    if (error && !roomState) lobbyErrorEl.textContent = 'Can’t reach the game server. Check that it is running and try again.';
  }
});

function showShotFeedback(result) {
  if (result.foul) {
    showMessage(`Foul — ${result.foulReason || 'play passes to your opponent'}. Ball in hand.`);
  } else if (result.pocketed?.length) {
    const pocketed = result.pocketed.filter(id => id > 0);
    if (pocketed.length) showMessage(`Pocketed ${pocketed.map(id => `#${id}`).join(', ')}${result.continueTurn ? ' · shoot again' : ''}`);
  } else if (result.continueTurn) {
    showMessage('Legal hit — you stay at the table');
  }
}

// ---------- Input ----------
const input = createInputController({
  onAim(a) {
    currentAngle = a;
    updateCueVisual();
  },
  onPower(p) {
    currentPower = p;
    updateCueVisual();
  },
  onShoot({ angle, power }) {
    if (animating || !roomState || roomState.turn !== mySeat) return;
    input.setEnabled(false);
    net.sendShot({ angle, power, side: 0, vert: 0 }).then(result => {
      if (!result?.ok) {
        showMessage(result?.error || 'Shot was not accepted');
        updateStatus();
      }
    });
  },
  getCueBallPos() {
    const cueState = roomState?.balls?.find(b => b.id === 0 && !b.pocketed);
    return cueState ? { x: cueState.x, z: cueState.z } : null;
  },
  isMyTurn() {
    return roomState && roomState.phase === 'playing' && roomState.turn === mySeat && !animating;
  }
});
input.bind(renderer.domElement);

function updateCueVisual() {
  const pos = input.getCueBallPos?.() || (roomState?.balls?.find(b => b.id === 0 && !b.pocketed));
  if (!pos || animating || roomState?.turn !== mySeat || roomState?.ballInHand || roomState?.phase !== 'playing') {
    cue.visible = false;
    aimLine.visible = false;
    return;
  }
  const p = { x: pos.x, z: pos.z };
  updateCue(cue, p, currentAngle, currentPower);
  updateAimLine(aimLine, p, currentAngle);
}

// ---------- Lobby buttons ----------
$('btnCreate').onclick = async () => {
  lobbyErrorEl.textContent = '';
  createButton.disabled = true;
  joinButton.disabled = true;
  const name = $('nameInput').value.trim() || 'Player';
  const res = await net.create(name);
  if (res?.ok) {
    mySeat = res.seat;
    roomState = res.state;
    lobby.style.display = 'none';
    ui.style.display = 'flex';
    $('btnTopDown').style.display = 'inline-block';
    syncBallMeshes(ballMeshes, roomState.balls);
    updateStatus();
    showMessage('Share code: ' + roomState.code);
  } else {
    lobbyErrorEl.textContent = res?.error || 'Could not create a table';
    createButton.disabled = false;
    joinButton.disabled = false;
  }
};

$('btnJoin').onclick = async () => {
  lobbyErrorEl.textContent = '';
  createButton.disabled = true;
  joinButton.disabled = true;
  const name = $('nameInput').value.trim() || 'Player';
  const code = $('codeInput').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) {
    lobbyErrorEl.textContent = 'Enter a room code to join.';
    createButton.disabled = false;
    joinButton.disabled = false;
    return;
  }
  $('codeInput').value = code;
  const res = await net.join(code, name);
  if (res?.ok) {
    mySeat = res.seat;
    roomState = res.state;
    lobby.style.display = 'none';
    ui.style.display = 'flex';
    $('btnTopDown').style.display = 'inline-block';
    syncBallMeshes(ballMeshes, roomState.balls);
    updateStatus();
  } else {
    lobbyErrorEl.textContent = res?.error || 'Could not join that table';
    createButton.disabled = false;
    joinButton.disabled = false;
  }
};

$('btnJoinFocus').onclick = () => $('codeInput').focus();
$('codeInput').addEventListener('input', () => {
  $('codeInput').value = $('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
});
$('codeInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') joinButton.click();
});

$('btnCopy').onclick = async () => {
  if (!roomState?.code) return;
  try {
    await navigator.clipboard.writeText(roomState.code);
    showMessage(`Room code ${roomState.code} copied`);
  } catch (error) {
    showMessage(`Share room code: ${roomState.code}`);
  }
};

$('btnRematch').onclick = async () => {
  $('btnRematch').disabled = true;
  const result = await net.rematch();
  $('btnRematch').disabled = false;
  if (!result?.ok) {
    showMessage(result?.error || 'Could not start a rematch');
    return;
  }
  gameoverEl.style.display = 'none';
};

$('btnTopDown').onclick = () => {
  const td = toggleTopDown();
  $('btnTopDown').textContent = td ? 'Orbit' : 'Top-down';
};

// ---------- Animation loop ----------
let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  input.tick(dt);

  // Playback of server frames
  if (animating && animFrames.length) {
    const t = (now - animStart) / 1000;
    const u = Math.min(1, t / animDuration);
    const idx = Math.min(animFrames.length - 1, Math.floor(u * (animFrames.length - 1)));
    syncBallMeshes(ballMeshes, animFrames[idx]);
    if (u >= 1) {
      animating = false;
      if (roomState?.phase === 'animating') {
        roomState.phase = roomState.winner != null ? 'gameover' : 'playing';
      }
      // Final resync already comes via 'state' event, but ensure
      if (animFrames.length) {
        syncBallMeshes(ballMeshes, animFrames[animFrames.length - 1]);
      }
      updateStatus();
      updateCueVisual();
    }
  }

  controls.update();
  renderer.render(scene, camera);
}
animate(performance.now());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.domElement.addEventListener('pointerdown', async event => {
  if (!roomState?.ballInHand || roomState.turn !== mySeat || animating || placementPending) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  pointer.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(pointer, camera);
  if (!raycaster.ray.intersectPlane(placementPlane, placementPoint)) return;
  placementPending = true;
  const result = await net.placeCue(placementPoint.x, placementPoint.z);
  if (!result?.ok) {
    placementPending = false;
    showMessage(result?.error || 'That is not a valid cue ball position');
  }
}, true);

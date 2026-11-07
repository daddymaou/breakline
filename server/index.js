/**
 * Authoritative pool server.
 * - Rooms by short code
 * - Only the active player may send a shot
 * - Server runs physics + rules, broadcasts trajectory + final state
 * - Handles disconnect / reconnect
 */

import { createServer } from 'http';
import { Server } from 'socket.io';
import { randomBytes } from 'crypto';
import { createInitialBalls, applyShot, simulateShot } from '../shared/physics.js';
import { createRules } from '../shared/rules.js';
import { TABLE } from '../shared/constants.js';

const PORT = process.env.PORT || 3001;
const rules = createRules('nineball');
const TABLE_HEAD = -TABLE.length / 4;

const httpServer = createServer((req, res) => {
  // Simple health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: { origin: '*' }
});

/** @type {Map<string, Room>} */
const rooms = new Map();

function makeCode() {
  // 5-char uppercase code, easy to share
  return randomBytes(3).toString('hex').slice(0, 5).toUpperCase();
}

function normalizeName(value, fallback) {
  const name = typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16)
    : '';
  return name || fallback;
}

/**
 * @typedef {Object} Player
 * @property {string} id        socket.id
 * @property {string} name
 * @property {number} seat      0 or 1
 */

/**
 * @typedef {Object} Room
 * @property {string} code
 * @property {Player[]} players
 * @property {Array} balls
 * @property {number} turn      seat of current shooter
 * @property {string} phase     'waiting' | 'playing' | 'animating' | 'gameover'
 * @property {object|null} lastResult
 * @property {boolean} ballInHand
 * @property {number|null} winner
 */

function createRoom(code) {
  /** @type {Room} */
  const room = {
    code,
    players: [],
    balls: createInitialBalls(),
    turn: 0,
    phase: 'waiting',
    lastResult: null,
    ballInHand: false,
    winner: null
  };
  rooms.set(code, room);
  return room;
}

function publicState(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({
      seat: p.seat,
      name: p.name,
      connected: io.sockets.sockets.has(p.id)
    })),
    balls: room.balls,
    turn: room.turn,
    phase: room.phase,
    ballInHand: room.ballInHand,
    winner: room.winner,
    lastResult: room.lastResult
  };
}

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  socket.on('create', (payload = {}, cb) => {
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    const room = createRoom(code);
    const player = { id: socket.id, name: normalizeName(payload.name, 'Player 1'), seat: 0 };
    room.players.push(player);
    socket.join(code);
    socket.data.code = code;
    socket.data.seat = 0;
    console.log(`Room ${code} created by ${player.name}`);
    cb?.({ ok: true, code, seat: 0, state: publicState(room) });
  });

  socket.on('join', (payload = {}, cb) => {
    let code = typeof payload.code === 'string' ? payload.code.toUpperCase().trim() : '';
    const name = normalizeName(payload.name, 'Player');
    const room = rooms.get(code);
    if (!room) {
      cb?.({ ok: false, error: 'Room not found' });
      return;
    }
    const existing = room.players.find(p =>
      p.name.toLowerCase() === name.toLowerCase() && !io.sockets.sockets.has(p.id)
    );
    if (existing) {
      existing.id = socket.id;
      socket.join(code);
      socket.data.code = code;
      socket.data.seat = existing.seat;
      cb?.({ ok: true, code, seat: existing.seat, state: publicState(room) });
      io.to(code).emit('state', publicState(room));
      io.to(code).emit('message', `${name} reconnected`);
      return;
    }
    if (room.players.length >= 2) {
      cb?.({ ok: false, error: 'Room is full' });
      return;
    }

    const player = { id: socket.id, name, seat: 1 };
    room.players.push(player);
    room.phase = 'playing';
    socket.join(code);
    socket.data.code = code;
    socket.data.seat = 1;
    console.log(`${player.name} joined ${code}`);
    cb?.({ ok: true, code, seat: 1, state: publicState(room) });
    io.to(code).emit('state', publicState(room));
    io.to(code).emit('message', `${player.name} joined – game starts`);
  });

  socket.on('shot', (payload = {}, cb) => {
    const { angle, power: requestedPower, side: requestedSide = 0, vert: requestedVert = 0 } = payload || {};
    const code = socket.data.code;
    const seat = socket.data.seat;
    const room = rooms.get(code);
    if (!room) {
      cb?.({ ok: false, error: 'No room' });
      return;
    }
    if (room.phase !== 'playing') {
      cb?.({ ok: false, error: 'Not your turn / game not ready' });
      return;
    }
    if (room.turn !== seat) {
      cb?.({ ok: false, error: 'Not your turn' });
      return;
    }
    if (!Number.isFinite(angle) || !Number.isFinite(requestedPower) || requestedPower <= 0.04 ||
      !Number.isFinite(requestedSide) || !Number.isFinite(requestedVert)) {
      cb?.({ ok: false, error: 'Invalid shot data' });
      return;
    }
    let power = requestedPower;
    let side = requestedSide;
    let vert = requestedVert;
    power = Math.max(0, Math.min(1, power));
    side = Math.max(-1, Math.min(1, side || 0));
    vert = Math.max(-1, Math.min(1, vert || 0));

    // Snapshot before
    const before = room.balls.map(b => ({ ...b }));

    // Apply & simulate on server
    applyShot(room.balls, angle, power, side, vert);
    const sim = simulateShot(room.balls);

    // Rules
    const evalResult = rules.evaluate({
      before,
      after: sim.final,
      firstContact: sim.firstContact,
      events: sim.events,
      shooter: seat
    });

    if (evalResult.foul && evalResult.ninePocketed) {
      const nine = sim.final.find(ball => ball.id === 9);
      if (nine) {
        const spotX = TABLE.length / 4;
        const radius = TABLE.ballRadius * 2 + 0.001;
        let x = spotX;
        while (sim.final.some(ball =>
          ball.id !== 9 && !ball.pocketed && Math.hypot(ball.x - x, ball.z) < radius
        ) && x > -TABLE.length / 2 + TABLE.ballRadius) {
          x -= 0.005;
        }
        Object.assign(nine, { x, z: 0, vx: 0, vz: 0, pocketed: false });
        sim.frames[sim.frames.length - 1] = sim.final.map(ball => ({ ...ball }));
      }
    }

    // Commit final state
    room.balls = sim.final;
    room.lastResult = evalResult;
    room.phase = 'animating';

    // Handle turn / game over
    if (evalResult.gameOver) {
      room.phase = 'gameover';
      room.winner = evalResult.winner;
    } else if (evalResult.foul) {
      room.ballInHand = true;
      room.turn = 1 - seat;
      // Re-spot cue if scratched
      if (evalResult.scratch) {
        const cue = room.balls.find(b => b.id === 0);
        if (cue) {
          cue.pocketed = false;
          cue.x = TABLE_HEAD;
          cue.z = 0;
          cue.vx = 0;
          cue.vz = 0;
        }
      }
    } else if (evalResult.continueTurn) {
      // same player keeps turn
      room.ballInHand = false;
    } else {
      room.turn = 1 - seat;
      room.ballInHand = false;
    }
    if (sim.frames.length) {
      sim.frames[sim.frames.length - 1] = room.balls.map(ball => ({ ...ball }));
    }

    // Broadcast trajectory so clients can animate
    io.to(code).emit('shotResult', {
      frames: sim.frames,
      final: sim.final,
      result: evalResult,
      turn: room.turn,
      phase: room.phase,
      ballInHand: room.ballInHand,
      winner: room.winner,
      duration: sim.duration
    });

    // After animation time, clients will set phase back to playing
    // We also send a final state for resync
    setTimeout(() => {
      if (room.phase === 'animating') {
        room.phase = room.winner !== null ? 'gameover' : 'playing';
      }
      io.to(code).emit('state', publicState(room));
    }, Math.min(sim.duration * 1000 + 400, 12000));

    cb?.({ ok: true });
  });

  socket.on('placeCue', (payload = {}, cb) => {
    const { x, z } = payload || {};
    const code = socket.data.code;
    const seat = socket.data.seat;
    const room = rooms.get(code);
    if (!room || room.phase !== 'playing' || !room.ballInHand || room.turn !== seat) {
      cb?.({ ok: false, error: 'Cue ball cannot be placed right now' });
      return;
    }
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      cb?.({ ok: false, error: 'Choose a valid position on the table' });
      return;
    }
    const cue = room.balls.find(b => b.id === 0);
    if (!cue) {
      cb?.({ ok: false, error: 'Cue ball is unavailable' });
      return;
    }
    const limitX = TABLE.length / 2 - TABLE.ballRadius;
    const limitZ = TABLE.width / 2 - TABLE.ballRadius;
    if (Math.abs(x) > limitX || Math.abs(z) > limitZ) {
      cb?.({ ok: false, error: 'Place the cue ball on the playing surface' });
      return;
    }
    const clearOfBalls = room.balls.every(ball =>
      ball.id === 0 || ball.pocketed ||
      Math.hypot(ball.x - x, ball.z - z) >= TABLE.ballRadius * 2 + 0.001
    );
    if (!clearOfBalls) {
      cb?.({ ok: false, error: 'Cue ball must not overlap another ball' });
      return;
    }
    cue.x = x;
    cue.z = z;
    cue.vx = 0;
    cue.vz = 0;
    cue.pocketed = false;
    room.ballInHand = false;
    io.to(code).emit('state', publicState(room));
    cb?.({ ok: true });
  });

  socket.on('rematch', (cb) => {
    const code = socket.data.code;
    const room = rooms.get(code);
    if (!room || room.phase !== 'gameover') {
      cb?.({ ok: false, error: 'A rematch is not available yet' });
      return;
    }
    room.balls = createInitialBalls();
    room.turn = 0;
    room.phase = 'playing';
    room.lastResult = null;
    room.ballInHand = false;
    room.winner = null;
    io.to(code).emit('state', publicState(room));
    io.to(code).emit('message', 'Rematch started');
    cb?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      console.log(`${player.name} disconnected from ${code}`);
      io.to(code).emit('message', `${player.name} disconnected – waiting for reconnect`);
      io.to(code).emit('state', publicState(room));
      // Keep the seat so they can rejoin with same name
    }

    // Optional: destroy empty rooms after a while
    setTimeout(() => {
      const r = rooms.get(code);
      if (r && r.players.every(p => !io.sockets.sockets.has(p.id))) {
        rooms.delete(code);
        console.log(`Room ${code} cleaned up`);
      }
    }, 5 * 60 * 1000);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Pool server listening on :${PORT}`);
});

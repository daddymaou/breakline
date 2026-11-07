import { io } from 'socket.io-client';

/**
 * Connects to the authoritative server.
 * In development Vite proxies /socket.io → :3001.
 * For production you can set VITE_SERVER_URL.
 */
export function createNetwork({ onState, onShotResult, onMessage, onConnection }) {
  const url = import.meta.env.VITE_SERVER_URL || undefined; // same origin + proxy
  const socket = io(url, {
    transports: ['websocket', 'polling'],
    autoConnect: false
  });

  socket.on('connect', () => {
    console.log('socket connected', socket.id);
    onConnection?.(true);
  });
  socket.on('disconnect', () => {
    console.log('socket disconnected');
    onConnection?.(false);
  });
  socket.on('connect_error', (error) => {
    onConnection?.(false, error.message);
  });
  socket.on('state', (state) => onState?.(state));
  socket.on('shotResult', (data) => onShotResult?.(data));
  socket.on('message', (msg) => onMessage?.(msg));

  function create(name) {
    return new Promise((resolve) => {
      if (!socket.connected) socket.connect();
      socket.timeout(8000).emit('create', { name }, (error, res) => {
        resolve(error ? { ok: false, error: 'Could not reach the game server' } : res);
      });
    });
  }

  function join(code, name) {
    return new Promise((resolve) => {
      if (!socket.connected) socket.connect();
      socket.timeout(8000).emit('join', { code, name }, (error, res) => {
        resolve(error ? { ok: false, error: 'Could not reach the game server' } : res);
      });
    });
  }

  function sendShot(payload) {
    return new Promise((resolve) => {
      socket.timeout(8000).emit('shot', payload, (error, res) => {
        resolve(error ? { ok: false, error: 'Shot was not confirmed by the server' } : res);
      });
    });
  }

  function placeCue(x, z) {
    return new Promise((resolve) => {
      socket.timeout(8000).emit('placeCue', { x, z }, (error, res) => {
        resolve(error ? { ok: false, error: 'Cue placement was not confirmed' } : res);
      });
    });
  }

  function rematch() {
    return new Promise((resolve) => {
      socket.timeout(8000).emit('rematch', (error, res) => {
        resolve(error ? { ok: false, error: 'Rematch was not confirmed' } : res);
      });
    });
  }

  return { create, join, sendShot, placeCue, rematch, socket };
}

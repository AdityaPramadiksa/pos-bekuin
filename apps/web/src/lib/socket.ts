import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';

/** Origin API untuk Socket.IO; kosong = alamat yang sama (proxy dev). */
const SOCKET_ORIGIN = /^https?:\/\//.test(API_URL) ? new URL(API_URL).origin : undefined;

export function createSocket(getToken: () => string | null): Socket {
  return io(SOCKET_ORIGIN ?? '/', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: (cb) => cb(getToken() ? { token: getToken() } : {}),
  });
}

/** Bunyi "ting-ting" pendek tanpa file audio (Web Audio API). */
export function playChime() {
  try {
    const ctx = new AudioContext();
    [0, 0.18].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i === 0 ? 880 : 1320;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    // browser memblokir audio sebelum ada interaksi; abaikan
  }
}

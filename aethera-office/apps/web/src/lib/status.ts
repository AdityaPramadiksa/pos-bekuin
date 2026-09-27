import type { AgentStatus, RunStatus } from '@aethera/shared';

export const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Menunggu',
  working: 'Bekerja',
  blocked: 'Tertahan',
  error: 'Error',
  done: 'Selesai',
};

/** Warna status dipakai HUD dan scene 3D (tetap konsisten). */
export const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: '#8b8aa3',
  working: '#8b5cf6',
  blocked: '#f59e0b',
  error: '#ef4444',
  done: '#22c55e',
};

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  running: 'Berjalan',
  completed: 'Selesai',
  failed: 'Gagal',
};

export const RUN_STATUS_COLOR: Record<RunStatus, string> = {
  running: '#8b5cf6',
  completed: '#22c55e',
  failed: '#ef4444',
};

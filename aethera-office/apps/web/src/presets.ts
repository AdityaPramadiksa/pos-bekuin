import type { AgentDefinition } from '@aethera/shared';

export interface AgentPreset extends AgentDefinition {
  defaultTask: string;
}

export interface TeamPreset {
  id: string;
  name: string;
  description: string;
  agents: AgentPreset[];
}

/** Posisi meja (grid) mengikuti tata letak kantor 3D: dua baris meja menghadap depan. */
export const TEAM_PRESETS: TeamPreset[] = [
  {
    id: 'produk',
    name: 'Tim produk',
    description: 'Analis, arsitek, developer, dan QA mengerjakan satu fitur kecil.',
    agents: [
      {
        id: 'mila',
        name: 'Mila',
        role: 'Analis requirement',
        deskPosition: { x: -3, z: -2 },
        color: '#f472b6',
        defaultTask:
          'Tulis requirements.md berisi kebutuhan singkat aplikasi CLI "todo" berbasis Node.js (tambah, daftar, selesai).',
      },
      {
        id: 'aether',
        name: 'Aether',
        role: 'Arsitek',
        deskPosition: { x: 1, z: -2 },
        color: '#f59e0b',
        defaultTask:
          'Tulis ARCHITECTURE.md untuk aplikasi CLI todo Node.js: struktur folder, modul, dan format penyimpanan JSON.',
      },
      {
        id: 'zaki',
        name: 'Zaki',
        role: 'Developer',
        deskPosition: { x: -3, z: 2 },
        color: '#22c55e',
        defaultTask:
          'Buat todo.js: CLI Node.js tanpa dependensi dengan perintah add, list, done yang menyimpan data di todo.json.',
      },
      {
        id: 'lulu',
        name: 'Lulu',
        role: 'QA',
        deskPosition: { x: 1, z: 2 },
        color: '#38bdf8',
        defaultTask:
          'Buat test-plan.md berisi skenario uji manual untuk CLI todo (add, list, done, input kosong, file rusak).',
      },
    ],
  },
  {
    id: 'duo',
    name: 'Duo cepat',
    description: 'Dua agent dengan tugas kecil untuk mencoba alur.',
    agents: [
      {
        id: 'zaki',
        name: 'Zaki',
        role: 'Developer',
        deskPosition: { x: -2, z: 0 },
        color: '#22c55e',
        defaultTask: 'Buat file sum.js yang mencetak hasil 1+1, lalu jalankan ls.',
      },
      {
        id: 'lulu',
        name: 'Lulu',
        role: 'Penulis',
        deskPosition: { x: 2, z: 0 },
        color: '#ec4899',
        defaultTask: "Buat file hello.txt berisi teks 'halo'.",
      },
    ],
  },
];

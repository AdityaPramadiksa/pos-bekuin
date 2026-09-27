# Aethera Office

Kantor virtual 3D untuk memantau agent **Claude Code headless** secara real-time. Tiap agent
adalah satu proses `claude -p` yang memakai **login Claude Pro/Max di mesin ini**, bukan API key
berbayar per token.

> Proyek ini sementara berada di subfolder repo `pos-bekuin` karena repo terpisah belum dibuat.
> Untuk memindahkannya ke repo sendiri beserta historinya:
>
> ```bash
> git subtree split --prefix=aethera-office -b aethera-office-only
> git push git@github.com:<akun>/aethera-office.git aethera-office-only:main
> ```

## Menjalankan

Syarat: Node ≥ 20.19, pnpm 10, dan CLI `claude` yang sudah login (`claude` → `/login`).

```bash
cd aethera-office
pnpm install
cp apps/server/.env.example apps/server/.env   # opsional, semua punya default
pnpm dev                                         # server :4400 + web :5173
```

Buka http://localhost:5173, klik **+ Run baru**, pilih preset tim, lalu mulai.

Demo tanpa dashboard (2 agent, event dicetak ke terminal):

```bash
DEMO_MODEL=haiku pnpm --filter @aethera/server demo
```

Pemeriksaan sebelum commit: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Arsitektur

```
browser (React + r3f) ──REST /api──►  apps/server (Fastify, satu proses)
        ▲                               ├─ AgentProcessManager ──spawn──► claude -p … (per agent)
        └──── Socket.io (room run:<id>) ├─ EventPipeline: Zod → SQLite → broadcast   │
                                        ├─ RoadmapService, InstructionService        │ hook
                                        └─ POST /hook-ingest ◄── hook-relay ◄────────┘
```

- **packages/shared**: skema Zod `AgentEvent` (7 tipe), `AgentDefinition`, `RunSummary`,
  roadmap, instruksi manager, serta util `summarizeToolInput` dan `describeEvent`.
- **packages/hook-relay**: skrip yang dipanggil hook Claude Code (`PreToolUse`,
  `PostToolUse`, `PostToolUseFailure`, `Notification`, `SessionStart`, `Stop`). Skrip ini
  meringkas payload lalu POST ke server. Selalu exit 0 dalam ≤ 2 detik dan tidak pernah
  menulis stdout, jadi tidak bisa memblokir agent.
- **apps/server**:
  - Orchestrator menjalankan per agent:
    `claude -p <tugas> --output-format stream-json --verbose --include-partial-messages
--session-id <uuid> --permission-mode acceptEdits --permission-prompts none --settings <hook>`.
  - Hook disuntik lewat `--settings`, jadi tidak ada file yang ditulis ke folder kerja agent.
  - `ANTHROPIC_API_KEY` dihapus dari env agent.
  - Event dari stdout (sesi, teks, token) digabung dengan event hook (tool call, izin).
    Duplikat tool dibuang lewat `toolUseId`.
- **apps/web**:
  - Store Zustand dengan reducer murni `applyEvent`. Status agent diturunkan dari event
    (dedup by id), jadi data hydrate REST dan event socket yang tumpang tindih tetap aman.
  - Scene 3D dimuat secara lazy.
  - Tiap avatar hanya berlangganan state agent-nya sendiri.
  - Label di atas kepala adalah satu overlay DOM yang diproyeksikan setiap frame.

## Fitur

- **Kantor 3D isometrik**:
  - Warna avatar mengikuti status agent:

    | Status  | Tampilan   |
    | ------- | ---------- |
    | idle    | redup      |
    | working | bergoyang  |
    | blocked | oranye + ! |
    | error   | merah + !  |
    | done    | hijau      |

  - Label aktivitas tampil di atas avatar.
  - Klik avatar untuk membuka detail agent.
  - Tersedia tema terang/gelap dan tombol _Sudut awal_.
- **HUD**:
  - KPI progres, jumlah tugas, agent aktif, token (input + output, cache ditampilkan
    terpisah, porsi per agent), dan durasi sesi.
  - Roster agent: yang error/blocked tampil paling atas.
  - Event stream dengan filter per agent dan auto-scroll.
- **Roadmap**:
  - Saat run dibuat, otomatis ada satu item per agent.
  - Status item mengikuti agent yang ditugaskan.
  - Progres saat dikerjakan hanya _perkiraan_: naik per tool yang selesai, maksimal 90%.
  - Item bisa ditambah, diubah, dan dihapus manual.
- **Manager Command Layer**:
  - Instruksi dikirim lewat `claude -p "<instruksi>" --resume <session_id>`, jadi agent
    melanjutkan dengan konteks percakapannya sendiri (session id tetap sama).
  - Agent yang sedang bekerja menerima instruksi lewat antrean, yang dikirim otomatis
    setelah prosesnya selesai.
  - Menghentikan agent juga membatalkan antreannya.
  - `--input-format stream-json` tidak dipakai karena format pesannya tidak
    didokumentasikan untuk mode headless.

## Konfigurasi (`apps/server/.env`)

| Variabel                  | Default                                 | Keterangan                                 |
| ------------------------- | --------------------------------------- | ------------------------------------------ |
| `PORT` / `HOST`           | `4400` / `127.0.0.1`                    | Server tanpa autentikasi: tetap lokal      |
| `DB_PATH`                 | `./aethera.db`                          | SQLite                                     |
| `AGENT_WORKSPACES_DIR`    | `./workspaces`                          | Folder kerja: `<dir>/<runId>/<agentId>`    |
| `CLAUDE_BIN`              | `claude`                                |                                            |
| `AETHERA_MODEL`           | (default akun)                          | mis. `sonnet`, `haiku`                     |
| `AETHERA_ALLOWED_TOOLS`   | `Read,Glob,Grep,Bash(ls *),Bash(cat *)` | Aturan izin tambahan                       |
| `AETHERA_PERMISSION_MODE` | `acceptEdits`                           | `bypassPermissions` sengaja tidak didukung |

## Catatan

- Semua agent memakai kuota langganan yang sama dengan pemakaian Claude Code Anda
  sehari-hari. Lima agent paralel menghabiskan kuota kira-kira lima kali lebih cepat.
- Agent bekerja di folder `workspaces/`, bukan di repo Anda. Dengan `acceptEdits`, agent
  bebas mengedit file di folder kerjanya.
- Perintah Bash di luar aturan `AETHERA_ALLOWED_TOOLS` ditolak otomatis
  (`--permission-prompts none`), dan agent diberi tahu. Tambahkan aturan bila agent perlu
  menjalankan tes, mis. `Bash(npm test *)`.

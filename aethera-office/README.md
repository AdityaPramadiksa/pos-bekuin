# Aethera Office

Kantor virtual 3D untuk memantau agent **Claude Code headless** secara real-time. Tiap agent =
satu proses `claude -p` yang memakai login Claude Pro/Max di mesin ini (bukan API key).

> Proyek ini sementara berada di subfolder repo `pos-bekuin` karena repo terpisah belum ada.
> Untuk memindahkannya ke repo sendiri beserta histori:
> `git subtree split --prefix=aethera-office -b aethera-office-only` lalu push branch itu ke repo baru.

## Struktur

- `packages/shared` — skema Zod event agent, tipe, util ringkasan tool.
- `packages/hook-relay` — skrip yang dipanggil hook Claude Code; meneruskan payload ke server.
- `apps/server` — Fastify + Socket.io + SQLite + orchestrator proses `claude`.
- `apps/web` — React 19 + Vite, panel HUD dan kantor 3D (react-three-fiber).

## Perintah

```bash
pnpm install
pnpm dev          # server (4400) + web (5173)
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

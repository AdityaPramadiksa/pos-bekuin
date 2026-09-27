/**
 * Migrasi SQL berurutan. Disimpan sebagai string (bukan file .sql) supaya ikut terbundel tsup.
 * Jangan ubah migrasi yang sudah ada; tambahkan yang baru di akhir.
 */
export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'init',
    sql: `
      CREATE TABLE runs (
        run_id      TEXT PRIMARY KEY,
        started_at  TEXT NOT NULL,
        ended_at    TEXT,
        status      TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
        agents_json TEXT NOT NULL
      );
      CREATE INDEX runs_started_at ON runs (started_at DESC);

      CREATE TABLE agent_events (
        seq          INTEGER PRIMARY KEY AUTOINCREMENT,
        id           TEXT NOT NULL UNIQUE,
        run_id       TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
        agent_id     TEXT NOT NULL,
        type         TEXT NOT NULL,
        timestamp    TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE INDEX agent_events_run_ts ON agent_events (run_id, timestamp);
      CREATE INDEX agent_events_run_seq ON agent_events (run_id, seq);

      CREATE TABLE agent_current_state (
        run_id                TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
        agent_id              TEXT NOT NULL,
        status                TEXT NOT NULL,
        task                  TEXT NOT NULL DEFAULT '',
        session_id            TEXT,
        last_activity         TEXT NOT NULL DEFAULT '',
        last_event_at         TEXT,
        input_tokens          INTEGER NOT NULL DEFAULT 0,
        output_tokens         INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
        cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (run_id, agent_id)
      );
    `,
  },
  {
    id: 2,
    name: 'roadmap_and_instructions',
    sql: `
      CREATE TABLE roadmap_items (
        id                TEXT PRIMARY KEY,
        run_id            TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
        title             TEXT NOT NULL,
        assigned_agent_id TEXT,
        status            TEXT NOT NULL CHECK (status IN ('pending','in_progress','done')),
        progress_pct      INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
        sort_order        INTEGER NOT NULL DEFAULT 0,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      );
      CREATE INDEX roadmap_items_run ON roadmap_items (run_id, sort_order);

      CREATE TABLE manager_instructions (
        id         TEXT PRIMARY KEY,
        run_id     TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
        agent_id   TEXT NOT NULL,
        text       TEXT NOT NULL,
        status     TEXT NOT NULL CHECK (status IN ('queued','sent','failed')),
        mode       TEXT CHECK (mode IN ('resume','new')),
        created_at TEXT NOT NULL,
        sent_at    TEXT,
        error      TEXT
      );
      CREATE INDEX manager_instructions_run ON manager_instructions (run_id, created_at);
    `,
  },
];

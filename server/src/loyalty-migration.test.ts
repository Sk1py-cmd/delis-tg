/** Verifies the production migration from the legacy restricted Stars ledger. */
import { after, it } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import Database from "better-sqlite3";

const path = `/tmp/delis-loyalty-migration-${process.pid}.db`;
const legacy = new Database(path);
legacy.exec(`
  CREATE TABLE users (
    tg_id INTEGER PRIMARY KEY, username TEXT, first_name TEXT, last_name TEXT,
    phone TEXT, stars INTEGER DEFAULT 0, tier TEXT DEFAULT 'bronze',
    language TEXT DEFAULT 'uz', created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE loyalty_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('earn', 'spend')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    source TEXT NOT NULL CHECK (source IN ('order', 'daily', 'referral', 'reward')),
    reference_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tg_id, source, reference_id),
    FOREIGN KEY (tg_id) REFERENCES users(tg_id)
  );
  CREATE INDEX idx_loyalty_user_date ON loyalty_transactions(tg_id, created_at DESC);
  INSERT INTO users (tg_id, first_name, stars) VALUES (9901, 'Legacy', 25);
  INSERT INTO loyalty_transactions (tg_id, type, amount, source, reference_id)
  VALUES (9901, 'earn', 25, 'daily', 'legacy-day');
`);
legacy.close();

process.env.DELIS_DB_PATH = path;

after(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { unlinkSync(path + suffix); } catch { /* already absent */ }
  }
});

it("preserves old rows and unlocks new loyalty event sources", async () => {
  const db = (await import("./db.js")).getDb();
  const columns = db.prepare("PRAGMA table_info(loyalty_transactions)").all() as Array<{ name: string }>;
  assert.ok(columns.some((column) => column.name === "description"));
  assert.ok(columns.some((column) => column.name === "actor_tg_id"));
  assert.ok(columns.some((column) => column.name === "expires_at"));
  const old = db.prepare("SELECT * FROM loyalty_transactions WHERE reference_id = 'legacy-day'").get() as any;
  assert.equal(old.amount, 25);
  assert.equal(old.source, "daily");
  assert.doesNotThrow(() => {
    db.prepare(`
      INSERT INTO loyalty_transactions (tg_id, type, amount, source, reference_id, description)
      VALUES (9901, 'earn', 5, 'admin', 'migration-test', 'Safe migration')
    `).run();
  });
  const cardTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('loyalty_cards','loyalty_missions','birthday_rewards')").all();
  assert.equal(cardTables.length, 3);
});

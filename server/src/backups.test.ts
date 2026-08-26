/**
 * Unit tests for the local backup fallback (snapshotDb) — hosts without
 * Supabase must still get pruned DB snapshots next to the SQLite file.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DELIS_DB_PATH = ":memory:";
process.env.DELIS_AUTOSTART = "0";
process.env.SEED_ON_START = "false";

describe("snapshotDb — local backup fallback", () => {
  let db: ReturnType<typeof import("./db.js").getDb>;
  let backupDir: string;

  before(async () => {
    const { getDb } = await import("./db.js");
    db = getDb();
    db.exec("CREATE TABLE IF NOT EXISTS _backup_probe (v TEXT)");
    backupDir = mkdtempSync(join(tmpdir(), "delis-backups-"));
  });

  it("writes an online snapshot into the backup dir", async () => {
    const { snapshotDb } = await import("./db.js");
    const dest = await snapshotDb(db, backupDir, 48, "2030-01-01_00-01");
    assert.ok(dest, "snapshot path must be returned");
    assert.match(dest!, /delis-2030-01-01_00-01\.db$/);
    assert.ok(readdirSync(backupDir).includes("delis-2030-01-01_00-01.db"));
  });

  it("prunes old snapshots keeping only the newest `keep` files", async () => {
    const { snapshotDb } = await import("./db.js");
    // Five fake older snapshots (sort before 2030 names).
    for (const stamp of ["2026-01-01_00-01", "2026-01-01_00-02", "2026-01-01_00-03", "2026-01-01_00-04", "2026-01-01_00-05"]) {
      writeFileSync(join(backupDir, `delis-${stamp}.db`), "fake");
    }
    const dest = await snapshotDb(db, backupDir, 3, "2030-01-01_00-02");
    assert.ok(dest);
    const files = readdirSync(backupDir).filter((f) => f.endsWith(".db")).sort();
    // 7 files existed (5 fakes + the 2030_00-01 snapshot from the previous
    // test + this new one); keep = 3 → the 4 oldest are pruned.
    assert.deepEqual(files, [
      "delis-2026-01-01_00-05.db",
      "delis-2030-01-01_00-01.db",
      "delis-2030-01-01_00-02.db",
    ]);
  });

  it("creates the backup dir on demand", async () => {
    const { snapshotDb } = await import("./db.js");
    const fresh = join(backupDir, "nested", "backups");
    const dest = await snapshotDb(db, fresh, 48);
    assert.ok(dest && readdirSync(fresh).some((f) => f.endsWith(".db")));
  });

  after(() => rmSync(backupDir, { recursive: true, force: true }));
});

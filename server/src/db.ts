/**
 * DELIS — Работа с локальной SQLite-базой: путь, подключение, периодический checkpoint.
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";

const require = createRequire(import.meta.url);

class NodeSqliteDatabase {
  private db: any;

  constructor(path: string) {
    // Lazy-load only as a fallback. A top-level `import "node:sqlite"`
    // crashes Node < 22.5 (Render / Docker node:20) at module load —
    // before better-sqlite3 can even be tried.
    const { DatabaseSync } = require("node:sqlite");
    this.db = new DatabaseSync(path);
  }

  pragma(pragmaStr: string) {
    if (pragmaStr.includes("=") || pragmaStr.includes("wal_checkpoint")) {
      this.db.exec(`PRAGMA ${pragmaStr}`);
      return [];
    }
    return this.prepare(`PRAGMA ${pragmaStr}`).all();
  }

  exec(sql: string) {
    this.db.exec(sql);
    return this;
  }

  close() {
    this.db.close();
  }

  async backup(destPath: string) {
    const escaped = destPath.replace(/'/g, "''");
    this.db.exec(`VACUUM INTO '${escaped}'`);
  }

  prepare(sql: string) {
    const stmt = this.db.prepare(sql);

    const sanitizeParam = (v: any) => (v === undefined ? null : v);

    const unwrapParams = (args: any[]) => {
      if (args.length === 1 && Array.isArray(args[0])) {
        return args[0].map(sanitizeParam);
      }
      if (args.length === 1 && args[0] && typeof args[0] === "object" && args[0].constructor === Object) {
        const sanitized: Record<string, any> = {};
        for (const [k, v] of Object.entries(args[0])) {
          sanitized[k] = sanitizeParam(v);
        }
        return sanitized;
      }
      return args.map(sanitizeParam);
    };

    const callStmt = (method: "get" | "all" | "run", args: any[]) => {
      const params = unwrapParams(args);
      if (Array.isArray(params)) {
        return (stmt as any)[method](...params);
      }
      return (stmt as any)[method](params);
    };

    return {
      get(...args: any[]) {
        return callStmt("get", args) ?? undefined;
      },
      all(...args: any[]) {
        return callStmt("all", args);
      },
      run(...args: any[]) {
        const res = callStmt("run", args);
        return {
          changes: Number(res.changes),
          lastInsertRowid: Number(res.lastInsertRowid),
        };
      }
    };
  }

  transaction(fn: Function) {
    const self = this;
    return (...args: any[]) => {
      self.exec("BEGIN TRANSACTION");
      try {
        const res = fn(...args);
        self.exec("COMMIT");
        return res;
      } catch (err) {
        try { self.exec("ROLLBACK"); } catch { /* ignore */ }
        throw err;
      }
    };
  }
}

export function createDatabase(path: string): any {
  try {
    const BetterSqlite3 = require("better-sqlite3");
    return new BetterSqlite3(path);
  } catch {
    return new NodeSqliteDatabase(path) as any;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
/** Tests can point DELIS_DB_PATH at ":memory:" or a temp file. */
export function getDbPath(): string {
  const path = process.env.DELIS_DB_PATH || join(DATA_DIR, "delis.db");
  if (path !== ":memory:") {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  return path;
}

let db: any;
let currentDbPath: string | undefined;

export function getDb(): any {
  const path = getDbPath();
  if (!db || currentDbPath !== path) {
    currentDbPath = path;
    db = createDatabase(path);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }
  return db;
}

/** Flush WAL into the main file — call right before uploading a backup. */
export function checkpointDb() {
  try {
    db?.pragma("wal_checkpoint(TRUNCATE)");
  } catch { /* ignore */ }
}

/** Matches snapshot files produced by snapshotDb() — used for pruning. */
const SNAPSHOT_FILE_RE = /^delis-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.db$/;

/**
 * Local backup fallback for hosts without Supabase (persistent-volume setups
 * such as the docker-compose ./server/data mount). Writes an online SQLite
 * snapshot (safe while the DB is in use) and prunes old files, keeping the
 * newest `keep` snapshots. Returns the written path or null on failure.
 */
export async function snapshotDb(
  database: ReturnType<typeof getDb>,
  backupDir: string,
  keep = 48,
  stampOverride?: string,
): Promise<string | null> {
  const { mkdirSync, readdirSync, unlinkSync } = await import("node:fs");
  const { join: joinPath } = await import("node:path");
  try {
    mkdirSync(backupDir, { recursive: true });
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = stampOverride ||
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const dest = joinPath(backupDir, `delis-${stamp}.db`);
    await database.backup(dest);
    const files = readdirSync(backupDir)
      .filter((f) => SNAPSHOT_FILE_RE.test(f))
      .sort();
    for (const f of files.slice(0, Math.max(0, files.length - keep))) {
      try { unlinkSync(joinPath(backupDir, f)); } catch { /* already gone */ }
    }
    return dest;
  } catch (e) {
    console.error("[backup] local snapshot failed:", e);
    return null;
  }
}

function migrate(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      tg_id        INTEGER PRIMARY KEY,
      username     TEXT,
      first_name   TEXT,
      last_name    TEXT,
      phone        TEXT,
      stars        INTEGER DEFAULT 0,
      tier         TEXT DEFAULT 'bronze',
      language     TEXT DEFAULT 'uz',
      created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id           TEXT PRIMARY KEY,
      cat          TEXT NOT NULL,
      price        INTEGER NOT NULL,
      name_uz      TEXT,
      name_ru      TEXT,
      name_en      TEXT,
      volume       TEXT,
      badge        TEXT,
      stock        INTEGER DEFAULT 0,
      rating       REAL DEFAULT 5.0,
      reviews      INTEGER DEFAULT 0,
      img          TEXT,
      features_uz  TEXT,
      features_ru  TEXT,
      features_en  TEXT,
      cost_price   INTEGER DEFAULT 0,
      active       INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS orders (
      id              TEXT PRIMARY KEY,
      tg_id           INTEGER NOT NULL,
      subtotal        INTEGER NOT NULL,
      discount        INTEGER DEFAULT 0,
      promo_code      TEXT,
      delivery_fee    INTEGER DEFAULT 0,
      total           INTEGER NOT NULL,
      delivery_method TEXT NOT NULL,
      delivery_zone   TEXT,
      delivery_address TEXT,
      delivery_time   TEXT,
      recipient_name  TEXT,
      recipient_phone TEXT,
      payment_method  TEXT NOT NULL,
      payment_status  TEXT DEFAULT 'pending',
      status          TEXT DEFAULT 'new',
      courier_note    TEXT,
      promo_benefit   INTEGER DEFAULT 0,
      admin_notified_at TEXT,
      admin_notify_attempts INTEGER DEFAULT 0,
      stuck_alerted_at TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tg_id) REFERENCES users(tg_id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      order_id   TEXT NOT NULL,
      product_id TEXT NOT NULL,
      qty        INTEGER NOT NULL,
      price      INTEGER NOT NULL,
      cost_price INTEGER DEFAULT 0,
      PRIMARY KEY (order_id, product_id),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      tg_id      INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (tg_id, product_id),
      FOREIGN KEY (tg_id) REFERENCES users(tg_id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS promo_codes (
      code       TEXT PRIMARY KEY,
      type       TEXT NOT NULL,
      value               INTEGER NOT NULL,
      min_spend           INTEGER DEFAULT 0,
      max_discount        INTEGER,
      required_product_id TEXT,
      reward_id           TEXT,
      active              INTEGER DEFAULT 1,
      created_at          TEXT DEFAULT (datetime('now')),
      redeemed_at         TEXT,
      redeemed_order_id   TEXT,
      title_uz   TEXT,
      title_ru   TEXT,
      title_en   TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_rewards (
      tg_id      INTEGER NOT NULL,
      claimed_at TEXT NOT NULL,
      amount     INTEGER NOT NULL,
      PRIMARY KEY (tg_id, claimed_at)
    );

    -- Append-only DELIS Stars ledger. users.stars is the current balance;
    -- this table powers the customer's loyalty-card history and totals.
    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id        INTEGER NOT NULL,
      type         TEXT NOT NULL CHECK (type IN ('earn', 'spend')),
      amount       INTEGER NOT NULL CHECK (amount > 0),
      source       TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      description  TEXT,
      actor_tg_id  INTEGER,
      expires_at   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (tg_id, source, reference_id),
      FOREIGN KEY (tg_id) REFERENCES users(tg_id)
    );

    CREATE INDEX IF NOT EXISTS idx_loyalty_user_date
      ON loyalty_transactions(tg_id, created_at DESC);

    -- Opaque membership number: QR never exposes the customer's Telegram ID.
    CREATE TABLE IF NOT EXISTS loyalty_cards (
      code         TEXT PRIMARY KEY,
      tg_id        INTEGER NOT NULL UNIQUE,
      status       TEXT NOT NULL DEFAULT 'active',
      last_used_at TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tg_id) REFERENCES users(tg_id)
    );

    CREATE TABLE IF NOT EXISTS loyalty_missions (
      id             TEXT PRIMARY KEY,
      metric         TEXT NOT NULL,
      target         INTEGER NOT NULL,
      reward         INTEGER NOT NULL,
      title_uz       TEXT NOT NULL,
      title_ru       TEXT NOT NULL,
      title_en       TEXT NOT NULL,
      description_uz TEXT DEFAULT '',
      description_ru TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      icon           TEXT DEFAULT '⚡',
      active         INTEGER NOT NULL DEFAULT 1,
      starts_at      TEXT,
      ends_at        TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS loyalty_mission_claims (
      tg_id       INTEGER NOT NULL,
      mission_id  TEXT NOT NULL,
      claimed_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tg_id, mission_id),
      FOREIGN KEY (tg_id) REFERENCES users(tg_id),
      FOREIGN KEY (mission_id) REFERENCES loyalty_missions(id)
    );

    CREATE TABLE IF NOT EXISTS birthday_rewards (
      tg_id       INTEGER NOT NULL,
      reward_year INTEGER NOT NULL,
      amount      INTEGER NOT NULL,
      claimed_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tg_id, reward_year),
      FOREIGN KEY (tg_id) REFERENCES users(tg_id)
    );

    CREATE TABLE IF NOT EXISTS loyalty_expiry_notifications (
      tg_id        INTEGER NOT NULL,
      warning_key  TEXT NOT NULL,
      notified_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tg_id, warning_key),
      FOREIGN KEY (tg_id) REFERENCES users(tg_id)
    );

    CREATE TABLE IF NOT EXISTS courier_locations (
      order_id       TEXT PRIMARY KEY,
      tg_id          INTEGER NOT NULL,
      lat            REAL NOT NULL,
      lon            REAL NOT NULL,
      updated_ms     INTEGER NOT NULL,
      live_until_ms  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS waitlist (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id       INTEGER NOT NULL,
      product_id  TEXT NOT NULL,
      qty         INTEGER DEFAULT 1,
      phone       TEXT,
      language    TEXT DEFAULT 'uz',
      created_at  TEXT DEFAULT (datetime('now')),
      notified_at TEXT,
      UNIQUE (tg_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      tg_id      INTEGER NOT NULL,
      rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment    TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (tg_id) REFERENCES users(tg_id)
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id           TEXT PRIMARY KEY,
      tg_id        INTEGER NOT NULL,
      label        TEXT NOT NULL,
      region_id    TEXT NOT NULL,
      district     TEXT NOT NULL,
      street       TEXT NOT NULL,
      apartment    TEXT,
      phone        TEXT,
      is_default   INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tg_id) REFERENCES users(tg_id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id           TEXT PRIMARY KEY,
      tg_id        INTEGER NOT NULL,
      product_id   TEXT NOT NULL,
      qty          INTEGER NOT NULL,
      frequency    INTEGER NOT NULL,
      status       TEXT DEFAULT 'active',
      next_date    TEXT,
      created_at   TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tg_id) REFERENCES users(tg_id)
    );

    -- Server-authoritative customer return requests. A request is accepted
    -- only for a delivered order owned by the authenticated customer.
    CREATE TABLE IF NOT EXISTS return_requests (
      id           TEXT PRIMARY KEY,
      tg_id        INTEGER NOT NULL,
      order_id     TEXT NOT NULL,
      product_id   TEXT NOT NULL,
      reason       TEXT NOT NULL,
      note         TEXT,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tg_id) REFERENCES users(tg_id),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE INDEX IF NOT EXISTS idx_returns_owner_date ON return_requests(tg_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_returns_status_date ON return_requests(status, created_at DESC);

    -- Support chat is persisted so customer and manager see the same thread.
    -- admin_message_id links a manager's Telegram reply to the customer thread.
    CREATE TABLE IF NOT EXISTS support_messages (
      id               TEXT PRIMARY KEY,
      tg_id            INTEGER NOT NULL,
      sender           TEXT NOT NULL CHECK (sender IN ('customer', 'manager', 'system')),
      text             TEXT NOT NULL,
      admin_message_id INTEGER,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tg_id) REFERENCES users(tg_id)
    );
    CREATE INDEX IF NOT EXISTS idx_support_owner_date ON support_messages(tg_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_support_admin_message ON support_messages(admin_message_id) WHERE admin_message_id IS NOT NULL;

    -- Audit record for real Telegram broadcasts sent from the admin panel.
    CREATE TABLE IF NOT EXISTS broadcasts (
      id         TEXT PRIMARY KEY,
      kind       TEXT NOT NULL,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      attempted  INTEGER NOT NULL DEFAULT 0,
      sent       INTEGER NOT NULL DEFAULT 0,
      failed     INTEGER NOT NULL DEFAULT 0,
      actor_tg_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_settings (
      key          TEXT PRIMARY KEY,
      value_json   TEXT NOT NULL,
      updated_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stories (
      id           TEXT PRIMARY KEY,
      tg_id        INTEGER,
      title        TEXT NOT NULL,
      description  TEXT DEFAULT '',
      media        TEXT,
      media_kind   TEXT DEFAULT 'image',
      role         TEXT DEFAULT 'customer',
      status       TEXT DEFAULT 'pending',
      created_at   TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tg_id) REFERENCES users(tg_id)
    );

    CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);

    CREATE TABLE IF NOT EXISTS abandoned_carts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id         INTEGER NOT NULL,
      items_json    TEXT NOT NULL,
      total_items   INTEGER NOT NULL,
      total_value   INTEGER NOT NULL,
      language      TEXT DEFAULT 'uz',
      saved_at      INTEGER NOT NULL,
      notified_at   INTEGER,
      UNIQUE(tg_id)
    );

    CREATE INDEX IF NOT EXISTS idx_abandoned_notified ON abandoned_carts(notified_at);

    -- "Come back in N days" reorder reminders for consumables: set when an
    -- order is fulfilled, fired once by the bot after remind_at_ms elapses.
    CREATE TABLE IF NOT EXISTS reorder_reminders (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id        INTEGER NOT NULL,
      product_id   TEXT NOT NULL,
      product_name TEXT NOT NULL,
      qty          INTEGER DEFAULT 1,
      language     TEXT DEFAULT 'uz',
      remind_at_ms INTEGER NOT NULL,
      notified     INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reorder_remind ON reorder_reminders(remind_at_ms, notified);

    CREATE TABLE IF NOT EXISTS qr_batches (
      code         TEXT PRIMARY KEY,
      product_id   TEXT NOT NULL,
      produced_at  TEXT NOT NULL,
      batch_no     INTEGER DEFAULT 1,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- Wholesale discount ladder, editable from the admin panel.
    -- pricing.wholesaleUnit() walks these rows (ascending min_qty).
    CREATE TABLE IF NOT EXISTS wholesale_tiers (
      min_qty  INTEGER PRIMARY KEY,
      percent  INTEGER NOT NULL
    );

    -- Access codes for the B2B office (issued to partners by the admin).
    CREATE TABLE IF NOT EXISTS b2b_codes (
      code       TEXT PRIMARY KEY,
      label      TEXT,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Gift certificates: requested by a customer, ACTIVATED by the admin
    -- after payment, redeemed once at checkout (server-authoritative).
    CREATE TABLE IF NOT EXISTS gift_certificates (
      code         TEXT PRIMARY KEY,
      amount       INTEGER NOT NULL,          -- UZS face value
      from_name    TEXT,
      to_name      TEXT,
      message      TEXT,
      buyer_tg     TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending', -- pending|active|redeemed|revoked
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      activated_at TEXT,
      redeemed_at  TEXT,
      order_id     TEXT
    );

    CREATE TABLE IF NOT EXISTS payme_transactions (
      payme_id     TEXT PRIMARY KEY,
      order_id     TEXT NOT NULL,
      state        INTEGER NOT NULL DEFAULT 0, -- 1 created, 2 performed, -1/-2 canceled
      amount       INTEGER NOT NULL,           -- tiyin (1/100 UZS)
      create_time  INTEGER NOT NULL DEFAULT 0,
      perform_time INTEGER NOT NULL DEFAULT 0,
      cancel_time  INTEGER NOT NULL DEFAULT 0,
      reason       INTEGER,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS click_transactions (
      click_trans_id      TEXT PRIMARY KEY,
      order_id            TEXT NOT NULL,
      amount              REAL NOT NULL,
      merchant_prepare_id INTEGER,
      status              TEXT DEFAULT 'prepared', -- prepared | confirmed | canceled
      created_at          TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user   ON orders(tg_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_products_cat  ON products(cat);
    CREATE INDEX IF NOT EXISTS idx_favorites     ON favorites(tg_id);
  `);

  // Existing installations used a restrictive CHECK on loyalty source. Rebuild
  // the append-only ledger once so admin adjustments, missions and expiry can
  // be represented without weakening transaction integrity.
  const loyaltyTable = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'loyalty_transactions'",
  ).get() as { sql?: string } | undefined;
  if (loyaltyTable?.sql?.includes("CHECK (source IN")) {
    db.transaction(() => {
      db.exec(`
        ALTER TABLE loyalty_transactions RENAME TO loyalty_transactions_legacy;
        CREATE TABLE loyalty_transactions (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          tg_id        INTEGER NOT NULL,
          type         TEXT NOT NULL CHECK (type IN ('earn', 'spend')),
          amount       INTEGER NOT NULL CHECK (amount > 0),
          source       TEXT NOT NULL,
          reference_id TEXT NOT NULL,
          description  TEXT,
          actor_tg_id  INTEGER,
          expires_at   TEXT,
          created_at   TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (tg_id, source, reference_id),
          FOREIGN KEY (tg_id) REFERENCES users(tg_id)
        );
        INSERT INTO loyalty_transactions
          (id, tg_id, type, amount, source, reference_id, created_at)
        SELECT id, tg_id, type, amount, source, reference_id, created_at
        FROM loyalty_transactions_legacy;
        DROP TABLE loyalty_transactions_legacy;
        CREATE INDEX idx_loyalty_user_date
          ON loyalty_transactions(tg_id, created_at DESC);
      `);
    })();
  }

  const loyaltyCols = db.prepare("PRAGMA table_info(loyalty_transactions)").all() as { name: string }[];
  if (!loyaltyCols.some((c) => c.name === "description")) db.exec("ALTER TABLE loyalty_transactions ADD COLUMN description TEXT");
  if (!loyaltyCols.some((c) => c.name === "actor_tg_id")) db.exec("ALTER TABLE loyalty_transactions ADD COLUMN actor_tg_id INTEGER");
  if (!loyaltyCols.some((c) => c.name === "expires_at")) db.exec("ALTER TABLE loyalty_transactions ADD COLUMN expires_at TEXT");

  // Built-in campaigns are safe defaults and can later be disabled or edited
  // by the admin API without changing application code.
  const addMission = db.prepare(`
    INSERT OR IGNORE INTO loyalty_missions
      (id, metric, target, reward, title_uz, title_ru, title_en,
       description_uz, description_ru, description_en, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  addMission.run("first-order", "orders", 1, 100,
    "Birinchi buyurtma", "Первый заказ", "First order",
    "Birinchi yetkazilgan buyurtma", "Получите первый доставленный заказ", "Complete your first delivered order", "🛍️");
  addMission.run("clean-week", "daily", 7, 120,
    "Toza hafta", "Чистая неделя", "Clean week",
    "7 kunlik bonus oling", "Получите ежедневный бонус 7 раз", "Claim the daily reward 7 times", "🔥");
  addMission.run("care-500", "spend", 500000, 250,
    "Care 500", "Care 500", "Care 500",
    "500 000 so'mlik xarid", "Совершите покупок на 500 000 сум", "Complete 500,000 UZS in purchases", "⚡");

  // Lightweight migrations for existing databases
  const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userCols.some((c) => c.name === "birthday")) {
    db.exec("ALTER TABLE users ADD COLUMN birthday TEXT");
  }
  if (!userCols.some((c) => c.name === "referrer_id")) {
    db.exec("ALTER TABLE users ADD COLUMN referrer_id INTEGER");
  }
  if (!userCols.some((c) => c.name === "referral_paid")) {
    db.exec("ALTER TABLE users ADD COLUMN referral_paid INTEGER DEFAULT 0");
  }
  const productCols = db.prepare("PRAGMA table_info(products)").all() as { name: string }[];
  if (!productCols.some((c) => c.name === "cost_price")) {
    db.exec("ALTER TABLE products ADD COLUMN cost_price INTEGER DEFAULT 0");
  }
  const itemCols = db.prepare("PRAGMA table_info(order_items)").all() as { name: string }[];
  if (!itemCols.some((c) => c.name === "stock_taken")) {
    // 1 = warehouse stock was decremented for this line (restock on cancel);
    // 0 = made-to-order line (stock was never touched). Default 0 for legacy rows.
    db.exec("ALTER TABLE order_items ADD COLUMN stock_taken INTEGER DEFAULT 0");
  }
  if (!itemCols.some((c) => c.name === "cost_price")) {
    db.exec("ALTER TABLE order_items ADD COLUMN cost_price INTEGER DEFAULT 0");
  }
  const orderCols = db.prepare("PRAGMA table_info(orders)").all() as { name: string }[];
  if (!orderCols.some((c) => c.name === "customer_username")) {
    db.exec("ALTER TABLE orders ADD COLUMN customer_username TEXT");
  }
  if (!orderCols.some((c) => c.name === "customer_name")) {
    db.exec("ALTER TABLE orders ADD COLUMN customer_name TEXT");
  }
  if (!orderCols.some((c) => c.name === "stars_awarded")) {
    db.exec("ALTER TABLE orders ADD COLUMN stars_awarded INTEGER DEFAULT 0");
  }
  if (!orderCols.some((c) => c.name === "cert_code")) {
    // Gift certificate applied to this order (nullable) + the amount covered.
    db.exec("ALTER TABLE orders ADD COLUMN cert_code TEXT");
  }
  if (!orderCols.some((c) => c.name === "cert_applied")) {
    db.exec("ALTER TABLE orders ADD COLUMN cert_applied INTEGER DEFAULT 0");
  }
  if (!orderCols.some((c) => c.name === "promo_benefit")) {
    db.exec("ALTER TABLE orders ADD COLUMN promo_benefit INTEGER DEFAULT 0");
  }
  if (!orderCols.some((c) => c.name === "admin_notified_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN admin_notified_at TEXT");
  }
  if (!orderCols.some((c) => c.name === "admin_notify_attempts")) {
    db.exec("ALTER TABLE orders ADD COLUMN admin_notify_attempts INTEGER DEFAULT 0");
  }
  if (!orderCols.some((c) => c.name === "stuck_alerted_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN stuck_alerted_at TEXT");
  }
  const promoCols = db.prepare("PRAGMA table_info(promo_codes)").all() as { name: string }[];
  if (!promoCols.some((c) => c.name === "tg_id")) {
    // NULL = public promo; set = personal code usable only by that Telegram user
    db.exec("ALTER TABLE promo_codes ADD COLUMN tg_id INTEGER");
  }
  if (!promoCols.some((c) => c.name === "single_use")) {
    db.exec("ALTER TABLE promo_codes ADD COLUMN single_use INTEGER DEFAULT 0");
  }
  if (!promoCols.some((c) => c.name === "expires_at")) {
    db.exec("ALTER TABLE promo_codes ADD COLUMN expires_at TEXT");
  }
  if (!promoCols.some((c) => c.name === "max_discount")) {
    // Optional hard liability cap for loyalty rewards. NULL keeps legacy/admin
    // promos unchanged; Stars coupons always set an explicit ceiling.
    db.exec("ALTER TABLE promo_codes ADD COLUMN max_discount INTEGER");
  }
  if (!promoCols.some((c) => c.name === "required_product_id")) {
    // Gift coupons discount only the promised SKU instead of becoming an
    // unrestricted fixed discount when the customer removes the gift.
    db.exec("ALTER TABLE promo_codes ADD COLUMN required_product_id TEXT");
  }
  if (!promoCols.some((c) => c.name === "reward_id")) {
    db.exec("ALTER TABLE promo_codes ADD COLUMN reward_id TEXT");
  }
  if (!promoCols.some((c) => c.name === "created_at")) {
    db.exec("ALTER TABLE promo_codes ADD COLUMN created_at TEXT");
    db.exec("UPDATE promo_codes SET created_at = datetime('now') WHERE created_at IS NULL");
  }
  if (!promoCols.some((c) => c.name === "redeemed_at")) {
    db.exec("ALTER TABLE promo_codes ADD COLUMN redeemed_at TEXT");
  }
  if (!promoCols.some((c) => c.name === "redeemed_order_id")) {
    db.exec("ALTER TABLE promo_codes ADD COLUMN redeemed_order_id TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_waitlist_product ON waitlist(product_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_promo_reward ON promo_codes(reward_id, created_at)");
}

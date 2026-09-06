/**
 * Backlog hardening — round 2 of SECURITY_AUDIT_2026-09-05:
 * - L2: courier live-location arming (shipped-only, one courier per order,
 *       terminal transitions delete the live row)
 * - L4: tighter initData replay window on money routes (401 init_data_stale)
 * - L5: CORS platform wildcards removed; exact origins only (+CORS_EXTRA_ORIGINS)
 * - L7: LIKE wildcards in admin loyalty search cannot broaden the pattern
 * - M3: staff allowlist (STAFF_TG_USER_IDS) gates bot admin powers
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const TOKEN = "backlog-hardening-token";
const ADMIN_ID = 990001;
const STAFF_ID = 990002;
const COURIER_ID = 990101;
process.env.TG_BOT_TOKEN = TOKEN;
process.env.ADMIN_CHAT_ID = String(ADMIN_ID);
process.env.STAFF_TG_USER_IDS = String(STAFF_ID);
process.env.COURIER_CHAT_IDS = String(COURIER_ID);
process.env.CORS_EXTRA_ORIGINS = "https://preview-777.e2b.app";
// Money window left at default (900s) and general window at default (24h).
process.env.DELIS_DB_PATH = ":memory:";
process.env.DELIS_AUTOSTART = "0";
process.env.DELIS_DISABLE_NOTIFY = "1";
process.env.SEED_ON_START = "false";

function makeInitData(id: number, authDate?: number): string {
  const params = new URLSearchParams({
    auth_date: String(authDate ?? Math.floor(Date.now() / 1000) - 30),
    query_id: "AAEAAAA",
    user: JSON.stringify({ id, first_name: `User ${id}`, username: `user${id}` }),
  });
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}

const orderPayload = (over: Record<string, unknown> = {}) => ({
  items: [{ id: "wax", qty: 1, price: 0 }],
  subtotal: 0,
  discount: 0,
  deliveryFee: 12000,
  total: 999_999_999,
  recipient: { name: "Test Client", phone: "+998901234567" },
  delivery: { method: "pickup", zone: "Tashkent", address: "Factory", time: "today" },
  payment: { method: "cash" },
  ...over,
});

let app: Awaited<typeof import("./index.js")>["app"];
let db: ReturnType<Awaited<typeof import("./index.js")>["ensureDb"]>;

before(async () => {
  const mod = await import("./index.js");
  app = mod.app;
  db = mod.ensureDb();
  const { seedOnStart } = await import("./seed-runner.js");
  seedOnStart(true);
});

/* ───────────────────────── L4 — money-window initData ─────────────────── */

describe("L4 — money-window initData freshness", () => {
  it("detects a signature that is valid for browsing but stale for money", async () => {
    const { verifyInitData, isInitDataStaleForMoney, moneyMaxAgeSeconds } = await import("./auth.js");
    assert.equal(moneyMaxAgeSeconds(), 900); // audit default: 15 minutes
    const now = Math.floor(Date.now() / 1000);

    const stale = makeInitData(12345, now - 1200); // 20 min old: ok for 24h, stale for money
    assert.ok(verifyInitData(stale, now));
    assert.equal(isInitDataStaleForMoney(stale, now), true);

    const fresh = makeInitData(12345, now - 30);
    assert.equal(isInitDataStaleForMoney(fresh, now), false);

    const ancient = makeInitData(12345, now - 200_000); // older than the general window
    assert.equal(verifyInitData(ancient, now), null);
    assert.equal(isInitDataStaleForMoney(ancient, now), false); // invalid ≠ stale

    const garbage = "user=%7B%22id%22%3A1%7D&auth_date=1&hash=ab".repeat(4);
    assert.equal(isInitDataStaleForMoney(garbage, now), false);
  });

  it("checkout answers 401 init_data_stale for a valid-but-old signature", async () => {
    const now = Math.floor(Date.now() / 1000);
    const headers = {
      Authorization: `Telegram ${makeInitData(12377, now - 1200)}`,
      "Content-Type": "application/json",
    };
    const res = await app.inject({ method: "POST", url: "/v1/orders", headers, payload: orderPayload() });
    assert.equal(res.statusCode, 401, res.body);
    assert.equal(res.json().error, "init_data_stale");
  });

  it("returns route enforces the same money window", async () => {
    const now = Math.floor(Date.now() / 1000);
    const headers = {
      Authorization: `Telegram ${makeInitData(12378, now - 1200)}`,
      "Content-Type": "application/json",
    };
    const res = await app.inject({ method: "POST", url: "/v1/me/returns", headers, payload: { orderId: "DL-0000", productId: "wax", reason: "test" } });
    assert.equal(res.statusCode, 401, res.body);
    assert.equal(res.json().error, "init_data_stale");
  });

  it("fresh initData and browser sessions still pass checkout", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fresh = await app.inject({
      method: "POST",
      url: "/v1/orders",
      headers: { Authorization: `Telegram ${makeInitData(12379, now - 30)}`, "Content-Type": "application/json" },
      payload: orderPayload(),
    });
    assert.equal(fresh.statusCode, 200, fresh.body);

    const issued = await app.inject({ method: "POST", url: "/v1/auth/browser-session" });
    const browser = await app.inject({
      method: "POST",
      url: "/v1/orders",
      headers: { "X-Delis-Browser-Session": String(issued.json().token), "Content-Type": "application/json" },
      payload: orderPayload(),
    });
    assert.equal(browser.statusCode, 200, browser.body);
  });
});

/* ───────────────────────── L2 — courier arming ────────────────────────── */

describe("L2 — courier live-location arming", () => {
  before(() => {
    db.prepare("INSERT OR IGNORE INTO users (tg_id, first_name) VALUES (?, 'Courier Owner')").run(990500);
    const ins = db.prepare(
      `INSERT OR REPLACE INTO orders (id, tg_id, subtotal, total, delivery_method, payment_method, status)
       VALUES (?, 990500, 1000, 1000, 'courier_uzb', 'cash', ?)`,
    );
    ins.run("DL-7001", "new");
    ins.run("DL-7002", "preparing");
    ins.run("DL-7003", "shipped");
    db.prepare("DELETE FROM courier_locations WHERE order_id IN ('DL-7001','DL-7002','DL-7003')").run();
  });

  it("only orders that are actually out for delivery (shipped) can be armed", async () => {
    const { courierArmDecision } = await import("./bot.js");
    assert.deepEqual(courierArmDecision(db, { orderId: "DL-7999", courierId: COURIER_ID }), { ok: false, reason: "not_found" });
    assert.deepEqual(courierArmDecision(db, { orderId: "DL-7001", courierId: COURIER_ID }), { ok: false, reason: "not_shipped" });
    assert.deepEqual(courierArmDecision(db, { orderId: "DL-7002", courierId: COURIER_ID }), { ok: false, reason: "not_shipped" });
    assert.deepEqual(courierArmDecision(db, { orderId: "DL-7003", courierId: COURIER_ID }), { ok: true, orderId: "DL-7003" });
  });

  it("one courier per order — an active session cannot be hijacked", async () => {
    const { courierArmDecision } = await import("./bot.js");
    db.prepare(
      `INSERT INTO courier_locations (order_id, tg_id, lat, lon, updated_ms, live_until_ms)
       VALUES ('DL-7003', ?, 41.3, 69.2, ?, ?)`,
    ).run(COURIER_ID, Date.now(), Date.now() + 600_000);

    assert.deepEqual(
      courierArmDecision(db, { orderId: "DL-7003", courierId: COURIER_ID + 1 }),
      { ok: false, reason: "already_tracked" },
    );
    // the bound courier himself may re-arm (restarts wipe the in-memory arm map)
    assert.deepEqual(
      courierArmDecision(db, { orderId: "DL-7003", courierId: COURIER_ID }),
      { ok: true, orderId: "DL-7003" },
    );
    // an EXPIRED session frees the order for another courier
    db.prepare("UPDATE courier_locations SET live_until_ms = ? WHERE order_id = 'DL-7003'").run(Date.now() - 1_000);
    assert.deepEqual(
      courierArmDecision(db, { orderId: "DL-7003", courierId: COURIER_ID + 1 }),
      { ok: true, orderId: "DL-7003" },
    );
  });

  it("terminal status transitions delete the live row immediately", async () => {
    const { transitionOrderStatus } = await import("./bot.js");
    db.prepare("DELETE FROM courier_locations WHERE order_id = 'DL-7002'").run();
    db.prepare(
      `INSERT INTO courier_locations (order_id, tg_id, lat, lon, updated_ms, live_until_ms)
       VALUES ('DL-7002', ?, 41.3, 69.2, ?, ?)`,
    ).run(COURIER_ID, Date.now(), Date.now() + 3_600_000);

    const res = await transitionOrderStatus(db, "DL-7002", "shipped"); // preparing → shipped keeps tracking
    assert.equal(res.ok, true);
    assert.ok(db.prepare("SELECT 1 FROM courier_locations WHERE order_id = 'DL-7002'").get());

    const done = await transitionOrderStatus(db, "DL-7002", "delivered"); // shipped → delivered
    assert.equal(done.ok, true);
    assert.equal(db.prepare("SELECT 1 FROM courier_locations WHERE order_id = 'DL-7002'").get(), undefined);
  });
});

/* ───────────────────────── M3 — staff allowlist ───────────────────────── */

describe("M3 — staff allowlist gates bot admin powers", () => {
  it("admin and listed staff pass; anyone else (group members) does not", async () => {
    const { isBotStaff } = await import("./bot.js");
    assert.equal(isBotStaff(ADMIN_ID), true); // personal-chat admin is implicitly staff
    assert.equal(isBotStaff(STAFF_ID), true); // explicit STAFF_TG_USER_IDS entry
    assert.equal(isBotStaff(987_654), false); // random group member
    assert.equal(isBotStaff(undefined), false);
    assert.equal(isBotStaff(-100_400), false); // group chat ids are never user ids
  });

  it("group ADMIN_CHAT_ID without a staff allowlist fails readiness", async () => {
    process.env.DELIS_DEV_ADMIN_TOKEN = "backlog-dev-token";
    const prevAdmin = process.env.ADMIN_CHAT_ID;
    const prevStaff = process.env.STAFF_TG_USER_IDS;
    try {
      process.env.ADMIN_CHAT_ID = "-100400";
      process.env.STAFF_TG_USER_IDS = "";
      const bad = await app.inject({
        method: "GET",
        url: "/v1/admin/readiness",
        headers: { "X-Delis-Dev-Admin": "backlog-dev-token" },
      });
      const check = bad.json().checks.find((c: { id: string }) => c.id === "admin_staff_allowlist");
      assert.ok(check, "admin_staff_allowlist check present");
      assert.equal(check.level, "fail");

      process.env.STAFF_TG_USER_IDS = "111,222";
      const good = await app.inject({
        method: "GET",
        url: "/v1/admin/readiness",
        headers: { "X-Delis-Dev-Admin": "backlog-dev-token" },
      });
      assert.equal(good.json().checks.find((c: { id: string }) => c.id === "admin_staff_allowlist").level, "ok");
    } finally {
      process.env.ADMIN_CHAT_ID = prevAdmin;
      process.env.STAFF_TG_USER_IDS = prevStaff;
      delete process.env.DELIS_DEV_ADMIN_TOKEN;
    }
  });
});

/* ───────────────────────── L7 — loyalty search hygiene ────────────────── */

describe("L7 — loyalty search LIKE hygiene", () => {
  const ADMIN = () => ({ Authorization: `Telegram ${makeInitData(ADMIN_ID)}` });

  before(() => {
    db.prepare("INSERT OR IGNORE INTO users (tg_id, first_name, username, phone) VALUES (?, 'Anvar', 'anvar1', '+998901110001')").run(881_001);
    db.prepare("INSERT OR IGNORE INTO users (tg_id, first_name, username, phone) VALUES (?, 'Bekzod', 'bekzod2', '+998901110002')").run(881_002);
  });

  it("wildcard-only queries match nothing instead of everything", async () => {
    for (const q of ["%%", "__", "%_", "%%%", "_%_"]) {
      const res = await app.inject({ method: "GET", url: "/v1/admin/loyalty/search", headers: ADMIN(), query: { q } });
      assert.equal(res.statusCode, 200, res.body);
      assert.deepEqual(res.json().members, [], `q=${q} must not broaden the pattern`);
    }
  });

  it("normal queries still find members by name and phone", async () => {
    const byName = await app.inject({ method: "GET", url: "/v1/admin/loyalty/search", headers: ADMIN(), query: { q: "Anvar" } });
    assert.ok(byName.json().members.some((m: { tg_id: number }) => Number(m.tg_id) === 881_001));

    const byPhone = await app.inject({ method: "GET", url: "/v1/admin/loyalty/search", headers: ADMIN(), query: { q: "9011100" } });
    assert.equal(byPhone.json().members.length, 2);

    // a wildcard INSIDE a real query is stripped, not interpreted
    const stripped = await app.inject({ method: "GET", url: "/v1/admin/loyalty/search", headers: ADMIN(), query: { q: "Anva%r" } });
    assert.ok(stripped.json().members.some((m: { tg_id: number }) => Number(m.tg_id) === 881_001));
  });
});

/* ───────────────────────── L5 — CORS allowlist ────────────────────────── */

describe("L5 — CORS origin allowlist", () => {
  const acao = async (origin: string) =>
    (await app.inject({ method: "GET", url: "/v1/payment-methods", headers: { Origin: origin } }))
      .headers["access-control-allow-origin"];

  it("platform wildcards are no longer trusted", async () => {
    assert.equal(await acao("https://evil-sandbox.e2b.app"), undefined);
    assert.equal(await acao("https://anything.vercel.app"), undefined);
    assert.equal(await acao("https://stranger.github.io"), undefined);
    assert.equal(await acao("https://delis-tg-admin.onrender.com.e2b.app"), undefined);
  });

  it("explicitly allowed origins pass (Pages host, extra origin, localhost)", async () => {
    assert.equal(await acao("https://sk1py-cmd.github.io"), "https://sk1py-cmd.github.io");
    assert.equal(await acao("https://preview-777.e2b.app"), "https://preview-777.e2b.app"); // CORS_EXTRA_ORIGINS
    assert.equal(await acao("http://localhost:5173"), "http://localhost:5173");
  });
});

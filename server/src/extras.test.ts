/**
 * Integration tests: QR batch registry (auth scanner backend), one-time
 * birthday lock, DB-driven wholesale tiers, B2B access codes,
 * gift certificates (request → activate → redeem once at checkout).
 * DELIS_DISABLE_NOTIFY=1 keeps the bot client silent — zero network calls.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const TOKEN = "test-bot-token";
const ADMIN_ID = 555000111;
process.env.TG_BOT_TOKEN = TOKEN;
process.env.ADMIN_CHAT_ID = String(ADMIN_ID);
process.env.DELIS_DB_PATH = ":memory:";
process.env.DELIS_AUTOSTART = "0";
process.env.DELIS_DISABLE_NOTIFY = "1";
process.env.SEED_ON_START = "false";

let app: Awaited<typeof import("./index.js")>["app"];

function makeInitData(user: { id: number; first_name?: string; username?: string }): string {
  const params = new URLSearchParams({
    auth_date: Math.floor(Date.now() / 1000).toString(),
    query_id: "AAEAAAA",
    user: JSON.stringify(user),
  });
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheck).digest("hex"));
  return params.toString();
}

const authOf = (tgId: number) => ({
  Authorization: `Telegram ${makeInitData({ id: tgId, first_name: "Test", username: `user${tgId}` })}`,
});
const JSON_POST = { "Content-Type": "application/json" };
const ADMIN = () => ({ ...authOf(ADMIN_ID), ...JSON_POST });

const orderPayload = (over: Record<string, unknown> = {}) => ({
  items: [{ id: "wax", qty: 1, price: 0 }],
  recipient: { name: "Test Client", phone: "+998901234567" },
  delivery: { method: "pickup", zone: "Tashkent", address: "Factory", time: "today" },
  payment: { method: "cash" },
  ...over,
});

before(async () => {
  const mod = await import("./index.js");
  app = mod.app;
  mod.ensureDb();
  const { seedOnStart } = await import("./seed-runner.js");
  seedOnStart(); // products only — qr_batches intentionally NOT seeded in prod
});

/* ─────────────── QR BATCH REGISTRY ─────────────── */

describe("QR batch registry (authenticity scanner backend)", () => {
  let autoCode = "";

  it("rejects non-admins", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/admin/qr-batches", headers: authOf(12345) });
    assert.equal(res.statusCode, 403);
  });

  it("starts empty (no demo batches in production mode)", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/admin/qr-batches", headers: ADMIN() });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().batches.length, 0);
  });

  it("creates a batch with an auto-generated code", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/admin/qr-batches", headers: ADMIN(),
      payload: { productId: "wax", producedAt: "2026-08-01", batchNo: 7 },
    });
    assert.equal(res.statusCode, 200);
    autoCode = res.json().code;
    assert.match(autoCode, /^DL-[A-Z0-9]{6}$/);
  });

  it("rejects duplicate codes with 409", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/admin/qr-batches", headers: ADMIN(),
      payload: { code: autoCode, productId: "wax", producedAt: "2026-08-02", batchNo: 8 },
    });
    assert.equal(res.statusCode, 409);
  });

  it("public scanner endpoint validates the code (qr on the bottle)", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/qr/${autoCode}` });
    assert.equal(res.statusCode, 200);
    const info = res.json();
    assert.equal(info.valid, true);
    assert.equal(info.productId, "wax");
    assert.equal(info.producedAt, "2026-08-01");
    assert.equal(info.batchNo, 7);
  });

  it("unknown codes never validate", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/qr/DL-FAKE99" });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().valid, false);
  });

  it("admin edits production date & batch number", async () => {
    const res = await app.inject({
      method: "PATCH", url: `/v1/admin/qr-batches/${autoCode}`, headers: ADMIN(),
      payload: { producedAt: "2026-07-15", batchNo: 12 },
    });
    assert.equal(res.statusCode, 200);
    const check = await app.inject({ method: "GET", url: `/v1/qr/${autoCode}` });
    assert.equal(check.json().producedAt, "2026-07-15");
    assert.equal(check.json().batchNo, 12);
  });

  it("admin deletes a batch → it stops validating", async () => {
    const del = await app.inject({ method: "DELETE", url: `/v1/admin/qr-batches/${autoCode}`, headers: authOf(ADMIN_ID) });
    assert.equal(del.statusCode, 200);
    const check = await app.inject({ method: "GET", url: `/v1/qr/${autoCode}` });
    assert.equal(check.statusCode, 404);
  });
});

/* ─────────────── BIRTHDAY ONE-TIME LOCK ─────────────── */

describe("Birthday: set once, locked forever", () => {
  const USER = 777001;

  it("first set succeeds", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/me/birthday", headers: { ...authOf(USER), ...JSON_POST }, payload: { birthday: "03-15" } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().birthday, "03-15");
  });

  it("same value is idempotent", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/me/birthday", headers: { ...authOf(USER), ...JSON_POST }, payload: { birthday: "03-15" } });
    assert.equal(res.statusCode, 200);
  });

  it("a different value is REJECTED (anti BDAY10 farming)", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/me/birthday", headers: { ...authOf(USER), ...JSON_POST }, payload: { birthday: "12-31" } });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error, "birthday_locked");
    assert.equal(res.json().birthday, "03-15");
  });
});

/* ─────────────── WHOLESALE TIERS FROM DB ─────────────── */

describe("Wholesale tiers: admin-editable, used by server pricing", () => {
  it("public endpoint reflects the table", async () => {
    const put = await app.inject({
      method: "PUT", url: "/v1/admin/wholesale-tiers", headers: ADMIN(),
      payload: { tiers: [{ minQty: 6, percent: 12 }, { minQty: 12, percent: 20 }, { minQty: 24, percent: 28 }, { minQty: 48, percent: 35 }] },
    });
    assert.equal(put.statusCode, 200);
    const pub = await app.inject({ method: "GET", url: "/v1/wholesale-tiers" });
    assert.equal(pub.json().tiers.length, 4);
  });

  it("non-admin cannot change tiers", async () => {
    const res = await app.inject({
      method: "PUT", url: "/v1/admin/wholesale-tiers", headers: { ...authOf(999), ...JSON_POST },
      payload: { tiers: [{ minQty: 2, percent: 90 }] },
    });
    assert.equal(res.statusCode, 403);
  });

  it("server prices wholesale order lines from the DB ladder", async () => {
    // Custom ladder: from 6 pcs → −50%
    await app.inject({
      method: "PUT", url: "/v1/admin/wholesale-tiers", headers: ADMIN(),
      payload: { tiers: [{ minQty: 6, percent: 50 }] },
    });
    // wax retail 128 000 → wholesale unit = 64 000 at −50% (rounded to 10)
    const res = await app.inject({
      method: "POST", url: "/v1/orders", headers: { ...authOf(777100), ...JSON_POST },
      payload: orderPayload({ items: [{ id: "wax", qty: 6, price: 0 }] }),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().subtotal, 64_000 * 6);
    // Restore the real ladder
    await app.inject({
      method: "PUT", url: "/v1/admin/wholesale-tiers", headers: ADMIN(),
      payload: { tiers: [{ minQty: 6, percent: 12 }, { minQty: 12, percent: 20 }, { minQty: 24, percent: 28 }, { minQty: 48, percent: 35 }] },
    });
  });
});

/* ─────────────── B2B ACCESS CODES ─────────────── */

describe("B2B access codes", () => {
  let code = "";
  it("admin issues a partner code", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/b2b-codes", headers: ADMIN(), payload: { label: "Test partner" } });
    assert.equal(res.statusCode, 200);
    code = res.json().code;
    assert.match(code, /^B2B-[A-Z0-9]{6}$/);
  });

  it("verify works with auth, rejects strangers' bad codes", async () => {
    const ok = await app.inject({ method: "POST", url: "/v1/b2b/verify", headers: { ...authOf(777200), ...JSON_POST }, payload: { code } });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().ok, true);
    const bad = await app.inject({ method: "POST", url: "/v1/b2b/verify", headers: { ...authOf(777200), ...JSON_POST }, payload: { code: "WRONG-000" } });
    assert.equal(bad.statusCode, 404);
    const noAuth = await app.inject({ method: "POST", url: "/v1/b2b/verify", headers: JSON_POST, payload: { code } });
    assert.equal(noAuth.statusCode, 401);
  });

  it("deleted codes stop verifying", async () => {
    await app.inject({ method: "DELETE", url: `/v1/admin/b2b-codes/${code}`, headers: authOf(ADMIN_ID) });
    const res = await app.inject({ method: "POST", url: "/v1/b2b/verify", headers: { ...authOf(777200), ...JSON_POST }, payload: { code } });
    assert.equal(res.statusCode, 404);
  });
});

/* ─────────────── GIFT CERTIFICATES ─────────────── */

describe("Gift certificates: request → activate → redeem once", () => {
  const BUYER = 777300;
  let code = "";

  it("customer request is born PENDING (not payable yet)", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/certificates", headers: { ...authOf(BUYER), ...JSON_POST },
      payload: { amount: 100_000, to: "Diyor" },
    });
    assert.equal(res.statusCode, 200);
    code = res.json().code;
    assert.match(code, /^GIFT-[A-Z0-9]{6}$/);
    assert.equal(res.json().status, "pending");
  });

  it("amount limits are enforced", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/certificates", headers: { ...authOf(BUYER), ...JSON_POST },
      payload: { amount: 10_000 },
    });
    assert.equal(res.statusCode, 400);
  });

  it("pending cert cannot be checked out (409 cert_pending)", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/certificates/check", headers: { ...authOf(BUYER), ...JSON_POST }, payload: { code } });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error, "cert_pending");
  });

  it("order with a pending cert is refused", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/orders", headers: { ...authOf(BUYER), ...JSON_POST },
      payload: orderPayload({ certCode: code }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "invalid_certificate");
  });

  it("admin activates after payment → check passes", async () => {
    const act = await app.inject({ method: "PATCH", url: `/v1/admin/certificates/${code}`, headers: ADMIN(), payload: { action: "activate" } });
    assert.equal(act.statusCode, 200);
    const chk = await app.inject({ method: "POST", url: "/v1/certificates/check", headers: { ...authOf(BUYER), ...JSON_POST }, payload: { code } });
    assert.equal(chk.statusCode, 200);
    assert.equal(chk.json().amount, 100_000);
  });

  it("order burns the cert: wax 128 000 − 100 000 = 28 000", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/orders", headers: { ...authOf(BUYER), ...JSON_POST },
      payload: orderPayload({ certCode: code }),
    });
    assert.equal(res.statusCode, 200);
    const o = res.json();
    assert.equal(o.subtotal, 128_000);
    assert.equal(o.certApplied, 100_000);
    assert.equal(o.total, 28_000);
  });

  it("double-spend is impossible (second order with same code → 400)", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/orders", headers: { ...authOf(BUYER), ...JSON_POST },
      payload: orderPayload({ certCode: code }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "invalid_certificate");
  });

  it("redeemed cert shows in customer list with order id", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/certificates", headers: authOf(BUYER) });
    const mine = res.json().certificates.find((c: any) => c.code === code);
    assert.equal(mine.status, "redeemed");
    assert.match(mine.order_id, /^DL-/);
  });

  it("admin-issued cert is born ACTIVE and its value is capped by goods total", async () => {
    const issue = await app.inject({
      method: "POST", url: "/v1/admin/certificates", headers: ADMIN(),
      payload: { amount: 500_000, to: "VIP" },
    });
    assert.equal(issue.statusCode, 200);
    const vip = issue.json().code;
    // glass = 48 000 → cert covers only 48 000, customer pays 0 (pickup)
    const res = await app.inject({
      method: "POST", url: "/v1/orders", headers: { ...authOf(777400), ...JSON_POST },
      payload: orderPayload({ items: [{ id: "glass", qty: 1, price: 0 }], certCode: vip }),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().certApplied, 48_000);
    assert.equal(res.json().total, 0);
  });

  it("revoke blocks further use", async () => {
    const issue = await app.inject({ method: "POST", url: "/v1/admin/certificates", headers: ADMIN(), payload: { amount: 100_000 } });
    const c2 = issue.json().code;
    await app.inject({ method: "PATCH", url: `/v1/admin/certificates/${c2}`, headers: ADMIN(), payload: { action: "revoke" } });
    const chk = await app.inject({ method: "POST", url: "/v1/certificates/check", headers: { ...authOf(777400), ...JSON_POST }, payload: { code: c2 } });
    assert.equal(chk.statusCode, 409);
    assert.equal(chk.json().error, "cert_revoked");
  });
});

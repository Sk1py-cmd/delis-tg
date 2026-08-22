/**
 * Payment keys must be pasteable in TWO places with zero code changes:
 *   • Render → Environment (PAYME_… / CLICK_… variables), and
 *   • the bot admin panel (stored in content_settings, applied instantly).
 *
 * These tests lock that contract down: resolution order, masking of secrets,
 * clearing an override, and — most importantly — that the live Payme/Click
 * webhooks really honour keys typed in the admin panel.
 *
 * Runs against an in-memory SQLite DB — no listen, no bot.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";

const TOKEN = "test-bot-token";
const ADMIN_ID = 555000222;
process.env.TG_BOT_TOKEN = TOKEN;
process.env.ADMIN_CHAT_ID = String(ADMIN_ID);
process.env.DELIS_DB_PATH = ":memory:";
process.env.DELIS_AUTOSTART = "0";
process.env.DELIS_DISABLE_NOTIFY = "1";
process.env.SEED_ON_START = "false";
/* Values that can only come from the environment. */
process.env.PAYME_MERCHANT_ID = "env-payme-merchant";
process.env.PAYME_KEY = "env-payme-key";
process.env.CLICK_SERVICE_ID = "777";
process.env.CLICK_MERCHANT_ID = "env-click-merchant";
process.env.CLICK_SECRET = "env-click-secret";

let app: Awaited<typeof import("./index.js")>["app"];

function makeInitData(user: { id: number; first_name?: string }): string {
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

const adminAuth = () => ({ Authorization: `Telegram ${makeInitData({ id: ADMIN_ID, first_name: "Owner" })}` });
const adminHeaders = () => ({ ...adminAuth(), "Content-Type": "application/json" });

const userHeaders = () => ({
  Authorization: `Telegram ${makeInitData({ id: 4242, first_name: "Client" })}`,
  "Content-Type": "application/json",
});

const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const basic = (key: string) => "Basic " + Buffer.from(`Paycom:${key}`).toString("base64");

const field = (body: any, id: string) => body.fields.find((f: any) => f.id === id);

const savePayments = (payload: Record<string, string>) =>
  app.inject({ method: "PUT", url: "/v1/admin/payments", headers: adminHeaders(), payload });

before(async () => {
  const mod = await import("./index.js");
  app = mod.app;
  mod.ensureDb();
  const { seedOnStart } = await import("./seed-runner.js");
  seedOnStart();
});

describe("payment credentials — ENV or admin panel", () => {
  it("hides the payments admin from non-admins", async () => {
    for (const call of [
      app.inject({ method: "GET", url: "/v1/admin/payments", headers: { Authorization: `Telegram ${makeInitData({ id: 4242, first_name: "Client" })}` } }),
      app.inject({ method: "PUT", url: "/v1/admin/payments", headers: userHeaders(), payload: { paymeKey: "x" } }),
      app.inject({ method: "POST", url: "/v1/admin/payments/self-check", headers: { Authorization: `Telegram ${makeInitData({ id: 4242, first_name: "Client" })}` } }),
      app.inject({ method: "GET", url: "/v1/admin/payments" }),
    ]) {
      const res = await call;
      assert.ok(res.statusCode === 403 || res.statusCode === 401, `expected auth failure, got ${res.statusCode}`);
    }
  });

  it("reports ENV keys as configured and never echoes a secret", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/admin/payments", headers: adminAuth() });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();

    assert.deepEqual(body.availability, { payme: true, click: true, cash: true, stars: true });
    assert.equal(field(body, "paymeMerchantId").value, "env-payme-merchant");
    assert.equal(field(body, "paymeMerchantId").source, "env");
    assert.equal(field(body, "paymeKey").configured, true);
    assert.equal(field(body, "paymeKey").source, "env");
    assert.match(field(body, "paymeKey").value, /^••••/);
    assert.doesNotMatch(res.body, /env-payme-key|env-click-secret/);
    assert.equal(res.headers["cache-control"], "no-store");
  });

  it("prints ready-to-paste webhook URLs for the provider cabinets", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/payments",
      headers: { ...adminAuth(), host: "api.delis.uz", "x-forwarded-proto": "https" },
    });
    const body = res.json();
    assert.equal(body.webhooks.payme, "https://api.delis.uz/v1/webhooks/payme");
    assert.equal(body.webhooks.click, "https://api.delis.uz/v1/webhooks/click");
  });

  it("applies keys typed in the admin panel instantly, without a redeploy", async () => {
    const saved = await savePayments({ paymeMerchantId: "admin-payme-merchant", paymeKey: "admin-payme-key" });
    assert.equal(saved.statusCode, 200, saved.body);
    const body = saved.json();
    assert.equal(body.ok, true);
    assert.equal(field(body, "paymeMerchantId").value, "admin-payme-merchant");
    assert.equal(field(body, "paymeMerchantId").source, "admin");
    assert.equal(field(body, "paymeKey").source, "admin");
    assert.doesNotMatch(saved.body, /admin-payme-key/);

    // The public capability flags stay truthful…
    const methods = await app.inject({ method: "GET", url: "/v1/payment-methods" });
    assert.equal(methods.json().payme, true);
    assert.doesNotMatch(methods.body, /merchant|secret|key/i);

    // …and the live Payme webhook now authenticates with the NEW key only.
    const withOldKey = await app.inject({
      method: "POST", url: "/v1/webhooks/payme",
      headers: { Authorization: basic("env-payme-key"), "Content-Type": "application/json" },
      payload: { method: "CheckPerformTransaction", params: { amount: 100, account: { order_id: "NOPE" } }, id: 1 },
    });
    assert.equal(withOldKey.json().error.code, -32504);

    const withNewKey = await app.inject({
      method: "POST", url: "/v1/webhooks/payme",
      headers: { Authorization: basic("admin-payme-key"), "Content-Type": "application/json" },
      payload: { method: "CheckPerformTransaction", params: { amount: 100, account: { order_id: "NOPE" } }, id: 1 },
    });
    assert.equal(withNewKey.json().error.code, -31050); // auth passed, order simply does not exist
  });

  it("applies admin Click keys to the live webhook signature check", async () => {
    const saved = await savePayments({ clickServiceId: "888", clickSecret: "admin-click-secret" });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.doesNotMatch(saved.body, /admin-click-secret/);

    const signTime = "2026-08-17 12:00:00";
    const form = (sign: string, serviceId: string) =>
      `click_trans_id=1001&service_id=${serviceId}&merchant_trans_id=NOPE&amount=1000&action=0&sign_time=${encodeURIComponent(signTime)}&sign_string=${sign}`;
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };

    const wrongService = await app.inject({
      method: "POST", url: "/v1/webhooks/click", headers,
      payload: form(md5(`1001777admin-click-secretNOPE100002026-08-17 12:00:00`), "777"),
    });
    assert.equal(wrongService.json().error, -8); // 777 is no longer our service id

    const oldSecret = await app.inject({
      method: "POST", url: "/v1/webhooks/click", headers,
      payload: form(md5(`1001888env-click-secretNOPE10000${signTime}`), "888"),
    });
    assert.equal(oldSecret.json().error, -1); // signature built with the outdated secret

    const newSecret = await app.inject({
      method: "POST", url: "/v1/webhooks/click", headers,
      payload: form(md5(`1001888admin-click-secretNOPE10000${signTime}`), "888"),
    });
    assert.equal(newSecret.json().error, -5); // signature accepted, order simply does not exist
  });

  it("falls back to ENV when an admin override is cleared", async () => {
    const cleared = await savePayments({ paymeMerchantId: "", paymeKey: "", clickServiceId: "", clickSecret: "" });
    assert.equal(cleared.statusCode, 200, cleared.body);
    const body = cleared.json();
    assert.equal(field(body, "paymeMerchantId").value, "env-payme-merchant");
    assert.equal(field(body, "paymeMerchantId").source, "env");
    assert.equal(field(body, "paymeKey").source, "env");
    assert.equal(field(body, "clickSecret").source, "env");
    assert.equal(body.availability.payme, true);
    assert.equal(body.availability.click, true);

    const backOnEnvKey = await app.inject({
      method: "POST", url: "/v1/webhooks/payme",
      headers: { Authorization: basic("env-payme-key"), "Content-Type": "application/json" },
      payload: { method: "CheckPerformTransaction", params: { amount: 100, account: { order_id: "NOPE" } }, id: 1 },
    });
    assert.equal(backOnEnvKey.json().error.code, -31050);
  });

  it("turns an unavailable method on immediately after the admin fills every field", async () => {
    const envBackup = {
      PAYME_MERCHANT_ID: process.env.PAYME_MERCHANT_ID,
      PAYME_KEY: process.env.PAYME_KEY,
      CLICK_SERVICE_ID: process.env.CLICK_SERVICE_ID,
      CLICK_MERCHANT_ID: process.env.CLICK_MERCHANT_ID,
      CLICK_SECRET: process.env.CLICK_SECRET,
    };
    delete process.env.PAYME_MERCHANT_ID;
    delete process.env.PAYME_KEY;
    delete process.env.CLICK_SERVICE_ID;
    delete process.env.CLICK_MERCHANT_ID;
    delete process.env.CLICK_SECRET;
    try {
      await savePayments({ paymeMerchantId: "", paymeKey: "", clickServiceId: "", clickMerchantId: "", clickSecret: "" });
      const before = await app.inject({ method: "GET", url: "/v1/payment-methods" });
      assert.deepEqual(before.json(), { payme: false, click: false, cash: true, stars: true });

      const saved = await savePayments({
        paymeMerchantId: "live-admin-payme",
        paymeKey: "live-admin-payme-key",
        clickServiceId: "999",
        clickMerchantId: "live-admin-click",
        clickSecret: "live-admin-click-secret",
      });
      assert.equal(saved.statusCode, 200, saved.body);
      assert.equal(saved.json().availability.payme, true);
      assert.equal(saved.json().availability.click, true);

      // This is the same endpoint polled by an already-open checkout.
      const after = await app.inject({ method: "GET", url: "/v1/payment-methods" });
      assert.deepEqual(after.json(), { payme: true, click: true, cash: true, stars: true });

      // A new order immediately gets a provider URL generated from the values
      // typed in the admin panel — no process restart or frontend rebuild.
      const order = await app.inject({
        method: "POST", url: "/v1/orders", headers: userHeaders(),
        payload: {
          items: [{ id: "wax", qty: 1 }],
          recipient: { name: "Payment Test", phone: "+998901234567" },
          delivery: { method: "pickup", zone: "namangan", address: "Factory", time: "today" },
          payment: { method: "payme" },
        },
      });
      assert.equal(order.statusCode, 200, order.body);
      assert.match(order.json().payment_url, /^https:\/\/checkout\.payme\.uz\//);
      const decoded = Buffer.from(String(order.json().payment_url).split("/").pop()!, "base64").toString("utf8");
      assert.match(decoded, /m=live-admin-payme/);
    } finally {
      Object.assign(process.env, envBackup);
      await savePayments({ paymeMerchantId: "", paymeKey: "", clickServiceId: "", clickMerchantId: "", clickSecret: "" });
    }
  });

  it("rejects malformed payloads", async () => {
    const res = await app.inject({
      method: "PUT", url: "/v1/admin/payments", headers: adminHeaders(),
      payload: { paymeKey: 12345 },
    });
    assert.equal(res.statusCode, 400, res.body);
    assert.equal(res.json().error, "invalid_payment_config");
    const click = await savePayments({ clickServiceId: "not-a-number" });
    assert.equal(click.statusCode, 400, click.body);
    assert.equal(click.json().error, "invalid_payment_config");
  });

  it("self-check explains what is missing without leaking secrets", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/payments/self-check", headers: adminAuth() });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    const byId = Object.fromEntries(body.checks.map((c: any) => [c.id, c]));
    assert.equal(byId.payme.level, "ok");
    assert.equal(byId.click.level, "ok");
    assert.ok(byId.webhooks, "webhook check present");
    assert.equal(byId.admin.level, "ok");
    assert.deepEqual(body.ready.payme, true);
    assert.doesNotMatch(res.body, /env-payme-key|env-click-secret/);
  });
});

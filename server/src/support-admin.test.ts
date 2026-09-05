/**
 * Support in the admin panel:
 * - threads list / thread detail / reply (customer sees the reply in
 *   /v1/me/chat, Telegram delivery is best-effort)
 * - "write to the manager" notes (saved + delivered to the manager's TG)
 * - editable support settings (greeting / quick questions), public read
 *   for the customer's "Chat with manager" sheet
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const TOKEN = "support-admin-token";
const ADMIN_ID = 919001;
const CUSTOMER_A = 921001;
const CUSTOMER_B = 921002;
process.env.TG_BOT_TOKEN = TOKEN;
process.env.ADMIN_CHAT_ID = String(ADMIN_ID);
process.env.DELIS_DB_PATH = ":memory:";
process.env.DELIS_AUTOSTART = "0";
process.env.DELIS_DISABLE_NOTIFY = "1";
process.env.SEED_ON_START = "false";

let app: Awaited<typeof import("./index.js")>["app"];

function makeInitData(id: number): string {
  const params = new URLSearchParams({
    auth_date: Math.floor(Date.now() / 1000).toString(),
    query_id: "AAEAAAA",
    user: JSON.stringify({ id, first_name: `User ${id}`, username: `user${id}` }),
  });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}
const auth = (id: number, json = false) => ({
  Authorization: `Telegram ${makeInitData(id)}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});
const ADMIN = () => auth(ADMIN_ID, true);

before(async () => {
  const mod = await import("./index.js");
  app = mod.app;
  mod.ensureDb();
  const { seedOnStart } = await import("./seed-runner.js");
  seedOnStart(true);
});

describe("support inbox (admin panel)", () => {
  it("non-admin cannot list threads", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/admin/support/threads", headers: auth(CUSTOMER_A) });
    assert.equal(res.statusCode, 403);
  });

  it("lists customer threads with last-message preview", async () => {
    const a1 = await app.inject({ method: "POST", url: "/v1/me/chat", headers: auth(CUSTOMER_A, true), payload: { text: "Hello, where is my order?" } });
    assert.equal(a1.statusCode, 201, a1.body);
    const a2 = await app.inject({ method: "POST", url: "/v1/me/chat", headers: auth(CUSTOMER_A, true), payload: { text: "Any update on the delivery?" } });
    assert.equal(a2.statusCode, 201, a2.body);
    const b1 = await app.inject({ method: "POST", url: "/v1/me/chat", headers: auth(CUSTOMER_B, true), payload: { text: "Hi, how to pay with stars?" } });
    assert.equal(b1.statusCode, 201, b1.body);

    const list = await app.inject({ method: "GET", url: "/v1/admin/support/threads", headers: auth(ADMIN_ID) });
    assert.equal(list.statusCode, 200, list.body);
    const threads = list.json();
    assert.equal(threads.length, 2);
    // Most recently active thread first (B's message is the newest overall)
    assert.equal(threads[0].tgId, CUSTOMER_B);
    assert.equal(threads[0].lastText, "Hi, how to pay with stars?");
    assert.equal(threads[0].total, 1);
    assert.equal(threads[1].tgId, CUSTOMER_A);
    assert.equal(threads[1].lastText, "Any update on the delivery?");
    assert.equal(threads[1].lastSender, "customer");
    assert.equal(threads[1].total, 2);
    assert.equal(threads[1].name, `User ${CUSTOMER_A}`);
  });

  it("shows a full thread in ascending order", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/admin/support/threads/${CUSTOMER_A}`, headers: auth(ADMIN_ID) });
    assert.equal(res.statusCode, 200, res.body);
    const messages = res.json();
    assert.equal(messages.length, 2);
    assert.equal(messages[0].text, "Hello, where is my order?");
    assert.equal(messages[0].from, "user");
    assert.equal(messages[1].text, "Any update on the delivery?");
  });

  it("404 for an unknown thread, 400 for a malformed id", async () => {
    const missing = await app.inject({ method: "GET", url: "/v1/admin/support/threads/999999", headers: auth(ADMIN_ID) });
    assert.equal(missing.statusCode, 404);
    const bad = await app.inject({ method: "GET", url: "/v1/admin/support/threads/abc", headers: auth(ADMIN_ID) });
    assert.equal(bad.statusCode, 400);
  });

  it("admin reply lands in the customer's thread (stored, delivery best-effort)", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/admin/support/reply", headers: ADMIN(),
      payload: { tgId: CUSTOMER_A, text: "Your order is on the way 🚚" },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().ok, true);
    // DISABLE_NOTIFY in tests → stored in-app, Telegram skipped
    assert.equal(res.json().delivered, false);

    const customerView = await app.inject({ method: "GET", url: "/v1/me/chat", headers: auth(CUSTOMER_A) });
    const messages = customerView.json();
    assert.equal(messages.length, 3);
    assert.equal(messages[2].from, "manager");
    assert.equal(messages[2].text, "Your order is on the way 🚚");

    // Thread list now shows the manager's last message
    const list = await app.inject({ method: "GET", url: "/v1/admin/support/threads", headers: auth(ADMIN_ID) });
    const threadA = list.json().find((t: any) => t.tgId === CUSTOMER_A);
    assert.equal(threadA.lastSender, "manager");
    assert.equal(threadA.total, 3);
  });

  it("rejects replies to unknown threads and empty text", async () => {
    const noThread = await app.inject({
      method: "POST", url: "/v1/admin/support/reply", headers: ADMIN(),
      payload: { tgId: 999999, text: "Hi" },
    });
    assert.equal(noThread.statusCode, 404);
    const empty = await app.inject({
      method: "POST", url: "/v1/admin/support/reply", headers: ADMIN(),
      payload: { tgId: CUSTOMER_A, text: "   " },
    });
    assert.equal(empty.statusCode, 400);
    const notAdmin = await app.inject({
      method: "POST", url: "/v1/admin/support/reply", headers: auth(CUSTOMER_A, true),
      payload: { tgId: CUSTOMER_A, text: "Self-reply" },
    });
    assert.equal(notAdmin.statusCode, 403);
  });
});

describe("write to the manager (admin panel → Telegram)", () => {
  it("saves a note and reports delivery status", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/manager-note", headers: ADMIN(), payload: { text: "Call the customer back about the return" } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().ok, true);
    assert.equal(res.json().delivered, false); // DISABLE_NOTIFY → stored only

    const list = await app.inject({ method: "GET", url: "/v1/admin/manager-notes", headers: auth(ADMIN_ID) });
    assert.equal(list.statusCode, 200, list.body);
    const notes = list.json();
    assert.equal(notes.length, 1);
    assert.equal(notes[0].text, "Call the customer back about the return");
    assert.equal(notes[0].delivered, false);
  });

  it("rejects empty text", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/manager-note", headers: ADMIN(), payload: { text: "  " } });
    assert.equal(res.statusCode, 400);
  });

  it("returns 503 when the bot is not configured", async () => {
    const saved = process.env.TG_BOT_TOKEN;
    delete process.env.TG_BOT_TOKEN;
    try {
      const res = await app.inject({ method: "POST", url: "/v1/admin/manager-note", headers: ADMIN(), payload: { text: "no bot" } });
      assert.equal(res.statusCode, 503);
      assert.equal(res.json().error, "telegram_bot_not_configured");
    } finally {
      process.env.TG_BOT_TOKEN = saved;
    }
  });

  it("is admin-only", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/admin/manager-notes", headers: auth(CUSTOMER_B) });
    assert.equal(res.statusCode, 403);
  });
});

describe("support settings (editable from the admin panel)", () => {
  it("returns built-in defaults when nothing is saved", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/support-settings" });
    assert.equal(res.statusCode, 200);
    const settings = res.json();
    assert.match(settings.greeting.ru, /менеджеру/);
    assert.ok(settings.quickQuestions.uz.length >= 3);
  });

  it("admin can override greeting and quick questions per language", async () => {
    const save = await app.inject({
      method: "POST", url: "/v1/admin/support-settings", headers: ADMIN(),
      payload: { greeting: { ru: "Салют! Мы на связи." }, quickQuestions: { ru: ["Q1?", "Q2?"] } },
    });
    assert.equal(save.statusCode, 200, save.body);

    const res = await app.inject({ method: "GET", url: "/v1/support-settings" });
    const settings = res.json();
    assert.equal(settings.greeting.ru, "Салют! Мы на связи.");
    // Untouched languages fall back to the defaults
    assert.match(settings.greeting.uz, /menga|Assalomu/);
    assert.deepEqual(settings.quickQuestions.ru, ["Q1?", "Q2?"]);
    assert.ok(settings.quickQuestions.en.length >= 3);
  });

  it("rejects malformed settings (unknown keys, oversized values)", async () => {
    const unknownKey = await app.inject({
      method: "POST", url: "/v1/admin/support-settings", headers: ADMIN(),
      payload: { greeting: { fr: "Bonjour" } },
    });
    assert.equal(unknownKey.statusCode, 400, unknownKey.body);
    const tooMany = await app.inject({
      method: "POST", url: "/v1/admin/support-settings", headers: ADMIN(),
      payload: { quickQuestions: { ru: Array.from({ length: 9 }, (_, i) => `Q${i}`) } },
    });
    assert.equal(tooMany.statusCode, 400);
    const tooLong = await app.inject({
      method: "POST", url: "/v1/admin/support-settings", headers: ADMIN(),
      payload: { greeting: { ru: "x".repeat(301) } },
    });
    assert.equal(tooLong.statusCode, 400);
    const notAdmin = await app.inject({
      method: "POST", url: "/v1/admin/support-settings", headers: auth(CUSTOMER_B, true),
      payload: { greeting: { ru: "hack" } },
    });
    assert.equal(notAdmin.statusCode, 403);
  });
});

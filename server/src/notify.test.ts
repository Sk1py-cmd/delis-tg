/**
 * End-to-end notification tests: a new order must push a message to the
 * admin's Telegram chat, and a status change must push a localized message
 * to the customer — WITHOUT real network. gramY's outgoing fetch to
 * api.telegram.org is intercepted, so the exact payload the owner receives
 * in the bot is asserted here.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

/* ── Env must be set BEFORE importing the app (modules read env at import) ── */
const TOKEN = "test-bot-token-notify";
const ADMIN_ID = 555000222;
process.env.TG_BOT_TOKEN = TOKEN;
process.env.ADMIN_CHAT_ID = String(ADMIN_ID);
process.env.DELIS_DB_PATH = ":memory:";
process.env.DELIS_AUTOSTART = "0";
process.env.SEED_ON_START = "false";
// Notification tests need notify to be ENABLED — make sure it is not disabled.
delete process.env.DELIS_DISABLE_NOTIFY;

/* ── Intercept grammy API calls (official transformer seam — no network) ── */
type SentMessage = { method: string; payload: any };
const sent: SentMessage[] = [];
let failNextSend = false;

let app: Awaited<typeof import("./index.js")>["app"];
let db: ReturnType<typeof import("./db.js").getDb>;

/* ── helpers (same initData signing as the real Mini App) ── */
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

const authOf = (tgId: number, extra: Record<string, string> = {}) => ({
  Authorization: `Telegram ${makeInitData({ id: tgId, first_name: "Test" })}`,
  ...extra,
});

const orderPayload = (over: Record<string, unknown> = {}) => ({
  items: [{ id: "wax", qty: 2 }],
  recipient: { name: "Notified Client", phone: "+998901234567" },
  delivery: { method: "pickup", zone: "Tashkent", address: "Factory", time: "today" },
  payment: { method: "cash" },
  ...over,
});

/** Poll until cond() is true (notifications are fire-and-forget). */
async function waitFor(cond: () => boolean, timeoutMs = 4000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return cond();
}

before(async () => {
  // Install the grammy transformer BEFORE anything can send a message.
  const { getBotApi } = await import("./bot.js");
  const api = getBotApi();
  assert.ok(api, "bot API must exist when TG_BOT_TOKEN is set");
  (api.config as any).use(async (_prev: any, method: string, payload: any): Promise<any> => {
    if (method === "sendMessage") {
      if (failNextSend) {
        failNextSend = false;
        // Throwing emulates a Telegram/network failure exactly like the real client.
        throw new Error("502 Bad Gateway (emulated)");
      }
      sent.push({ method, payload });
      return { ok: true, result: { message_id: sent.length } };
    }
    return { ok: true, result: true };
  });

  const mod = await import("./index.js");
  app = mod.app;
  mod.ensureDb();
  const { getDb } = await import("./db.js");
  db = getDb();
  const { seedOnStart } = await import("./seed-runner.js");
  seedOnStart(true); // wax + catalog
});

describe("DELIS notifications — order → Telegram", () => {
  it("pushes a new-order message to the admin chat with items, total and buttons", async () => {
    const created = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(7001), "Content-Type": "application/json" },
      payload: orderPayload(),
    });
    assert.equal(created.statusCode, 200, created.body);
    const orderId = created.json().order_id as string;

    const notified = await waitFor(() =>
      !!db.prepare("SELECT admin_notified_at FROM orders WHERE id = ?").get(orderId)?.admin_notified_at);
    assert.ok(notified, "admin_notified_at must be set after a successful sendMessage");

    const adminMsg = sent.find((m) => m.method === "sendMessage" && String(m.payload.chat_id) === String(ADMIN_ID));
    assert.ok(adminMsg, "admin must receive a sendMessage");
    const text = String(adminMsg.payload.text);
    assert.match(text, /Yangi buyurtma DELIS \/ Новый заказ/);
    assert.match(text, new RegExp(`#${orderId}`));
    assert.match(text, /Notified Client/);
    assert.match(text, /256\s?000|256000/); // 2 × 128 000 recomputed server-side
    assert.equal(adminMsg.payload.parse_mode, "HTML");
    assert.ok(adminMsg.payload.reply_markup, "inline keyboard (accept button) expected");
    assert.ok(Number(
      (db.prepare("SELECT admin_notify_attempts FROM orders WHERE id = ?").get(orderId) as any).admin_notify_attempts,
    ) >= 1);
  });

  it("notifies the customer in their language when the admin changes status", async () => {
    const created = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(7002), "Content-Type": "application/json" },
      payload: orderPayload(),
    });
    assert.equal(created.statusCode, 200, created.body);
    const orderId = created.json().order_id as string;
    await waitFor(() => sent.some((m) => m.payload?.chat_id === 7002)); // admin msg to this order chain done

    const updated = await app.inject({
      method: "POST", url: `/v1/admin/orders/${orderId}/status`,
      headers: { ...authOf(ADMIN_ID), "Content-Type": "application/json" },
      payload: { status: "preparing" },
    });
    assert.equal(updated.statusCode, 200, updated.body);

    await waitFor(() => sent.some((m) => m.payload?.chat_id === 7002 &&
      String(m.payload?.text || "").includes(orderId)));
    const customerMsg = sent.find((m) => m.payload?.chat_id === 7002 &&
      String(m.payload?.text || "").includes(orderId));
    assert.ok(customerMsg, "customer must receive a status message");
    const text = String(customerMsg.payload.text);
    assert.match(text, /Buyurtma #.* tayyorlanmoqda|Заказ #.* готовится/);
  });

  it("still notifies the admin for browser (guest) orders — without DM to the guest", async () => {
    const session = await app.inject({ method: "POST", url: "/v1/auth/browser-session" });
    const token = String(session.json().token || "");

    const created = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { "X-Delis-Browser-Session": token, "Content-Type": "application/json" },
      payload: orderPayload(),
    });
    assert.equal(created.statusCode, 200, created.body);
    const orderId = created.json().order_id as string;

    const notified = await waitFor(() =>
      !!db.prepare("SELECT admin_notified_at FROM orders WHERE id = ?").get(orderId)?.admin_notified_at);
    assert.ok(notified, "browser order must reach the admin bot chat");

    const text = String(
      sent.find((m) => m.method === "sendMessage" && String(m.payload.chat_id) === String(ADMIN_ID) &&
        String(m.payload.text).includes(orderId))?.payload.text || "",
    );
    assert.match(text, /Browser \/ Браузер/);
    // No DM is attempted to the negative guest id — nothing should be sent
    // to it after the admin push.
    const sendsBefore = sent.length;
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(sent.length, sendsBefore, "guest DMs are impossible — nothing new should be sent");
  });

  it("keeps the order pending for retry when Telegram fails, and succeeds on retry", async () => {
    failNextSend = true;
    const created = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(7003), "Content-Type": "application/json" },
      payload: orderPayload(),
    });
    assert.equal(created.statusCode, 200, created.body);
    const orderId = created.json().order_id as string;

    await waitFor(() => Number(
      (db.prepare("SELECT admin_notify_attempts FROM orders WHERE id = ?").get(orderId) as any)?.admin_notify_attempts || 0,
    ) >= 1);
    const afterFail = db.prepare("SELECT admin_notified_at, admin_notify_attempts FROM orders WHERE id = ?").get(orderId) as any;
    assert.equal(afterFail.admin_notified_at, null, "failed send must NOT be marked as notified");
    assert.ok(Number(afterFail.admin_notify_attempts) >= 1, "attempt must be recorded for the retry loop");

    const { notifyAdminNewOrder } = await import("./bot.js");
    const retried = await notifyAdminNewOrder(db, orderId);
    assert.equal(retried, true, "manual/looped retry after Telegram recovers must succeed");
    const row = db.prepare("SELECT admin_notified_at FROM orders WHERE id = ?").get(orderId) as any;
    assert.ok(row.admin_notified_at, "successful retry marks the order as notified");
  });
});

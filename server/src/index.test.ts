/**
 * Integration tests for the money-critical API paths.
 * Runs against an in-memory SQLite DB — no listen, no bot, no network.
 *
 * NOTE: requires better-sqlite3 (native). Run with: npm test (in server/).
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";

/* ── Env must be set BEFORE importing the app (modules read env at import) ── */
const TOKEN = "test-bot-token";
const ADMIN_ID = 555000111;
process.env.TG_BOT_TOKEN = TOKEN;
process.env.ADMIN_CHAT_ID = String(ADMIN_ID);
process.env.DELIS_DB_PATH = ":memory:";
process.env.DELIS_AUTOSTART = "0";
// Integration tests assert persisted notification state without calling Telegram.
process.env.DELIS_DISABLE_NOTIFY = "1";
process.env.CLICK_SERVICE_ID = "111";
process.env.CLICK_MERCHANT_ID = "merchant-1";
process.env.CLICK_SECRET = "click-secret";
process.env.PAYME_MERCHANT_ID = "payme-merchant-1";
process.env.PAYME_KEY = "payme-key";
process.env.SEED_ON_START = "false";

let app: Awaited<typeof import("./index.js")>["app"];
let db: ReturnType<typeof import("./db.js").getDb>;

/* ── helpers ── */

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

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

const orderPayload = (over: Record<string, unknown> = {}) => ({
  items: [{ id: "wax", qty: 1, price: 0 }], // lies on purpose — 0 must be ignored
  subtotal: 0,
  discount: 0,
  deliveryFee: 12000,
  total: 999_999_999, // lies on purpose — must be recomputed server-side
  recipient: { name: "Test Client", phone: "+998901234567" },
  delivery: { method: "pickup", zone: "Tashkent", address: "Factory", time: "today" },
  payment: { method: "cash" },
  ...over,
});

before(async () => {
  const mod = await import("./index.js");
  app = mod.app;
  mod.ensureDb();
  const { getDb } = await import("./db.js");
  db = getDb();
  const { seedOnStart } = await import("./seed-runner.js");
  seedOnStart(true); // 8 products + 4 promos
});

describe("DELIS API — money paths", () => {
  it("health works", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().ok, true);
  });

  it("publishes payment readiness without exposing credentials", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/payment-methods" });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json(), { payme: true, click: true, cash: true, stars: true });
    assert.equal(res.headers["cache-control"], "no-store");
    assert.doesNotMatch(res.body, /secret|merchant|key/i);
  });

  it("rejects unauthenticated profile access", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me" });
    assert.equal(res.statusCode, 401);
  });

  it("issues a signed browser session and rejects a tampered token", async () => {
    const issued = await app.inject({ method: "POST", url: "/v1/auth/browser-session" });
    assert.equal(issued.statusCode, 200, issued.body);
    assert.equal(issued.headers["cache-control"], "no-store");
    const token = String(issued.json().token || "");
    assert.ok(token.length > 40);

    const valid = await app.inject({ method: "GET", url: "/v1/me", headers: { "X-Delis-Browser-Session": token } });
    assert.equal(valid.statusCode, 200, valid.body);
    assert.ok(Number(valid.json().id) < 0);

    const tampered = await app.inject({ method: "GET", url: "/v1/me", headers: { "X-Delis-Browser-Session": `${token}x` } });
    assert.equal(tampered.statusCode, 401);
  });

  it("lets a browser session place and retrieve a cash order", async () => {
    const issued = await app.inject({ method: "POST", url: "/v1/auth/browser-session" });
    const token = String(issued.json().token);
    const headers = { "X-Delis-Browser-Session": token, "Content-Type": "application/json" };
    const created = await app.inject({ method: "POST", url: "/v1/orders", headers, payload: orderPayload() });
    assert.equal(created.statusCode, 200, created.body);
    assert.equal(created.json().payment_status, "cod");

    const orders = await app.inject({ method: "GET", url: "/v1/me/orders", headers });
    assert.equal(orders.statusCode, 200, orders.body);
    const browserOrder = orders.json().find((order: any) => order.id === created.json().order_id);
    assert.ok(browserOrder);
    assert.equal(browserOrder.customerSource, "browser");
  });

  it("issues a personal welcome promo to a brand-new Telegram customer", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me", headers: authOf(700001) });
    assert.equal(res.statusCode, 200, res.body);
    const me = res.json();
    assert.equal(me.welcome.issued, true);
    assert.equal(me.welcome.code, "HELLO-700001");
    assert.equal(me.welcome.percent, 5);
    assert.equal(me.welcome.minSpend, 180000);
    assert.equal(me.welcome.maxDiscount, 10000);

    // The same single code is reused on repeat visits (never stacked/spammed).
    const again = await app.inject({ method: "GET", url: "/v1/me", headers: authOf(700001) });
    assert.equal(again.json().welcome.code, "HELLO-700001");

    // The coupon is a real, single-use row bound to this customer.
    const row: any = db.prepare("SELECT code, single_use, value, min_spend, max_discount, active FROM promo_codes WHERE code = ?").get("HELLO-700001");
    assert.ok(row);
    assert.equal(row.single_use, 1);
    assert.equal(row.value, 5);
    assert.equal(row.min_spend, 180000);
    assert.equal(row.max_discount, 10000);
    assert.equal(row.active, 1);
  });

  it("guards channel publishing to admins and reports unconfigured channel", async () => {
    // Non-admin is rejected.
    const denied = await app.inject({
      method: "POST", url: "/v1/admin/channel-post",
      headers: { ...authOf(700010), "Content-Type": "application/json" },
      payload: { title: "News", text: "Body" },
    });
    assert.equal(denied.statusCode, 403, denied.body);

    // Admin, but TELEGRAM_NEWS_CHANNEL is unset → explicit, safe error.
    const res = await app.inject({
      method: "POST", url: "/v1/admin/channel-post",
      headers: { ...authOf(ADMIN_ID), "Content-Type": "application/json" },
      payload: { title: "News", text: "Body" },
    });
    assert.equal(res.statusCode, 400, res.body);
    assert.equal(res.json().error, "channel_not_configured");
  });

  it("does not issue a welcome promo to browser sessions or returning customers", async () => {
    // Browser session → negative id, no personal welcome.
    const issued = await app.inject({ method: "POST", url: "/v1/auth/browser-session" });
    const token = String(issued.json().token);
    const browser = await app.inject({ method: "GET", url: "/v1/me", headers: { "X-Delis-Browser-Session": token } });
    assert.equal(browser.json().welcome.issued, false);

    // Returning customer (has placed an order) → no welcome coupon.
    const tgId = 700002;
    const placed = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(tgId), "Content-Type": "application/json" },
      payload: orderPayload(),
    });
    assert.equal(placed.statusCode, 200, placed.body);
    const afterOrder = await app.inject({ method: "GET", url: "/v1/me", headers: authOf(tgId) });
    assert.equal(afterOrder.json().welcome.issued, false);
  });

  it("keeps Telegram Stars unavailable to browser-only sessions", async () => {
    const issued = await app.inject({ method: "POST", url: "/v1/auth/browser-session" });
    const token = String(issued.json().token);
    const res = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { "X-Delis-Browser-Session": token, "Content-Type": "application/json" },
      payload: orderPayload({ payment: { method: "stars" } }),
    });
    assert.equal(res.statusCode, 400, res.body);
    assert.equal(res.json().error, "telegram_required_for_stars");
  });

  it("allows authenticated API calls from this project's own preview hosts only", async () => {
    // Audit L5: platform wildcards (*.workers.dev / *.github.io …) are gone —
    // only the owner's own worker namespace and Pages host are allowed.
    for (const origin of [
      "https://arena-01a070d4-delis-tg-admin.mirzaaxmedov2001.workers.dev",
      "https://sk1py-cmd.github.io",
    ]) {
      const res = await app.inject({ method: "GET", url: "/health", headers: { origin } });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["access-control-allow-origin"], origin);
    }
    // A stranger's host on the same platforms must NOT be allowed.
    for (const origin of ["https://arena-preview-delis.workers.dev", "https://stranger.github.io"]) {
      const res = await app.inject({ method: "GET", url: "/health", headers: { origin } });
      assert.equal(res.statusCode, 200); // not a CORS enforcement error — just no ACAO header
      assert.equal(res.headers["access-control-allow-origin"], undefined);
    }
  });

  it("lists seeded products", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/products?lang=ru" });
    assert.equal(res.statusCode, 200);
    const products = res.json();
    assert.ok(products.length >= 8);
    assert.ok(products.every((p: any) => p.price > 0));
    // Демо-фото каталога удалены: пустой img = фирменный плейсхолдер в UI,
    // реальные фото загружаются из админ-панели.
    assert.equal(products.find((p: any) => p.id === "cloud")?.img, "");
    assert.equal(products.find((p: any) => p.id === "wheel")?.img, "");
    assert.ok(products.every((p: any) => !String(p.img || "").startsWith("images/prod-")));
  });

  it("demo media migration strips demo photos but keeps admin images", async () => {
    db.prepare("UPDATE products SET img = ? WHERE id = 'cloud'").run("images/prod-floor.jpg");
    db.prepare("UPDATE products SET img = ? WHERE id = 'interior'").run("https://cdn.example/custom-interior.jpg");
    db.prepare("UPDATE products SET img = ? WHERE id = 'kitchen'").run("images/my-own-photo.jpg");
    const { seedOnStart } = await import("./seed-runner.js");
    seedOnStart(true);
    // демо-ссылка вытерта…
    assert.equal((db.prepare("SELECT img FROM products WHERE id = 'cloud'").get() as any).img, "");
    // …а фото админа (https и собственный images/-путь) не тронуты
    assert.equal((db.prepare("SELECT img FROM products WHERE id = 'interior'").get() as any).img, "https://cdn.example/custom-interior.jpg");
    assert.equal((db.prepare("SELECT img FROM products WHERE id = 'kitchen'").get() as any).img, "images/my-own-photo.jpg");
  });

  it("order: server recomputes prices and total from the DB (client lies ignored)", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(1001), "Content-Type": "application/json" },
      payload: orderPayload(),
    });
    assert.equal(res.statusCode, 200, res.body);
    const o = res.json();
    assert.ok(o.order_id.startsWith("DL-"));
    // wax = 128000 in the DB — NOT 0 (client price) and NOT 999999999 (client total)
    assert.equal(o.subtotal, 128000);
    assert.equal(o.total, 128000); // pickup → deliveryFee 0
    assert.equal(o.payment_status, "cod");
  });

  it("order: returns Payme/Click checkout URLs from runtime server config", async () => {
    const payme = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(1098), "Content-Type": "application/json" },
      payload: orderPayload({ payment: { method: "payme" } }),
    });
    assert.equal(payme.statusCode, 200, payme.body);
    const paymeOrder = payme.json();
    assert.match(paymeOrder.payment_url, /^https:\/\/checkout\.payme\.uz\//);
    const encoded = String(paymeOrder.payment_url).split("/").pop()!;
    assert.match(Buffer.from(encoded, "base64").toString("utf8"), new RegExp(`m=payme-merchant-1;ac\\.order_id=${paymeOrder.order_id};a=${paymeOrder.total}00`));

    const click = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(1099), "Content-Type": "application/json" },
      payload: orderPayload({ payment: { method: "click" } }),
    });
    assert.equal(click.statusCode, 200, click.body);
    const clickOrder = click.json();
    const clickUrl = new URL(clickOrder.payment_url);
    assert.equal(clickUrl.origin + clickUrl.pathname, "https://my.click.uz/services/pay");
    assert.equal(clickUrl.searchParams.get("service_id"), "111");
    assert.equal(clickUrl.searchParams.get("merchant_id"), "merchant-1");
    assert.equal(clickUrl.searchParams.get("transaction_param"), clickOrder.order_id);
  });

  it("order: refuses an online method that has no configured gateway", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(1100), "Content-Type": "application/json" },
      payload: orderPayload({ payment: { method: "card_uz" } }),
    });
    assert.equal(res.statusCode, 503, res.body);
    assert.deepEqual(res.json(), { error: "payment_not_configured", method: "card_uz" });
  });

  it("order: wholesale price applies for 6+ units", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(1002), "Content-Type": "application/json" },
      payload: orderPayload({ items: [{ id: "wax", qty: 6, price: 0 }] }),
    });
    assert.equal(res.statusCode, 200);
    // wholesaleUnit(128000, 6) = 112640 → ×6 = 675840
    assert.equal(res.json().subtotal, 112640 * 6);
  });

  it("order: rejects unknown product / unknown promo", async () => {
    const bad = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(1003), "Content-Type": "application/json" },
      payload: orderPayload({ items: [{ id: "ghost", qty: 1 }] }),
    });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error, "unknown_product");

    const promo = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(1003), "Content-Type": "application/json" },
      payload: orderPayload({ promoCode: "DOESNOTEXIST" }),
    });
    assert.equal(promo.statusCode, 400);
    assert.equal(promo.json().error, "invalid_promo");
  });

  it("order: DELIS15 percent discount is computed server-side", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(1004), "Content-Type": "application/json" },
      payload: orderPayload({ promoCode: "DELIS15" }),
    });
    assert.equal(res.statusCode, 200);
    const o = res.json();
    assert.equal(o.discount, Math.floor(128000 * 0.15));
    assert.equal(o.total, 128000 - o.discount);
  });

  it("stock: decremented on order; insufficient stock → 409 and no phantom order", async () => {
    db.prepare("UPDATE products SET stock = 2 WHERE id = 'fl' ").run(); // no-op guard
    db.prepare("UPDATE products SET stock = 2 WHERE id = 'floor'").run();

    const ok = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(1005), "Content-Type": "application/json" },
      payload: orderPayload({ items: [{ id: "floor", qty: 2 }] }),
    });
    assert.equal(ok.statusCode, 200);
    assert.equal((db.prepare("SELECT stock FROM products WHERE id = 'floor'").get() as any).stock, 0);

    const tooMany = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(1005), "Content-Type": "application/json" },
      payload: orderPayload({ items: [{ id: "floor", qty: 1 }] }),
    });
    // floor stock is now 0 → made-to-order → allowed
    assert.equal(tooMany.statusCode, 200);

    db.prepare("UPDATE products SET stock = 1 WHERE id = 'floor'").run();
    const capped = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(1005), "Content-Type": "application/json" },
      payload: orderPayload({ items: [{ id: "floor", qty: 5 }] }),
    });
    assert.equal(capped.statusCode, 400);
    assert.equal(capped.json().error, "insufficient_stock");
  });

  it("admin cancel re-stocks the order items", async () => {
    db.prepare("UPDATE products SET stock = 5 WHERE id = 'wax'").run();
    const create = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(1006), "Content-Type": "application/json" },
      payload: orderPayload({ items: [{ id: "wax", qty: 2 }] }),
    });
    assert.equal((db.prepare("SELECT stock FROM products WHERE id = 'wax'").get() as any).stock, 3);
    const orderId = create.json().order_id;

    const cancel = await app.inject({
      method: "POST", url: `/v1/admin/orders/${orderId}/status`,
      headers: { ...authOf(ADMIN_ID), "Content-Type": "application/json" },
      payload: { status: "canceled" },
    });
    assert.equal(cancel.statusCode, 200);
    assert.equal((db.prepare("SELECT stock FROM products WHERE id = 'wax'").get() as any).stock, 5);

    const paidAfterCancel = await app.inject({
      method: "POST", url: `/v1/admin/orders/${orderId}/payment`,
      headers: { ...authOf(ADMIN_ID), "Content-Type": "application/json" },
      payload: { paymentStatus: "paid" },
    });
    assert.equal(paidAfterCancel.statusCode, 409, paidAfterCancel.body);
    assert.equal(paidAfterCancel.json().error, "order_canceled");
  });

  it("admin status flow is forward-only and delivered fulfillment is idempotent", async () => {
    const owner = 1016;
    const created = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(owner), "Content-Type": "application/json" },
      payload: orderPayload(),
    });
    assert.equal(created.statusCode, 200, created.body);
    const orderId = created.json().order_id;
    const setStatus = (status: string) => app.inject({
      method: "POST", url: `/v1/admin/orders/${orderId}/status`,
      headers: { ...authOf(ADMIN_ID), "Content-Type": "application/json" },
      payload: { status },
    });

    const skipped = await setStatus("shipped");
    assert.equal(skipped.statusCode, 409, skipped.body);
    assert.equal(skipped.json().error, "invalid_status_transition");
    assert.equal((db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId) as any).status, "new");

    assert.equal((await setStatus("preparing")).statusCode, 200);
    assert.equal((await setStatus("shipped")).statusCode, 200);
    assert.equal((await setStatus("delivered")).statusCode, 200);
    const starsAfterDelivery = Number((db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(owner) as any).stars);
    assert.ok(starsAfterDelivery > 0);

    const repeated = await setStatus("delivered");
    assert.equal(repeated.statusCode, 200, repeated.body);
    assert.equal(repeated.json().unchanged, true);
    assert.equal(Number((db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(owner) as any).stars), starsAfterDelivery);

    const backwards = await setStatus("preparing");
    assert.equal(backwards.statusCode, 409, backwards.body);
    assert.equal(backwards.json().error, "invalid_status_transition");
  });

  it("admin payment confirmation cannot be downgraded or award Stars twice", async () => {
    const owner = 1017;
    const created = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(owner), "Content-Type": "application/json" },
      payload: orderPayload({ payment: { method: "payme" } }),
    });
    assert.equal(created.statusCode, 200, created.body);
    const orderId = created.json().order_id;
    const setPayment = (paymentStatus: string) => app.inject({
      method: "POST", url: `/v1/admin/orders/${orderId}/payment`,
      headers: { ...authOf(ADMIN_ID), "Content-Type": "application/json" },
      payload: { paymentStatus },
    });

    const paid = await setPayment("paid");
    assert.equal(paid.statusCode, 200, paid.body);
    const starsAfterPayment = Number((db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(owner) as any).stars);
    assert.ok(starsAfterPayment > 0);

    const downgrade = await setPayment("pending");
    assert.equal(downgrade.statusCode, 409, downgrade.body);
    assert.equal(downgrade.json().error, "invalid_payment_transition");

    const repeated = await setPayment("paid");
    assert.equal(repeated.statusCode, 200, repeated.body);
    assert.equal(repeated.json().unchanged, true);
    assert.equal(Number((db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(owner) as any).stars), starsAfterPayment);
  });

  it("persists Telegram admin-notification retry metadata without network", async () => {
    const previous = process.env.DELIS_DISABLE_NOTIFY;
    process.env.DELIS_DISABLE_NOTIFY = "1";
    try {
      const created = await app.inject({
        method: "POST", url: "/v1/orders",
        headers: { ...authOf(1018), "Content-Type": "application/json" },
        payload: orderPayload(),
      });
      assert.equal(created.statusCode, 200, created.body);
      const orderId = created.json().order_id;
      const { notifyAdminNewOrder } = await import("./bot.js");
      assert.equal(await notifyAdminNewOrder(db, orderId), false);
      const row: any = db.prepare("SELECT admin_notified_at, admin_notify_attempts, stuck_alerted_at FROM orders WHERE id = ?").get(orderId);
      assert.equal(row.admin_notified_at, null);
      assert.equal(Number(row.admin_notify_attempts), 0);
      assert.equal(row.stuck_alerted_at, null);
    } finally {
      if (previous === undefined) delete process.env.DELIS_DISABLE_NOTIFY;
      else process.env.DELIS_DISABLE_NOTIFY = previous;
    }
  });

  it("repeat-order: IDOR blocked — only the owner may repeat", async () => {
    const create = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(1007), "Content-Type": "application/json" },
      payload: orderPayload(),
    });
    const orderId = create.json().order_id;

    const owner = await app.inject({
      method: "POST", url: `/v1/orders/${orderId}/repeat`,
      headers: authOf(1007),
    });
    assert.equal(owner.statusCode, 200);
    assert.equal(owner.json().items[0].price, 128000); // DB price, not 0

    const stranger = await app.inject({
      method: "POST", url: `/v1/orders/${orderId}/repeat`,
      headers: authOf(2007),
    });
    assert.equal(stranger.statusCode, 404);
  });

  it("admin endpoints reject non-admin users", async () => {
    const res = await app.inject({
      method: "GET", url: "/v1/admin/orders", headers: authOf(9999),
    });
    assert.equal(res.statusCode, 403);
  });

  it("daily reward: exactly one claim per day and appears in loyalty history", async () => {
    const first = await app.inject({ method: "POST", url: "/v1/me/daily/claim", headers: authOf(3001) });
    assert.equal(first.statusCode, 200);
    const second = await app.inject({ method: "POST", url: "/v1/me/daily/claim", headers: authOf(3001) });
    assert.equal(second.statusCode, 409);

    const card = await app.inject({ method: "GET", url: "/v1/me/loyalty?lang=ru", headers: authOf(3001) });
    assert.equal(card.statusCode, 200);
    const body = card.json();
    assert.equal(body.userId, 3001);
    assert.equal(body.stars, first.json().amount);
    assert.equal(body.totalEarned, first.json().amount);
    assert.equal(body.totalSpent, 0);
    assert.equal(body.history[0].amount, first.json().amount);
    assert.equal(body.history[0].description, "Ежедневный бонус");
  });

  it("Stars invoice: amount comes from the DB order, client amountUZS ignored", async () => {
    const create = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(4001), "Content-Type": "application/json" },
      payload: orderPayload({ payment: { method: "stars" } }),
    });
    const orderId = create.json().order_id;

    // Request with amountUZS=1 — the endpoint must still use the order total.
    // The call to Telegram will fail in the sandbox (no network/fake token) → 502,
    // which proves we got PAST validation (not 400/404).
    const res = await app.inject({
      method: "POST", url: "/v1/payments/stars",
      headers: { ...authOf(4001), "Content-Type": "application/json" },
      payload: { orderId, amountUZS: 1 },
    });
    assert.equal(res.statusCode, 502);

    // Someone else's order → 404
    const foreign = await app.inject({
      method: "POST", url: "/v1/payments/stars",
      headers: { ...authOf(4002), "Content-Type": "application/json" },
      payload: { orderId, amountUZS: 1 },
    });
    assert.equal(foreign.statusCode, 404);
  });

  it("Click webhook: signature verified; prepare/complete marks paid; cashback awarded once", async () => {
    const create = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(5001), "Content-Type": "application/json" },
      payload: orderPayload({ payment: { method: "click" } }),
    });
    const order = create.json();
    const amount = order.total;
    const signTime = "2026-08-07 12:00:00";
    const transId = "777";

    // bad signature → -1
    const badSign = await app.inject({
      method: "POST", url: "/v1/webhooks/click",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      payload: `click_trans_id=${transId}&service_id=111&merchant_trans_id=${order.order_id}&amount=${amount}&action=0&sign_time=${encodeURIComponent(signTime)}&sign_string=deadbeef`,
    });
    assert.equal(badSign.json().error, -1);

    // prepare with correct sign
    const signPrepare = md5(`${transId}111click-secret${order.order_id}${amount}0${signTime}`);
    const prepare = await app.inject({
      method: "POST", url: "/v1/webhooks/click",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      payload: `click_trans_id=${transId}&service_id=111&merchant_trans_id=${order.order_id}&amount=${amount}&action=0&sign_time=${encodeURIComponent(signTime)}&sign_string=${signPrepare}`,
    });
    assert.equal(prepare.json().error, 0, prepare.body);
    const prepareId = prepare.json().merchant_prepare_id;

    // complete with correct sign → paid
    const signComplete = md5(`${transId}111click-secret${order.order_id}${prepareId}${amount}1${signTime}`);
    const complete = await app.inject({
      method: "POST", url: "/v1/webhooks/click",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      payload: `click_trans_id=${transId}&service_id=111&merchant_trans_id=${order.order_id}&merchant_prepare_id=${prepareId}&amount=${amount}&action=1&sign_time=${encodeURIComponent(signTime)}&sign_string=${signComplete}`,
    });
    assert.equal(complete.json().error, 0, complete.body);
    assert.equal((db.prepare("SELECT payment_status FROM orders WHERE id = ?").get(order.order_id) as any).payment_status, "paid");

    // Cashback awarded: 3% of (total − fee) / 100. total=128000 (pickup)
    const expected = Math.round((amount * 0.03) / 100);
    assert.equal((db.prepare("SELECT stars FROM users WHERE tg_id = 5001").get() as any).stars, expected);

    // Re-running complete must NOT award twice
    await app.inject({
      method: "POST", url: "/v1/webhooks/click",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      payload: `click_trans_id=${transId}&service_id=111&merchant_trans_id=${order.order_id}&merchant_prepare_id=${prepareId}&amount=${amount}&action=1&sign_time=${encodeURIComponent(signTime)}&sign_string=${signComplete}`,
    });
    assert.equal((db.prepare("SELECT stars FROM users WHERE tg_id = 5001").get() as any).stars, expected);
  });

  it("Click webhook: wrong amount is rejected at prepare", async () => {
    const create = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(5002), "Content-Type": "application/json" },
      payload: orderPayload({ payment: { method: "click" } }),
    });
    const order = create.json();
    const wrongAmount = 1;
    const signTime = "2026-08-07 12:00:00";
    const sign = md5(`888111click-secret${order.order_id}${wrongAmount}0${signTime}`);
    const res = await app.inject({
      method: "POST", url: "/v1/webhooks/click",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      payload: `click_trans_id=888&service_id=111&merchant_trans_id=${order.order_id}&amount=${wrongAmount}&action=0&sign_time=${encodeURIComponent(signTime)}&sign_string=${sign}`,
    });
    assert.equal(res.json().error, -2);
  });

  it("Payme webhook: auth + full JSON-RPC flow marks paid", async () => {
    const create = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(6001), "Content-Type": "application/json" },
      payload: orderPayload({ payment: { method: "payme" } }),
    });
    const order = create.json();
    const amountTiyin = order.total * 100;
    const auth = "Basic " + Buffer.from(`Paycom:payme-key`).toString("base64");
    const rpc = (method: string, params: Record<string, unknown>, headers: Record<string, string> = { Authorization: auth }) =>
      app.inject({
        method: "POST", url: "/v1/webhooks/payme",
        headers: { ...headers, "Content-Type": "application/json" },
        payload: { jsonrpc: "2.0", id: 1, method, params },
      });

    // no auth → -32504
    const noAuth = await rpc("CheckPerformTransaction", { amount: amountTiyin, account: { order_id: order.order_id } }, {});
    assert.equal(noAuth.json().error.code, -32504);

    // wrong amount → -31001
    const wrongAmount = await rpc("CheckPerformTransaction", { amount: 100, account: { order_id: order.order_id } });
    assert.equal(wrongAmount.json().error.code, -31001);

    // check allow
    const check = await rpc("CheckPerformTransaction", { amount: amountTiyin, account: { order_id: order.order_id } });
    assert.equal(check.json().result.allow, true, check.body);

    // create → perform
    const created = await rpc("CreateTransaction", { id: "txn-1", time: Date.now(), amount: amountTiyin, account: { order_id: order.order_id } });
    assert.equal(created.json().result.state, 1, created.body);

    const performed = await rpc("PerformTransaction", { id: "txn-1" });
    assert.equal(performed.json().result.state, 2, performed.body);
    assert.equal((db.prepare("SELECT payment_status FROM orders WHERE id = ?").get(order.order_id) as any).payment_status, "paid");

    // cashback awarded exactly once
    const expected = Math.round((order.total * 0.03) / 100);
    assert.equal((db.prepare("SELECT stars FROM users WHERE tg_id = 6001").get() as any).stars, expected);

    // perform again → idempotent, no double award
    const again = await rpc("PerformTransaction", { id: "txn-1" });
    assert.equal(again.json().result.state, 2);
    assert.equal((db.prepare("SELECT stars FROM users WHERE tg_id = 6001").get() as any).stars, expected);
  });

  it("admin promo CRUD: create → validate → toggle off → delete", async () => {
    const upsert = await app.inject({
      method: "POST", url: "/v1/admin/promos",
      headers: { ...authOf(ADMIN_ID), "Content-Type": "application/json" },
      payload: { code: "TEST25", type: "percent", value: 25, minSpend: 50000, active: true, titles: { ru: "Тест −25%" } },
    });
    assert.equal(upsert.statusCode, 200, upsert.body);

    const publicList = await app.inject({ method: "GET", url: "/v1/promos" });
    assert.ok(publicList.json().some((p: any) => p.code === "TEST25"));

    const valid = await app.inject({ method: "GET", url: "/v1/promo/validate?code=TEST25" });
    assert.equal(valid.json().valid, true);
    assert.equal(valid.json().minSpend, 50000);

    // toggle off via upsert → disappears from public list
    await app.inject({
      method: "POST", url: "/v1/admin/promos",
      headers: { ...authOf(ADMIN_ID), "Content-Type": "application/json" },
      payload: { code: "TEST25", type: "percent", value: 25, minSpend: 50000, active: false },
    });
    const offList = await app.inject({ method: "GET", url: "/v1/promos" });
    assert.ok(!offList.json().some((p: any) => p.code === "TEST25"));
    const invalid = await app.inject({ method: "GET", url: "/v1/promo/validate?code=TEST25" });
    assert.equal(invalid.statusCode, 404);

    const del = await app.inject({ method: "DELETE", url: "/v1/admin/promos/TEST25", headers: authOf(ADMIN_ID) });
    assert.equal(del.statusCode, 200);
  });

  it("reviews: require a delivered purchase, award Stars once, and affect product rating", async () => {
    const purchase = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(7001), "Content-Type": "application/json" },
      payload: orderPayload(),
    });
    const orderId = purchase.json().order_id;
    for (const status of ["preparing", "shipped", "delivered"]) {
      const moved = await app.inject({
        method: "POST", url: `/v1/admin/orders/${orderId}/status`,
        headers: { ...authOf(ADMIN_ID), "Content-Type": "application/json" },
        payload: { status },
      });
      assert.equal(moved.statusCode, 200, moved.body);
    }

    const bad = await app.inject({
      method: "POST", url: "/v1/products/wax/reviews",
      headers: { ...authOf(7001), "Content-Type": "application/json" },
      payload: { rating: 9, comment: "bad" },
    });
    assert.equal(bad.statusCode, 400);

    const ok = await app.inject({
      method: "POST", url: "/v1/products/wax/reviews",
      headers: { ...authOf(7001), "Content-Type": "application/json" },
      payload: { rating: 4, comment: "Nice" },
    });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().starsAwarded, 50);
    assert.ok(ok.json().stars >= 50);

    const dup = await app.inject({
      method: "POST", url: "/v1/products/wax/reviews",
      headers: { ...authOf(7001), "Content-Type": "application/json" },
      payload: { rating: 5, comment: "again" },
    });
    assert.equal(dup.statusCode, 409);
  });
});

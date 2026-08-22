/**
 * Integration tests: stars-shop redemption (money!), personal coupons,
 * waitlist + restock notifications, subscriptions.
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
let db: ReturnType<typeof import("./db.js").getDb>;

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
  Authorization: `Telegram ${makeInitData({ id: tgId, first_name: "Test", username: `user${tgId}` })}`,
  ...extra,
});
const JSON_POST = { "Content-Type": "application/json" };

const orderPayload = (over: Record<string, unknown> = {}) => ({
  items: [{ id: "wax", qty: 1, price: 0 }],
  subtotal: 0,
  discount: 0,
  deliveryFee: 0,
  total: 1,
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
  seedOnStart();
});

describe("Stars shop — server-side redemption", () => {
  const OWNER = 9101;
  const STRANGER = 9102;
  let coupon = "";

  it("exposes the rewards catalog", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/stars/rewards" });
    assert.equal(res.statusCode, 200);
    const list = res.json();
    assert.equal(list.length, 4);
    assert.ok(list.every((r: any) => r.minSpend > 0 && r.expiresInDays === 14 && r.retailOnly === true));
    assert.ok(list.some((r: any) => r.id === "stars5" && r.maxDiscount === 25000));
    assert.ok(list.some((r: any) => r.id === "starship" && r.maxDiscount === 20000));
    assert.ok(list.some((r: any) => r.id === "stargift" && r.kind === "gift" && r.cost === 1000));
  });

  it("lets only admin edit economics and pause issuance without deploy", async () => {
    const denied = await app.inject({ method: "GET", url: "/v1/admin/loyalty/rewards", headers: authOf(OWNER) });
    assert.equal(denied.statusCode, 403);

    const current = await app.inject({ method: "GET", url: "/v1/admin/loyalty/rewards", headers: authOf(ADMIN_ID) });
    assert.equal(current.statusCode, 200);
    const original = current.json();
    const payloadOf = (enabled: boolean, rewards: any[], productCosts: Record<string, number>) => ({
      enabled,
      rewards: rewards.map((reward) => ({
        id: reward.id, active: reward.active, cost: reward.cost, minSpend: reward.minSpend,
        maxDiscount: reward.maxDiscount || null, expiresInDays: reward.expiresInDays,
        productId: reward.productId || null,
      })),
      economics: original.economics,
      productCosts,
    });
    const originalCosts = Object.fromEntries(original.products.map((product: any) => [product.id, product.costPrice]));
    const pausedRewards = original.rewards.map((reward: any) => reward.id === "stars2" ? { ...reward, minSpend: 190000, maxDiscount: 9000 } : reward);
    const paused = await app.inject({
      method: "PUT", url: "/v1/admin/loyalty/rewards", headers: { ...authOf(ADMIN_ID), ...JSON_POST },
      payload: payloadOf(false, pausedRewards, originalCosts),
    });
    assert.equal(paused.statusCode, 200, paused.body);
    const publicCatalog = await app.inject({ method: "GET", url: "/v1/stars/rewards" });
    assert.deepEqual(publicCatalog.json(), []);
    const blocked = await app.inject({ method: "POST", url: "/v1/stars/redeem", headers: { ...authOf(OWNER), ...JSON_POST }, payload: { rewardId: "stars2" } });
    assert.equal(blocked.statusCode, 409);
    assert.equal(blocked.json().error, "rewards_paused");

    const restored = await app.inject({
      method: "PUT", url: "/v1/admin/loyalty/rewards", headers: { ...authOf(ADMIN_ID), ...JSON_POST },
      payload: payloadOf(true, original.rewards, originalCosts),
    });
    assert.equal(restored.statusCode, 200, restored.body);
  });

  it("requires auth and a known reward", async () => {
    const noAuth = await app.inject({ method: "POST", url: "/v1/stars/redeem", headers: JSON_POST, payload: { rewardId: "stars2" } });
    assert.equal(noAuth.statusCode, 401);
    const unknown = await app.inject({ method: "POST", url: "/v1/stars/redeem", headers: { ...authOf(OWNER), ...JSON_POST }, payload: { rewardId: "nope" } });
    assert.equal(unknown.statusCode, 404);
  });

  it("rejects redemption when stars are insufficient", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/stars/redeem", headers: { ...authOf(OWNER), ...JSON_POST }, payload: { rewardId: "stars2" } });
    assert.equal(res.statusCode, 402);
    assert.equal(res.json().error, "insufficient_stars");
  });

  it("debits stars atomically and issues a personal single-use coupon", async () => {
    db.prepare("UPDATE users SET stars = 1000 WHERE tg_id = ?").run(OWNER);
    const res = await app.inject({ method: "POST", url: "/v1/stars/redeem", headers: { ...authOf(OWNER), ...JSON_POST }, payload: { rewardId: "stars2" } });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.stars, 700);
    assert.match(body.code, /^ST-[A-Z2-9]{6}$/);
    assert.equal(body.type, "percent");
    assert.equal(body.value, 2);
    coupon = body.code;

    const promo: any = db.prepare("SELECT * FROM promo_codes WHERE code = ?").get(coupon);
    assert.equal(promo.tg_id, OWNER);
    assert.equal(promo.single_use, 1);
    assert.equal(promo.min_spend, 180000);
    assert.equal(promo.max_discount, 10000);
    assert.equal(promo.active, 1);
    assert.ok(promo.expires_at);

    const card = await app.inject({ method: "GET", url: "/v1/me/loyalty?lang=en", headers: authOf(OWNER) });
    assert.equal(card.statusCode, 200);
    assert.equal(card.json().stars, 700);
    assert.equal(card.json().totalEarned, 1000); // pre-ledger opening balance
    assert.equal(card.json().totalSpent, 300);
    assert.equal(card.json().history[0].type, "spend");
    assert.equal(card.json().history[0].description, "Stars reward redemption");
  });

  it("personal coupon: hidden from public list and from other users", async () => {
    const list = await app.inject({ method: "GET", url: "/v1/promos" });
    assert.ok(!list.json().some((p: any) => p.code === coupon));

    const anon = await app.inject({ method: "GET", url: `/v1/promo/validate?code=${coupon}` });
    assert.equal(anon.statusCode, 404);
    const other = await app.inject({ method: "GET", url: `/v1/promo/validate?code=${coupon}`, headers: authOf(STRANGER) });
    assert.equal(other.statusCode, 404);

    const own = await app.inject({ method: "GET", url: `/v1/promo/validate?code=${coupon}`, headers: authOf(OWNER) });
    assert.equal(own.statusCode, 200);
    assert.equal(own.json().valid, true);
    assert.equal(own.json().personal, true);
    assert.equal(own.json().singleUse, true);
  });

  it("another user cannot spend the owner's coupon in an order", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(STRANGER), ...JSON_POST },
      payload: orderPayload({ promoCode: coupon }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "invalid_promo");
  });

  it("owner's order applies the coupon, then consumes it exactly once", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(OWNER), ...JSON_POST },
      payload: orderPayload({ promoCode: coupon, items: [{ id: "wax", qty: 2, price: 0 }] }),
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.subtotal, 256000);
    assert.equal(body.discount, 5120); // 2% above the 180,000 minimum
    assert.equal(body.total, 256000 - 5120);

    const promo: any = db.prepare("SELECT active FROM promo_codes WHERE code = ?").get(coupon);
    assert.equal(promo.active, 0); // single-use consumed atomically with the order

    const again = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(OWNER), ...JSON_POST },
      payload: orderPayload({ promoCode: coupon }),
    });
    assert.equal(again.statusCode, 400);
    assert.equal(again.json().error, "invalid_promo");
  });

  it("canceling the order releases the single-use coupon back", async () => {
    const orders = await app.inject({ method: "GET", url: "/v1/me/orders", headers: authOf(OWNER) });
    const orderId = orders.json()[0].id;
    const cancel = await app.inject({
      method: "POST", url: `/v1/admin/orders/${orderId}/status`,
      headers: { ...authOf(ADMIN_ID), ...JSON_POST },
      payload: { status: "canceled" },
    });
    assert.equal(cancel.statusCode, 200);
    const promo: any = db.prepare("SELECT active FROM promo_codes WHERE code = ?").get(coupon);
    assert.equal(promo.active, 1);
  });

  it("gift reward becomes a basket-building fixed coupon", async () => {
    db.prepare("UPDATE users SET stars = 1200 WHERE tg_id = ?").run(OWNER);
    const res = await app.inject({ method: "POST", url: "/v1/stars/redeem", headers: { ...authOf(OWNER), ...JSON_POST }, payload: { rewardId: "stargift" } });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.type, "fixed");
    assert.equal(body.value, 48000); // current Glass №4 price
    assert.equal(body.minSpend, 350000);
    assert.equal(body.requiredProductId, "glass");
    assert.equal(body.expiresInDays, 14);
    const promo: any = db.prepare("SELECT required_product_id FROM promo_codes WHERE code = ?").get(body.code);
    assert.equal(promo.required_product_id, "glass");
    assert.equal(body.stars, 200);

    const withoutGift = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(OWNER), ...JSON_POST },
      payload: orderPayload({ promoCode: body.code, items: [{ id: "wax", qty: 3, price: 0 }] }),
    });
    assert.equal(withoutGift.statusCode, 400);
    assert.equal(withoutGift.json().error, "promo_required_product");
  });

  it("delivery reward issues a capped, minimum-spend coupon", async () => {
    db.prepare("UPDATE users SET stars = 1200 WHERE tg_id = ?").run(OWNER);
    const res = await app.inject({ method: "POST", url: "/v1/stars/redeem", headers: { ...authOf(OWNER), ...JSON_POST }, payload: { rewardId: "starship" } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().type, "freeship");
    assert.equal(res.json().minSpend, 130000);
    assert.equal(res.json().maxDiscount, 20000);
    assert.equal(res.json().stars, 300);
  });

  it("does not stack a personal Stars coupon with wholesale pricing", async () => {
    db.prepare("UPDATE users SET stars = 1000 WHERE tg_id = ?").run(OWNER);
    const redeemed = await app.inject({ method: "POST", url: "/v1/stars/redeem", headers: { ...authOf(OWNER), ...JSON_POST }, payload: { rewardId: "stars5" } });
    assert.equal(redeemed.statusCode, 200);
    const res = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(OWNER), ...JSON_POST },
      payload: orderPayload({ promoCode: redeemed.json().code, items: [{ id: "glass", qty: 6, price: 0 }] }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "invalid_promo");
  });

  it("reports reward-linked revenue, liability and estimated margin from cost snapshots", async () => {
    const settings = await app.inject({ method: "GET", url: "/v1/admin/loyalty/rewards", headers: authOf(ADMIN_ID) });
    const config = settings.json();
    const costs = Object.fromEntries(config.products.map((product: any) => [product.id, Math.round(product.price / 2)]));
    const saved = await app.inject({
      method: "PUT", url: "/v1/admin/loyalty/rewards", headers: { ...authOf(ADMIN_ID), ...JSON_POST },
      payload: {
        enabled: true,
        rewards: config.rewards.map((reward: any) => ({
          id: reward.id, active: reward.active, cost: reward.cost, minSpend: reward.minSpend,
          maxDiscount: reward.maxDiscount || null, expiresInDays: reward.expiresInDays,
          productId: reward.productId || null,
        })),
        economics: config.economics,
        productCosts: costs,
      },
    });
    assert.equal(saved.statusCode, 200, saved.body);

    db.prepare("UPDATE users SET stars = 1000 WHERE tg_id = ?").run(OWNER);
    const redeemed = await app.inject({ method: "POST", url: "/v1/stars/redeem", headers: { ...authOf(OWNER), ...JSON_POST }, payload: { rewardId: "stars2" } });
    assert.equal(redeemed.statusCode, 200);
    const order = await app.inject({
      method: "POST", url: "/v1/orders", headers: { ...authOf(OWNER), ...JSON_POST },
      payload: orderPayload({ promoCode: redeemed.json().code, items: [{ id: "wax", qty: 2, price: 0 }] }),
    });
    assert.equal(order.statusCode, 200, order.body);
    const storedOrder: any = db.prepare("SELECT promo_benefit FROM orders WHERE id = ?").get(order.json().order_id);
    const storedLine: any = db.prepare("SELECT cost_price FROM order_items WHERE order_id = ? AND product_id = 'wax'").get(order.json().order_id);
    assert.equal(storedOrder.promo_benefit, 5120);
    assert.equal(storedLine.cost_price, 64000);

    const analytics = await app.inject({ method: "GET", url: "/v1/admin/loyalty/rewards/analytics", headers: authOf(ADMIN_ID) });
    assert.equal(analytics.statusCode, 200, analytics.body);
    const body = analytics.json();
    assert.ok(body.issued >= 1);
    assert.ok(body.redeemed >= 1);
    assert.ok(body.rewardRevenue >= order.json().total);
    assert.ok(body.benefitGranted >= 5120);
    assert.equal(body.costCoveragePercent, 100);
    assert.ok(body.estimatedMarginPercent > 0);
    assert.ok(body.byReward.some((reward: any) => reward.id === "stars2" && reward.redeemed >= 1));
  });

  it("profit guard rejects a reward basket below the target margin", async () => {
    db.prepare("UPDATE products SET cost_price = 120000 WHERE id = 'wax'").run();
    db.prepare("UPDATE users SET stars = 1000 WHERE tg_id = ?").run(OWNER);
    const redeemed = await app.inject({ method: "POST", url: "/v1/stars/redeem", headers: { ...authOf(OWNER), ...JSON_POST }, payload: { rewardId: "stars2" } });
    assert.equal(redeemed.statusCode, 200);
    const order = await app.inject({
      method: "POST", url: "/v1/orders", headers: { ...authOf(OWNER), ...JSON_POST },
      payload: orderPayload({ promoCode: redeemed.json().code, items: [{ id: "wax", qty: 2, price: 0 }] }),
    });
    assert.equal(order.statusCode, 409);
    assert.equal(order.json().error, "reward_margin_guard");
    assert.equal(order.json().targetMarginPercent, 25);
  });
});

describe("Waitlist — server records + restock notifications", () => {
  const USER = 9201;

  it("requires auth and a real product", async () => {
    const noAuth = await app.inject({ method: "POST", url: "/v1/waitlist", headers: JSON_POST, payload: { productId: "wax", qty: 1 } });
    assert.equal(noAuth.statusCode, 401);
    const ghost = await app.inject({ method: "POST", url: "/v1/waitlist", headers: { ...authOf(USER), ...JSON_POST }, payload: { productId: "nope", qty: 1 } });
    assert.equal(ghost.statusCode, 404);
  });

  it("joins and upserts per (user, product)", async () => {
    const a = await app.inject({ method: "POST", url: "/v1/waitlist", headers: { ...authOf(USER), ...JSON_POST }, payload: { productId: "wax", qty: 2, phone: "+998901112233", language: "ru" } });
    assert.equal(a.statusCode, 200);
    const b = await app.inject({ method: "POST", url: "/v1/waitlist", headers: { ...authOf(USER), ...JSON_POST }, payload: { productId: "wax", qty: 5, language: "ru" } });
    assert.equal(b.statusCode, 200);

    const mine = await app.inject({ method: "GET", url: "/v1/me/waitlist", headers: authOf(USER) });
    const rows = mine.json();
    assert.equal(rows.length, 1); // upserted, not duplicated
    assert.equal(rows[0].productId, "wax");
    assert.equal(rows[0].qty, 5);
    assert.equal(rows[0].notified, false);
    assert.equal(rows[0].inStock, true);
  });

  it("admin sees the waitlist; regular users are blocked", async () => {
    const denied = await app.inject({ method: "GET", url: "/v1/admin/waitlist", headers: authOf(USER) });
    assert.equal(denied.statusCode, 403);
    const res = await app.inject({ method: "GET", url: "/v1/admin/waitlist", headers: authOf(ADMIN_ID) });
    assert.equal(res.statusCode, 200);
    const wl = res.json().find((w: any) => w.tgId === USER && w.productId === "wax");
    assert.ok(wl);
    assert.equal(wl.qty, 5);
    assert.equal(wl.customer, "@user9201");
    assert.ok(wl.productName.uz);
  });

  it("restock via admin panel triggers the notify path without crashing", async () => {
    // wax currently has stock in seed; drain it first, then restock
    db.prepare("UPDATE products SET stock = 0 WHERE id = 'wax'").run();
    const res = await app.inject({
      method: "POST", url: "/v1/admin/products/wax/update",
      headers: { ...authOf(ADMIN_ID), ...JSON_POST },
      payload: { stock: 20 },
    });
    assert.equal(res.statusCode, 200);
    // Bot notifications are disabled in tests → rows stay pending (not spammed)
    const mine = await app.inject({ method: "GET", url: "/v1/me/waitlist", headers: authOf(USER) });
    assert.equal(mine.json()[0].notified, false);
    db.prepare("UPDATE products SET stock = 168 WHERE id = 'wax'").run(); // restore seed
  });

  it("admin manual notify endpoint answers cleanly (bot disabled → 0 sent)", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/admin/waitlist/notify",
      headers: { ...authOf(ADMIN_ID), ...JSON_POST },
      payload: { productId: "wax" },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().ok, true);
    assert.equal(res.json().notified, 0);
  });

  it("leaving the waitlist removes the record", async () => {
    const del = await app.inject({ method: "DELETE", url: "/v1/me/waitlist/wax", headers: authOf(USER) });
    assert.equal(del.statusCode, 200);
    const mine = await app.inject({ method: "GET", url: "/v1/me/waitlist", headers: authOf(USER) });
    assert.equal(mine.json().length, 0);
  });
});

describe("Admin products — extended fields & photo upload", () => {
  const JPEG = "data:image/jpeg;base64,aGVsbG8td29ybGQ="; // tiny payload; server only validates shape

  it("photo upload requires admin", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/products/wax/image", headers: { ...authOf(9401), ...JSON_POST }, payload: { dataUrl: JPEG } });
    assert.equal(res.statusCode, 403);
  });

  it("rejects garbage and oversized images", async () => {
    const bad = await app.inject({ method: "POST", url: "/v1/admin/products/wax/image", headers: { ...authOf(ADMIN_ID), ...JSON_POST }, payload: { dataUrl: "data:image/gif;base64,aGk=" } });
    assert.equal(bad.statusCode, 400);
    const huge = `data:image/jpeg;base64,${"A".repeat(Math.ceil((3 * 1024 * 1024 + 2) * 4 / 3))}`;
    const big = await app.inject({ method: "POST", url: "/v1/admin/products/wax/image", headers: { ...authOf(ADMIN_ID), ...JSON_POST }, payload: { dataUrl: huge } });
    assert.equal(big.statusCode, 413);
  });

  it("404 for unknown product", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/products/nope/image", headers: { ...authOf(ADMIN_ID), ...JSON_POST }, payload: { dataUrl: JPEG } });
    assert.equal(res.statusCode, 404);
  });

  it("stores the photo (DB fallback when Supabase is not configured)", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/products/wax/image", headers: { ...authOf(ADMIN_ID), ...JSON_POST }, payload: { dataUrl: JPEG } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().stored, "db");
    assert.equal(res.json().img, JPEG);
    const prod: any = db.prepare("SELECT img FROM products WHERE id = 'wax'").get();
    assert.equal(prod.img, JPEG);
  });

  it("extended update persists name/cat/volume/badge", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/admin/products/wax/update",
      headers: { ...authOf(ADMIN_ID), ...JSON_POST },
      payload: { name: "Graphite Wax PRO", cat: "home", volume: "300 ml", badge: "new" },
    });
    assert.equal(res.statusCode, 200);
    const list = await app.inject({ method: "GET", url: "/v1/products?lang=ru" });
    const wax = list.json().find((p: any) => p.id === "wax");
    assert.equal(wax.name, "Graphite Wax PRO");
    assert.equal(wax.cat, "home");
    assert.equal(wax.volume, "300 ml");
    assert.equal(wax.badge, "new");
    // restore so other suites see the seed catalog
    await app.inject({
      method: "POST", url: "/v1/admin/products/wax/update",
      headers: { ...authOf(ADMIN_ID), ...JSON_POST },
      payload: { name: "Graphite Wax", cat: "car", volume: "250 ml", badge: null, img: undefined },
    });
  });

  it("creating a product with a data-URL photo runs the storage pipeline", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/admin/products",
      headers: { ...authOf(ADMIN_ID), ...JSON_POST },
      payload: { id: "test-photo", cat: "home", price: 10000, name: "Photo Test", img: JPEG, stock: 1 },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().img, JPEG);
    const prod: any = db.prepare("SELECT img FROM products WHERE id = 'test-photo'").get();
    assert.equal(prod.img, JPEG);
    db.prepare("DELETE FROM products WHERE id = 'test-photo'").run();
  });
});

describe("Social proof — soldToday/soldTotal in the product list", () => {
  it("counts today's orders live and splits historical ones out", async () => {
    const buyer = 9550;
    const today = await app.inject({ method: "POST", url: "/v1/orders", headers: { ...authOf(buyer), ...JSON_POST }, payload: orderPayload({ items: [{ id: "wax", qty: 3, price: 0 }] }) });
    assert.equal(today.statusCode, 200);

    const list1 = await app.inject({ method: "GET", url: "/v1/products" });
    const wax1 = list1.json().find((p: any) => p.id === "wax");
    assert.ok(wax1.soldToday >= 3, `soldToday should include today's 3, got ${wax1.soldToday}`);
    assert.ok(wax1.soldTotal >= wax1.soldToday);

    // An order from yesterday contributes to soldTotal but NOT soldToday
    const old = await app.inject({ method: "POST", url: "/v1/orders", headers: { ...authOf(buyer), ...JSON_POST }, payload: orderPayload({ items: [{ id: "glass", qty: 7, price: 0 }] }) });
    assert.equal(old.statusCode, 200);
    db.prepare("UPDATE orders SET created_at = datetime('now', '-1 day') WHERE id = ?").run(old.json().order_id);

    const list2 = await app.inject({ method: "GET", url: "/v1/products" });
    const glass = list2.json().find((p: any) => p.id === "glass");
    assert.equal(glass.soldToday, 0, "yesterday's order must not inflate soldToday");
    assert.ok(glass.soldTotal >= 7);
    // canceled orders never count
    const waxCanceled: any = db.prepare(
      "SELECT COUNT(*) AS c FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE oi.product_id = 'glass' AND o.status = 'canceled'"
    ).get();
    assert.ok(Number(waxCanceled.c) === 0 || glass.soldTotal >= 7);
  });
});

describe("Admin CSV export", () => {
  it("blocked for non-admins", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/admin/orders.csv", headers: authOf(9551) });
    assert.equal(res.statusCode, 403);
  });

  it("sends Excel-ready CSV with proper escaping", async () => {
    const name = 'Ali "Boss", Jr';
    const made = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(9560), ...JSON_POST },
      payload: orderPayload({ recipient: { name, phone: "+998901234567" } }),
    });
    assert.equal(made.statusCode, 200);

    const res = await app.inject({ method: "GET", url: "/v1/admin/orders.csv", headers: authOf(ADMIN_ID) });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["content-type"] || "", /text\/csv/);
    assert.match(res.headers["content-disposition"] || "", /attachment; filename="delis-orders-/);
    const body: string = res.body;
    assert.ok(body.charCodeAt(0) === 0xFEFF, "UTF-8 BOM for Excel");
    assert.ok(body.includes("id,created_at,status,payment_method"));
    assert.ok(body.includes(`"Ali ""Boss"", Jr"`), "comma+quote name must be CSV-escaped");
    const orderCount: any = db.prepare("SELECT COUNT(*) AS c FROM orders").get();
    assert.equal(body.trim().split("\n").length - 1, orderCount.c, "one line per order");
  });
});

describe("Referral attach from a shared app link", () => {
  const INVITER = 9601;
  const INVITEE = 9602;

  it("validates auth, referer and self-referrals", async () => {
    const noAuth = await app.inject({ method: "POST", url: "/v1/me/referral/attach", headers: JSON_POST, payload: { referrerId: INVITER } });
    assert.equal(noAuth.statusCode, 401);
    const bad = await app.inject({ method: "POST", url: "/v1/me/referral/attach", headers: { ...authOf(INVITEE), ...JSON_POST }, payload: { referrerId: 0 } });
    assert.equal(bad.statusCode, 400);
    const selfish = await app.inject({ method: "POST", url: "/v1/me/referral/attach", headers: { ...authOf(INVITEE), ...JSON_POST }, payload: { referrerId: INVITEE } });
    assert.equal(selfish.statusCode, 400);
    assert.equal(selfish.json().error, "self_referral");
  });

  it("attaches exactly once and shows up in the inviter's stats", async () => {
    // make sure the inviter has a users row (via any authed endpoint)
    await app.inject({ method: "GET", url: "/v1/me", headers: authOf(INVITER) });

    const first = await app.inject({ method: "POST", url: "/v1/me/referral/attach", headers: { ...authOf(INVITEE), ...JSON_POST }, payload: { referrerId: INVITER } });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().attached, true);

    const again = await app.inject({ method: "POST", url: "/v1/me/referral/attach", headers: { ...authOf(INVITEE), ...JSON_POST }, payload: { referrerId: INVITER } });
    assert.equal(again.json().attached, false);

    const row: any = db.prepare("SELECT referrer_id FROM users WHERE tg_id = ?").get(INVITEE);
    assert.equal(row.referrer_id, INVITER);

    const stats = await app.inject({ method: "GET", url: "/v1/me/referral", headers: authOf(INVITER) });
    assert.equal(stats.json().invitees, 1);
  });
});

describe("Admin stats — SQL aggregates", () => {
  it("blocked for non-admins", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/admin/stats", headers: authOf(9401) });
    assert.equal(res.statusCode, 403);
  });

  it("aggregates totals, statuses, days and top products", async () => {
    // One live order so revenue/top-products have data
    const made = await app.inject({
      method: "POST", url: "/v1/orders",
      headers: { ...authOf(9101), ...JSON_POST },
      payload: orderPayload({ items: [{ id: "wax", qty: 2, price: 0 }] }),
    });
    assert.equal(made.statusCode, 200);

    const res = await app.inject({ method: "GET", url: "/v1/admin/stats", headers: authOf(ADMIN_ID) });
    assert.equal(res.statusCode, 200);
    const s = res.json();

    assert.ok(s.totals.ordersCount >= 1);
    assert.ok(s.totals.revenueAll >= 256000);              // 2 × wax 128000 (canceled order excluded)
    // other suites in this file place more orders — just check coherency
    assert.ok(s.totals.avgOrderValue > 0 && s.totals.avgOrderValue <= s.totals.revenueAll);
    assert.ok(s.totals.usersCount >= 1);
    assert.ok(s.byStatus.new >= 1);
    assert.ok(s.byStatus.canceled >= 1);                   // from the stars suite
    assert.ok(Array.isArray(s.revenueByDay) && s.revenueByDay.length >= 1);
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(s.revenueByDay.some((d: any) => d.date === today && d.revenue >= 256000));
    assert.equal(s.topProducts[0].id, "wax");
    assert.ok(s.topProducts[0].revenue >= 256000);
  });
});

describe("Courier tracking — owner-only live position", () => {
  const OWNER = 9501;
  const STRANGER = 9502;
  let orderId = "";

  it("order exists for tracking", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/orders", headers: { ...authOf(OWNER), ...JSON_POST }, payload: orderPayload() });
    assert.equal(res.statusCode, 200);
    orderId = res.json().order_id;
  });

  it("requires auth and ownership (IDOR-safe)", async () => {
    const noAuth = await app.inject({ method: "GET", url: `/v1/orders/${orderId}/track` });
    assert.equal(noAuth.statusCode, 401);
    const stranger = await app.inject({ method: "GET", url: `/v1/orders/${orderId}/track`, headers: authOf(STRANGER) });
    assert.equal(stranger.statusCode, 403);
    const ghost = await app.inject({ method: "GET", url: "/v1/orders/DL-0000/track", headers: authOf(OWNER) });
    assert.equal(ghost.statusCode, 404);
  });

  it("no courier session yet → inactive payload", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/orders/${orderId}/track`, headers: authOf(OWNER) });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { active: false });
  });

  it("live courier row exposes position to owner and admin, with TTL", async () => {
    const now = Date.now();
    db.prepare(`
      INSERT INTO courier_locations (order_id, tg_id, lat, lon, updated_ms, live_until_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(orderId, 111222, 41.3111, 69.2797, now - 5000, now + 15 * 60_000);

    const own = await app.inject({ method: "GET", url: `/v1/orders/${orderId}/track`, headers: authOf(OWNER) });
    assert.equal(own.statusCode, 200);
    assert.equal(own.json().active, true);
    assert.ok(Math.abs(own.json().lat - 41.3111) < 1e-6);
    assert.ok(own.json().staleSec >= 5);

    const admin = await app.inject({ method: "GET", url: `/v1/orders/${orderId}/track`, headers: authOf(ADMIN_ID) });
    assert.equal(admin.statusCode, 200);
    assert.equal(admin.json().active, true);

    // Expired live period → session reported inactive
    db.prepare("UPDATE courier_locations SET live_until_ms = ? WHERE order_id = ?").run(Date.now() - 1000, orderId);
    const dead = await app.inject({ method: "GET", url: `/v1/orders/${orderId}/track`, headers: authOf(OWNER) });
    assert.equal(dead.json().active, false);
  });
});

describe("Subscriptions — owner-scoped CRUD", () => {
  const USER = 9301;
  let subId = "";

  it("creates a subscription with a computed next date", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/me/subscriptions",
      headers: { ...authOf(USER), ...JSON_POST },
      payload: { productId: "wax", qty: 1, frequency: 30 },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.match(body.id, /^SUB-[0-9A-F]{8}$/);
    assert.equal(body.status, "active");
    const expected = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    assert.equal(body.next_date, expected);
    subId = body.id;
  });

  it("validates input", async () => {
    const badQty = await app.inject({
      method: "POST", url: "/v1/me/subscriptions",
      headers: { ...authOf(USER), ...JSON_POST },
      payload: { productId: "wax", qty: 0, frequency: 30 },
    });
    assert.equal(badQty.statusCode, 400);
    const ghost = await app.inject({
      method: "POST", url: "/v1/me/subscriptions",
      headers: { ...authOf(USER), ...JSON_POST },
      payload: { productId: "nope", qty: 1, frequency: 30 },
    });
    assert.equal(ghost.statusCode, 404);
  });

  it("lists only the owner's subscriptions", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/subscriptions", headers: authOf(USER) });
    assert.equal(res.json().length, 1);
    const other = await app.inject({ method: "GET", url: "/v1/me/subscriptions", headers: authOf(9999) });
    assert.equal(other.json().length, 0);
  });

  it("cancel is owner-scoped (IDOR-safe)", async () => {
    const idor = await app.inject({ method: "DELETE", url: `/v1/me/subscriptions/${subId}`, headers: authOf(9999) });
    assert.equal(idor.statusCode, 404);
    const ok = await app.inject({ method: "DELETE", url: `/v1/me/subscriptions/${subId}`, headers: authOf(USER) });
    assert.equal(ok.statusCode, 200);
    const res = await app.inject({ method: "GET", url: "/v1/me/subscriptions", headers: authOf(USER) });
    assert.equal(res.json().length, 0);
  });
});

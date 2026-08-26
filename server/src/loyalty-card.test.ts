/** End-to-end loyalty card, admin POS, rules, missions, birthday and expiry. */
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const TOKEN = "loyalty-test-token";
const ADMIN_ID = 555000333;
process.env.TG_BOT_TOKEN = TOKEN;
process.env.ADMIN_CHAT_ID = String(ADMIN_ID);
process.env.DELIS_DB_PATH = ":memory:";
process.env.DELIS_AUTOSTART = "0";
process.env.DELIS_DISABLE_NOTIFY = "1";
process.env.SEED_ON_START = "false";

let app: Awaited<typeof import("./index.js")>["app"];
let db: ReturnType<typeof import("./db.js").getDb>;

function initData(id: number) {
  const params = new URLSearchParams({
    auth_date: Math.floor(Date.now() / 1000).toString(),
    query_id: "LOYALTY_TEST",
    user: JSON.stringify({ id, first_name: `Member ${id}`, username: `member${id}` }),
  });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}
const auth = (id: number) => ({ Authorization: `Telegram ${initData(id)}` });
const json = (id: number) => ({ ...auth(id), "Content-Type": "application/json" });
const ADMIN = () => json(ADMIN_ID);

before(async () => {
  const mod = await import("./index.js");
  app = mod.app;
  mod.ensureDb();
  db = (await import("./db.js")).getDb();
  (await import("./seed-runner.js")).seedOnStart(true);
});

describe("secure DELIS loyalty card", () => {
  const MEMBER = 8801;
  let cardCode = "";

  it("issues a stable opaque card number and default missions", async () => {
    const first = await app.inject({ method: "GET", url: "/v1/me/loyalty?lang=ru", headers: auth(MEMBER) });
    assert.equal(first.statusCode, 200, first.body);
    const card = first.json();
    cardCode = card.cardCode;
    assert.match(cardCode, /^DLX-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.ok(!cardCode.includes(String(MEMBER)));
    assert.equal(card.level, "bronze");
    assert.equal(card.starValueUzs, 100);
    assert.equal(card.missions.length, 3);

    const again = await app.inject({ method: "GET", url: "/v1/me/loyalty", headers: auth(MEMBER) });
    assert.equal(again.json().cardCode, cardCode);
  });

  it("protects lookup and resolves both raw code and QR payload", async () => {
    const denied = await app.inject({ method: "GET", url: `/v1/admin/loyalty/${cardCode}`, headers: auth(MEMBER) });
    assert.equal(denied.statusCode, 403);
    const found = await app.inject({ method: "GET", url: `/v1/admin/loyalty/${cardCode}?lang=ru`, headers: ADMIN() });
    assert.equal(found.statusCode, 200, found.body);
    assert.equal(found.json().userId, MEMBER);
    assert.equal(found.json().customer.username, `member${MEMBER}`);
    const qr = await app.inject({ method: "GET", url: `/v1/admin/loyalty/${encodeURIComponent(`DELIS-CARD:${cardCode}`)}`, headers: ADMIN() });
    assert.equal(qr.statusCode, 200);
  });

  it("admin earn/spend is atomic, audited and current balance controls level", async () => {
    const earn = await app.inject({
      method: "POST", url: `/v1/admin/loyalty/${cardCode}/adjust`, headers: ADMIN(),
      payload: { type: "earn", amount: 500, reason: "Welcome campaign" },
    });
    assert.equal(earn.statusCode, 200, earn.body);
    assert.equal(earn.json().stars, 500);
    assert.equal(earn.json().profile.level, "silver");

    const spend = await app.inject({
      method: "POST", url: `/v1/admin/loyalty/${cardCode}/adjust`, headers: ADMIN(),
      payload: { type: "spend", amount: 100, reason: "Offline reward" },
    });
    assert.equal(spend.statusCode, 200, spend.body);
    assert.equal(spend.json().profile.stars, 400);
    assert.equal(spend.json().profile.level, "bronze"); // selected business rule: current balance
    assert.equal(spend.json().profile.history[0].description, "Offline reward");

    const tooMuch = await app.inject({
      method: "POST", url: `/v1/admin/loyalty/${cardCode}/adjust`, headers: ADMIN(),
      payload: { type: "spend", amount: 999999, reason: "Must fail" },
    });
    assert.equal(tooMuch.statusCode, 409);
    assert.equal(tooMuch.json().error, "insufficient_stars");
  });

  it("searches members without exposing an admin bypass", async () => {
    const found = await app.inject({ method: "GET", url: "/v1/admin/loyalty/search?q=member8801", headers: ADMIN() });
    assert.equal(found.statusCode, 200);
    assert.equal(found.json().members[0].code, cardCode);
  });

  it("rotates a compromised QR and immediately revokes the old code", async () => {
    const oldCode = cardCode;
    const rotate = await app.inject({ method: "POST", url: `/v1/admin/loyalty/${oldCode}/rotate`, headers: auth(ADMIN_ID) });
    assert.equal(rotate.statusCode, 200, rotate.body);
    cardCode = rotate.json().code;
    assert.notEqual(cardCode, oldCode);
    const oldLookup = await app.inject({ method: "GET", url: `/v1/admin/loyalty/${oldCode}`, headers: ADMIN() });
    assert.equal(oldLookup.statusCode, 404);
    const newLookup = await app.inject({ method: "GET", url: `/v1/admin/loyalty/${cardCode}`, headers: ADMIN() });
    assert.equal(newLookup.statusCode, 200);
  });
});

describe("configurable tiers and campaigns", () => {
  it("validates and publishes admin-edited rules", async () => {
    const invalid = await app.inject({
      method: "PUT", url: "/v1/admin/loyalty/config", headers: ADMIN(),
      payload: { starValueUzs: 100, expirationDays: 365, expiryWarningDays: 30, birthdayBonus: 100,
        tiers: { bronze: { minStars: 0, cashbackPercent: 3 }, silver: { minStars: 900, cashbackPercent: 5 }, gold: { minStars: 800, cashbackPercent: 8 } } },
    });
    assert.equal(invalid.statusCode, 400);

    const config = { starValueUzs: 100, expirationDays: 365, expiryWarningDays: 30, birthdayBonus: 150,
      tiers: { bronze: { minStars: 0, cashbackPercent: 4 }, silver: { minStars: 600, cashbackPercent: 6 }, gold: { minStars: 1800, cashbackPercent: 9 } } };
    const save = await app.inject({ method: "PUT", url: "/v1/admin/loyalty/config", headers: ADMIN(), payload: config });
    assert.equal(save.statusCode, 200, save.body);
    const publicRules = await app.inject({ method: "GET", url: "/v1/loyalty-config" });
    assert.deepEqual(publicRules.json(), config);
  });

  it("completes and claims the first-order mission once", async () => {
    const MEMBER = 8802;
    const order = await app.inject({
      method: "POST", url: "/v1/orders", headers: json(MEMBER),
      payload: { items: [{ id: "wax", qty: 1 }], recipient: { name: "Mission", phone: "+998901234567" },
        delivery: { method: "pickup", address: "Factory" }, payment: { method: "cash" } },
    });
    assert.equal(order.statusCode, 200, order.body);
    const paid = await app.inject({
      method: "POST", url: `/v1/admin/orders/${order.json().order_id}/payment`, headers: ADMIN(), payload: { paymentStatus: "paid" },
    });
    assert.equal(paid.statusCode, 200);
    const card = await app.inject({ method: "GET", url: "/v1/me/loyalty?lang=en", headers: auth(MEMBER) });
    const mission = card.json().missions.find((m: any) => m.id === "first-order");
    assert.equal(mission.claimable, true);

    const claim = await app.inject({ method: "POST", url: "/v1/me/loyalty/missions/first-order/claim?lang=en", headers: auth(MEMBER) });
    assert.equal(claim.statusCode, 200, claim.body);
    assert.equal(claim.json().reward, 100);
    const russianHistory = await app.inject({ method: "GET", url: "/v1/me/loyalty?lang=ru", headers: auth(MEMBER) });
    assert.equal(russianHistory.json().history[0].description, "Первый заказ");
    const englishHistory = await app.inject({ method: "GET", url: "/v1/me/loyalty?lang=en", headers: auth(MEMBER) });
    assert.equal(englishHistory.json().history[0].description, "First order");
    const again = await app.inject({ method: "POST", url: "/v1/me/loyalty/missions/first-order/claim?lang=en", headers: auth(MEMBER) });
    assert.equal(again.statusCode, 409);
  });

  it("creates and disables a custom admin mission", async () => {
    const payload = { id: "refer-one", metric: "referrals", target: 1, reward: 75,
      title: { uz: "Do'st", ru: "Друг", en: "Friend" },
      description: { uz: "Bitta do'st", ru: "Один друг", en: "One friend" }, icon: "🤝", active: true };
    const create = await app.inject({ method: "POST", url: "/v1/admin/loyalty/missions", headers: ADMIN(), payload });
    assert.equal(create.statusCode, 200, create.body);
    const list = await app.inject({ method: "GET", url: "/v1/admin/loyalty/missions", headers: ADMIN() });
    const saved = list.json().missions.find((mission: any) => mission.id === payload.id);
    assert.equal(saved.title_uz, payload.title.uz);
    assert.equal(saved.title_ru, payload.title.ru);
    assert.equal(saved.title_en, payload.title.en);
    assert.equal(saved.description_uz, payload.description.uz);
    assert.equal(saved.description_ru, payload.description.ru);
    assert.equal(saved.description_en, payload.description.en);
    const remove = await app.inject({ method: "DELETE", url: "/v1/admin/loyalty/missions/refer-one", headers: auth(ADMIN_ID) });
    assert.equal(remove.statusCode, 200);
  });
});

describe("birthday and expiration", () => {
  it("claims the configured birthday bonus once per year", async () => {
    const MEMBER = 8803;
    const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(5, 10);
    const set = await app.inject({ method: "POST", url: "/v1/me/birthday", headers: json(MEMBER), payload: { birthday: today } });
    assert.equal(set.statusCode, 200, set.body);
    const claim = await app.inject({ method: "POST", url: "/v1/me/loyalty/birthday/claim", headers: auth(MEMBER) });
    assert.equal(claim.statusCode, 200, claim.body);
    assert.equal(claim.json().amount, 150);
    const again = await app.inject({ method: "POST", url: "/v1/me/loyalty/birthday/claim", headers: auth(MEMBER) });
    assert.equal(again.statusCode, 409);
  });

  it("expires only the remaining part of an old earn lot", async () => {
    const MEMBER = 8804;
    await app.inject({ method: "GET", url: "/v1/me/loyalty", headers: auth(MEMBER) });
    const code = (db.prepare("SELECT code FROM loyalty_cards WHERE tg_id = ?").get(MEMBER) as any).code;
    await app.inject({ method: "POST", url: `/v1/admin/loyalty/${code}/adjust`, headers: ADMIN(), payload: { type: "earn", amount: 200, reason: "Old campaign" } });
    db.prepare("UPDATE loyalty_transactions SET expires_at = datetime('now', '-1 day') WHERE tg_id = ? AND type = 'earn'").run(MEMBER);
    const card = await app.inject({ method: "GET", url: "/v1/me/loyalty?lang=ru", headers: auth(MEMBER) });
    assert.equal(card.statusCode, 200, card.body);
    assert.equal(card.json().stars, 0);
    assert.equal(card.json().history[0].source, "expiry");
    assert.equal(card.json().history[0].amount, 200);
  });
});

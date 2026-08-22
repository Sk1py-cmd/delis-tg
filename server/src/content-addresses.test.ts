/**
 * Integration coverage for content/settings, stories, favorites, addresses,
 * abandoned carts and administrative exports.
 */
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const TOKEN = "content-test-bot-token";
const ADMIN_ID = 555000222;
process.env.TG_BOT_TOKEN = TOKEN;
process.env.ADMIN_CHAT_ID = String(ADMIN_ID);
process.env.DELIS_DB_PATH = ":memory:";
process.env.DELIS_AUTOSTART = "0";
process.env.DELIS_DISABLE_NOTIFY = "1";
process.env.SEED_ON_START = "false";

let app: Awaited<typeof import("./index.js")>["app"];
let db: ReturnType<typeof import("./db.js").getDb>;

function makeInitData(id: number): string {
  const params = new URLSearchParams({
    auth_date: Math.floor(Date.now() / 1000).toString(),
    query_id: "CONTENT_TEST",
    user: JSON.stringify({ id, first_name: `User ${id}`, username: `user${id}` }),
  });
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheck).digest("hex"));
  return params.toString();
}

const authOf = (id: number) => ({ Authorization: `Telegram ${makeInitData(id)}` });
const jsonAuthOf = (id: number) => ({ ...authOf(id), "Content-Type": "application/json" });
const ADMIN = () => jsonAuthOf(ADMIN_ID);

before(async () => {
  const mod = await import("./index.js");
  app = mod.app;
  mod.ensureDb();
  const dbMod = await import("./db.js");
  db = dbMod.getDb();
  const { seedOnStart } = await import("./seed-runner.js");
  seedOnStart();
});

describe("managed site settings, delivery and home content", () => {
  it("starts with no managed settings/content", async () => {
    const [settings, content] = await Promise.all([
      app.inject({ method: "GET", url: "/v1/site-settings" }),
      app.inject({ method: "GET", url: "/v1/content" }),
    ]);
    assert.equal(settings.statusCode, 200);
    assert.equal(settings.body, "null");
    assert.equal(content.body, "null");
  });

  it("protects admin writes", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/admin/site-settings", headers: jsonAuthOf(7001),
      payload: { supportPhone: "+998" },
    });
    assert.equal(res.statusCode, 403);
  });

  it("sanitizes and publishes site settings", async () => {
    const save = await app.inject({
      method: "POST", url: "/v1/admin/site-settings", headers: ADMIN(),
      payload: { supportPhone: "  +998 90 123-45-67  ", telegram: "https://t.me/delis", injected: "no" },
    });
    assert.equal(save.statusCode, 200, save.body);
    assert.deepEqual(save.json().settings, {
      supportPhone: "+998 90 123-45-67",
      telegram: "https://t.me/delis",
    });
    const publicSettings = await app.inject({ method: "GET", url: "/v1/site-settings" });
    assert.equal(publicSettings.json().injected, undefined);
    assert.equal(publicSettings.json().supportPhone, "+998 90 123-45-67");
  });

  it("validates, saves and publishes delivery config", async () => {
    const invalid = await app.inject({
      method: "PUT", url: "/v1/admin/delivery-config", headers: ADMIN(),
      payload: { freeShippingThreshold: -1, tariffs: {} },
    });
    assert.equal(invalid.statusCode, 400);

    const config = {
      freeShippingThreshold: 175000,
      tariffs: { namangan: { courier: 13000, bts: 9000, days: [1, 2] } },
      defaultTariff: { courier: 31000, bts: 21000, days: [2, 5] },
    };
    const save = await app.inject({
      method: "PUT", url: "/v1/admin/delivery-config", headers: ADMIN(), payload: config,
    });
    assert.equal(save.statusCode, 200, save.body);
    const publicConfig = await app.inject({ method: "GET", url: "/v1/delivery-config" });
    assert.deepEqual(publicConfig.json(), config);
  });

  it("publishes admin-managed home content", async () => {
    const content = { splash: { title: "DELIS test" }, why: [{ title: "Quality" }] };
    const save = await app.inject({
      method: "POST", url: "/v1/admin/content", headers: ADMIN(), payload: content,
    });
    assert.equal(save.statusCode, 200, save.body);
    const read = await app.inject({ method: "GET", url: "/v1/content" });
    assert.deepEqual(read.json(), content);
  });
});

describe("community stories moderation and ownership", () => {
  const owner = 7101;
  const stranger = 7102;
  let storyId = "";

  it("rejects incomplete stories", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/stories", headers: jsonAuthOf(owner), payload: { title: "No media" },
    });
    assert.equal(res.statusCode, 400);
  });

  it("creates a pending story that is not public", async () => {
    const create = await app.inject({
      method: "POST", url: "/v1/stories", headers: jsonAuthOf(owner),
      payload: { title: "Customer story", description: "Clean car", media: "data:image/jpeg;base64,AA==", mediaKind: "image", phone: "+998901234567" },
    });
    assert.equal(create.statusCode, 200, create.body);
    storyId = create.json().id;
    assert.equal(create.json().status, "pending");
    const publicStories = await app.inject({ method: "GET", url: "/v1/stories" });
    assert.equal(publicStories.json().some((s: any) => s.id === storyId), false);
  });

  it("prevents another customer from deleting it", async () => {
    const res = await app.inject({ method: "DELETE", url: `/v1/stories/${storyId}`, headers: authOf(stranger) });
    assert.equal(res.statusCode, 403);
  });

  it("lets admin approve it and then publishes it", async () => {
    const list = await app.inject({ method: "GET", url: "/v1/admin/stories", headers: ADMIN() });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().some((s: any) => s.id === storyId), true);

    const approve = await app.inject({
      method: "POST", url: `/v1/admin/stories/${storyId}/status`, headers: ADMIN(), payload: { status: "approved" },
    });
    assert.equal(approve.statusCode, 200);
    const publicStories = await app.inject({ method: "GET", url: "/v1/stories" });
    assert.equal(publicStories.json().some((s: any) => s.id === storyId), true);
  });

  it("lets the owner delete their story", async () => {
    const remove = await app.inject({ method: "DELETE", url: `/v1/stories/${storyId}`, headers: authOf(owner) });
    assert.equal(remove.statusCode, 200);
    const again = await app.inject({ method: "DELETE", url: `/v1/stories/${storyId}`, headers: authOf(owner) });
    assert.equal(again.statusCode, 404);
  });
});

describe("favorites and owner-scoped addresses", () => {
  const owner = 7201;
  const stranger = 7202;
  let firstAddress = "";
  let secondAddress = "";

  it("toggles an existing product and rejects an unknown one", async () => {
    const add = await app.inject({ method: "POST", url: "/v1/me/favorites/wax", headers: authOf(owner) });
    assert.equal(add.statusCode, 200, add.body);
    assert.equal(add.json().favorited, true);
    const list = await app.inject({ method: "GET", url: "/v1/me/favorites", headers: authOf(owner) });
    assert.deepEqual(list.json(), ["wax"]);
    const remove = await app.inject({ method: "POST", url: "/v1/me/favorites/wax", headers: authOf(owner) });
    assert.equal(remove.json().favorited, false);
    const missing = await app.inject({ method: "POST", url: "/v1/me/favorites/missing", headers: authOf(owner) });
    assert.equal(missing.statusCode, 404);
  });

  it("rejects malformed addresses", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/me/addresses", headers: jsonAuthOf(owner), payload: { label: "Home" },
    });
    assert.equal(res.statusCode, 400);
  });

  it("creates unique addresses and maintains one default", async () => {
    const make = (label: string, isDefault: boolean) => app.inject({
      method: "POST", url: "/v1/me/addresses", headers: jsonAuthOf(owner),
      payload: { label, regionId: "namangan", district: "Turaqurgan", street: `${label} street`, isDefault },
    });
    const first = await make("Home", true);
    const second = await make("Work", true);
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(second.statusCode, 200, second.body);
    firstAddress = first.json().id;
    secondAddress = second.json().id;
    assert.notEqual(firstAddress, secondAddress);

    const list = await app.inject({ method: "GET", url: "/v1/me/addresses", headers: authOf(owner) });
    const rows = list.json();
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((r: any) => r.is_default === 1).length, 1);
    assert.equal(rows.find((r: any) => r.id === secondAddress).is_default, 1);
  });

  it("prevents cross-user deletion and reports missing IDs", async () => {
    const forbidden = await app.inject({ method: "DELETE", url: `/v1/me/addresses/${firstAddress}`, headers: authOf(stranger) });
    assert.equal(forbidden.statusCode, 404);
    const remove = await app.inject({ method: "DELETE", url: `/v1/me/addresses/${firstAddress}`, headers: authOf(owner) });
    assert.equal(remove.statusCode, 200);
    const again = await app.inject({ method: "DELETE", url: `/v1/me/addresses/${firstAddress}`, headers: authOf(owner) });
    assert.equal(again.statusCode, 404);
  });
});

describe("abandoned carts and admin exports", () => {
  const customer = 7301;

  it("upserts and removes an abandoned cart", async () => {
    const save = await app.inject({
      method: "POST", url: "/v1/abandoned-cart", headers: jsonAuthOf(customer),
      payload: { items: [{ id: "wax", qty: 2, name: "Wax", price: 128000 }], totalItems: 2, totalValue: 256000, language: "ru" },
    });
    assert.equal(save.statusCode, 200, save.body);
    const row = db.prepare("SELECT * FROM abandoned_carts WHERE tg_id = ?").get(customer) as any;
    assert.equal(row.total_items, 2);
    assert.equal(row.language, "ru");

    const remove = await app.inject({
      method: "POST", url: "/v1/abandoned-cart", headers: jsonAuthOf(customer), payload: { items: [] },
    });
    assert.equal(remove.json().removed, true);
    assert.equal(db.prepare("SELECT 1 FROM abandoned_carts WHERE tg_id = ?").get(customer), undefined);
  });

  it("protects analytics and database backups", async () => {
    const analyticsDenied = await app.inject({ method: "GET", url: "/v1/admin/analytics", headers: authOf(customer) });
    const backupDenied = await app.inject({ method: "GET", url: "/v1/admin/backup", headers: authOf(customer) });
    assert.equal(analyticsDenied.statusCode, 403);
    assert.equal(backupDenied.statusCode, 403);
  });

  it("returns admin analytics and a downloadable JSON backup", async () => {
    const analytics = await app.inject({ method: "GET", url: "/v1/admin/analytics", headers: ADMIN() });
    assert.equal(analytics.statusCode, 200);
    assert.ok(Array.isArray(analytics.json().orders));

    const backup = await app.inject({ method: "GET", url: "/v1/admin/backup", headers: ADMIN() });
    assert.equal(backup.statusCode, 200, backup.body);
    assert.match(String(backup.headers["content-disposition"]), /DELIS_backup_\d{4}-\d{2}-\d{2}\.json/);
    const parsed = JSON.parse(backup.body);
    assert.equal(parsed._app, "delis");
    assert.ok(Array.isArray(parsed.products));
    assert.ok(Array.isArray(parsed.content_settings));
  });
});

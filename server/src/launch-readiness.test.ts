import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const TOKEN = "launch-readiness-token";
const ADMIN_ID = 880011;
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
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}

const auth = (id: number) => ({ Authorization: `Telegram ${makeInitData(id)}` });
const jsonAuth = (id: number) => ({ ...auth(id), "Content-Type": "application/json" });
const orderPayload = {
  items: [{ id: "wax", qty: 1 }],
  recipient: { name: "Launch Test", phone: "+998901234567" },
  delivery: { method: "pickup", zone: "namangan", address: "Factory", time: "today" },
  payment: { method: "cash" },
};

before(async () => {
  const module = await import("./index.js");
  app = module.app;
  module.ensureDb();
  const { seedOnStart } = await import("./seed-runner.js");
  seedOnStart();
});

describe("launch hardening", () => {
  it("adds baseline browser security headers", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["referrer-policy"], "strict-origin-when-cross-origin");
    assert.match(String(response.headers["permissions-policy"]), /camera/);
  });

  it("reports server-authoritative admin identity", async () => {
    const regular = await app.inject({ method: "GET", url: "/v1/me", headers: auth(99001) });
    const admin = await app.inject({ method: "GET", url: "/v1/me", headers: auth(ADMIN_ID) });
    assert.equal(regular.json().isAdmin, false);
    assert.equal(admin.json().isAdmin, true);
  });

  it("updates only an owned address", async () => {
    const owner = 99002;
    const created = await app.inject({
      method: "POST", url: "/v1/me/addresses", headers: jsonAuth(owner),
      payload: { label: "home", regionId: "namangan", district: "Markaz", street: "Old", phone: "+998901234567", isDefault: true },
    });
    const id = created.json().id;
    const updated = await app.inject({
      method: "PUT", url: `/v1/me/addresses/${id}`, headers: jsonAuth(owner),
      payload: { label: "work", regionId: "namangan", district: "Markaz", street: "New", phone: "+998901234567", isDefault: true },
    });
    assert.equal(updated.statusCode, 200, updated.body);
    const stranger = await app.inject({
      method: "PUT", url: `/v1/me/addresses/${id}`, headers: jsonAuth(99003),
      payload: { label: "work", regionId: "namangan", district: "Markaz", street: "Stolen", phone: "+998901234567" },
    });
    assert.equal(stranger.statusCode, 404);
  });

  it("persists support chat and owner-isolates the thread", async () => {
    const owner = 99004;
    const created = await app.inject({
      method: "POST", url: "/v1/me/chat", headers: jsonAuth(owner), payload: { text: "Where is my order?" },
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().deliveredToAdmin, false); // Telegram disabled in tests
    const own = await app.inject({ method: "GET", url: "/v1/me/chat", headers: auth(owner) });
    const stranger = await app.inject({ method: "GET", url: "/v1/me/chat", headers: auth(99005) });
    assert.equal(own.json().length, 1);
    assert.equal(own.json()[0].text, "Where is my order?");
    assert.equal(stranger.json().length, 0);
  });

  it("creates a return only for a delivered owned item and lets admin resolve it", async () => {
    const owner = 99006;
    const createdOrder = await app.inject({ method: "POST", url: "/v1/orders", headers: jsonAuth(owner), payload: orderPayload });
    const orderId = createdOrder.json().order_id;
    const tooEarly = await app.inject({
      method: "POST", url: "/v1/me/returns", headers: jsonAuth(owner),
      payload: { orderId, productId: "wax", reason: "sealed" },
    });
    assert.equal(tooEarly.statusCode, 404);
    for (const status of ["preparing", "shipped", "delivered"]) {
      const moved = await app.inject({
        method: "POST", url: `/v1/admin/orders/${orderId}/status`, headers: jsonAuth(ADMIN_ID), payload: { status },
      });
      assert.equal(moved.statusCode, 200, moved.body);
    }
    const request = await app.inject({
      method: "POST", url: "/v1/me/returns", headers: jsonAuth(owner),
      payload: { orderId, productId: "wax", reason: "sealed", note: "Changed my mind" },
    });
    assert.equal(request.statusCode, 201, request.body);
    const returnId = request.json().id;
    const duplicate = await app.inject({
      method: "POST", url: "/v1/me/returns", headers: jsonAuth(owner),
      payload: { orderId, productId: "wax", reason: "sealed" },
    });
    assert.equal(duplicate.statusCode, 409);
    const resolved = await app.inject({
      method: "PATCH", url: `/v1/admin/returns/${returnId}`, headers: jsonAuth(ADMIN_ID), payload: { status: "approved" },
    });
    assert.equal(resolved.statusCode, 200, resolved.body);
    const list = await app.inject({ method: "GET", url: "/v1/me/returns", headers: auth(owner) });
    assert.equal(list.json()[0].status, "approved");
  });

  it("exposes an authenticated production-readiness gate", async () => {
    const forbidden = await app.inject({ method: "GET", url: "/v1/admin/readiness", headers: auth(99007) });
    assert.equal(forbidden.statusCode, 403);
    const response = await app.inject({ method: "GET", url: "/v1/admin/readiness", headers: auth(ADMIN_ID) });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(typeof response.json().ready, "boolean");
    assert.ok(response.json().checks.some((check: any) => check.id === "costs"));
    assert.doesNotMatch(response.body, /launch-readiness-token/);
  });

  it("does not pretend a broadcast succeeded when Telegram delivery is disabled", async () => {
    const response = await app.inject({
      method: "POST", url: "/v1/admin/broadcast", headers: jsonAuth(ADMIN_ID),
      payload: { kind: "system", title: "Maintenance", body: "Tonight" },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error, "telegram_bot_not_configured");
  });
});

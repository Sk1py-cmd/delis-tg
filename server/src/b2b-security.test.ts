/**
 * B2B brute-force hardening (H3) + promo/cert oracle limits (M1):
 * - /v1/b2b/verify is limited to 5/min PER SIGNED SUBJECT (anonymous
 *   browser sessions no longer give 300 guesses/min)
 * - admin-created B2B codes must carry >= 8 alphanumeric chars of entropy
 *   (auto-generated codes now B2B-XXXXXXXX, 32^8 ≈ 1.1e12)
 * - /v1/promo/validate and /v1/certificates/check are limited to 10/min
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const TOKEN = "b2b-security-token";
const ADMIN_ID = 555000111;
process.env.TG_BOT_TOKEN = TOKEN;
process.env.ADMIN_CHAT_ID = String(ADMIN_ID);
process.env.DELIS_DB_PATH = ":memory:";
process.env.DELIS_AUTOSTART = "0";
process.env.DELIS_DISABLE_NOTIFY = "1";
process.env.SEED_ON_START = "false";

let app: Awaited<typeof import("./index.js")>["app"];

/** Pinned fresh auth_date → stable subject identity across requests. */
const FIXED_AUTH_DATE = Math.floor(Date.now() / 1000) - 60;
function makeInitData(id: number): string {
  const params = new URLSearchParams({
    auth_date: String(FIXED_AUTH_DATE),
    query_id: "AAEAAAA",
    user: JSON.stringify({ id, first_name: `User ${id}`, username: `user${id}` }),
  });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}
const auth = (id: number) => `Telegram ${makeInitData(id)}`;
const JSON_POST = { "Content-Type": "application/json" };
const ADMIN = { Authorization: auth(ADMIN_ID), ...JSON_POST };

before(async () => {
  const mod = await import("./index.js");
  app = mod.app;
  mod.ensureDb();
  const { seedOnStart } = await import("./seed-runner.js");
  seedOnStart(true);
});

describe("B2B brute-force hardening (H3)", () => {
  it("auto-generated codes now carry 8 chars of entropy", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/b2b-codes", headers: ADMIN, payload: { label: "audit partner" } });
    assert.equal(res.statusCode, 200, res.body);
    assert.match(res.json().code, /^B2B-[A-Z0-9]{8}$/);
  });

  it("rejects weak custom codes (brute-forceable through the verify oracle)", async () => {
    for (const weak of ["B2B-AB", "OZOD202", "Q1-23"]) {
      const res = await app.inject({ method: "POST", url: "/v1/admin/b2b-codes", headers: ADMIN, payload: { code: weak } });
      assert.equal(res.statusCode, 400, `${weak} should be rejected`);
      assert.equal(res.json().error, "code_too_weak");
    }
  });

  it("accepts custom codes with enough entropy", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/b2b-codes", headers: ADMIN, payload: { code: "PARTNER-2026" } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().code, "PARTNER-2026");
  });

  it("verify is limited to 5/min per signed subject", async () => {
    const headers = { Authorization: auth(777001), ...JSON_POST };
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({ method: "POST", url: "/v1/b2b/verify", headers, payload: { code: `NOPE-${i}` } });
      statuses.push(res.statusCode);
    }
    // 5 guesses land on the handler (404), the 6th is rate-limited
    assert.deepEqual(statuses, [404, 404, 404, 404, 404, 429]);
  });

  it("a different subject still has a fresh verify budget", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/b2b/verify",
      headers: { Authorization: auth(777002), ...JSON_POST },
      payload: { code: "PARTNER-2026" },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().ok, true);
  });
});

describe("promo/certificate oracle limits (M1)", () => {
  it("public /v1/promo/validate is limited to 10/min", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({ method: "GET", url: `/v1/promo/validate?code=MISSING${i}` });
      statuses.push(res.statusCode);
    }
    assert.deepEqual(statuses, Array(10).fill(404).concat(429));
  });

  it("/v1/certificates/check is limited to 10/min per subject", async () => {
    const headers = { Authorization: auth(777003), ...JSON_POST };
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({ method: "POST", url: "/v1/certificates/check", headers, payload: { code: `GIFT-${i}` } });
      statuses.push(res.statusCode);
    }
    assert.deepEqual(statuses, Array(10).fill(404).concat(429));
  });
});

/**
 * Rate-limit identity tests (H2): buckets must be keyed on the signed
 * subject (initData / browser-session token), not on a spoofable IP; the
 * anonymous fallback stays IP-keyed (the edge worker sanitizes XFF).
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const TOKEN = "rate-limit-token";
const ADMIN_ID = 440001;
process.env.TG_BOT_TOKEN = TOKEN;
process.env.ADMIN_CHAT_ID = String(ADMIN_ID);
process.env.DELIS_DB_PATH = ":memory:";
process.env.DELIS_AUTOSTART = "0";
process.env.DELIS_DISABLE_NOTIFY = "1";
process.env.SEED_ON_START = "false";

let app: Awaited<typeof import("./index.js")>["app"];

/** auth_date pinned so the SAME subject reuses one bucket across requests
 *  (fresh enough to pass the initData replay window). */
const FIXED_AUTH_DATE = Math.floor(Date.now() / 1000) - 60;
function makeInitData(id: number, authDate: number): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAEAAAA",
    user: JSON.stringify({ id, first_name: `User ${id}`, username: `user${id}` }),
  });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}
const auth = (id: number) => `Telegram ${makeInitData(id, FIXED_AUTH_DATE)}`;

before(async () => {
  const mod = await import("./index.js");
  app = mod.app;
  mod.ensureDb();
  const { seedOnStart } = await import("./seed-runner.js");
  seedOnStart(true);
});

describe("rate limits are keyed on the signed subject, not the IP", () => {
  it("per-subject bucket: /v1/auth/browser-session (10/min) — user A exhausts, user B is fresh", async () => {
    const hA = { Authorization: auth(420001) };
    let okA = 0;
    for (let i = 0; i < 10; i++) {
      const r = await app.inject({ method: "POST", url: "/v1/auth/browser-session", headers: hA });
      if (r.statusCode === 200) okA++;
    }
    assert.equal(okA, 10);
    const blocked = await app.inject({ method: "POST", url: "/v1/auth/browser-session", headers: hA });
    assert.equal(blocked.statusCode, 429);

    // Same IP, different signed subject → independent bucket
    const hB = { Authorization: auth(420002) };
    const fresh = await app.inject({ method: "POST", url: "/v1/auth/browser-session", headers: hB });
    assert.equal(fresh.statusCode, 200, fresh.body);
  });

  it("authenticated requests do not leak into the anonymous IP bucket", async () => {
    // Exhaust SUBJECT bucket of user 420010 via the global 300/min budget…
    const hC = { Authorization: auth(420010) };
    let okC = 0;
    for (let i = 0; i < 300; i++) {
      const r = await app.inject({ method: "GET", url: "/v1/me", headers: hC });
      if (r.statusCode === 200) okC++;
    }
    assert.equal(okC, 300);
    const blockedC = await app.inject({ method: "GET", url: "/v1/me", headers: hC });
    assert.equal(blockedC.statusCode, 429);

    // …and the IP bucket must still be untouched for another subject
    const hD = { Authorization: auth(420011) };
    const freshD = await app.inject({ method: "GET", url: "/v1/me", headers: hD });
    assert.equal(freshD.statusCode, 200, freshD.body);
  });

  it("anonymous requests still get the per-IP global budget (300/min)", async () => {
    let ok = 0;
    for (let i = 0; i < 300; i++) {
      const r = await app.inject({ method: "GET", url: "/health" });
      if (r.statusCode === 200) ok++;
    }
    assert.equal(ok, 300);
    const blocked = await app.inject({ method: "GET", url: "/health" });
    assert.equal(blocked.statusCode, 429);
  });
});

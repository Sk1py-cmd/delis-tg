import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const TOKEN = "auth-security-token";
process.env.TG_BOT_TOKEN = TOKEN;
process.env.TG_INIT_DATA_MAX_AGE_SECONDS = "3600";

function signedInitData(authDate: number, user: unknown = { id: 123, first_name: "Test" }): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAEAAAA",
    user: JSON.stringify(user),
  });
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}

const { verifyInitData } = await import("./auth.js");
const NOW = 2_000_000_000;

test("accepts a fresh correctly signed Telegram payload", () => {
  assert.equal(verifyInitData(signedInitData(NOW - 30), NOW)?.id, 123);
});

test("rejects stale and implausibly future Telegram payloads", () => {
  assert.equal(verifyInitData(signedInitData(NOW - 3601), NOW), null);
  assert.equal(verifyInitData(signedInitData(NOW + 301), NOW), null);
});

test("rejects a tampered signature and malformed user id", () => {
  const tampered = new URLSearchParams(signedInitData(NOW));
  tampered.set("user", JSON.stringify({ id: 999 }));
  assert.equal(verifyInitData(tampered.toString(), NOW), null);
  assert.equal(verifyInitData(signedInitData(NOW, { id: -1 }), NOW), null);
});

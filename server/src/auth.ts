/**
 * DELIS — Telegram Mini App initData authentication.
 *
 * Besides validating Telegram's HMAC, production requests enforce a bounded
 * auth_date so a captured initData payload cannot be replayed indefinitely.
 */
import crypto from "crypto";

const BOT_TOKEN = process.env.TG_BOT_TOKEN || "";
const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 5 * 60;

function maxAgeSeconds(): number {
  const configured = Number(process.env.TG_INIT_DATA_MAX_AGE_SECONDS || DEFAULT_MAX_AGE_SECONDS);
  return Number.isFinite(configured) && configured >= 300
    ? Math.floor(configured)
    : DEFAULT_MAX_AGE_SECONDS;
}

function secureHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verifies Telegram Mini App initData (HMAC-SHA256 + auth_date freshness).
 * Returns the verified Telegram user or null for malformed, stale or tampered
 * payloads.
 */
export function verifyInitData(
  initData: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
} | null {
  if (!BOT_TOKEN || !initData) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash") || "";
    params.delete("hash");
    if (!hash) return null;

    const authDate = Number(params.get("auth_date"));
    if (!Number.isInteger(authDate)) return null;
    const age = nowSeconds - authDate;
    if (age > maxAgeSeconds() || age < -CLOCK_SKEW_SECONDS) return null;

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (!secureHexEqual(calculated, hash)) return null;

    const user = JSON.parse(params.get("user") || "{}") as Record<string, unknown>;
    if (!Number.isSafeInteger(user.id) || Number(user.id) <= 0) return null;
    return {
      id: Number(user.id),
      first_name: typeof user.first_name === "string" ? user.first_name : undefined,
      last_name: typeof user.last_name === "string" ? user.last_name : undefined,
      username: typeof user.username === "string" ? user.username : undefined,
      language_code: typeof user.language_code === "string" ? user.language_code : undefined,
    };
  } catch {
    return null;
  }
}

export function extractUserId(initData: string): number | null {
  return verifyInitData(initData)?.id ?? null;
}

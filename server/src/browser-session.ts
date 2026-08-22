import crypto from "node:crypto";

const VERSION = 1;
const TTL_SECONDS = 30 * 24 * 60 * 60;
/* Local development still gets secure, process-scoped sessions when no runtime
   secret is configured. Production normally derives this from TG_BOT_TOKEN or
   should set BROWSER_SESSION_SECRET explicitly. */
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString("hex");

function sessionSecret(): string {
  return (
    process.env.BROWSER_SESSION_SECRET ||
    process.env.TG_BOT_TOKEN ||
    process.env.DELIS_DEV_ADMIN_TOKEN ||
    EPHEMERAL_SECRET
  );
}

function sign(encodedPayload: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
}

function browserUserId(sessionId: string): number {
  const digest = crypto.createHash("sha256").update(`delis-browser:${sessionId}`).digest();
  // Negative 48-bit IDs cannot collide with positive Telegram IDs and remain
  // exactly representable by JavaScript and SQLite INTEGER.
  return -(digest.readUIntBE(0, 6) + 1);
}

export function issueBrowserSession(nowMs = Date.now()): { token: string; userId: number; expiresAt: string } {
  const id = crypto.randomBytes(16).toString("hex");
  const exp = Math.floor(nowMs / 1000) + TTL_SECONDS;
  const encoded = Buffer.from(JSON.stringify({ v: VERSION, id, exp }), "utf8").toString("base64url");
  return {
    token: `${encoded}.${sign(encoded)}`,
    userId: browserUserId(id),
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyBrowserSession(token: string, nowMs = Date.now()): number | null {
  try {
    const [encoded, suppliedSignature, extra] = String(token || "").split(".");
    if (!encoded || !suppliedSignature || extra) return null;
    const expectedSignature = sign(encoded);
    const supplied = Buffer.from(suppliedSignature, "utf8");
    const expected = Buffer.from(expectedSignature, "utf8");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      v?: number;
      id?: string;
      exp?: number;
    };
    if (payload.v !== VERSION || !/^[a-f0-9]{32}$/.test(payload.id || "")) return null;
    if (!Number.isInteger(payload.exp) || Number(payload.exp) <= Math.floor(nowMs / 1000)) return null;
    return browserUserId(payload.id!);
  } catch {
    return null;
  }
}

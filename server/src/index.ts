/**
 * DELIS — Fastify API: заказы, товары, платежи и Telegram initData-авторизация.
 */
import "dotenv/config";
import crypto from "crypto";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import { getDb, getDbPath, checkpointDb } from "./db.js";
import { verifyInitData, extractUserId } from "./auth.js";
import { issueBrowserSession, verifyBrowserSession } from "./browser-session.js";
import { seedOnStart } from "./seed-runner.js";
import { computeTotals, WHOLESALE_TIERS } from "./pricing.js";
import { CART_NUDGE, WELCOME_OFFER } from "./growth-offers.js";
import {
  DEFAULT_LOYALTY_CONFIG,
  adjustLoyaltyBalance,
  cashbackPercentForStars,
  claimBirthdayReward,
  claimLoyaltyMission,
  ensureLoyaltyCard,
  getLoyaltyConfig,
  getLoyaltySummary,
  normalizeLoyaltyCode,
  recordLoyaltyEvent,
  rotateLoyaltyCard,
  saveLoyaltyConfig,
  syncLoyaltyTier,
  type LoyaltyConfig,
} from "./loyalty.js";
import { startBot, notifyOrderStatus, notifyWaitlist, notifyAdminNewOrder, notifyAdminSupportMessage, notifyReturnStatus, broadcastToCustomers, fulfillOrder, getBotApi, esc } from "./bot.js";
import { supabaseConfigured, ensureBucket, ensureImageBucket, downloadDb, uploadDb, uploadProductImage } from "./supabase-store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3001);
const BOT_TOKEN = process.env.TG_BOT_TOKEN || "";

/* ─────────────── Payment credentials: ENV *or* admin panel ───────────────
 * The owner should only ever have to paste keys — nothing else. Two equal
 * ways to do it, so no redeploy and no code change is ever needed:
 *   1. Render → Environment (PAYME_… / CLICK_… variables) — read at runtime;
 *   2. Bot admin panel → tab «Платежи» — stored in content_settings and
 *      applied instantly (admin values win over ENV when both are set).
 * Secrets never leave the server: the API only returns masked values. */
const PAYMENT_CONFIG_KEY = "payment_config";

export type PaymentField =
  | "paymeMerchantId"
  | "paymeKey"
  | "clickServiceId"
  | "clickMerchantId"
  | "clickSecret";

const PAYMENT_FIELDS: PaymentField[] = [
  "paymeMerchantId",
  "paymeKey",
  "clickServiceId",
  "clickMerchantId",
  "clickSecret",
];

/** ENV names per field (first non-empty wins) — keeps old deployments working. */
const PAYMENT_ENV_KEYS: Record<PaymentField, string[]> = {
  paymeMerchantId: ["PAYME_MERCHANT_ID"],
  paymeKey: ["PAYME_KEY", "PAYME_SECRET"],
  clickServiceId: ["CLICK_SERVICE_ID"],
  clickMerchantId: ["CLICK_MERCHANT_ID"],
  clickSecret: ["CLICK_SECRET"],
};

/** Fields that must never be echoed back to any client, even to the admin. */
const PAYMENT_SECRET_FIELDS = new Set<PaymentField>(["paymeKey", "clickSecret"]);

function paymentEnvValue(field: PaymentField): string {
  for (const key of PAYMENT_ENV_KEYS[field]) {
    const value = (process.env[key] || "").trim();
    if (value) return value;
  }
  return "";
}

/** Admin-panel overrides (content_settings → payment_config). */
function storedPaymentConfig(): Partial<Record<PaymentField, string>> {
  try {
    if (!db) return {};
    const row = db.prepare("SELECT value_json FROM content_settings WHERE key = ?").get(PAYMENT_CONFIG_KEY) as
      | { value_json: string }
      | undefined;
    if (!row?.value_json) return {};
    const parsed = JSON.parse(row.value_json) as Record<string, unknown>;
    const out: Partial<Record<PaymentField, string>> = {};
    for (const field of PAYMENT_FIELDS) {
      const value = parsed[field];
      if (typeof value === "string" && value.trim()) out[field] = value.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function savePaymentConfig(next: Partial<Record<PaymentField, string>>) {
  db.prepare(`
    INSERT INTO content_settings (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
  `).run(PAYMENT_CONFIG_KEY, JSON.stringify(next));
}

/** Effective credentials: admin panel first, ENV as fallback. */
function paymentCreds(): Record<PaymentField, string> {
  const stored = storedPaymentConfig();
  const out = {} as Record<PaymentField, string>;
  for (const field of PAYMENT_FIELDS) out[field] = stored[field] || paymentEnvValue(field);
  return out;
}

/** Where each value came from — shown in the admin panel. */
function paymentCredSources(): Record<PaymentField, "admin" | "env" | "none"> {
  const stored = storedPaymentConfig();
  const out = {} as Record<PaymentField, "admin" | "env" | "none">;
  for (const field of PAYMENT_FIELDS) {
    out[field] = stored[field] ? "admin" : paymentEnvValue(field) ? "env" : "none";
  }
  return out;
}

/** Build a hosted checkout URL from server-side runtime configuration.
 * Merchant IDs are public, but keeping the URL generation here means Docker,
 * Render and Pages builds never need payment credentials baked into JS. */
type PublicPaymentMethod = "payme" | "click" | "cash" | "stars";

function paymentAvailability(): Record<PublicPaymentMethod, boolean> {
  const creds = paymentCreds();
  return {
    payme: Boolean(creds.paymeMerchantId && creds.paymeKey),
    click: Boolean(/^\d+$/.test(creds.clickServiceId) && creds.clickMerchantId && creds.clickSecret),
    cash: true,
    stars: Boolean(BOT_TOKEN),
  };
}

function paymentMethodAvailable(method: string): boolean {
  return method in paymentAvailability() && paymentAvailability()[method as PublicPaymentMethod];
}

function paymentUrl(method: string, orderId: string, amount: number): string | null {
  const creds = paymentCreds();
  if (method === "payme" && paymentAvailability().payme) {
    const params = `m=${creds.paymeMerchantId};ac.order_id=${orderId};a=${amount}00`;
    return `https://checkout.payme.uz/${Buffer.from(params, "utf8").toString("base64")}`;
  }
  if (method === "click" && paymentAvailability().click) {
    const query = new URLSearchParams({
      service_id: creds.clickServiceId,
      merchant_id: creds.clickMerchantId,
      amount: String(amount),
      transaction_param: orderId,
    });
    return `https://my.click.uz/services/pay?${query.toString()}`;
  }
  return null;
}

/** Order sum (UZS) above which delivery is free — mirrors the frontend CONFIG.
 *  Now admin-editable via /v1/admin/delivery-config (content_settings key delivery_config). */
const DEFAULT_FREE_SHIPPING_THRESHOLD = 150_000;
/** 1 ⭐ (Telegram Star) charged per this many UZS on Stars invoices. */
const STAR_PRICE_UZS = 1_000;

/* ─────────────── Delivery tariffs (admin-editable, stored in content_settings) ─────────────── */
const DELIVERY_CONFIG_KEY = "delivery_config";
const DEFAULT_TARIFFS: Record<string, { courier: number; bts: number; days: [number, number] }> = {
  namangan: { courier: 12000, bts: 9000, days: [1, 1] },
  fergana: { courier: 16000, bts: 11000, days: [1, 2] },
  andijan: { courier: 16000, bts: 11000, days: [1, 2] },
  tashkent_city: { courier: 20000, bts: 14000, days: [1, 2] },
  tashkent_reg: { courier: 24000, bts: 16000, days: [2, 3] },
  syrdarya: { courier: 26000, bts: 17000, days: [2, 3] },
  jizzakh: { courier: 28000, bts: 18000, days: [2, 3] },
  samarkand: { courier: 30000, bts: 19000, days: [2, 3] },
  navoi: { courier: 32000, bts: 21000, days: [2, 4] },
  kashkadarya: { courier: 36000, bts: 23000, days: [3, 4] },
  bukhara: { courier: 36000, bts: 23000, days: [3, 4] },
  surkhandarya: { courier: 42000, bts: 27000, days: [3, 5] },
  khorezm: { courier: 45000, bts: 29000, days: [3, 5] },
  karakalpakstan: { courier: 52000, bts: 33000, days: [4, 6] },
};
const DEFAULT_DELIVERY_CONFIG = {
  freeShippingThreshold: DEFAULT_FREE_SHIPPING_THRESHOLD,
  tariffs: DEFAULT_TARIFFS,
  defaultTariff: { courier: 30000, bts: 20000, days: [2, 4] as [number, number] },
};

function getDeliveryConfig(): typeof DEFAULT_DELIVERY_CONFIG {
  try {
    const row = db.prepare("SELECT value_json FROM content_settings WHERE key = ?").get(DELIVERY_CONFIG_KEY) as
      | { value_json: string }
      | undefined;
    if (!row) return DEFAULT_DELIVERY_CONFIG;
    const parsed = JSON.parse(row.value_json);
    if (typeof parsed.freeShippingThreshold === "number" && typeof parsed.tariffs === "object" && parsed.tariffs) {
      return {
        freeShippingThreshold: Math.max(0, Math.min(1_000_000, Math.round(parsed.freeShippingThreshold))),
        tariffs: parsed.tariffs,
        defaultTariff: parsed.defaultTariff || DEFAULT_DELIVERY_CONFIG.defaultTariff,
      };
    }
  } catch {}
  return DEFAULT_DELIVERY_CONFIG;
}
// Keep for backwards-compat: old code referenced FREE_SHIPPING_THRESHOLD constant
const FREE_SHIPPING_THRESHOLD = DEFAULT_FREE_SHIPPING_THRESHOLD;
const app = Fastify({
  logger: true,
  bodyLimit: 150_000_000,
  /* Behind Render/any reverse proxy every user shares the proxy IP — without
     trustProxy the rate-limiter would put ALL customers into one 120 req/min
     bucket. Read the real client IP from X-Forwarded-For instead. */
  trustProxy: true,
});

// Click sends application/x-www-form-urlencoded — Fastify only parses JSON by default.
app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
  try {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  } catch (e) {
    done(e as Error);
  }
});

await app.register(cors, {
  /* The Mini App loads from APP_URL, but previews/dev run on other hosts —
     allow known safe origins explicitly (auth itself is HMAC initData). */
  origin: [
    process.env.APP_URL || "http://localhost:5173",
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    /\.e2b\.app$/,
    /\.vercel\.app$/,
    /\.workers\.dev$/,
    /\.github\.io$/,
    // Production custom domains (static frontend ↔ Render API)
    /^https:\/\/([a-z0-9-]+\.)?delis\.uz$/,
  ],
  credentials: true,
});

// Basic abuse protection. A Mini App boot performs many parallel reads, and
// several household users can share one carrier/NAT IP, so keep the general
// read budget generous while order/session routes retain stricter limits.
await app.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute",
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: "Too Many Requests",
    message: "Too many requests — please slow down.",
  }),
});

// Baseline browser hardening without a CSP that would break Telegram's bridge,
// hosted payment redirects or product media configured by the administrator.
app.addHook("onSend", async (_req, reply, payload) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("Permissions-Policy", "camera=(self), geolocation=(self), microphone=()");
  reply.header("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  return payload;
});

/* ─────────────── Zod validation schemas ─────────────── */

const orderSchema = z.object({
  /* Client-supplied money fields are IGNORED server-side — prices, discount and
     total are always recomputed from the database. Kept only for backwards
     compatibility with older app builds. */
  subtotal: z.number().int().min(0).max(100_000_000).optional(),
  discount: z.number().int().min(0).max(100_000_000).optional(),
  promoCode: z.string().max(40).optional(),
  /** Gift certificate code — validated & redeemed server-side. */
  certCode: z.string().max(40).optional(),
  deliveryFee: z.number().int().min(0).max(100_000_000).optional(),
  total: z.number().int().min(0).max(1_000_000_000).optional(),
  recipient: z.object({
    name: z.string().min(1).max(120),
    phone: z.string().min(7).max(40),
  }),
  delivery: z.object({
    method: z.enum(["courier_uzb", "bts_express", "pickup"]),
    zone: z.string().max(120).optional(),
    address: z.string().max(400),
    time: z.string().max(120).optional(),
    note: z.string().max(300).optional(),
  }),
  payment: z.object({
    method: z.enum(["cash", "payme", "click", "paynet", "uzum", "card_uz", "card_intl", "stars"]),
  }),
  items: z.array(z.object({
    id: z.string().min(1).max(60),
    qty: z.number().int().min(1).max(999),
    price: z.number().int().min(0).max(100_000_000).optional(), // ignored — DB price used
  })).min(1).max(100),
});

let db: ReturnType<typeof getDb>;

/** Initialize the DB handle — used by start() and by tests (without listen). */
export function ensureDb(): ReturnType<typeof getDb> {
  if (!db) db = getDb();
  return db;
}

app.get("/health", async () => ({
  ok: true,
  service: "delis-api",
  timestamp: new Date().toISOString(),
}));

/** Signed anonymous browser identity for Payme, Click and cash checkout.
 * The opaque token owns the resulting order without exposing sequential IDs.
 * Telegram Stars still requires verified Telegram initData. */
app.post("/v1/auth/browser-session", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (_req, reply) => {
  const session = issueBrowserSession();
  reply.header("Cache-Control", "no-store");
  return { token: session.token, expiresAt: session.expiresAt };
});

/** Public capability flags only — credentials never leave the server. */
app.get("/v1/payment-methods", async (_req, reply) => {
  reply.header("Cache-Control", "no-store");
  return paymentAvailability();
});

/* ─────────────── ADMIN: payment keys (paste & go) ─────────────── */

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 6) return "••••";
  return `••••${value.slice(-4)}`;
}

/** Public origin of THIS API — used to print ready-to-paste webhook URLs. */
function publicApiBase(req: any): string {
  const explicit = (process.env.PUBLIC_API_URL || process.env.API_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "https").split(",")[0].trim();
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "").split(",")[0].trim();
  return host ? `${proto}://${host}` : "";
}

function paymentAdminState(req: any) {
  const creds = paymentCreds();
  const sources = paymentCredSources();
  const base = publicApiBase(req);
  return {
    availability: paymentAvailability(),
    fields: PAYMENT_FIELDS.map((id) => ({
      id,
      secret: PAYMENT_SECRET_FIELDS.has(id),
      configured: Boolean(creds[id]),
      source: sources[id],
      // Merchant/service IDs are public identifiers → returned as-is.
      // Keys/secrets are ALWAYS masked, even for the admin.
      value: PAYMENT_SECRET_FIELDS.has(id) ? maskSecret(creds[id]) : creds[id],
    })),
    webhooks: {
      payme: base ? `${base}/v1/webhooks/payme` : "",
      click: base ? `${base}/v1/webhooks/click` : "",
    },
    baseUrl: base,
    botToken: Boolean(BOT_TOKEN),
    adminChatId: Boolean(Number(process.env.ADMIN_CHAT_ID || 0)),
    appUrl: (process.env.APP_URL || "").trim(),
  };
}

app.get("/v1/admin/payments", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  reply.header("Cache-Control", "no-store");
  return paymentAdminState(req);
});

/** Save keys typed in the admin panel.
 *  - field omitted        → keep the current value;
 *  - field = ""           → drop the admin override (falls back to ENV);
 *  - field = "some value" → use it immediately, no redeploy. */
const paymentConfigSchema = z.object({
  paymeMerchantId: z.string().max(200).optional(),
  paymeKey: z.string().max(400).optional(),
  clickServiceId: z.string().max(200).refine((value) => !value.trim() || /^\d+$/.test(value.trim()), "click_service_id_must_be_numeric").optional(),
  clickMerchantId: z.string().max(200).optional(),
  clickSecret: z.string().max(400).optional(),
});

app.put("/v1/admin/payments", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const parsed = paymentConfigSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_payment_config", details: parsed.error.flatten() });

  const next = { ...storedPaymentConfig() };
  for (const field of PAYMENT_FIELDS) {
    const incoming = parsed.data[field];
    if (incoming === undefined) continue;
    const value = incoming.trim();
    if (value) next[field] = value;
    else delete next[field];
  }
  savePaymentConfig(next);
  reply.header("Cache-Control", "no-store");
  return { ok: true, ...paymentAdminState(req) };
});

/** One-click «всё ли готово?» — no secrets in the response. */
app.post("/v1/admin/payments/self-check", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const creds = paymentCreds();
  const base = publicApiBase(req);
  const checks: Array<{ id: string; level: "ok" | "warn" | "fail"; title: string; detail: string }> = [];
  const add = (id: string, level: "ok" | "warn" | "fail", title: string, detail: string) =>
    checks.push({ id, level, title, detail });

  /* Payme */
  if (!creds.paymeMerchantId || !creds.paymeKey) {
    const missing = [!creds.paymeMerchantId && "Merchant ID", !creds.paymeKey && "Key"].filter(Boolean).join(", ");
    add("payme", "warn", "Payme", `Не заполнено: ${missing}. Метод скрыт в checkout.`);
  } else {
    const url = paymentUrl("payme", "SELFCHECK", 1000);
    add("payme", url ? "ok" : "fail", "Payme", url ? "Ключи на месте, ссылка оплаты формируется." : "Ключи есть, но ссылка не построилась.");
  }

  /* Click */
  if (!creds.clickServiceId || !creds.clickMerchantId || !creds.clickSecret) {
    const missing = [
      !creds.clickServiceId && "Service ID",
      !creds.clickMerchantId && "Merchant ID",
      !creds.clickSecret && "Secret",
    ].filter(Boolean).join(", ");
    add("click", "warn", "Click", `Не заполнено: ${missing}. Метод скрыт в checkout.`);
  } else if (!/^\d+$/.test(creds.clickServiceId)) {
    add("click", "fail", "Click", "Service ID должен состоять только из цифр — Click пришлёт «wrong_service».");
  } else {
    const url = paymentUrl("click", "SELFCHECK", 1000);
    add("click", url ? "ok" : "fail", "Click", url ? "Ключи на месте, ссылка оплаты формируется." : "Ключи есть, но ссылка не построилась.");
  }

  /* Telegram Stars + bot token */
  if (!BOT_TOKEN) {
    add("stars", "warn", "Telegram Stars", "TG_BOT_TOKEN не задан — Stars и уведомления недоступны.");
  } else {
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(6000) });
      const data = (await res.json()) as { ok?: boolean; result?: { username?: string } };
      if (data?.ok) add("stars", "ok", "Telegram Stars", `Бот @${data.result?.username || "?"} отвечает, Stars включены.`);
      else add("stars", "fail", "Telegram Stars", "Telegram отклонил TG_BOT_TOKEN — проверьте токен.");
    } catch {
      add("stars", "warn", "Telegram Stars", "Не удалось связаться с Telegram (сеть). Токен задан.");
    }
  }

  /* Webhooks the owner must paste in the provider cabinets */
  if (!base) add("webhooks", "warn", "Webhook-адреса", "Не удалось определить публичный адрес API. Задайте PUBLIC_API_URL.");
  else if (!base.startsWith("https://")) add("webhooks", "warn", "Webhook-адреса", `Адрес без https: ${base}. Payme и Click требуют https.`);
  else add("webhooks", "ok", "Webhook-адреса", `${base}/v1/webhooks/payme и ${base}/v1/webhooks/click`);

  /* Admin notifications */
  if (!Number(process.env.ADMIN_CHAT_ID || 0)) add("admin", "warn", "Уведомления", "ADMIN_CHAT_ID не задан — заказы не придут менеджеру в Telegram.");
  else add("admin", "ok", "Уведомления", "ADMIN_CHAT_ID задан, новые заказы уходят менеджеру.");

  reply.header("Cache-Control", "no-store");
  return {
    ok: checks.every((c) => c.level !== "fail"),
    ready: paymentAvailability(),
    checks,
  };
});

/* ─────────────── PUBLIC MANAGED CONTENT ─────────────── */

/* ─────────────── SITE SETTINGS (contacts & socials, admin-editable) ─────────────── */

/** Публичные контакты/соцсети, редактируемые из админки. Хранятся в
 *  content_settings под ключом "site_settings" (JSON-объект). */
const SITE_SETTINGS_KEY = "site_settings";
const SITE_SETTINGS_FIELDS = [
  "supportPhone", "supportPhone2", "supportEmail", "supportTg",
  "telegram", "instagram", "youtube",
] as const;

app.get("/v1/site-settings", async () => {
  const row = db.prepare("SELECT value_json FROM content_settings WHERE key = ?").get(SITE_SETTINGS_KEY) as
    | { value_json: string }
    | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value_json);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
});

app.post("/v1/admin/site-settings", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const body = req.body as Record<string, unknown>;
  if (!body || typeof body !== "object") {
    return reply.code(400).send({ error: "invalid_settings" });
  }
  const clean: Record<string, string> = {};
  for (const f of SITE_SETTINGS_FIELDS) {
    const v = body[f];
    if (typeof v === "string" && v.length <= 300) clean[f] = v.trim();
  }
  const json = JSON.stringify(clean);
  db.prepare(`
    INSERT INTO content_settings (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
  `).run(SITE_SETTINGS_KEY, json);
  return { ok: true, settings: clean };
});

/* ─────────────── DELIVERY CONFIG (tariffs + free-shipping threshold, admin-editable) ─────────────── */
app.get("/v1/delivery-config", async () => {
  return getDeliveryConfig();
});

const deliveryConfigSchema = z.object({
  freeShippingThreshold: z.number().int().min(0).max(1_000_000),
  tariffs: z.record(z.object({
    courier: z.number().int().min(0).max(500_000),
    bts: z.number().int().min(0).max(500_000),
    days: z.tuple([z.number().int().min(1).max(30), z.number().int().min(1).max(30)]),
  })),
  defaultTariff: z.object({
    courier: z.number().int().min(0).max(500_000),
    bts: z.number().int().min(0).max(500_000),
    days: z.tuple([z.number().int().min(1).max(30), z.number().int().min(1).max(30)]),
  }).optional(),
});

app.put("/v1/admin/delivery-config", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const parsed = deliveryConfigSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_delivery_config", details: parsed.error.flatten() });
  const cfg = parsed.data;
  const toStore = {
    freeShippingThreshold: cfg.freeShippingThreshold,
    tariffs: cfg.tariffs,
    defaultTariff: cfg.defaultTariff || DEFAULT_DELIVERY_CONFIG.defaultTariff,
  };
  db.prepare(`
    INSERT INTO content_settings (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
  `).run(DELIVERY_CONFIG_KEY, JSON.stringify(toStore));
  return { ok: true, config: toStore };
});

app.get("/v1/admin/delivery-config", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  return getDeliveryConfig();
});

app.get("/v1/content", async () => {
  const row = db.prepare("SELECT value_json, updated_at FROM content_settings WHERE key = ?").get("home_content") as
    | { value_json: string; updated_at: string }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value_json);
  } catch {
    return null;
  }
});

/* ─────────────── COMMUNITY STORIES ─────────────── */

app.get("/v1/stories", async () => {
  // Instagram-style: stories live for 24 hours, then expire automatically.
  return db.prepare(`
    SELECT s.*, u.first_name, u.username, u.phone
    FROM stories s
    LEFT JOIN users u ON u.tg_id = s.tg_id
    WHERE s.status = 'approved'
      AND s.created_at >= datetime('now', '-1 day')
    ORDER BY s.created_at DESC
    LIMIT 50
  `).all();
});

/* A customer deletes their OWN story (owner-only). */
app.delete("/v1/stories/:id", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const id = String((req.params as { id: string }).id);
  const row = db.prepare("SELECT tg_id FROM stories WHERE id = ?").get(id) as { tg_id?: number } | undefined;
  if (!row) return reply.code(404).send({ error: "not_found" });
  if (Number(row.tg_id) !== tgId) return reply.code(403).send({ error: "forbidden" });
  db.prepare("DELETE FROM stories WHERE id = ?").run(id);
  return { ok: true };
});

app.post("/v1/stories", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  ensureUserFromReq(req, tgId);
  const body = req.body as { title?: string; description?: string; media?: string; mediaKind?: string; phone?: string };
  if (!body.title || !body.media) return reply.code(400).send({ error: "invalid_story" });
  if (body.phone) {
    db.prepare("UPDATE users SET phone = ? WHERE tg_id = ?").run(body.phone.slice(0, 40), tgId);
  }
  const id = `story-${Date.now()}-${tgId}`;
  db.prepare(`
    INSERT INTO stories (id, tg_id, title, description, media, media_kind, role, status)
    VALUES (?, ?, ?, ?, ?, ?, 'customer', 'pending')
  `).run(id, tgId, body.title.slice(0, 120), (body.description || "").slice(0, 500), body.media, body.mediaKind === "video" ? "video" : "image");
  return { ok: true, id, status: "pending" };
});

/* ─────────────── Helper: get lang from query or DB ─────────────── */

function getLang(req: any): "uz" | "ru" | "en" {
  const q = (req.query?.lang || "").toLowerCase();
  if (q === "ru" || q === "en") return q;
  return "uz";
}

function getUserId(req: any): number | null {
  const initData = req.headers["authorization"]?.replace("Telegram ", "") || "";
  const id = extractUserId(initData);
  if (id) return id;
  const browserId = verifyBrowserSession(String(req.headers["x-delis-browser-session"] || ""));
  if (browserId) return browserId;
  /* Dev/preview shortcut: lets a plain browser act as the admin so the panel
     can be tested outside Telegram. Active ONLY when DELIS_DEV_ADMIN_TOKEN is
     explicitly set — never set it in production. */
  const devToken = process.env.DELIS_DEV_ADMIN_TOKEN;
  if (devToken && req.headers["x-delis-dev-admin"] === devToken) {
    return Number(process.env.ADMIN_CHAT_ID || 0) || null;
  }
  return null;
}

/** Full verified Telegram user (id + name + username) or null. */
function getTgUser(req: any) {
  const initData = String(req.headers["authorization"] || "").replace("Telegram ", "");
  return verifyInitData(initData);
}

/** ensureUser enriched with the request's verified Telegram profile. */
function ensureUserFromReq(req: any, tgId: number) {
  const u = getTgUser(req);
  ensureUser(tgId, u?.first_name, u?.username);
}

function ensureUser(tgId: number, name?: string, username?: string) {
  // Upsert: later calls with richer info (name/username) enrich the row.
  db.prepare(`
    INSERT INTO users (tg_id, first_name, username) VALUES (?, ?, ?)
    ON CONFLICT(tg_id) DO UPDATE SET
      first_name = CASE WHEN excluded.first_name != '' THEN excluded.first_name ELSE users.first_name END,
      username   = CASE WHEN excluded.username   != '' THEN excluded.username   ELSE users.username   END
  `).run(tgId, name || "", username || "");
}

/* ─────────────── PRODUCTS ─────────────── */

app.get("/v1/products", async (req, reply) => {
  const lang = getLang(req);
  const cat = (req.query as any)?.cat;
  const q = cat ? db.prepare("SELECT * FROM products WHERE active = 1 AND cat = ?").all(cat) : db.prepare("SELECT * FROM products WHERE active = 1").all();
  /* Social proof from the real order log (single aggregate query) */
  const soldRows: any = db.prepare(`
    SELECT oi.product_id AS id,
           SUM(CASE WHEN date(o.created_at) = date('now') THEN oi.qty ELSE 0 END) AS soldToday,
           SUM(oi.qty) AS soldTotal
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id AND o.status != 'canceled'
    GROUP BY oi.product_id
  `).all();
  const soldMap = new Map<string, { soldToday: number; soldTotal: number }>(
    soldRows.map((r: any) => [r.id, { soldToday: r.soldToday || 0, soldTotal: r.soldTotal || 0 }]),
  );
  return q.map((p: any) => ({
    id: p.id,
    cat: p.cat,
    price: p.price,
    name: p[`name_${lang}`] || p.name_uz,
    volume: p.volume,
    badge: p.badge,
    stock: p.stock,
    rating: p.rating,
    reviewsCount: p.reviews,
    img: p.img,
    soldToday: soldMap.get(p.id)?.soldToday || 0,
    soldTotal: soldMap.get(p.id)?.soldTotal || 0,
    features: (p[`features_${lang}`] || p.features_uz || "").split(",").filter(Boolean),
  }));
});

app.get("/v1/products/:id", async (req, reply) => {
  const lang = getLang(req);
  const p: any = db.prepare("SELECT * FROM products WHERE id = ?").get((req.params as any).id);
  if (!p) return reply.code(404).send({ error: "not_found" });
  return {
    id: p.id, cat: p.cat, price: p.price,
    name: p[`name_${lang}`] || p.name_uz,
    volume: p.volume, badge: p.badge, stock: p.stock,
    rating: p.rating, reviewsCount: p.reviews, img: p.img,
    features: (p[`features_${lang}`] || p.features_uz || "").split(",").filter(Boolean),
  };
});

/* ─────────────── USER / ME ─────────────── */

/** Issue (or reuse) a personal one-time welcome coupon for a brand-new
 *  Telegram customer. Only real Telegram users (positive id) qualify. The
 *  coupon is single-use, expires after WELCOME_OFFER.days and is capped by
 *  maxDiscount so it stays profitable for the seller. */
function ensureWelcomePromo(tgId: number): { code: string; percent: number; minSpend: number; maxDiscount: number; expiresAt: string } | null {
  if (!tgId || tgId <= 0) return null;
  // Only brand-new customers (never placed an order) get the welcome coupon.
  const hasOrders = db.prepare(
    "SELECT 1 FROM orders WHERE tg_id = ? AND status != 'canceled' LIMIT 1",
  ).get(tgId);
  if (hasOrders) return null;
  const existing = db.prepare(
    `SELECT code, expires_at FROM promo_codes
     WHERE tg_id = ? AND type = 'percent' AND value = ? AND active = 1
       AND single_use = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
     LIMIT 1`,
  ).get(tgId, WELCOME_OFFER.percent) as { code: string; expires_at: string } | undefined;
  if (existing) {
    return {
      code: existing.code, percent: WELCOME_OFFER.percent, minSpend: WELCOME_OFFER.minSpend,
      maxDiscount: WELCOME_OFFER.maxDiscount, expiresAt: existing.expires_at,
    };
  }
  const code = `HELLO-${tgId}`;
  db.prepare(
    `INSERT INTO promo_codes (code, type, value, min_spend, active, title_uz, title_ru, title_en, tg_id, single_use, expires_at, max_discount)
     VALUES (?, 'percent', ?, ?, 1, ?, ?, ?, ?, 1, datetime('now', ?), ?)`,
  ).run(
    code, WELCOME_OFFER.percent, WELCOME_OFFER.minSpend,
    `Yangi mijoz uchun ${WELCOME_OFFER.percent}% chegirma`,
    `Приветственная скидка ${WELCOME_OFFER.percent}%`,
    `${WELCOME_OFFER.percent}% welcome discount`,
    tgId, `+${WELCOME_OFFER.days} days`, WELCOME_OFFER.maxDiscount,
  );
  const row: any = db.prepare("SELECT expires_at FROM promo_codes WHERE code = ?").get(code);
  return {
    code, percent: WELCOME_OFFER.percent, minSpend: WELCOME_OFFER.minSpend,
    maxDiscount: WELCOME_OFFER.maxDiscount, expiresAt: row?.expires_at || "",
  };
}

app.get("/v1/me", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const initData = req.headers["authorization"]?.replace("Telegram ", "") || "";
  const tgUser = verifyInitData(initData);
  ensureUser(tgId, tgUser?.first_name, tgUser?.username);
  const u: any = db.prepare("SELECT * FROM users WHERE tg_id = ?").get(tgId);
  const welcome = ensureWelcomePromo(tgId);
  return {
    id: u.tg_id, name: u.first_name, username: u.username,
    stars: u.stars, tier: u.tier, language: u.language,
    isAdmin: u.tg_id === Number(process.env.ADMIN_CHAT_ID || 0),
    welcome: welcome ? { issued: true, ...welcome } : { issued: false },
  };
});

/** Public rules let every surface show the same server-authoritative tiers. */
app.get("/v1/loyalty-config", async () => getLoyaltyConfig(db));

/** Current DELIS Stars card, lifetime totals and the authenticated member's ledger. */
app.get("/v1/me/loyalty", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  ensureUserFromReq(req, tgId);
  const summary = getLoyaltySummary(db, tgId, getLang(req));
  if (!summary) return reply.code(404).send({ error: "not_found" });
  return summary;
});

app.post("/v1/me/loyalty/missions/:id/claim", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  ensureUserFromReq(req, tgId);
  const result = claimLoyaltyMission(db, tgId, String((req.params as any).id || ""), getLang(req));
  if (!result.ok) {
    const status = result.error === "mission_not_found" ? 404 : result.error === "mission_incomplete" ? 409 : 409;
    return reply.code(status).send(result);
  }
  return result;
});

app.post("/v1/me/loyalty/birthday/claim", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  ensureUserFromReq(req, tgId);
  const result = claimBirthdayReward(db, tgId);
  if (!result.ok) return reply.code(409).send(result);
  return result;
});

/* ─────────────── PROMO CODES ─────────────── */

app.get("/v1/promo/validate", async (req, reply) => {
  const code = ((req.query as any)?.code || "").toUpperCase().trim();
  const lang = getLang(req);
  const promo: any = db.prepare(
    "SELECT * FROM promo_codes WHERE code = ? AND active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))"
  ).get(code);
  if (!promo) return reply.code(404).send({ valid: false, error: "invalid" });
  // Personal coupon (stars-shop) — only its owner may even see it
  if (promo.tg_id) {
    const tgId = getUserId(req);
    if (tgId !== promo.tg_id) return reply.code(404).send({ valid: false, error: "invalid" });
  }
  return {
    valid: true,
    code: promo.code,
    type: promo.type,
    value: promo.value,
    minSpend: promo.min_spend,
    maxDiscount: promo.max_discount || null,
    requiredProductId: promo.required_product_id || null,
    personal: !!promo.tg_id,
    retailOnly: !!promo.tg_id,
    singleUse: !!promo.single_use,
    title: promo[`title_${lang}`] || promo.title_uz,
  };
});

/* Public list of ACTIVE SHARED promos — personal stars coupons (tg_id) never leak here. */
app.get("/v1/promos", async () => {
  return db.prepare(`
    SELECT code, type, value, min_spend AS minSpend,
           title_uz, title_ru, title_en, active
    FROM promo_codes
    WHERE active = 1 AND tg_id IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY code
  `).all();
});

/* Admin: full DB backup — JSON dump of every SQLite table (sqlite_master driven). */
app.get("/v1/admin/backup", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  const dump: Record<string, unknown> = { _app: "delis", _version: 1, _exported_at: new Date().toISOString() };
  for (const { name } of tables) {
    try {
      dump[name] = db.prepare(`SELECT * FROM \"${name.replace(/\"/g, '\"\"')}\"`).all();
    } catch { /* table may be virtual or unreadable — skip */ }
  }
  const json = JSON.stringify(dump, null, 2);
  reply.header("Content-Type", "application/json; charset=utf-8");
  reply.header("Content-Disposition", `attachment; filename="DELIS_backup_${new Date().toISOString().slice(0, 10)}.json"`);
  return reply.send(json);
});

/* Admin: full order export as CSV (Excel-friendly, UTF-8 BOM). */
app.get("/v1/admin/orders.csv", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const rows: any = db.prepare(`
    SELECT o.id, o.created_at, o.status, o.payment_method, o.payment_status,
           o.recipient_name, o.recipient_phone, o.delivery_method, o.delivery_zone, o.delivery_address,
           o.subtotal, o.discount, o.promo_code, o.delivery_fee, o.total, o.customer_username,
           (SELECT GROUP_CONCAT(pi.qty || 'x ' || pi.product_id, '; ')
              FROM order_items pi WHERE pi.order_id = o.id) AS items
    FROM orders o ORDER BY o.created_at DESC
  `).all();
  const escCsv = (v: unknown) => {
    const s = String(v ?? "");
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = "id,created_at,status,payment_method,payment_status,customer,username,phone,delivery,zone,address,items,subtotal,discount,promo,delivery_fee,total";
  const lines = rows.map((o: any) => [
    o.id, o.created_at, o.status, o.payment_method, o.payment_status,
    o.recipient_name, o.customer_username ? `@${o.customer_username}` : "", o.recipient_phone,
    o.delivery_method, o.delivery_zone, o.delivery_address, o.items,
    o.subtotal, o.discount, o.promo_code || "", o.delivery_fee, o.total,
  ].map(escCsv).join(","));
  const csv = "﻿" + header + "\n" + lines.join("\n") + "\n";
  reply.header("Content-Type", "text/csv; charset=utf-8");
  reply.header("Content-Disposition", `attachment; filename="delis-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  return reply.send(csv);
});

/* ─────────────── ADMIN: free auto-translation (Google Translate, no API key) ─────────────── */
/* No OPENAI_API_KEY needed — uses the public Google Translate web endpoint.
 * Always works on any deployment at no cost. Falls back to the source text
 * only if the network call fails. */
const TRANSLATE_LANGS = ["uz", "ru", "en"] as const;
type TranslateLang = (typeof TRANSLATE_LANGS)[number];

const translateSchema = z.object({
  text: z.string().min(1).max(2000),
  from: z.enum(TRANSLATE_LANGS as unknown as [TranslateLang, ...TranslateLang[]]),
  to: z.array(z.enum(TRANSLATE_LANGS as unknown as [TranslateLang, ...TranslateLang[]])).min(1).max(3),
});

async function translateOne(text: string, from: TranslateLang, to: TranslateLang): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return text;
    const data: any = await resp.json();
    // Google returns [[["translated","original",...], ...], ...]
    const segments: string[] = Array.isArray(data?.[0]) ? data[0].map((s: any) => String(s?.[0] || "")).filter(Boolean) : [];
    return segments.join("").trim() || text;
  } catch {
    return text;
  }
}

app.post("/v1/admin/translate", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const parsed = translateSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_translate", details: parsed.error.flatten() });
  const { text, from, to } = parsed.data;
  const translations: Record<string, string> = { [from]: text };
  for (const lang of to) {
    if (lang === from) { translations[lang] = text; continue; }
    translations[lang] = await translateOne(text, from, lang);
  }
  return { ok: true, hasKey: true, translations };
});

app.get("/v1/admin/status", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  return {
    ok: true,
    supabase: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY,
    gpt: true, // free Google Translate — always available, no key needed
    port: Number(process.env.PORT || 3001),
    tz: process.env.TZ || "UTC",
  };
});


/* ─────────────── ADMIN: manage promo codes ─────────────── */

const promoUpsertSchema = z.object({
  code: z.string().min(2).max(40).regex(/^[A-Z0-9_-]+$/i),
  type: z.enum(["percent", "fixed", "freeship"]),
  value: z.number().int().min(0).max(100_000_000),
  minSpend: z.number().int().min(0).max(100_000_000).default(0),
  maxDiscount: z.number().int().min(0).max(100_000_000).optional(),
  requiredProductId: z.string().max(80).nullable().optional(),
  active: z.boolean().default(true),
  titles: z.object({
    uz: z.string().max(120).optional(),
    ru: z.string().max(120).optional(),
    en: z.string().max(120).optional(),
  }).partial().optional(),
});

app.get("/v1/admin/promos", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  return db.prepare(`
    SELECT code, type, value, min_spend AS minSpend,
           max_discount AS maxDiscount, required_product_id,
           title_uz, title_ru, title_en, active
    FROM promo_codes ORDER BY code
  `).all();
});

app.post("/v1/admin/promos", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const parsed = promoUpsertSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_promo", details: parsed.error.flatten() });
  const p = parsed.data;
  const code = p.code.toUpperCase().trim();
  if (p.type === "percent" && (p.value < 1 || p.value > 90)) {
    return reply.code(400).send({ error: "invalid_percent", message: "percent must be 1..90" });
  }
  const title = p.titles || {};
  db.prepare(`
    INSERT INTO promo_codes (code, type, value, min_spend, max_discount, required_product_id, active, title_uz, title_ru, title_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      type                = excluded.type,
      value               = excluded.value,
      min_spend           = excluded.min_spend,
      max_discount        = excluded.max_discount,
      required_product_id = excluded.required_product_id,
      active              = excluded.active,
      title_uz            = COALESCE(excluded.title_uz, promo_codes.title_uz),
      title_ru            = COALESCE(excluded.title_ru, promo_codes.title_ru),
      title_en            = COALESCE(excluded.title_en, promo_codes.title_en)
  `).run(
    code, p.type, p.value, p.minSpend, p.maxDiscount ?? null, p.requiredProductId ?? null, p.active ? 1 : 0,
    title.uz || null, title.ru || null, title.en || null,
  );
  return { ok: true, code };
});

app.delete("/v1/admin/promos/:code", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const code = String((req.params as any).code || "").toUpperCase();
  const res = db.prepare("DELETE FROM promo_codes WHERE code = ?").run(code);
  if (res.changes === 0) return reply.code(404).send({ error: "not_found" });
  return { ok: true };
});

/* ─────────────── FAVORITES ─────────────── */

app.get("/v1/me/favorites", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const rows: any = db.prepare("SELECT product_id FROM favorites WHERE tg_id = ?").all(tgId);
  return rows.map((r: any) => r.product_id);
});

app.post("/v1/me/favorites/:productId", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  ensureUserFromReq(req, tgId);
  const pid = String((req.params as any).productId || "");
  const product = db.prepare("SELECT 1 FROM products WHERE id = ? AND active = 1").get(pid);
  if (!product) return reply.code(404).send({ error: "product_not_found" });
  const exists: any = db.prepare("SELECT 1 FROM favorites WHERE tg_id = ? AND product_id = ?").get(tgId, pid);
  if (exists) {
    db.prepare("DELETE FROM favorites WHERE tg_id = ? AND product_id = ?").run(tgId, pid);
    return { favorited: false };
  } else {
    db.prepare("INSERT INTO favorites (tg_id, product_id) VALUES (?, ?)").run(tgId, pid);
    return { favorited: true };
  }
});

/* ─────────────── WAITLIST (back-in-stock notifications) ─────────────── */

const waitlistJoinSchema = z.object({
  productId: z.string().min(1).max(60),
  qty: z.number().int().min(1).max(99).default(1),
  phone: z.string().max(32).optional(),
  language: z.enum(["uz", "ru", "en"]).default("uz"),
});

app.post("/v1/waitlist", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const parsed = waitlistJoinSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid_waitlist", details: parsed.error.flatten() });
  }
  const { productId, qty, phone, language } = parsed.data;
  const product: any = db.prepare("SELECT id FROM products WHERE id = ?").get(productId);
  if (!product) return reply.code(404).send({ error: "product_not_found" });
  ensureUserFromReq(req, tgId);
  db.prepare(`
    INSERT INTO waitlist (tg_id, product_id, qty, phone, language)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(tg_id, product_id) DO UPDATE SET
      qty = excluded.qty,
      phone = excluded.phone,
      language = excluded.language,
      notified_at = NULL
  `).run(tgId, productId, qty, phone || null, language);
  return { ok: true, joined: true, productId };
});

app.get("/v1/me/waitlist", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const rows: any = db.prepare(`
    SELECT w.product_id AS productId, w.qty, w.notified_at AS notifiedAt, w.created_at AS createdAt,
           p.name_uz, p.name_ru, p.name_en, p.price, p.stock
    FROM waitlist w JOIN products p ON p.id = w.product_id
    WHERE w.tg_id = ? ORDER BY w.created_at DESC
  `).all(tgId);
  return rows.map((r: any) => ({
    productId: r.productId, qty: r.qty, notified: !!r.notifiedAt, createdAt: r.createdAt,
    name: { uz: r.name_uz, ru: r.name_ru || r.name_uz, en: r.name_en || r.name_uz },
    price: r.price, inStock: r.stock > 0,
  }));
});

app.delete("/v1/me/waitlist/:productId", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  db.prepare("DELETE FROM waitlist WHERE tg_id = ? AND product_id = ?").run(tgId, (req.params as any).productId);
  return { ok: true };
});

/* Admin: see who's waiting for restocks & trigger notifications manually */
app.get("/v1/admin/waitlist", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const rows: any = db.prepare(`
    SELECT w.id, w.tg_id AS tgId, w.product_id AS productId, w.qty, w.phone,
           w.notified_at AS notifiedAt, w.created_at AS createdAt,
           p.name_uz, p.name_ru, p.name_en, u.first_name AS firstName, u.username
    FROM waitlist w
    JOIN products p ON p.id = w.product_id
    LEFT JOIN users u ON u.tg_id = w.tg_id
    ORDER BY w.created_at DESC LIMIT 500
  `).all();
  return rows.map((r: any) => ({
    id: r.id, tgId: r.tgId, productId: r.productId, qty: r.qty, phone: r.phone,
    notified: !!r.notifiedAt, createdAt: r.createdAt,
    productName: { uz: r.name_uz, ru: r.name_ru || r.name_uz, en: r.name_en || r.name_uz },
    customer: r.username ? `@${r.username}` : (r.firstName || null),
  }));
});

app.post("/v1/admin/waitlist/notify", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const productId = String((req.body as any)?.productId || "");
  if (!productId) return reply.code(400).send({ error: "product_id_required" });
  const notified = await notifyWaitlist(db, productId);
  return { ok: true, notified };
});

/* ─────────────── STARS SHOP (server-side redemption) ─────────────── */

/**
 * The authoritative rewards catalog — the client mirrors these ids/costs,
 * but star debit + coupon creation happen ONLY here, inside one transaction.
 */
type StarsRewardDef = {
  id: string;
  active: boolean;
  cost: number;
  kind: "percent" | "freeship" | "gift";
  value?: number;      // percent for kind=percent
  productId?: string;  // gift product for kind=gift
  minSpend: number;
  maxDiscount?: number; // hard UZS cap for percent/delivery rewards
  expiresInDays: number;
  titles: { uz: string; ru: string; en: string };
  subtitles: { uz: string; ru: string; en: string };
};
type RewardEconomics = {
  averageCourierCost: number;
  averageBtsCost: number;
  paymentFeePercent: number;
  targetMarginPercent: number;
  fallbackCostPercent: number;
  profitGuardEnabled: boolean;
};
type StarsRewardConfig = {
  enabled: boolean;
  rewards: StarsRewardDef[];
  economics: RewardEconomics;
};
const STARS_REWARD_CONFIG_KEY = "stars_reward_config";
const DEFAULT_STARS_REWARD_CONFIG: StarsRewardConfig = {
  enabled: true,
  economics: {
    averageCourierCost: 30_000,
    averageBtsCost: 20_000,
    paymentFeePercent: 2,
    targetMarginPercent: 25,
    fallbackCostPercent: 60,
    profitGuardEnabled: true,
  },
  rewards: [
    {
      id: "stars2", active: true, cost: 300, kind: "percent", value: 2, minSpend: 180_000, maxDiscount: 10_000, expiresInDays: 14,
      titles: { uz: "2% chegirma", ru: "Скидка 2%", en: "2% discount" },
      subtitles: { uz: "180 000 so'mdan · 10 000 gacha", ru: "От 180 000 сум · до 10 000", en: "From 180,000 UZS · up to 10,000" },
    },
    {
      id: "stars5", active: true, cost: 700, kind: "percent", value: 5, minSpend: 300_000, maxDiscount: 25_000, expiresInDays: 14,
      titles: { uz: "5% chegirma", ru: "Скидка 5%", en: "5% discount" },
      subtitles: { uz: "300 000 so'mdan · 25 000 gacha", ru: "От 300 000 сум · до 25 000", en: "From 300,000 UZS · up to 25,000" },
    },
    {
      id: "starship", active: true, cost: 900, kind: "freeship", minSpend: 130_000, maxDiscount: 20_000, expiresInDays: 14,
      titles: { uz: "Yetkazishga 20 000", ru: "20 000 на доставку", en: "20,000 toward delivery" },
      subtitles: { uz: "130 000 so'mlik buyurtmadan", ru: "При заказе от 130 000 сум", en: "On orders from 130,000 UZS" },
    },
    {
      id: "stargift", active: true, cost: 1000, kind: "gift", productId: "glass", minSpend: 350_000, expiresInDays: 14,
      titles: { uz: "Sovg'a: Glass №4", ru: "Подарок: Glass №4", en: "Gift: Glass №4" },
      subtitles: { uz: "350 000 so'mlik savatga qo'shiladi", ru: "Добавится к корзине от 350 000 сум", en: "Added to a basket from 350,000 UZS" },
    },
  ],
};

function getStarsRewardConfig(): StarsRewardConfig {
  const row = db.prepare("SELECT value_json FROM content_settings WHERE key = ?").get(STARS_REWARD_CONFIG_KEY) as { value_json?: string } | undefined;
  if (!row?.value_json) return DEFAULT_STARS_REWARD_CONFIG;
  try {
    const raw = JSON.parse(row.value_json) as Partial<StarsRewardConfig>;
    const overrides = new Map((Array.isArray(raw.rewards) ? raw.rewards : []).map((reward) => [reward.id, reward]));
    const economics = raw.economics || DEFAULT_STARS_REWARD_CONFIG.economics;
    return {
      enabled: raw.enabled !== false,
      economics: {
        averageCourierCost: Math.max(0, Number(economics.averageCourierCost ?? DEFAULT_STARS_REWARD_CONFIG.economics.averageCourierCost)),
        averageBtsCost: Math.max(0, Number(economics.averageBtsCost ?? DEFAULT_STARS_REWARD_CONFIG.economics.averageBtsCost)),
        paymentFeePercent: Math.max(0, Number(economics.paymentFeePercent ?? DEFAULT_STARS_REWARD_CONFIG.economics.paymentFeePercent)),
        targetMarginPercent: Math.max(0, Number(economics.targetMarginPercent ?? DEFAULT_STARS_REWARD_CONFIG.economics.targetMarginPercent)),
        fallbackCostPercent: Math.min(100, Math.max(0, Number(economics.fallbackCostPercent ?? DEFAULT_STARS_REWARD_CONFIG.economics.fallbackCostPercent))),
        profitGuardEnabled: economics.profitGuardEnabled !== false,
      },
      rewards: DEFAULT_STARS_REWARD_CONFIG.rewards.map((fallback) => {
        const override = overrides.get(fallback.id);
        return override ? { ...fallback, ...override, id: fallback.id, kind: fallback.kind, value: fallback.value, titles: fallback.titles, subtitles: fallback.subtitles } : fallback;
      }),
    };
  } catch {
    return DEFAULT_STARS_REWARD_CONFIG;
  }
}

function saveStarsRewardConfig(config: StarsRewardConfig) {
  db.prepare(`
    INSERT INTO content_settings (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
  `).run(STARS_REWARD_CONFIG_KEY, JSON.stringify(config));
}

const rewardAmount = (value: number) => Math.round(value).toLocaleString("ru-RU").replace(/\u00a0/g, " ");

function rewardTitles(reward: StarsRewardDef) {
  if (reward.kind === "gift" && reward.productId) {
    const product = db.prepare("SELECT name_uz, name_ru, name_en FROM products WHERE id = ?").get(reward.productId) as any;
    if (product) return {
      uz: `Sovg'a: ${product.name_uz || reward.productId}`,
      ru: `Подарок: ${product.name_ru || product.name_uz || reward.productId}`,
      en: `Gift: ${product.name_en || product.name_uz || reward.productId}`,
    };
  }
  if (reward.kind !== "freeship") return reward.titles;
  const value = rewardAmount(reward.maxDiscount || 0);
  return {
    uz: `Yetkazishga ${value}`,
    ru: `${value} на доставку`,
    en: `${value} toward delivery`,
  };
}

function rewardSubtitles(reward: StarsRewardDef) {
  const amount = rewardAmount;
  if (reward.kind === "percent") return {
    uz: `${amount(reward.minSpend)} so'mdan · ${amount(reward.maxDiscount || 0)} gacha`,
    ru: `От ${amount(reward.minSpend)} сум · до ${amount(reward.maxDiscount || 0)}`,
    en: `From ${amount(reward.minSpend)} UZS · up to ${amount(reward.maxDiscount || 0)}`,
  };
  if (reward.kind === "freeship") return {
    uz: `${amount(reward.minSpend)} so'mlik buyurtmadan`,
    ru: `При заказе от ${amount(reward.minSpend)} сум`,
    en: `On orders from ${amount(reward.minSpend)} UZS`,
  };
  return {
    uz: `${amount(reward.minSpend)} so'mlik savatga qo'shiladi`,
    ru: `Добавится к корзине от ${amount(reward.minSpend)} сум`,
    en: `Added to a basket from ${amount(reward.minSpend)} UZS`,
  };
}

function publicStarsRewards(config = getStarsRewardConfig()) {
  if (!config.enabled) return [];
  return config.rewards.filter((reward) => reward.active).map((reward) => ({
    id: reward.id, cost: reward.cost, kind: reward.kind, value: reward.value, productId: reward.productId,
    minSpend: reward.minSpend, maxDiscount: reward.maxDiscount, expiresInDays: reward.expiresInDays,
    retailOnly: true, titles: rewardTitles(reward), subtitles: rewardSubtitles(reward),
  }));
}

app.get("/v1/stars/rewards", async () => publicStarsRewards());

app.post("/v1/stars/redeem", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  ensureUserFromReq(req, tgId);
  const rewardConfig = getStarsRewardConfig();
  if (!rewardConfig.enabled) return reply.code(409).send({ error: "rewards_paused" });
  const rewardId = String((req.body as any)?.rewardId || "");
  const reward = rewardConfig.rewards.find((item) => item.id === rewardId && item.active);
  if (!reward) return reply.code(404).send({ error: "reward_not_found" });

  // Resolve coupon fields: gift → 'fixed' coupon worth the product's current price
  let promoType: "percent" | "freeship" | "fixed";
  let promoValue = 0;
  if (reward.kind === "percent") {
    promoType = "percent"; promoValue = reward.value!;
  } else if (reward.kind === "freeship") {
    promoType = "freeship";
  } else {
    const gift: any = db.prepare("SELECT id, price FROM products WHERE id = ? AND active = 1").get(reward.productId!);
    if (!gift) return reply.code(409).send({ error: "gift_unavailable" });
    promoType = "fixed"; promoValue = gift.price;
  }
  const resolvedTitles = rewardTitles(reward);

  const codeExists = db.prepare("SELECT 1 FROM promo_codes WHERE code = ?");
  const genCode = () => {
    // 6 chars, no ambiguous 0/O/1/I — e.g. ST-K7Q2MN
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (;;) {
      const suffix = Array.from(crypto.randomBytes(6)).map((b) => alphabet[b % alphabet.length]).join("");
      const code = `ST-${suffix}`;
      if (!codeExists.get(code)) return code;
    }
  };

  const tx = db.transaction(() => {
    // Atomic debit: fails cleanly when the balance raced below the cost
    const debit = db.prepare("UPDATE users SET stars = stars - ? WHERE tg_id = ? AND stars >= ?")
      .run(reward.cost, tgId, reward.cost);
    if (debit.changes === 0) throw new Error("insufficient_stars");
    const code = genCode();
    db.prepare(`
      INSERT INTO promo_codes
        (code, type, value, min_spend, max_discount, required_product_id, reward_id,
         active, title_uz, title_ru, title_en, tg_id, single_use, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 1, datetime('now', '+' || ? || ' days'))
    `).run(
      code, promoType, promoValue, reward.minSpend, reward.maxDiscount || null, reward.productId || null, reward.id,
      resolvedTitles.uz, resolvedTitles.ru, resolvedTitles.en, tgId, reward.expiresInDays,
    );
    recordLoyaltyEvent(db, {
      tgId,
      type: "spend",
      amount: reward.cost,
      source: "reward",
      referenceId: code,
    });
    syncLoyaltyTier(db, tgId);
    return code;
  });

  let code: string;
  try {
    code = tx();
  } catch (e) {
    if (String((e as Error)?.message) === "insufficient_stars") {
      const u: any = db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(tgId);
      return reply.code(402).send({ error: "insufficient_stars", stars: u?.stars || 0, cost: reward.cost });
    }
    throw e;
  }
  const u: any = db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(tgId);
  return {
    ok: true, code, rewardId, stars: u?.stars || 0,
    type: promoType, value: promoValue,
    minSpend: reward.minSpend, maxDiscount: reward.maxDiscount || null,
    requiredProductId: reward.productId || null, retailOnly: true,
    titles: rewardTitles(reward), subtitles: rewardSubtitles(reward), expiresInDays: reward.expiresInDays,
  };
});

/* ─────────────── SUBSCRIPTIONS (auto-reorder) ─────────────── */

const subSchema = z.object({
  productId: z.string().min(1).max(60),
  qty: z.number().int().min(1).max(999),
  frequency: z.number().int().min(7).max(180), // days between deliveries
});

app.get("/v1/me/subscriptions", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  return db.prepare(
    "SELECT id, product_id, qty, frequency, status, next_date FROM subscriptions WHERE tg_id = ? AND status = 'active' ORDER BY created_at DESC"
  ).all(tgId);
});

app.post("/v1/me/subscriptions", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const parsed = subSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_subscription" });
  const { productId, qty, frequency } = parsed.data;
  const product: any = db.prepare("SELECT id FROM products WHERE id = ? AND active = 1").get(productId);
  if (!product) return reply.code(404).send({ error: "product_not_found" });
  ensureUserFromReq(req, tgId);
  const id = `SUB-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const nextDate = new Date(Date.now() + frequency * 86400_000).toISOString().slice(0, 10);
  db.prepare(
    "INSERT INTO subscriptions (id, tg_id, product_id, qty, frequency, status, next_date) VALUES (?, ?, ?, ?, ?, 'active', ?)"
  ).run(id, tgId, productId, qty, frequency, nextDate);
  return { id, status: "active", next_date: nextDate };
});

app.delete("/v1/me/subscriptions/:id", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  // Owner-scoped — one user can't cancel another's subscription
  const res = db.prepare(
    "UPDATE subscriptions SET status = 'canceled' WHERE id = ? AND tg_id = ?"
  ).run((req.params as any).id, tgId);
  if (res.changes === 0) return reply.code(404).send({ error: "not_found" });
  return { ok: true };
});

/* ─────────────── ORDERS ─────────────── */

app.get("/v1/me/orders", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const lang = getLang(req);
  const orders: any = db.prepare(`
    SELECT o.*, u.username
    FROM orders o
    LEFT JOIN users u ON u.tg_id = o.tg_id
    WHERE o.tg_id = ?
    ORDER BY o.created_at DESC LIMIT 20
  `).all(tgId);
  return orders.map((o: any) => {
    const items: any = db.prepare("SELECT oi.*, p.name_uz, p.name_ru, p.name_en, p.img FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?").all(o.id);
    return {
      id: o.id, date: o.created_at, subtotal: o.subtotal, discount: o.discount,
      promoCode: o.promo_code, deliveryFee: o.delivery_fee, total: o.total,
      deliveryMethod: o.delivery_method, deliveryAddress: o.delivery_address,
      deliveryTime: o.delivery_time, recipientName: o.recipient_name,
      recipientPhone: o.recipient_phone, customerTgId: o.tg_id,
      customerSource: Number(o.tg_id) > 0 ? "telegram" : "browser",
      customerUsername: o.username, paymentMethod: o.payment_method,
      paymentStatus: o.payment_status, status: o.status,
      paymentUrl: paymentUrl(o.payment_method, o.id, Number(o.total)),
      items: items.map((it: any) => ({
        id: it.product_id, name: it[`name_${lang}`] || it.name_uz,
        qty: it.qty, price: it.price, img: it.img,
      })),
    };
  });
});

app.post("/v1/orders", {
  config: {
    rateLimit: {
      max: 15,
      timeWindow: "1 minute",
      // Limit per signed customer session, not per carrier-NAT/proxy IP.
      keyGenerator: (req: any) => crypto.createHash("sha256").update(String(
        req.headers["authorization"] || req.headers["x-delis-browser-session"] || req.ip,
      )).digest("hex"),
    },
  },
}, async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  ensureUserFromReq(req, tgId);

  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid_order", details: parsed.error.flatten() });
  }
  const body = parsed.data;
  if (tgId < 0 && body.payment.method === "stars") {
    return reply.code(400).send({ error: "telegram_required_for_stars" });
  }
  if (!paymentMethodAvailable(body.payment.method)) {
    return reply.code(503).send({ error: "payment_not_configured", method: body.payment.method });
  }

  /* ── Server-side pricing via pure module (unit-tested) — client money ignored ── */
  const prodStmt = db.prepare("SELECT id, price, cost_price, active, stock FROM products WHERE id = ?");
  const promoStmt = db.prepare(
    "SELECT code, type, value, min_spend, max_discount, required_product_id, reward_id, tg_id FROM promo_codes WHERE code = ? AND active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))"
  );
  const getPromoChecked = (code: string) => {
    const promo: any = promoStmt.get(code);
    // Personal Stars coupon — usable only by its owner and only on retail
    // quantities, so it cannot stack on top of the 12–35% wholesale ladder.
    if (promo && promo.tg_id && promo.tg_id !== tgId) return undefined;
    if (promo?.tg_id && body.items.some((item) => item.qty >= WHOLESALE_TIERS[0][0])) return undefined;
    return promo;
  };
  // Wholesale ladder lives in the DB (admin-editable), not in code.
  // Fallback to the baked-in ladder when the table wasn't seeded yet.
  const tierRows: any[] = db.prepare("SELECT min_qty, percent FROM wholesale_tiers ORDER BY min_qty ASC").all();
  const wholesaleTiers = tierRows.length
    ? tierRows.map((r) => [Number(r.min_qty), Number(r.percent)] as [number, number])
    : WHOLESALE_TIERS;

  // Gift certificate: must exist and be ACTIVE (admin activated it after payment)
  const certCode = body.certCode?.toUpperCase().trim();
  let cert: any = null;
  if (certCode) {
    cert = db.prepare("SELECT * FROM gift_certificates WHERE code = ?").get(certCode);
    if (!cert || cert.status !== "active") {
      return reply.code(400).send({ error: "invalid_certificate" });
    }
  }
  // ── Delivery fee: admin-editable tariffs (content_settings delivery_config) ──
  const deliveryConfig = getDeliveryConfig();
  // Map any localized zone name back to region id (client sends uz name like "Namangan viloyati")
  const zoneToId: Record<string, string> = {
    "namangan viloyati": "namangan", "наманганская область": "namangan", "namangan region": "namangan",
    "farg'ona viloyati": "fergana", "ферганская область": "fergana", "fergana region": "fergana",
    "andijon viloyati": "andijan", "андижанская область": "andijan", "andijan region": "andijan",
    "toshkent shahri": "tashkent_city", "г. ташкент": "tashkent_city", "tashkent city": "tashkent_city",
    "toshkent viloyati": "tashkent_reg", "ташкентская область": "tashkent_reg", "tashkent region": "tashkent_reg",
    "sirdaryo viloyati": "syrdarya", "сырдарьинская область": "syrdarya", "syrdarya region": "syrdarya",
    "jizzax viloyati": "jizzakh", "джизакская область": "jizzakh", "jizzakh region": "jizzakh",
    "samarqand viloyati": "samarkand", "самаркандская область": "samarkand", "samarkand region": "samarkand",
    "navoiy viloyati": "navoi", "навоийская область": "navoi", "navoi region": "navoi",
    "qashqadaryo viloyati": "kashkadarya", "кашкадарьинская область": "kashkadarya", "kashkadarya region": "kashkadarya",
    "buxoro viloyati": "bukhara", "бухарская область": "bukhara", "bukhara region": "bukhara",
    "surxondaryo viloyati": "surkhandarya", "сурхандарьинская область": "surkhandarya", "surkhandarya region": "surkhandarya",
    "xorazm viloyati": "khorezm", "хорезмская область": "khorezm", "khorezm region": "khorezm",
    "qoraqalpog'iston respublikasi": "karakalpakstan", "республика каракалпакстан": "karakalpakstan", "republic of karakalpakstan": "karakalpakstan",
  };
  const rawZone = String(body.delivery.zone || "").toLowerCase().trim();
  // Direct id match (e.g. "namangan") takes priority
  let regionId: string | null = null;
  if (deliveryConfig.tariffs[rawZone]) regionId = rawZone;
  else if (zoneToId[rawZone]) regionId = zoneToId[rawZone];
  // Also try to extract region id from address string fallback
  if (!regionId) {
    for (const [name, id] of Object.entries(zoneToId)) {
      if (rawZone.includes(name)) { regionId = id; break; }
    }
  }
  const tariff = (regionId && deliveryConfig.tariffs[regionId]) || deliveryConfig.defaultTariff || DEFAULT_DELIVERY_CONFIG.defaultTariff;
  const serverDeliveryHint = body.delivery.method === "bts_express" ? tariff.bts : tariff.courier;

  const priced = computeTotals({
    items: body.items,
    getProduct: (pid) => prodStmt.get(pid) as any,
    promoCode: body.promoCode,
    getPromo: getPromoChecked,
    deliveryMethod: body.delivery.method,
    deliveryFeeHint: serverDeliveryHint,
    freeShippingThreshold: deliveryConfig.freeShippingThreshold,
    wholesaleTiers,
    certificateAmount: cert ? Number(cert.amount) : 0,
    cartNudge: CART_NUDGE,
  });
  if (!priced.ok) {
    return reply.code(400).send(priced.err);
  }
  const { lines, subtotal, discount, deliveryFee, certApplied, promoBenefit, total } = priced.totals;

  // Profit guard for Stars rewards. Until every exact COGS value is entered,
  // missing costs use the deliberately conservative fallback percentage. The
  // guard only rejects the reward coupon — regular purchases remain available.
  const appliedPromo = body.promoCode ? getPromoChecked(body.promoCode.toUpperCase().trim()) as any : null;
  if (appliedPromo?.reward_id) {
    const rewardConfig = getStarsRewardConfig();
    if (rewardConfig.economics.profitGuardEnabled) {
      const productCost = lines.reduce((sum, line) => {
        const product = prodStmt.get(line.id) as any;
        const exactCost = Number(product?.cost_price || 0);
        const unitCost = exactCost > 0
          ? exactCost
          : Math.round(line.price * rewardConfig.economics.fallbackCostPercent / 100);
        return sum + unitCost * line.qty;
      }, 0);
      const fulfillmentCost = body.delivery.method === "pickup"
        ? 0
        : body.delivery.method === "bts_express"
          ? rewardConfig.economics.averageBtsCost
          : rewardConfig.economics.averageCourierCost;
      const feeCost = body.payment.method === "cash"
        ? 0
        : Math.round(total * rewardConfig.economics.paymentFeePercent / 100);
      const recognizedRevenue = total + certApplied;
      const estimatedProfit = recognizedRevenue - productCost - fulfillmentCost - feeCost;
      const marginPercent = recognizedRevenue > 0 ? estimatedProfit / recognizedRevenue * 100 : -100;
      if (marginPercent < rewardConfig.economics.targetMarginPercent) {
        return reply.code(409).send({
          error: "reward_margin_guard",
          targetMarginPercent: rewardConfig.economics.targetMarginPercent,
        });
      }
    }
  }

  /* ── Collision-safe public order id (DL-XXXX) ── */
  let id = "";
  const idExists = db.prepare("SELECT 1 FROM orders WHERE id = ?");
  for (let attempt = 0; attempt < 10 && !id; attempt++) {
    const candidate = `DL-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!idExists.get(candidate)) id = candidate;
  }
  if (!id) id = `DL-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  // Customer identity from the signed Telegram initData header
  const tgUser = verifyInitData(String(req.headers["authorization"] || "").replace("Telegram ", ""));
  const customerUsername = tgUser?.username || null;
  const customerName = tgUser?.first_name || null;

  /* ── ATOMIC: order + items + stock decrement all-or-nothing ── */
  const stockStmt = db.prepare(`
    UPDATE products SET stock = stock - ?
    WHERE id = ? AND (stock = 0 OR stock >= ?)
  `);
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, tg_id, subtotal, discount, promo_code, delivery_fee, total,
      delivery_method, delivery_zone, delivery_address, delivery_time,
      recipient_name, recipient_phone, payment_method, payment_status, status,
      customer_username, customer_name, cert_code, cert_applied, promo_benefit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare("INSERT INTO order_items (order_id, product_id, qty, price, cost_price, stock_taken) VALUES (?, ?, ?, ?, ?, ?)");

  const createTx = db.transaction(() => {
    const stockTaken: Record<string, number> = {};
    for (const l of lines) {
      // Double-checked under the transaction: stock=0 → made-to-order (no decrement);
      // stock>0 must still cover the qty, else the sale is aborted.
      if (l.qty > 0) {
        const p: any = prodStmt.get(l.id);
        if (p && p.stock > 0) {
          const res = stockStmt.run(l.qty, l.id, l.qty);
          if (res.changes === 0) throw new Error(`insufficient_stock:${l.id}`);
          stockTaken[l.id] = 1;
        }
      }
    }
    insertOrder.run(
      id, tgId, subtotal, discount, body.promoCode ? body.promoCode.toUpperCase().trim() : null,
      deliveryFee, total,
      body.delivery.method, body.delivery.zone, body.delivery.address, body.delivery.time,
      body.recipient.name, body.recipient.phone,
      body.payment.method, body.payment.method === "cash" ? "cod" : "pending",
      customerUsername, customerName, certCode || null, certApplied, promoBenefit,
    );
    for (const l of lines) {
      const product = prodStmt.get(l.id) as any;
      insertItem.run(id, l.id, l.qty, l.price, Number(product?.cost_price || 0), stockTaken[l.id] || 0);
    }
    // Consume single-use personal coupons (stars-shop) atomically with the order —
    // two concurrent orders can't burn the same coupon twice.
    if (body.promoCode) {
      db.prepare(`
        UPDATE promo_codes
        SET active = 0, redeemed_at = datetime('now'), redeemed_order_id = ?
        WHERE code = ? AND single_use = 1
      `).run(id, body.promoCode.toUpperCase().trim());
    }
    // Burn the gift certificate atomically — the WHERE status='active' guard
    // makes a double-spend physically impossible (0 rows changed → abort).
    if (certCode) {
      const burned = db.prepare(
        "UPDATE gift_certificates SET status = 'redeemed', redeemed_at = datetime('now'), order_id = ? WHERE code = ? AND status = 'active'",
      ).run(id, certCode);
      if (burned.changes === 0) throw new Error("cert_not_active");
    }
  });
  try {
    createTx();
  } catch (e) {
    const msg = String((e as Error)?.message || "");
    if (msg.startsWith("insufficient_stock:")) {
      return reply.code(409).send({ error: "insufficient_stock", product: msg.split(":")[1] });
    }
    if (msg === "cert_not_active") {
      return reply.code(409).send({ error: "invalid_certificate" });
    }
    throw e;
  }

  // Instant admin push (authoritative) — the manager learns about the order
  // even if the client's WebApp.sendData silently fails.
  void notifyAdminNewOrder(db, id);

  // Stars cashback is awarded by fulfillOrder() once the order is PAID or DELIVERED.
  // Here we only report what the customer should expect.
  const user: any = db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(tgId);
  const loyaltyConfig = getLoyaltyConfig(db);
  const cashbackRate = cashbackPercentForStars(db, Number(user?.stars || 0)) / 100;
  const expectedStars = Math.round(
    (Math.max(0, total - deliveryFee) * cashbackRate) / loyaltyConfig.starValueUzs,
  );

  return {
    order_id: id,
    subtotal,
    discount,
    certApplied,
    deliveryFee,
    total,
    expectedStars,
    status: "new",
    payment_status: body.payment.method === "cash" ? "cod" : "pending",
    payment_url: paymentUrl(body.payment.method, id, total),
  };
});

/* ─────────────── TELEGRAM STARS PAYMENT ─────────────── */

app.post("/v1/payments/stars", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  if (tgId < 0) return reply.code(400).send({ error: "telegram_required_for_stars" });

  const body = req.body as { orderId?: string; amountUZS?: number };
  const orderId = String(body.orderId || "");
  const token = process.env.TG_BOT_TOKEN || "";
  if (!orderId || !token) {
    return reply.code(400).send({ error: "stars_not_configured" });
  }

  // The amount ALWAYS comes from the database — a client-supplied amount is ignored.
  const order: any = db.prepare("SELECT id, tg_id, total, payment_status FROM orders WHERE id = ?").get(orderId);
  if (!order || Number(order.tg_id) !== tgId) {
    return reply.code(404).send({ error: "order_not_found" });
  }
  if (order.payment_status === "paid") {
    return reply.code(409).send({ error: "already_paid" });
  }
  const amountUZS = Number(order.total);
  if (!amountUZS || amountUZS <= 0) {
    return reply.code(400).send({ error: "invalid_order_total" });
  }

  // DELIS internal conversion: 1 Telegram Star = 1,000 UZS.
  const stars = Math.max(1, Math.ceil(amountUZS / STAR_PRICE_UZS));
  let result: { ok?: boolean; result?: string; description?: string };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "DELIS order",
        description: `Payment for order #${orderId}`,
        payload: JSON.stringify({ orderId }),
        currency: "XTR",
        prices: [{ label: `DELIS #${orderId}`, amount: stars }],
      }),
    });
    result = (await response.json()) as typeof result;
  } catch {
    // Telegram API is unreachable / timeout — must never crash the route with a 500.
    return reply.code(502).send({ error: "telegram_invoice_failed", detail: "network" });
  }
  if (!result.ok || !result.result) {
    return reply.code(502).send({ error: "telegram_invoice_failed", detail: result.description });
  }

  return { invoiceUrl: result.result, stars, orderId };
});

/* ─────────────── REPEAT ORDER ─────────────── */

app.post("/v1/orders/:id/repeat", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const orderId = (req.params as any).id;
  // Ownership check — orders are private to the customer who placed them.
  const order: any = db.prepare("SELECT tg_id FROM orders WHERE id = ?").get(orderId);
  if (!order || Number(order.tg_id) !== tgId) return reply.code(404).send({ error: "not_found" });
  const items: any = db.prepare("SELECT product_id as id, qty, price FROM order_items WHERE order_id = ?").all(orderId);
  if (items.length === 0) return reply.code(404).send({ error: "not_found" });
  return { items };
});

/* ─────────────── COURIER LIVE TRACKING (owner or admin) ─────────────── */

app.get("/v1/orders/:id/track", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const orderId = (req.params as any).id;
  const order: any = db.prepare("SELECT id, tg_id, status FROM orders WHERE id = ?").get(orderId);
  if (!order) return reply.code(404).send({ error: "not_found" });
  const isAdmin = tgId === Number(process.env.ADMIN_CHAT_ID || 0);
  if (Number(order.tg_id) !== tgId && !isAdmin) return reply.code(403).send({ error: "forbidden" });

  const row: any = db.prepare("SELECT * FROM courier_locations WHERE order_id = ?").get(orderId);
  if (!row) return { active: false };
  const now = Date.now();
  return {
    active: now < row.live_until_ms,
    lat: row.lat,
    lon: row.lon,
    updatedMs: row.updated_ms,
    liveUntilMs: row.live_until_ms,
    staleSec: Math.max(0, Math.floor((now - row.updated_ms) / 1000)),
  };
});

/* ─────────────── ORDER STATUS (lightweight, owner-only) ─────────────── */

app.get("/v1/orders/:id", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const order: any = db.prepare("SELECT id, tg_id, status, payment_status, payment_method, total FROM orders WHERE id = ?").get((req.params as any).id);
  if (!order || Number(order.tg_id) !== tgId) return reply.code(404).send({ error: "not_found" });
  return {
    id: order.id,
    status: order.status,
    paymentStatus: order.payment_status,
    total: order.total,
    paymentUrl: paymentUrl(order.payment_method, order.id, Number(order.total)),
  };
});

/* ─────────────── DAILY REWARD ─────────────── */

const tashkentDateKey = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);

app.get("/v1/me/daily", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const today = tashkentDateKey();
  const claimed: any = db.prepare("SELECT * FROM daily_rewards WHERE tg_id = ? AND claimed_at = ?").get(tgId, today);
  return { claimed: !!claimed, today };
});

app.post("/v1/me/daily/claim", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  ensureUserFromReq(req, tgId);
  const today = tashkentDateKey();

  const rewards = [10, 15, 20, 25, 30, 40, 50, 75, 100];
  const amount = rewards[Math.floor(Math.random() * rewards.length)];
  try {
    // The PRIMARY KEY (tg_id, claimed_at) is the single source of truth —
    // no check-then-insert race.
    db.prepare("INSERT INTO daily_rewards (tg_id, claimed_at, amount) VALUES (?, ?, ?)").run(tgId, today, amount);
  } catch {
    return reply.code(409).send({ error: "already_claimed" });
  }
  db.prepare("UPDATE users SET stars = stars + ? WHERE tg_id = ?").run(amount, tgId);
  recordLoyaltyEvent(db, {
    tgId,
    type: "earn",
    amount,
    source: "daily",
    referenceId: today,
  });
  syncLoyaltyTier(db, tgId);
  const user = db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(tgId) as { stars: number };
  return { amount, today, stars: Number(user?.stars || 0) };
});

/* ─────────────── ADDRESSES ─────────────── */

/* ─────────────── BIRTHDAY ─────────────── */

app.post("/v1/me/birthday", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const mmdd = String((req.body as any)?.birthday || "").trim();
  if (!/^\d{2}-\d{2}$/.test(mmdd)) {
    return reply.code(400).send({ error: "invalid_birthday" });
  }
  ensureUserFromReq(req, tgId);
  // Anti-abuse: the birthday is set ONCE (birthday promo BDAY10 would
  // otherwise be farmable by editing the date every day).
  const existing: any = db.prepare("SELECT birthday FROM users WHERE tg_id = ?").get(tgId);
  if (existing?.birthday && existing.birthday !== mmdd) {
    return reply.code(409).send({ error: "birthday_locked", birthday: existing.birthday });
  }
  db.prepare("UPDATE users SET birthday = ? WHERE tg_id = ?").run(mmdd, tgId);
  return { ok: true, birthday: mmdd };
});

/* ─────────────── ABANDONED CART (bot reminder) ─────────────── */

app.post("/v1/abandoned-cart", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const body = req.body as {
    items?: { id: string; qty: number; name?: string; price?: number }[];
    totalItems?: number;
    totalValue?: number;
    language?: string;
  };
  if (!body.items || body.items.length === 0) {
    db.prepare("DELETE FROM abandoned_carts WHERE tg_id = ?").run(tgId);
    return { ok: true, removed: true };
  }
  const savedAt = Date.now();
  db.prepare(`
    INSERT INTO abandoned_carts (tg_id, items_json, total_items, total_value, language, saved_at, notified_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(tg_id) DO UPDATE SET
      items_json = excluded.items_json,
      total_items = excluded.total_items,
      total_value = excluded.total_value,
      language   = excluded.language,
      saved_at   = excluded.saved_at,
      notified_at = NULL
  `).run(
    tgId,
    JSON.stringify(body.items.map((it) => ({ id: it.id, qty: it.qty, name: it.name, price: it.price }))),
    body.totalItems ?? body.items.reduce((a, it) => a + it.qty, 0),
    body.totalValue ?? 0,
    body.language || "uz",
    savedAt,
  );
  return { ok: true, savedAt };
});

app.get("/v1/me/addresses", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  return db.prepare("SELECT * FROM addresses WHERE tg_id = ? ORDER BY is_default DESC, created_at DESC").all(tgId);
});

const addressSchema = z.object({
  label: z.string().trim().min(1).max(80),
  regionId: z.string().trim().min(1).max(80),
  district: z.string().trim().min(1).max(120),
  street: z.string().trim().min(1).max(300),
  apartment: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  isDefault: z.boolean().optional().default(false),
});

app.post("/v1/me/addresses", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const parsed = addressSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_address", details: parsed.error.flatten() });
  ensureUserFromReq(req, tgId);
  const body = parsed.data;
  const id = `addr_${crypto.randomUUID()}`;
  db.transaction(() => {
    if (body.isDefault) {
      db.prepare("UPDATE addresses SET is_default = 0 WHERE tg_id = ?").run(tgId);
    }
    db.prepare("INSERT INTO addresses (id, tg_id, label, region_id, district, street, apartment, phone, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      id, tgId, body.label, body.regionId, body.district, body.street, body.apartment, body.phone, body.isDefault ? 1 : 0,
    );
  })();
  return { id };
});

app.put("/v1/me/addresses/:id", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const parsed = addressSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_address", details: parsed.error.flatten() });
  const id = String((req.params as any).id || "");
  const owned = db.prepare("SELECT 1 FROM addresses WHERE id = ? AND tg_id = ?").get(id, tgId);
  if (!owned) return reply.code(404).send({ error: "not_found" });
  const body = parsed.data;
  db.transaction(() => {
    if (body.isDefault) db.prepare("UPDATE addresses SET is_default = 0 WHERE tg_id = ?").run(tgId);
    db.prepare(`
      UPDATE addresses SET label = ?, region_id = ?, district = ?, street = ?,
        apartment = ?, phone = ?, is_default = ? WHERE id = ? AND tg_id = ?
    `).run(body.label, body.regionId, body.district, body.street, body.apartment, body.phone, body.isDefault ? 1 : 0, id, tgId);
  })();
  return { id };
});

app.delete("/v1/me/addresses/:id", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const res = db.prepare("DELETE FROM addresses WHERE id = ? AND tg_id = ?").run((req.params as any).id, tgId);
  if (res.changes === 0) return reply.code(404).send({ error: "not_found" });
  return { ok: true };
});

/* ─────────────── RETURNS ─────────────── */

function mapReturnRequest(row: any) {
  return {
    id: row.id,
    orderId: row.order_id,
    itemId: row.product_id,
    itemName: row.product_name || row.product_id,
    itemImg: row.product_img || "",
    reason: row.reason,
    note: row.note || undefined,
    status: row.status,
    createdAt: Date.parse(String(row.created_at).replace(" ", "T") + "Z") || Date.now(),
    customer: row.first_name || row.username
      ? { id: row.tg_id, name: row.first_name || "", username: row.username || "" }
      : undefined,
  };
}

const RETURN_SELECT = `
  SELECT rr.*, p.name_uz AS product_name, p.img AS product_img,
         u.first_name, u.username
  FROM return_requests rr
  LEFT JOIN products p ON p.id = rr.product_id
  LEFT JOIN users u ON u.tg_id = rr.tg_id
`;

app.get("/v1/me/returns", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  return (db.prepare(`${RETURN_SELECT} WHERE rr.tg_id = ? ORDER BY rr.created_at DESC`).all(tgId) as any[])
    .map(mapReturnRequest);
});

const returnRequestSchema = z.object({
  orderId: z.string().trim().min(1).max(40),
  productId: z.string().trim().min(1).max(60),
  reason: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).optional().default(""),
});

app.post("/v1/me/returns", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const parsed = returnRequestSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_return", details: parsed.error.flatten() });
  const body = parsed.data;
  const order = db.prepare(`
    SELECT id, updated_at FROM orders
    WHERE id = ? AND tg_id = ? AND status = 'delivered'
  `).get(body.orderId, tgId) as { id: string; updated_at: string } | undefined;
  if (!order) return reply.code(404).send({ error: "delivered_order_not_found" });
  const deliveredAt = Date.parse(String(order.updated_at).replace(" ", "T") + "Z");
  if (Number.isFinite(deliveredAt) && Date.now() - deliveredAt > 14 * 86_400_000) {
    return reply.code(409).send({ error: "return_window_expired" });
  }
  const item = db.prepare("SELECT 1 FROM order_items WHERE order_id = ? AND product_id = ?")
    .get(body.orderId, body.productId);
  if (!item) return reply.code(404).send({ error: "order_item_not_found" });
  const duplicate = db.prepare(`
    SELECT id FROM return_requests
    WHERE tg_id = ? AND order_id = ? AND product_id = ? AND status = 'pending'
  `).get(tgId, body.orderId, body.productId) as { id: string } | undefined;
  if (duplicate) return reply.code(409).send({ error: "return_already_pending", id: duplicate.id });
  ensureUserFromReq(req, tgId);
  const id = `RT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  db.prepare(`
    INSERT INTO return_requests (id, tg_id, order_id, product_id, reason, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, tgId, body.orderId, body.productId, body.reason, body.note || null);
  const created = db.prepare(`${RETURN_SELECT} WHERE rr.id = ?`).get(id);
  return reply.code(201).send(mapReturnRequest(created));
});

app.get("/v1/admin/returns", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  return (db.prepare(`${RETURN_SELECT} ORDER BY rr.created_at DESC LIMIT 500`).all() as any[]).map(mapReturnRequest);
});

const returnStatusSchema = z.object({ status: z.enum(["approved", "rejected"]) });
app.patch("/v1/admin/returns/:id", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const parsed = returnStatusSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_status" });
  const id = String((req.params as any).id || "");
  const current = db.prepare("SELECT tg_id, status FROM return_requests WHERE id = ?").get(id) as any;
  if (!current) return reply.code(404).send({ error: "not_found" });
  if (current.status !== "pending" && current.status !== parsed.data.status) {
    return reply.code(409).send({ error: "return_already_resolved", status: current.status });
  }
  db.prepare("UPDATE return_requests SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(parsed.data.status, id);
  void notifyReturnStatus(Number(current.tg_id), id, parsed.data.status);
  return { ok: true, id, status: parsed.data.status };
});

/* ─────────────── SUPPORT CHAT ─────────────── */

app.get("/v1/me/chat", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const rows = db.prepare(`
    SELECT id, sender, text, created_at FROM support_messages
    WHERE tg_id = ? ORDER BY created_at ASC LIMIT 300
  `).all(tgId) as any[];
  return rows.map((row) => ({
    id: row.id,
    from: row.sender === "customer" ? "user" : "manager",
    text: row.text,
    time: Date.parse(String(row.created_at).replace(" ", "T") + "Z") || Date.now(),
  }));
});

const supportMessageSchema = z.object({ text: z.string().trim().min(1).max(1000) });
app.post("/v1/me/chat", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const parsed = supportMessageSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_message" });
  ensureUserFromReq(req, tgId);
  const id = `chat_${crypto.randomUUID()}`;
  db.prepare("INSERT INTO support_messages (id, tg_id, sender, text) VALUES (?, ?, 'customer', ?)")
    .run(id, tgId, parsed.data.text);
  const deliveredToAdmin = await notifyAdminSupportMessage(db, id);
  return reply.code(201).send({ id, deliveredToAdmin, time: Date.now() });
});

/* ─────────────── ADMIN HUB (SECURELY ENFORCED ON BACKEND VIA Telegram HMAC) ─────────────── */

// Middleware helper to ensure requesting user is the actual configured Admin
function ensureAdmin(req: any, reply: any) {
  const tgId = getUserId(req);
  if (!tgId || tgId !== Number(process.env.ADMIN_CHAT_ID || 0)) {
    reply.code(403).send({ error: "forbidden_not_admin" });
    return false;
  }
  return true;
}

const broadcastSchema = z.object({
  kind: z.enum(["promo", "product", "system"]),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
});

app.post("/v1/admin/broadcast", { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } }, async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_broadcast", details: parsed.error.flatten() });
  if (!BOT_TOKEN || process.env.DELIS_DISABLE_NOTIFY === "1") {
    return reply.code(503).send({ error: "telegram_bot_not_configured" });
  }
  const id = `broadcast_${crypto.randomUUID()}`;
  const attempted = Number((db.prepare("SELECT COUNT(*) AS n FROM users WHERE tg_id > 0").get() as any)?.n || 0);
  db.prepare(`
    INSERT INTO broadcasts (id, kind, title, body, attempted, sent, failed, actor_tg_id)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?)
  `).run(id, parsed.data.kind, parsed.data.title, parsed.data.body, attempted, getUserId(req));
  // Do not hold the HTTP request open for a large audience. Delivery continues
  // in the process and writes final counters to the audit row.
  void broadcastToCustomers(db, parsed.data.title, parsed.data.body).then((result) => {
    db.prepare("UPDATE broadcasts SET attempted = ?, sent = ?, failed = ? WHERE id = ?")
      .run(result.attempted, result.sent, result.failed, id);
  }).catch((error) => console.error("broadcast failed:", error));
  return reply.code(202).send({ ok: true, id, queued: true, attempted, sent: 0, failed: 0 });
});

const loyaltyConfigSchema = z.object({
  starValueUzs: z.number().int().min(1).max(100_000),
  expirationDays: z.number().int().min(0).max(3650),
  expiryWarningDays: z.number().int().min(1).max(365),
  birthdayBonus: z.number().int().min(0).max(100_000),
  tiers: z.object({
    bronze: z.object({ minStars: z.literal(0), cashbackPercent: z.number().min(0).max(50) }),
    silver: z.object({ minStars: z.number().int().min(1).max(10_000_000), cashbackPercent: z.number().min(0).max(50) }),
    gold: z.object({ minStars: z.number().int().min(2).max(10_000_000), cashbackPercent: z.number().min(0).max(50) }),
  }),
}).superRefine((value, ctx) => {
  if (value.tiers.gold.minStars <= value.tiers.silver.minStars) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tiers", "gold", "minStars"], message: "gold_must_exceed_silver" });
  }
});

app.get("/v1/admin/loyalty/config", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  return getLoyaltyConfig(db);
});

app.put("/v1/admin/loyalty/config", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const parsed = loyaltyConfigSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_loyalty_config", details: parsed.error.flatten() });
  saveLoyaltyConfig(db, parsed.data as LoyaltyConfig);
  return { ok: true, config: parsed.data };
});

const rewardAdminSchema = z.object({
  enabled: z.boolean(),
  rewards: z.array(z.object({
    id: z.string().min(2).max(40),
    active: z.boolean(),
    cost: z.number().int().min(1).max(10_000_000),
    minSpend: z.number().int().min(0).max(100_000_000),
    maxDiscount: z.number().int().min(0).max(100_000_000).nullable().optional(),
    expiresInDays: z.number().int().min(1).max(365),
    productId: z.string().min(1).max(60).nullable().optional(),
  })).min(1).max(20),
  economics: z.object({
    averageCourierCost: z.number().int().min(0).max(10_000_000),
    averageBtsCost: z.number().int().min(0).max(10_000_000),
    paymentFeePercent: z.number().min(0).max(20),
    targetMarginPercent: z.number().min(0).max(90),
    fallbackCostPercent: z.number().min(0).max(100),
    profitGuardEnabled: z.boolean(),
  }),
  productCosts: z.record(z.string(), z.number().int().min(0).max(100_000_000)),
});

function adminRewardPayload() {
  const config = getStarsRewardConfig();
  const products = db.prepare(`
    SELECT id, name_uz AS nameUz, name_ru AS nameRu, name_en AS nameEn,
           price, cost_price AS costPrice, active
    FROM products ORDER BY active DESC, id
  `).all();
  return { ...config, products };
}

app.get("/v1/admin/loyalty/rewards", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  return adminRewardPayload();
});

app.put("/v1/admin/loyalty/rewards", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const parsed = rewardAdminSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_reward_config", details: parsed.error.flatten() });
  const input = parsed.data;
  const defaults = new Map(DEFAULT_STARS_REWARD_CONFIG.rewards.map((reward) => [reward.id, reward]));
  if (input.rewards.some((reward) => !defaults.has(reward.id))) {
    return reply.code(400).send({ error: "unknown_reward" });
  }
  if (input.rewards.some((reward) => reward.minSpend <= 0)) {
    return reply.code(400).send({ error: "reward_min_spend_required" });
  }
  if (input.rewards.some((reward) => defaults.get(reward.id)?.kind !== "gift" && Number(reward.maxDiscount || 0) <= 0)) {
    return reply.code(400).send({ error: "reward_cap_required" });
  }
  const knownProducts = new Set((db.prepare("SELECT id FROM products").all() as Array<{ id: string }>).map((product) => product.id));
  if (Object.keys(input.productCosts).some((productId) => !knownProducts.has(productId))) {
    return reply.code(400).send({ error: "unknown_product_cost" });
  }
  if (input.rewards.some((reward) => reward.productId && !knownProducts.has(reward.productId))) {
    return reply.code(400).send({ error: "unknown_gift_product" });
  }
  const overrides = new Map(input.rewards.map((reward) => [reward.id, reward]));
  const rewards = DEFAULT_STARS_REWARD_CONFIG.rewards.map((fallback) => {
    const update = overrides.get(fallback.id);
    return update ? {
      ...fallback,
      active: update.active,
      cost: update.cost,
      minSpend: update.minSpend,
      maxDiscount: update.maxDiscount || undefined,
      expiresInDays: update.expiresInDays,
      productId: fallback.kind === "gift" ? (update.productId || fallback.productId) : fallback.productId,
    } : fallback;
  });
  const config: StarsRewardConfig = { enabled: input.enabled, rewards, economics: input.economics };
  const updateCost = db.prepare("UPDATE products SET cost_price = ? WHERE id = ?");
  db.transaction(() => {
    saveStarsRewardConfig(config);
    for (const [productId, cost] of Object.entries(input.productCosts)) updateCost.run(cost, productId);
  })();
  return { ok: true, config: adminRewardPayload() };
});

app.get("/v1/admin/loyalty/rewards/analytics", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const config = getStarsRewardConfig();
  const coupons = db.prepare(`
    SELECT reward_id AS rewardId,
           COUNT(*) AS issued,
           SUM(CASE WHEN redeemed_at IS NOT NULL THEN 1 ELSE 0 END) AS redeemed,
           SUM(CASE WHEN redeemed_at IS NULL AND expires_at <= datetime('now') THEN 1 ELSE 0 END) AS expired,
           SUM(CASE WHEN active = 1 AND expires_at > datetime('now') THEN 1 ELSE 0 END) AS outstanding,
           COALESCE(SUM(CASE
             WHEN active = 1 AND expires_at > datetime('now')
             THEN CASE WHEN type = 'fixed' THEN value ELSE COALESCE(max_discount, 0) END
             ELSE 0 END), 0) AS liability
    FROM promo_codes WHERE reward_id IS NOT NULL GROUP BY reward_id
  `).all() as any[];
  const rewardOrders = db.prepare(`
    SELECT o.id, o.total, o.subtotal, o.promo_benefit AS promoBenefit,
           o.delivery_method AS deliveryMethod, o.payment_method AS paymentMethod,
           p.reward_id AS rewardId,
           COALESCE(SUM(oi.qty * CASE
             WHEN oi.cost_price > 0 THEN oi.cost_price
             WHEN products.cost_price > 0 THEN products.cost_price
             ELSE ROUND(oi.price * ? / 100)
           END), 0) AS productCost
    FROM orders o
    JOIN promo_codes p ON p.code = o.promo_code AND p.reward_id IS NOT NULL
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products ON products.id = oi.product_id
    WHERE o.status != 'canceled'
    GROUP BY o.id, p.reward_id
  `).all(config.economics.fallbackCostPercent) as any[];
  const regular: any = db.prepare(`
    SELECT COUNT(*) AS orders, COALESCE(AVG(o.total), 0) AS avgOrder
    FROM orders o LEFT JOIN promo_codes p ON p.code = o.promo_code
    WHERE o.status != 'canceled' AND p.reward_id IS NULL
  `).get();
  const productCoverage: any = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN cost_price > 0 THEN 1 ELSE 0 END) AS configured
    FROM products WHERE active = 1
  `).get();

  const deliveryCost = (order: any) => order.deliveryMethod === "pickup"
    ? 0
    : order.deliveryMethod === "bts_express"
      ? config.economics.averageBtsCost
      : config.economics.averageCourierCost;
  const paymentFee = (order: any) => order.paymentMethod === "cash"
    ? 0
    : Math.round(Number(order.total || 0) * config.economics.paymentFeePercent / 100);
  const aggregate = rewardOrders.reduce((totals, order) => {
    totals.revenue += Number(order.total || 0);
    totals.benefit += Number(order.promoBenefit || 0);
    totals.productCost += Number(order.productCost || 0);
    totals.fulfillmentCost += deliveryCost(order);
    totals.paymentFees += paymentFee(order);
    return totals;
  }, { revenue: 0, benefit: 0, productCost: 0, fulfillmentCost: 0, paymentFees: 0 });
  const estimatedProfit = aggregate.revenue - aggregate.productCost - aggregate.fulfillmentCost - aggregate.paymentFees;
  const estimatedMarginPercent = aggregate.revenue > 0 ? Math.round(estimatedProfit / aggregate.revenue * 1000) / 10 : 0;
  const couponMap = new Map(coupons.map((row) => [row.rewardId, row]));
  const byReward = config.rewards.map((reward) => {
    const coupon = couponMap.get(reward.id) || {};
    const orders = rewardOrders.filter((order) => order.rewardId === reward.id);
    const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const benefit = orders.reduce((sum, order) => sum + Number(order.promoBenefit || 0), 0);
    return {
      id: reward.id,
      active: reward.active,
      issued: Number(coupon.issued || 0),
      redeemed: Number(coupon.redeemed || 0),
      expired: Number(coupon.expired || 0),
      outstanding: Number(coupon.outstanding || 0),
      liability: Number(coupon.liability || 0),
      revenue,
      benefit,
      averageOrder: orders.length ? Math.round(revenue / orders.length) : 0,
    };
  });
  const issued = byReward.reduce((sum, reward) => sum + reward.issued, 0);
  const redeemed = byReward.reduce((sum, reward) => sum + reward.redeemed, 0);
  const costCoveragePercent = Number(productCoverage.total || 0) > 0
    ? Math.round(Number(productCoverage.configured || 0) / Number(productCoverage.total) * 100)
    : 100;
  const warnings: string[] = [];
  if (!config.enabled) warnings.push("rewards_paused");
  if (costCoveragePercent < 100) warnings.push("missing_product_costs");
  if (rewardOrders.length > 0 && estimatedMarginPercent < config.economics.targetMarginPercent) warnings.push("margin_below_target");
  return {
    issued,
    redeemed,
    expired: byReward.reduce((sum, reward) => sum + reward.expired, 0),
    outstanding: byReward.reduce((sum, reward) => sum + reward.outstanding, 0),
    redemptionRate: issued > 0 ? Math.round(redeemed / issued * 1000) / 10 : 0,
    outstandingLiability: byReward.reduce((sum, reward) => sum + reward.liability, 0),
    rewardOrders: rewardOrders.length,
    rewardRevenue: aggregate.revenue,
    averageRewardOrder: rewardOrders.length ? Math.round(aggregate.revenue / rewardOrders.length) : 0,
    averageRegularOrder: Math.round(Number(regular.avgOrder || 0)),
    benefitGranted: aggregate.benefit,
    productCost: aggregate.productCost,
    fulfillmentCost: aggregate.fulfillmentCost,
    paymentFees: aggregate.paymentFees,
    estimatedProfit,
    estimatedMarginPercent,
    targetMarginPercent: config.economics.targetMarginPercent,
    costCoveragePercent,
    warnings,
    byReward,
  };
});

function adminLoyaltyProfile(code: string, lang: "uz" | "ru" | "en") {
  const normalized = normalizeLoyaltyCode(code);
  const member = db.prepare(`
    SELECT c.code, c.status, c.created_at AS card_created_at,
           u.tg_id, u.first_name, u.last_name, u.username, u.phone, u.birthday, u.created_at
    FROM loyalty_cards c JOIN users u ON u.tg_id = c.tg_id
    WHERE c.code = ?
  `).get(normalized) as any;
  if (!member || member.status !== "active") return null;
  db.prepare("UPDATE loyalty_cards SET last_used_at = datetime('now') WHERE code = ?").run(normalized);
  const summary = getLoyaltySummary(db, Number(member.tg_id), lang);
  return summary ? { ...summary, customer: member } : null;
}

app.get("/v1/admin/loyalty/search", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const q = String((req.query as any)?.q || "").trim();
  if (q.length < 2) return { members: [] };
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = db.prepare(`
    SELECT u.tg_id, u.first_name, u.last_name, u.username, u.phone, u.stars, u.tier, c.code
    FROM users u LEFT JOIN loyalty_cards c ON c.tg_id = u.tg_id
    WHERE CAST(u.tg_id AS TEXT) LIKE ? OR lower(COALESCE(u.first_name, '')) LIKE lower(?)
       OR lower(COALESCE(u.username, '')) LIKE lower(?) OR COALESCE(u.phone, '') LIKE ?
    ORDER BY u.created_at DESC LIMIT 20
  `).all(`%${q}%`, like, like, `%${q}%`) as any[];
  return {
    members: rows.map((row) => ({
      ...row,
      code: row.code || ensureLoyaltyCard(db, Number(row.tg_id)),
    })),
  };
});

app.get("/v1/admin/loyalty/:code", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const profile = adminLoyaltyProfile(String((req.params as any).code || ""), getLang(req));
  if (!profile) return reply.code(404).send({ error: "loyalty_card_not_found" });
  return profile;
});

const loyaltyAdjustSchema = z.object({
  type: z.enum(["earn", "spend"]),
  amount: z.number().int().min(1).max(1_000_000),
  reason: z.string().trim().min(3).max(200),
});

app.post("/v1/admin/loyalty/:code/adjust", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const parsed = loyaltyAdjustSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_adjustment", details: parsed.error.flatten() });
  const code = normalizeLoyaltyCode(String((req.params as any).code || ""));
  const card = db.prepare("SELECT tg_id FROM loyalty_cards WHERE code = ? AND status = 'active'").get(code) as { tg_id: number } | undefined;
  if (!card) return reply.code(404).send({ error: "loyalty_card_not_found" });
  const result = adjustLoyaltyBalance(db, {
    tgId: Number(card.tg_id),
    type: parsed.data.type,
    amount: parsed.data.amount,
    reason: parsed.data.reason,
    actorTgId: Number(process.env.ADMIN_CHAT_ID || 0),
  });
  if (!result.ok) return reply.code(409).send(result);
  return { ...result, profile: adminLoyaltyProfile(code, getLang(req)) };
});

app.post("/v1/admin/loyalty/:code/rotate", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const code = normalizeLoyaltyCode(String((req.params as any).code || ""));
  const card = db.prepare("SELECT tg_id FROM loyalty_cards WHERE code = ? AND status = 'active'").get(code) as { tg_id: number } | undefined;
  if (!card) return reply.code(404).send({ error: "loyalty_card_not_found" });
  const newCode = rotateLoyaltyCard(db, Number(card.tg_id));
  return { ok: true, code: newCode, profile: adminLoyaltyProfile(newCode, getLang(req)) };
});

const missionAdminSchema = z.object({
  id: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  metric: z.enum(["orders", "spend", "daily", "referrals"]),
  target: z.number().int().min(1).max(1_000_000_000),
  reward: z.number().int().min(1).max(1_000_000),
  title: z.object({ uz: z.string().min(1).max(100), ru: z.string().min(1).max(100), en: z.string().min(1).max(100) }),
  description: z.object({ uz: z.string().max(240), ru: z.string().max(240), en: z.string().max(240) }),
  icon: z.string().min(1).max(12).default("⚡"),
  active: z.boolean().default(true),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
});

app.get("/v1/admin/loyalty/missions", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  return { missions: db.prepare("SELECT * FROM loyalty_missions ORDER BY created_at, id").all() };
});

app.post("/v1/admin/loyalty/missions", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const parsed = missionAdminSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_mission", details: parsed.error.flatten() });
  const m = parsed.data;
  db.prepare(`
    INSERT INTO loyalty_missions
      (id, metric, target, reward, title_uz, title_ru, title_en,
       description_uz, description_ru, description_en, icon, active, starts_at, ends_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET metric=excluded.metric, target=excluded.target,
      reward=excluded.reward, title_uz=excluded.title_uz, title_ru=excluded.title_ru,
      title_en=excluded.title_en, description_uz=excluded.description_uz,
      description_ru=excluded.description_ru, description_en=excluded.description_en,
      icon=excluded.icon, active=excluded.active, starts_at=excluded.starts_at, ends_at=excluded.ends_at
  `).run(
    m.id, m.metric, m.target, m.reward, m.title.uz, m.title.ru, m.title.en,
    m.description.uz, m.description.ru, m.description.en, m.icon, m.active ? 1 : 0,
    m.startsAt || null, m.endsAt || null,
  );
  return { ok: true, id: m.id };
});

app.delete("/v1/admin/loyalty/missions/:id", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const result = db.prepare("UPDATE loyalty_missions SET active = 0 WHERE id = ?").run(String((req.params as any).id || ""));
  if (!result.changes) return reply.code(404).send({ error: "mission_not_found" });
  return { ok: true };
});

app.get("/v1/admin/analytics", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const orders: any = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  return { orders };
});

/* Machine-readable production gate for the owner/deployment checklist. */
app.get("/v1/admin/readiness", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const checks: Array<{ id: string; level: "ok" | "warn" | "fail"; detail: string }> = [];
  const add = (id: string, level: "ok" | "warn" | "fail", detail: string) => checks.push({ id, level, detail });
  const appUrl = String(process.env.APP_URL || "").replace(/\/$/, "");
  add("bot", BOT_TOKEN ? "ok" : "fail", BOT_TOKEN ? "Telegram bot token configured" : "TG_BOT_TOKEN is missing");
  add("admin", Number(process.env.ADMIN_CHAT_ID || 0) > 0 ? "ok" : "fail", Number(process.env.ADMIN_CHAT_ID || 0) > 0 ? "Admin recipient configured" : "ADMIN_CHAT_ID is missing");
  add("app_url", /^https:\/\/[^/]+/.test(appUrl) ? "ok" : "fail", appUrl || "APP_URL is missing or is not HTTPS");
  add("browser_secret", process.env.BROWSER_SESSION_SECRET ? "ok" : "fail", process.env.BROWSER_SESSION_SECRET ? "Dedicated browser session secret configured" : "BROWSER_SESSION_SECRET must be set explicitly");
  const publicApiUrl = String(process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
  add("public_api_url", /^https:\/\/[^/]+/.test(publicApiUrl) ? "ok" : "fail", publicApiUrl || "PUBLIC_API_URL is missing or is not HTTPS");
  add("backups", supabaseConfigured() ? "ok" : "fail", supabaseConfigured() ? "Supabase backup configured" : "SUPABASE_URL / SUPABASE_SERVICE_KEY missing");
  const costs = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN cost_price > 0 THEN 1 ELSE 0 END) AS ready FROM products WHERE active = 1`).get() as any;
  const coverage = Number(costs.total || 0) ? Math.round(Number(costs.ready || 0) / Number(costs.total) * 100) : 100;
  add("costs", coverage === 100 ? "ok" : "fail", `Product cost coverage: ${coverage}%`);
  const payments = paymentAvailability();
  add("payments", payments.payme || payments.click || payments.stars ? "ok" : "warn", `payme=${payments.payme}, click=${payments.click}, stars=${payments.stars}, cash=${payments.cash}`);
  const activePromos = Number((db.prepare("SELECT COUNT(*) AS n FROM promo_codes WHERE active = 1").get() as any)?.n || 0);
  add("promos", "warn", `${activePromos} active promo code(s); owner approval required before launch`);
  const failed = checks.filter((check) => check.level === "fail").length;
  reply.header("Cache-Control", "no-store");
  return { ready: failed === 0, failed, checks };
});

/* Aggregated admin dashboard stats — computed in SQL, no raw-order dumping. */
app.get("/v1/admin/stats", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const totals: any = db.prepare(`
    SELECT COUNT(*) AS ordersCount,
           COALESCE(SUM(CASE WHEN status != 'canceled' THEN total END), 0) AS revenueAll,
           COALESCE(AVG(CASE WHEN status != 'canceled' THEN total END), 0) AS avgOrderValue
    FROM orders
  `).get();
  const byStatusRows: any = db.prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all();
  const byStatus: Record<string, number> = {};
  for (const r of byStatusRows) byStatus[r.status] = r.n;
  const byPaymentRows: any = db.prepare(
    "SELECT payment_status AS s, COUNT(*) AS n FROM orders WHERE status != 'canceled' GROUP BY payment_status"
  ).all();
  const byPayment: Record<string, number> = {};
  for (const r of byPaymentRows) byPayment[r.s] = r.n;
  const revenueByDay: any = db.prepare(`
    SELECT date(created_at) AS date,
           COALESCE(SUM(CASE WHEN status != 'canceled' THEN total END), 0) AS revenue,
           COUNT(*) AS orders
    FROM orders
    WHERE created_at >= datetime('now', '-13 days')
    GROUP BY date(created_at) ORDER BY date
  `).all();
  const periodRevenue = (daysAgo: number, endOffset: number) => Number((db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN status != 'canceled' THEN total END), 0) AS revenue
    FROM orders
    WHERE created_at >= datetime('now', '-${daysAgo + endOffset} days')
      AND created_at < datetime('now', '-${endOffset} days')
  `).get() as any)?.revenue || 0);
  const last30Revenue = periodRevenue(30, 0);
  const previous30Revenue = periodRevenue(30, 30);
  const revenueDeltaPct = previous30Revenue ? Math.round((last30Revenue - previous30Revenue) / previous30Revenue * 1000) / 10 : null;
  const topProducts: any = db.prepare(`
    SELECT oi.product_id AS id, p.name_uz AS name,
           SUM(oi.qty) AS qty, SUM(oi.qty * oi.price) AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id AND o.status != 'canceled'
    LEFT JOIN products p ON p.id = oi.product_id
    GROUP BY oi.product_id ORDER BY revenue DESC LIMIT 5
  `).all();
  const usersCount: any = db.prepare("SELECT COUNT(*) AS n FROM users").get();
  const repeatCustomers: any = db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT tg_id FROM orders WHERE status != 'canceled' GROUP BY tg_id HAVING COUNT(*) >= 2
    )
  `).get();
  const pendingWaitlist: any = db.prepare("SELECT COUNT(*) AS n FROM waitlist WHERE notified_at IS NULL").get();
  const activeSubscriptions: any = db.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'active'").get();
  return {
    totals: {
      ordersCount: totals.ordersCount,
      revenueAll: totals.revenueAll,
      avgOrderValue: Math.round(totals.avgOrderValue),
      usersCount: usersCount.n,
      repeatCustomers: repeatCustomers.n,
      pendingWaitlist: pendingWaitlist.n,
      activeSubscriptions: activeSubscriptions.n,
    },
    byStatus,
    byPayment,
    revenueByDay,
    compare: { last30: last30Revenue, prev30: previous30Revenue, revenueDeltaPct },
    topProducts: topProducts.map((p: any) => ({ id: p.id, name: p.name || p.id, qty: p.qty, revenue: p.revenue })),
  };
});

/** Publish a news post to the owner's Telegram channel via the Bot API.
 *  Requires TELEGRAM_NEWS_CHANNEL (e.g. "@delis_news") and the bot must be an
 *  admin of that channel. HTML is escaped so user text can't be injected. */
app.post("/v1/admin/channel-post", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const channel = process.env.TELEGRAM_NEWS_CHANNEL || "";
  if (!channel) {
    return reply.code(400).send({ error: "channel_not_configured", hint: "Set TELEGRAM_NEWS_CHANNEL" });
  }
  const body = req.body as { title?: string; text?: string };
  const title = String(body.title || "").trim();
  const text = String(body.text || "").trim();
  if (!title && !text) return reply.code(400).send({ error: "empty_post" });
  const api = getBotApi();
  if (!api) {
    return reply.code(400).send({ error: "bot_not_configured", hint: "Set TG_BOT_TOKEN" });
  }
  const parts = [title ? `<b>${esc(title)}</b>` : "", text ? esc(text).replace(/\n/g, "\n") : ""].filter(Boolean);
  const message = parts.join("\n\n");
  try {
    await api.sendMessage(channel, message, { parse_mode: "HTML" });
    return { ok: true, channel };
  } catch (e: any) {
    const code = e?.error_code;
    if (code === 403) {
      return reply.code(400).send({ error: "bot_not_admin", hint: "Give the bot admin rights in the channel" });
    }
    if (code === 400 && /chat not found/i.test(String(e?.description || ""))) {
      return reply.code(400).send({ error: "channel_not_found", hint: channel });
    }
    return reply.code(500).send({ error: "send_failed", detail: String(e?.description || e?.message || "unknown") });
  }
});

app.post("/v1/admin/content", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const content = req.body as Record<string, unknown>;
  if (!content || typeof content !== "object") {
    return reply.code(400).send({ error: "invalid_content" });
  }
  const json = JSON.stringify(content);
  if (Buffer.byteLength(json, "utf8") > 5_000_000) {
    return reply.code(413).send({ error: "content_too_large" });
  }
  db.prepare(`
    INSERT INTO content_settings (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
  `).run("home_content", json);
  return { ok: true };
});

app.get("/v1/admin/stories", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  return db.prepare(`
    SELECT s.*, u.first_name, u.username, u.phone
    FROM stories s
    LEFT JOIN users u ON u.tg_id = s.tg_id
    WHERE s.created_at >= datetime('now', '-1 day')
    ORDER BY s.created_at DESC
    LIMIT 100
  `).all();
});

app.post("/v1/admin/stories/:id/status", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const id = String((req.params as { id: string }).id);
  const status = String((req.body as { status?: string }).status || "");
  if (!["pending", "approved", "rejected"].includes(status)) {
    return reply.code(400).send({ error: "invalid_status" });
  }
  db.prepare("UPDATE stories SET status = ? WHERE id = ?").run(status, id);
  return { ok: true };
});

app.delete("/v1/admin/stories/:id", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  db.prepare("DELETE FROM stories WHERE id = ?").run(String((req.params as { id: string }).id));
  return { ok: true };
});

/* Admin: upload/replace a product photo.
   Prefers Supabase Storage (public bucket → stable CDN URL);
   without Supabase the data URL is stored directly in the DB row —
   the frontend compresses photos to a small JPEG before sending. */
const IMG_MAX_BYTES = 3 * 1024 * 1024; // decoded image limit
const IMG_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function storeProductImage(pid: string, dataUrl: string): Promise<{ img: string } | { error: string; status: number }> {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!m) return { error: "invalid_image", status: 400 };
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0 || buf.length > IMG_MAX_BYTES) {
    return { error: "image_too_large", status: 413 };
  }
  let img: string | null = null;
  if (supabaseConfigured()) {
    img = await uploadProductImage(`products/${pid}-${Date.now()}.${IMG_MIME[m[1]]}`, buf, m[1]);
    if (!img) return { error: "image_storage_unavailable", status: 502 };
  } else {
    // No object storage configured — keep the (frontend-compressed) data URL
    img = dataUrl;
  }
  db.prepare("UPDATE products SET img = ? WHERE id = ?").run(img, pid);
  return { img };
}

app.post("/v1/admin/products", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const body = req.body as any;
  const id = body.id || `custom-${Date.now()}`;
  const imgIsDataUrl = typeof body.img === "string" && body.img.startsWith("data:image/");
  db.prepare(`
    INSERT INTO products (id, cat, price, name_uz, name_ru, name_en, volume, badge, stock, rating, reviews, img, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 5.0, 0, ?, 1)
  `).run(
    id, body.cat, body.price, body.name, body.name, body.name, body.volume || "500 ml", body.badge || null, body.stock || 0,
    imgIsDataUrl ? "images/prod-floor.jpg" : (body.img || "images/prod-floor.jpg")
  );
  // Data-URL photos go through the storage pipeline (Supabase CDN when configured)
  if (imgIsDataUrl) {
    const res = await storeProductImage(id, body.img);
    if ("error" in res) {
      db.prepare("DELETE FROM products WHERE id = ?").run(id);
      return reply.code(res.status).send({ error: res.error });
    }
    return { ok: true, id, img: res.img };
  }
  return { ok: true, id };
});

app.post("/v1/admin/products/:id/update", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const pid = (req.params as any).id;
  const body = req.body as any;
  if (body.price !== undefined) {
    db.prepare("UPDATE products SET price = ? WHERE id = ?").run(body.price, pid);
  }
  if (body.stock !== undefined) {
    const before: any = db.prepare("SELECT stock FROM products WHERE id = ?").get(pid);
    db.prepare("UPDATE products SET stock = ? WHERE id = ?").run(body.stock, pid);
    // Went from out-of-stock to in-stock → notify the waiting customers
    if ((before?.stock ?? 0) <= 0 && Number(body.stock) > 0) {
      notifyWaitlist(db, pid).catch((e) => console.error("notifyWaitlist failed:", e));
    }
  }
  if (body.active !== undefined) {
    db.prepare("UPDATE products SET active = ? WHERE id = ?").run(body.active ? 1 : 0, pid);
  }
  if (body.name !== undefined && String(body.name).trim()) {
    const name = String(body.name).trim().slice(0, 120);
    // The mini app keeps one localized name per language column — mirror it
    db.prepare("UPDATE products SET name_uz = ?, name_ru = ?, name_en = ? WHERE id = ?").run(name, name, name, pid);
  }
  if (body.cat !== undefined && (body.cat === "home" || body.cat === "car")) {
    db.prepare("UPDATE products SET cat = ? WHERE id = ?").run(body.cat, pid);
  }
  if (body.volume !== undefined) {
    db.prepare("UPDATE products SET volume = ? WHERE id = ?").run(String(body.volume).slice(0, 40), pid);
  }
  if (body.badge !== undefined) {
    const badge = body.badge === null || body.badge === "" ? null : String(body.badge).slice(0, 20);
    db.prepare("UPDATE products SET badge = ? WHERE id = ?").run(badge, pid);
  }
  return { ok: true };
});

app.post("/v1/admin/products/:id/image", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const pid = (req.params as any).id;
  const product: any = db.prepare("SELECT id FROM products WHERE id = ?").get(pid);
  if (!product) return reply.code(404).send({ error: "product_not_found" });
  const dataUrl = String((req.body as any)?.dataUrl || "");
  const res = await storeProductImage(pid, dataUrl);
  if ("error" in res) {
    const extra = res.error === "image_too_large" ? { maxBytes: IMG_MAX_BYTES } : {};
    return reply.code(res.status).send({ error: res.error, ...extra });
  }
  return { ok: true, img: res.img, stored: supabaseConfigured() ? "supabase" : "db" };
});

/* ─────────────── REVIEWS ─────────────── */

app.get("/v1/products/:id/reviews", async (req) => {
  const rows: any = db.prepare(`
    SELECT r.*, u.first_name, u.username FROM reviews r
    JOIN users u ON r.tg_id = u.tg_id
    WHERE r.product_id = ? ORDER BY r.created_at DESC LIMIT 20
  `).all((req.params as any).id);
  return rows.map((r: any) => ({
    id: r.id, author: r.first_name, rating: r.rating, comment: r.comment,
    date: r.created_at, verified: true,
  }));
});

app.post("/v1/products/:id/reviews", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const body = req.body as any;
  const productId = String((req.params as any).id);
  const rating = Number(body?.rating);
  const comment = String(body?.comment || "").trim().slice(0, 500);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return reply.code(400).send({ error: "invalid_rating" });
  }
  if (comment.length < 4) return reply.code(400).send({ error: "invalid_comment" });
  const product = db.prepare("SELECT id FROM products WHERE id = ?").get(productId);
  if (!product) return reply.code(404).send({ error: "not_found" });
  ensureUserFromReq(req, tgId);
  const purchased = db.prepare(`
    SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
    WHERE o.tg_id = ? AND o.status = 'delivered' AND oi.product_id = ? LIMIT 1
  `).get(tgId, productId);
  if (!purchased) return reply.code(403).send({ error: "delivered_purchase_required" });
  const dup = db.prepare("SELECT id FROM reviews WHERE product_id = ? AND tg_id = ?").get(productId, tgId);
  if (dup) return reply.code(409).send({ error: "already_reviewed" });
  // Keep counters and the advertised one-time +50 DELIS Stars bonus atomic.
  const REVIEW_BONUS = 50;
  const insert = db.prepare("INSERT INTO reviews (product_id, tg_id, rating, comment) VALUES (?, ?, ?, ?)");
  const reviewId = db.transaction(() => {
    const inserted = insert.run(productId, tgId, rating, comment);
    const agg: any = db.prepare("SELECT AVG(rating) AS avg_r, COUNT(*) AS c FROM reviews WHERE product_id = ?").get(productId);
    db.prepare("UPDATE products SET rating = ?, reviews = ? WHERE id = ?").run(
      Math.round((agg?.avg_r || 5) * 100) / 100, Number(agg?.c || 0), productId,
    );
    db.prepare("UPDATE users SET stars = stars + ? WHERE tg_id = ?").run(REVIEW_BONUS, tgId);
    recordLoyaltyEvent(db, {
      tgId,
      type: "earn",
      amount: REVIEW_BONUS,
      source: "review",
      referenceId: productId,
    });
    syncLoyaltyTier(db, tgId);
    return Number(inserted.lastInsertRowid);
  })();
  const user = db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(tgId) as { stars: number };
  return { ok: true, reviewId, starsAwarded: REVIEW_BONUS, stars: Number(user?.stars || 0) };
});

/* ─────────────── WEBHOOKS (Payment callbacks) ─────────────── */

/* ── Payme Merchant API (official JSON-RPC protocol) ──
   Auth: HTTP Basic «Paycom»:<PAYME_KEY> (key from the Payme cabinet). */

function paymeError(code: number, msgRu: string, msgUz: string, data: string, id: unknown) {
  return { error: { code, message: { ru: msgRu, uz: msgUz, en: msgRu }, data }, id };
}

app.post("/v1/webhooks/payme", async (req, reply) => {
  const paymeKey = paymentCreds().paymeKey;
  if (!paymeKey) return reply.send(paymeError(-32400, "Payme не настроен", "Payme sozlanmagan", "config", null));
  const auth = String(req.headers.authorization || "");
  const expected = "Basic " + Buffer.from(`Paycom:${paymeKey}`).toString("base64");
  const authOk = auth.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!authOk) return reply.send(paymeError(-32504, "Недостаточно привилегий", "Ruxsat yo'q", "auth", null));

  const { method, params, id: rpcId } = (req.body ?? {}) as any;
  const tid = String(params?.id || "");
  const orderId = String(params?.account?.order_id || "");
  const respond = (payload: Record<string, unknown>) => reply.send({ jsonrpc: "2.0", ...payload });

  const getOrder = () =>
    db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as any;
  const getTx = () =>
    db.prepare("SELECT * FROM payme_transactions WHERE payme_id = ?").get(tid) as any;

  switch (method) {
    case "CheckPerformTransaction": {
      const order = getOrder();
      if (!order) return respond(paymeError(-31050, "Заказ не найден", "Buyurtma topilmadi", "order_id", rpcId));
      if (Number(params?.amount) !== Number(order.total) * 100) {
        return respond(paymeError(-31001, "Неверная сумма", "Summa noto'g'ri", "amount", rpcId));
      }
      if (order.payment_status === "paid") return respond(paymeError(-31099, "Заказ уже оплачен", "Buyurtma allaqachon to'langan", "order_id", rpcId));
      if (order.status === "canceled") return respond(paymeError(-31099, "Заказ отменён", "Buyurtma bekor qilingan", "order_id", rpcId));
      return respond({ result: { allow: true }, id: rpcId });
    }

    case "CreateTransaction": {
      const order = getOrder();
      if (!order) return respond(paymeError(-31050, "Заказ не найден", "Buyurtma topilmadi", "order_id", rpcId));
      if (Number(params?.amount) !== Number(order.total) * 100) {
        return respond(paymeError(-31001, "Неверная сумма", "Summa noto'g'ri", "amount", rpcId));
      }
      if (order.status === "canceled") return respond(paymeError(-31099, "Заказ отменён", "Buyurtma bekor qilingan", "order_id", rpcId));
      const existing = getTx();
      if (existing) {
        if (existing.state < 0) return respond(paymeError(-31099, "Транзакция отменена", "Tranzaksiya bekor qilingan", "transaction", rpcId));
        return respond({ result: { create_time: existing.create_time, transaction: existing.payme_id, state: existing.state }, id: rpcId });
      }
      if (order.payment_status === "paid") return respond(paymeError(-31099, "Заказ уже оплачен", "Buyurtma allaqachon to'langan", "order_id", rpcId));
      const active: any = db.prepare("SELECT payme_id FROM payme_transactions WHERE order_id = ? AND state IN (1, 2)").get(orderId);
      if (active) return respond(paymeError(-31099, "По заказу есть другая транзакция", "Buyurtmada boshqa tranzaksiya bor", "order_id", rpcId));
      const createTime = Number(params?.time) || Date.now();
      db.prepare("INSERT INTO payme_transactions (payme_id, order_id, state, amount, create_time) VALUES (?, ?, 1, ?, ?)")
        .run(tid, orderId, Number(params.amount), createTime);
      return respond({ result: { create_time: createTime, transaction: tid, state: 1 }, id: rpcId });
    }

    case "PerformTransaction": {
      const tx = getTx();
      if (!tx) return respond(paymeError(-31010, "Транзакция не найдена", "Tranzaksiya topilmadi", "transaction", rpcId));
      if (tx.state === 2) {
        return respond({ result: { transaction: tx.payme_id, perform_time: tx.perform_time, state: 2 }, id: rpcId });
      }
      if (tx.state < 0) return respond(paymeError(-31008, "Транзакция отменена", "Tranzaksiya bekor qilingan", "transaction", rpcId));
      const performTime = Date.now();
      db.prepare("UPDATE payme_transactions SET state = 2, perform_time = ? WHERE payme_id = ?").run(performTime, tid);
      db.prepare("UPDATE orders SET payment_status = 'paid', updated_at = datetime('now') WHERE id = ?").run(tx.order_id);
      fulfillOrder(db, tx.order_id); // cashback + referral bonus
      return respond({ result: { transaction: tid, perform_time: performTime, state: 2 }, id: rpcId });
    }

    case "CancelTransaction": {
      const tx = getTx();
      if (!tx) return respond(paymeError(-31010, "Транзакция не найдена", "Tranzaksiya topilmadi", "transaction", rpcId));
      if (tx.state < 0) {
        return respond({ result: { transaction: tx.payme_id, cancel_time: tx.cancel_time, state: tx.state }, id: rpcId });
      }
      const newState = tx.state === 2 ? -2 : -1;
      const cancelTime = Date.now();
      db.prepare("UPDATE payme_transactions SET state = ?, cancel_time = ?, reason = ? WHERE payme_id = ?")
        .run(newState, cancelTime, Number(params?.reason) || null, tid);
      if (tx.state === 2) {
        // A performed payment was cancelled → order is unpaid again
        db.prepare("UPDATE orders SET payment_status = 'pending', updated_at = datetime('now') WHERE id = ?").run(tx.order_id);
      }
      return respond({ result: { transaction: tid, cancel_time: cancelTime, state: newState }, id: rpcId });
    }

    case "CheckTransaction": {
      const tx = getTx();
      if (!tx) return respond(paymeError(-31010, "Транзакция не найдена", "Tranzaksiya topilmadi", "transaction", rpcId));
      return respond({
        result: {
          create_time: tx.create_time,
          perform_time: tx.perform_time,
          cancel_time: tx.cancel_time,
          transaction: tx.payme_id,
          state: tx.state,
          reason: tx.reason,
        },
        id: rpcId,
      });
    }

    default:
      return respond({ error: { code: -32601, message: "Method not found" }, id: rpcId ?? null });
  }
});

/* ── Click Merchant API (prepare / complete + MD5 sign_string) ── */

app.post("/v1/webhooks/click", async (req, reply) => {
  const body = (req.body ?? {}) as Record<string, string>;
  const { clickSecret, clickServiceId } = paymentCreds();
  if (!clickSecret) return reply.send({ error: -8, error_note: "click_not_configured" });

  const clickTransId = String(body.click_trans_id || "");
  const serviceId = String(body.service_id || "");
  const orderId = String(body.merchant_trans_id || "");
  const amountStr = String(body.amount ?? "");
  const action = Number(body.action);
  const signTime = String(body.sign_time || "");
  const sign = String(body.sign_string || "");
  const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");

  if (serviceId !== clickServiceId) return reply.send({ error: -8, error_note: "wrong_service" });

  if (action === 0) {
    // PREPARE
    const expected = md5(`${clickTransId}${serviceId}${clickSecret}${orderId}${amountStr}0${signTime}`);
    if (sign !== expected) return reply.send({ error: -1, error_note: "SIGN CHECK FAILED!" });
    const order: any = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) return reply.send({ error: -5, error_note: "User does not exist / order not found" });
    if (Number(amountStr) !== Number(order.total)) return reply.send({ error: -2, error_note: "Incorrect parameter amount" });
    if (order.status === "canceled") return reply.send({ error: -9, error_note: "Transaction cancelled" });
    if (order.payment_status === "paid") return reply.send({ error: -4, error_note: "Already paid" });
    db.prepare("INSERT OR IGNORE INTO click_transactions (click_trans_id, order_id, amount) VALUES (?, ?, ?)")
      .run(clickTransId, orderId, Number(amountStr));
    const tx: any = db.prepare("SELECT rowid AS rid FROM click_transactions WHERE click_trans_id = ?").get(clickTransId);
    return reply.send({
      click_trans_id: clickTransId,
      merchant_trans_id: orderId,
      merchant_prepare_id: tx?.rid ?? 0,
      error: 0,
      error_note: "Success",
    });
  }

  if (action === 1) {
    // COMPLETE
    const prepareId = Number(body.merchant_prepare_id);
    const expected = md5(`${clickTransId}${serviceId}${clickSecret}${orderId}${prepareId}${amountStr}1${signTime}`);
    if (sign !== expected) return reply.send({ error: -1, error_note: "SIGN CHECK FAILED!" });
    const order: any = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) return reply.send({ error: -5, error_note: "User does not exist / order not found" });
    if (Number(amountStr) !== Number(order.total)) return reply.send({ error: -2, error_note: "Incorrect parameter amount" });
    if (order.status === "canceled") return reply.send({ error: -9, error_note: "Transaction cancelled" });
    const tx: any = db.prepare("SELECT * FROM click_transactions WHERE click_trans_id = ? ORDER BY created_at DESC").get(clickTransId);
    if (!tx) return reply.send({ error: -6, error_note: "Transaction does not exist" });
    if (tx.status !== "confirmed") {
      db.prepare("UPDATE click_transactions SET status = 'confirmed', merchant_prepare_id = ? WHERE click_trans_id = ?")
        .run(prepareId, clickTransId);
      db.prepare("UPDATE orders SET payment_status = 'paid', updated_at = datetime('now') WHERE id = ?").run(orderId);
      fulfillOrder(db, orderId); // cashback + referral bonus
    }
    return reply.send({
      click_trans_id: clickTransId,
      merchant_trans_id: orderId,
      merchant_confirm_id: prepareId,
      error: 0,
      error_note: "Success",
    });
  }

  return reply.send({ error: -3, error_note: "Action not found" });
});

/* ─────────────── ADMIN ORDERS (full list + status flow) ─────────────── */

function mapOrder(o: any, lang: string) {
  const items: any = db.prepare(
    "SELECT oi.*, p.name_uz, p.name_ru, p.name_en, p.img FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?"
  ).all(o.id);
  return {
    id: o.id, date: o.created_at, subtotal: o.subtotal, discount: o.discount,
    promoCode: o.promo_code, deliveryFee: o.delivery_fee, total: o.total,
    deliveryMethod: o.delivery_method, deliveryZone: o.delivery_zone,
    deliveryAddress: o.delivery_address, deliveryTime: o.delivery_time,
    recipientName: o.recipient_name, recipientPhone: o.recipient_phone,
    customerTgId: o.tg_id, customerSource: Number(o.tg_id) > 0 ? "telegram" : "browser",
    customerUsername: o.username, customerName: o.customer_name,
    paymentMethod: o.payment_method, paymentStatus: o.payment_status,
    status: o.status, note: o.courier_note,
    adminNotifiedAt: o.admin_notified_at || undefined,
    adminNotifyAttempts: Number(o.admin_notify_attempts || 0),
    paymentUrl: paymentUrl(o.payment_method, o.id, Number(o.total)),
    items: items.map((it: any) => ({
      id: it.product_id, name: it[`name_${lang}`] || it.name_uz,
      qty: it.qty, price: it.price, img: it.img,
    })),
  };
}

app.get("/v1/admin/orders", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const lang = getLang(req);
  const orders: any = db.prepare(`
    SELECT o.*, u.username FROM orders o
    LEFT JOIN users u ON u.tg_id = o.tg_id
    ORDER BY o.created_at DESC LIMIT 300
  `).all();
  return orders.map((o: any) => mapOrder(o, lang));
});

const ORDER_STATUSES = ["new", "preparing", "shipped", "delivered", "canceled"] as const;
type OrderStatus = typeof ORDER_STATUSES[number];
const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["preparing", "canceled"],
  preparing: ["shipped", "canceled"],
  shipped: ["delivered", "canceled"],
  delivered: [],
  canceled: [],
};

app.post("/v1/admin/orders/:id/status", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const orderId = (req.params as any).id;
  const status = String((req.body as any)?.status || "") as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) {
    return reply.code(400).send({ error: "invalid_status" });
  }
  const order: any = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) return reply.code(404).send({ error: "not_found" });
  const currentStatus = String(order.status) as OrderStatus;
  if (currentStatus === status) return { ok: true, status, unchanged: true };
  const allowed = ORDER_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(status)) {
    return reply.code(409).send({ error: "invalid_status_transition", from: currentStatus, to: status, allowed });
  }
  let restockedProducts: string[] = [];
  db.transaction(() => {
    db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, orderId);
    // Canceling a non-canceled order → items go back to stock (exactly once)
    if (status === "canceled" && order.status !== "canceled") {
      // Restock exactly what was taken at order time (stock_taken flag) —
      // never restored twice, never restores made-to-order lines.
      const items = db.prepare(
        "SELECT product_id, qty FROM order_items WHERE order_id = ? AND stock_taken = 1"
      ).all(orderId) as any[];
      for (const it of items) {
        db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(it.qty, it.product_id);
        restockedProducts.push(it.product_id);
      }
      db.prepare("UPDATE order_items SET stock_taken = 0 WHERE order_id = ?").run(orderId);
      // A canceled order releases its single-use coupon back to the owner
      if (order.promo_code) {
        db.prepare(`
          UPDATE promo_codes
          SET active = 1, redeemed_at = NULL, redeemed_order_id = NULL
          WHERE code = ? AND single_use = 1
        `).run(order.promo_code);
      }
    }
  })();
  // Restock → ping the waitlist of each product that got stock back
  for (const pid of restockedProducts) {
    notifyWaitlist(db, pid).catch((e) => console.error("notifyWaitlist failed:", e));
  }
  // Delivered → cashback + referral bonus get awarded (exactly once, race-safe)
  if (status === "delivered") {
    fulfillOrder(db, orderId);
  }
  // Auto-notify the customer (item #5)
  if (order.tg_id) {
    await notifyOrderStatus(db, order.tg_id, orderId, status);
  }
  return { ok: true, status };
});

app.post("/v1/admin/orders/:id/payment", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const order: any = db.prepare("SELECT id, status, payment_status FROM orders WHERE id = ?").get((req.params as any).id);
  if (!order) return reply.code(404).send({ error: "not_found" });
  const paymentStatus = String((req.body as any)?.paymentStatus || "");
  if (!["pending", "paid", "cod"].includes(paymentStatus)) {
    return reply.code(400).send({ error: "invalid_payment_status" });
  }
  if (order.status === "canceled") {
    return reply.code(409).send({ error: "order_canceled" });
  }
  const currentPaymentStatus = String(order.payment_status || "pending");
  if (currentPaymentStatus === paymentStatus) return { ok: true, paymentStatus, unchanged: true };
  if (paymentStatus !== "paid" || !["pending", "cod"].includes(currentPaymentStatus)) {
    return reply.code(409).send({
      error: "invalid_payment_transition",
      from: currentPaymentStatus,
      to: paymentStatus,
      allowed: currentPaymentStatus === "paid" ? [] : ["paid"],
    });
  }
  db.prepare("UPDATE orders SET payment_status = ?, updated_at = datetime('now') WHERE id = ?").run(paymentStatus, (req.params as any).id);
  // Confirmed payment → cashback + referral bonus get awarded (exactly once)
  fulfillOrder(db, (req.params as any).id);
  return { ok: true, paymentStatus };
});

/* ─────────────── REFERRAL PROGRAM ─────────────── */

app.get("/v1/me/referral", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const user: any = db.prepare("SELECT referrer_id, referral_paid FROM users WHERE tg_id = ?").get(tgId);
  const invitees: any = db.prepare("SELECT COUNT(*) AS c FROM users WHERE referrer_id = ?").get(tgId);
  return {
    code: `ref_${tgId}`,
    // NOTE: must be ?start= — the bot sees it in /start. A ?startapp= payload
    // goes only into the Mini App's initData and the bot never receives it.
    link: `https://t.me/${process.env.BOT_USERNAME || "delis"}?start=ref_${tgId}`,
    invitees: Number(invitees?.c || 0),
    bonusStars: 500,
    bonusEarned: Boolean(user?.referral_paid),
    invitedBy: user?.referrer_id || null,
  };
});

/**
 * Attach the inviter when the app was opened via a shared link (?start=ref_<id>)
 * instead of the bot's /start. Idempotent: only the first attachment sticks.
 */
app.post("/v1/me/referral/attach", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const referrerId = Number((req.body as any)?.referrerId || 0);
  if (!Number.isFinite(referrerId) || referrerId <= 0) {
    return reply.code(400).send({ error: "invalid_referrer" });
  }
  if (referrerId === tgId) {
    return reply.code(400).send({ error: "self_referral" });
  }
  ensureUserFromReq(req, tgId);
  const res = db.prepare(
    "UPDATE users SET referrer_id = ? WHERE tg_id = ? AND referrer_id IS NULL"
  ).run(referrerId, tgId);
  return { ok: true, attached: res.changes === 1 };
});

/* ─────────────── QR AUTHENTICITY ─────────────── */

app.get("/v1/qr/:code", async (req, reply) => {
  const lang = getLang(req);
  const code = String((req.params as any).code || "").trim().toUpperCase();
  const batch: any = db.prepare("SELECT * FROM qr_batches WHERE code = ?").get(code);
  if (!batch) return reply.code(404).send({ valid: false, error: "not_found" });
  const product: any = db.prepare("SELECT id, name_uz, name_ru, name_en, img, volume FROM products WHERE id = ?").get(batch.product_id);
  return {
    valid: true,
    code: batch.code,
    productId: batch.product_id,
    productName: product?.[`name_${lang}`] || product?.name_uz || batch.product_id,
    img: product?.img || null,
    volume: product?.volume || null,
    producedAt: batch.produced_at,
    batchNo: batch.batch_no,
  };
});

/* ─────────────── QR BATCHES — ADMIN (privyazka shtrikh-kodov) ─────────────── */

const qrUpsertSchema = z.object({
  code: z.string().min(4).max(40).optional(),
  productId: z.string().min(1).max(60),
  producedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  batchNo: z.number().int().min(1).max(999_999).default(1),
});
const qrPatchSchema = z.object({
  productId: z.string().min(1).max(60).optional(),
  producedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  batchNo: z.number().int().min(1).max(999_999).optional(),
});

function genHumanCode(prefix: string, len: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}-${out}`;
}

app.get("/v1/admin/qr-batches", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const rows = db.prepare(`
    SELECT q.code, q.product_id, q.produced_at, q.batch_no,
           p.name_uz, p.name_ru, p.name_en, p.img
    FROM qr_batches q LEFT JOIN products p ON p.id = q.product_id
    ORDER BY q.produced_at DESC, q.code ASC LIMIT 500
  `).all();
  return { batches: rows };
});

app.post("/v1/admin/qr-batches", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const parsed = qrUpsertSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_batch", details: parsed.error.flatten() });
  const b = parsed.data;
  const product = db.prepare("SELECT id FROM products WHERE id = ?").get(b.productId);
  if (!product) return reply.code(400).send({ error: "unknown_product", product: b.productId });
  const code = (b.code || genHumanCode("DL", 6)).toUpperCase().trim();
  const exists = db.prepare("SELECT 1 FROM qr_batches WHERE code = ?").get(code);
  if (exists) return reply.code(409).send({ error: "duplicate_code", code });
  db.prepare("INSERT INTO qr_batches (code, product_id, produced_at, batch_no) VALUES (?, ?, ?, ?)")
    .run(code, b.productId, b.producedAt, b.batchNo);
  return { ok: true, code };
});

app.patch("/v1/admin/qr-batches/:code", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const code = String((req.params as any).code || "").toUpperCase().trim();
  const parsed = qrPatchSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_batch", details: parsed.error.flatten() });
  const p = parsed.data;
  if (p.productId) {
    const product = db.prepare("SELECT id FROM products WHERE id = ?").get(p.productId);
    if (!product) return reply.code(400).send({ error: "unknown_product", product: p.productId });
  }
  const res = db.prepare(`
    UPDATE qr_batches SET
      product_id  = COALESCE(?, product_id),
      produced_at = COALESCE(?, produced_at),
      batch_no    = COALESCE(?, batch_no)
    WHERE code = ?
  `).run(p.productId ?? null, p.producedAt ?? null, p.batchNo ?? null, code);
  if (res.changes === 0) return reply.code(404).send({ error: "not_found" });
  return { ok: true, code };
});

app.delete("/v1/admin/qr-batches/:code", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const code = String((req.params as any).code || "").toUpperCase().trim();
  const res = db.prepare("DELETE FROM qr_batches WHERE code = ?").run(code);
  if (res.changes === 0) return reply.code(404).send({ error: "not_found" });
  return { ok: true };
});

/* ─────────────── WHOLESALE TIERS (admin-editable B2B ladder) ─────────────── */

function ensureWholesaleTiers() {
  const count: any = db.prepare("SELECT COUNT(*) AS c FROM wholesale_tiers").get();
  if (Number(count?.c || 0) > 0) return;
  const insert = db.prepare("INSERT OR IGNORE INTO wholesale_tiers (min_qty, percent) VALUES (?, ?)");
  for (const [minQty, percent] of WHOLESALE_TIERS) insert.run(minQty, percent);
}

// Public — the B2B sheet renders real conditions from this
app.get("/v1/wholesale-tiers", async () => {
  const rows = db.prepare("SELECT min_qty, percent FROM wholesale_tiers ORDER BY min_qty ASC").all();
  return { tiers: rows };
});

const tiersPutSchema = z.object({
  tiers: z.array(z.object({
    minQty: z.number().int().min(2).max(10_000),
    percent: z.number().int().min(1).max(70),
  })).min(1).max(12),
});

app.put("/v1/admin/wholesale-tiers", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const parsed = tiersPutSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_tiers", details: parsed.error.flatten() });
  // Deduplicate by minQty — last wins, otherwise duplicate would abort the transaction with 500
  const byQty = new Map<number, { minQty: number; percent: number }>();
  for (const t of parsed.data.tiers) byQty.set(t.minQty, t);
  const tiers = [...byQty.values()].sort((a, b) => a.minQty - b.minQty);
  const replaceTx = db.transaction(() => {
    db.exec("DELETE FROM wholesale_tiers");
    const insert = db.prepare("INSERT INTO wholesale_tiers (min_qty, percent) VALUES (?, ?)");
    for (const t of tiers) insert.run(t.minQty, t.percent);
  });
  replaceTx();
  return { ok: true, tiers };
});

/* ─────────────── B2B ACCESS CODES ─────────────── */

function ensureB2bCodes() {
  // Table starts empty — codes are created only via the admin UI (no demo data)
}

app.post("/v1/b2b/verify", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const code = String((req.body as any)?.code || "").toUpperCase().trim();
  if (!code) return reply.code(400).send({ error: "invalid_code" });
  const row: any = db.prepare("SELECT code, label FROM b2b_codes WHERE code = ? AND active = 1").get(code);
  if (!row) return reply.code(404).send({ ok: false, error: "not_found" });
  return { ok: true, code: row.code, label: row.label };
});

app.get("/v1/admin/b2b-codes", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  return { codes: db.prepare("SELECT * FROM b2b_codes ORDER BY created_at DESC").all() };
});

app.post("/v1/admin/b2b-codes", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const body = (req.body || {}) as any;
  const code = String(body.code || genHumanCode("B2B", 6)).toUpperCase().trim();
  if (code.length < 4 || code.length > 40) return reply.code(400).send({ error: "invalid_code" });
  const label = String(body.label || "").slice(0, 120) || null;
  try {
    db.prepare("INSERT INTO b2b_codes (code, label) VALUES (?, ?)").run(code, label);
  } catch {
    return reply.code(409).send({ error: "duplicate_code" });
  }
  return { ok: true, code };
});

app.delete("/v1/admin/b2b-codes/:code", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const code = String((req.params as any).code || "").toUpperCase().trim();
  const res = db.prepare("DELETE FROM b2b_codes WHERE code = ?").run(code);
  if (res.changes === 0) return reply.code(404).send({ error: "not_found" });
  return { ok: true };
});

/* ─────────────── GIFT CERTIFICATES ─────────────── */

const certCreateSchema = z.object({
  amount: z.number().int().min(50_000).max(5_000_000),
  to: z.string().max(80).optional(),
  from: z.string().max(80).optional(),
  message: z.string().max(300).optional(),
});

// Customer creates a certificate REQUEST — the admin activates it after payment
app.post("/v1/certificates", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  ensureUserFromReq(req, tgId);
  const parsed = certCreateSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_certificate", details: parsed.error.flatten() });
  const c = parsed.data;
  let code = "";
  for (let attempt = 0; attempt < 10 && !code; attempt++) {
    const candidate = genHumanCode("GIFT", 6);
    if (!db.prepare("SELECT 1 FROM gift_certificates WHERE code = ?").get(candidate)) code = candidate;
  }
  db.prepare(
    "INSERT INTO gift_certificates (code, amount, from_name, to_name, message, buyer_tg) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(code, c.amount, c.from?.trim() || null, c.to?.trim() || null, c.message?.trim() || null, String(tgId));
  return { ok: true, code, amount: c.amount, status: "pending" };
});

app.get("/v1/me/certificates", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const rows = db.prepare(
    "SELECT code, amount, from_name, to_name, message, status, created_at, order_id FROM gift_certificates WHERE buyer_tg = ? ORDER BY created_at DESC LIMIT 100",
  ).all(String(tgId));
  return { certificates: rows };
});

// Checkout probes the code WITHOUT burning it (burn happens inside the order tx)
app.post("/v1/certificates/check", async (req, reply) => {
  const tgId = getUserId(req);
  if (!tgId) return reply.code(401).send({ error: "unauthorized" });
  const code = String((req.body as any)?.code || "").toUpperCase().trim();
  const row: any = db.prepare("SELECT code, amount, status FROM gift_certificates WHERE code = ?").get(code);
  if (!row) return reply.code(404).send({ ok: false, error: "not_found" });
  if (row.status !== "active") return reply.code(409).send({ ok: false, error: "cert_" + row.status, status: row.status });
  return { ok: true, code: row.code, amount: row.amount };
});

app.get("/v1/admin/certificates", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const rows = db.prepare("SELECT * FROM gift_certificates ORDER BY created_at DESC LIMIT 300").all();
  return { certificates: rows };
});

// Admin issues a certificate directly (paid offline / as a gift) — born ACTIVE
app.post("/v1/admin/certificates", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const body = (req.body || {}) as any;
  const amount = Number(body.amount || 0);
  if (!Number.isInteger(amount) || amount < 50_000 || amount > 5_000_000) {
    return reply.code(400).send({ error: "invalid_amount" });
  }
  const code = genHumanCode("GIFT", 6);
  db.prepare(
    "INSERT INTO gift_certificates (code, amount, from_name, to_name, message, buyer_tg, status, activated_at) VALUES (?, ?, ?, ?, ?, 'admin', 'active', datetime('now'))",
  ).run(code, amount, String(body.from || "DELIS").slice(0, 80), String(body.to || "").slice(0, 80) || null, String(body.message || "").slice(0, 300) || null);
  return { ok: true, code, amount, status: "active" };
});

const certActionSchema = z.object({ action: z.enum(["activate", "revoke"]) });

app.patch("/v1/admin/certificates/:code", async (req, reply) => {
  if (!ensureAdmin(req, reply)) return;
  const code = String((req.params as any).code || "").toUpperCase().trim();
  const parsed = certActionSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_action" });
  const row: any = db.prepare("SELECT status FROM gift_certificates WHERE code = ?").get(code);
  if (!row) return reply.code(404).send({ error: "not_found" });
  if (row.status === "redeemed") return reply.code(409).send({ error: "already_redeemed" });
  if (parsed.data.action === "activate") {
    db.prepare("UPDATE gift_certificates SET status = 'active', activated_at = datetime('now') WHERE code = ?").run(code);
  } else {
    db.prepare("UPDATE gift_certificates SET status = 'revoked' WHERE code = ?").run(code);
  }
  return { ok: true, code, status: parsed.data.action === "activate" ? "active" : "revoked" };
});

/* ─────────────── START ─────────────── */

async function start() {
  // Restore the database from Supabase Storage before anything touches it
  if (supabaseConfigured()) {
    await ensureBucket();
    await ensureImageBucket();
    await downloadDb(getDbPath());
  }
  ensureDb();

  // Periodically push the DB file to Supabase Storage so it survives deploys
  let uploadTimer: NodeJS.Timeout | null = null;
  if (supabaseConfigured()) {
    uploadTimer = setInterval(() => {
      try {
        checkpointDb();
        void uploadDb(getDbPath());
      } catch { /* ignore */ }
    }, 30_000);
    process.on("exit", () => {
      if (uploadTimer) clearInterval(uploadTimer);
      try {
        checkpointDb();
        void uploadDb(getDbPath());
      } catch { /* ignore */ }
    });
    console.log("[supabase] DB auto-backup every 30s →", "delis-data/delis.db");
  }

  // Seed on first run
  if (process.env.SEED_ON_START === "true") {
    seedOnStart();
  }

  // Wholesale ladder + B2B codes get sane defaults; QR batches are added by
  // the ADMIN for real production runs — never seeded, so demo bottles can
  // never validate as authentic.
  ensureWholesaleTiers();
  ensureB2bCodes();

  // Instagram-style: delete stories older than 24h (initial sweep + hourly).
  try { db.prepare("DELETE FROM stories WHERE created_at < datetime('now','-1 day')").run(); } catch { /* ignore */ }
  setInterval(() => {
    try { db.prepare("DELETE FROM stories WHERE created_at < datetime('now','-1 day')").run(); } catch { /* ignore */ }
  }, 60 * 60 * 1000);

  // Serve the built frontend (single-file bundle) when present
  const publicDir = join(__dirname, "..", "public");
  if (existsSync(publicDir)) {
    await app.register(fastifyStatic, { root: publicDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/v1/") && !req.url.startsWith("/api/") && !req.url.startsWith("/health")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not_found" });
    });
    console.log(`📦 Serving static frontend from ${publicDir}`);
  }

  // Start Telegram bot (runs alongside the API)
  startBot(db);

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`🚀 DELIS API running on http://0.0.0.0:${PORT}`);
}

// Tests import the app and drive it via app.inject() — no listen, no bot.
if (process.env.DELIS_AUTOSTART !== "0") {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { app };

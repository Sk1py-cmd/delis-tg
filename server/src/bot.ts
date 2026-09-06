/**
 * DELIS — Telegram-бот: уведомления о новых заказах, смена статусов, команда /support.
 */
import { Bot, InlineKeyboard, Keyboard, InputFile } from "grammy";
import crypto from "crypto";
import type Database from "better-sqlite3";
import { ABANDONED_OFFER } from "./growth-offers.js";
import { cashbackPercentForStars, getExpiryPreview, getLoyaltyConfig, recordLoyaltyEvent, syncLoyaltyTier, tierForStars } from "./loyalty.js";

const BOT_TOKEN = process.env.TG_BOT_TOKEN || "";
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID || 0);
const APP_URL = process.env.APP_URL || "https://app.delis.uz";
/** Support contacts used by /support — keep in sync with frontend src/config.ts. */
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "+998 88 044-66-55";
const SUPPORT_PHONE_2 = process.env.SUPPORT_PHONE_2 || "+998 94 331-64-64";
const SUPPORT_MANAGER_TG = process.env.SUPPORT_MANAGER_TG || "@delisgroup_bot";
/** Telegram ids allowed to push courier live-locations (comma-separated). */
const COURIER_IDS = new Set(
  (process.env.COURIER_CHAT_IDS || String(ADMIN_CHAT_ID || ""))
    .split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0),
);
/**
 * Telegram USER ids that may act as admin in the bot: the configured admin
 * themself plus an explicit staff allowlist (STAFF_TG_USER_IDS,
 * comma-separated). This closes the group-chat residual (audit M3): with a
 * negative/group ADMIN_CHAT_ID every group member would otherwise count as
 * "the manager" for replies, status buttons and broadcasts.
 */
export const STAFF_USER_IDS = new Set(
  String(process.env.STAFF_TG_USER_IDS || "")
    .split(",").map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0),
);
if (ADMIN_CHAT_ID > 0) STAFF_USER_IDS.add(ADMIN_CHAT_ID);

export function isBotStaff(fromId: number | undefined | null): boolean {
  return typeof fromId === "number" && STAFF_USER_IDS.has(fromId);
}

/* ── Shared helpers ── */

let _api: Bot["api"] | null = null;
/** Single grammY API client — never `new Bot()` per message. */
export function getBotApi(): Bot["api"] | null {
  if (!BOT_TOKEN) return null;
  if (!_api) _api = new Bot(BOT_TOKEN).api;
  return _api;
}

/** Escape user-controlled text before embedding it in HTML parse_mode messages. */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatPrice(n: number): string {
  return n.toLocaleString("ru-RU") + " so'm";
}

/**
 * Scope-aware order lookup for the public /track command.
 * Order ids are enumerable (DL-1000…DL-9999) and courier_note is free text
 * written by the manager, so the scope is what keeps this an owner-only
 * feature:
 *  - the configured admin and allowed couriers may look up ANY order
 *    (by id or by BTS code substring in courier_note);
 *  - a regular user only ever matches THEIR OWN orders;
 *  - no identity (channels/service messages) → nothing.
 */
/** Support contacts shown to customers (bot /support etc.).
 *  Priority: admin-editable site_settings (content_settings) → env defaults.
 *  managerName is the display name of the manager ("Написать менеджеру"),
 *  supportHours is the human-readable working-hours line ("9:00 – 21:00"). */
export function supportContacts(db: Database.Database): {
  phone: string;
  phone2: string;
  email: string;
  managerName: string;
  supportHours: string;
  supportHoursUz: string;
  managerTg: string;
} {
  const fallback = {
    phone: SUPPORT_PHONE,
    phone2: SUPPORT_PHONE_2,
    email: "hello@delis.uz",
    managerName: "",
    supportHours: "9:00 – 21:00",
    supportHoursUz: "",
    managerTg: SUPPORT_MANAGER_TG,
  };
  try {
    const row = db.prepare("SELECT value_json FROM content_settings WHERE key = ?").get("site_settings") as
      | { value_json: string }
      | undefined;
    if (!row) return fallback;
    const saved: any = JSON.parse(row.value_json);
    if (typeof saved !== "object" || saved === null) return fallback;
    const pick = (key: string, fb: string) => (typeof saved[key] === "string" && saved[key].trim() ? saved[key].trim() : fb);
    return {
      phone: pick("supportPhone", fallback.phone),
      phone2: pick("supportPhone2", fallback.phone2),
      email: pick("supportEmail", fallback.email),
      managerName: pick("managerName", fallback.managerName),
      supportHours: pick("supportHours", fallback.supportHours),
      supportHoursUz: pick("supportHoursUz", fallback.supportHoursUz),
      managerTg: pick("supportTg", fallback.managerTg),
    };
  } catch {
    return fallback;
  }
}

export function trackOrderLookup(
  db: Database.Database,
  input: { fromId?: number; chatId?: number | string; arg: string },
): { found: false } | { found: true; order: any } {
  const code = String(input.arg || "").trim().toUpperCase().replace(/[-\s]/g, "");
  if (!code) return { found: false };
  const fromId = typeof input.fromId === "number" ? input.fromId : null;
  const isStaff =
    isBotStaff(fromId) ||
    (typeof input.chatId === "number" && COURIER_IDS.has(input.chatId));
  const order: any = isStaff
    ? db.prepare(
        `SELECT * FROM orders
         WHERE REPLACE(REPLACE(id, '-', ''), ' ', '') = ?
            OR REPLACE(REPLACE(courier_note, '-', ''), ' ', '') LIKE '%' || ? || '%'
         ORDER BY created_at DESC LIMIT 1`,
      ).get(code, code)
    : fromId
      ? db.prepare(
          `SELECT * FROM orders
           WHERE tg_id = ?
             AND (REPLACE(REPLACE(id, '-', ''), ' ', '') = ?
                  OR REPLACE(REPLACE(courier_note, '-', ''), ' ', '') LIKE '%' || ? || '%')
           ORDER BY created_at DESC LIMIT 1`,
        ).get(fromId, code, code)
      : null;
  return order ? { found: true, order } : { found: false };
}

/**
 * Whether a courier may bind live-location tracking to an order (audit L2):
 *  - only orders that are actually out for delivery ("shipped") may be
 *    tracked — not fresh/preparing ones;
 *  - one order → one courier: a second allowed courier cannot hijack an
 *    active live session started by a colleague.
 */
export function courierArmDecision(
  db: Database.Database,
  input: { orderId: string; courierId: number },
): { ok: true; orderId: string } | { ok: false; reason: "not_found" | "not_shipped" | "already_tracked" } {
  const order: any = db.prepare("SELECT id, status FROM orders WHERE id = ?").get(input.orderId);
  if (!order) return { ok: false, reason: "not_found" };
  if (String(order.status) !== "shipped") return { ok: false, reason: "not_shipped" };
  const bound: any = db
    .prepare("SELECT tg_id, live_until_ms FROM courier_locations WHERE order_id = ?")
    .get(order.id);
  if (
    bound &&
    Number(bound.tg_id) !== Number(input.courierId) &&
    Number(bound.live_until_ms) > Date.now()
  ) {
    return { ok: false, reason: "already_tracked" };
  }
  return { ok: true, orderId: String(order.id) };
}

/**
 * Decide whether a successful_payment event may flip the referenced order to
 * "paid". The payer must be the order's owner or the configured admin —
 * otherwise a forwarded payment message (or a stolen invoice payload)
 * could mark a stranger's order paid without any money received.
 */
export function decideStarsPayment(
  db: Database.Database,
  input: { orderId?: string; payerId?: number },
):
  | { action: "mark_paid"; orderId: string }
  | { action: "skip"; reason: "no_order_id" | "not_found" | "payer_mismatch" } {
  const orderId = input.orderId ? String(input.orderId).trim() : "";
  if (!orderId) return { action: "skip", reason: "no_order_id" };
  const order: any = db.prepare("SELECT id, tg_id FROM orders WHERE id = ?").get(orderId);
  if (!order) return { action: "skip", reason: "not_found" };
  const payer = input.payerId;
  if (!payer || (payer !== ADMIN_CHAT_ID && Number(order.tg_id) !== Number(payer))) {
    return { action: "skip", reason: "payer_mismatch" };
  }
  return { action: "mark_paid", orderId };
}

/**
 * Fulfil an order exactly once (first time it becomes paid OR delivered):
 *  - awards the Stars cashback to the customer (rate by current tier)
 *  - updates the loyalty tier
 *  - pays the 500⭐ referral bonus to the inviter on the invitee's first fulfilled order
 * Returns { earnedStars } or null when the order was already fulfilled / missing.
 */
export function fulfillOrder(db: Database.Database, orderId: string): { earnedStars: number } | null {
  const order: any = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order || order.stars_awarded) return null;
  const claim = db.prepare("UPDATE orders SET stars_awarded = 1 WHERE id = ? AND stars_awarded = 0").run(orderId);
  if (claim.changes === 0) return null; // race-safe: somebody else fulfilled it first

  const user: any = db.prepare("SELECT * FROM users WHERE tg_id = ?").get(order.tg_id);
  if (!user) return { earnedStars: 0 };

  // Cashback base: goods value only (no delivery fee)
  const base = Math.max(0, Number(order.total || 0) - Number(order.delivery_fee || 0));
  const loyaltyConfig = getLoyaltyConfig(db);
  const rate = cashbackPercentForStars(db, Number(user.stars || 0)) / 100;
  const earned = Math.round((base * rate) / loyaltyConfig.starValueUzs);
  if (earned > 0) {
    db.prepare("UPDATE users SET stars = stars + ? WHERE tg_id = ?").run(earned, order.tg_id);
    recordLoyaltyEvent(db, {
      tgId: order.tg_id,
      type: "earn",
      amount: earned,
      source: "order",
      referenceId: orderId,
    });
  }
  syncLoyaltyTier(db, order.tg_id);

  // "Come back in N days" — after an order is fulfilled, schedule a one-time
  // reminder for each consumable line so we nudge a re-buy when it runs out.
  // Only one pending reminder per (user, product); consumables only (ignore
  // bundles/custom). Default 30 days, the product's restock hint if present.
  try {
    const items: any[] = db.prepare(
      "SELECT product_id, qty FROM order_items WHERE order_id = ?",
    ).all(orderId);
    const existing = db.prepare(
      "SELECT 1 FROM reorder_reminders WHERE tg_id = ? AND product_id = ? AND notified = 0",
    );
    const ins = db.prepare(
      `INSERT INTO reorder_reminders (tg_id, product_id, product_name, qty, language, remind_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const it of items) {
      if (!it.product_id || it.product_id.startsWith("custom-") || it.product_id.startsWith("bundle")) continue;
      if (existing.get(order.tg_id, it.product_id)) continue;
      const prod: any = db.prepare("SELECT name_uz, name_ru, restock_days FROM products WHERE id = ?").get(it.product_id);
      const days = Number(prod?.restock_days) || 30;
      ins.run(
        order.tg_id, it.product_id,
        prod?.name_uz || it.product_id, it.qty,
        user.language || "uz",
        Date.now() + days * 86400_000,
      );
    }
  } catch { /* reminders are best-effort */ }

  // Referral bonus: invitee's FIRST fulfilled order → inviter gets 500⭐ (once per invitee)
  if (user.referrer_id && !user.referral_paid) {
    const fulfilled: any = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE tg_id = ? AND stars_awarded = 1").get(order.tg_id);
    if (Number(fulfilled?.c || 0) === 1) {
      db.prepare("UPDATE users SET stars = stars + 500 WHERE tg_id = ?").run(user.referrer_id);
      recordLoyaltyEvent(db, {
        tgId: Number(user.referrer_id),
        type: "earn",
        amount: 500,
        source: "referral",
        referenceId: String(order.tg_id),
      });
      syncLoyaltyTier(db, Number(user.referrer_id));
      db.prepare("UPDATE users SET referral_paid = 1 WHERE tg_id = ?").run(order.tg_id);
      const inviter: any = db.prepare("SELECT language FROM users WHERE tg_id = ?").get(user.referrer_id);
      const invLang = (inviter?.language as string) || "uz";
      const INVITE_MSG: Record<string, string> = {
        uz: `🎁 <b>+500 Stars!</b> Do'stingiz birinchi buyurtmasini oldi — DELIS sovg'asi hisobingizga yozildi.`,
        ru: `🎁 <b>+500 Stars!</b> Друг получил первый заказ — бонус DELIS зачислен на ваш счёт.`,
        en: `🎁 <b>+500 Stars!</b> Your friend received their first order — your DELIS bonus is credited.`,
      };
      const api = getBotApi();
      if (api) {
        void api.sendMessage(user.referrer_id, INVITE_MSG[invLang] || INVITE_MSG.uz, { parse_mode: "HTML" })
          .catch(() => { /* user blocked the bot — ignore */ });
      }
    }
  }
  return { earnedStars: earned };
}

/** Order status flow (forward-only + cancel). Mirrors the admin API. */
export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  new: ["preparing", "canceled"],
  preparing: ["shipped", "canceled"],
  shipped: ["delivered", "canceled"],
  delivered: [],
  canceled: [],
};

/**
 * Authoritative order status transition — shared by the admin HTTP endpoint
 * and the Telegram quick-status buttons so both paths behave identically:
 * restock on cancel, cashback/referral on delivered, customer notification.
 */
export async function transitionOrderStatus(
  db: Database.Database,
  orderId: string,
  status: string,
): Promise<{ ok: boolean; error?: string; unchanged?: boolean; from?: string; allowed?: string[] }> {
  const order: any = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) return { ok: false, error: "not_found" };
  const currentStatus = String(order.status);
  if (currentStatus === status) return { ok: true, unchanged: true };
  const allowed = ORDER_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(status)) {
    return { ok: false, error: "invalid_status_transition", from: currentStatus, allowed };
  }

  let restockedProducts: string[] = [];
  db.transaction(() => {
    db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, orderId);
    // Terminal states end live tracking immediately — the row is deleted so
    // the customer's map stops even before the live_period expires (audit L2).
    if (status === "delivered" || status === "canceled") {
      db.prepare("DELETE FROM courier_locations WHERE order_id = ?").run(orderId);
    }
    if (status === "canceled" && order.status !== "canceled") {
      const items = db.prepare(
        "SELECT product_id, qty FROM order_items WHERE order_id = ? AND stock_taken = 1",
      ).all(orderId) as any[];
      for (const it of items) {
        db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(it.qty, it.product_id);
        restockedProducts.push(it.product_id);
      }
      db.prepare("UPDATE order_items SET stock_taken = 0 WHERE order_id = ?").run(orderId);
      if (order.promo_code) {
        db.prepare(`
          UPDATE promo_codes
          SET active = 1, redeemed_at = NULL, redeemed_order_id = NULL
          WHERE code = ? AND single_use = 1
        `).run(order.promo_code);
      }
    }
  })();
  for (const pid of restockedProducts) {
    notifyWaitlist(db, pid).catch((e) => console.error("notifyWaitlist failed:", e));
  }
  if (status === "delivered") {
    fulfillOrder(db, orderId);
  }
  if (order.tg_id) {
    await notifyOrderStatus(db, order.tg_id, orderId, status);
  }
  return { ok: true, from: currentStatus };
}

/* ── Shared: notify a customer about order status (used by API + bot) ── */

export async function notifyOrderStatus(
  db: Database.Database,
  tgId: number,
  orderId: string,
  status: string,
) {
  if (process.env.DELIS_DISABLE_NOTIFY === "1" || tgId <= 0) return; // tests / browser guests / maintenance
  const api = getBotApi();
  if (!api) return;
  const user: any = db.prepare("SELECT language FROM users WHERE tg_id = ?").get(tgId);
  const lang = (user?.language as "uz" | "ru" | "en") || "uz";
  const MSG: Record<string, Record<string, string>> = {
    new: {
      uz: `🆕 <b>Buyurtma #${orderId} qabul qilindi!</b> Menejer tez orada tasdiqlaydi.`,
      ru: `🆕 <b>Заказ #${orderId} принят!</b> Менеджер скоро подтвердит.`,
      en: `🆕 <b>Order #${orderId} received!</b> A manager will confirm shortly.`,
    },
    preparing: {
      uz: `📦 <b>Buyurtma #${orderId} zavodda tayyorlanmoqda!</b>`,
      ru: `📦 <b>Заказ #${orderId} готовится на заводе!</b>`,
      en: `📦 <b>Order #${orderId} is being prepared!</b>`,
    },
    shipped: {
      uz: `🚚 <b>Buyurtma #${orderId} yo'lda!</b> Kuryer siz tomonda. Treking: APP → Buyurtmalar.`,
      ru: `🚚 <b>Заказ #${orderId} в пути!</b> Курьер уже едет к вам. Трекинг: APP → Заказы.`,
      en: `🚚 <b>Order #${orderId} is on the way!</b> Track it: APP → Orders.`,
    },
    delivered: {
      uz: `✅ <b>Buyurtma #${orderId} yetkazildi!</b> Rahmat, DELIS bilan qolganingiz uchun!`,
      ru: `✅ <b>Заказ #${orderId} доставлен!</b> Спасибо, что выбрали DELIS!`,
      en: `✅ <b>Order #${orderId} delivered!</b> Thank you for choosing DELIS!`,
    },
    canceled: {
      uz: `❌ <b>Buyurtma #${orderId} bekor qilindi.</b> Savollar bo'lsa — ${SUPPORT_MANAGER_TG}`,
      ru: `❌ <b>Заказ #${orderId} отменён.</b> Вопросы — ${SUPPORT_MANAGER_TG}`,
      en: `❌ <b>Order #${orderId} canceled.</b> Questions — ${SUPPORT_MANAGER_TG}`,
    },
  };
  try {
    await api.sendMessage(tgId, MSG[status]?.[lang] || MSG[status]?.uz || `#${orderId}: ${status}`, { parse_mode: "HTML" });
  } catch (e) {
    console.error("notifyOrderStatus failed:", e);
  }
}

/**
 * Instant admin push for EVERY new order (authoritative — works even when
 * the client's WebApp.sendData silently fails, e.g. app not opened from a
 * keyboard button). Includes an "Accept" button wired to order_accept_*.
 */
/** Quick status buttons for the admin's new-order message — one tap moves the
 *  order through the allowed transitions without opening the panel. */
const STATUS_BUTTON_LABEL: Record<string, string> = {
  preparing: "📦 В работу / Tayyorlash",
  shipped: "🚚 Отправлен / Yo'lda",
  delivered: "✅ Доставлен / Yetkazildi",
  canceled: "❌ Отменить / Bekor",
};

function orderStatusKeyboard(orderId: string, status: string, phone?: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  const next = ORDER_STATUS_TRANSITIONS[status] || [];
  for (const s of next) kb.text(STATUS_BUTTON_LABEL[s] || s, `order_status_${orderId}_${s}`);
  if (next.length) kb.row();
  if (phone) kb.url("📞 Qo'ng'iroq", `tel:${String(phone).replace(/[^\d+]/g, "")}`);
  kb.webApp("📋 Batafsil / Открыть", `${APP_URL}?tab=admin`);
  return kb;
}

export async function notifyAdminNewOrder(db: Database.Database, orderId: string): Promise<boolean> {
  if (process.env.DELIS_DISABLE_NOTIFY === "1") return false; // tests / maintenance
  const api = getBotApi();
  if (!api || !ADMIN_CHAT_ID) return false;
  try {
    const order: any = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) return false;
    if (order.admin_notified_at) return true;
    const items = db.prepare(`
      SELECT oi.qty, oi.price, oi.product_id, p.name_uz, p.name_ru
      FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `).all(orderId) as any[];
    const lines = items
      .map((it) => `  • ${esc(it.name_uz || it.name_ru || it.product_id)} × ${it.qty} — ${formatPrice(it.price * it.qty)}`)
      .join("\n");
    const PAY: Record<string, string> = {
      cash: "💵 Naqd / Наличные", payme: "🔵 Payme", click: "🟠 Click",
      stars: "⭐ Telegram Stars", card_uz: "💳 Karta", card_intl: "💳 Karta (intl)", paynet: "Paynet", uzum: "Uzuм",
    };
    const customer = Number(order.tg_id) < 0
      ? "🌐 Browser / Браузер"
      : order.customer_username
        ? `@${esc(order.customer_username)}`
        : (order.customer_name ? esc(order.customer_name) : "—");
    const text =
      `🆕 <b>Yangi buyurtma DELIS / Новый заказ</b>\n\n` +
      `🆔 <b>#${esc(order.id)}</b>\n` +
      `👤 ${esc(order.recipient_name || "—")} · ${esc(order.recipient_phone || "—")}\n` +
      `💬 ${customer}\n\n` +
      `📋 <b>Tarkib / Состав:</b>\n${lines || "  —"}\n\n` +
      `💰 <b>Jami / Итого:</b> ${formatPrice(Number(order.total) || 0)}` +
      `${Number(order.discount) > 0 ? ` (−${formatPrice(Number(order.discount))}${order.promo_code ? ` · ${esc(order.promo_code)}` : ""})` : ""}\n` +
      `${order.b2b_code ? `🤝 B2B: ${esc(order.b2b_code)} (−${Number(order.b2b_percent) || 0}%)\n` : ""}` +
      `🚚 ${order.delivery_method === "pickup" ? "Olib ketish / Самовывоз" : "Yetkazish / Доставка"}${order.delivery_zone ? ` · ${esc(order.delivery_zone)}` : ""}\n` +
      `${order.delivery_address ? `📍 ${esc(order.delivery_address)}\n` : ""}` +
      `${order.delivery_time ? `🕒 ${esc(order.delivery_time)}\n` : ""}` +
      `💳 ${PAY[order.payment_method] || esc(order.payment_method)}\n` +
      `📅 ${esc(order.created_at)}`;

    const kb = orderStatusKeyboard(orderId, String(order.status || "new"), order.recipient_phone || undefined);
    db.prepare("UPDATE orders SET admin_notify_attempts = COALESCE(admin_notify_attempts, 0) + 1 WHERE id = ?").run(orderId);
    await api.sendMessage(ADMIN_CHAT_ID, text, { parse_mode: "HTML", reply_markup: kb });
    db.prepare("UPDATE orders SET admin_notified_at = datetime('now') WHERE id = ?").run(orderId);
    return true;
  } catch (e) {
    console.error("notifyAdminNewOrder failed:", e);
    return false;
  }
}

/**
 * Notify everyone on the product's waitlist that it is back in stock.
 * Only marks notified_at for messages actually delivered — if the bot is
 * not configured or a send fails, that row stays pending for the next trigger.
 * Returns how many users were notified.
 */
export async function notifyWaitlist(db: Database.Database, productId: string): Promise<number> {
  if (process.env.DELIS_DISABLE_NOTIFY === "1") return 0; // tests / maintenance mode
  const api = getBotApi();
  if (!api) return 0;
  const product: any = db.prepare("SELECT id, name_uz, name_ru, name_en, price FROM products WHERE id = ?").get(productId);
  if (!product) return 0;
  const rows = db.prepare(
    "SELECT id, tg_id, qty, language FROM waitlist WHERE product_id = ? AND notified_at IS NULL AND tg_id > 0"
  ).all(productId) as any[];
  let sent = 0;
  for (const row of rows) {
    const lang = (row.language as "uz" | "ru" | "en") || "uz";
    const name = lang === "ru" ? (product.name_ru || product.name_uz) : lang === "en" ? (product.name_en || product.name_uz) : product.name_uz;
    const MSG: Record<string, string> = {
      uz: `✅ <b>${esc(name)}</b> yana omborda — ${formatPrice(product.price)}!\nSiz ${row.qty} ta buyurtma qilishga ro'yxatdan o'tgansiz. Ilova → Katalog.`,
      ru: `✅ <b>${esc(name)}</b> снова в наличии — ${formatPrice(product.price)}!\nВы ждали ${row.qty} шт. Приложение → Каталог.`,
      en: `✅ <b>${esc(name)}</b> is back in stock — ${formatPrice(product.price)}!\nYou signed up for ${row.qty} pcs. App → Catalog.`,
    };
    try {
      await api.sendMessage(row.tg_id, MSG[lang] || MSG.uz, { parse_mode: "HTML" });
      db.prepare("UPDATE waitlist SET notified_at = datetime('now') WHERE id = ?").run(row.id);
      sent++;
    } catch (e) {
      console.error(`notifyWaitlist: send to ${row.tg_id} failed:`, e);
    }
  }
  return sent;
}

export async function notifyAdminSupportMessage(
  db: Database.Database,
  messageId: string,
): Promise<boolean> {
  if (process.env.DELIS_DISABLE_NOTIFY === "1") return false;
  const api = getBotApi();
  if (!api || !ADMIN_CHAT_ID) return false;
  const row = db.prepare(`
    SELECT sm.id, sm.tg_id, sm.text, u.first_name, u.username
    FROM support_messages sm LEFT JOIN users u ON u.tg_id = sm.tg_id
    WHERE sm.id = ? AND sm.sender = 'customer'
  `).get(messageId) as any;
  if (!row) return false;
  const customer = Number(row.tg_id) < 0
    ? `Browser ${Math.abs(Number(row.tg_id))}`
    : row.username ? `@${esc(row.username)}` : esc(row.first_name || row.tg_id);
  try {
    const sent = await api.sendMessage(
      ADMIN_CHAT_ID,
      `💬 <b>DELIS support</b>\n👤 ${customer}\n\n${esc(row.text)}\n\n<i>Ответьте reply на это сообщение — ответ появится в чате клиента.</i>`,
      { parse_mode: "HTML" },
    );
    db.prepare("UPDATE support_messages SET admin_message_id = ? WHERE id = ?")
      .run(sent.message_id, messageId);
    return true;
  } catch (error) {
    console.error("notifyAdminSupportMessage failed:", error);
    return false;
  }
}

export async function notifyReturnStatus(
  tgId: number,
  returnId: string,
  status: "approved" | "rejected",
): Promise<void> {
  if (process.env.DELIS_DISABLE_NOTIFY === "1" || tgId <= 0) return;
  const api = getBotApi();
  if (!api) return;
  const text = status === "approved"
    ? `✅ <b>Возврат #${esc(returnId)} одобрен.</b> Менеджер свяжется с вами по способу возврата.`
    : `❌ <b>Возврат #${esc(returnId)} отклонён.</b> Уточнить причину: ${esc(SUPPORT_MANAGER_TG)}`;
  try { await api.sendMessage(tgId, text, { parse_mode: "HTML" }); } catch { /* in-app status still updates */ }
}

export async function broadcastToCustomers(
  db: Database.Database,
  title: string,
  body: string,
): Promise<{ configured: boolean; attempted: number; sent: number; failed: number }> {
  if (process.env.DELIS_DISABLE_NOTIFY === "1") {
    return { configured: false, attempted: 0, sent: 0, failed: 0 };
  }
  const api = getBotApi();
  if (!api) return { configured: false, attempted: 0, sent: 0, failed: 0 };
  const recipients = db.prepare("SELECT tg_id FROM users WHERE tg_id > 0 ORDER BY created_at DESC LIMIT 5000")
    .all() as Array<{ tg_id: number }>;
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      await api.sendMessage(
        recipient.tg_id,
        `📢 <b>${esc(title)}</b>\n\n${esc(body)}`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().webApp("🛍 DELIS", APP_URL) },
      );
      sent++;
    } catch {
      failed++;
    }
    // Keep safely below Telegram's global bot message rate.
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return { configured: true, attempted: recipients.length, sent, failed };
}

export function startBot(db: Database.Database) {
  if (!BOT_TOKEN) {
    console.log("⚠️  TG_BOT_TOKEN not set — bot skipped.");
    return;
  }

  const bot = new Bot(BOT_TOKEN);
  const api = bot.api;
  let adminRetryRunning = false;
  const retryPendingAdminOrders = async () => {
    if (adminRetryRunning || !ADMIN_CHAT_ID) return;
    adminRetryRunning = true;
    try {
      const rows = db.prepare(`
        SELECT id FROM orders
        WHERE admin_notified_at IS NULL
          AND COALESCE(admin_notify_attempts, 0) < 10
          AND datetime(created_at) >= datetime('now', '-7 days')
        ORDER BY created_at ASC LIMIT 20
      `).all() as Array<{ id: string }>;
      for (const row of rows) {
        await notifyAdminNewOrder(db, row.id);
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    } finally {
      adminRetryRunning = false;
    }
  };

  /* ────── /start — Welcome + Open Mini App ────── */

  bot.command("start", async (ctx) => {
    const ref = ctx.match;
    const deepLink = ref ? `${APP_URL}?start=${ref}` : APP_URL;

    // Upsert user
    const u = ctx.from;
    if (u) {
      const exists: any = db.prepare("SELECT tg_id FROM users WHERE tg_id = ?").get(u.id);
      if (!exists) {
        db.prepare("INSERT OR IGNORE INTO users (tg_id, first_name, last_name, username, language) VALUES (?, ?, ?, ?, ?)").run(
          u.id, u.first_name || "", u.last_name || "", u.username || "", u.language_code || "uz",
        );
      }
      // Referral: /start?startapp=ref_<inviter_tg_id> or ?start=ref_<id>
      const refMatch = String(ref || "").match(/^ref_(\d+)$/);
      if (refMatch) {
        const inviterId = Number(refMatch[1]);
        if (inviterId !== u.id) {
          db.prepare("UPDATE users SET referrer_id = ? WHERE tg_id = ? AND referrer_id IS NULL").run(inviterId, u.id);
        }
      }
    }

    await ctx.reply(
      `🌿 <b>DELIS</b> — Premium parvarish, O'zbekistondan.\n\n` +
      `Uy va avto uchun formulalar — har bir flakon Namangan zavodida ishlab chiqariladi.\n\n` +
      `🛍 Tovarlarni ko'rish, buyurtma berish va DELIS Stars yig'ish uchun pastdagi tugmani bosing:`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().webApp("🛍 DELIS ochish", deepLink),
      },
    );
  });

  /* ────── /help — Commands ────── */

  bot.command("help", async (ctx) => {
    await ctx.reply(
      `📋 <b>DELIS Bot — Buyruqlar</b>\n\n` +
      `/start — Botni boshlash va mini-ilova\n` +
      `/menu — Tovar katalogi\n` +
      `/orders — Mening buyurtmalarim\n` +
      `/track — Buyurtmani kuzatish\n` +
      `/sub — Obunalarim\n` +
      `/stars — DELIS Stars balansi\n` +
      `/support — Menejer bilan bog'lanish\n` +
      `/lang — Tilni o'zgartirish`,
      { parse_mode: "HTML" },
    );
  });

  /* ────── /menu — Product catalog in chat ────── */

  /* ────── /track — Order tracking by id or BTS code ────── */

  /* ────── Courier live tracking ──────
     Flow: courier writes /courier DL-1234 (armed 15 min), then shares a
     Telegram LIVE location in this chat. Live edits keep updating the row —
     the mini app polls GET /v1/orders/:id/track and shows the real map. */
  const armedOrders = new Map<number, { orderId: string; armedAt: number }>();
  const ARM_TTL_MS = 15 * 60_000;

  const handleCourierLocation = async (ctx: any): Promise<void> => {
    const loc = ctx.message?.location || ctx.editedMessage?.location;
    const from = ctx.from;
    const chatId = ctx.chat?.id as number | undefined;
    if (!loc || !from || !chatId || !COURIER_IDS.has(chatId)) return;

    let orderId: string | null = null;
    const armed = armedOrders.get(from.id);
    if (armed && Date.now() - armed.armedAt < ARM_TTL_MS) {
      orderId = armed.orderId;
    } else {
      // Process restarts wipe the arm map — keep updating an existing live row
      const existing: any = db.prepare(
        "SELECT order_id FROM courier_locations WHERE tg_id = ? AND live_until_ms > ? LIMIT 1"
      ).get(from.id, Date.now());
      orderId = existing?.order_id || null;
    }
    if (!orderId) return; // courier is just sharing a location casually — ignore

    // Stop publishing the moment the order is no longer out for delivery
    // (delivered/canceled/anything else) — a finished order must not keep a
    // live location on the customer's map (audit L2).
    const trackedOrder: any = db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId);
    if (!trackedOrder || String(trackedOrder.status) !== "shipped") {
      db.prepare("DELETE FROM courier_locations WHERE order_id = ?").run(orderId);
      armedOrders.delete(from.id);
      return;
    }
    // Only the courier already bound to this order may keep updating it.
    const boundRow: any = db.prepare("SELECT tg_id FROM courier_locations WHERE order_id = ?").get(orderId);
    if (boundRow && Number(boundRow.tg_id) !== Number(from.id)) return;

    const hadSession = db.prepare("SELECT 1 FROM courier_locations WHERE order_id = ?").get(orderId);
    const now = Date.now();
    const livePeriod = Number(loc.live_period || 15 * 60);
    db.prepare(`
      INSERT INTO courier_locations (order_id, tg_id, lat, lon, updated_ms, live_until_ms)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET
        lat = excluded.lat, lon = excluded.lon,
        updated_ms = excluded.updated_ms, live_until_ms = excluded.live_until_ms
    `).run(orderId, from.id, loc.latitude, loc.longitude, now, now + livePeriod * 1000);

    if (!hadSession) {
      try {
        await ctx.reply(`✅ ${esc(orderId)} — jonli kuzatuv yoqildi. Mijoz ilovada xaritani ko'ryapti.`);
      } catch { /* bot blocked */ }
      armedOrders.delete(from.id);
    }
  };

  bot.command("courier", async (ctx) => {
    if (!COURIER_IDS.has(ctx.chat.id)) {
      await ctx.reply("⛔ Bu buyruq faqat kuryerlar uchun.");
      return;
    }
    const arg = (ctx.match || "").trim().toUpperCase();
    if (!arg) {
      await ctx.reply(
        `🛵 <b>Kuryer rejimi</b>\n\n` +
        `1️⃣ Buyurtma raqamini yuboring:\n<code>/courier DL-8421</code>\n` +
        `2️⃣ Keyin shu chatga <b>jonli lokatsiya</b> (live location) yuboring — mijoz xaritada sizni ko'radi.\n` +
        `3️⃣ Yetkazgach, lokatsiya almashinuvi o'zi to'xtaydi.`,
        { parse_mode: "HTML" },
      );
      return;
    }
    const order: any = db.prepare("SELECT id, status FROM orders WHERE id = ?").get(arg);
    if (!order) {
      await ctx.reply(`❌ Buyurtma <code>${esc(arg)}</code> topilmadi.`, { parse_mode: "HTML" });
      return;
    }
    const courierId = ctx.from?.id;
    if (!courierId) return;
    // Arm gate (audit L2): shipped-only + one courier per order.
    const arm = courierArmDecision(db, { orderId: String(order.id), courierId });
    if (!arm.ok) {
      const msg =
        arm.reason === "not_found"
          ? `❌ Buyurtma <code>${esc(arg)}</code> topilmadi.`
          : arm.reason === "not_shipped"
            ? `⏳ <code>${esc(order.id)}</code> holati: <b>${esc(order.status)}</b>. Jonli kuzatuv faqat <b>shipped</b> (yetkazilmoqda) holatida yoqiladi — avval statusni yangilang.`
            : `⛔ <code>${esc(order.id)}</code> uchun jonli kuzatuv boshqa kuryerda aktiv.`;
      await ctx.reply(msg, { parse_mode: "HTML" });
      return;
    }
    armedOrders.set(courierId, { orderId: arm.orderId, armedAt: Date.now() });
    await ctx.reply(
      `🛵 <code>${esc(arm.orderId)}</code> uchun tayyor! Endi bu chatga <b>jonli lokatsiya</b> yuboring (15 daqiqa ichida).`,
      { parse_mode: "HTML" },
    );
  });

  bot.on("message:location", handleCourierLocation);
  bot.on("edited_message:location", handleCourierLocation);

  bot.command("track", async (ctx) => {
    const arg = (ctx.match || "").trim();
    if (!arg) {
      await ctx.reply(
        `🔍 <b>Buyurtmani kuzatish</b>\n\nBuyurtma raqamini yoki BTS kodini yuboring:\n\n<code>/track DL-8421</code>\n<code>/track BTS-84521</code>`,
        { parse_mode: "HTML" },
      );
      return;
    }
    // Ownership is enforced inside the lookup (owner only; admin/courier any).
    const lookedUp = trackOrderLookup(db, { fromId: ctx.from?.id, chatId: ctx.chat?.id, arg });
    const order: any = lookedUp.found ? lookedUp.order : null;
    if (!order) {
      await ctx.reply(`🔍 <code>${esc(arg)}</code> — ${"buyurtma topilmadi / заказ не найден"}`);
      return;
    }
    const STATUS: Record<string, { emoji: string; label: string }> = {
      new: { emoji: "🆕", label: "Qabul qilindi" },
      preparing: { emoji: "📦", label: "Zavodda tayyorlanmoqda" },
      shipped: { emoji: "🚚", label: "Kuryerda — yo'lda" },
      delivered: { emoji: "✅", label: "Yetkazildi" },
    };
    const st = STATUS[order.status] || { emoji: "❓", label: order.status };
    const steps = ["new", "preparing", "shipped", "delivered"];
    const cur = Math.max(0, steps.indexOf(order.status));
    const progress = steps.map((_, i) => (i <= cur ? "🟢" : "⚪")).join("");
    await ctx.reply(
      `🚚 <b>Buyurtma #${esc(order.id)}</b>\n\n${progress}\n\n${st.emoji} <b>${esc(st.label)}</b>\n📅 ${esc(order.created_at)} · ${formatPrice(Number(order.total) || 0)}\n📍 ${esc(order.delivery_zone || "—")}`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().webApp("🚚 Ochish", `${APP_URL}?tab=tracking&order=${order.id}`),
      },
    );
  });

  /* ────── /sub — product subscriptions (reminders) ────── */

  bot.command("sub", async (ctx) => {
    if (!ctx.from) return;
    const rows: any[] = db
      .prepare("SELECT * FROM subscriptions WHERE tg_id = ? AND status = 'active' ORDER BY next_date ASC")
      .all(ctx.from.id);
    if (rows.length === 0) {
      await ctx.reply(
        `📦 <b>Obunalar / Подписки</b>\n\n${"Sizda hozircha obunalar yo'q / У вас пока нет подписок"}.\n\nMini-ilovada «Abuna» bo'limi orqali eslatma o'rnating:`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().webApp("📦 DELIS ochish", APP_URL),
        },
      );
      return;
    }
    let text = `📦 <b>Sizning obunalaringiz</b>\n\n`;
    const kb = new InlineKeyboard();
    for (const s of rows) {
      const prod: any = db.prepare("SELECT name_uz FROM products WHERE id = ?").get(s.product_id);
      text += `• <b>${esc(prod?.name_uz || s.product_id)}</b> × ${s.qty} — har ${s.frequency} kunda\n`;
      kb.text(`❌ ${prod?.name_uz || s.product_id}`, `sub_cancel_${s.id}`).row();
    }
    text += `\n${"Boshqarish uchun tugmalar / Кнопки для управления"}:`;
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  });

  /* ────── /broadcast — admin-only mass message ────── */

  bot.command("broadcast", async (ctx) => {
    if (!isBotStaff(ctx.from?.id)) {
      await ctx.reply("⛔ Faqat admin uchun / Только для админа");
      return;
    }
    const text = (ctx.match || "").trim();
    if (!text) {
      await ctx.reply(`📢 <b>Mass-message</b>\n\n${"Использование / Ишлатиш"}: <code>/broadcast Xabaringiz</code>\n\n${"Отправится всем пользователям бота / Barcha foydalanuvchilarga yuboriladi"}.`, { parse_mode: "HTML" });
      return;
    }
    await ctx.reply(`📢 ${"Yuborilmoqda / Отправляю…"} (${text.length} ${"belgi / символов"})`);
    const rows: any[] = db.prepare("SELECT tg_id FROM users WHERE tg_id > 0").all();
    let sent = 0;
    for (const row of rows) {
      try {
        await api.sendMessage(row.tg_id, text, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().webApp("🛍 DELIS", APP_URL),
        });
        sent += 1;
      } catch { /* skip blocked */ }
      await new Promise((r) => setTimeout(r, 40)); // flood protection
    }
    await ctx.reply(`✅ ${"Yuborildi / Отправлено"}: ${sent}/${rows.length}`);
  });

  /* ────── Quick status buttons — admin moves the order straight from the
     notification (restock / cashback / customer notify handled centrally). ── */

  bot.callbackQuery(/^order_status_(.+)_(new|preparing|shipped|delivered|canceled)$/, async (ctx) => {
    const orderId = ctx.match![1];
    const status = ctx.match![2];
    try {
      // Only staff (admin + STAFF_TG_USER_IDS) may drive the order status flow.
      if (!isBotStaff(ctx.from?.id)) {
        await ctx.answerCallbackQuery({ text: "⛔ Faqat admin / Только для админа" });
        return;
      }
      const result = await transitionOrderStatus(db, orderId, status);
      if (!result.ok) {
        const msg =
          result.error === "not_found"
            ? "Buyurtma topilmadi / Заказ не найден"
            : result.error === "invalid_status_transition"
              ? "Bu o'tish mumkin emas / Этот переход запрещён"
              : "Xatolik / Ошибка";
        await ctx.answerCallbackQuery({ text: msg });
        return;
      }
      await ctx.answerCallbackQuery({
        text: result.unchanged
          ? "Status o'zgarmadi / Статус не изменился"
          : `✅ ${status.toUpperCase()} · mijozga xabar yuborildi / клиент уведомлён`,
      });
      // Update the inline buttons to the new set of allowed transitions so the
      // admin can keep advancing the order (or cancel) without leaving the chat.
      try {
        await ctx.editMessageReplyMarkup({
          reply_markup: orderStatusKeyboard(orderId, status),
        });
      } catch { /* message may be too old / edited elsewhere — ignore */ }
    } catch (e) {
      console.error("order_status error:", e);
      await ctx.answerCallbackQuery({ text: "Xatolik / Ошибка" });
    }
  });

  /* ────── "В работу" (legacy accept button) — same as quick "preparing" ────── */

  bot.callbackQuery(/^order_accept_(.+)$/, async (ctx) => {
    const orderId = ctx.match![1];
    try {
      // Only staff (admin + STAFF_TG_USER_IDS) may drive the order status
      // flow (same gate as order_status_* — legacy button must not be wider).
      if (!isBotStaff(ctx.from?.id)) {
        await ctx.answerCallbackQuery({ text: "⛔ Faqat admin / Только для админа" });
        return;
      }
      const result = await transitionOrderStatus(db, orderId, "preparing");
      if (!result.ok) {
        await ctx.answerCallbackQuery({
          text: result.error === "not_found" ? "Buyurtma topilmadi / Заказ не найден" : "Xatolik / Ошибка",
        });
        return;
      }
      await ctx.answerCallbackQuery({ text: "✅ Vazifaga olindi / Взято в работу" });
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: orderStatusKeyboard(orderId, "preparing") });
      } catch { /* ignore */ }
    } catch (e) {
      console.error("order_accept error:", e);
      await ctx.answerCallbackQuery({ text: "Xatolik / Ошибка" });
    }
  });

  bot.callbackQuery(/^sub_cancel_(.+)$/, async (ctx) => {
    const subId = ctx.match![1];
    // Same semantics as DELETE /v1/me/subscriptions/:id — soft-cancel
    const res = db.prepare("UPDATE subscriptions SET status = 'canceled' WHERE id = ? AND tg_id = ? AND status = 'active'").run(subId, ctx.from?.id || 0);
    await ctx.answerCallbackQuery({ text: res.changes ? "✅ Obuna bekor qilindi / Отменено" : "Topilmadi / Не найдено" });
    if (res.changes) {
      try {
        await ctx.editMessageText(`${ctx.callbackQuery.message?.text || ""}\n\n✅ <b>Obuna bekor qilindi</b>`, { parse_mode: "HTML" });
      } catch { /* ignore */ }
    }
  });

  /* ────── Subscription reminders — hourly check ────── */

  const checkSubscriptions = async () => {
    const now = new Date().toISOString();
    const due: any[] = db.prepare("SELECT * FROM subscriptions WHERE status = 'active' AND next_date <= ?").all(now);
    for (const s of due) {
      try {
        const prod: any = db.prepare("SELECT name_uz, price FROM products WHERE id = ?").get(s.product_id);
        await api.sendMessage(
          s.tg_id,
          `⏰ <b>Eslatma</b>\n\n📦 <b>${esc(prod?.name_uz || s.product_id)}</b> × ${s.qty}${prod?.price ? ` — ${formatPrice(prod.price * s.qty)}` : ""} — vaqti keldi!\n\n${"Buyurtma berish / Сделать заказ"}:`,
          {
            parse_mode: "HTML",
            // Deep-link lands the product straight in the cart (one tap to checkout)
            reply_markup: new InlineKeyboard().webApp("🛍 Buyurtma berish", `${APP_URL}?start=buy_${s.product_id}`).text("❌ Bekor qilish", `sub_cancel_${s.id}`),
          },
        );
        const next = new Date();
        next.setDate(next.getDate() + Number(s.frequency));
        db.prepare("UPDATE subscriptions SET next_date = ? WHERE id = ?").run(next.toISOString(), s.id);
      } catch { /* skip blocked */ }
    }
  };

  const subTimer = setInterval(() => {
    void checkSubscriptions();
    void checkBirthdays();
  }, 60 * 60 * 1000); // every hour

  /* ────── Birthday congratulations — checked hourly ────── */

  const checkBirthdays = async () => {
    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const rows: any[] = db.prepare("SELECT tg_id, first_name, language FROM users WHERE birthday = ? AND tg_id > 0").all(mmdd);
    for (const u of rows) {
      const lang = (u.language as "uz" | "ru" | "en") || "uz";
      const MSG: Record<string, string> = {
        uz: `🎂 <b>Tug'ilgan kuningiz bilan, ${esc(u.first_name) || "aziz mijoz"}!</b>\n\nSizga 10% chegirma sovg'a qilamiz — maxsus kod:\n\n<b><code>BDAY10</code></b>\n\nKorzinada qo'llang. Baxtli bo'ling! 🎉`,
        ru: `🎂 <b>С днём рождения, ${esc(u.first_name) || "дорогой клиент"}!</b>\n\nДарим скидку 10% — ваш личный код:\n\n<b><code>BDAY10</code></b>\n\nПримените в корзине. Будьте счастливы! 🎉`,
        en: `🎂 <b>Happy birthday, ${esc(u.first_name) || "dear customer"}!</b>\n\nHere is a 10% discount — your personal code:\n\n<b><code>BDAY10</code></b>\n\nUse it at checkout. Be happy! 🎉`,
      };
      try {
        await api.sendMessage(u.tg_id, MSG[lang] || MSG.uz, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().webApp("🛍 DELIS ochish", APP_URL),
        });
        console.log(`🎂 Birthday message → tg ${u.tg_id}`);
      } catch { /* skip */ }
    }
  };

  /* ────── Abandoned cart reminders — every 30 min, carts older than 2h ────── */

  const checkAbandonedCarts = async () => {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    const rows: any[] = db
      .prepare("SELECT * FROM abandoned_carts WHERE saved_at <= ? AND notified_at IS NULL")
      .all(cutoff);
    for (const row of rows) {
      try {
        const items = JSON.parse(row.items_json || "[]");
        const lines = items.slice(0, 3).map((it: any) => `• ${esc(it.name || "Tovar")} × ${esc(it.qty)}`).join("\n");
        const more = items.length > 3 ? `\n… va yana ${items.length - 3} ta` : "";

        // Generate a one-time 10% personal coupon to sweeten the reminder.
        // Reuse if the customer already has an active unexpired one so we
        // never stack or spam multiple codes.
        const existing = db.prepare(
          `SELECT code FROM promo_codes
           WHERE tg_id = ? AND type = 'percent' AND value = ? AND active = 1
             AND single_use = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))`,
        ).get(row.tg_id, ABANDONED_OFFER.percent) as { code?: string } | undefined;
        let promoCode = existing?.code;
        if (!promoCode) {
          const codeExists = db.prepare("SELECT 1 FROM promo_codes WHERE code = ?");
          const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
          for (;;) {
            const suffix = Array.from(crypto.randomBytes(6)).map((b) => alphabet[b % alphabet.length]).join("");
            const cand = `BACK-${suffix}`;
            if (!codeExists.get(cand)) { promoCode = cand; break; }
          }
          db.prepare(
            `INSERT INTO promo_codes (code, type, value, min_spend, active, title_uz, title_ru, title_en, tg_id, single_use, expires_at)
             VALUES (?, 'percent', ?, ?, 1, ?, ?, ?, ?, 1, datetime('now', '+7 days'))`,
          ).run(
            promoCode,
            ABANDONED_OFFER.percent,
            ABANDONED_OFFER.minSpend,
            `Qaytgan xaridor uchun ${ABANDONED_OFFER.percent}% chegirma`,
            `Скидка ${ABANDONED_OFFER.percent}% за возвращение`,
            `${ABANDONED_OFFER.percent}% off — welcome back`,
            row.tg_id,
          );
        }

        await api.sendMessage(
          row.tg_id,
          `🛒 <b>Korzinkangizda kutayotgan tovarlar</b>\n\n${lines}${more}\n\n💰 Jami: <b>${formatPrice(row.total_value)}</b> · ${row.total_items} dona\n\n🎁 <b>Qaytish chegirmasi: 10%</b>\nPersonal kod: <b><code>${promoCode}</code></b>\n\n${"Buyurtmani yakunlash / Завершить заказ"}:`,
          {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().webApp("🛍 Korzinani ochish", `${APP_URL}?tab=cart`),
          },
        );
        db.prepare("UPDATE abandoned_carts SET notified_at = ? WHERE id = ?").run(Date.now(), row.id);
        console.log(`📨 Abandoned cart reminder (+10% code ${promoCode}) → tg ${row.tg_id}`);
      } catch (e: any) {
        if (e?.error_code === 403) {
          db.prepare("UPDATE abandoned_carts SET notified_at = ? WHERE id = ?").run(Date.now(), row.id);
        }
      }
    }
  };

  const cartTimer = setInterval(() => {
    void checkAbandonedCarts();
  }, 30 * 60 * 1000);

  /* ────── Reorder reminders ("come back in N days") — every 30 min ────── */

  const checkReorderReminders = async () => {
    const rows: any[] = db.prepare(
      "SELECT * FROM reorder_reminders WHERE remind_at_ms <= ? AND notified = 0",
    ).all(Date.now());
    for (const row of rows) {
      try {
        const lang: string = row.language || "uz";
        const msg: Record<string, string> = {
          uz: `📅 <b>${esc(row.product_name)}</b> tugash arafasida bo'lishi mumkin.\n\nEhtiyot qilib, qayta buyurtma qiling yoki yangi zaxira yarating.\n\n${"Buyurtma berish / Сделать заказ"}:`,
          ru: `📅 <b>${esc(row.product_name)}</b>, возможно, уже заканчивается.\n\nСделайте повторный заказ, чтобы запас не кончился.\n\n${"Заказать / Buy"}:`,
          en: `📅 <b>${esc(row.product_name)}</b> may be running low.\n\nReorder so you never run out.\n\n${"Order now"}:`,
        };
        await api.sendMessage(
          row.tg_id,
          msg[lang] || msg.uz,
          {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().webApp(
              lang === "ru" ? "🛍 Заказать" : lang === "en" ? "🛍 Order now" : "🛍 Buyurtma berish",
              `${APP_URL}?start=buy_${row.product_id}`,
            ),
          },
        );
        db.prepare("UPDATE reorder_reminders SET notified = 1 WHERE id = ?").run(row.id);
        console.log(`📅 Reorder reminder → tg ${row.tg_id} (${row.product_name})`);
      } catch (e: any) {
        // 403 = user blocked the bot; don't retry forever
        if (e?.error_code === 403) {
          db.prepare("UPDATE reorder_reminders SET notified = 1 WHERE id = ?").run(row.id);
        }
      }
    }
  };

  const reorderTimer = setInterval(() => {
    void checkReorderReminders();
  }, 30 * 60 * 1000);

  process.on("exit", () => clearInterval(cartTimer));
  process.on("exit", () => clearInterval(reorderTimer));

  process.on("exit", () => clearInterval(subTimer));

  bot.command("menu", async (ctx) => {
    const products: any[] = db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY badge DESC, rating DESC").all();

    let text = `🛍 <b>DELIS — Katalog</b>\n\n`;
    for (const p of products) {
      const stockEmoji = p.stock > 50 ? "🟢" : p.stock > 0 ? "🟡" : "⚪";
      const stockLabel = p.stock > 50 ? `${p.stock} dona` : p.stock > 0 ? `Kam: ${p.stock} dona` : "Buyurtma asosida";
      text += `${stockEmoji} <b>${esc(p.name_ru)}</b> — ${formatPrice(Number(p.price) || 0)} · ${esc(p.volume)}\n`;
      text += `    ⭐ ${p.rating} · ${p.reviews} fikrlar · ${stockLabel}\n\n`;
    }
    text += `\n🛍 Tovar sotib olish uchun pastdagi tugmani bosing:`;

    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().webApp("🛍 Sotib olish", APP_URL),
    });
  });

  /* ────── /orders — Order history in chat ────── */

  bot.command("orders", async (ctx) => {
    if (!ctx.from) return;
    const tgId = ctx.from.id;
    const orders: any[] = db.prepare("SELECT * FROM orders WHERE tg_id = ? ORDER BY created_at DESC LIMIT 5").all(tgId);

    if (orders.length === 0) {
      await ctx.reply("📦 Siz hali buyurtma bermagansiz.\n\n🛍 Tovarlarni ko'rish uchun /menu buyrug'ini yuboring yoki pastdagi tugmani bosing.", {
        reply_markup: new InlineKeyboard().webApp("🛍 DELIS ochish", APP_URL),
      });
      return;
    }

    let text = `📦 <b>Oxirgi buyurtmalar</b>\n\n`;
    for (const o of orders) {
      const statusRu: Record<string, string> = { new: "🆕 Qabul qilindi", preparing: "📦 Tayyorlanmoqda", shipped: "🚚 Yo'lda", delivered: "✅ Yetkazildi" };
      text += `<b>#${esc(o.id)}</b> · ${esc(statusRu[o.status] || o.status)}\n`;
      text += `   📅 ${esc(o.created_at)} · ${formatPrice(Number(o.total) || 0)}\n\n`;
    }

    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().webApp("📋 Barcha buyurtmalar", `${APP_URL}?tab=orders`),
    });
  });

  /* ────── /stars — Loyalty balance ────── */

  bot.command("stars", async (ctx) => {
    if (!ctx.from) return;
    const user = db.prepare("SELECT stars, language FROM users WHERE tg_id = ?").get(ctx.from.id) as { stars?: number; language?: string } | undefined;
    const lang = user?.language === "ru" || user?.language === "en" ? user.language : "uz";
    const stars = Number(user?.stars || 0);
    const config = getLoyaltyConfig(db);
    const tier = tierForStars(stars, config);
    const tierEmoji: Record<string, string> = { bronze: "🥉", silver: "🥈", gold: "👑" };
    const tierNames = {
      bronze: { uz: "Bronza", ru: "Бронза", en: "Bronze" },
      silver: { uz: "Kumush", ru: "Серебро", en: "Silver" },
      gold: { uz: "Oltin VIP", ru: "Золотой VIP", en: "Gold VIP" },
    };
    const nextTier = tier === "bronze" ? "silver" : "gold";
    const nextStars = tier === "bronze" ? config.tiers.silver.minStars : tier === "silver" ? config.tiers.gold.minStars : stars;
    const locale = lang === "uz" ? "uz-UZ" : lang === "ru" ? "ru-RU" : "en-US";
    const value = (stars * config.starValueUzs).toLocaleString(locale);
    const money = `${value} ${lang === "uz" ? "so'm" : lang === "ru" ? "сум" : "UZS"}`;
    const memberLabels = { uz: "a'zo", ru: "участник", en: "member" };
    const balanceLabels = { uz: "Balans", ru: "Баланс", en: "Balance" };
    const nextLabels = { uz: "Keyingi daraja", ru: "Следующий уровень", en: "Next tier" };
    const remainingLabels = { uz: "Stars yana kerak", ru: "Stars осталось", en: "Stars to go" };
    const topLabels = {
      uz: "👑 Siz eng yuqori darajadasiz!",
      ru: "👑 Вы на высшем уровне!",
      en: "👑 You are at the top tier!",
    };
    const shopLabels = {
      uz: "🛍 Stars yig'ish va ishlatish uchun:",
      ru: "🛍 Чтобы получать и использовать Stars:",
      en: "🛍 To earn and use Stars:",
    };
    const buttonLabels = { uz: "🛍 DELIS ochish", ru: "🛍 Открыть DELIS", en: "🛍 Open DELIS" };
    const progress = tier !== "gold"
      ? `📈 ${nextLabels[lang]}: ${tierNames[nextTier][lang]} — ${nextStars - stars} ${remainingLabels[lang]}`
      : topLabels[lang];

    await ctx.reply(
      `⭐ <b>DELIS Stars</b>\n\n` +
      `${tierEmoji[tier] || "🥉"} ${tierNames[tier][lang]} ${memberLabels[lang]}\n` +
      `💰 ${balanceLabels[lang]}: <b>${stars} Stars</b> · ${money}\n\n` +
      `${progress}\n\n` +
      shopLabels[lang],
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().webApp(buttonLabels[lang], `${APP_URL}?tab=profile`),
      },
    );
  });

  /* ────── /lang — Change language ────── */

  bot.command("lang", async (ctx) => {
    await ctx.reply("🌐 Tilni tanlang / Выберите язык / Select language:", {
      reply_markup: new InlineKeyboard()
        .text("🇺🇿 O'zbek", "lang_uz")
        .text("🇷🇺 Русский", "lang_ru")
        .text("🇬🇧 English", "lang_en"),
    });
  });

  bot.callbackQuery(/^lang_(uz|ru|en)$/, async (ctx) => {
    const lang = ctx.match![1] as "uz" | "ru" | "en";
    db.prepare("UPDATE users SET language = ? WHERE tg_id = ?").run(lang, ctx.from.id);
    const msgs: Record<string, string> = {
      uz: "✅ Til — O'zbekcha",
      ru: "✅ Язык — Русский",
      en: "✅ Language — English",
    };
    await ctx.answerCallbackQuery({ text: msgs[lang] });
    await ctx.editMessageText(msgs[lang]);
  });

  /* ────── /support — Contact manager ────── */

  bot.command("support", async (ctx) => {
    // Admin-editable contacts (site_settings) with env fallbacks — the
    // manager name/hours/phones can be changed from the admin panel without
    // a redeploy. Hours use the uz variant when set (message is Uzbek).
    const c = supportContacts(db);
    const hours = c.supportHoursUz || c.supportHours;
    const managerLine = c.managerName
      ? `${esc(c.managerName)} (${esc(c.managerTg)})`
      : esc(c.managerTg);
    await ctx.reply(
      `💬 <b>Qo'llab-quvvatlash</b>\n\n` +
      `📞 ${esc(c.phone)}\n` +
      `📞 ${esc(c.phone2)}\n` +
      `⏰ ${esc(hours)}\n\n` +
      `Menejer: ${managerLine} — yozing yoki pastdagi tugmani bosing.`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().url("💬 Menejerga yozish", `https://t.me/${c.managerTg.replace(/^@/, "").replace(/^https:\/\/t\.me\//, "")}`),
      },
    );
  });

  /* ────── Telegram Stars payment callbacks ────── */

  /* Manager replies to a support notification using Telegram's native Reply.
     The linked message is persisted and becomes visible in the Mini App poll. */
  bot.on("message:text", async (ctx, next) => {
    if (ctx.chat.id !== ADMIN_CHAT_ID || !ctx.message.reply_to_message) {
      await next();
      return;
    }
    // Audit M3: a manager reply requires a STAFF user — the configured admin
    // themself or an explicit STAFF_TG_USER_IDS allowlist. In a group admin
    // chat this stops any random group member from impersonating the manager;
    // in a personal chat the set contains exactly the admin.
    if (!isBotStaff(ctx.from?.id)) {
      await next();
      return;
    }
    const source = db.prepare(
      "SELECT tg_id FROM support_messages WHERE admin_message_id = ? AND sender = 'customer'",
    ).get(ctx.message.reply_to_message.message_id) as { tg_id: number } | undefined;
    if (!source) {
      await next();
      return;
    }
    const text = ctx.message.text.trim().slice(0, 1000);
    if (!text) return;
    const id = `chat_${crypto.randomUUID()}`;
    db.prepare("INSERT INTO support_messages (id, tg_id, sender, text) VALUES (?, ?, 'manager', ?)")
      .run(id, source.tg_id, text);
    if (source.tg_id > 0) {
      try {
        await ctx.api.sendMessage(source.tg_id, `💬 <b>DELIS manager</b>\n\n${esc(text)}`, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().webApp("💬 Открыть чат", `${APP_URL}?tab=chat`),
        });
      } catch { /* The in-app thread remains available even if Telegram delivery fails. */ }
    }
    await ctx.reply("✅ Ответ сохранён и отправлен клиенту.");
  });

  bot.on("pre_checkout_query", async (ctx) => {
    // Validate the invoice: payload must reference a real, still-unpaid order.
    let ok = false;
    try {
      const payload = JSON.parse(ctx.preCheckoutQuery.invoice_payload || "{}");
      const order: any = payload.orderId
        ? db.prepare("SELECT payment_status FROM orders WHERE id = ?").get(String(payload.orderId))
        : null;
      ok = Boolean(order && order.payment_status !== "paid");
    } catch { /* malformed payload → reject */ }
    if (ok) {
      await ctx.answerPreCheckoutQuery(true);
    } else {
      await ctx.answerPreCheckoutQuery(false, {
        error_message: "Buyurtma topilmadi yoki allaqachon to'langan / Заказ не найден или уже оплачен.",
      });
    }
  });

  bot.on("message:successful_payment", async (ctx) => {
    const payment = ctx.message.successful_payment;
    let payload: { orderId?: string; tgId?: number } = {};
    try {
      payload = JSON.parse(payment.invoice_payload);
    } catch {
      // Keep the payment recorded even if an old payload is malformed.
    }

    // The order flips to paid ONLY when the payer matches the order owner
    // (or the admin). A mismatched payer means the payment belongs to a
    // different account — we must not mark someone else's order paid.
    const decision = decideStarsPayment(db, { orderId: payload.orderId, payerId: ctx.from?.id });
    let mismatch = false;
    if (decision.action === "mark_paid") {
      db.prepare("UPDATE orders SET payment_status = 'paid', updated_at = datetime('now') WHERE id = ?")
        .run(decision.orderId);
      // Cashback + referral bonus (exactly once)
      fulfillOrder(db, decision.orderId);
    } else {
      mismatch = decision.reason !== "no_order_id";
      console.error(
        `stars payment rejected: ${decision.reason} orderId=${payload.orderId ?? "—"} payer=${ctx.from?.id ?? "—"}`,
      );
    }

    if (ADMIN_CHAT_ID) {
      const line = mismatch
        ? `⚠️ <b>Stars оплата НЕ применена</b> (${decision.action === "skip" ? decision.reason : ""})\n`
        : `⭐ <b>Telegram Stars оплата получена</b>\n`;
      await api.sendMessage(
        ADMIN_CHAT_ID,
        `${line}Заказ: #${esc(payload.orderId || "—")}\nStars: ${esc(payment.total_amount)}\nКлиент: ${esc(ctx.from?.first_name || "—")}`,
        { parse_mode: "HTML" },
      );
    }

    await ctx.reply(
      mismatch
        ? "⚠️ Оплата получена, но она не привязана к вашему заказу. Напишите в поддержку."
        : "✅ Оплата Telegram Stars подтверждена. Спасибо за заказ!",
      {
        reply_markup: new InlineKeyboard().webApp("📦 Открыть заказ", `${APP_URL}?tab=orders`),
      },
    );
  });

  /* ────── Handle web_app_data from Mini App ────── */

  bot.on("message:web_app_data", async (ctx) => {
    let data: any;
    try {
      data = JSON.parse(ctx.message.web_app_data.data);
    } catch {
      await ctx.reply("❌ Ma'lumotni qayta ishlashda xatolik.");
      return;
    }

    /* === New order === */
    if (data.type === "delis_order") {
      const o = data;
      const customer = o.customer || {};
      const items = (o.items || []).map((it: any) => `  • ${esc(it.name)} × ${esc(it.qty)} — ${formatPrice(Number(it.price) * Number(it.qty) || 0)}`).join("\n");

      // Notify admin/manager — skip when the API path already did
      // (order exists in DB ⟺ POST /v1/orders pushed it authoritatively)
      const alreadyNotified = db.prepare("SELECT 1 FROM orders WHERE id = ?").get(o.order_id);
      if (ADMIN_CHAT_ID && !alreadyNotified) {
        const adminText =
          `🆕 <b>Yangi buyurtma DELIS</b>\n\n` +
          `🆔 <b>#${esc(o.order_id)}</b>\n` +
          `👤 ${esc(customer.name || "—")} · ${esc(customer.phone || "—")}\n` +
          `💬 @${esc(customer.tg_username || "—")}\n\n` +
          `📋 <b>Tarkib:</b>\n${items}\n\n` +
          `💰 <b>Jami:</b> ${formatPrice(Number(o.totals?.total) || 0)}\n` +
          `${Number(o.totals?.discount) > 0 ? `🎫 Promo: ${esc(o.totals?.promo)} (−${formatPrice(Number(o.totals?.discount))})\n` : ""}` +
          `🚚 ${esc(o.delivery?.method || "—")} · ${esc(o.delivery?.zone || "")}\n` +
          `📍 ${esc(o.delivery?.address || "—")}\n` +
          `🕒 ${esc(o.delivery?.time || "—")}\n` +
          `${o.delivery?.note ? `📝 ${esc(o.delivery.note)}\n` : ""}` +
          `💳 ${esc(o.payment?.method || "—")} · ${esc(o.payment?.status || "—")}\n\n` +
          `📅 ${esc(o.created_at)}`;

        // Same quick-status keyboard the API path uses — the legacy
        // order_accept_* button is no longer minted anywhere (audit M2); the
        // handler stays only for admin-gated old messages still floating in
        // the admin chat.
        const kb = orderStatusKeyboard(String(o.order_id), "new", customer.phone);

        try {
          await api.sendMessage(ADMIN_CHAT_ID, adminText, { parse_mode: "HTML", reply_markup: kb });
        } catch (e) {
          console.error("Failed to notify admin:", e);
        }
      }

      // Reply to customer
      await ctx.reply(
        `✅ <b>Buyurtma #${esc(o.order_id)} qabul qilindi!</b>\n\n` +
        `💰 ${formatPrice(Number(o.totals?.total) || 0)} · ${o.items?.length || 0} mahsulot\n` +
        `🚚 ${esc(o.delivery?.time || "")}\n\n` +
        `Menejer 15 daqiqada tasdiqlaydi. 🙏`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .webApp("📦 Buyurtmalarim", `${APP_URL}?tab=orders`),
        },
      );
    }

    /* === Receipt (customer sent to bot) === */
    if (data.type === "delis_receipt") {
      await ctx.reply(
        `🧾 <b>Chek #${esc(data.order_id)}</b>\n\n${esc(data.receipt_text)}`,
        { parse_mode: "HTML" },
      );
    }

    /* === One-click wholesale order === */
    if (data.type === "one_click_order") {
      const c = data.customer || {};
      if (ADMIN_CHAT_ID) {
        await api.sendMessage(ADMIN_CHAT_ID,
          `🏭 <b>ULGURJI buyurtma (1 bosish)</b>\n\n` +
          `🆔 ${esc(data.product_name)}\n` +
          `📦 ${esc(data.qty)} dona × ${formatPrice(Number(data.unit_price) || 0)} (−${esc(data.discount_percent)}%)\n` +
          `💰 Jami: <b>${formatPrice(Number(data.total) || 0)}</b>\n\n` +
          `👤 ${esc(c.name || "—")} · @${esc(c.tg_username || "—")}\n` +
          `📞 ${esc(c.phone || "—")}\n\n` +
          `⚠️ Qo'ng'iroq qiling va tasdiqlang!`,
          {
            parse_mode: "HTML",
            reply_markup: c.phone ? new InlineKeyboard().url("📞 Qo'ng'iroq", `tel:${String(c.phone).replace(/[^\d+]/g, "")}`) : undefined,
          },
        );
      }
      await ctx.reply(
        `🏭 <b>Ulgurji buyurtma yuborildi!</b>\n\n` +
        `${esc(data.product_name)} · ${esc(data.qty)} dona · ${formatPrice(Number(data.total) || 0)}\n\n` +
        `Menejer sizga 15 daqiqada bog'lanadi.`,
        { parse_mode: "HTML" },
      );
    }

    /* === Gift box === */
    if (data.type === "gift_box_order") {
      if (ADMIN_CHAT_ID) {
        await api.sendMessage(ADMIN_CHAT_ID,
          `🎁 <b>Yangi sovg'a buyurtmasi</b>\n\n` +
          `📦 Quti: ${esc(data.box_name)}\n` +
          `💌 Xat: ${esc(data.greeting_note || "—")}`,
          { parse_mode: "HTML" },
        );
      }
    }

    /* === Restock reminder === */
    if (data.type === "restock_reminder") {
      if (ADMIN_CHAT_ID) {
        await api.sendMessage(ADMIN_CHAT_ID,
          `🔔 <b>Yangi eslatma o'rnatildi</b>\n\n` +
          `📦 ${esc(data.product_name)}\n` +
          `📅 ${esc(data.remind_in_days)} kundan keyin eslatish\n\n` +
          `⚠️ Cron job qo'shing!`,
          { parse_mode: "HTML" },
        );
      }
      await ctx.reply(`🔔 Eslatma o'rnatildi! ${data.product_name} tugash arafasida sizga xabar beramiz.`);
    }
  });

  /* ────── Start polling ────── */

  /* ────── Daily report + cloud backup to the admin ────── */

  const sendDailyReport = async () => {
    if (!ADMIN_CHAT_ID) return;
    // "Today" = today in TASHKENT (orders are stored in UTC — shift by +5h)
    const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const todayRevenue = (db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE date(created_at, '+5 hours') = ?").get(today) as any).s;
    const todayOrders = (db.prepare("SELECT COUNT(*) c FROM orders WHERE date(created_at, '+5 hours') = ?").get(today) as any).c;
    const newToday = (db.prepare("SELECT COUNT(*) c FROM orders WHERE date(created_at, '+5 hours') = ? AND status = 'new'").get(today) as any).c;
    const weekRevenue = (db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE created_at >= ?").get(weekAgo.toISOString()) as any).s;
    const weekOrders = (db.prepare("SELECT COUNT(*) c FROM orders WHERE created_at >= ?").get(weekAgo.toISOString()) as any).c;
    const avgOrder = todayOrders > 0 ? Math.round(todayRevenue / todayOrders) : 0;
    const top: any[] = db.prepare(`
      SELECT p.name_uz AS name, SUM(oi.qty) AS qty, SUM(oi.qty*oi.price) AS revenue
      FROM order_items oi JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id IN (SELECT id FROM orders WHERE date(created_at, '+5 hours') = ?)
      GROUP BY oi.product_id ORDER BY revenue DESC LIMIT 3
    `).all(today);
    const lowStock: any[] = db.prepare("SELECT name_uz, stock FROM products WHERE stock <= 10 ORDER BY stock ASC LIMIT 3").all();

    let text =
      `📈 <b>DELIS — kunlik hisobot</b>\n\n` +
      `📅 ${new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}\n\n` +
      `💰 <b>Bugungi tushum:</b> ${formatPrice(todayRevenue)}\n` +
      `📦 <b>Buyurtmalar:</b> ${todayOrders} (${newToday} yangi)\n` +
      `🧾 <b>O'rtacha chek:</b> ${formatPrice(avgOrder)}\n` +
      `📆 <b>7 kun:</b> ${weekOrders} ta · ${formatPrice(weekRevenue)}\n`;

    if (top.length > 0) {
      text += `\n🏆 <b>Top mahsulotlar:</b>\n` + top.map((t) => `  ${esc(t.name)} — ${t.qty} dona (${formatPrice(Number(t.revenue) || 0)})`).join("\n");
    }
    if (lowStock.length > 0) {
      text += `\n\n⚠️ <b>Kam qoldiq:</b>\n` + lowStock.map((p) => `  • ${esc(p.name_uz)} — ${p.stock} dona`).join("\n");
    }
    text += `\n\n— DELIS bot`;

    try {
      await api.sendMessage(ADMIN_CHAT_ID, text, {
        parse_mode: "HTML",
        // ?tab=admin lands the admin straight into the Admin Operations Panel
        reply_markup: new InlineKeyboard().webApp("📊 Panelni ochish", `${APP_URL}?tab=admin`),
      });
      console.log("📈 Daily report sent");
    } catch (e) {
      console.error("Daily report failed:", e);
    }
  };

  const sendDailyBackup = async () => {
    if (!ADMIN_CHAT_ID) return;
    try {
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(r => r.name);
      const dump: Record<string, unknown> = { _app: "delis", _version: 1, _exported_at: new Date().toISOString() };
      for (const t of tables) {
        try {
          dump[t] = db.prepare(`SELECT * FROM "${t.replace(/"/g, '""')}"`).all();
        } catch { /* table may not exist yet */ }
      }
      const filename = `DELIS_backup_${new Date().toISOString().slice(0, 10)}.json`;
      await api.sendDocument(ADMIN_CHAT_ID, new InputFile(Buffer.from(JSON.stringify(dump, null, 2), "utf8"), filename), {
        caption: `💾 <b>DELIS avtomatik zaxira</b>\n📅 ${new Date().toLocaleDateString("ru-RU")}`,
        parse_mode: "HTML",
      });
      console.log(`💾 Backup sent: ${filename}`);
    } catch (e) {
      console.error("Backup failed:", e);
    }
  };

  /* ────── DELIS Stars expiry warning (one message per expiry date) ────── */

  const notifyExpiringStars = async () => {
    const config = getLoyaltyConfig(db);
    if (!config.expirationDays) return;
    const users = db.prepare("SELECT tg_id, language FROM users WHERE stars > 0 AND tg_id > 0").all() as Array<{ tg_id: number; language?: string }>;
    for (const user of users) {
      const preview = getExpiryPreview(db, user.tg_id, config.expiryWarningDays);
      if (!preview.amount || !preview.date) continue;
      const key = preview.date.slice(0, 10);
      const inserted = db.prepare(
        "INSERT OR IGNORE INTO loyalty_expiry_notifications (tg_id, warning_key) VALUES (?, ?)",
      ).run(user.tg_id, key);
      if (!inserted.changes) continue;
      const lang = user.language === "ru" || user.language === "en" ? user.language : "uz";
      const date = new Date(preview.date).toLocaleDateString(lang === "uz" ? "uz-UZ" : lang === "en" ? "en-GB" : "ru-RU");
      const messages: Record<string, string> = {
        uz: `⏳ <b>${preview.amount} DELIS Stars</b> ${date} kuni tugaydi. Ularni Stars do'konida ishlatishga ulgurib qoling.`,
        ru: `⏳ <b>${preview.amount} DELIS Stars</b> сгорят ${date}. Успейте использовать их в магазине Stars.`,
        en: `⏳ <b>${preview.amount} DELIS Stars</b> expire on ${date}. Use them in the Stars shop before then.`,
      };
      try {
        await api.sendMessage(user.tg_id, messages[lang], {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().webApp("⭐ DELIS Stars", `${APP_URL}?tab=profile`),
        });
      } catch {
        // Delivery failed (e.g. bot blocked) — allow a later retry.
        db.prepare("DELETE FROM loyalty_expiry_notifications WHERE tg_id = ? AND warning_key = ?").run(user.tg_id, key);
      }
    }
  };

  /* ────── Stuck order alert — remind admin about orders stuck in "new" ────── */

  const checkStuckOrders = async () => {
    if (!ADMIN_CHAT_ID) return;
    const stuck: any[] = db
      .prepare("SELECT id, recipient_name, recipient_phone, total, created_at FROM orders WHERE status = 'new' AND stuck_alerted_at IS NULL AND datetime(created_at) <= datetime('now', '-30 minutes')")
      .all();
    if (stuck.length === 0) return;
    const lines = stuck
      .slice(0, 5)
      .map((o) => `  • #${esc(o.id)} — ${esc(o.recipient_name || "?")} · ${formatPrice(Number(o.total) || 0)}`)
      .join("\n");
    const more = stuck.length > 5 ? `\n  … va yana ${stuck.length - 5} ta` : "";
    try {
      await api.sendMessage(
        ADMIN_CHAT_ID,
        `⏰ <b>${"Diqqat! Kutayotgan buyurtmalar / Внимание! Зависшие заказы"}</b>\n\n${lines}${more}\n\n${"30+ daqiqa davomida qabul qilinmagan / Не приняты более 30 минут"}.`,
        { parse_mode: "HTML" },
      );
      const markAlerted = db.prepare("UPDATE orders SET stuck_alerted_at = datetime('now') WHERE id = ?");
      db.transaction(() => { for (const order of stuck) markAlerted.run(order.id); })();
      console.log(`⏰ Stuck orders alert: ${stuck.length}`);
    } catch (e) {
      console.error("Stuck orders alert failed:", e);
    }
  };

  /* Hours in REPORT_HOUR / BACKUP_HOUR are TASHKENT time (UTC+5, no DST) —
     the server itself may run in any timezone (Render = UTC). */
  const tashkentNow = () => new Date(Date.now() + (5 * 60 + new Date().getTimezoneOffset()) * 60_000);

  const runScheduled = () => {
    const now = tashkentNow();
    void checkStuckOrders();
    if (now.getHours() === Number(process.env.REPORT_HOUR || 18) && now.getMinutes() < 30) {
      void sendDailyReport();
    }
    if (now.getHours() === Number(process.env.BACKUP_HOUR || 3) && now.getMinutes() < 30) {
      void sendDailyBackup();
    }
    if (now.getHours() === 10 && now.getMinutes() < 30) {
      void notifyExpiringStars();
    }
  };
  runScheduled();
  const schedTimer = setInterval(runScheduled, 30 * 60 * 1000);
  const adminRetryTimer = setInterval(() => { void retryPendingAdminOrders(); }, 60 * 1000);

  process.on("exit", () => {
    clearInterval(schedTimer);
    clearInterval(adminRetryTimer);
  });

  /* Poll with self-healing: a 409 conflict means another process is polling
     getUpdates with the same token (rolling deploy overlap, a second service
     or a local run). That must never crash the API — retry with backoff. */
  const startPolling = async (attempt = 0): Promise<void> => {
    try {
      await bot.start({
        onStart: () => {
          console.log("🤖 DELIS Telegram bot running.");
          void retryPendingAdminOrders();
          void checkSubscriptions();
        },
      });
    } catch (err: any) {
      const conflict =
        err?.error_code === 409 || String(err?.message || err || "").includes("409");
      const delay = Math.min((conflict ? 15_000 : 5_000) * (attempt + 1), 120_000);
      console.warn(
        `⚠️  Bot polling failed: ${conflict ? "409 — another bot instance holds getUpdates" : err?.message || err}. ` +
          `Retrying in ${Math.round(delay / 1000)}s (API keeps serving).`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return startPolling(attempt + 1);
    }
  };
  void startPolling();
}

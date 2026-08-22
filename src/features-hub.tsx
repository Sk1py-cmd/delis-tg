/**
 * DELIS — Блоки лояльности на главной: бейджи наличия и кэшбэка, баннер программы, центр уведомлений.
 */
import { useCallback, useMemo, useState } from "react";
import { useI18n, type Lang } from "./i18n";
import { CONFIG } from "./config";
import {
  type Order,
  type Product,
  PRODUCTS,
  LOYALTY_TIERS,
  type LoyaltyTier,
} from "./data";
import type { LoyaltyConfig } from "./api";
import { formatPrice, haptic } from "./kit";
import {
  IconArrow,
  IconBell,
  IconCheck,
  IconCrown,
  IconSend,
  IconStar,
  IconStarsOrbit,
  IconStore,
  IconSymbol,
  IconTierSignal,
  IconTruck,
  IconTrash,
} from "./icons";
import { Sheet } from "./chrome";

/* ============================================================
   2. STOCK BADGE — "В наличии 48 шт" / "Под заказ"
   ============================================================ */

export function StockBadge({ product }: { product: Product }) {
  const { t } = useI18n();
  const stock = product.stock;
  if (stock === undefined || stock === null) return null;

  const low = stock > 0 && stock <= 5;
  const out = stock === 0;

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
        out
          ? "bg-[#B3402E]/12 text-[#B3402E]"
          : low
            ? "bg-amber/15 text-amberdeep"
            : "bg-sagetint text-pine"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          out ? "bg-[#B3402E]" : low ? "bg-amber" : "bg-moss"
        }`}
      />
      {out ? t("stockOut") : `${stock} ${t("stockIn")}`}
    </div>
  );
}

/* ============================================================
   3. CASHBACK BADGE — shown on product cards & home
   ============================================================ */

export function CashbackBadge({
  price,
  stars,
}: {
  price: number;
  stars: number;
}) {
  const tier: LoyaltyTier =
    stars >= 1500 ? "gold" : stars >= 500 ? "silver" : "bronze";
  const rate = LOYALTY_TIERS[tier].cashbackPercent;
  const earn = Math.round((price * rate) / 100 / 10) * 10;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber/12 px-2 py-0.5 text-[9px] font-bold text-amberdeep">
      <IconStar size={9} />
      +{earn} ({rate}%)
    </span>
  );
}

/* ============================================================
   4. LOYALTY BANNER — home screen hero card
   ============================================================ */

export function LoyaltyHomeBanner({
  stars,
  config,
  onPress,
  onShop,
}: {
  stars: number;
  config?: LoyaltyConfig | null;
  onPress: () => void;
  onShop?: () => void;
}) {
  const { lang } = useI18n();
  const silverMin = config?.tiers.silver.minStars ?? 500;
  const goldMin = config?.tiers.gold.minStars ?? 1500;
  const tier: LoyaltyTier = stars >= goldMin ? "gold" : stars >= silverMin ? "silver" : "bronze";
  const baseInfo = LOYALTY_TIERS[tier];
  const info = { ...baseInfo, cashbackPercent: config?.tiers[tier].cashbackPercent ?? baseInfo.cashbackPercent };
  const next: LoyaltyTier = tier === "bronze" ? "silver" : tier === "silver" ? "gold" : "gold";
  const baseNextInfo = LOYALTY_TIERS[next];
  const nextInfo = { ...baseNextInfo, minStars: next === "silver" ? silverMin : goldMin };
  const pct =
    tier === "gold"
      ? 100
      : Math.min(100, Math.round((stars / nextInfo.minStars) * 100));

  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);

  return (
    <section className="mx-4 mt-4 min-[390px]:mx-5 min-[390px]:mt-5">
      <button
        onClick={() => {
          haptic("medium");
          onPress();
        }}
        className="loyalty-home-cyber motion-surface press group relative block w-full overflow-hidden rounded-[28px] border border-[#60ff9b]/20 text-left shadow-lift"
      >
        {/* Decorative */}
        <div className="pointer-events-none absolute inset-0">
          <div className="noise-layer opacity-15" />
          <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full border-[14px] border-white/[0.06]" />
          <div className="absolute -bottom-16 -left-8 h-44 w-44 rounded-full bg-white/[0.04]" />
        </div>

        <div className="relative p-5">
          {/* Top row: tier + cashback */}
          <div className="flex items-center justify-between gap-2">
            <span
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em]"
              style={{
                background: `${info.color}26`,
                color: info.color === "#CD7F32" ? "#e8a56e" : info.color === "#94A3B8" ? "#cbd5e1" : "#374151",
                border: `1px solid ${info.color}55`,
              }}
            >
              <IconTierSignal size={15} filled />
              {info.name[lang]}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] font-bold text-white/90 backdrop-blur-sm">
              <IconStarsOrbit size={14} /> {info.cashbackPercent}% {L("keshbek", "кэшбэк", "cashback")}
            </span>
          </div>

          {/* Balance */}
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/50">
                {L("Balansingiz", "Ваш баланс", "Your balance")}
              </p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="font-display text-[34px] font-extrabold leading-none tracking-tight text-white">
                  {stars.toLocaleString()}
                </span>
                <span className="text-[#60ff9b]"><IconStarsOrbit size={21} /></span>
              </p>
            </div>
            <span className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-sm transition-transform duration-300 group-hover:translate-x-0.5">
              <IconArrow size={16} />
            </span>
          </div>

          {/* Progress to next tier */}
          {tier !== "gold" ? (
            <div className="mt-4 rounded-[16px] bg-black/20 px-3.5 py-3 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-white/85">
                  <IconTierSignal size={15} />
                  <span className="truncate">{nextInfo.name[lang]}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] font-extrabold text-amber">{nextInfo.minStars - stars} <IconStarsOrbit size={13} /></span>
              </div>
              <div className="mt-2 h-[6px] overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber to-[#4ade80] transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] font-semibold text-white/50">
                {L("Qolgan", "Осталось", "Left")}: {nextInfo.minStars - stars} {L("yulduz", "звёзд", "stars")}
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-[16px] bg-black/20 px-3.5 py-3 text-center text-[12px] font-bold text-amber backdrop-blur-sm">
              <span className="inline-flex items-center justify-center gap-1.5"><IconCrown size={17} /> {L("Siz eng yuqori darajadasiz!", "Вы на высшем уровне!", "You are at the top tier!")}</span>
            </div>
          )}

          {/* Stars shop */}
          {onShop && (
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); haptic("medium"); onShop?.(); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onShop?.(); } }}
              className="press mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[14px] border border-white/15 bg-white/10 py-2.5 text-[12px] font-bold text-white backdrop-blur-md transition-colors hover:bg-white/20"
            >
              <IconStore size={16} /> {L("Yulduzlar do'koni", "Магазин звёзд", "Stars shop")}
              <span className="text-amber"><IconArrow size={13} /></span>
            </div>
          )}
        </div>
      </button>
    </section>
  );
}

/* ============================================================
   5. NOTIFICATION CENTER — real notifications panel
   ============================================================ */

export type Notification = {
  id: string;
  kind: "order" | "promo" | "system" | "delivery";
  title: string;
  body: string;
  time: number; // timestamp
  read: boolean;
  orderId?: string;
};

export function useNotifications() {
  const [items, setItems] = useState<Notification[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("delis_notifs") || "[]");
    } catch {
      return [];
    }
  });

  const unreadCount = items.filter((n) => !n.read).length;

  const add = useCallback((n: Omit<Notification, "id" | "time" | "read">) => {
    setItems((prev) => {
      const next: Notification = {
        ...n,
        id: `n-${Date.now()}`,
        time: Date.now(),
        read: false,
      };
      const updated = [next, ...prev].slice(0, 50);
      localStorage.setItem("delis_notifs", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setItems((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      localStorage.setItem("delis_notifs", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      localStorage.setItem("delis_notifs", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    localStorage.removeItem("delis_notifs");
  }, []);

  return { items, unreadCount, add, markRead, markAllRead, clear };
}

export function NotificationPanel({
  open,
  onClose,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClear: () => void;
}) {
  const { t } = useI18n();

  const kindIcon: Record<string, string> = {
    order: "📦",
    promo: "🎉",
    system: "💡",
    delivery: "🚚",
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("notifTitle")}>
      <div className="space-y-4 pt-1">
        {notifications.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-ink2">
              {unreadCount > 0 ? `${unreadCount} ${t("notifTitle").toLowerCase()}` : t("notifEmpty")}
            </span>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="press text-[11px] font-bold text-pine"
                >
                  {t("notifMarkRead")}
                </button>
              )}
              <button
                onClick={onClear}
                className="press flex items-center gap-1 text-[11px] font-bold text-[#B3402E]"
              >
                <IconTrash size={11} /> {t("opLogsClear")}
              </button>
            </div>
          </div>
        )}

        {notifications.length === 0 ? (
          <div className="py-12 text-center">
            <div className="motion-icon-tile mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-paper2 text-pine">
              <IconBell size={29} />
            </div>
            <p className="mt-4 text-[13px] font-medium text-ink2">{t("notifEmpty")}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => onMarkRead(n.id)}
                className={`press flex w-full items-start gap-3 rounded-[20px] border p-4 text-left transition-all ${
                  n.read
                    ? "border-ink/18 bg-card"
                    : "border-pine/20 bg-sagetint/60"
                }`}
              >
                <span className="motion-icon-tile grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-black/5 text-pine"><IconSymbol symbol={kindIcon[n.kind] || "💡"} size={21} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-ink">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] text-ink2">
                    {n.body}
                  </p>
                  <p className="mt-1 text-[10px] font-medium text-ink2/75">
                    {new Date(n.time).toLocaleString()}
                  </p>
                </div>
                {!n.read && (
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-pine" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ============================================================
   6. ADMIN ANALYTICS — KPI cards + product & region tables
   ============================================================ */

export function AdminAnalyticsTab({
  orders,
  lang,
}: {
  orders: Order[];
  lang: Lang;
}) {
  const { t } = useI18n();

  const totalRevenue = useMemo(
    () => orders.reduce((s, o) => s + (o.total || 0), 0),
    [orders],
  );
  const avgCheck = useMemo(
    () => (orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0),
    [orders, totalRevenue],
  );
  const delivered = useMemo(
    () => orders.filter((o) => o.status === "delivered").length,
    [orders],
  );

  // Top products
  const topProducts = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) =>
      o.items?.forEach((it) => {
        counts[it.id] = (counts[it.id] || 0) + (it.qty || 1);
      }),
    );
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, qty]) => {
        const p = PRODUCTS.find((x) => x.id === id);
        return { id, name: p?.name || id, qty, img: p?.img };
      });
  }, [orders]);

  // Region breakdown
  const regions = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) => {
      const r = o.deliveryZone || "Unknown";
      counts[r] = (counts[r] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([region, count]) => ({ region, count, pct: Math.round((count / orders.length) * 100) }));
  }, [orders]);

  return (
    <div className="space-y-4 animate-pop">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[22px] border border-ink/18 bg-card p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink2">
            {t("adminAnalyticsRev")}
          </p>
          <p className="mt-1.5 font-display text-[18px] font-bold text-moss">
            {formatPrice(totalRevenue, lang)}
          </p>
        </div>
        <div className="rounded-[22px] border border-ink/18 bg-card p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink2">
            {t("adminAvgCheck")}
          </p>
          <p className="mt-1.5 font-display text-[18px] font-bold text-pine">
            {formatPrice(avgCheck, lang)}
          </p>
        </div>
        <div className="rounded-[22px] border border-ink/18 bg-card p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink2">
            {t("adminOrdersCount")}
          </p>
          <p className="mt-1.5 font-display text-[18px] font-bold text-ink">
            {orders.length}
          </p>
        </div>
        <div className="rounded-[22px] border border-ink/18 bg-card p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink2">
            {t("adminDelivered")}
          </p>
          <p className="mt-1.5 font-display text-[18px] font-bold text-moss">
            {delivered} / {orders.length}
          </p>
        </div>
      </div>

      {/* Top Products */}
      <div className="rounded-[22px] border border-ink/18 bg-card p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink2 mb-3">
          {t("adminTopProducts")}
        </p>
        <div className="space-y-2.5">
          {topProducts.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3">
              <span className="font-display text-[13px] font-bold text-ink2 w-4">
                {i + 1}
              </span>
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-[10px] bg-paper2">
                {p.img && (
                  <img src={p.img} alt={p.name} className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold text-ink">{p.name}</p>
              </div>
              <span className="font-display text-[13px] font-bold text-ink">
                {p.qty}×
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Region Breakdown */}
      <div className="rounded-[22px] border border-ink/18 bg-card p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink2 mb-3">
          {t("adminRegions")}
        </p>
        <div className="space-y-2">
          {regions.slice(0, 6).map((r) => (
            <div key={r.region}>
              <div className="flex justify-between text-[12px] font-semibold text-ink mb-1">
                <span className="truncate max-w-[180px]">{r.region}</span>
                <span>
                  {r.count} ({r.pct}%)
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-amber/8">
                <div
                  className="h-full rounded-full bg-moss transition-all duration-500"
                  style={{ width: `${r.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   7. PDF INVOICE GENERATOR — creates printable HTML
   ============================================================ */

export function generateInvoiceHtml(order: Order, lang: Lang): string {
  // Pure HTML generator — no hooks
  const itemRows = (order.items || [])
    .map(
      (it) =>
        `<tr>
           <td style="padding:8px;border-bottom:1px solid #e5e9e7;font-size:13px">${it.name}</td>
           <td style="padding:8px;border-bottom:1px solid #e5e9e7;text-align:center;font-size:13px">${it.qty}</td>
           <td style="padding:8px;border-bottom:1px solid #e5e9e7;text-align:right;font-size:13px">${formatPrice(it.price, lang)}</td>
           <td style="padding:8px;border-bottom:1px solid #e5e9e7;text-align:right;font-size:13px;font-weight:700">${formatPrice(it.price * it.qty, lang)}</td>
         </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>DELIS Invoice #${order.id}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#0c1411;padding:32px}
    .brand{font-size:22px;font-weight:800;letter-spacing:2px;color:#1f2937}
    .muted{color:#54685f;font-size:12px}
    h1{font-size:18px;margin:24px 0 4px}
    .meta{display:flex;justify-content:space-between;flex-wrap:wrap;margin:12px 0 20px}
    .meta div{width:48%;margin-bottom:8px}
    .label{color:#54685f;font-size:11px;text-transform:uppercase;letter-spacing:1px}
    .value{font-weight:600;font-size:13px;margin-top:2px}
    table{width:100%;border-collapse:collapse;margin:16px 0}
    th{background:#f2f5f3;text-align:left;font-size:11px;padding:8px;text-transform:uppercase;letter-spacing:0.5px}
    .totals{margin-top:12px;text-align:right}
    .totals div{margin:4px 0;font-size:13px}
    .total-row{font-size:17px;font-weight:800;border-top:2px solid #0c1411;padding-top:8px}
    .footer{margin-top:40px;font-size:11px;color:#54685f;border-top:1px solid #e5e9e7;padding-top:12px}
  </style>
</head>
<body>
  <div class="brand">DELIS</div>
  <div class="muted">${lang === "uz" ? "Uy va avto parvarish · Namangan zavodi" : lang === "ru" ? "Уход за домом и авто · Завод Наманган" : "Home & car care · Namangan factory"}</div>
  <h1>${lang === "uz" ? "Invoys" : lang === "ru" ? "Инвойс" : "Invoice"} #${order.id}</h1>
  <div class="meta">
    <div><div class="label">${lang === "uz" ? "Sana" : lang === "ru" ? "Дата" : "Date"}</div><div class="value">${order.date}</div></div>
    <div><div class="label">${lang === "uz" ? "Mijoz" : lang === "ru" ? "Получатель" : "Recipient"}</div><div class="value">${order.recipientName} · ${order.recipientPhone}</div></div>
    <div><div class="label">${lang === "uz" ? "Manzil" : lang === "ru" ? "Адрес" : "Address"}</div><div class="value">${order.deliveryAddress}</div></div>
    <div><div class="label">${lang === "uz" ? "Yetkazish" : lang === "ru" ? "Доставка" : "Delivery"}</div><div class="value">${order.deliveryMethod}</div></div>
  </div>
  <table>
    <thead>
      <tr><th>${lang === "uz" ? "Mahsulot" : lang === "ru" ? "Товар" : "Product"}</th><th>${lang === "uz" ? "Soni" : lang === "ru" ? "Кол-во" : "Qty"}</th><th>${lang === "uz" ? "Narxi" : lang === "ru" ? "Цена" : "Price"}</th><th>${lang === "uz" ? "Summa" : lang === "ru" ? "Итого" : "Total"}</th></tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="totals">
    <div>${lang === "uz" ? "Mahsulotlar" : lang === "ru" ? "Подытог" : "Subtotal"}: ${formatPrice(order.subtotal, lang)}</div>
    ${order.discount > 0 ? `<div>${lang === "uz" ? "Chegirma" : lang === "ru" ? "Скидка" : "Discount"} (${order.promoCode}): -${formatPrice(order.discount, lang)}</div>` : ""}
    <div>${lang === "uz" ? "Yetkazish" : lang === "ru" ? "Доставка" : "Delivery"}: ${order.deliveryFee === 0 ? (lang === "uz" ? "Bepul" : lang === "ru" ? "Бесплатно" : "Free") : formatPrice(order.deliveryFee, lang)}</div>
    <div class="total-row">${lang === "uz" ? "Jami" : lang === "ru" ? "Итого" : "Total"}: ${formatPrice(order.total, lang)}</div>
  </div>
  <div class="footer">
    ${CONFIG.COMPANY_NAME_SHORT} · ${CONFIG.REQUISITES.address}<br/>
    ${lang === "uz" ? "Xaridingiz uchun rahmat!" : lang === "ru" ? "Спасибо за покупку!" : "Thank you for your purchase!"}
  </div>
  <script>window.onload=()=>{window.print();};</script>
</body></html>`;
}

export function printInvoice(order: Order, lang: Lang) {
  haptic("medium");
  const html = generateInvoiceHtml(order, lang);
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

/* ============================================================
   8. CSV EXPORT — for 1C / Excel / accounting
   ============================================================ */

export function exportOrdersCsv(orders: Order[]) {
  haptic("success");
  const header = [
    "id",
    "date",
    "status",
    "payment",
    "name",
    "phone",
    "region",
    "address",
    "items",
    "subtotal",
    "discount",
    "delivery_fee",
    "total",
  ];

  const escape = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = orders.map((o) =>
    [
      `#${o.id}`,
      o.date,
      o.status,
      o.paymentMethod || "cash",
      o.recipientName,
      o.recipientPhone,
      o.deliveryZone || "",
      (o.deliveryAddress || "").replace(/;/g, ","),
      o.items?.map((it) => `${it.name} x${it.qty}`).join(" | ") || "",
      o.subtotal || 0,
      o.discount || 0,
      o.deliveryFee || 0,
      o.total || 0,
    ]
      .map(escape)
      .join(";"),
  );

  const csv = "\uFEFF" + [header.join(";"), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `DELIS_orders_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
   9. MASS PUSH NOTIFICATION — admin sends to all customers
   ============================================================ */

export function AdminPushPanel({
  onSend,
}: {
  onSend: (kind: string, title: string, body: string) => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<"promo" | "product" | "system">("promo");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const kinds = [
    { id: "promo", label: t("pushPromo"), icon: "🎉" },
    { id: "product", label: t("pushProduct"), icon: "🆕" },
    { id: "system", label: t("pushSystem"), icon: "💡" },
  ] as const;

  return (
    <div className="space-y-3 animate-pop">
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink2">
        {t("pushTitle")}
      </p>

      {/* Type selector */}
      <div className="flex gap-1.5">
        {kinds.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`press flex-1 rounded-[16px] px-3 py-2.5 text-[11.5px] font-bold text-center transition-all ${
              kind === k.id
                ? "bg-amber text-white shadow-sm"
                : "bg-paper2 text-ink2 border border-ink/18"
            }`}
          >
            <span className="inline-flex items-center justify-center gap-1.5"><IconSymbol symbol={k.icon} size={16} /> {k.label}</span>
          </button>
        ))}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("pushTitlePh")}
        className="w-full rounded-[16px] border border-ink/15 bg-card px-4 py-3 text-[13.5px] font-semibold text-ink outline-none placeholder:text-ink2/75 focus:border-moss"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("pushBodyPh")}
        rows={3}
        className="w-full resize-none rounded-[16px] border border-ink/15 bg-card px-4 py-3 text-[13.5px] font-semibold text-ink outline-none placeholder:text-ink2/75 focus:border-moss"
      />
      <button
        onClick={() => {
          if (title.trim()) {
            onSend(kind, title.trim(), body.trim());
            setTitle("");
            setBody("");
          }
        }}
        disabled={!title.trim()}
        className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-amber text-[13.5px] font-bold text-white shadow-sm disabled:opacity-40"
      >
        <IconSend size={15} /> {t("pushSend")}
      </button>
    </div>
  );
}

/* ============================================================
   10. FREE DELIVERY BANNER — visible on catalog page
   ============================================================ */

export function FreeDeliveryBanner({
  cartTotal,
  onViewCart,
}: {
  cartTotal: number;
  onViewCart: () => void;
}) {
  const { t, lang } = useI18n();
  const threshold = 150000;
  const remaining = Math.max(0, threshold - cartTotal);
  const pct = Math.min(100, Math.round((cartTotal / threshold) * 100));
  const done = remaining === 0;

  if (cartTotal === 0) return null;

  return (
    <button
      onClick={onViewCart}
      className="press mx-5 mt-4 flex items-center gap-3 rounded-[20px] border border-ink/18 bg-card p-3.5 text-left shadow-sm"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          done ? "bg-moss text-white" : "bg-amber/15 text-amber"
        }`}
      >
        {done ? <IconCheck size={16} /> : <IconTruck size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold text-ink">
          {done
            ? t("freeDeliveryUnlocked")
            : `${t("freeDeliveryProgress")} ${formatPrice(remaining, lang)}`}
        </p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-amber/8">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              done ? "bg-moss" : "bg-amber"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </button>
  );
}

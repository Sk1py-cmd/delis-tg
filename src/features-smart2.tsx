/**
 * DELIS — Умные функции: отслеживание заказа по статусу, рекомендации товаров, быстрые действия с товаром.
 */
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "./i18n";
import { useSiteSettings, phoneHref } from "./site-settings";
import { type Order, type Product, PRODUCTS } from "./data";
import { formatPrice, haptic } from "./kit";
import { IconCheck, IconClock, IconFactory, IconHeart, IconMap, IconMotorcycle, IconNote, IconPhone, IconPlus, IconRepeat, IconSearch, IconSparkle, IconSymbol, IconTruck } from "./icons";
import { Sheet } from "./chrome";
import { fetchOrderTracking } from "./api";

/* Live courier position polled from the backend (Telegram live-location). */
type CourierTrack = { active: boolean; lat?: number; lon?: number; staleSec?: number } | null;

function CourierLiveMap({ track, lang }: { track: CourierTrack; lang: "uz" | "ru" | "en" }) {
  if (!track?.active || track.lat == null || track.lon == null) return null;
  const { lat, lon } = track;
  const bbox = `${lon - 0.012},${lat - 0.009},${lon + 0.012},${lat + 0.009}`;
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
  const stale = track.staleSec ?? 0;
  const fresh = stale < 60 ? `${stale}${lang === "ru" ? " сек" : lang === "en" ? "s" : "s"}` : `${Math.floor(stale / 60)}${lang === "ru" ? " мин" : lang === "en" ? "m" : "daq"}`;
  return (
    <div className="animate-pop space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink/65">
          <span className="inline-flex items-center gap-1.5"><IconMotorcycle size={14} /> {lang === "uz" ? "Kuryer xaritada" : lang === "ru" ? "Курьер на карте" : "Courier on the map"}</span>
        </p>
        <span className="flex items-center gap-1.5 rounded-full bg-moss/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-moss">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-moss" />
          {lang === "uz" ? "Jonli" : lang === "ru" ? "Live" : "Live"} · {fresh}
        </span>
      </div>
      <div className="overflow-hidden rounded-[22px] border border-ink/18 shadow-sm">
        <iframe
          title="courier-map"
          src={embed}
          className="h-[220px] w-full"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
      <a
        href={`https://yandex.uz/maps/?pt=${lon},${lat}&z=15&l=map`}
        target="_blank"
        rel="noreferrer"
        className="press flex items-center justify-center gap-1.5 rounded-[14px] bg-paper2 py-2 text-[12px] font-bold text-ink"
      >
        <IconMap size={16} /> {lang === "uz" ? "Yandex xaritada ochish" : lang === "ru" ? "Открыть в Яндекс.Картах" : "Open in Yandex Maps"}
      </a>
    </div>
  );
}

/* ============================================================
   1. ORDER TRACKING BY BTS CODE / ORDER NUMBER
   ============================================================ */

export function OrderTrackingSheet({
  open,
  onClose,
  orders,
  initialQuery,
}: {
  open: boolean;
  onClose: () => void;
  orders: Order[];
  /** Bot deep link ?tab=tracking&order=DL-XXXX — prefill + auto-search. */
  initialQuery?: string;
}) {
  const { t, lang } = useI18n();
  const site = useSiteSettings();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);

  /* Poll the backend for the courier's live position while tracking a shipped order */
  const [track, setTrack] = useState<CourierTrack>(null);
  useEffect(() => {
    if (!open || !result || result.status !== "shipped") { setTrack(null); return; }
    let cancelled = false;
    const orderId = result.id;
    const tick = () => {
      void fetchOrderTracking(orderId).then((r) => { if (!cancelled && r) setTrack(r); });
    };
    tick();
    const iv = window.setInterval(tick, 15_000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [open, result?.id, result?.status]);

  const normalize = (raw: string) => raw.trim().toUpperCase().replace(/^BTS[- ]?/, "");

  const findOrder = (raw: string): Order | null => {
    const norm = normalize(raw);
    if (!norm) return null;
    // Try to match by order id (DL-XXXX)
    const byOrderId = orders.find((o) => o.id.toUpperCase() === norm || o.id.toUpperCase().replace("DL-", "") === norm);
    // Try to match by BTS code in courier note
    const byBts = orders.find((o) => o.courierNote?.toUpperCase().includes(`BTS: ${norm}`) || o.courierNote?.toUpperCase().includes(norm));
    return byOrderId || byBts || null;
  };

  const runSearch = (raw: string) => {
    const match = findOrder(raw);
    if (match) {
      setResult(match);
      setNotFound(false);
    } else {
      setResult(null);
      setNotFound(true);
    }
  };

  /* Bot deep link ?tab=tracking&order=DL-1234: prefill and auto-search.
     Orders may still be loading from the server — rerun when they arrive. */
  useEffect(() => {
    if (!open || !initialQuery) return;
    setQuery(initialQuery);
    runSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuery, orders]);

  const normalized = normalize(query);

  const handleTrack = () => {
    haptic("medium");
    if (!normalized) return;
    runSearch(query);
  };

  const steps = [
    { id: "new", label: t("trackStatusNew") },
    { id: "preparing", label: t("trackStatusPreparing") },
    { id: "shipped", label: t("trackStatusShipped") },
    { id: "delivered", label: t("trackStatusDelivered") },
  ] as const;
  const currentIdx = result ? steps.findIndex((s) => s.id === result.status) : -1;

  return (
    <Sheet open={open} onClose={onClose} title={t("trackTitle")}>
      <div className="space-y-4 pt-1">
        <p className="text-[13px] font-medium text-ink2">{t("trackSub")}</p>

        {/* Search input */}
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2.5 rounded-[18px] border border-ink/15 bg-card px-3.5 py-3 shadow-sm">
            <IconSearch size={17} className="text-ink2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTrack()}
              placeholder={t("trackPh")}
              className="flex-1 bg-transparent text-[14px] font-semibold text-ink outline-none placeholder:text-ink2/75"
            />
          </label>
          <button
            onClick={handleTrack}
            className="press flex h-12 shrink-0 items-center gap-1.5 rounded-[18px] bg-amber px-4 text-[13px] font-bold text-white"
          >
            <IconTruck size={15} />
            <span>{t("trackBtn")}</span>
          </button>
        </div>

        {/* Example hint */}
        {!result && !notFound && (
          <p className="text-center text-[11px] font-semibold text-ink2/75">
            {t("trackExample")}
          </p>
        )}

        {/* Not found state */}
        {notFound && (
          <div className="animate-pop rounded-[24px] border border-ink/18 bg-card p-6 text-center">
            <div className="motion-icon-tile mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-amber/15 text-amberdeep"><IconSearch size={25} /></div>
            <p className="mt-3 font-display text-[16px] font-bold text-ink">{t("trackNotFound")}</p>
            <p className="mt-1 text-[13px] text-ink2">{t("trackNotFoundSub")}</p>
          </div>
        )}

        {/* Found result */}
        {result && (
          <div className="animate-pop space-y-3">
            {/* Order header */}
            <div className="rounded-[22px] border border-moss/20 bg-sagetint/60 p-4">
              <div className="flex items-center justify-between">
                <span className="font-display text-[16px] font-bold text-ink">#{result.id}</span>
                <span className="rounded-full bg-moss px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  {steps[currentIdx]?.label.split(" ")[0]}
                </span>
              </div>
              <p className="mt-1 text-[12px] font-medium text-ink2">
                {result.date} · {result.recipientName}
              </p>
              <p className="mt-2 font-display text-[15px] font-bold text-ink">
                {formatPrice(result.total, lang)}
              </p>
            </div>

            {/* Timeline */}
            <div className="rounded-[22px] border border-ink/18 bg-card p-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink2">
                {t("trackSteps")}
              </p>
              <div className="mt-4 space-y-0">
                {steps.map((s, i) => {
                  const isPast = i <= currentIdx;
                  const isCurrent = i === currentIdx;
                  return (
                    <div key={s.id} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            isPast
                              ? "bg-moss text-white"
                              : "border border-ink/15 bg-paper2 text-ink2"
                          }`}
                        >
                          {isPast ? <IconCheck size={12} strokeWidth={2.6} /> : i + 1}
                        </span>
                        {i < steps.length - 1 && (
                          <span className={`h-7 w-[2px] ${i < currentIdx ? "bg-moss" : "bg-amber/10"}`} />
                        )}
                      </div>
                      <div className={`pt-0.5 ${isCurrent ? "" : isPast ? "opacity-80" : "opacity-45"}`}>
                        <p className="text-[13px] font-bold text-ink">{s.label}</p>
                        {isCurrent && <p className="text-[11px] font-semibold text-moss">• {result.date}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Real courier live-map (Telegram live-location → server → OSM) */}
            <CourierLiveMap track={track} lang={lang} />
            {result.status === "shipped" && track && !track.active && (
              <div className="rounded-[16px] border border-amber/25 bg-amber/[0.07] px-3.5 py-2.5 text-[12px] font-semibold text-amberdeep">
                <span className="inline-flex items-start gap-1.5"><IconMotorcycle size={16} className="mt-0.5 shrink-0" /> {lang === "uz"
                  ? "Kuryer hali jonli lokatsiyani yoqmadi — yoqqach bu yerda haqiqiy xarita ochiladi"
                  : lang === "ru"
                    ? "Курьер ещё не включил live-геолокацию — как только включит, здесь появится живая карта"
                    : "The courier hasn't started live location yet — the live map will appear here"}</span>
              </div>
            )}

            {/* Live courier map */}
            {result.courier && result.status !== "delivered" && !track?.active && (
              <div className="animate-pop space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink/65">
                    <span className="inline-flex items-center gap-1.5"><IconMap size={14} /> {lang === "uz" ? "Jonli xarita" : lang === "ru" ? "Живая карта" : "Live map"}</span>
                  </p>
                  <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${result.status === "shipped" ? "bg-moss/12 text-moss" : "bg-amber/15 text-amberdeep"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${result.status === "shipped" ? "animate-pulse bg-moss" : "bg-amber"}`} />
                    {result.status === "shipped" ? (lang === "uz" ? "Jonli" : lang === "ru" ? "В пути" : "Live") : (lang === "uz" ? "Tayinlandi" : lang === "ru" ? "Назначен" : "Assigned")}
                  </span>
                </div>

                {/* Stylized map */}
                <div className="relative h-[200px] w-full overflow-hidden rounded-[22px] bg-[#e9f3ec]">
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 200" fill="none">
                    <g stroke="rgba(31,41,55,0.10)" strokeWidth="1">
                      <path d="M0 55h320M0 110h320M0 165h320M55 0v200M130 0v200M205 0v200M270 0v200" />
                    </g>
                    <g fill="rgba(31,41,55,0.05)">
                      <rect x="8" y="8" width="44" height="44" rx="8" /><rect x="136" y="8" width="60" height="44" rx="8" /><rect x="212" y="8" width="50" height="44" rx="8" />
                      <rect x="60" y="60" width="60" height="44" rx="8" /><rect x="212" y="60" width="50" height="44" rx="8" />
                      <rect x="8" y="112" width="44" height="44" rx="8" /><rect x="136" y="112" width="60" height="44" rx="8" /><rect x="212" y="112" width="50" height="44" rx="8" />
                    </g>
                    {/* Route */}
                    <path d="M24 118 C 60 96, 100 92, 150 88 S 240 86, 290 36" stroke="rgba(55,65,81,0.45)" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 7" fill="none" />
                    <circle cx="24" cy="118" r="9" fill="#fff" stroke="#1f2937" strokeWidth="2.5" />
                    <foreignObject x="16" y="110" width="16" height="16"><div className="grid h-4 w-4 place-items-center text-[#1f2937]"><IconFactory size={10} /></div></foreignObject>
                    <circle cx="290" cy="36" r="10" fill="#fff" stroke="#1f2937" strokeWidth="2.5" />
                    <foreignObject x="282" y="28" width="16" height="16"><div className="grid h-4 w-4 place-items-center text-[#1f2937]"><IconSymbol symbol="🏠" size={10} /></div></foreignObject>
                    {/* Courier dot — position by progress */}
                    {(() => {
                      const p = Math.max(0, Math.min(100, result.courier?.progress ?? 0));
                      const x = 24 + (290 - 24) * (p / 100);
                      const y = 118 - (118 - 36) * (p / 100) * 0.92;
                      return (
                        <g>
                          <circle cx={x} cy={y} r="14" fill="rgba(31,41,55,0.25)" className={result.status === "shipped" ? "animate-ping" : ""} style={{ transformOrigin: `${x}px ${y}px` }} />
                          <circle cx={x} cy={y} r="8" fill="#1f2937" stroke="#fff" strokeWidth="2.5" />
                          <foreignObject x={x - 7} y={y - 7} width="14" height="14"><div className="grid h-[14px] w-[14px] place-items-center text-white"><IconTruck size={9} /></div></foreignObject>
                        </g>
                      );
                    })()}
                  </svg>
                  <span className="absolute right-2.5 top-2.5 rounded-full bg-amber/80 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
                    <span className="inline-flex items-center gap-1"><IconClock size={12} /> ETA: {result.courier.eta || "—"}</span>
                  </span>
                </div>

                {/* Progress */}
                <div className="rounded-[16px] border border-ink/18 bg-card p-3.5">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-ink">{lang === "uz" ? "Yetkazish jarayoni" : lang === "ru" ? "Процесс доставки" : "Delivery progress"}</span>
                    <span className="font-display text-[14px] text-moss">{Math.round(result.courier.progress || 0)}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber/6">
                    <div className="h-full rounded-full bg-gradient-to-r from-pine to-moss transition-all duration-700" style={{ width: `${Math.max(4, Math.min(100, result.courier.progress || 0))}%` }} />
                  </div>
                </div>
              </div>
            )}

            {/* Courier note */}
            {result.courierNote && (
              <div className="rounded-[18px] bg-paper2 p-3.5 text-[12px] font-medium text-ink2">
                <span className="inline-flex items-start gap-1.5"><IconNote size={15} className="mt-0.5 shrink-0" /> {result.courierNote}</span>
              </div>
            )}

            {/* Courier service phone */}
            <a
              href={phoneHref(site.supportPhone)}
              className="press flex h-12 items-center justify-center gap-2 rounded-[18px] border border-ink/15 bg-card text-[13px] font-bold text-ink"
            >
              <IconPhone size={16} /> {t("trackCourierPhone")}: {site.supportPhone}
            </a>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ============================================================
   2. SMART RECOMMENDATIONS — based on order history + wishlist
   ============================================================ */

export function SmartRecommendations({
  orders,
  favorites,
  cart,
  onAdd,
  onOpen,
  onReorder,
}: {
  orders: Order[];
  favorites: string[];
  cart: Record<string, number>;
  onAdd: (p: Product) => void;
  onOpen: (p: Product) => void;
  onReorder: (o: Order) => void;
}) {
  const { t, lang } = useI18n();

  const recommendations = useMemo(() => {
    // Score products by: in wishlist +2, ordered before +3, not in cart
    const scores = new Map<string, number>();
    favorites.forEach((id) => scores.set(id, (scores.get(id) ?? 0) + 2));
    orders.forEach((o) =>
      o.items.forEach((it) => scores.set(it.id, (scores.get(it.id) ?? 0) + 3)),
    );

    return PRODUCTS.filter((p) => (scores.get(p.id) ?? 0) > 0 && !cart[p.id])
      .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
      .slice(0, 4);
  }, [orders, favorites, cart]);

  // Total savings (wholesale discount + promo discounts)
  const totalSaved = orders.reduce((sum, o) => sum + (o.discount || 0), 0);

  if (recommendations.length === 0 && orders.length === 0 && favorites.length === 0) {
    return null;
  }

  const lastOrder = orders[0];

  return (
    <section className="px-4 pt-10 min-[390px]:px-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-moss">
            <IconSparkle size={14} /> {t("smartTitle")}
          </p>
          <p className="mt-1 text-[12px] font-medium text-ink2">{t("smartSub")}</p>
        </div>
        {totalSaved > 0 && (
          <span className="rounded-full bg-amber/15 px-3 py-1 text-[11px] font-bold text-amberdeep">
            {t("smartMoneySaved")}: {formatPrice(totalSaved, lang)}
          </span>
        )}
      </div>

      {/* Last order reorder card */}
      {lastOrder && (
        <button
          onClick={() => {
            haptic("medium");
            onReorder(lastOrder);
          }}
          className="motion-surface press mt-4 flex w-full items-center gap-3 rounded-[22px] border border-moss/20 bg-sagetint/60 p-4 text-left shadow-sm"
        >
          <span className="motion-icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-moss text-white">
            <IconRepeat size={21} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display text-[14px] font-bold text-ink">
              {t("smartLastOrder")}: #{lastOrder.id}
            </span>
            <span className="mt-0.5 block truncate text-[12px] font-medium text-ink2">
              {lastOrder.items.map((i) => i.name).join(" · ")}
            </span>
          </span>
          <span className="font-display text-[14px] font-bold text-pine">
            {formatPrice(lastOrder.total, lang)}
          </span>
        </button>
      )}

      {/* Recommendation cards */}
      {recommendations.length > 0 && (
        <div className="no-scrollbar mt-4 flex snap-x-m gap-3 overflow-x-auto pb-1">
          {recommendations.map((p, i) => (
            <button
              key={p.id}
              onClick={() => {
                haptic("light");
                onOpen(p);
              }}
              className="motion-surface animate-pop press snap-item w-[160px] shrink-0 overflow-hidden rounded-[22px] border border-ink/6 bg-card text-left shadow-sm"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className={`relative h-[128px] overflow-hidden ${p.cat === "home" ? "bg-sagetint" : "bg-graphite2"}`}>
                <img src={p.img} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                {favorites.includes(p.id) && (
                  <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#E11D48] text-white">
                    <IconHeart size={13} filled />
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="truncate font-display text-[13px] font-bold text-ink">{p.name}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="font-display text-[13px] font-bold text-amber">
                    {formatPrice(p.price, lang)}
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      haptic("success");
                      onAdd(p);
                    }}
                    className="press flex h-7 w-7 items-center justify-center rounded-full bg-amber text-white"
                  >
                    <IconPlus size={13} />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   3. QUICK ACTION BAR ON PRODUCT PAGE
   ============================================================ */

export function ProductQuickActions({
  onAdd,
  onBuyNow,
  onCompare,
  onReminder,
  onWaitlist,
  onShare,
  onCopyLink,
}: {
  onAdd: () => void;
  onBuyNow: () => void;
  onCompare: () => void;
  onReminder: () => void;
  onWaitlist: () => void;
  onShare: () => void;
  onCopyLink: () => void;
}) {
  const { t } = useI18n();

  const actions = [
    { icon: "🛒", label: t("quickAddCart"), action: onAdd, primary: true },
    { icon: "⚡", label: t("quickBuyNow"), action: onBuyNow, primary: true },
    { icon: "⚖️", label: t("quickCompare"), action: onCompare },
    { icon: "🔔", label: t("quickReminder"), action: onReminder },
    { icon: "⏳", label: t("quickWaitlist"), action: onWaitlist },
    { icon: "📤", label: t("quickShareProd"), action: onShare },
    { icon: "🔗", label: t("quickCopyLink"), action: onCopyLink },
  ];

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {actions.map((a, i) => (
        <button
          key={i}
          onClick={() => {
            haptic("light");
            a.action();
          }}
          className={`press flex shrink-0 items-center gap-1.5 rounded-[16px] px-3.5 py-2.5 text-[12px] font-bold transition-all ${
            a.primary
              ? "bg-amber text-white shadow-sm hover:brightness-105"
              : "border border-ink/15 bg-card text-ink hover:bg-amber/5"
          }`}
        >
          <IconSymbol symbol={a.icon} size={16} />
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

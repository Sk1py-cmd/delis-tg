/**
 * DELIS — Выдвижные панели (bottom sheets): корзина, список заказов, профиль, окно лояльности и партнёрской программы.
 */
import { useEffect, useState } from "react";
import type { LoyaltyConfig, MeResponse } from "./api";
import { fetchMe, isApiConfigured } from "./api";
import { useI18n } from "./i18n";
import { CONFIG } from "./config";
import { useSiteSettings, tgHref } from "./site-settings";
import { PRODUCTS, loadBirthday, saveBirthday, type Order, type Product } from "./data";
import { formatPrice, haptic, type TgUser } from "./kit";
import {
  IconBag,
  IconBell,
  IconBox,
  IconBuilding,
  IconCalendar,
  IconCamera,
  IconChart,
  IconCheck,
  IconChevron,
  IconCopy,
  IconDownload,
  IconFactory,
  IconFileText,
  IconGift,
  IconHeart,
  IconLock,
  IconMinus,
  IconPin,
  IconPlus,
  IconRepeat,
  IconReturn,
  IconRibbon,
  IconScale,
  IconSend,
  IconShare,
  IconSettings,
  IconSparkle,
  IconStarsOrbit,
  IconTierSignal,
  IconTruck,
} from "./icons";
import { Sheet } from "./chrome";
import { LangPill } from "./sections-home";
import { LOYALTY_TIERS, type LoyaltyTier } from "./data";
import { openTelegramShare } from "./kit";

const statusStyle: Record<string, { bg: string; text: string; icon: typeof IconBag }> = {
  new: { bg: "bg-moss/12", text: "text-moss", icon: IconSparkle },
  preparing: { bg: "bg-amber/18", text: "text-amberdeep", icon: IconFactory },
  shipped: { bg: "bg-paper2", text: "text-pine", icon: IconTruck },
  delivered: { bg: "bg-sagetint", text: "text-pine", icon: IconCheck },
  canceled: { bg: "bg-[#B3402E]/10", text: "text-[#B3402E]", icon: IconReturn },
};

const statusKey: Record<string, "statusNew" | "statusPreparing" | "statusShipped" | "statusDelivered" | "statusCanceled"> = {
  new: "statusNew",
  preparing: "statusPreparing",
  shipped: "statusShipped",
  delivered: "statusDelivered",
  canceled: "statusCanceled",
};

function StatusBadge({ status }: { status: Order["status"] }) {
  const { t } = useI18n();
  const s = statusStyle[status];
  const Icon = s.icon;
  return (
    <span className={`flex items-center gap-1.5 rounded-full ${s.bg} px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] ${s.text}`}>
      <Icon size={12} />
      {t(statusKey[status])}
    </span>
  );
}

function SuccessMark() {
  return (
    <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-moss/12">
      <svg width="40" height="40" viewBox="0 0 52 52" fill="none">
        <circle cx="26" cy="26" r="24" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2.5" className="text-moss" />
        <path
          d="M15 27.5l7.5 7.5L37 19"
          stroke="#3F6B52"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="check-draw"
        />
      </svg>
    </div>
  );
}

/* ---------------- Cart ---------------- */

export function CartSheet({
  open,
  onClose,
  cart,
  onInc,
  onDec,
  total,
  onCheckout,
  goFeatured,
  orderId,
}: {
  open: boolean;
  onClose: () => void;
  cart: Record<string, number>;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  total: number;
  onCheckout: () => void;
  goFeatured: () => void;
  orderId: string | null;
}) {
  const { t, lang } = useI18n();
  const [placed, setPlaced] = useState(false);
  const entries = Object.entries(cart).filter(([, q]) => q > 0);

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => setPlaced(false), 400);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const checkout = () => {
    haptic("success");
    setPlaced(true);
    onCheckout();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("cartTitle")}>
      {placed ? (
        <div className="animate-pop pt-8 text-center">
          <SuccessMark />
          <h4 className="mt-5 font-display text-[20px] font-bold tracking-tight text-ink">{t("orderDone")}</h4>
          <p className="mt-2 text-[14px] font-medium text-ink/75">{t("orderDoneSub")}</p>
          {orderId && (
            <p className="mx-auto mt-4 w-fit rounded-full bg-amber/6 px-4 py-2 font-display text-[12px] font-bold tracking-[0.14em] text-ink/70">
              #{orderId}
            </p>
          )}
          <button
            onClick={onClose}
            className="press mt-8 w-full rounded-[18px] bg-amber py-4 text-[14px] font-bold text-white"
          >
            {t("done")}
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="pt-8 text-center">
          <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-sagetint text-moss">
            <IconBag size={28} />
          </div>
          <h4 className="mt-5 font-display text-[18px] font-bold tracking-tight text-ink">{t("cartEmpty")}</h4>
          <p className="mt-2 text-[14px] font-medium text-ink/70">{t("cartEmptySub")}</p>
          <button
            onClick={goFeatured}
            className="press mt-7 w-full rounded-[18px] bg-amber py-4 text-[14px] font-bold text-white"
          >
            {t("cartGoFeatured")}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-1 space-y-3">
            {entries.map(([id, qty]) => {
              const p = PRODUCTS.find((x) => x.id === id);
              if (!p) return null;
              return (
                <div key={id} className="flex items-center gap-3.5 rounded-[20px] border border-ink/6 bg-card p-3">
                  <div className={`h-[62px] w-[62px] shrink-0 overflow-hidden rounded-[14px] ${p.cat === "home" ? "bg-sagetint" : "bg-graphite2"}`}>
                    <img src={p.img} alt={p.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[13px] font-bold text-ink">{p.name}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-ink/70">{formatPrice(p.price, lang)}</p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <button
                        onClick={() => {
                          haptic("light");
                          onDec(id);
                        }}
                        aria-label="-1"
                        className="press flex h-8 w-8 items-center justify-center rounded-full border border-ink/18 text-ink/70"
                      >
                        <IconMinus size={14} />
                      </button>
                      <span className="w-5 text-center font-display text-[13px] font-bold text-ink">{qty}</span>
                      <button
                        onClick={() => {
                          haptic("light");
                          onInc(id);
                        }}
                        aria-label="+1"
                        className="press flex h-8 w-8 items-center justify-center rounded-full bg-amber text-white"
                      >
                        <IconPlus size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="shrink-0 font-display text-[14px] font-bold text-ink">
                    {formatPrice(p.price * qty, lang)}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-6">
            <p className="flex items-center gap-2 text-[12px] font-bold text-moss">
              <IconSparkle size={13} className="text-amber" />
              {t("cartDelivery")}
            </p>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-[14px] font-semibold text-ink/75">{t("cartTotal")}</span>
              <span className="font-display text-[22px] font-bold tracking-tight text-ink">
                {formatPrice(total, lang)}
              </span>
            </div>
            <button
              onClick={checkout}
              className="press mt-5 flex w-full items-center justify-center gap-2.5 rounded-[18px] bg-amber py-4 text-[14px] font-bold text-white hover:bg-pine"
            >
              <IconSend size={17} />
              {t("cartCheckout")}
            </button>
            <p className="mt-2.5 text-center text-[11px] font-semibold text-ink/65">{t("cartVia")}</p>
          </div>
        </>
      )}
    </Sheet>
  );
}

/* ---------------- Orders ---------------- */

export function OrdersSheet({
  open,
  onClose,
  orders,
  goFeatured,
  onSelectOrder,
  onRepeatLast,
  onExport,
}: {
  open: boolean;
  onClose: () => void;
  orders: Order[];
  goFeatured: () => void;
  onSelectOrder: (order: Order) => void;
  onRepeatLast?: () => void;
  onExport?: () => void;
}) {
  const { t, lang } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} title={t("ordersTitle")}>
      {/* Export to Excel */}
      {orders.length > 0 && (
        <button
          onClick={() => {
            haptic("medium");
            onExport?.();
          }}
          className="press mb-3 flex w-full items-center gap-3 rounded-[20px] border border-moss/20 bg-sagetint/50 p-3.5 text-left"
        >
          <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-moss text-white">
            <IconChart size={20} />
          </span>
          <span className="flex-1">
            <span className="block text-[14px] font-bold text-ink">
              {lang === "ru" ? "Экспорт в Excel" : lang === "en" ? "Export to Excel" : "Excel'ga eksport"}
            </span>
            <span className="mt-0.5 block text-[11px] font-semibold text-pine/70">
              DELIS_orders_{new Date().toISOString().slice(0, 10)}.csv
            </span>
          </span>
          <span className="text-moss"><IconDownload size={18} /></span>
        </button>
      )}

      {/* Quick reorder banner */}
      {orders.length > 0 && onRepeatLast && (
        <button
          onClick={() => { haptic("medium"); onRepeatLast(); }}
          className="press mb-3 flex w-full items-center gap-3 rounded-[20px] border border-moss/20 bg-sagetint/70 p-3.5 text-left"
        >
          <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-moss text-white"><IconRepeat size={20} /></span>
          <span className="flex-1">
            <span className="block text-[14px] font-bold text-ink">{t("reorderLast")}</span>
            <span className="mt-0.5 block text-[11px] font-semibold text-pine/70">{t("reorderSub")} · #{orders[0].id}</span>
          </span>
          <span className="font-display text-[13px] font-bold text-pine">{formatPrice(orders[0].total, lang)}</span>
        </button>
      )}
      {orders.length === 0 ? (
        <div className="pt-6 text-center">
          <div className="animate-floaty-soft mx-auto flex h-[84px] w-[84px] items-center justify-center rounded-[26px] bg-sagetint text-moss shadow-soft">
            <IconBox size={32} />
          </div>
          <h4 className="mt-5 font-display text-[18px] font-bold tracking-tight text-ink">{t("ordersEmpty")}</h4>
          <p className="mx-auto mt-2 max-w-[260px] text-[13px] font-medium text-ink/70">{t("ordersEmptySub")}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {PRODUCTS.slice(0, 3).map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  haptic("light");
                  onClose();
                  goFeatured();
                }}
                className="press flex items-center gap-1.5 rounded-full border border-ink/18 bg-card px-3 py-1.5 text-[11px] font-bold text-ink/70"
              >
                <span className="h-4 w-4 overflow-hidden rounded-full">
                  <img src={p.img} alt="" className="h-full w-full object-cover" />
                </span>
                {p.name}
              </button>
            ))}
          </div>
          <button
            onClick={goFeatured}
            className="press mt-6 w-full rounded-[18px] bg-amber py-4 text-[14px] font-bold text-white shadow-soft hover:bg-pine"
          >
            {t("cartGoFeatured")}
          </button>
        </div>
      ) : (
        <div className="mt-1 space-y-3">
          {orders.map((o, idx) => (
            <div
              key={o.id}
              onClick={() => {
                haptic("light");
                onSelectOrder(o);
              }}
              className="press animate-pop cursor-pointer rounded-[22px] border border-ink/18 bg-card p-5 shadow-sm transition-all hover:shadow-soft"
              style={{ animationDelay: `${idx * 70}ms` }}
            >
              <div className="flex items-center justify-between">
                <p className="font-display text-[14px] font-bold tracking-wide text-ink">#{o.id}</p>
                <StatusBadge status={o.status} />
              </div>
              <p className="mt-1.5 text-[12px] font-semibold text-ink/70">
                {o.date} · {o.count} {t("itemsWord")}
              </p>

              {/* progress */}
              <div className="mt-4 flex items-center gap-1.5">
                {(["new", "preparing", "shipped", "delivered"] as const).map((s, i) => {
                  const steps = ["new", "preparing", "shipped", "delivered"] as const;
                  const curIdx = o.status === "canceled" ? -1 : steps.indexOf(o.status);
                  const active = i <= curIdx;
                  return (
                    <div key={s} className="flex flex-1 items-center gap-1.5">
                      <span
                        className={`h-[5px] flex-1 rounded-full transition-colors duration-500 ${
                          active ? "bg-moss" : "bg-amber/8"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* items preview */}
              <div className="mt-4 flex items-center gap-2 overflow-hidden">
                <div className="flex -space-x-2">
                  {o.items.slice(0, 4).map((it) => {
                    const p: Product | undefined = PRODUCTS.find((x) => x.id === it.id);
                    return (
                      <div
                        key={it.id}
                        className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-card ${
                          p?.cat === "home" ? "bg-sagetint" : "bg-graphite2"
                        }`}
                      >
                        <img src={it.img || p?.img} alt={it.name} className="h-full w-full object-cover" />
                      </div>
                    );
                  })}
                  {o.items.length > 4 && (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-amber text-[10px] font-extrabold text-white">
                      +{o.items.length - 4}
                    </div>
                  )}
                </div>
                <span className="truncate text-[12px] font-semibold text-ink/60">
                  {o.items.map((it) => it.name).filter(Boolean).join(" · ")}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-ink/6 pt-3.5">
                <span className="text-[12px] font-semibold text-ink/70">{t("cartTotal")}</span>
                <span className="font-display text-[16px] font-bold text-ink">{formatPrice(o.total, lang)}</span>
              </div>
            </div>
          ))}
          {/* Export orders button */}
          {onExport && (
            <button
              onClick={() => {
                haptic("light");
                onExport();
              }}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-paper2 text-[13px] font-bold text-ink/70 hover:text-ink"
            >
              <IconCopy size={14} />
              {t("exportOrders")}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ---------------- Profile & Loyalty ---------------- */

export function LoyaltyModal({
  open,
  onClose,
  stars = 420,
}: {
  open: boolean;
  onClose: () => void;
  stars?: number;
}) {
  const { t, lang } = useI18n();
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  const currentTier: LoyaltyTier = stars >= 1500 ? "gold" : stars >= 500 ? "silver" : "bronze";
  const tierInfo = LOYALTY_TIERS[currentTier];
  const nextTier: LoyaltyTier = currentTier === "bronze" ? "silver" : "gold";
  const nextTierInfo = LOYALTY_TIERS[nextTier];
  const progressToNext = currentTier === "gold" ? 100 : Math.min(100, Math.round((stars / nextTierInfo.minStars) * 100));

  const handleShareReferral = () => {
    openTelegramShare(
      CONFIG.BOT_LINK,
      L(
        "🌟 DELIS premium parvarish mahsulotlariga qo'shiling va 500 Stars bonus oling!",
        "🌟 Присоединяйтесь к премиальному уходу DELIS и получите 500 Stars в подарок!",
        "🌟 Discover premium DELIS care and receive 500 bonus Stars!",
      ),
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("loyaltyTitle")}>
      <div className="space-y-4 pt-1">
        {/* Main Stars Card */}
        <div
          className="relative overflow-hidden rounded-[26px] p-5 text-white shadow-lift"
          style={{
            background:
              currentTier === "gold"
                ? "linear-gradient(135deg, #E0A63C 0%, #8A6420 100%)"
                : currentTier === "silver"
                  ? "linear-gradient(135deg, #64748B 0%, #1E293B 100%)"
                  : "linear-gradient(135deg, #0e6b45 0%, #00143b 100%)",
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-white/70">
                {t("starsBalance")}
              </p>
              <p className="mt-1 font-display text-[32px] font-bold leading-none text-white flex items-center gap-2">
                <span>{stars}</span>
                <span className="text-white"><IconStarsOrbit size={24} /></span>
              </p>
              <p className="mt-1.5 text-[12px] font-semibold text-white/80">
                {t("starsValue")}: {formatPrice(stars * 100, lang)}
              </p>
            </div>
            <span className="rounded-full bg-paper/20 px-3 py-1 font-display text-[11px] font-bold backdrop-blur-md">
              <span className="inline-flex items-center gap-1"><IconTierSignal size={14} filled /> {tierInfo.name[lang]}</span>
            </span>
          </div>

          {/* Progress bar to next tier */}
          {currentTier !== "gold" && (
            <div className="mt-5 border-t border-paper/15 pt-4">
              <div className="flex items-center justify-between text-[11px] font-bold text-white/80">
                <span>{t("nextTierProgress")}: {nextTierInfo.name[lang]}</span>
                <span className="flex items-center gap-1">{stars} / {nextTierInfo.minStars} <IconStarsOrbit size={13} /></span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper/20">
                <div
                  className="h-full rounded-full bg-paper transition-all duration-700"
                  style={{ width: `${progressToNext}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tier Benefits */}
        <div className="rounded-[24px] border border-ink/18 bg-card p-4 space-y-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65">
            {t("tierBenefits")} ({tierInfo.name[lang]})
          </p>

          <div className="space-y-2.5">
            {tierInfo.benefits.map((b, i) => (
              <div key={i} className="flex items-start gap-2.5 text-[13px] font-semibold text-ink/85">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber/20 text-amberdeep">
                  <IconCheck size={11} strokeWidth={2.6} />
                </span>
                <span>{b[lang]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Invite friends for bonus */}
        <div className="rounded-[24px] border border-ink/18 bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="motion-icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amberdeep">
              <IconGift size={22} />
            </span>
            <div>
              <p className="font-display text-[14px] font-bold text-ink">{L("Do'stlarni taklif qiling", "Приглашайте друзей", "Invite friends")}</p>
              <p className="flex items-center gap-1 text-[12px] font-medium text-ink/70">{L("Har bir do'stingizning birinchi xaridi uchun +500", "+500 за первую покупку каждого друга", "+500 for each friend's first purchase")} <IconStarsOrbit size={13} /></p>
            </div>
          </div>
          <button
            onClick={handleShareReferral}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-amber text-[13px] font-bold text-white"
          >
            <IconShare size={15} />
            <span>{L("Tavsiya havolasini ulashish", "Поделиться реферальной ссылкой", "Share referral link")}</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function ProfileSheet({
  open,
  onClose,
  user,
  onPartner,
  favoritesCount = 0,
  onOpenWishlist,
  stars = 420,
  loyaltyConfig,
  onOpenAddresses,
  onOpenReturns,
  onOpenB2b,
  onOpenGift,
  onOpenCert,
  onOpenCompare,
  onOpenSubs,
  onOpenScan,
  onOpenAdmin,
  onOpenReferral,
  onOpenLegal,
  onOpenLoyaltyCard,
  addressesCount = 0,
}: {
  open: boolean;
  onClose: () => void;
  user: TgUser | null;
  onPartner: () => void;
  favoritesCount?: number;
  onOpenWishlist?: () => void;
  stars?: number;
  loyaltyConfig?: LoyaltyConfig | null;
  onOpenAddresses?: () => void;
  onOpenReturns?: () => void;
  onOpenB2b?: () => void;
  onOpenGift?: () => void;
  onOpenCert?: () => void;
  onOpenCompare?: () => void;
  onOpenSubs?: () => void;
  onOpenScan?: () => void;
  onOpenAdmin?: () => void;
  onOpenReferral?: () => void;
  onOpenLegal?: () => void;
  onOpenLoyaltyCard?: () => void;
  addressesCount?: number;
}) {
  const { t, lang } = useI18n();
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  /* Контакты поддержки — редактируются из админки (вкладка «Сайт»). */
  const site = useSiteSettings();
  const [birthday, setBirthday] = useState<string>(() => loadBirthday());
  const [notif, setNotif] = useState(true);
  const [welcome, setWelcome] = useState<MeResponse["welcome"] | null>(null);
  const [welcomeCopied, setWelcomeCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    setWelcome(null);
    setWelcomeCopied(false);
    if (!isApiConfigured()) return;
    fetchMe().then((me) => {
      if (me?.welcome?.issued) setWelcome(me.welcome);
    }).catch(() => {});
  }, [open]);
  const name = user?.first_name || t("guestName");

  const silverMin = loyaltyConfig?.tiers.silver.minStars ?? 500;
  const goldMin = loyaltyConfig?.tiers.gold.minStars ?? 1500;
  const currentTier: LoyaltyTier = stars >= goldMin ? "gold" : stars >= silverMin ? "silver" : "bronze";
  const tierInfo = {
    ...LOYALTY_TIERS[currentTier],
    cashbackPercent: loyaltyConfig?.tiers[currentTier].cashbackPercent ?? LOYALTY_TIERS[currentTier].cashbackPercent,
  };
  const starValueUzs = loyaltyConfig?.starValueUzs ?? 100;

  return (
    <>
      <Sheet open={open} onClose={onClose} title={t("profileTitle")}>
        <div className="flex items-center gap-4">
          <div className="h-[64px] w-[64px] shrink-0 overflow-hidden rounded-full bg-pine ring-2 ring-sage/70 ring-offset-2 ring-offset-paper">
            {user?.photo_url ? (
              <img src={user.photo_url} alt={name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-[22px] font-bold text-white">
                {name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[17px] font-bold tracking-tight text-ink">{name}</p>
            {user?.username && <p className="text-[12px] font-semibold text-ink/70">@{user.username}</p>}
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-block rounded-full bg-sagetint px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-pine">
                {t("retail")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-amberdeep">
                <IconTierSignal size={12} filled />
                {tierInfo.name[lang].split(" ")[0]}
              </span>
            </div>
          </div>
        </div>

        {/* Loyalty Stars Banner Card */}
        <button
          onClick={() => {
            haptic("medium");
            onOpenLoyaltyCard?.();
          }}
          className="loyalty-home-cyber motion-surface press relative mt-5 flex w-full items-center justify-between overflow-hidden rounded-[22px] border border-[#60ff9b]/20 p-4 text-left text-white shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="motion-icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#60ff9b]/12 text-[#60ff9b] shadow-sm">
              <IconStarsOrbit size={25} />
            </div>
            <div>
              <p className="font-display text-[14px] font-black text-white">
                {stars} DELIS Stars · {tierInfo.name[lang]}
              </p>
              <p className="text-[12px] font-semibold text-[#60ff9b]">
                {t("cashbackInfo")}: {tierInfo.cashbackPercent}% · {formatPrice(stars * starValueUzs, lang)}
              </p>
            </div>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 shadow-sm">
            <IconChevron size={14} />
          </span>
        </button>

        {/* Welcome discount card (personal first-order promo) */}
        {welcome?.code && (
          <div className="mt-5 rounded-[22px] border border-amber/30 bg-gradient-to-br from-amber/[0.14] to-amber/[0.06] p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber text-white">
                <IconGift size={18} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-[14px] font-black text-ink">{t("welcomeTitle")}</p>
                <p className="text-[11px] font-semibold leading-snug text-ink/70">{t("welcomeSub")}</p>
              </div>
            </div>
            <button
              onClick={() => {
                haptic("medium");
                setWelcomeCopied(true);
                try { void navigator.clipboard?.writeText(welcome.code ?? ""); } catch { /* ignore */ }
                setTimeout(() => setWelcomeCopied(false), 1800);
              }}
              className="press mt-3 flex w-full items-center justify-between rounded-[14px] border border-ink/10 bg-paper px-3.5 py-2.5"
            >
              <span className="flex items-center gap-2 text-[13px] font-extrabold tracking-wide text-ink">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink/50">{t("welcomeCode")}</span>
                <span className="font-mono text-[15px]">{welcome.code}</span>
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-amber/15 px-2.5 py-1 text-[11px] font-bold text-amberdeep">
                <IconCopy size={13} />
                {welcomeCopied ? t("welcomeCopied") : t("welcomeCopy")}
              </span>
            </button>
          </div>
        )}

        {/* Language selector */}
        <div className="mt-6">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-ink/65">{t("langLabel")}</p>
          <div className="mt-2.5">
            <LangPill />
          </div>
        </div>

        {/* Menu list */}
        <div className="mt-6 divide-y divide-ink/8 border-y border-ink/18">
          {/* Wishlist row */}
          <button
            onClick={() => {
              haptic("light");
              onClose();
              onOpenWishlist?.();
            }}
            className="press flex w-full items-center gap-3.5 py-4 text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E11D48]/12 text-[#E11D48]">
              <IconHeart size={18} filled={favoritesCount > 0} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{t("wishlistTitle")}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-ink/70">{favoritesCount} {t("products")}</span>
            </span>
            <IconChevron size={16} className="text-ink/75" />
          </button>

          {/* Addresses */}
          <button
            onClick={() => {
              haptic("light");
              onClose();
              onOpenAddresses?.();
            }}
            className="press flex w-full items-center gap-3.5 py-4 text-left"
          >
            <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-sagetint text-pine">
              <IconPin size={20} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{t("addressesTitle")}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-ink/70">{addressesCount} · {t("addressAdd")}</span>
            </span>
            <IconChevron size={16} className="text-ink/75" />
          </button>

          {/* Gift Box Atelier stays hidden until packaging is a server-priced order line. */}
          {onOpenGift && (
            <button
              onClick={() => { haptic("light"); onClose(); onOpenGift(); }}
              className="press flex w-full items-center gap-3.5 py-4 text-left"
            >
              <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-amber/15 text-amberdeep"><IconRibbon size={21} /></span>
              <span className="flex-1"><span className="block text-[14px] font-bold text-ink">{t("giftTitle")}</span><span className="mt-0.5 block text-[12px] font-semibold text-ink/70">{t("giftSub")}</span></span>
              <IconChevron size={16} className="text-ink/75" />
            </button>
          )}

          {/* Birthday */}
          <div className="border-t border-ink/6 py-3">
            <div className="flex items-center gap-3.5">
              <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-amber/15 text-amberdeep"><IconCalendar size={21} /></span>
              <div className="flex-1">
                <p className="text-[14px] font-bold text-ink">{L("Tug'ilgan kun", "День рождения", "Birthday")}</p>
                <p className="mt-0.5 text-[12px] font-semibold text-ink/70">
                  {birthday
                    ? L(`Sana: ${birthday} — sovg'a kuting! 🎁`, `Дата: ${birthday} — ждите подарок! 🎁`, `Date: ${birthday} — your gift is coming! 🎁`)
                    : L("Belgilang — 10% sovg'a oling", "Укажите — получите подарок 10%", "Add your date and receive a 10% gift")}
                </p>
              </div>
              {birthday ? (
                /* Set ONCE and locked — the server (409 birthday_locked) rejects
                   any later change, so the BDAY10 promo can't be farmed */
                <span className="flex items-center gap-1 rounded-full border border-moss/25 bg-sagetint px-3 py-1.5 text-[11px] font-bold text-pine">
                  <IconLock size={12} /> {L("Saqlandi", "Сохранено", "Saved")}
                </span>
              ) : (
                <input
                  type="date"
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const d = new Date(e.target.value);
                    const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    saveBirthday(mmdd);
                    setBirthday(mmdd);
                    haptic("success");
                    // Sync to backend so the bot can congratulate on the day
                    import("./api").then(({ saveBirthdayRemote }) => {
                      saveBirthdayRemote(mmdd).catch(() => {});
                    }).catch(() => {});
                  }}
                  className="w-[120px] rounded-[12px] border border-ink/15 bg-card px-2 py-1.5 text-[10px] font-semibold text-ink outline-none"
                />
              )}
            </div>
          </div>

          {/* Gift Certificate */}
          <button
            onClick={() => {
              haptic("light");
              onClose();
              onOpenCert?.();
            }}
            className="press flex w-full items-center gap-3.5 py-4 text-left"
          >
            <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-amber/15 text-amberdeep"><IconGift size={21} /></span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{lang === "ru" ? "Сертификат" : "Sertifikat"}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-ink/70">
                {lang === "ru" ? "Подарите другу — 100/200/500 тыс." : "Do'stga sovg'a — 100/200/500 ming"}
              </span>
            </span>
            <IconChevron size={16} className="text-ink/75" />
          </button>

          {/* My Subscriptions */}
          <button
            onClick={() => {
              haptic("light");
              onClose();
              onOpenSubs?.();
            }}
            className="press flex w-full items-center gap-3.5 py-4 text-left"
          >
            <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-pine/12 text-pine"><IconBox size={21} /></span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{t("subTitle")}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-ink/70">
                {lang === "ru" ? "Управление подписками" : "Obunalarni boshqarish"}
              </span>
            </span>
            <IconChevron size={16} className="text-ink/75" />
          </button>

          {/* Product Comparison Matrix */}
          <button
            onClick={() => {
              haptic("light");
              onClose();
              onOpenCompare?.();
            }}
            className="press flex w-full items-center gap-3.5 py-4 text-left"
          >
            <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-sagetint text-pine">
              <IconScale size={21} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{t("compareTitle")}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-ink/70">{t("compareSub")}</span>
            </span>
            <IconChevron size={16} className="text-ink/75" />
          </button>

          {/* Bottle QR Authenticity Scanner */}
          <button
            onClick={() => {
              haptic("light");
              onClose();
              onOpenScan?.();
            }}
            className="press flex w-full items-center gap-3.5 py-4 text-left"
          >
            <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-paper2 text-pine">
              <IconCamera size={21} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{t("scannerTitle")}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-ink/70">{t("scannerSub")}</span>
            </span>
            <IconChevron size={16} className="text-ink/75" />
          </button>

          {/* Returns */}
          <button
            onClick={() => {
              haptic("light");
              onClose();
              onOpenReturns?.();
            }}
            className="press flex w-full items-center gap-3.5 py-4 text-left"
          >
            <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-paper2 text-pine">
              <IconReturn size={21} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{t("returnsTitle")}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-ink/70">{t("returnsNew")}</span>
            </span>
            <IconChevron size={16} className="text-ink/75" />
          </button>

          {/* B2B office */}
          <button
            onClick={() => {
              haptic("light");
              onClose();
              onOpenB2b?.();
            }}
            className="press flex w-full items-center gap-3.5 py-4 text-left"
          >
            <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-amber/15 text-amberdeep">
              <IconBuilding size={21} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{t("b2bTitle")}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-ink/70">{t("b2bSub")}</span>
            </span>
            <IconChevron size={16} className="text-ink/75" />
          </button>

          {/* Referral Hub / Friends Program */}
          <button
            onClick={() => {
              haptic("light");
              onClose();
              onOpenReferral?.();
            }}
            className="press flex w-full items-center gap-3.5 py-4 text-left"
          >
            <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-amber/15 text-amberdeep">
              <IconGift size={21} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{t("refHubTitle")}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-amberdeep">{L("Taklif uchun +500", "+500 за приглашение", "+500 per referral")} <IconStarsOrbit size={13} /></span>
            </span>
            <IconChevron size={16} className="text-ink/75" />
          </button>

          {/* Legal Documents & Warranties */}
          <button
            onClick={() => {
              haptic("light");
              onClose();
              onOpenLegal?.();
            }}
            className="press flex w-full items-center gap-3.5 py-4 text-left"
          >
            <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-paper2 text-ink">
              <IconFileText size={21} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{t("legalTitle")}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-ink2">Oferta · Maxfiylik · Kafolat</span>
            </span>
            <IconChevron size={16} className="text-ink/75" />
          </button>

          {/* Operations & Admin Panel (PIN protected) */}
          <button
            onClick={() => {
              haptic("medium");
              onClose();
              onOpenAdmin?.();
            }}
            className="press flex w-full items-center gap-3.5 py-4 text-left border-t border-ink/18"
          >
            <span className="motion-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#0c1411] text-white">
              <IconSettings size={20} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{t("adminTitle")}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-moss">Zavod boshqaruvi · Maxfiy kirish</span>
            </span>
            <IconChevron size={16} className="text-ink/75" />
          </button>

          {/* Wholesale partner application */}
          <button onClick={onPartner} className="press flex w-full items-center gap-3.5 py-4 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amberdeep">
              <IconFactory size={18} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{t("bizRow")}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-ink2">{t("bizSub")}</span>
            </span>
            <IconChevron size={16} className="text-ink/75" />
          </button>

          {/* Notifications toggle */}
          <div className="flex items-center gap-3.5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper2 text-ink">
              <IconBell size={18} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{t("notifRow")}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-ink/70">{t("notifSub")}</span>
            </span>
            <button
              onClick={() => {
                haptic("light");
                setNotif(!notif);
              }}
              role="switch"
              aria-checked={notif}
              className={`relative h-7 w-[46px] rounded-full transition-colors duration-300 ${notif ? "bg-moss" : "bg-amber/15"}`}
            >
              <span
                className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-card shadow-soft transition-[left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  notif ? "left-[21px]" : "left-[3px]"
                }`}
              />
            </button>
          </div>

          {/* Telegram Support Chat */}
          <a
            href={tgHref(site.supportTg)}
            target="_blank"
            rel="noreferrer"
            className="press flex items-center gap-3.5 py-4"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper2 text-ink">
              <IconSend size={18} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{t("supportRow")}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-ink/70">
                {site.managerName ? `${site.managerName} · ` : ""}{site.supportTg} · {site.supportHours}
              </span>
            </span>
            <IconChevron size={16} className="text-ink/75" />
          </a>
        </div>

        <p className="mt-6 text-center text-[11px] font-semibold text-ink/60">{t("version")}</p>
      </Sheet>

    </>
  );
}

/* ---------------- Partner application ---------------- */

const CITIES = ["Tashkent", "Samarkand", "Bukhara", "Fergana", "Andijan", "Nukus"];

export function PartnerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState(CITIES[0]);
  const [errors, setErrors] = useState<{ name?: boolean; phone?: boolean }>({});
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setSent(false);
        setErrors({});
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const submit = () => {
    haptic("medium");
    const e = { name: name.trim().length === 0, phone: phone.trim().length < 7 };
    setErrors(e);
    if (e.name || e.phone) {
      haptic("light");
      return;
    }
    setSent(true);
    haptic("success");
  };

  const input = (err?: boolean) =>
    `w-full rounded-[16px] border bg-card px-4 py-3.5 text-[14px] font-semibold text-ink outline-none transition-colors placeholder:text-ink/75 ${
      err ? "border-[#B3402E]" : "border-ink/15 focus:border-moss"
    }`;

  return (
    <Sheet open={open} onClose={onClose} title={t("partnerTitle")}>
      {sent ? (
        <div className="animate-pop pt-8 text-center">
          <SuccessMark />
          <p className="mx-auto mt-5 max-w-[260px] text-[15px] font-semibold leading-relaxed text-ink">
            {t("fSuccess")}
          </p>
          <button
            onClick={onClose}
            className="press mt-8 w-full rounded-[18px] bg-amber py-4 text-[14px] font-bold text-white"
          >
            {t("done")}
          </button>
        </div>
      ) : (
        <div className="mt-1 space-y-3.5">
          <div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("fName")}
              className={input(errors.name)}
            />
            {errors.name && <p className="mt-1.5 text-[11px] font-bold text-[#B3402E]">{t("fError")}</p>}
          </div>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder={t("fCompany")}
            className={input()}
          />
          <div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={`+998 · ${t("fPhone")}`}
              inputMode="tel"
              className={input(errors.phone)}
            />
            {errors.phone && <p className="mt-1.5 text-[11px] font-bold text-[#B3402E]">{t("fError")}</p>}
          </div>
          <div className="relative">
            <select value={city} onChange={(e) => setCity(e.target.value)} className={`${input()} appearance-none`}>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {t("fCity")}: {c}
                </option>
              ))}
            </select>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink/65">
              <path d="m6 9.5 6 6 6-6" />
            </svg>
          </div>
          <button onClick={submit} className="press mt-2 w-full rounded-[18px] bg-amber py-4 text-[14px] font-bold text-white hover:brightness-105">
            {t("fSend")}
          </button>
          <p className="text-center text-[11px] font-semibold text-ink/65">{t("wsNote")}</p>
        </div>
      )}
    </Sheet>
  );
}

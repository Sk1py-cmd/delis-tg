/**
 * DELIS — Юридические документы, лист ожидания, реферальная программа и окно платёжного шлюза.
 */
import { useState, useEffect } from "react";
import { useI18n } from "./i18n";
import {
  type LegalDocType,
  type Product,
  type ReferralStats,
  type WaitlistEntry,
  type Order,
  DEFAULT_REFERRAL_STATS,
} from "./data";
import { formatPrice, haptic, sendDataToBot, openTelegramShare, openTelegramInvoice, requestTelegramContact } from "./kit";
import { createStarsInvoice, fetchOrderStatus } from "./api";
import { CONFIG } from "./config";
import { useSiteSettings, tgHref } from "./site-settings";
import {
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconFactory,
  IconFileText,
  IconGift,
  IconSend,
  IconShare,
  IconShieldCheck,
  IconStar,
  IconStarsOrbit,
} from "./icons";
import { Sheet } from "./chrome";

/* ============================================================
   1. LEGAL DOCUMENTS & COMPLIANCE MODAL
   ============================================================ */

export function LegalDocsSheet({
  open,
  onClose,
  initialDoc = "oferta",
}: {
  open: boolean;
  onClose: () => void;
  initialDoc?: LegalDocType;
}) {
  const { t, lang } = useI18n();
  const L = (uz: string, ru: string, en: string) => lang === "ru" ? ru : lang === "en" ? en : uz;
  const [activeDoc, setActiveDoc] = useState<LegalDocType>(initialDoc);

  useEffect(() => {
    if (open) setActiveDoc(initialDoc);
  }, [open, initialDoc]);

  const tabs: { id: LegalDocType; label: string }[] = [
    { id: "oferta", label: t("legalOferta") },
    { id: "privacy", label: t("legalPrivacy") },
    { id: "delivery_terms", label: t("legalDelivery") },
    { id: "warranty", label: t("legalWarranty") },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={t("legalTitle")}>
      <div className="space-y-4 pt-1">
        {/* Document Navigation Tabs */}
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto rounded-[18px] bg-paper2 p-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                haptic("light");
                setActiveDoc(tab.id);
              }}
              className={`press shrink-0 rounded-[14px] px-3.5 py-2 text-[12px] font-bold transition-all ${
                activeDoc === tab.id
                  ? "bg-card text-ink shadow-sm ring-1 ring-ink/10"
                  : "text-ink2 hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Legal Text Content Card */}
        <div className="overflow-hidden rounded-[24px] border border-ink/18 bg-card p-5 shadow-sm text-ink space-y-3.5 text-[13px] leading-relaxed max-h-[50dvh] overflow-y-auto">
          {activeDoc === "oferta" && (
            <div className="space-y-3 animate-fadein">
              <div className="flex items-center gap-2 font-display text-[14px] font-bold text-pine"><IconFileText size={18} /><span>{L("DELIS Mahsulotlari Ommaviy Ofertasi", "Публичная оферта на товары DELIS", "DELIS Product Public Offer")}</span></div>
              <p className="text-ink2">{L("1. Umumiy qoidalar. Ushbu hujjat «DELIS GROUP» MChJ mahsulotlarini chakana va ulgurji xarid qilish bo'yicha ommaviy taklifdir.", "1. Общие положения. Этот документ является публичным предложением о розничной и оптовой покупке продукции «DELIS GROUP» MChJ.", "1. General terms. This document is a public offer for retail and wholesale purchase of products from DELIS GROUP MChJ.")}</p>
              <p className="text-ink2">{L("2. Buyurtma berish. Mini App yoki bot orqali tasdiqlangan buyurtma xaridorning ushbu shartlarni qabul qilganini bildiradi.", "2. Оформление заказа. Подтверждение заказа через Mini App или бота означает принятие покупателем настоящих условий.", "2. Ordering. Confirming an order through the Mini App or bot means that the buyer accepts these terms.")}</p>
              <p className="text-ink2">{L("3. Narx va to'lov. Narxlar UZSda. Faqat checkoutda faol ko'rsatilgan Payme, Click, naqd yoki Telegram Stars usuli qabul qilinadi.", "3. Цена и оплата. Цены указаны в UZS. Принимаются только активные в checkout способы: Payme, Click, наличные или Telegram Stars.", "3. Price and payment. Prices are in UZS. Only methods shown as active at checkout are accepted: Payme, Click, cash or Telegram Stars.")}</p>
              <p className="text-ink2">{L("4. Mahsulot ma'lumoti. Tarkib, foydalanish va xavfsizlik talablari mahsulot yorlig'i va kartasida ko'rsatiladi.", "4. Информация о товаре. Состав, применение и требования безопасности указаны на этикетке и в карточке товара.", "4. Product information. Ingredients, use and safety requirements are shown on the label and product page.")}</p>
            </div>
          )}

          {activeDoc === "privacy" && (
            <div className="space-y-3 animate-fadein">
              <div className="flex items-center gap-2 font-display text-[14px] font-bold text-pine"><IconShieldCheck size={18} /><span>{L("Maxfiylik siyosati", "Политика конфиденциальности", "Privacy Policy")}</span></div>
              <p className="text-ink2">{L("1. Ism, telefon, manzil va Telegram identifikatori buyurtma, qo'llab-quvvatlash, bonuslar va yetkazib berish uchun qayta ishlanadi.", "1. Имя, телефон, адрес и Telegram-идентификатор обрабатываются для заказов, поддержки, бонусов и доставки.", "1. Name, phone, address and Telegram identifier are processed for orders, support, rewards and delivery.")}</p>
              <p className="text-ink2">{L("2. DELIS to'liq karta raqami va CVVni saqlamaydi. Onlayn to'lov faol Payme, Click yoki Telegram sahifasida amalga oshiriladi.", "2. DELIS не хранит полный номер карты и CVV. Онлайн-оплата выполняется на активной странице Payme, Click или Telegram.", "2. DELIS does not store full card numbers or CVV. Online payment is completed on the active Payme, Click or Telegram page.")}</p>
              <p className="text-ink2">{L("3. Yetkazish uchun zarur ma'lumotlar faqat tanlangan kuryer/BTS xizmatiga beriladi. Texnik backup shifrlangan ulanish orqali server storage'ida saqlanadi.", "3. Необходимые данные передаются только выбранному курьеру/BTS. Технические резервные копии хранятся в серверном storage через защищённое соединение.", "3. Required delivery data is shared only with the selected courier/BTS. Technical backups are stored in server-side storage over a secured connection.")}</p>
            </div>
          )}

          {activeDoc === "delivery_terms" && (
            <div className="space-y-3 animate-fadein">
              <div className="flex items-center gap-2 font-display text-[14px] font-bold text-pine"><IconShieldCheck size={18} /><span>{L("Yetkazib berish shartlari", "Условия доставки", "Delivery Terms")}</span></div>
              <p className="text-ink2">{L("1. Yetkazish O'zbekiston hududlari bo'yicha checkoutda mavjud kuryer yoki BTS xizmati orqali bajariladi.", "1. Доставка выполняется по регионам Узбекистана доступным в checkout курьером или BTS.", "1. Delivery across available regions of Uzbekistan is provided by courier or BTS as shown at checkout.")}</p>
              <p className="text-ink2">{L("2. Bepul yetkazish chegarasi va tariflar serverda boshqariladi; buyurtma tasdiqlanishidan oldin yakuniy summa ko'rsatiladi.", "2. Порог бесплатной доставки и тарифы управляются сервером; итог показывается до подтверждения заказа.", "2. The free-delivery threshold and tariffs are server-managed; the final amount is shown before confirmation.")}</p>
              <p className="text-ink2">{L("3. Taxminiy muddat hudud va xizmatga qarab checkoutda hisoblanadi. Fors-major yoki tashuvchi kechikishi haqida menejer xabar beradi.", "3. Срок рассчитывается в checkout по региону и услуге. О форс-мажоре или задержке перевозчика сообщает менеджер.", "3. The estimate is calculated at checkout by region and service. A manager reports force majeure or carrier delays.")}</p>
            </div>
          )}

          {activeDoc === "warranty" && (
            <div className="space-y-3 animate-fadein">
              <div className="flex items-center gap-2 font-display text-[14px] font-bold text-pine"><IconShieldCheck size={18} /><span>{L("Kafolat va qaytarish", "Гарантия и возврат", "Warranty and Returns")}</span></div>
              <p className="text-ink2">{L("1. Ochilmagan va foydalanilmagan mahsulot uchun yetkazilgan kundan boshlab 14 kun ichida server orqali qaytarish arizasi berish mumkin.", "1. Для нераспечатанного и неиспользованного товара можно подать серверную заявку на возврат в течение 14 дней после доставки.", "1. An unopened and unused product can be submitted for return through the server within 14 days after delivery.")}</p>
              <p className="text-ink2">{L("2. Shikast yoki sifat nuqsoni bo'lsa, menejer foto/partiya ma'lumotini so'rashi va almashtirish yoki pul qaytarishni kelishishi mumkin.", "2. При повреждении или дефекте менеджер может запросить фото/данные партии и согласовать замену или возврат.", "2. For damage or defects, a manager may request photos/batch details and arrange replacement or refund.")}</p>
              <p className="text-ink2">{L("3. Ariza Profil → Qaytarish bo'limida faqat yetkazilgan, ariza egasiga tegishli buyurtma uchun yaratiladi; holat serverda saqlanadi.", "3. Заявка создаётся в Профиль → Возвраты только для доставленного заказа владельца; статус хранится на сервере.", "3. A request is created in Profile → Returns only for the owner's delivered order; status is stored on the server.")}</p>
            </div>
          )}
        </div>

        <div className="rounded-[20px] bg-paper2 p-3.5 text-center text-[12px] font-semibold text-ink2">
          <span className="inline-flex items-center gap-1.5"><IconFactory size={15} /> {t("legalSellerInfo")}</span>
        </div>

        <button
          onClick={onClose}
          className="press flex h-13 w-full items-center justify-center rounded-[20px] bg-amber text-[14px] font-bold text-white shadow-lift"
        >
          {t("legalCloseBtn")}
        </button>
      </div>
    </Sheet>
  );
}

/* ============================================================
   2. WAITLIST & PRE-ORDER MODAL (for out-of-stock items)
   ============================================================ */

export function WaitlistSheet({
  open,
  onClose,
  product,
  onJoinWaitlist,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onJoinWaitlist: (entry: WaitlistEntry) => void;
}) {
  const { t, lang } = useI18n();
  const [phone, setPhone] = useState("+998 ");
  const [qty, setQty] = useState(2);
  const [isSent, setIsSent] = useState(false);

  useEffect(() => {
    if (!open) {
      setTimeout(() => setIsSent(false), 300);
    }
  }, [open]);

  if (!product) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.replace(/\D/g, "").length < 9) return;

    haptic("success");
    const entry: WaitlistEntry = {
      id: `wl-${Date.now()}`,
      productId: product.id,
      productName: product.name,
      phone,
      requestedQty: qty,
      createdAt: Date.now(),
      notified: false,
    };

    onJoinWaitlist(entry);
    setIsSent(true);

    sendDataToBot({
      type: "waitlist_signup",
      product_id: product.id,
      product_name: product.name,
      requested_qty: qty,
      phone,
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("waitlistTitle")}>
      {isSent ? (
        <div className="animate-pop py-8 text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-moss/15 text-moss">
            <IconCheck size={32} />
          </div>
          <h3 className="font-display text-[18px] font-bold text-ink">{t("waitlistSuccess")}</h3>
          <p className="mx-auto max-w-[300px] text-[13px] font-medium leading-relaxed text-ink2">
            {t("waitlistSuccessSub")}
          </p>
          <button
            onClick={onClose}
            className="press mt-6 w-full rounded-[20px] bg-amber py-4 text-[14px] font-bold text-white shadow-lift"
          >
            {t("done")}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="flex items-center gap-3.5 rounded-[22px] border border-amber/25 bg-amber/[0.08] p-3.5">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[14px] bg-paper2">
              <img src={product.img} alt={product.name} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="rounded-full bg-[#B3402E]/10 px-2 py-0.5 text-[9px] font-extrabold uppercase text-[#B3402E]">
                {t("stockOut")}
              </span>
              <p className="mt-1 font-display text-[14px] font-bold text-ink">{product.name}</p>
              <p className="text-[12px] font-semibold text-moss">{formatPrice(product.price, lang)}</p>
            </div>
          </div>

          <div className="rounded-[18px] bg-sagetint/70 p-3.5 text-center text-[12px] font-semibold text-pine">
            ✨ {t("waitlistEstimatedBatch")} (Namangan zavodi)
          </div>

          <div>
            <label className="text-[11px] font-bold text-ink2">{t("waitlistPhone")}</label>
            <div className="mt-1 flex gap-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998 90 123-45-67"
                className="w-full rounded-[16px] border border-ink/18 bg-paper px-4 py-3 text-[14px] font-semibold text-ink outline-none focus:border-moss"
                required
              />
              {/* One-tap Telegram contact fill */}
              <button
                type="button"
                onClick={() =>
                  requestTelegramContact((tgPhone) => {
                    if (tgPhone) {
                      haptic("success");
                      setPhone(tgPhone);
                    }
                  })
                }
                className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#229ED9]/12 text-[#1c88bd]"
                aria-label="Telegram contact"
              >
                <IconSend size={17} />
              </button>
            </div>
            <p className="mt-1 text-[11px] font-semibold text-ink2">
              {t("waitlistSub")} — Telegram kontakt tugmasi orqali 1 bosishda
            </p>
          </div>

          <div className="flex items-center justify-between rounded-[18px] border border-ink/18 bg-card p-3">
            <span className="text-[13px] font-bold text-ink">{t("waitlistQty")}</span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  haptic("light");
                  setQty((q) => Math.max(1, q - 1));
                }}
                className="press h-8 w-8 rounded-full border border-ink/15 text-ink2 font-bold"
              >
                −
              </button>
              <span className="w-6 text-center font-display text-[14px] font-bold text-ink">{qty}</span>
              <button
                type="button"
                onClick={() => {
                  haptic("light");
                  setQty((q) => q + 1);
                }}
                className="press h-8 w-8 rounded-full bg-amber text-white font-bold"
              >
                +
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="press flex h-14 w-full items-center justify-center gap-2 rounded-[22px] bg-amber text-[14px] font-bold text-white shadow-lift hover:brightness-105"
          >
            <IconSend size={16} />
            <span>{t("waitlistPreorderBtn")}</span>
          </button>
        </form>
      )}
    </Sheet>
  );
}

/* ============================================================
   3. REFERRAL HUB & GROWTH ENGINE MODAL
   ============================================================ */

export function ReferralHubSheet({
  open,
  onClose,
  stats = DEFAULT_REFERRAL_STATS,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  stats?: ReferralStats;
  onToast: (msg: string) => void;
}) {
  const { t, lang } = useI18n();
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);

  const shareLink = `${CONFIG.BOT_LINK}?start=ref_${stats.personalCode}`;

  const handleCopy = async () => {
    haptic("medium");
    try {
      await navigator.clipboard.writeText(shareLink);
      onToast(t("refCopied"));
    } catch {
      onToast(t("refCopied"));
    }
  };

  const handleShare = () => {
    haptic("medium");
    openTelegramShare(
      shareLink,
      L(
        `🌿 DELIS — O'zbekiston zavodidan premium uy va avto parvarish vositalari!\n🎁 Birinchi buyurtmangizga 15% chegirma: ${stats.personalCode}`,
        `🌿 DELIS — премиальный уход за домом и авто от завода в Узбекистане!\n🎁 Скидка 15% на первый заказ: ${stats.personalCode}`,
        `🌿 DELIS — premium home and car care made in Uzbekistan!\n🎁 Get 15% off your first order: ${stats.personalCode}`,
      ),
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("refHubTitle")}>
      <div className="space-y-4 pt-1">
        <p className="text-[13px] font-medium leading-relaxed text-ink2">{t("refHubSub")}</p>

        {/* Dynamic Referral Card */}
        <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-pine via-pine to-pinedeep p-5 text-white shadow-lift">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/70">
                {t("refYourLink")}
              </p>
              <p className="mt-1 font-mono text-[16px] font-bold tracking-wider text-amber">
                {stats.personalCode}
              </p>
            </div>
            <span className="rounded-full bg-white/20 px-3 py-1 font-display text-[11px] font-bold backdrop-blur-md">
              <span className="inline-flex items-center gap-1"><IconGift size={14} /> {L("Har bir do'st uchun +500", "+500 за друга", "+500 per friend")} <IconStarsOrbit size={13} /></span>
            </span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/15 pt-3.5 text-center">
            <div>
              <p className="font-display text-[18px] font-bold text-white">{stats.invitedCount}</p>
              <p className="mt-0.5 text-[10px] font-semibold text-white/70">{t("refStatInvited")}</p>
            </div>
            <div>
              <p className="font-display text-[18px] font-bold text-amber">{stats.firstOrdersCount}</p>
              <p className="mt-0.5 text-[10px] font-semibold text-white/70">{t("refStatOrders")}</p>
            </div>
            <div>
              <p className="font-display text-[15px] font-bold text-sage">
                {formatPrice(stats.earnedCashbackTotal, lang)}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-white/70">{t("refStatEarned")}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleShare}
            className="press flex h-13 flex-1 items-center justify-center gap-2 rounded-[20px] bg-amber text-[14px] font-bold text-white shadow-lift hover:brightness-105"
          >
            <IconShare size={16} />
            <span>{t("refShareBtn")}</span>
          </button>
          <button
            onClick={handleCopy}
            className="press flex h-13 w-13 items-center justify-center rounded-[20px] bg-paper2 text-ink"
            aria-label={L("Nusxalash", "Скопировать", "Copy")}
          >
            <IconCopy size={17} />
          </button>
        </div>

        {/* How it Works 3 Steps */}
        <div className="rounded-[24px] border border-ink/18 bg-card p-4 space-y-3">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink2">
            {t("refHowItWorks")}
          </p>

          <div className="space-y-2.5">
            {[
              { num: "1", text: t("refStep1") },
              { num: "2", text: t("refStep2") },
              { num: "3", text: t("refStep3") },
            ].map((step) => (
              <div key={step.num} className="flex items-start gap-2.5 text-[13px] font-semibold text-ink">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sagetint font-display text-[10px] font-bold text-pine">
                  {step.num}
                </span>
                <span className="leading-snug">{step.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/* ============================================================
   4. PAYMENT GATEWAY SANDBOX & DIRECT CHECKOUT MODAL
   ============================================================ */

export function PaymentGatewayModal({
  open,
  onClose,
  order,
  onPaymentSuccess,
}: {
  open: boolean;
  onClose: () => void;
  order: Order | null;
  onPaymentSuccess: (order: Order) => void;
}) {
  const { t, lang } = useI18n();
  const site = useSiteSettings();
  const [countdown, setCountdown] = useState(600); // 10 minutes
  const [isProcessing, setIsProcessing] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCountdown(600);
    const interval = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(interval);
  }, [open]);

  const orderId = order?.id ?? null;
  const paymentMethod = order?.paymentMethod ?? "";

  /* Poll the server for payment confirmation while the modal is open. */
  useEffect(() => {
    if (!open || !orderId || paymentMethod === "cash") return;
    let cancelled = false;
    const poll = async () => {
      const status = await fetchOrderStatus(orderId);
      if (!cancelled && status?.paymentStatus === "paid") {
        haptic("success");
        onPaymentSuccess({ ...(order as Order), paymentStatus: "paid" });
        onClose();
      }
    };
    void poll();
    const interval = setInterval(() => { void poll(); }, 5000);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId, paymentMethod]);

  if (!order) return null;

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const timeString = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isStars = order.paymentMethod === "stars";
  const isPayme = order.paymentMethod === "payme";
  const isClick = order.paymentMethod === "click";

  // The server creates this URL from runtime merchant configuration.
  // No payment identifiers or secrets are baked into the frontend bundle.
  const checkoutUrl = isPayme || isClick ? order.paymentUrl ?? null : null;

  const paymentBrandTitle = isPayme
    ? "Payme"
    : isClick
      ? "Click"
      : isStars
        ? "Telegram Stars"
        : order.paymentMethod.toUpperCase();

  const openExternal = (url: string) => {
    try {
      const tg = (window as unknown as { Telegram?: { WebApp?: { openLink?: (u: string) => void; openTelegramLink?: (u: string) => void } } })
        .Telegram?.WebApp;
      if (tg?.openLink) { tg.openLink(url); return; }
      if (tg?.openTelegramLink) { tg.openTelegramLink(url); return; }
    } catch { /* fall through */ }
    window.open(url, "_blank");
  };

  /** Stars: create a native Telegram invoice (amount comes from the server) and open it. */
  const handlePayStars = async () => {
    haptic("medium");
    setIsProcessing(true);
    try {
      const invoice = await createStarsInvoice(order.id);
      if (!invoice?.invoiceUrl) { haptic("error"); return; }
      openTelegramInvoice(invoice.invoiceUrl, (status) => {
        if (status === "paid") {
          haptic("success");
          onPaymentSuccess({ ...order, paymentStatus: "paid" });
          onClose();
        }
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /** Manual "I have paid — check" button (the 5s poller runs anyway). */
  const handleCheckStatus = async () => {
    haptic("light");
    setChecking(true);
    try {
      const status = await fetchOrderStatus(order.id);
      if (status?.paymentStatus === "paid") {
        haptic("success");
        onPaymentSuccess({ ...order, paymentStatus: "paid" });
        onClose();
      } else {
        haptic("error");
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("payGatewayTitle")}>
      <div className="space-y-4 pt-1 text-center">
        <p className="text-[13px] font-medium text-ink2">{t("payGatewaySub")}</p>

        {/* Payment Amount Card */}
        <div className="rounded-[24px] border border-moss/20 bg-sagetint/70 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-pine">
            {paymentBrandTitle} orqali to'lov
          </p>
          <p className="mt-1 font-display text-[26px] font-bold text-ink">
            {formatPrice(order.total, lang)}
          </p>
          <p className="mt-1 text-[12px] font-medium text-ink2">
            Buyurtma #{order.id} · {order.items.length} ta mahsulot
          </p>
        </div>

        {/* Hint */}
        <div className="flex items-center justify-center gap-2 text-[12px] font-semibold text-ink2/80">
          <IconShieldCheck size={15} className="text-moss" />
          <span>{isStars ? t("payStarsHint") : t("securePaymentGuarantee")}</span>
        </div>

        {/* Countdown timer */}
        <div className="inline-flex items-center gap-2 rounded-full bg-paper2 px-3.5 py-1.5 text-[12px] font-semibold text-ink2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber" />
          <span>{t("payTimeRemaining")}: <b>{timeString}</b></span>
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          {isStars && (
            <button
              onClick={handlePayStars}
              disabled={isProcessing}
              className="press flex h-14 w-full items-center justify-center gap-2 rounded-[22px] bg-moss text-[14px] font-bold text-white shadow-lift hover:brightness-105 disabled:opacity-50"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 rounded-full border-2 border-white border-t-transparent" />
                  <span>{t("payWaitingPayment")}</span>
                </span>
              ) : (
                <>
                  <IconStar size={18} />
                  <span className="inline-flex items-center gap-1">{t("payNow")} <IconStarsOrbit size={14} /></span>
                </>
              )}
            </button>
          )}

          {(isPayme || isClick) && checkoutUrl && (
            <button
              onClick={() => { haptic("medium"); openExternal(checkoutUrl); }}
              className="press flex h-14 w-full items-center justify-center gap-2 rounded-[22px] bg-moss text-[14px] font-bold text-white shadow-lift hover:brightness-105"
            >
              <IconExternalLink size={18} />
              <span>{t("payOpenApp")} — {paymentBrandTitle}</span>
            </button>
          )}

          {(isPayme || isClick) && !checkoutUrl && (
            <div className="rounded-[20px] border border-amber/25 bg-amber/[0.09] p-4 text-left">
              <p className="text-[13px] font-bold text-amberdeep">{t("payNotConfigured")}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink2">{t("payNotConfiguredSub")}</p>
              <a
                href={tgHref(site.supportTg)}
                target="_blank"
                rel="noreferrer"
                className="press mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-[12px] font-bold text-pine"
              >
                <IconSend size={13} />
                {site.managerName ? `${site.managerName} · ` : ""}{site.supportTg}
              </a>
            </div>
          )}

          <button
            onClick={handleCheckStatus}
            disabled={checking}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-ink/18 bg-card text-[13px] font-bold text-ink disabled:opacity-50"
          >
            {checking ? (
              <span className="animate-spin h-4 w-4 rounded-full border-2 border-ink/40 border-t-ink" />
            ) : (
              <IconCheck size={15} />
            )}
            <span>{t("payCheckStatus")}</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}

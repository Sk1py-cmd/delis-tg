/**
 * DELIS — Полный поток оформления заказа: корзина → доставка → оплата → экран успеха, плюс детали заказа. Здесь же рассчитываются тарифы доставки по регионам и промокоды.
 */
import { useState, useMemo, useEffect, type ChangeEvent } from "react";
import { useI18n } from "./i18n";
import {
  PRODUCTS,
  loadPromoCodes,
  UZBEKISTAN_REGIONS,
  getRegionTariff,
  getFreeShippingThreshold,
  getDeliveryConfig,
  getCartNudge,
  cartNudgeDiscount,
  TIME_SLOTS,
  WHOLESALE_TIERS,
  wholesalePrice,
  type Product,
  type Order,
  type OrderItem,
  type DeliveryMethod,
  type PaymentMethod,
  type CourierInfo,
} from "./data";
import { formatPrice, haptic, openTelegramInvoice, sendDataToBot, requestTelegramContact, type TgUser } from "./kit";
import { createStarsInvoice, createOrder, fetchPaymentAvailability, hasTelegramSession, isApiConfigured, prepareBrowserCheckoutSession, validatePromo, verifyB2bCode, type PaymentAvailability } from "./api";
import { CONFIG } from "./config";
import { tgHref, useSiteSettings } from "./site-settings";
import {
  IconArrow,
  IconBag,
  IconBriefcase,
  IconCalculator,
  IconCash,
  IconCheck,
  IconChevron,
  IconCopy,
  IconFactory,
  IconGift,
  IconHome,
  IconKey,
  IconLock,
  IconMinus,
  IconPin,
  IconPlus,
  IconPrinter,
  IconReceipt,
  IconSearch,
  IconSend,
  IconSparkle,
  IconStarsOrbit,
  IconStore,
  IconTag,
  IconTruck,
  IconPhone,
  IconClock,
  IconClose,
  IconStar,
} from "./icons";
import { Sheet } from "./chrome";
import { SwipeToDelete, type SavedAddress } from "./features-extra";

export type CheckoutStep = "cart" | "delivery" | "payment" | "success";

/* SECURITY: raw card data (number, CVV) is NEVER collected inside the Mini App.
   When a card method is chosen, the user is redirected to the bank's PCI-compliant
   hosted payment page (Payme/Click/Uzum). Only a non-sensitive token returns. */

/* ---------------- CONVERSION RECOMMENDATIONS ---------------- */

const SAFE_PAYMENT_DEFAULTS: PaymentAvailability = { payme: false, click: false, cash: true, stars: false };

const CART_COMPLEMENTS: Record<string, string[]> = {
  wax: ["shampoo", "interior", "wheel"],
  shampoo: ["wax", "wheel", "interior"],
  glass: ["kitchen", "cloud", "floor"],
  floor: ["cloud", "glass", "kitchen"],
  cloud: ["floor", "glass", "kitchen"],
  interior: ["shampoo", "wheel", "wax"],
  kitchen: ["glass", "floor", "cloud"],
  wheel: ["wax", "shampoo", "interior"],
};

/* ---------------- PAYMENT BRAND ---------------- */

function PaymentBrandLogo({ method, cardType }: { method: PaymentMethod; cardType?: "humo" | "uzcard" | "visa" | "mastercard" | "unknown" }) {
  if (method === "payme")
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#00CCCC]/15">
        <span className="font-display text-[15px] font-black tracking-tight text-[#008A8A]">Pay<span className="text-[11px]">me</span></span>
      </div>
    );
  if (method === "click")
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#0073FF]/15">
        <span className="font-display text-[13px] font-black text-[#0052B3]">Click</span>
      </div>
    );
  if (method === "paynet")
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#FF9900]/15">
        <span className="font-display text-[11px] font-black text-[#D97706]">Paynet</span>
      </div>
    );
  if (method === "uzum")
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#7B2CBF]/15">
        <span className="font-display text-[13px] font-black text-[#6D28D9]">uzum</span>
      </div>
    );
  if (method === "card_uz") {
    const label = cardType === "humo" ? "HUMO" : cardType === "uzcard" ? "UZCARD" : "H·U";
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#10B981]/15">
        <span className="font-display text-[9px] font-black text-[#047857] tracking-wide">{label}</span>
      </div>
    );
  }
  if (method === "card_intl") {
    if (cardType === "visa")
      return (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#1A1F71]/15">
          <span className="font-display text-[13px] font-black italic text-[#1A1F71]">VISA</span>
        </div>
      );
    if (cardType === "mastercard")
      return (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#111]/5">
          <div className="flex -space-x-2">
            <span className="h-5 w-5 rounded-full bg-[#EB001B]/80" />
            <span className="h-5 w-5 rounded-full bg-[#F79E1B]/80" />
          </div>
        </div>
      );
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#1E3A8A]/10">
        <span className="font-display text-[10px] font-black text-[#1E3A8A]">V·M</span>
      </div>
    );
  }
  if (method === "cash")
    return (
      <div className="motion-icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-paper2 text-pine"><IconCash size={22} /></div>
    );
  if (method === "stars")
    return (
      <div className="motion-icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-amber/20 text-amberdeep"><IconStarsOrbit size={24} /></div>
    );
  return null;
}

/* ---------------- CHECKOUT SHEET ---------------- */

export function CheckoutSheet({
  open,
  onClose,
  cart,
  products,
  onInc,
  onDec,
  onClearCart,
  onOrderPlaced,
  goFeatured,
  user,
  addresses = [],
  onOpenAddresses,
  starsCoupon = null,
  onClearStarsCoupon,
  gifts = [],
}: {
  open: boolean;
  onClose: () => void;
  cart: Record<string, number>;
  /** Live server-synced catalog, including products created in the admin panel. */
  products: Product[];
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onClearCart: () => void;
  onOrderPlaced: (order: Order) => void;
  goFeatured: () => void;
  user: TgUser | null;
  addresses?: SavedAddress[];
  onOpenAddresses?: () => void;
  starsCoupon?: string | null;
  onClearStarsCoupon?: () => void;
  gifts?: string[];
}) {
  const { t, lang } = useI18n();
  const [step, setStep] = useState<CheckoutStep>("cart");
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("courier_uzb");
  const [recipientName, setRecipientName] = useState([user?.first_name, user?.last_name].filter(Boolean).join(" ") || "");
  const [recipientPhone, setRecipientPhone] = useState(user?.phone_number || "+998 ");
  const [selectedRegionId, setSelectedRegionId] = useState(UZBEKISTAN_REGIONS[0].id);
  const [selectedDistrict, setSelectedDistrict] = useState(UZBEKISTAN_REGIONS[0].districts[0]);
  const [streetAddress, setStreetAddress] = useState("");
  const [apartment, setApartment] = useState("");
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[0].id);
  const [courierNote, setCourierNote] = useState("");

  const nameFromTg = !!(user?.first_name || user?.last_name);
  const phoneFromTg = !!user?.phone_number;
  const telegramSession = hasTelegramSession();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentAvailability, setPaymentAvailability] = useState<PaymentAvailability>(SAFE_PAYMENT_DEFAULTS);
  const [paymentReadinessLoaded, setPaymentReadinessLoaded] = useState(false);
  const requiresTelegramPayment = paymentMethod === "stars" && !telegramSession;
  const [browserCheckoutReady, setBrowserCheckoutReady] = useState(telegramSession);
  const [browserCheckoutChecking, setBrowserCheckoutChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [receiptSent, setReceiptSent] = useState(false);

  const [errors, setErrors] = useState<{ name?: boolean; phone?: boolean; address?: boolean }>({});
  const [orderError, setOrderError] = useState<string | null>(null);
  const [requiresTelegram, setRequiresTelegram] = useState(false);
  /** Promo approved by the SERVER (only server-validated promos are sent with the order). */
  const [promoApproved, setPromoApproved] = useState(false);
  /** Gift certificate validated by the server (redeemed atomically inside the order tx). */
  const [certInput, setCertInput] = useState("");
  const [certApproved, setCertApproved] = useState<{ code: string; amount: number } | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  /** B2B partner code validated by the server; grants a personal wholesale discount. */
  const [b2bInput, setB2bInput] = useState("");
  const [b2bApproved, setB2bApproved] = useState<{ code: string; percent: number } | null>(null);
  const [b2bError, setB2bError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const currentRegion = useMemo(() => UZBEKISTAN_REGIONS.find((r) => r.id === selectedRegionId) || UZBEKISTAN_REGIONS[0], [selectedRegionId]);

  const handleRegionChange = (regionId: string) => {
    haptic("light");
    const region = UZBEKISTAN_REGIONS.find((r) => r.id === regionId) || UZBEKISTAN_REGIONS[0];
    setSelectedRegionId(regionId);
    setSelectedDistrict(region.districts[0]);
  };

  useEffect(() => {
    if (!open) {
      setPaymentReadinessLoaded(false);
      return;
    }
    let active = true;
    const refresh = async () => {
      const methods = await fetchPaymentAvailability();
      if (!active || !methods) return;
      setPaymentAvailability(methods);
      setPaymentMethod((current) => methods[current as keyof PaymentAvailability] ? current : "cash");
      setPaymentReadinessLoaded(true);
    };
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const onUpdated = () => { void refresh(); };
    void refresh();
    // Payment credentials are runtime settings. If the owner saves them while
    // checkout is already open (same tab or another tab), the method appears
    // without closing checkout, refreshing the page or rebuilding frontend.
    const interval = window.setInterval(() => void refresh(), 5_000);
    window.addEventListener("focus", onUpdated);
    window.addEventListener("delis:payments-updated", onUpdated);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onUpdated);
      window.removeEventListener("delis:payments-updated", onUpdated);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setBrowserCheckoutChecking(false);
      return;
    }
    if (telegramSession) {
      setBrowserCheckoutReady(true);
      setBrowserCheckoutChecking(false);
      return;
    }
    let active = true;
    setBrowserCheckoutChecking(true);
    void prepareBrowserCheckoutSession().then((ready) => {
      if (!active) return;
      setBrowserCheckoutReady(ready);
      setBrowserCheckoutChecking(false);
    });
    return () => { active = false; };
  }, [open, telegramSession]);

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setStep("cart");
        setIsSubmitting(false);
        setPlacedOrder(null);
        setReceiptSent(false);
        setErrors({});
        setCertApproved(null);
        setCertInput("");
        setCertError(null);
        setB2bApproved(null);
        setB2bInput("");
        setB2bError(null);
        setShowConfirm(false);
        setOrderError(null);
        setRequiresTelegram(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const cartEntries = useMemo(() => Object.entries(cart).filter(([, q]) => q > 0), [cart]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const cartUpsells = useMemo(() => {
    const inCart = new Set(cartEntries.map(([id]) => id));
    const preferredIds = cartEntries.flatMap(([id]) => CART_COMPLEMENTS[id] || []);
    const preferred = preferredIds
      .map((id) => productById.get(id))
      .filter((product): product is Product => Boolean(product && !inCart.has(product.id) && Number(product.stock || 0) > 0));
    const fallback = products
      .filter((product) => !inCart.has(product.id) && Number(product.stock || 0) > 0)
      .sort((a, b) => b.rating - a.rating);
    return [...new Map([...preferred, ...fallback].map((product) => [product.id, product])).values()].slice(0, 2);
  }, [cartEntries, productById, products]);

  // Retail subtotal (what it would cost at unit prices)
  const retailSubtotal = useMemo(() => cartEntries.reduce((sum, [id, q]) => {
    const product = productById.get(id);
    return sum + (product ? product.price * q : 0);
  }, 0), [cartEntries, productById]);

  // Actual subtotal: wholesale tier pricing kicks in automatically per line at 6+ units
  const subtotal = useMemo(() => cartEntries.reduce((sum, [id, q]) => {
    if (gifts.includes(id)) return sum; // stars-shop gift is free
    const product = productById.get(id);
    if (!product) return sum;
    const ws = wholesalePrice(product.price, q);
    return sum + ws.unit * q;
  }, 0), [cartEntries, gifts, productById]);

  // Total saved thanks to wholesale volume pricing
  const wholesaleSavings = retailSubtotal - subtotal;
  // Re-read on every open: stars-shop coupons and admin promos issued while
  // the app was running land in the local cache between sessions.
  const promoCodes = useMemo(() => loadPromoCodes(), [open]);
  const starsCouponObj = starsCoupon ? promoCodes[starsCoupon] : null;
  const effectivePromo = appliedPromo || (starsCouponObj ? starsCoupon : null);
  const effectivePromoObj = effectivePromo ? promoCodes[effectivePromo] : null;
  const hasWholesaleQuantity = cartEntries.some(([, qty]) => qty >= WHOLESALE_TIERS[0].minQty);
  const promoEligible = Boolean(
    effectivePromoObj
      && (!effectivePromoObj.minSpend || subtotal >= effectivePromoObj.minSpend)
      && (!effectivePromoObj.requiredProductId || Number(cart[effectivePromoObj.requiredProductId] || 0) > 0)
      && (!effectivePromoObj.retailOnly || !hasWholesaleQuantity),
  );
  const discount = useMemo(() => {
    if (!effectivePromoObj || !promoEligible) return 0;
    if (effectivePromoObj.type === "percent") {
      const rawDiscount = Math.round((subtotal * effectivePromoObj.value) / 100);
      return effectivePromoObj.maxDiscount ? Math.min(rawDiscount, effectivePromoObj.maxDiscount) : rawDiscount;
    }
    if (effectivePromoObj.type === "fixed") return Math.min(effectivePromoObj.value, subtotal);
    return 0;
  }, [effectivePromoObj, promoEligible, subtotal]);

  /* B2B partner code → personal wholesale discount on the goods subtotal.
     Exclusive with a promo code (mirrors the server, which never stacks them). */
  const b2bPercent = b2bApproved?.percent ?? 0;
  const b2bActive = Boolean(b2bApproved && !effectivePromo && b2bPercent > 0);
  const b2bDiscount = b2bActive ? Math.min(subtotal, Math.floor((subtotal * b2bPercent) / 100)) : 0;

  /* Cart nudge: 3% off big carts (500k / max 10k). Deliberately exclusive — it
     never stacks with a promo code, a B2B code or wholesale quantities. */
  const cartNudgeActive = !effectivePromo && !hasWholesaleQuantity && !b2bActive;
  const nudgeDiscount = cartNudgeActive ? cartNudgeDiscount(subtotal, getCartNudge()) : 0;
  const totalDiscount = discount + b2bDiscount + nudgeDiscount;
  const nudgeThreshold = getCartNudge().threshold;
  const nudgeRemaining = cartNudgeActive ? Math.max(0, nudgeThreshold - subtotal) : 0;

  /* Region-based tariff: price and ETA depend on the selected region */
  const tariff = useMemo(() => getRegionTariff(selectedRegionId), [selectedRegionId]);
  const etaLabel = useMemo(
    () => (tariff.days[0] === tariff.days[1] ? `${tariff.days[0]}` : `${tariff.days[0]}–${tariff.days[1]}`),
    [tariff],
  );

  const regionName = UZBEKISTAN_REGIONS.find((r) => r.id === selectedRegionId)?.[lang] ?? "";

  const deliveryFee = useMemo(() => {
    if (deliveryMethod === "pickup") return 0;
    if (subtotal >= getFreeShippingThreshold()) return 0;
    const baseFee = deliveryMethod === "courier_uzb" ? tariff.courier : tariff.bts;
    if (promoEligible && effectivePromoObj?.type === "freeship") {
      const credit = effectivePromoObj.maxDiscount || baseFee;
      return Math.max(0, baseFee - credit);
    }
    return baseFee;
  }, [deliveryMethod, effectivePromoObj, promoEligible, subtotal, tariff]);
  // Certificate covers goods AFTER the promo (never delivery) — mirrors server pricing.ts
  const certAppliedEstimate = certApproved ? Math.min(certApproved.amount, Math.max(0, subtotal - totalDiscount)) : 0;
  const grandTotal = Math.max(0, subtotal - totalDiscount - certAppliedEstimate) + deliveryFee;
  const totalItemsCount = cartEntries.reduce((a, [, q]) => a + q, 0);
  const freeShippingRemaining = Math.max(0, getFreeShippingThreshold() - subtotal);
  const freeShippingProgress = Math.min(100, Math.round((subtotal / getFreeShippingThreshold()) * 100));

  const validateDelivery = () => {
    const errs: { name?: boolean; phone?: boolean; address?: boolean } = {};
    if (!recipientName.trim()) errs.name = true;
    if (recipientPhone.replace(/\D/g, "").length < 12) errs.phone = true;
    if (deliveryMethod !== "pickup" && !streetAddress.trim()) errs.address = true;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const applyPromoLocal = (code: string): boolean => {
    const found = promoCodes[code];
    if (found && found.active === false) return false;
    if (!found) return false;
    if (found.minSpend && subtotal < found.minSpend) return false;
    if (found.requiredProductId && Number(cart[found.requiredProductId] || 0) <= 0) return false;
    if (found.retailOnly && hasWholesaleQuantity) return false;
    return true;
  };

  /** Promos are authoritative on the server — validate there first; the local
   *  list is only an offline fallback display. */
  const handleApplyPromo = async () => {
    haptic("light");
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    const remote = await validatePromo(code, lang);
    if (remote) {
      // Server answered: use its verdict
      if (!remote.valid) { setPromoError(t("promoInvalid")); haptic("error"); return; }
      if (remote.minSpend && subtotal < remote.minSpend) {
        setPromoError(`${t("promoMinSpend")} ${formatPrice(remote.minSpend, lang)}`);
        haptic("error");
        return;
      }
      if (remote.requiredProductId && Number(cart[remote.requiredProductId] || 0) <= 0) {
        setPromoError(lang === "ru" ? "Добавьте подарочный товар в корзину" : lang === "en" ? "Add the gift product to your cart" : "Sovg'a mahsulotini savatga qo'shing");
        haptic("error");
        return;
      }
      if (remote.retailOnly && hasWholesaleQuantity) {
        setPromoError(lang === "ru" ? "Награды Stars действуют только на розничный заказ" : lang === "en" ? "Stars rewards apply to retail orders only" : "Stars mukofotlari faqat chakana buyurtmaga amal qiladi");
        haptic("error");
        return;
      }
      setAppliedPromo(code);
      setPromoApproved(true);
      setPromoError(null);
      setPromoInput("");
      haptic("success");
      return;
    }
    // Server unreachable → offline mode: local list, display only
    if (!applyPromoLocal(code)) { setPromoError(t("promoInvalid")); haptic("error"); return; }
    setAppliedPromo(code);
    setPromoApproved(false);
    setPromoError(null);
    setPromoInput("");
    haptic("success");
  };

  /** Server-validates a B2B partner code and shows its personal discount. */
  const handleApplyB2b = async () => {
    const code = b2bInput.trim().toUpperCase();
    if (!code) return;
    haptic("medium");
    setB2bError(null);
    if (!isApiConfigured()) {
      setB2bError(lang === "ru" ? "B2B-код проверяется только онлайн" : lang === "en" ? "B2B code is verified online only" : "B2B kod faqat onlayn tekshiriladi");
      haptic("error");
      return;
    }
    const res = await verifyB2bCode(code);
    if (res.ok) {
      setB2bApproved({ code, percent: res.percent ?? 0 });
      setB2bInput("");
      haptic("success");
    } else {
      setB2bApproved(null);
      setB2bError(lang === "ru" ? "Код не найден или недействителен" : lang === "en" ? "Code not found or invalid" : "Kod topilmadi yoki yaroqsiz");
      haptic("error");
    }
  };

  /** Server-validates a gift certificate code (never trusts the amount typed). */
  const handleApplyCert = async () => {
    const code = certInput.trim().toUpperCase();
    if (!code) return;
    haptic("medium");
    setCertError(null);
    const { checkCertificate } = await import("./api");
    const res = await checkCertificate(code);
    if (res.ok && typeof res.amount === "number") {
      setCertApproved({ code, amount: res.amount });
      setCertInput("");
      haptic("success");
    } else {
      setCertApproved(null);
      const reason = String(res.error || "");
      setCertError(
        reason === "cert_pending"
          ? (lang === "uz" ? "Sertifikat hali faollashtirilmagan — menejerni kuting" : lang === "ru" ? "Сертификат ещё не активирован менеджером" : "Certificate is not activated by the manager yet")
          : reason === "cert_redeemed"
            ? (lang === "uz" ? "Bu kod allaqachon ishlatilgan" : lang === "ru" ? "Этот код уже погашен" : "This code was already redeemed")
            : (lang === "uz" ? "Sertifikat topilmadi" : lang === "ru" ? "Сертификат не найден или недействителен" : "Certificate not found or invalid"),
      );
      haptic("error");
    }
  };

  const handlePlaceOrder = async (quickMethod?: DeliveryMethod) => {
    if (isSubmitting) return; // double-click guard: no duplicate orders
    // One-click orders pass an explicit method (self-pickup); otherwise use
    // the currently selected delivery method from the form.
    const method = quickMethod ?? deliveryMethod;

    // Validate (pickup needs no street address → skip it for quick orders).
    const errs: { name?: boolean; phone?: boolean; address?: boolean } = {};
    if (!recipientName.trim()) errs.name = true;
    if (recipientPhone.replace(/\D/g, "").length < 12) errs.phone = true;
    if (method !== "pickup" && !streetAddress.trim()) errs.address = true;
    setErrors(errs);
    if (Object.keys(errs).length) { haptic("light"); return; }

    haptic("medium"); setIsSubmitting(true); setOrderError(null); setRequiresTelegram(false);

    // Confirm the effective promo with the server (covers stars-shop coupons
    // auto-applied without going through handleApplyPromo).
    let promoOk = promoApproved;
    const promoToSend = effectivePromo;
    if (promoToSend && !promoOk && isApiConfigured()) {
      const check = await validatePromo(promoToSend, lang);
      promoOk = Boolean(check?.valid);
    }

    const regionObj = UZBEKISTAN_REGIONS.find((r) => r.id === selectedRegionId) || UZBEKISTAN_REGIONS[0];
    const regionName = regionObj[lang];
    const fullAddress = method === "pickup"
      ? "DELIS Factory · Namangan viloyati, To'raqo'rg'on tumani, sanoat zonasi"
      : `${regionName}, ${selectedDistrict}, ${streetAddress}${apartment ? `, ${apartment}` : ""}`;
    const selectedTimeLabel = TIME_SLOTS.find((s) => s.id === timeSlot)?.label[lang] || TIME_SLOTS[0].label[lang];
    const orderDate = new Date().toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "short", year: "numeric" });
    const items = cartEntries.flatMap(([id, qty]): OrderItem[] => {
      const product = productById.get(id);
      return product ? [{ id: product.id, name: product.name, qty, price: product.price, img: product.img }] : [];
    });
    if (items.length !== cartEntries.length) {
      // A product was removed/disabled after it entered the cart. Keep the cart
      // visible and let the customer remove or replace the stale line.
      setIsSubmitting(false);
      setOrderError(t("orderProductUnavailable"));
      haptic("error");
      return;
    }

    // The server is the only source of truth. Never show a successful order
    // until prices, stock, coupons and certificates have been committed there.
    if (!isApiConfigured()) {
      setIsSubmitting(false);
      setOrderError(t("orderOffline"));
      haptic("error");
      return;
    }

    const res = await createOrder({
      items: items.map(({ id, qty, price }) => ({ id, qty, price })),
      delivery: { method, zone: regionName, address: fullAddress, time: selectedTimeLabel, note: courierNote.trim() || undefined },
      recipient: { name: recipientName, phone: recipientPhone },
      payment: { method: paymentMethod },
      subtotal, discount, promoCode: promoOk ? (promoToSend || undefined) : undefined,
      b2bCode: b2bApproved?.code, certCode: certApproved?.code, deliveryFee, total: grandTotal,
    });
    if (res.kind !== "ok") {
      // Keep both the checkout form and cart intact so the customer can retry.
      setIsSubmitting(false);
      const rejected = res.kind === "rejected";
      const guarded = rejected && res.error === "reward_margin_guard";
      const starsRequired = rejected && res.error === "telegram_required_for_stars";
      const telegramRequired = rejected && (res.status === 401 || starsRequired);
      const paymentUnavailable = rejected && res.error === "payment_not_configured";
      const stockChanged = rejected && res.error === "insufficient_stock";
      const productUnavailable = rejected && (res.error === "unknown_product" || res.error === "inactive_product");
      const b2bRejected = rejected && res.error === "invalid_b2b_code";
      if (b2bRejected) setB2bApproved(null);
      setRequiresTelegram(telegramRequired);
      setOrderError(
        telegramRequired
          ? starsRequired
            ? lang === "ru"
              ? "Оплата Telegram Stars доступна только внутри Telegram. Выберите другой способ или откройте DELIS через бота."
              : lang === "en"
                ? "Telegram Stars payment is available only inside Telegram. Choose another method or open DELIS through the bot."
                : "Telegram Stars orqali to'lov faqat Telegram ichida ishlaydi. Boshqa usulni tanlang yoki DELIS'ni bot orqali oching."
            : lang === "ru"
              ? "Не удалось создать безопасную браузерную сессию. Повторите попытку или откройте DELIS внутри Telegram."
              : lang === "en"
                ? "Couldn't create a secure browser session. Try again or open DELIS inside Telegram."
                : "Xavfsiz brauzer sessiyasini yaratib bo'lmadi. Qayta urinib ko'ring yoki DELIS'ni Telegram ichida oching."
          : paymentUnavailable
            ? lang === "ru"
              ? "Этот способ оплаты временно недоступен. Вернитесь назад и выберите другой."
              : lang === "en"
                ? "This payment method is temporarily unavailable. Go back and choose another one."
                : "Bu to'lov usuli vaqtincha mavjud emas. Orqaga qaytib, boshqa usulni tanlang."
            : stockChanged
              ? lang === "ru"
                ? "Остаток одного из товаров изменился. Вернитесь в корзину и обновите количество."
                : lang === "en"
                  ? "Stock changed for one of the items. Return to the cart and update the quantity."
                  : "Mahsulotlardan birining qoldig'i o'zgardi. Savatga qaytib miqdorni yangilang."
            : productUnavailable
              ? lang === "ru"
                ? "Один из товаров недоступен на сервере. Вернитесь в каталог, обновите его и попробуйте снова."
                : lang === "en"
                  ? "One of the items is no longer available on the server. Refresh the catalog and try again."
                  : "Mahsulotlardan biri serverda mavjud emas. Katalogga qaytib, yangilab qayta urinib ko'ring."
            : b2bRejected
              ? lang === "ru"
                ? "B2B-код недействителен. Введите актуальный код партнёра."
                : lang === "en"
                  ? "The B2B code is invalid. Enter a current partner code."
                  : "B2B kod yaroqsiz. Amaldagi hamkor kodini kiriting."
            : guarded
              ? lang === "ru"
                ? "Эта награда не подходит к выбранной корзине. Уберите купон или измените состав заказа."
                : lang === "en"
                  ? "This reward does not fit the selected basket. Remove the coupon or adjust the order."
                  : "Bu mukofot tanlangan savatga mos emas. Kuponni olib tashlang yoki buyurtmani o'zgartiring."
              : t(res.kind === "offline" ? "orderOffline" : "orderRejected"),
      );
      haptic("error");
      return;
    }

    const accepted = res.order;
    setTimeout(() => {
      const newOrder: Order = {
        id: accepted.order_id, date: orderDate, createdAt: Date.now(),
        subtotal: accepted.subtotal,
        discount: accepted.discount,
        promoCode: promoOk ? (promoToSend || undefined) : undefined,
        deliveryFee: accepted.deliveryFee,
        total: accepted.total, count: totalItemsCount, items,
        deliveryMethod: method, deliveryZone: regionName, deliveryAddress: fullAddress,
        deliveryTime: selectedTimeLabel, recipientName, recipientPhone,
        customerTgId: user?.id,
        customerSource: user?.id ? "telegram" : "browser",
        customerUsername: user?.username,
        customerName: user?.first_name,
        paymentMethod,
        // Online orders are PENDING until the payment is actually confirmed —
        // nothing is ever marked paid upfront.
        paymentStatus: (accepted.payment_status as "paid" | "pending" | "cod" | undefined) ?? (paymentMethod === "cash" ? "cod" : "pending"),
        paymentUrl: accepted.payment_url,
        expectedStars: accepted.expectedStars,
        status: "new", courierNote: courierNote.trim() || undefined,
        courier: undefined, // assigned by the manager once the order ships
      };
      setPlacedOrder(newOrder); onOrderPlaced(newOrder); onClearCart(); setIsSubmitting(false); setStep("success"); haptic("success");
      sendDataToBot({
        type: "delis_order",
        order_id: newOrder.id,
        created_at: new Date().toISOString(),
        customer: { tg_id: user?.id ?? null, tg_username: user?.username ?? null, name: newOrder.recipientName, phone: newOrder.recipientPhone },
        delivery: { method: newOrder.deliveryMethod, region: newOrder.deliveryZone, district: selectedDistrict, address: newOrder.deliveryAddress, time: newOrder.deliveryTime, note: newOrder.courierNote ?? "" },
        payment: { method: newOrder.paymentMethod, status: newOrder.paymentStatus, card_last4: newOrder.cardMeta?.last4 ?? null, card_type: newOrder.cardMeta?.type ?? null },
        items: newOrder.items.map((it) => ({ id: it.id, name: it.name, qty: it.qty, price: it.price })),
        totals: { subtotal: newOrder.subtotal, discount: newOrder.discount, promo: newOrder.promoCode ?? null, delivery_fee: newOrder.deliveryFee, total: newOrder.total, currency: "UZS" },
      });

      // Telegram Stars: create and open a native Telegram invoice after the order is registered.
      if (newOrder.paymentMethod === "stars") {
        void (async () => {
          const invoice = await createStarsInvoice(newOrder.id);
          if (!invoice?.invoiceUrl) return;
          openTelegramInvoice(invoice.invoiceUrl, (status) => {
            if (status === "paid") {
              haptic("success");
              // Update payment status dynamically on the success screen
              setPlacedOrder((prev) => prev ? { ...prev, paymentStatus: "paid" } : null);
            }
          });
        })();
      }
    }, 900);
  };

  const buildReceiptText = (order: Order) => {
    const lines = order.items.map((it) => `• ${it.name} × ${it.qty} — ${formatPrice(it.price * it.qty, lang)}`).join("\n");
    return [
      `🧾 DELIS — ${t("orderNumber")} #${order.id}`,
      ``,
      `👤 ${order.recipientName} · ${order.recipientPhone}`,
      `🚚 ${order.deliveryAddress}`,
      `🕒 ${order.deliveryTime}`,
      ``,
      lines,
      ``,
      `${t("subtotal")}: ${formatPrice(order.subtotal, lang)}`,
      order.discount > 0 ? `${t("discount")} (${order.promoCode}): -${formatPrice(order.discount, lang)}` : ``,
      `${t("deliveryFee")}: ${order.deliveryFee === 0 ? t("deliveryFree") : formatPrice(order.deliveryFee, lang)}`,
      `${t("cartTotal")}: ${formatPrice(order.total, lang)}`,
    ].filter(Boolean).join("\n");
  };

  const payWithStars = async () => {
    if (!placedOrder) return;
    haptic("medium");
    const invoice = await createStarsInvoice(placedOrder.id);
    if (!invoice?.invoiceUrl) return;
    openTelegramInvoice(invoice.invoiceUrl, (status) => {
      if (status === "paid") {
        haptic("success");
        setPlacedOrder((prev) => (prev ? { ...prev, paymentStatus: "paid" } : null));
      }
    });
  };

  const handleSendReceiptToBot = () => {
    haptic("success");
    if (!placedOrder) return;
    const sent = sendDataToBot({
      type: "delis_receipt",
      order_id: placedOrder.id,
      receipt_text: buildReceiptText(placedOrder),
      customer_tg_id: user?.id ?? null,
    });
    if (sent) setReceiptSent(true);
    else {
      try {
        const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } }).Telegram?.WebApp;
        if (tg?.openTelegramLink) tg.openTelegramLink(`${CONFIG.BOT_LINK}?start=order_${placedOrder.id}`);
        else window.open(`${CONFIG.BOT_LINK}?start=order_${placedOrder.id}`, "_blank");
      } catch { window.open(`${CONFIG.BOT_LINK}?start=order_${placedOrder.id}`, "_blank"); }
      setReceiptSent(true);
    }
  };

  const sheetTitle = step === "cart" ? t("cartTitle") : step === "delivery" ? t("stepDelivery") : step === "payment" ? t("stepPayment") : t("orderSuccessTitle");
  const checkoutSteps = [
    { id: "cart" as const, label: t("stepCart") },
    { id: "delivery" as const, label: t("stepDelivery") },
    { id: "payment" as const, label: t("stepPayment") },
  ];
  const checkoutStepIndex = checkoutSteps.findIndex((item) => item.id === step);
  const paymentTitles: Record<PaymentMethod, string> = {
    payme: "Payme", click: "Click Evolution", paynet: t("paynetTitle"), uzum: t("uzumTitle"),
    card_uz: t("cardUzTitle"), card_intl: t("cardIntlTitle"), cash: t("cashTitle"), stars: t("starsTitle"),
  };
  const paymentDescriptions: Record<PaymentMethod, string> = {
    payme: t("paymeDesc"), click: t("clickDesc"), paynet: t("paynetDesc"), uzum: t("uzumDesc"),
    card_uz: t("cardUzDesc"), card_intl: t("cardIntlDesc"), cash: t("cashDesc"), stars: t("starsDesc"),
  };
  const checkoutPaymentMethods = (["payme", "click", "cash", "stars"] as const)
    .filter((method) => paymentAvailability[method]);
  const unavailablePaymentNames = (["payme", "click", "stars"] as const)
    .filter((method) => !paymentAvailability[method])
    .map((method) => paymentTitles[method]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={step !== "success" ? (step === "payment" && showConfirm ? t("stepConfirmation") : sheetTitle) : undefined}
      footer={step === "cart" && cartEntries.length > 0 ? (
        <div className="checkout-cart-footer flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink/55">{t("cartTotal")}</p>
            <p className="truncate font-display text-[17px] font-bold tracking-tight text-ink">{formatPrice(Math.max(0, subtotal - discount), lang)}</p>
          </div>
          <button
            onClick={() => { haptic("medium"); setStep("delivery"); }}
            className="press flex h-12 min-w-[178px] items-center justify-center gap-2 rounded-[18px] bg-amber px-4 text-[13px] font-bold text-white shadow-soft"
          >
            <span>{t("continueToDelivery")}</span><IconArrow size={15} />
          </button>
        </div>
      ) : step === "delivery" ? (
        <button
          onClick={() => { if (!validateDelivery()) { haptic("light"); return; } haptic("medium"); setStep("payment"); }}
          className="press flex h-12 w-full items-center justify-center gap-2.5 rounded-[18px] bg-amber text-[14px] font-bold text-white shadow-soft"
        >
          <span>{t("continueToPayment")}</span><IconArrow size={15} />
        </button>
      ) : undefined}
    >
      {step !== "success" && (
        <div className="checkout-progress mb-4" aria-label={sheetTitle}>
          <div className="checkout-progress__line" aria-hidden>
            <span style={{ width: `${Math.max(0, checkoutStepIndex) * 50}%` }} />
          </div>
          {checkoutSteps.map((item, index) => {
            const active = index === checkoutStepIndex;
            const complete = index < checkoutStepIndex;
            return (
              <div key={item.id} className={`checkout-progress__item ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`}>
                <span className="checkout-progress__node">{complete ? <IconCheck size={11} strokeWidth={2.8} /> : index + 1}</span>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>
      )}
      {step === "success" && placedOrder && (
        <div className="checkout-success animate-pop relative pt-3 text-center">
          <span className="checkout-success__spark is-left"><IconSparkle size={15} /></span>
          <span className="checkout-success__spark is-right"><IconSparkle size={12} /></span>
          <span className="checkout-success__spark is-top"><IconSparkle size={9} /></span>
          <div className="checkout-success__seal mx-auto grid h-20 w-20 place-items-center rounded-[24px] bg-moss/12 text-moss">
            <span className="checkout-success__ring" aria-hidden />
            <IconCheck size={37} strokeWidth={2.8} />
          </div>
          <h3 className="mt-4 font-display text-[22px] font-bold tracking-tight text-ink">{t("orderSuccessTitle")}</h3>
          <p className="mx-auto mt-2 max-w-[320px] text-[13px] font-medium leading-relaxed text-ink/60">{t("orderSuccessSub")}</p>

          <div className="mt-6 overflow-hidden rounded-[26px] border border-ink/18 bg-card text-left shadow-soft">
            <div className="border-b border-dashed border-ink/15 bg-paper2/50 p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-ink/70">{t("orderNumber")}</p><p className="mt-0.5 font-display text-[17px] font-bold text-ink">#{placedOrder.id}</p></div>
                <span className="rounded-full bg-moss/12 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-moss">
                  {placedOrder.paymentStatus === "paid"
                    ? placedOrder.paymentMethod === "stars"
                      ? <span className="inline-flex items-center gap-1"><IconStarsOrbit size={13} /> {t("paymentStatusPaid")}</span>
                      : t("paymentStatusPaid")
                    : t("paymentStatusCod")}
                </span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sagetint text-pine"><IconTruck size={14} /></span><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-ink/70">{t("deliveryFee")}</p><p className="truncate text-[13px] font-bold text-ink">{placedOrder.deliveryAddress}</p><p className="text-[12px] font-medium text-moss">{placedOrder.deliveryTime}</p></div></div>
              <div className="border-t border-ink/6 pt-3"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/65">{t("itemsList")} ({placedOrder.count})</p><div className="mt-2 space-y-2 max-h-36 overflow-y-auto pr-1">{placedOrder.items.map((it) => (<div key={it.id} className="flex items-center justify-between text-[13px]"><span className="truncate font-semibold text-ink/80">{it.name} <span className="text-ink/65">× {it.qty}</span></span><span className="font-bold text-ink">{formatPrice(it.price * it.qty, lang)}</span></div>))}</div></div>
              <div className="border-t border-ink/18 pt-3 space-y-1.5">
                <div className="flex justify-between text-[12px] font-medium text-ink/60"><span>{t("subtotal")}</span><span>{formatPrice(placedOrder.subtotal, lang)}</span></div>
                {placedOrder.discount > 0 && <div className="flex justify-between text-[12px] font-bold text-amberdeep"><span>{t("discount")} ({placedOrder.promoCode})</span><span>-{formatPrice(placedOrder.discount, lang)}</span></div>}
                <div className="flex justify-between text-[12px] font-medium text-ink/60"><span>{t("deliveryFee")}</span><span>{placedOrder.deliveryFee === 0 ? t("deliveryFree") : formatPrice(placedOrder.deliveryFee, lang)}</span></div>
                <div className="flex items-baseline justify-between border-t border-ink/18 pt-2"><span className="text-[14px] font-bold text-ink">{t("cartTotal")}</span><span className="font-display text-[18px] font-bold text-ink">{formatPrice(placedOrder.total, lang)}</span></div>
              </div>
            </div>
          </div>

          {placedOrder.paymentStatus !== "paid" && placedOrder.paymentStatus !== "cod" && (
            <div className="mt-3 rounded-[22px] border border-amber/30 bg-amber/8 p-4 text-left">
              <p className="text-[13px] font-bold text-ink">{t("payPendingTitle")}</p>
              <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-ink/60">{t("payPendingSub")}</p>
              <div className="mt-3 flex gap-2">
                {placedOrder.paymentMethod === "payme" && placedOrder.paymentUrl && (
                  <a
                    href={placedOrder.paymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => haptic("medium")}
                    className="press flex h-11 flex-1 items-center justify-center rounded-[14px] bg-[#33C965] text-[13px] font-bold text-white"
                  >
                    {t("payWithPayme")}
                  </a>
                )}
                {placedOrder.paymentMethod === "click" && placedOrder.paymentUrl && (
                  <a
                    href={placedOrder.paymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => haptic("medium")}
                    className="press flex h-11 flex-1 items-center justify-center rounded-[14px] bg-[#25B4F8] text-[13px] font-bold text-white"
                  >
                    {t("payWithClick")}
                  </a>
                )}
                {placedOrder.paymentMethod === "stars" && (
                  <button
                    onClick={payWithStars}
                    className="press flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-[#3E99FA] text-[13px] font-bold text-white"
                  >
                    <IconStar size={13} /> {t("payWithStars")}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mt-5 space-y-2.5">
            <button onClick={handleSendReceiptToBot} disabled={receiptSent} className={`press flex h-13 w-full items-center justify-center gap-2.5 rounded-[20px] text-[14px] font-bold shadow-lift transition-colors ${receiptSent ? "bg-moss text-white" : "bg-amber text-white hover:bg-pine"}`}>
              {receiptSent ? <IconCheck size={16} /> : <IconSend size={16} />}{receiptSent ? t("receiptSentToBot") : t("sendReceiptToBot")}
            </button>
            {receiptSent && <p className="text-center text-[11px] font-semibold text-moss">{t("orderSentToBot")}</p>}
            <button onClick={onClose} className="press flex h-12 w-full items-center justify-center rounded-[20px] bg-paper2 text-[13px] font-bold text-ink/75">{t("done")}</button>
          </div>
        </div>
      )}

      {step === "cart" && (
        <div key="checkout-cart" className="checkout-step">
          {cartEntries.length === 0 ? (
            <div className="pt-6 text-center">
              <div className="animate-floaty-soft mx-auto flex h-[84px] w-[84px] items-center justify-center rounded-[26px] bg-sagetint text-moss shadow-soft"><IconBag size={32} /></div>
              <h4 className="mt-5 font-display text-[18px] font-bold tracking-tight text-ink">{t("cartEmpty")}</h4>
              <p className="mx-auto mt-2 max-w-[260px] text-[13px] font-medium text-ink/70">{t("cartEmptySub")}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {products.slice(0, 3).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { haptic("light"); onInc(p.id); }}
                    className="press flex items-center gap-1.5 rounded-full border border-ink/18 bg-card px-3 py-1.5 text-[11px] font-bold text-ink/70"
                  >
                    <span className="h-4 w-4 overflow-hidden rounded-full">
                      <img src={p.img} alt="" className="h-full w-full object-cover" />
                    </span>
                    + {p.name}
                  </button>
                ))}
              </div>
              <button onClick={goFeatured} className="press mt-6 w-full rounded-[20px] bg-amber py-4 text-[14px] font-bold text-white">{t("cartGoFeatured")}</button>
            </div>
          ) : (
            <div className="space-y-3.5 pt-1">
              <div className="rounded-[20px] border border-moss/18 bg-sagetint/60 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-start gap-1.5 text-[12px] font-bold leading-snug text-pine"><IconSparkle size={13} className="mt-0.5 shrink-0 text-amber" />{freeShippingRemaining === 0 ? t("freeDeliveryUnlocked") : `${t("freeDeliveryProgress")} ${formatPrice(freeShippingRemaining, lang)}`}</span>
                  <span className="shrink-0 font-display text-[11px] font-bold text-moss">{freeShippingProgress}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card"><div className="h-full rounded-full bg-moss transition-all duration-500" style={{ width: `${freeShippingProgress}%` }} /></div>
                <p className="mt-1.5 text-[10px] font-semibold leading-snug text-pine/65">{t("coverageAllUzb")}</p>
              </div>

              {/* Cart nudge: big-cart 3% discount (500k / max 10k) */}
              {cartNudgeActive && subtotal < nudgeThreshold && (
                <div className="flex items-center gap-2.5 rounded-[20px] border border-amber/30 bg-amber/[0.08] px-3.5 py-3">
                  <span className="shrink-0 text-amberdeep"><IconGift size={18} /></span>
                  <p className="min-w-0 text-[12px] font-bold leading-snug text-amberdeep">
                    {t("cartNudgeRemaining").replace("{sum}", formatPrice(nudgeRemaining, lang))}
                  </p>
                </div>
              )}

              <div className="space-y-2.5">
                {cartEntries.map(([id, qty]) => {
                  const p = productById.get(id); if (!p) return null;
                  const ws = wholesalePrice(p.price, qty);
                  const lineTotal = ws.unit * qty;
                  // Next tier hint: how many more units to reach the next discount level
                  const nextTier = WHOLESALE_TIERS.find((tier) => qty < tier.minQty);
                  return (
                    <SwipeToDelete
                      key={id}
                      onDelete={() => {
                        // remove all qty of this product
                        for (let i = 0; i < qty; i++) onDec(id);
                      }}
                    >
                      <div className="border border-ink/8 bg-card p-3.5 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className={`h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[17px] ${p.cat === "home" ? "bg-sagetint" : "bg-graphite2"}`}><img src={p.img} alt={p.name} className="h-full w-full object-cover" /></div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-display text-[14px] font-bold text-ink">{p.name}</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-ink/65">{formatPrice(ws.unit, lang)} · {p.volume}</p>
                            {ws.discount > 0 && <span className="mt-1 inline-flex rounded-full bg-amber/15 px-1.5 py-0.5 text-[9px] font-extrabold text-amberdeep">ОПТ −{ws.discount}%</span>}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-display text-[14px] font-bold text-ink">{formatPrice(lineTotal, lang)}</p>
                            {ws.discount > 0 && <p className="text-[10px] font-semibold text-ink/55 line-through">{formatPrice(p.price * qty, lang)}</p>}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-ink/8 pt-2.5">
                          <div className="flex items-center gap-2">
                            <button onClick={() => { haptic("light"); onDec(id); }} aria-label="Уменьшить количество / Kamaytirish" className="press flex h-11 w-11 items-center justify-center rounded-[14px] border border-ink/14 bg-paper2 text-ink/70"><IconMinus size={14} /></button>
                            <span className="w-6 text-center font-display text-[14px] font-bold text-ink">{qty}</span>
                            <button onClick={() => { haptic("light"); onInc(id); }} aria-label="Увеличить количество / Oshirish" className="press flex h-11 w-11 items-center justify-center rounded-[14px] bg-amber text-white shadow-sm"><IconPlus size={14} /></button>
                          </div>
                          <button
                            onClick={() => { haptic("medium"); for (let i = 0; i < qty; i++) onDec(id); }}
                            aria-label={lang === "uz" ? "Mahsulotni o'chirish" : lang === "ru" ? "Удалить товар" : "Remove item"}
                            className="press flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#B3402E]/18 bg-[#B3402E]/[0.07] text-[#B3402E]"
                          >
                            <IconClose size={14} />
                          </button>
                        </div>
                        {/* Next wholesale tier tracker */}
                        {nextTier && (
                          <button
                            onClick={() => { haptic("light"); for (let i = qty; i < nextTier.minQty; i++) onInc(id); }}
                            className="mt-2.5 flex w-full items-center justify-between rounded-[12px] bg-amber/[0.08] px-3 py-2 text-left"
                          >
                            <span className="text-[11px] font-bold text-amberdeep">
                              +{nextTier.minQty - qty} {t("cartUnitsShort")} {t("cartAddMore")} −{nextTier.discountPercent}% {t("cartToDiscount")}
                            </span>
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber text-white"><IconPlus size={12} /></span>
                          </button>
                        )}
                      </div>
                    </SwipeToDelete>
                  );
                })}
              </div>

              {cartUpsells.length > 0 && (
                <section className="rounded-[22px] border border-moss/20 bg-gradient-to-br from-sagetint/45 to-card p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-pine"><IconSparkle size={13} /> {lang === "uz" ? "To'plamni yakunlang" : lang === "ru" ? "Дополните набор" : "Complete the routine"}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-ink/60">{lang === "uz" ? "Savatingizga mos mahsulotlar" : lang === "ru" ? "Подходит к вашей корзине" : "Matched to your cart"}</p>
                    </div>
                    <span className="rounded-full bg-moss/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-moss">SMART</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {cartUpsells.map((product) => (
                      <article key={product.id} className="motion-surface min-w-0 rounded-[16px] border border-ink/8 bg-card/80 p-2.5 shadow-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <img src={product.img} alt={product.name} className="h-11 w-11 shrink-0 rounded-[11px] object-cover" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-black text-ink">{product.name}</p>
                            <p className="mt-0.5 text-[10px] font-bold text-moss">{formatPrice(product.price, lang)}</p>
                          </div>
                        </div>
                        <button onClick={() => { haptic("success"); onInc(product.id); }} className="press mt-2 flex h-10 w-full items-center justify-center gap-1 rounded-[12px] bg-amber px-2 text-[10px] font-black text-white"><IconPlus size={11} /> {lang === "uz" ? "Qo'shish" : lang === "ru" ? "Добавить" : "Add"}</button>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <div className="rounded-[22px] border border-ink/18 bg-card p-3.5">
                <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65"><IconTag size={12} className="text-amber" />{t("promoTitleCheckout")}</p>
                {appliedPromo ? (
                  <div className="mt-2.5 flex items-center justify-between rounded-[16px] bg-sagetint px-3.5 py-2.5"><div className="flex items-center gap-2"><IconCheck size={15} className="text-moss" /><div><p className="font-display text-[13px] font-bold text-pine">{appliedPromo}</p><p className="text-[11px] font-semibold text-pine/70">{promoCodes[appliedPromo]?.title[lang]}</p></div></div><button onClick={() => { haptic("light"); setAppliedPromo(null); }} className="text-[12px] font-bold text-[#B3402E]">{t("promoRemove")}</button></div>
                ) : (
                  <div className="mt-2 flex gap-2"><input value={promoInput} onChange={(e: ChangeEvent<HTMLInputElement>) => { setPromoInput(e.target.value); setPromoError(null); }} placeholder={t("promoPlaceholder")} className="min-w-0 flex-1 rounded-[16px] border border-ink/15 bg-paper px-3.5 py-2.5 text-[13px] font-semibold text-ink placeholder:text-ink/75 outline-none uppercase" /><button onClick={handleApplyPromo} className="press shrink-0 rounded-[16px] bg-amber px-4 py-2.5 text-[13px] font-bold text-white">{t("promoApply")}</button></div>
                )}
                {promoError && <p className="mt-1.5 text-[11px] font-semibold text-[#B3402E]">{promoError}</p>}
              </div>

              {/* B2B partner code — server-validated; grants a personal wholesale discount */}
              <div className="rounded-[22px] border border-ink/18 bg-card p-3.5">
                <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65"><IconKey size={12} className="text-amber" />{lang === "uz" ? "B2B hamkor kodi" : lang === "ru" ? "B2B-код партнёра" : "B2B partner code"}</p>
                {b2bApproved ? (
                  <div className="mt-2.5 flex items-center justify-between rounded-[16px] bg-sagetint px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <IconCheck size={15} className="text-moss" />
                      <div>
                        <p className="font-mono text-[13px] font-bold text-pine">{b2bApproved.code}</p>
                        <p className="text-[11px] font-semibold text-pine/70">
                          {lang === "uz" ? "Shaxsiy chegirma" : lang === "ru" ? "Персональная скидка" : "Personal discount"} −{b2bApproved.percent}%
                        </p>
                      </div>
                    </div>
                    <button onClick={() => { haptic("light"); setB2bApproved(null); }} className="text-[12px] font-bold text-[#B3402E]">{t("promoRemove")}</button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={b2bInput}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => { setB2bInput(e.target.value); setB2bError(null); }}
                      placeholder={lang === "uz" ? "B2B-XXXXXX" : lang === "ru" ? "Код партнёра B2B-XXXXXX" : "Partner code B2B-XXXXXX"}
                      className="min-w-0 flex-1 rounded-[16px] border border-ink/15 bg-paper px-3.5 py-2.5 text-[13px] font-semibold uppercase text-ink outline-none placeholder:normal-case placeholder:text-ink/75"
                    />
                    <button onClick={() => void handleApplyB2b()} className="press shrink-0 rounded-[16px] bg-amber px-4 py-2.5 text-[13px] font-bold text-white">{t("promoApply")}</button>
                  </div>
                )}
                {b2bError && <p className="mt-1.5 text-[11px] font-semibold text-[#B3402E]">{b2bError}</p>}
              </div>

              {/* Gift certificate — server-validated, single-use */}
              <div className="rounded-[22px] border border-amberdeep/25 bg-gradient-to-br from-amber/[0.07] to-transparent p-3.5">
                <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65"><IconGift size={13} /> {lang === "uz" ? "Sovg'a sertifikati" : lang === "ru" ? "Подарочный сертификат" : "Gift certificate"}</p>
                {certApproved ? (
                  <div className="mt-2.5 flex items-center justify-between rounded-[16px] bg-amber/15 px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <IconCheck size={15} className="text-amberdeep" />
                      <div>
                        <p className="font-mono text-[13px] font-bold text-amberdeep">{certApproved.code}</p>
                        <p className="text-[11px] font-semibold text-amberdeep/80">-{formatPrice(certAppliedEstimate, lang)}</p>
                      </div>
                    </div>
                    <button onClick={() => { haptic("light"); setCertApproved(null); }} className="text-[12px] font-bold text-[#B3402E]">{t("promoRemove")}</button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={certInput}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => { setCertInput(e.target.value); setCertError(null); }}
                      placeholder={lang === "uz" ? "GIFT-XXXXXX" : lang === "ru" ? "Код сертификата GIFT-XXXXXX" : "Certificate code GIFT-XXXXXX"}
                      className="min-w-0 flex-1 rounded-[16px] border border-ink/15 bg-paper px-3.5 py-2.5 text-[13px] font-semibold uppercase text-ink outline-none placeholder:normal-case placeholder:text-ink/75"
                    />
                    <button onClick={() => void handleApplyCert()} className="press shrink-0 rounded-[16px] bg-amberdeep px-4 py-2.5 text-[13px] font-bold text-white">{t("promoApply")}</button>
                  </div>
                )}
                {certError && <p className="mt-1.5 text-[11px] font-semibold text-[#B3402E]">{certError}</p>}
              </div>

              {/* Stars shop coupon — auto-applied */}
              {starsCouponObj && !appliedPromo && (
                <div className="flex items-center justify-between rounded-[18px] border border-amber/25 bg-amber/[0.08] px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-amberdeep"><IconStarsOrbit size={23} /></span>
                    <div>
                      <p className="font-display text-[13px] font-bold text-amberdeep">{starsCouponObj.title[lang]}</p>
                      <p className="text-[11px] font-semibold text-ink/70">
                        {lang === "uz" ? "Yulduzlar do'konidan — avtomatik qo'llandi" : lang === "ru" ? "Из магазина звёзд — применён автоматически" : "From the stars shop — applied automatically"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { haptic("light"); onClearStarsCoupon?.(); }}
                    className="press rounded-full bg-paper px-2.5 py-1 text-[11px] font-bold text-[#B3402E]"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="rounded-[22px] border border-ink/18 bg-card p-4 space-y-2">
                {wholesaleSavings > 0 && (
                  <div className="flex justify-between text-[12px] font-medium text-ink/70">
                    <span>{t("cartRetailWas")}</span>
                    <span className="line-through">{formatPrice(retailSubtotal, lang)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[13px] font-medium text-ink/60"><span>{t("subtotal")}</span><span>{formatPrice(subtotal, lang)}</span></div>
                {wholesaleSavings > 0 && (
                  <div className="flex justify-between rounded-[12px] bg-moss/8 px-2.5 py-1.5 text-[13px] font-bold text-moss">
                    <span className="flex items-center gap-1"><IconFactory size={14} /> {t("cartWholesaleSavings")}</span>
                    <span>−{formatPrice(wholesaleSavings, lang)}</span>
                  </div>
                )}
                {nudgeDiscount > 0 && <div className="flex justify-between rounded-[12px] bg-amber/[0.10] px-2.5 py-1.5 text-[13px] font-bold text-amberdeep"><span>{t("cartNudgeApplied")}</span><span>-{formatPrice(nudgeDiscount, lang)}</span></div>}
                {b2bDiscount > 0 && <div className="flex justify-between rounded-[12px] bg-sage/10 px-2.5 py-1.5 text-[13px] font-bold text-pine"><span className="flex items-center gap-1"><IconKey size={13} /> B2B ({b2bApproved?.code})</span><span>-{formatPrice(b2bDiscount, lang)}</span></div>}
                {discount > 0 && <div className="flex justify-between text-[13px] font-bold text-amberdeep"><span>{t("discount")} ({appliedPromo})</span><span>-{formatPrice(discount, lang)}</span></div>}
                <div className="flex justify-between text-[13px] font-medium text-ink/60"><span>{t("deliveryFee")}</span><span className="font-semibold text-moss">{subtotal >= getFreeShippingThreshold() ? t("deliveryFree") : `${t("fromPrice")} ${formatPrice(getDeliveryConfig().defaultTariff.courier, lang)}`}</span></div>
                <div className="flex items-baseline justify-between border-t border-ink/18 pt-3"><span className="font-display text-[14px] font-bold text-ink">{t("cartTotal")}</span><span className="font-display text-[20px] font-bold tracking-tight text-ink">{formatPrice(subtotal - totalDiscount, lang)}</span></div>
              </div>

              {/* One-click order — self-pickup at the factory with Telegram data */}
              <button
                onClick={() => {
                  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || recipientName;
                  const phone = (user?.phone_number && user.phone_number.replace(/\D/g, "").length >= 12) ? user.phone_number : recipientPhone;
                  if (!name.trim() || phone.replace(/\D/g, "").length < 12) {
                    // Not enough data to place instantly → send to delivery step
                    haptic("light");
                    setStep("delivery");
                    return;
                  }
                  setRecipientName(name);
                  setRecipientPhone(phone);
                  void handlePlaceOrder("pickup");
                }}
                className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-moss/22 bg-moss/[0.07] text-[13px] font-bold text-moss"
              >
                <IconSparkle size={15} /> {lang === "ru" ? "Быстрый самовывоз в 1 клик" : lang === "en" ? "1-click factory pickup" : "Zavoddan 1 klikda olib ketish"}
              </button>
            </div>
          )}
        </div>
      )}

      {step === "delivery" && (
        <div key="checkout-delivery" className="checkout-step space-y-4 pt-1">
          <button onClick={() => setStep("cart")} className="flex items-center gap-1.5 text-[12px] font-bold text-ink/70"><IconArrow size={13} className="rotate-180" />{t("backStep")}: {t("stepCart")}</button>

          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65">{t("deliveryMethodLabel")}</p>
            <div className="mt-2.5 space-y-2">
              <button onClick={() => { haptic("light"); setDeliveryMethod("courier_uzb"); }} className={`motion-surface press flex w-full items-start gap-3 rounded-[20px] border p-3.5 text-left ${deliveryMethod === "courier_uzb" ? "border-moss/55 bg-card shadow-sm ring-1 ring-moss/25" : "border-ink/18 bg-card/60 opacity-85"}`}>
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${deliveryMethod === "courier_uzb" ? "bg-moss text-white" : "bg-paper2 text-ink/60"}`}><IconTruck size={16} /></span>
                <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="min-w-0 font-display text-[14px] font-bold leading-snug text-ink">{t("methodCourierUzb")}</p><span className="shrink-0 font-display text-[12px] font-bold text-moss">{subtotal >= getFreeShippingThreshold() ? t("deliveryFree") : formatPrice(tariff.courier, lang)}</span></div><p className="mt-1 text-[12px] font-medium leading-relaxed text-ink/70">{t("methodCourierUzbDesc")} · {etaLabel} {t("etaDays")}</p></div>
              </button>
              <button onClick={() => { haptic("light"); setDeliveryMethod("bts_express"); }} className={`motion-surface press flex w-full items-start gap-3 rounded-[20px] border p-3.5 text-left ${deliveryMethod === "bts_express" ? "border-moss/55 bg-card shadow-sm ring-1 ring-moss/25" : "border-ink/18 bg-card/60 opacity-85"}`}>
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${deliveryMethod === "bts_express" ? "bg-moss text-white" : "bg-paper2 text-ink/60"}`}><IconSend size={15} /></span>
                <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="min-w-0 font-display text-[14px] font-bold leading-snug text-ink">{t("methodBtsExpress")}</p><span className="shrink-0 font-display text-[12px] font-bold text-moss">{subtotal >= getFreeShippingThreshold() ? t("deliveryFree") : formatPrice(tariff.bts, lang)}</span></div><p className="mt-1 text-[12px] font-medium leading-relaxed text-ink/70">{t("methodBtsExpressDesc")} · {etaLabel} {t("etaDays")}</p></div>
              </button>
              <button onClick={() => { haptic("light"); setDeliveryMethod("pickup"); }} className={`motion-surface press flex w-full items-start gap-3 rounded-[20px] border p-3.5 text-left ${deliveryMethod === "pickup" ? "border-moss/55 bg-card shadow-sm ring-1 ring-moss/25" : "border-ink/18 bg-card/60 opacity-85"}`}>
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${deliveryMethod === "pickup" ? "bg-moss text-white" : "bg-paper2 text-ink/60"}`}><IconStore size={16} /></span>
                <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="min-w-0 font-display text-[14px] font-bold leading-snug text-ink">{t("methodPickup")}</p><span className="shrink-0 font-display text-[12px] font-bold text-moss">{t("deliveryFree")}</span></div><p className="mt-1 text-[12px] font-medium leading-relaxed text-ink/70">{t("methodPickupDesc")}</p></div>
              </button>
            </div>
          </div>

          {/* Saved addresses quick-pick */}
          {addresses.length > 0 && deliveryMethod !== "pickup" && (
            <div className="rounded-[20px] border border-ink/18 bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink/65">{t("addressSelect")}</p>
                <button onClick={() => { haptic("light"); onOpenAddresses?.(); }} className="text-[11px] font-bold text-moss">{t("addressesTitle")}</button>
              </div>
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                {addresses.map((a) => {
                  const reg = UZBEKISTAN_REGIONS.find((r) => r.id === a.regionId);
                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        haptic("medium");
                        setSelectedRegionId(a.regionId);
                        setSelectedDistrict(a.district);
                        setStreetAddress(a.street);
                        setApartment(a.apartment || "");
                        setRecipientPhone(a.phone);
                      }}
                      className="press w-[180px] shrink-0 rounded-[16px] border border-ink/15 bg-paper p-3 text-left"
                    >
                      <p className="text-[12px] font-bold text-ink">
                        <span className="inline-flex items-center gap-1">{a.label === "home" ? <IconHome size={14} /> : a.label === "work" ? <IconBriefcase size={14} /> : <IconPin size={14} />}{a.isDefault ? t("addressDefault") : a.label}</span>
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] font-medium text-ink/75">
                        {reg?.[lang]}, {a.district}, {a.street}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-[24px] border border-ink/18 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between"><p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65">{t("recipientDetails")}</p>{(nameFromTg || phoneFromTg) && <span className="flex items-center gap-1 rounded-full bg-[#229ED9]/12 px-2.5 py-1 text-[10px] font-bold text-[#1c88bd]"><IconSend size={10} />{t("autofilledFromTg")}</span>}</div>
            <div>
              <label className="text-[11px] font-bold text-ink/70">{t("fullName")}</label>
              <div className="relative mt-1"><input value={recipientName} onChange={(e: ChangeEvent<HTMLInputElement>) => setRecipientName(e.target.value)} placeholder={t("fullName")} className={`w-full rounded-[16px] border bg-paper px-3.5 py-3 text-[14px] font-semibold text-ink outline-none ${errors.name ? "border-[#B3402E]" : "border-ink/15 focus:border-moss"}`} />{nameFromTg && !errors.name && <IconCheck size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-moss" />}</div>
              {errors.name && <p className="mt-1 text-[11px] font-bold text-[#B3402E]">{t("errName")}</p>}
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink/70">{t("phoneNumber")}</label>
              <div className="mt-1 flex gap-2"><div className="relative min-w-0 flex-1"><input value={recipientPhone} onChange={(e: ChangeEvent<HTMLInputElement>) => setRecipientPhone(e.target.value)} placeholder={t("phoneNumber")} inputMode="tel" className={`w-full rounded-[16px] border bg-paper px-3.5 py-3 text-[14px] font-semibold text-ink outline-none ${errors.phone ? "border-[#B3402E]" : "border-ink/15 focus:border-moss"}`} />{phoneFromTg && !errors.phone && <IconCheck size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-moss" />}</div>{!phoneFromTg && <button type="button" onClick={() => requestTelegramContact((phone) => { if (phone) { setRecipientPhone(phone); haptic("success"); } })} className="press flex shrink-0 items-center gap-1.5 rounded-[16px] bg-[#229ED9]/12 px-3 text-[11px] font-bold text-[#1c88bd]"><IconSend size={14} /></button>}</div>
              {errors.phone && <p className="mt-1 text-[11px] font-bold text-[#B3402E]">{t("errPhone")}</p>}
            </div>

            {deliveryMethod !== "pickup" && (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <div><label className="text-[11px] font-bold text-ink/70">{t("regionSelectLabel")}</label><div className="relative mt-1"><select value={selectedRegionId} onChange={(e) => handleRegionChange(e.target.value)} className="w-full appearance-none rounded-[16px] border border-ink/15 bg-paper py-3 pl-3 pr-8 text-[13px] font-semibold text-ink outline-none"><option value="">{t("regionSelectLabel")}</option>{UZBEKISTAN_REGIONS.map((r) => (<option key={r.id} value={r.id}>{r[lang]}</option>))}</select><IconChevron size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink/65 rotate-90" /></div></div>
                  <div><label className="text-[11px] font-bold text-ink/70">{t("selectDistrict")}</label><div className="relative mt-1"><select value={selectedDistrict} onChange={(e) => { haptic("light"); setSelectedDistrict(e.target.value); }} className="w-full appearance-none rounded-[16px] border border-ink/15 bg-paper py-3 pl-3 pr-8 text-[13px] font-semibold text-ink outline-none"><option value="">{t("selectDistrict")}</option>{currentRegion.districts.map((d) => (<option key={d} value={d}>{d}</option>))}</select><IconChevron size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink/65 rotate-90" /></div></div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-ink/70">{t("streetAddress")}</label>
                  <input value={streetAddress} onChange={(e: ChangeEvent<HTMLInputElement>) => setStreetAddress(e.target.value)} placeholder={t("streetAddress")} className={`mt-1 w-full rounded-[16px] border bg-paper px-3.5 py-3 text-[14px] font-semibold text-ink outline-none ${errors.address ? "border-[#B3402E]" : "border-ink/15 focus:border-moss"}`} />
                  {errors.address && <p className="mt-1 text-[11px] font-bold text-[#B3402E]">{t("errAddress")}</p>}
                </div>
                <div>
                  <label className="text-[11px] font-bold text-ink/70">{t("apartmentOffice")}</label>
                  <input value={apartment} onChange={(e: ChangeEvent<HTMLInputElement>) => setApartment(e.target.value)} placeholder={t("apartmentOffice")} className="mt-1 w-full rounded-[16px] border border-ink/15 bg-paper px-3.5 py-3 text-[14px] font-semibold text-ink outline-none" />
                </div>
                <div><label className="text-[11px] font-bold text-ink/70">{t("deliveryTimeSlot")}</label><div className="relative mt-1"><select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} className="w-full appearance-none rounded-[16px] border border-ink/15 bg-paper px-3.5 py-3 text-[13px] font-semibold text-ink outline-none"><option value="">{t("deliveryTimeSlot")}</option>{TIME_SLOTS.map((s) => (<option key={s.id} value={s.id}>{s.label[lang]}</option>))}</select><IconChevron size={14} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rotate-90 text-ink/65" /></div></div>
                <div>
                  <label className="text-[11px] font-bold text-ink/70">{t("courierNotes")}</label>
                  <input value={courierNote} onChange={(e: ChangeEvent<HTMLInputElement>) => setCourierNote(e.target.value)} placeholder={t("courierNotes")} className="mt-1 w-full rounded-[16px] border border-ink/15 bg-paper px-3.5 py-3 text-[13px] font-semibold text-ink outline-none" />
                </div>
              </>
            )}
          </div>

        </div>
      )}

      {step === "payment" && (
        <div key="checkout-payment" className="checkout-step space-y-4 pt-1">
          <button
            onClick={() => { setOrderError(null); setRequiresTelegram(false); showConfirm ? setShowConfirm(false) : setStep("delivery"); }}
            className="flex items-center gap-1.5 text-[12px] font-bold text-ink/70"
          >
            <IconArrow size={13} className="rotate-180" />
            {t("backStep")}: {showConfirm ? t("stepPayment") : t("stepDelivery")}
          </button>

          {!showConfirm && (
            <>
              <div>
                <div className="flex items-center justify-between"><p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65">{t("selectPayment")}</p><span className="flex items-center gap-1 text-[10px] font-bold text-moss"><IconLock size={10} />SSL 256-bit</span></div>
                <div className="mt-2.5 space-y-2">
                  {checkoutPaymentMethods.map((pm) => (
                    <button key={pm} onClick={() => { haptic("light"); setPaymentMethod(pm); }} className={`motion-surface press flex w-full items-center gap-3.5 rounded-[20px] border p-3 text-left ${paymentMethod === pm ? "border-ink bg-card shadow-sm ring-1 ring-ink" : "border-ink/18 bg-card/60 opacity-85"}`}>
                      <PaymentBrandLogo method={pm} />
                      <div className="min-w-0 flex-1"><p className="font-display text-[14px] font-bold text-ink">{paymentTitles[pm]}</p><p className="text-[12px] font-medium text-ink/70">{paymentDescriptions[pm]}</p></div>
                      {paymentMethod === pm && <IconCheck size={18} className="shrink-0 text-moss" />}
                    </button>
                  ))}
                </div>
                {!paymentReadinessLoaded ? (
                  <div className="mt-2.5 flex items-center gap-2 rounded-[14px] bg-paper2/60 px-3 py-2.5 text-[11px] font-semibold text-ink/55">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-moss/30 border-t-moss" />
                    {lang === "uz" ? "To'lov usullari tekshirilmoqda" : lang === "ru" ? "Проверяем способы оплаты" : "Checking payment methods"}
                  </div>
                ) : unavailablePaymentNames.length > 0 ? (
                  <div className="mt-2.5 rounded-[14px] border border-amber/16 bg-amber/[0.06] px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-ink/60">
                    <span className="font-bold text-ink/75">{unavailablePaymentNames.join(", ")}</span>{" — "}
                    {lang === "uz" ? "vaqtincha mavjud emas" : lang === "ru" ? "временно недоступны" : "temporarily unavailable"}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2.5 rounded-[18px] bg-paper2/60 px-3.5 py-2.5 text-[12px] font-semibold text-ink/65"><IconLock size={14} className="shrink-0 text-moss" /><span>{t("securePaymentGuarantee")}</span></div>
            </>
          )}

          {!showConfirm ? (
            <>
              <div className="rounded-[24px] border border-ink/18 bg-card p-4 space-y-2.5">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65">{t("cartSummary")}</p>
                <div className="flex justify-between text-[13px] font-medium text-ink/60"><span>{t("subtotal")} ({totalItemsCount} {t("itemsWord")})</span><span>{formatPrice(subtotal, lang)}</span></div>
                {b2bDiscount > 0 && <div className="flex justify-between text-[13px] font-bold text-pine"><span className="flex items-center gap-1"><IconKey size={13} /> B2B ({b2bApproved?.code})</span><span>-{formatPrice(b2bDiscount, lang)}</span></div>}
                {discount > 0 && <div className="flex justify-between text-[13px] font-bold text-amberdeep"><span>{t("discount")} ({appliedPromo})</span><span>-{formatPrice(discount, lang)}</span></div>}
                {certAppliedEstimate > 0 && <div className="flex justify-between text-[13px] font-bold text-amberdeep"><span className="flex items-center gap-1"><IconGift size={13} /> {lang === "uz" ? "Sertifikat" : lang === "ru" ? "Сертификат" : "Certificate"} ({certApproved?.code})</span><span>-{formatPrice(certAppliedEstimate, lang)}</span></div>}
                <div className="flex justify-between text-[13px] font-medium text-ink/60"><span>{t("deliveryFee")}</span><span className="font-semibold text-moss">{deliveryFee === 0 ? t("deliveryFree") : formatPrice(deliveryFee, lang)}</span></div>
                <div className="flex items-baseline justify-between border-t border-ink/18 pt-3"><span className="font-display text-[15px] font-bold text-ink">{t("cartTotal")}</span><span className="font-display text-[22px] font-bold text-ink">{formatPrice(grandTotal, lang)}</span></div>
              </div>

              <button onClick={() => { if (!validateDelivery()) { haptic("light"); return; } haptic("medium"); setOrderError(null); setRequiresTelegram(false); setShowConfirm(true); }} disabled={isSubmitting} className="btn-shine animate-glowpulse press flex h-14 w-full items-center justify-center gap-2.5 rounded-[22px] bg-gradient-to-r from-[#10a35f] via-[#10a35f] to-[#10a35f] bg-[length:200%_200%] text-[15px] font-bold text-white shadow-lift disabled:opacity-50 animate-gradient-shift">
                <span className="flex items-center gap-2"><IconCheck size={18} />
                {t("stepConfirmation")} · {formatPrice(grandTotal, lang)}</span>
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-[18px] border border-ink/12 bg-card p-3 shadow-sm">
                <PaymentBrandLogo method={paymentMethod} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[13px] font-bold text-ink">{paymentTitles[paymentMethod]}</p>
                  <p className="truncate text-[11px] font-medium text-ink/60">{paymentDescriptions[paymentMethod]}</p>
                </div>
                <button
                  onClick={() => { haptic("light"); setOrderError(null); setRequiresTelegram(false); setShowConfirm(false); }}
                  className="press shrink-0 rounded-full bg-paper2 px-3 py-2 text-[11px] font-bold text-moss"
                >
                  {lang === "uz" ? "O'zgartirish" : lang === "ru" ? "Изменить" : "Change"}
                </button>
              </div>

              {/* Confirmation review: verify before placing order */}
              <div className="animate-pop space-y-3 rounded-[22px] border border-moss/28 bg-sagetint/45 p-4">
                <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-pine">
                  <IconCheck size={12} />
                  {t("stepConfirmation")}
                </p>

                {/* Customer info */}
                <div className="space-y-2.5 rounded-[16px] bg-card p-3.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-[12px]"><span className="text-ink/65">{t("fullName")}</span><span className="max-w-[190px] text-right font-semibold text-ink">{recipientName || t("errName")}</span></div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-[12px]"><span className="text-ink/65">{t("phoneNumber")}</span><span className="text-right font-semibold text-ink">{recipientPhone}</span></div>
                  {deliveryMethod !== "pickup" && (
                    <div className="border-y border-ink/8 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink/50">{t("streetAddress")}</p>
                      <p className="mt-1 break-words text-[12px] font-semibold leading-relaxed text-ink">{regionName}, {selectedDistrict}</p>
                      <p className="break-words text-[12px] font-medium leading-relaxed text-ink/75">{[streetAddress, apartment].filter(Boolean).join(", ")}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-start gap-3 text-[12px]"><span className="text-ink/65">{t("deliveryMethodLabel")}</span><span className="text-right font-semibold leading-snug text-ink">{deliveryMethod === "pickup" ? t("methodPickup") : deliveryMethod === "bts_express" ? t("methodBtsExpress") : t("methodCourierUzb")}</span></div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-[12px]"><span className="text-ink/65">{t("deliveryFee")}</span><span className="text-right font-semibold text-moss">{deliveryFee === 0 ? t("deliveryFree") : formatPrice(deliveryFee, lang)}</span></div>
                  {b2bDiscount > 0 && <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-[12px]"><span className="flex items-center gap-1 text-ink/65"><IconKey size={12} /> B2B ({b2bApproved?.code})</span><span className="text-right font-semibold text-pine">-{formatPrice(b2bDiscount, lang)}</span></div>}
                  {appliedPromo && <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-[12px]"><span className="text-ink/65">{t("discount")}</span><span className="text-right font-semibold text-amberdeep">-{formatPrice(discount, lang)} ({appliedPromo})</span></div>}
                  {certAppliedEstimate > 0 && <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-[12px]"><span className="flex items-center gap-1 text-ink/65"><IconGift size={12} /> {lang === "uz" ? "Sertifikat" : lang === "ru" ? "Сертификат" : "Certificate"}</span><span className="text-right font-semibold text-amberdeep">-{formatPrice(certAppliedEstimate, lang)}</span></div>}
                  <div className="flex items-baseline justify-between border-t border-ink/14 pt-2.5"><span className="text-[13px] font-bold text-ink">{t("cartTotal")}</span><span className="font-display text-[20px] font-bold text-ink">{formatPrice(grandTotal, lang)}</span></div>
                </div>

                {/* Items summary */}
                <div className="rounded-[16px] bg-card p-3">
                  <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-ink/65">{t("itemsList")} ({totalItemsCount})</p>
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                    {cartEntries.map(([id, qty]) => {
                      const p = productById.get(id);
                      if (!p) return null;
                      return (
                        <div key={id} className="flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-2 text-ink/80"><span className="text-[12px]">{p.name}</span><span className="text-ink/65">×{qty}</span></span>
                          <span className="font-semibold text-ink">{formatPrice(p.price * qty, lang)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {orderError && (
                <div className="rounded-[16px] border border-[#B3402E]/25 bg-[#B3402E]/8 p-3.5 text-center">
                  <p className="text-[12px] font-semibold leading-relaxed text-[#B3402E]">{orderError}</p>
                  {requiresTelegram && (
                    <a
                      href={CONFIG.BOT_LINK}
                      target="_blank"
                      rel="noreferrer"
                      className="press mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[#229ED9] text-[13px] font-bold text-white"
                    >
                      <IconSend size={15} /> {lang === "uz" ? "Telegram'da ochish" : lang === "ru" ? "Открыть в Telegram" : "Open in Telegram"}
                    </a>
                  )}
                </div>
              )}
              {requiresTelegramPayment ? (
                <div className="rounded-[18px] border border-[#229ED9]/25 bg-[#229ED9]/[0.07] p-3">
                  <p className="text-center text-[11px] font-semibold leading-relaxed text-ink/65">
                    {lang === "uz" ? "Telegram Stars orqali to'lov faqat Telegram ichida mavjud" : lang === "ru" ? "Оплата Telegram Stars доступна только внутри Telegram" : "Telegram Stars payment is available only inside Telegram"}
                  </p>
                  <a href={CONFIG.BOT_LINK} target="_blank" rel="noreferrer" className="press mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-[15px] bg-[#229ED9] text-[13px] font-bold text-white shadow-sm">
                    <IconSend size={16} /> {lang === "uz" ? "Telegram'da davom etish" : lang === "ru" ? "Продолжить в Telegram" : "Continue in Telegram"}
                  </a>
                </div>
              ) : browserCheckoutReady ? (
                <button onClick={() => void handlePlaceOrder()} disabled={isSubmitting} className="press flex h-14 w-full items-center justify-center gap-2.5 rounded-[22px] bg-moss text-[15px] font-bold text-white shadow-lift disabled:opacity-50">
                  <span className="flex items-center gap-2">{isSubmitting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />{t("processingOrder")}</> : <><IconCheck size={18} /><span>{t("placeOrder")} · {formatPrice(grandTotal, lang)}</span></>}</span>
                </button>
              ) : browserCheckoutChecking ? (
                <button disabled className="flex h-14 w-full items-center justify-center gap-2 rounded-[22px] bg-moss/55 text-[13px] font-bold text-white">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                  {lang === "uz" ? "Xavfsiz sessiya tayyorlanmoqda" : lang === "ru" ? "Подготавливаем безопасную сессию" : "Preparing secure checkout"}
                </button>
              ) : (
                <div className="rounded-[18px] border border-[#B3402E]/20 bg-[#B3402E]/[0.06] p-3">
                  <p className="text-center text-[11px] font-semibold leading-relaxed text-ink/65">
                    {lang === "uz" ? "Brauzer orqali buyurtma hozircha serverda mavjud emas" : lang === "ru" ? "Оформление через браузер пока недоступно на сервере" : "Browser checkout is not available on the server yet"}
                  </p>
                  <a href={CONFIG.BOT_LINK} target="_blank" rel="noreferrer" className="press mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-[15px] bg-[#229ED9] text-[13px] font-bold text-white shadow-sm">
                    <IconSend size={16} /> {lang === "uz" ? "Telegram'da davom etish" : lang === "ru" ? "Продолжить в Telegram" : "Continue in Telegram"}
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ---------------- ORDER DETAIL + COURIER TRACKING ---------------- */

export function OrderDetailModal({ order, onClose, onRepeatOrder, onOpenInvoice }: { order: Order | null; onClose: () => void; onRepeatOrder: (order: Order) => void; onOpenInvoice?: (order: Order) => void }) {
  const { t, lang } = useI18n();
  const site = useSiteSettings();
  const managerTg = site.supportTg ? tgHref(site.supportTg) : CONFIG.SUPPORT_TG_LINK;
  const [copied, setCopied] = useState(false);
  const [showTracking, setShowTracking] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  if (!order) return null;

  const copyOrderId = async () => {
    haptic("light");
    try { await navigator.clipboard.writeText(`#${order.id}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const steps = [
    { key: "new", label: t("timelineNew") },
    { key: "preparing", label: t("timelinePreparing") },
    { key: "shipped", label: t("timelineShipped") },
    { key: "delivered", label: t("timelineDelivered") },
  ] as const;
  const stepOrder = ["new", "preparing", "shipped", "delivered"] as const;
  const currentStepIdx = order.status === "canceled" ? -1 : stepOrder.indexOf(order.status);

  return (
    <>
      <Sheet open={!!order && !showTracking} onClose={onClose} title={`${t("orderWord")} #${order.id}`}>
        <div className="space-y-4 pt-1">
          <div className="rounded-[24px] border border-ink/18 bg-card p-4">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65">{t("orderTimeline")}</p>
            {order.status === "canceled" ? (
              <div className="mt-3 rounded-[16px] border border-[#B3402E]/20 bg-[#B3402E]/[0.07] px-3.5 py-3 text-[12px] font-bold text-[#B3402E]">
                {t("statusCanceled")}
              </div>
            ) : (
              <div className="mt-3.5 space-y-3">
                {steps.map((st, i) => {
                  const isPast = i <= currentStepIdx; const isCurrent = i === currentStepIdx;
                  return (
                    <div key={st.key} className="flex items-start gap-3">
                      <div className="relative flex flex-col items-center"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isPast ? "bg-moss text-white" : "border border-ink/15 bg-paper2 text-ink/75"}`}>{isPast ? <IconCheck size={13} strokeWidth={2.4} /> : i + 1}</span>{i < steps.length - 1 && <span className={`mt-1 h-6 w-[2px] rounded-full ${i < currentStepIdx ? "bg-moss" : "bg-amber/10"}`} />}</div>
                      <div className="pt-0.5"><p className={`text-[13px] font-bold ${isCurrent ? "text-ink" : isPast ? "text-ink/80" : "text-ink/60"}`}>{st.label}</p>{isCurrent && <p className="text-[11px] font-medium text-moss">{order.date}</p>}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {order.courier && (order.status === "shipped" || order.status === "preparing") && (
            <div className="rounded-[24px] border border-amber/20 bg-amber/[0.08] p-4">
              <div className="flex items-center justify-between"><p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-amberdeep"><span className="h-2 w-2 animate-pulse rounded-full bg-amber" />{t("courierTrackingLive")}</p><span className="rounded-full bg-amber/20 px-2.5 py-1 text-[10px] font-bold text-amberdeep">{order.courier.eta}</span></div>
              <div className="mt-3 flex items-center gap-3"><div className="h-11 w-11 shrink-0 rounded-full bg-amber text-white flex items-center justify-center font-display font-bold">{order.courier.name[0]}</div><div className="min-w-0 flex-1"><p className="font-display text-[14px] font-bold text-ink">{order.courier.name} · {order.courier.vehicle}</p><p className="text-[11px] font-medium text-ink/70">{order.courier.rating}</p></div><button onClick={() => { haptic("light"); setShowTracking(true); }} className="press flex h-10 items-center gap-1.5 rounded-full bg-amber px-3.5 text-[12px] font-bold text-white"><IconSearch size={14} />{t("courierTracking")}</button></div>
              <div className="mt-3 flex items-center gap-2"><div className="flex-1"><div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-ink/65"><span>{t("courierFrom")}: DELIS</span><span>{t("courierTo")}: {order.deliveryZone}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-amber/10"><div className="h-full rounded-full bg-moss transition-all duration-700" style={{ width: `${order.courier.progress}%` }} /></div></div></div>
            </div>
          )}

          <div className="rounded-[24px] border border-ink/18 bg-card p-4 space-y-2.5"><p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65">{t("stepDelivery")}</p><div className="flex items-start gap-2.5"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sagetint text-pine"><IconTruck size={14} /></span><div className="min-w-0 flex-1"><p className="text-[13px] font-bold text-ink">{order.deliveryAddress}</p><p className="text-[12px] font-medium text-moss">{order.deliveryTime}</p><p className="mt-1 text-[12px] font-semibold text-ink/75">{order.recipientName} · {order.recipientPhone}</p>{order.courierNote && <p className="mt-1 text-[11px] italic text-ink/70">“{order.courierNote}”</p>}</div></div></div>

          <div className="rounded-[24px] border border-ink/18 bg-card p-4"><p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65">{t("itemsList")} ({order.count})</p><div className="mt-3 divide-y divide-ink/6">{order.items.map((it) => (<div key={it.id} className="flex items-center gap-3 py-2.5"><div className="h-11 w-11 shrink-0 overflow-hidden rounded-[12px] bg-paper2"><img src={it.img} alt={it.name} className="h-full w-full object-cover" /></div><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-bold text-ink">{it.name}</p><p className="text-[11px] font-medium text-ink/70">{formatPrice(it.price, lang)} × {it.qty}</p></div><p className="shrink-0 font-display text-[13px] font-bold text-ink">{formatPrice(it.price * it.qty, lang)}</p></div>))}</div></div>

          <div className="rounded-[24px] border border-ink/18 bg-card p-4 space-y-2"><div className="flex justify-between text-[13px] font-medium text-ink/60"><span>{t("subtotal")}</span><span>{formatPrice(order.subtotal, lang)}</span></div>{order.discount > 0 && <div className="flex justify-between text-[13px] font-bold text-amberdeep"><span>{t("discount")} ({order.promoCode})</span><span>-{formatPrice(order.discount, lang)}</span></div>}<div className="flex justify-between text-[13px] font-medium text-ink/60"><span>{t("deliveryFee")}</span><span className="font-semibold text-moss">{order.deliveryFee === 0 ? t("deliveryFree") : formatPrice(order.deliveryFee, lang)}</span></div><div className="flex items-baseline justify-between border-t border-ink/18 pt-3"><span className="font-display text-[14px] font-bold text-ink">{t("cartTotal")}</span><span className="font-display text-[20px] font-bold text-ink">{formatPrice(order.total, lang)}</span></div></div>

          <div className="space-y-2.5">
            <button onClick={() => { haptic("medium"); onRepeatOrder(order); onClose(); }} className="press flex h-13 w-full items-center justify-center gap-2 rounded-[20px] bg-amber text-[14px] font-bold text-white"><IconBag size={16} />{t("repeatOrder")}</button>
            {/* B2B invoice */}
            <div className="flex gap-2">
              <button
                onClick={() => { haptic("light"); onOpenInvoice?.(order); }}
                className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-[20px] border border-ink/18 bg-card text-[13px] font-bold text-ink"
              >
                <IconReceipt size={16} /> {t("invoiceGet")}
              </button>
              <button
                onClick={() => { haptic("light"); setShowReceipt(true); }}
                className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-[20px] border border-ink/18 bg-card text-[13px] font-bold text-ink"
              >
                <IconCalculator size={16} /> {lang === "uz" ? "Fiskal chek" : lang === "ru" ? "Фискальный чек" : "Fiscal receipt"}
              </button>
            </div>
            <div className="flex gap-2"><button onClick={copyOrderId} className="press flex h-12 flex-1 items-center justify-center gap-1.5 rounded-[20px] bg-paper2 text-[13px] font-bold text-ink"><IconCopy size={14} />{copied ? t("copied") : `#${order.id}`}</button><a href={managerTg} target="_blank" rel="noreferrer" className="press flex h-12 flex-1 items-center justify-center gap-1.5 rounded-[20px] bg-paper2 text-[13px] font-bold text-ink"><IconSend size={14} />{t("contactSupport")}</a></div>
          </div>
        </div>
      </Sheet>

      {order?.courier && <CourierTrackingSheet courier={order.courier} order={order} open={showTracking} onClose={() => setShowTracking(false)} />}

      {/* Fiscal receipt */}
      {showReceipt && order && <FiscalReceiptSheet order={order} onClose={() => setShowReceipt(false)} />}
    </>
  );
}

/* ---------------- FISCAL RECEIPT ---------------- */

function FiscalReceiptSheet({ order, onClose }: { order: Order; onClose: () => void }) {
  const { lang } = useI18n();
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  const REQ = { name: CONFIG.COMPANY_NAME_SHORT, ...CONFIG.REQUISITES };

  const print = () => {
    haptic("medium");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const itemRows = order.items
      .map((it) => {
        const p = PRODUCTS.find((x) => x.id === it.id);
        return `<tr><td>${esc(it.name)}</td><td>${it.qty}</td><td>${formatPrice(it.price, lang)}</td><td>${formatPrice(it.price * it.qty, lang)}</td><td>${esc(p?.batchCode || "—")}</td></tr>`;
      })
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Fiscal ${order.id}</title>
      <style>body{font-family:'Courier New',monospace;width:300px;margin:0 auto;padding:16px;color:#111;font-size:12px}.c{text-align:center}.line{border-top:1px dashed #000;margin:8px 0}table{width:100%;border-collapse:collapse;font-size:11px}td{text-align:left;padding:2px 0}.r{text-align:right}.big{font-size:14px;font-weight:bold}</style></head><body>
      <div class="c"><b>${esc(REQ.name)}</b><br>${esc(REQ.address)}<br>ИНН: ${esc(REQ.inn)}</div>
      <div class="line"></div><div class="c">ФИСКАЛЬНЫЙ ЧЕК</div>
      <div>№: ${order.id}<br>${new Date(order.createdAt).toLocaleString("ru-RU")}<br>Кассир: ${esc(order.recipientName)}</div>
      <div class="line"></div>
      <table><tr><td><b>Товар</b></td><td><b>Кол</b></td><td><b>Цена</b></td><td><b>Сумма</b></td><td><b>Партия</b></td></tr>${itemRows}</table>
      <div class="line"></div>
      <table>
        <tr><td>Подытог</td><td class="r">${formatPrice(order.subtotal, lang)}</td></tr>
        ${order.discount > 0 ? `<tr><td>Скидка (${esc(order.promoCode || "")})</td><td class="r">-${formatPrice(order.discount, lang)}</td></tr>` : ""}
        <tr><td>Доставка</td><td class="r">${order.deliveryFee === 0 ? "0" : formatPrice(order.deliveryFee, lang)}</td></tr>
        <tr class="big"><td><b>ИТОГО</b></td><td class="r"><b>${formatPrice(order.total, lang)}</b></td></tr>
      </table>
      <div class="line"></div>
      <div class="c">Оплата: ${esc(order.paymentMethod.toUpperCase())} (${order.paymentStatus})</div>
      <div class="c">Банк: ${esc(REQ.bank)}<br>Счёт: ${esc(REQ.account)} · МФО: ${esc(REQ.mfo)}</div>
      <div class="line"></div>
      <div class="c">СПАСИБО ЗА ПОКУПКУ! 💚<br>delis.uz</div>
      </body></html>`;
    const win = window.open("", "_blank", "width=360,height=700");
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 400);
    }
  };

  return (
    <Sheet open onClose={onClose} title={L("Fiskal chek", "Фискальный чек", "Fiscal receipt")}>
      <div className="space-y-3 pt-1">
        <div className="rounded-[20px] border border-dashed border-ink/20 bg-card p-4 font-mono text-[12px] leading-relaxed text-ink">
          <div className="text-center">
            <p className="font-display text-[13px] font-bold tracking-wide">{CONFIG.COMPANY_NAME_SHORT}</p>
            <p className="text-ink/60">ИНН: {REQ.inn}</p>
            <p className="text-[10px] text-ink/70">{REQ.address}</p>
          </div>
          <div className="my-2 border-t border-dashed border-ink/20" />
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-ink/60">{L("Fiskal chek", "Фискальный чек", "Fiscal receipt")}</p>
          <p className="mt-1">№ {order.id}</p>
          <p className="text-ink/60">{new Date(order.createdAt).toLocaleString(lang === "en" ? "en-GB" : "ru-RU")}</p>
          <div className="my-2 border-t border-dashed border-ink/20" />
          {order.items.map((it) => (
            <div key={it.id} className="flex justify-between gap-2">
              <span className="min-w-0 flex-1 truncate">{it.name} × {it.qty}</span>
              <span className="shrink-0">{formatPrice(it.price * it.qty, lang)}</span>
            </div>
          ))}
          <div className="my-2 border-t border-dashed border-ink/20" />
          <div className="flex justify-between"><span>{L("Jami", "Итого", "Total")}</span><b>{formatPrice(order.total, lang)}</b></div>
          <div className="my-2 border-t border-dashed border-ink/20" />
          <div className="space-y-0.5 text-[10px] text-ink/75">
            <p>{L("To'lov:", "Оплата:", "Payment:")} {order.paymentMethod.toUpperCase()} ({order.paymentStatus})</p>
            <p>Банк: {REQ.bank} · МФО: {REQ.mfo}</p>
            <p>Счёт: {REQ.account}</p>
            <p className="pt-1">{L("Partiyalar:", "Партии:", "Batches:")} {order.items.map((it) => PRODUCTS.find((x) => x.id === it.id)?.batchCode || "—").join(", ")}</p>
          </div>
          <div className="my-2 border-t border-dashed border-ink/20" />
          <p className="text-center text-[11px]">{L("Xarid uchun rahmat! 💚", "Спасибо за покупку! 💚", "Thanks for shopping! 💚")}</p>
        </div>

        <button onClick={print} className="btn-shine press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-amber text-[14px] font-bold text-white shadow-lift">
          <IconPrinter size={17} /> {L("Chop etish / PDF", "Печать / PDF", "Print / PDF")}
        </button>
        <button onClick={onClose} className="press h-11 w-full rounded-[18px] bg-paper2 text-[13px] font-bold text-ink/70">
          {L("Yopish", "Закрыть", "Close")}
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- LIVE COURIER TRACKING SHEET ---------------- */

function CourierTrackingSheet({ courier, order, open, onClose }: { courier: CourierInfo; order: Order; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [progress, setProgress] = useState(courier.progress);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setProgress((p) => Math.min(99, p + (Math.random() * 1.2))), 2600);
    return () => clearInterval(id);
  }, [open]);

  const statusLabel = (() => {
    switch (courier.status) {
      case "assigned": return t("courierAssigned");
      case "picking": return t("courierPickingUp");
      case "onway": return t("courierOnTheWay");
      case "nearby": return t("courierNearby");
      case "delivered": return t("courierDelivered");
      default: return t("courierOnTheWay");
    }
  })();

  return (
    <Sheet open={open} onClose={onClose} title={t("courierTracking")}>
      <div className="space-y-4 pt-1">
        {/* Live Map Placeholder Luxury */}
        <div className="relative h-[220px] overflow-hidden rounded-[24px] bg-[#E8EDE4] shadow-inner">
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #A9C39E 1px, transparent 0)", backgroundSize: "18px 18px" }} />
          {/* Route path */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 220">
            <path d="M40 170 Q 120 160 160 110 T 270 40" fill="none" stroke="#3F6B52" strokeWidth="3" strokeLinecap="round" strokeDasharray="9 9" opacity="0.5" />
            <circle cx="40" cy="170" r="8" fill="#16402E" /><text x="40" y="172" textAnchor="middle" fill="white" fontSize="7" fontWeight="900">A</text>
            <circle cx="270" cy="40" r="8" fill="#16402E" /><text x="270" y="42" textAnchor="middle" fill="white" fontSize="7" fontWeight="900">B</text>
            {/* Animated courier dot */}
            <g style={{ transform: `translate(${40 + (progress / 100) * 230}px, ${170 - (progress / 100) * 130 - Math.sin(progress / 10) * 12}px)` }}>
              <circle r="12" fill="#E0A63C" stroke="white" strokeWidth="2.5" className="animate-pulse" />
              <foreignObject x="-7" y="-7" width="14" height="14"><div className="grid h-[14px] w-[14px] place-items-center text-white"><IconTruck size={9} /></div></foreignObject>
            </g>
          </svg>
          <div className="absolute bottom-3 left-3 rounded-full bg-pinedeep/80 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur-md">{t("courierShareLocation")} · {Math.round(progress)}%</div>
          <div className="absolute top-3 right-3 rounded-full bg-card px-3 py-1.5 text-[10px] font-bold text-ink shadow-soft flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-moss" />{t("courierTrackingLive")}</div>
        </div>

        {/* Courier Card */}
        <div className="rounded-[22px] border border-ink/18 bg-card p-4">
          <div className="flex items-center gap-3.5">
            <div className="relative"><div className="h-14 w-14 rounded-full bg-amber text-white flex items-center justify-center font-display text-[20px] font-bold">{courier.name[0]}</div><span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-moss text-white"><IconCheck size={10} strokeWidth={2.8} /></span></div>
            <div className="flex-1"><p className="font-display text-[16px] font-bold text-ink">{courier.name}</p><p className="text-[12px] font-medium text-ink/70">{courier.rating} · {courier.vehicle}</p><p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sagetint px-2 py-0.5 text-[10px] font-bold text-pine">{statusLabel}</p></div>
            <div className="flex flex-col gap-2"><a href={`tel:${courier.phone}`} className="press flex h-11 w-11 items-center justify-center rounded-full bg-amber text-white"><IconPhone size={18} /></a><a href={`https://t.me/${courier.phone}`} target="_blank" rel="noreferrer" className="press flex h-11 w-11 items-center justify-center rounded-full bg-paper2 text-ink"><IconSend size={18} /></a></div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-[16px] bg-paper2 p-3 text-center"><p className="text-[10px] font-bold uppercase tracking-wide text-ink/65">{t("courierEta")}</p><p className="mt-1 font-display text-[15px] font-bold text-ink">{courier.eta}</p></div>
            <div className="rounded-[16px] bg-paper2 p-3 text-center"><p className="text-[10px] font-bold uppercase tracking-wide text-ink/65">{t("courierFrom")}</p><p className="mt-1 text-[12px] font-bold text-ink truncate">DELIS Zavodi</p></div>
            <div className="rounded-[16px] bg-paper2 p-3 text-center"><p className="text-[10px] font-bold uppercase tracking-wide text-ink/65">{t("courierTo")}</p><p className="mt-1 text-[12px] font-bold text-ink truncate">{order.deliveryZone?.slice(0, 12)}</p></div>
          </div>

          <div className="mt-4"><div className="flex justify-between text-[11px] font-bold uppercase tracking-wide text-ink/65"><span>{order.courier?.progress}%</span><span>100%</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-amber/10"><div className="h-full rounded-full bg-moss transition-all duration-1000" style={{ width: `${progress}%` }} /></div><p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-moss"><IconClock size={13} />{statusLabel} — {t("courierEta")}: {courier.eta}</p></div>

          <div className="mt-4 flex gap-2.5"><a href={`tel:${courier.phone}`} className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-[16px] bg-amber text-[13px] font-bold text-white"><IconPhone size={16} />{t("courierCall")}</a><button onClick={onClose} className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-[16px] bg-paper2 text-[13px] font-bold text-ink"><IconClose size={16} />{t("done")}</button></div>
        </div>
      </div>
    </Sheet>
  );
}

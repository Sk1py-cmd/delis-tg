/**
 * DELIS — Экран отдельного товара: фото, описание, выбор количества, оптовая цена, добавление в корзину и связанные с товаром действия.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useI18n } from "./i18n";
import { CONFIG } from "./config";
import { PRODUCTS, WHOLESALE_TIERS, WHOLESALE_MIN_QTY, wholesalePrice, type Product, type VolumeOption } from "./data";
import { formatPrice, haptic, lockScroll, openTelegramShare, Reveal, unlockScroll } from "./kit";
import { StockBadge } from "./features-service";
import { BatchInfo } from "./features-improvements";
import {
  IconArrow,
  IconBag,
  IconBox,
  IconCamera,
  IconCheck,
  IconChevron,
  IconClock,
  IconClose,
  IconFactory,
  IconFire,
  IconFlask,
  IconHeart,
  IconImage,
  IconLeaf,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconScale,
  IconShare,
  IconSparkle,
  IconStar,
  IconThumbUp,
} from "./icons";

/* ---------------- Desktop: inline page · Mobile: fullscreen sheet ---------------- */

export function ProductScreen({
  product,
  onClose,
  cart,
  onAdd,
  onOpen,
  onGoCart,
  isFavorite = false,
  onToggleFavorite,
  onOpenCompare,
  onOpenScanner,
  onWriteReview,
  userReviews = [],
  onOpenWaitlist,
}: {
  product: Product | null;
  onClose: () => void;
  cart: Record<string, number>;
  onAdd: (p: Product) => void;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onOpen: (p: Product) => void;
  onGoCart: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  onOpenCompare?: (p: Product) => void;
  onOpenScanner?: (p: Product) => void;
  onWriteReview?: (p: Product) => void;
  userReviews?: { id: string; productId: string; rating: number; text: string; author: string; date: string; photo?: string }[];
  onOpenWaitlist?: (p: Product) => void;
}) {
  const { t, lang } = useI18n();
  const [mounted, setMounted] = useState(!!product);
  const [shown, setShown] = useState(false);
  const [added, setAdded] = useState(false);
  const [selectedImg, setSelectedImg] = useState<string>("");
  const [galleryDragStart, setGalleryDragStart] = useState<number | null>(null);
  const [mode, setMode] = useState<"retail" | "wholesale">("retail");
  const [wholesaleQty, setWholesaleQty] = useState(WHOLESALE_MIN_QTY);
  const [adminTiers, setAdminTiers] = useState<{ minQty: number; discountPercent: number }[] | null>(null);
  const DEFAULT_VOLUMES: VolumeOption[] = [
    { label: "300 ml", liters: 0.3 },
    { label: "500 ml", liters: 0.5 },
    { label: "1 L", liters: 1 },
    { label: "5 L", liters: 5 },
    { label: "10 L", liters: 10 },
    { label: "20 L", liters: 20 },
  ];
  const [selectedVolume, setSelectedVolume] = useState<VolumeOption | null>(null);
  const qty = product ? cart[product.id] ?? 0 : 0;

  // Parse volume like "500 ml" -> 0.5 liters, "1 L" -> 1, "1.5 L" -> 1.5
  const parseVolume = (v: string): number => {
    const s = v.toLowerCase().trim();
    const num = parseFloat(s);
    if (!num) return 0.5;
    if (s.includes("ml")) return num / 1000;
    return num;
  };

  // Current base price depends on selected volume (scales with liters)
  const effectivePrice = (() => {
    if (!product) return 0;
    if (selectedVolume?.retailPrice) return selectedVolume.retailPrice;
    if (!selectedVolume) return product.price;
    const baseLiters = parseVolume(product.volume);
    if (!baseLiters) return product.price;
    const perLiter = product.price / baseLiters;
    // Small discount for larger volumes (5L -10%, 10L -15%, 20L -20%)
    let discount = 0;
    if (selectedVolume.liters >= 20) discount = 0.2;
    else if (selectedVolume.liters >= 10) discount = 0.15;
    else if (selectedVolume.liters >= 5) discount = 0.1;
    return Math.round(perLiter * selectedVolume.liters * (1 - discount) / 100) * 100;
  })();

  // Wholesale price computation follows the live admin ladder when the API is available.
  const wholesaleLadder = adminTiers?.length ? adminTiers : WHOLESALE_TIERS;
  const minimumWholesaleQty = wholesaleLadder[0]?.minQty ?? WHOLESALE_MIN_QTY;
  const wholesale = product ? wholesalePrice(effectivePrice, wholesaleQty, wholesaleLadder) : { unit: 0, discount: 0 };
  const wholesaleTotal = wholesale.unit * wholesaleQty;

  // The wholesale ladder is changed from Admin → B2B. Fetch it for the
  // product page so the displayed discount and unit price match that setting.
  useEffect(() => {
    let active = true;
    void import("./api").then(({ fetchWholesaleTiers }) => fetchWholesaleTiers()).then((rows) => {
      if (active && rows.length) setAdminTiers(rows.map((tier) => ({ minQty: tier.minQty, discountPercent: tier.percent })));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (product) {
      setSelectedImg(product.img);
      setMode("retail");
      setSelectedVolume(product.volumes && product.volumes.length ? product.volumes[0] : DEFAULT_VOLUMES[1]);
      setWholesaleQty(product.unitsPerBox && product.unitsPerBox >= minimumWholesaleQty ? product.unitsPerBox : minimumWholesaleQty);
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      lockScroll();
      window.scrollTo({ top: 0, behavior: "auto" });
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    unlockScroll();
    const timer = setTimeout(() => setMounted(false), 420);
    return () => clearTimeout(timer);
  }, [product]);

  useEffect(
    () => () => {
      unlockScroll();
    },
    [],
  );

  const related = useMemo(
    () =>
      product
        ? PRODUCTS.filter((p) => p.id !== product.id && p.cat === product.cat).slice(0, 3)
        : [],
    [product],
  );

  const galleryImages = useMemo(() => {
    if (!product) return [];
    if (product.gallery && product.gallery.length > 0) return product.gallery;
    return [product.img];
  }, [product]);

  if (!mounted || !product) return null;

  const currentImg = selectedImg || product.img;
  const currentImageIndex = Math.max(0, galleryImages.indexOf(currentImg));
  const showAdjacentImage = (direction: -1 | 1) => {
    if (galleryImages.length < 2) return;
    const next = (currentImageIndex + direction + galleryImages.length) % galleryImages.length;
    setSelectedImg(galleryImages[next]);
    haptic("light");
  };
  const reviewCategory = product.cat === "home"
    ? (lang === "ru" ? "Для дома" : lang === "en" ? "Home care" : "Uy uchun")
    : (lang === "ru" ? "Для авто" : lang === "en" ? "Car care" : "Avto uchun");

  // Add product with the chosen volume (price adjusted if a size override exists)
  const add = () => {
    haptic("medium");
    const productToAdd = selectedVolume?.retailPrice
      ? { ...product, price: selectedVolume.retailPrice }
      : product;

    if (mode === "wholesale") {
      // Add the full wholesale quantity at once
      for (let i = 0; i < wholesaleQty; i++) onAdd(productToAdd);
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1200);
      return;
    }
    if (qty === 0) {
      onAdd(productToAdd);
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1200);
    } else {
      onGoCart();
    }
  };

  const handleShare = () => {
    openTelegramShare(
      CONFIG.BOT_LINK,
      `✨ DELIS — ${product.name} (${formatPrice(product.price, lang)})\n${product.desc[lang]}`,
    );
  };

  return (
    <div className="fixed inset-0 z-[60]" aria-modal>
      {/* backdrop (mobile) */}
      <div
        className={`absolute inset-0 bg-pinedeep/55 backdrop-blur-[2px] transition-opacity duration-400 md:hidden ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      {/* container */}
      <div
        className={`absolute inset-0 flex justify-center transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div
          className={`relative flex h-full w-full max-w-[430px] min-h-0 flex-col bg-paper shadow-[0_0_120px_rgba(0,0,0,0.45)] ${
            shown ? "opacity-100" : "opacity-0"
          } transition-opacity duration-400`}
        >
          {/* scrollable content — hero image scrolls away with the page */}
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* hero — clean premium product image */}
          <div
            className="relative"
            style={{
              background: `linear-gradient(165deg, ${product.color}1f 0%, #ffffff 55%, ${product.color}14 100%)`,
            }}
          >
            {/* top bar with Back, Share, Favorite & Close buttons */}
            <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
              <button
                onClick={() => {
                  haptic("light");
                  onClose();
                }}
                className="press flex items-center gap-1.5 rounded-full bg-paper/80 px-3 py-2 text-[12px] font-bold text-ink shadow-sm backdrop-blur-xl hover:bg-paper"
              >
                <IconArrow size={14} className="rotate-180" />
                <span className="hidden sm:inline">{t("backToCatalog")}</span>
              </button>

              <div className="flex items-center gap-2">
                {/* Wishlist button */}
                <button
                  onClick={() => {
                    haptic("medium");
                    onToggleFavorite?.(product.id);
                  }}
                  className={`press flex h-9 w-9 items-center justify-center rounded-full shadow-sm backdrop-blur-xl transition-all ${
                    isFavorite
                      ? "bg-[#E11D48] text-white shadow-md"
                      : "bg-paper/80 text-ink hover:bg-paper"
                  }`}
                  aria-label="Wishlist"
                >
                  <IconHeart size={16} filled={isFavorite} />
                </button>

                {/* Share button */}
                <button
                  onClick={handleShare}
                  className="press flex h-9 w-9 items-center justify-center rounded-full bg-paper/80 text-ink shadow-sm backdrop-blur-xl hover:bg-paper"
                  aria-label={t("shareProduct")}
                >
                  <IconShare size={15} />
                </button>

                {/* Close button */}
                <button
                  onClick={() => {
                    haptic("light");
                    onClose();
                  }}
                  className="press flex h-9 w-9 items-center justify-center rounded-full bg-paper/80 text-ink shadow-sm backdrop-blur-xl hover:bg-paper"
                  aria-label="Close"
                >
                  <IconClose size={15} />
                </button>
              </div>
            </div>

            {/* product image card */}
            <div
              onPointerDown={(event) => {
                if (galleryImages.length < 2) return;
                setGalleryDragStart(event.clientX);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={(event) => {
                if (galleryDragStart == null) return;
                const distance = event.clientX - galleryDragStart;
                setGalleryDragStart(null);
                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                if (Math.abs(distance) > 42) showAdjacentImage(distance > 0 ? -1 : 1);
              }}
              onPointerCancel={() => setGalleryDragStart(null)}
              className="product-cinematic-media animate-rise relative mx-4 mt-3 touch-pan-y overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.4)]"
              style={{ "--product-accent": product.color || "#638872" } as CSSProperties}
            >
              <div className="relative aspect-[4/3]">
                <div className="product-cinematic-media__orbit" aria-hidden />
                <img
                  key={currentImg}
                  src={currentImg}
                  alt={product.name}
                  className="product-image-enter h-full w-full object-cover transition-transform duration-700 hover:scale-[1.045]"
                />
                <div className="product-cinematic-media__sheen pointer-events-none absolute inset-0" aria-hidden />

                {/* Badge */}
                {product.badge && (
                  <span
                    className={`absolute left-3 top-3 rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] shadow-sm ${
                      product.badge === "new" ? "bg-moss text-white" : "bg-amber text-white"
                    }`}
                  >
                    {product.badge === "new" ? t("badgeNew") : t("badgeBest")}
                  </span>
                )}

                {/* Volume pill */}
                <span className="absolute right-3 top-3 rounded-full bg-paper/90 px-3 py-1.5 font-display text-[11px] font-bold tracking-[0.1em] text-ink shadow-sm backdrop-blur">
                  {product.volume}
                </span>

                {galleryImages.length > 1 && (
                  <div className="product-gallery-swipe absolute inset-x-3 bottom-3 z-10 flex items-center justify-between rounded-full bg-black/30 px-3 py-2 text-white backdrop-blur-md">
                    <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.14em]"><IconRefresh size={12} /> {lang === "uz" ? "Surish" : lang === "ru" ? "Листайте" : "Swipe"}</span>
                    <span className="flex items-center gap-1.5">
                      {galleryImages.map((image, index) => <i key={image} className={`h-1.5 rounded-full transition-all ${index === currentImageIndex ? "w-4 bg-white" : "w-1.5 bg-white/45"}`} />)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* gallery thumbnails */}
            {galleryImages.length > 1 && (
              <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
                {galleryImages.map((gImg, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      haptic("light");
                      setSelectedImg(gImg);
                    }}
                    className={`product-gallery-thumb press h-14 w-14 shrink-0 overflow-hidden rounded-[14px] border-2 transition-all ${
                      currentImg === gImg
                        ? "border-amber ring-2 ring-amber/40"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={gImg} alt="Thumbnail" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* content */}
          <div className="px-4 pt-4 min-[390px]:px-5 min-[390px]:pt-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-moss">
                  {product.cat === "home" ? t("homeCare") : t("carCare")}
                </p>

                {/* Rating badge */}
                <div className="flex items-center gap-1.5 rounded-full bg-amber/15 px-2.5 py-1 text-[11px] font-bold text-amberdeep">
                  <IconStar size={13} className="text-amber" />
                  <span>{product.rating}</span>
                  <span className="text-ink/65">({product.reviewsCount})</span>
                </div>

                {/* Social proof — real order log */}
                {product.soldToday != null && product.soldToday > 0 && (
                  <div className="flex items-center gap-1.5 rounded-full bg-moss/12 px-2.5 py-1 text-[11px] font-bold text-moss">
                    <IconFire size={12} /> {product.soldToday} {lang === "ru" ? "сегодня" : lang === "en" ? "today" : "bugun"}
                  </div>
                )}
              </div>

              <h2 className="animate-rise mt-2 font-display text-[28px] font-bold leading-[1.05] tracking-tight text-ink" style={{ animationDelay: "70ms" }}>
                {product.name}
              </h2>
              <p className="animate-rise mt-2 max-w-[330px] text-[14px] font-medium leading-relaxed text-ink2" style={{ animationDelay: "140ms" }}>
                {product.desc[lang]}
              </p>

              {/* Retail / Wholesale mode switch */}
              <div className="mt-4 inline-flex rounded-full bg-amber/6 p-1">
                {(["retail", "wholesale"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { haptic("light"); setMode(m); }}
                    className={`rounded-full px-4 py-1.5 text-[12px] font-bold transition-colors ${
                      mode === m ? "bg-amber text-white shadow-sm" : "text-ink/70"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">{m === "retail" ? <IconBox size={15} /> : <IconFactory size={15} />}{m === "retail" ? t("modeRetail") : t("modeWholesale")}</span>
                  </button>
                ))}
              </div>

              {/* Stock availability */}
              <div className="mt-3">
                <StockBadge stock={product.stock} />
              </div>

              {/* Volume selector (300 ml ... 20 L) — works in both retail & wholesale */}
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink/65">
                  {lang === "uz" ? "Hajmni tanlang · 300 ml → 20 L" : lang === "ru" ? "Выберите объём · 300 мл → 20 л" : "Choose volume · 300 ml → 20 L"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(product.volumes && product.volumes.length > 0 ? product.volumes : [{ label: product.volume, liters: parseFloat(product.volume) * (product.volume.includes("ml") ? 0.001 : 1) }]).map((v) => {
                    const isActive = selectedVolume?.label === v.label;
                    return (
                      <button
                        key={v.label}
                        onClick={() => {
                          haptic("light");
                          setSelectedVolume(v);
                        }}
                        className={`press rounded-[14px] border px-3.5 py-2 text-[13px] font-bold transition-all ${
                          isActive
                            ? "border-amber bg-amber text-white shadow-sm"
                            : "border-ink/18 bg-card text-ink/70 hover:border-ink/30"
                        }`}
                      >
                        {v.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-ink/70">
                  {lang === "uz" ? "Shu hajm uchun narx" : lang === "ru" ? "Цена за этот объём" : "Price for this volume"}:{" "}
                  <b className="text-ink">{formatPrice(effectivePrice, lang)}</b>
                </p>
              </div>

              {mode === "retail" ? (
                <div className="mt-3 flex items-center gap-3">
                  <span className="font-display text-[22px] font-bold text-ink">
                    {formatPrice(effectivePrice, lang)}
                  </span>
                  <span className="text-[12px] font-semibold text-ink/70">{t("perUnit")}</span>
                  <span className="rounded-full bg-sagetint px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-pine">
                    {product.spec[lang]}
                  </span>
                </div>
              ) : (
                <div className="mt-3 rounded-[22px] border border-amber/25 bg-amber/[0.06] p-4">
                  {/* Volume discount ladder */}
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-amberdeep">
                      <IconSparkle size={12} /> {t("wholesaleTiers")}
                    </p>
                    <span className="text-[11px] font-bold text-moss">{t("wholesaleHint")}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {wholesaleLadder.map((tier) => {
                      const active = wholesaleQty >= tier.minQty;
                      return (
                        <button
                          key={tier.minQty}
                          onClick={() => { haptic("light"); setWholesaleQty(tier.minQty); }}
                          className={`rounded-[14px] border px-1 py-2 text-center transition-all ${
                            active ? "border-amber bg-amber text-white shadow-sm" : "border-ink/15 bg-card text-ink/60"
                          }`}
                        >
                          <span className="block font-display text-[13px] font-bold">−{tier.discountPercent}%</span>
                          <span className="block text-[10px] font-semibold">{tier.minQty}+ {t("wholesaleUnits")}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Qty stepper */}
                  <div className="mt-4 flex items-center justify-between rounded-[16px] bg-card p-2">
                    <span className="pl-2 text-[13px] font-bold text-ink">{t("qtyLabel")}</span>
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => { haptic("light"); setWholesaleQty(Math.max(minimumWholesaleQty, wholesaleQty - 1)); }}
                        className="press flex h-9 w-9 items-center justify-center rounded-full border border-ink/18 text-ink/70"
                      ><IconMinus size={14} /></button>
                      <span className="w-8 text-center font-display text-[15px] font-bold text-ink">{wholesaleQty}</span>
                      <button
                        onClick={() => { haptic("light"); setWholesaleQty(wholesaleQty + 1); }}
                        className="press flex h-9 w-9 items-center justify-center rounded-full bg-amber text-white"
                      ><IconPlus size={14} /></button>
                    </div>
                  </div>

                  {/* Wholesale price summary */}
                  <div className="mt-3 flex items-end justify-between border-t border-amber/20 pt-3">
                    <div>
                      <p className="text-[11px] font-semibold text-ink/70">
                        {formatPrice(wholesale.unit, lang)} · {t("perUnit")}
                        {wholesale.discount > 0 && <span className="ml-1.5 text-moss">(−{wholesale.discount}%)</span>}
                      </p>
                      <p className="text-[11px] font-medium text-ink/65">
                        {t("wholesaleMin")}: {minimumWholesaleQty} {t("wholesaleUnits")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-ink/65">{t("totalForQty")}</p>
                      <p className="font-display text-[20px] font-bold text-ink">{formatPrice(wholesaleTotal, lang)}</p>
                    </div>
                  </div>

                </div>
              )}

              {/* Key Features Pill Badges */}
              {product.features && product.features.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {product.features.map((feat, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 rounded-full border border-ink/18 bg-card px-3 py-1.5 text-[12px] font-semibold text-ink/80 shadow-sm"
                    >
                      <IconCheck size={12} className="text-moss" strokeWidth={2.4} />
                      {feat[lang]}
                    </span>
                  ))}
                </div>
              )}

              {/* Quick interactive utility action bar */}
              <div className="mt-5 grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    haptic("light");
                    onOpenCompare?.(product);
                  }}
                  className="motion-surface press flex flex-col items-center justify-center gap-1 rounded-[18px] border border-ink/18 bg-card p-3 text-center shadow-sm"
                >
                  <span className="motion-icon-tile grid h-8 w-8 place-items-center rounded-[10px] bg-sagetint text-pine"><IconScale size={18} /></span>
                  <span className="text-[11px] font-bold text-ink">{t("compareTitle").split(" ")[0]}</span>
                </button>

                <button
                  onClick={() => {
                    haptic("light");
                    onOpenScanner?.(product);
                  }}
                  className="motion-surface press flex flex-col items-center justify-center gap-1 rounded-[18px] border border-ink/18 bg-card p-3 text-center shadow-sm"
                >
                  <span className="motion-icon-tile grid h-8 w-8 place-items-center rounded-[10px] bg-paper2 text-pine"><IconCamera size={18} /></span>
                  <span className="text-[11px] font-bold text-ink truncate max-w-full">QR #{product.batchCode || "DL"}</span>
                </button>
              </div>
            </div>

            {/* story highlight */}
            <div className="mt-6 border-y border-ink/18 bg-card px-4 py-4 min-[390px]:px-5 min-[390px]:py-5">
              <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber">
                <IconSparkle size={11} />
                {t("story")}
              </p>
              <p className="mt-2.5 font-display text-[16px] font-bold leading-snug text-ink">
                “{product.story[lang]}”
              </p>
            </div>

            {/* accordions */}
            <Accordion title={t("usage")} icon={<IconLeaf size={17} />} delay={60}>
              <p className="text-[14px] font-medium leading-relaxed text-ink2">
                {product.usage[lang]}
              </p>
            </Accordion>

            <Accordion title={t("composition")} icon={<IconFlask size={17} />} delay={120}>
              <p className="text-[14px] font-medium leading-relaxed text-ink2">
                {product.composition[lang]}
              </p>
            </Accordion>

            {/* Product passport / certificate */}
            <Reveal delay={140}>
              <BatchInfo product={product} lang={lang} />
            </Reveal>

            <Accordion
              title={t("tips")}
              icon={<IconClock size={17} />}
              delay={180}
              defaultOpen={false}
            >
              <ul className="space-y-2.5">
                {product.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] font-semibold text-ink/80">
                    <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber text-white">
                      <IconSparkle size={9} />
                    </span>
                    {tip[lang]}
                  </li>
                ))}
              </ul>
            </Accordion>

            {/* Customer Reviews Section */}
            <div className="mt-6 border-b border-ink/18 px-4 pb-5 min-[390px]:px-5 min-[390px]:pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-[17px] font-bold tracking-tight text-ink">
                    {t("reviews")}
                  </h3>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink/70">
                    <span className="flex text-amber">{"★".repeat(5)}</span>
                    <span>{product.rating} / 5.0 · {product.reviewsCount} {t("reviews").toLowerCase()}</span>
                  </p>
                  <span className="mt-2 inline-flex rounded-full bg-sagetint px-2 py-0.5 text-[9px] font-bold text-pine">{reviewCategory}</span>
                </div>
                <button
                  onClick={() => { haptic("medium"); onWriteReview?.(product); }}
                  className="press shrink-0 rounded-full bg-amber px-3.5 py-2 text-[12px] font-bold text-white shadow-sm"
                >
                  {t("writeReview")}
                </button>
              </div>

              {/* Reviews written by customers in this app */}
              {userReviews.filter((r) => r.productId === product.id).length > 0 && (
                <div className="mt-4 space-y-2.5">
                  {userReviews
                    .filter((r) => r.productId === product.id)
                    .map((rev) => (
                      <div key={rev.id} className="rounded-[20px] border border-amber/25 bg-amber/[0.06] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-moss text-[10px] font-extrabold text-white">{rev.author.slice(0, 1).toUpperCase()}</span>
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 font-display text-[13px] font-bold text-ink">
                                {rev.author}
                                {rev.photo && <span className="inline-flex rounded-full bg-amber/20 px-1.5 py-0.5 text-amberdeep"><IconImage size={11} /></span>}
                              </span>
                              <span className="mt-0.5 block text-[10px] font-bold text-moss">{reviewCategory}</span>
                            </span>
                          </span>
                          <span className="shrink-0 text-[11px] font-semibold text-ink/65">{rev.date}</span>
                        </div>
                        <div className="mt-1 text-[12px] text-amber">{"★".repeat(rev.rating)}</div>
                        {rev.photo && (
                          <img src={rev.photo} alt={rev.author} className="mt-2.5 h-[150px] w-full rounded-[14px] border border-amber/15 object-cover" loading="lazy" />
                        )}
                        <p className="mt-2 text-[13px] font-medium leading-relaxed text-ink2">{rev.text}</p>
                      </div>
                    ))}
                </div>
              )}

              {/* Review cards */}
              <div className="mt-4 space-y-3">
                {product.reviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="rounded-[20px] border border-ink/6 bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sagetint text-[10px] font-extrabold text-pine">{rev.author.slice(0, 1).toUpperCase()}</span>
                        <span className="min-w-0">
                          <span className="block font-display text-[13px] font-bold text-ink">{rev.author}</span>
                          <span className="block text-[10px] font-semibold text-ink/65">{rev.city} · {reviewCategory}</span>
                        </span>
                        {rev.verified && (
                          <span className="flex items-center gap-1 rounded-full bg-moss/12 px-2 py-0.5 text-[9px] font-bold text-moss">
                            <IconThumbUp size={10} />
                            {t("verifiedBuyer")}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold text-ink/65">{rev.date}</span>
                    </div>

                    <div className="mt-1.5 flex text-amber text-[12px]">
                      {"★".repeat(rev.rating)}
                    </div>

                    <p className="mt-2 text-[13px] font-medium leading-relaxed text-ink2">
                      {rev.comment[lang]}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* related products */}
            {related.length > 0 && (
              <div className="mt-7 px-4 min-[390px]:mt-8 min-[390px]:px-5">
                <Reveal>
                  <h3 className="font-display text-[18px] font-bold tracking-tight text-ink">
                    {t("similar")}
                  </h3>
                </Reveal>
                <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-1">
                  {related.map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        haptic("light");
                        onOpen(p);
                      }}
                      className="motion-surface press w-[168px] shrink-0 overflow-hidden rounded-[22px] border border-ink/6 bg-card text-left shadow-sm"
                      style={{ animation: `pop 0.6s ${i * 60}ms cubic-bezier(0.34,1.56,0.64,1) both` }}
                    >
                      <div
                        className={`relative h-[140px] overflow-hidden ${
                          p.cat === "home" ? "bg-sagetint" : "bg-graphite2"
                        }`}
                      >
                        <img src={p.img} alt={p.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="p-3">
                        <p className="truncate font-display text-[13px] font-bold text-ink">{p.name}</p>
                        <p className="mt-1 font-display text-[13px] font-bold text-ink">
                          {formatPrice(p.price, lang)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* sticky bottom CTA */}
          <div
            className="z-20 shrink-0 border-t border-ink/10 bg-paper/90 px-4 pt-3 backdrop-blur-xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            {product.stock === 0 ? (
              <button
                onClick={() => {
                  haptic("medium");
                  onOpenWaitlist?.(product);
                }}
                className="btn-shine animate-glowpulse press relative flex h-[60px] w-full items-center justify-center gap-2.5 overflow-hidden rounded-[20px] bg-gradient-to-r from-[#10a35f] via-[#10a35f] to-[#10a35f] bg-[length:200%_200%] text-[15px] font-bold text-white shadow-[0_16px_40px_-14px_rgba(31,41,55,0.9)] transition-all duration-300 hover:brightness-105 active:scale-[0.97] animate-gradient-shift"
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out hover:translate-x-full" />
                <span className="inline-flex items-center gap-1.5"><IconClock size={17} /> {t("waitlistPreorderBtn")}</span>
              </button>
            ) : mode === "wholesale" ? (
              <button
                onClick={add}
                className={`product-add-cta press relative flex h-[60px] w-full items-center justify-center gap-3 overflow-hidden rounded-[20px] text-[15px] font-bold transition-all duration-300 active:scale-[0.97] ${
                  added
                    ? "is-added bg-moss text-white shadow-[0_12px_34px_-14px_rgba(55,65,81,0.8)]"
                    : "btn-shine animate-glowpulse bg-gradient-to-r from-[#10a35f] via-[#10a35f] to-[#10a35f] bg-[length:200%_200%] text-white shadow-[0_16px_40px_-14px_rgba(31,41,55,0.9)] hover:brightness-105 animate-gradient-shift"
                }`}
              >
                <span className={`pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out ${added ? "" : "hover:translate-x-full"}`} />
                {added ? (
                  <span className="animate-pop flex items-center gap-2"><IconCheck size={18} /> {t("added")}</span>
                ) : (
                  <span className="flex items-center gap-2"><IconBag size={18} /> {t("wholesaleAddBox")} · {wholesaleQty} {t("wholesaleUnits")} · {formatPrice(wholesaleTotal, lang)}</span>
                )}
              </button>
            ) : qty === 0 ? (
              <button
                onClick={add}
                className={`product-add-cta press relative flex h-[60px] w-full items-center justify-center gap-2.5 overflow-hidden rounded-[18px] text-[15px] font-bold transition-colors duration-300 active:scale-[0.98] ${
                  added
                    ? "is-added bg-moss text-white"
                    : "bg-[#1f2937] text-white hover:bg-[#1f2937]"
                }`}
              >
                {added ? (
                  <span className="animate-pop flex items-center gap-2">
                    <IconCheck size={18} /> {t("added")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <IconBag size={17} />
                    {t("addToCartLong")} · {formatPrice(effectivePrice, lang)}
                  </span>
                )}
              </button>
            ) : (
              <button
                onClick={onGoCart}
                className="btn-shine press flex h-[60px] w-full items-center justify-center gap-2.5 rounded-[18px] bg-gradient-to-r from-[#10a35f] via-[#10a35f] to-[#10a35f] bg-[length:200%_200%] text-[15px] font-bold text-white transition-colors duration-300 hover:brightness-105 active:scale-[0.98] animate-gradient-shift"
              >
                <IconBag size={17} />
                {t("viewCart")} · {qty}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Accordion({
  title,
  icon,
  children,
  defaultOpen = true,
  delay = 0,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  delay?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Reveal delay={delay} className="border-b border-ink/18">
      <button
        onClick={() => {
          haptic("light");
          setOpen((s) => !s);
        }}
        className="flex w-full items-center gap-3 px-4 py-4 min-[390px]:px-5 min-[390px]:py-5 text-left"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sagetint text-pine">
          {icon}
        </span>
        <span className="flex-1 font-display text-[15px] font-bold text-ink">{title}</span>
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full border border-ink/15 text-ink/70 transition-transform duration-400 ${
            open ? "rotate-90" : ""
          }`}
        >
          <IconChevron size={13} />
        </span>
      </button>
      <div
        className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <div className="min-h-0">
          <div className="px-4 pb-4 pl-[60px] min-[390px]:px-5 min-[390px]:pb-5 min-[390px]:pl-[68px]">{children}</div>
        </div>
      </div>
    </Reveal>
  );
}

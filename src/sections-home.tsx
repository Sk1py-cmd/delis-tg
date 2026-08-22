/**
 * DELIS — Секции главного экрана: приветствие, hero-слайдер, инструменты, ежедневная акция, бегущая строка и переключатель языка.
 */
import { useEffect, useState, type CSSProperties, type PointerEvent } from "react";
import { useI18n, type Lang } from "./i18n";
import {
  CAT_COUNTS,
  PRODUCTS,
  type Cat,
  type Product,
  DailyDealConfig,
  loadDailyDeal,
  secondsUntilMidnight,
} from "./data";
import {
  formatPrice,
  greetingKey,
  haptic,
  MaskLine,
  Reveal,
  type TgUser,
} from "./kit";
import {
  IconArrow,
  IconBox,
  IconCar,
  IconCart,
  IconChart,
  IconClock,
  IconCrown,
  IconFactory,
  IconFire,
  IconGift,
  IconHome,
  IconQrScan,
  IconRefresh,
  IconScale,
  IconShieldCheck,
  IconSparkle,
  IconTruck,
  IconWave,
} from "./icons";
import { SectionHead } from "./chrome";

/* ---------------- Tools (Calculator / Quiz / Subscription) ---------------- */

export function ToolsSection({
  onCalc,
  onQuiz,
  onWheel,
  onSub,
  onGift,
  onCompare,
  onScan,
  onBundles,
}: {
  onCalc: () => void;
  onQuiz: () => void;
  onWheel: () => void;
  onSub: () => void;
  onGift?: () => void;
  onCompare: () => void;
  onScan: () => void;
  onBundles: () => void;
}) {
  const { t, lang } = useI18n();
  const tools = [
    ...(onGift ? [{ icon: IconGift, title: t("giftTitle"), sub: t("giftSub"), onClick: onGift, bg: "bg-amber/15 text-amberdeep" }] : []),
    { icon: IconScale, title: t("compareTitle"), sub: t("compareSub"), onClick: onCompare, bg: "bg-sagetint text-pine" },
    { icon: IconQrScan, title: t("scannerTitle"), sub: t("scannerSub"), onClick: onScan, bg: "bg-[#638872]/10 text-pine" },
    { icon: IconChart, title: t("calcTitle"), sub: t("calcSub"), onClick: onCalc, bg: "bg-sagetint text-pine" },
    { icon: IconSparkle, title: t("quizTitle"), sub: t("quizSub"), onClick: onQuiz, bg: "bg-amber/12 text-amberdeep" },
    { icon: IconCrown, title: lang === "uz" ? "Omad g'ildiragi" : lang === "ru" ? "Колесо фортуны" : "Wheel of Fortune", sub: lang === "uz" ? "Sovg'alar yuting" : lang === "ru" ? "Выигрывайте призы" : "Win prizes", onClick: onWheel, bg: "bg-amber/10 text-amberdeep" },
    { icon: IconRefresh, title: t("subTitle"), sub: t("subSub"), onClick: onSub, bg: "bg-[#94C7B4]/10 text-[#466650]" },
    { icon: IconBox, title: t("bundlesTitle"), sub: t("bundlesSub"), onClick: onBundles, bg: "bg-amber/12 text-amberdeep" },
  ];
  return (
    <section className="render-deferred px-4 pt-10 min-[390px]:px-5">
      <SectionHead title={lang === "ru" ? "Инструменты" : lang === "en" ? "Tools" : "Vositalar"} sub={lang === "ru" ? "Все сервисы, которые вам помогают" : lang === "en" ? "All the services that help you" : "Sizga yordam beradigan barcha xizmatlar"} />
      <div className="no-scrollbar mt-5 flex gap-3 overflow-x-auto pb-1 snap-x-m">
        {tools.map((tool, i) => (
          <button
            key={i}
            onClick={tool.onClick}
            className="motion-surface press animate-ios-pop snap-item flex w-[190px] shrink-0 flex-col justify-between rounded-[24px] border border-ink/6 bg-card p-4 text-left shadow-soft"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div>
              <span className={`motion-icon-tile flex h-12 w-12 items-center justify-center rounded-[16px] ${tool.bg}`}>
                <tool.icon size={22} />
              </span>
              <span className="mt-3 block font-display text-[14px] font-bold leading-snug text-ink">{tool.title}</span>
              <span className="mt-1 line-clamp-2 block text-[11px] font-medium text-ink/70 leading-tight">{tool.sub}</span>
            </div>
            <span className="mt-3 flex items-center gap-1 font-display text-[11px] font-bold text-pine">
              Batafsil <IconArrow size={14} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Language pill ---------------- */

export function LangPill({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useI18n();
  const langs: Lang[] = ["uz", "ru", "en"];
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full p-1 ${
        dark ? "bg-white/12 border border-white/15" : "bg-amber/6 border border-ink/18"
      }`}
    >
      {langs.map((l) => {
        const active = l === lang;
        return (
          <button
            key={l}
            onClick={() => {
              if (active) return;
              haptic("light");
              setLang(l);
            }}
            className={`press rounded-full px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider transition-colors ${
              active
                ? dark
                  ? "bg-white text-[#30253E] shadow-sm"
                  : "bg-amber text-white shadow-sm"
                : dark
                  ? "text-white/60 hover:text-white"
                  : "text-ink/60 hover:text-ink"
            }`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- 1 · Greeting ---------------- */

export function Greeting({ user }: { user: TgUser | null }) {
  const { t } = useI18n();
  const name = user?.first_name || t("guestName");
  const initials = name.slice(0, 1).toUpperCase();

  return (
    <section className="px-4 pt-4 min-[390px]:px-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Reveal>
            <p className="text-[13px] font-bold text-moss">{t(greetingKey())}</p>
          </Reveal>
          <h1 className="mt-1 font-display text-[32px] font-bold leading-[1.06] tracking-tight text-ink">
            <MaskLine delay={80}>
              <span className="animate-gradient-shift bg-gradient-to-r from-[#638872] via-[#94C7B4] to-[#638872] bg-[length:200%_auto] bg-clip-text text-transparent">
                {name}
              </span>
              <span className="animate-wave ml-2 inline-flex origin-[70%_70%] text-moss"><IconWave size={27} /></span>
            </MaskLine>
          </h1>
          <MaskLine delay={220}>
            <span className="text-[13px] font-medium text-ink/70">{t("greetingSub")}</span>
          </MaskLine>
          <Reveal delay={320} className="mt-4">
            <LangPill />
          </Reveal>
        </div>
        <Reveal delay={180} className="shrink-0">
          <div className="relative animate-float-ring">
            <div className="animate-ring-pulse h-[58px] w-[58px] overflow-hidden rounded-full bg-pine ring-2 ring-sage/70 ring-offset-2 ring-offset-paper">
              {user?.photo_url ? (
                <img src={user.photo_url} alt={name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-[20px] font-bold text-white">
                  {initials}
                </div>
              )}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 animate-pulse-soft rounded-full border-[2.5px] border-paper bg-moss" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Brand ticker ---------------- */

/* ---------------- Daily Deal — admin-managed, live timer ---------------- */

export function DailyDeal({ onAdd, onOpen }: { onAdd: (p: Product) => void; onOpen: (p: Product) => void }) {
  const { lang } = useI18n();
  const [cfg, setCfg] = useState<DailyDealConfig>(() => loadDailyDeal());
  const [left, setLeft] = useState(() => secondsUntilMidnight());

  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);

  useEffect(() => {
    const t = setInterval(() => {
      setLeft(secondsUntilMidnight());
      setCfg(loadDailyDeal());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  if (!cfg.enabled) return null;
  const product = PRODUCTS.find((p) => p.id === cfg.productId);
  if (!product) return null;

  const dealPrice = Math.round((product.price * (100 - cfg.discount)) / 1000) * 10;
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const sec = left % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <section className="px-4 pt-5 min-[390px]:px-5">
      <div className="motion-surface relative overflow-hidden rounded-[28px] border border-amber/25 bg-gradient-to-br from-pinedeep via-pine to-pine text-white shadow-lift">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber/20 blur-2xl" />
        <div className="noise-layer pointer-events-none absolute inset-0 opacity-10" />

        <div className="relative p-5">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-amber px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white shadow-sm">
              <IconFire size={14} /> {cfg.title || L("Kun taklifi", "Товар дня", "Daily deal")}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1.5 font-mono text-[11px] font-bold text-white/90 backdrop-blur-sm">
              <IconClock size={13} /> {pad(h)}:{pad(m)}:{pad(sec)}
            </span>
          </div>

          {/* Body */}
          <button
            onClick={() => { haptic("light"); onOpen(product); }}
            className="press mt-4 flex w-full items-center gap-4 text-left"
          >
            <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[20px] border border-white/15 bg-white/10 shadow-md">
              <img src={product.img} alt={product.name} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[15px] font-bold text-white">{product.name}</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="font-display text-[19px] font-extrabold text-amber">{formatPrice(dealPrice, lang)}</span>
                <span className="pb-0.5 text-[12px] font-semibold text-white/45 line-through">{formatPrice(product.price, lang)}</span>
                <span className="mb-0.5 ml-auto rounded-full bg-amber/25 px-2 py-0.5 text-[10px] font-extrabold text-amber">−{cfg.discount}%</span>
              </div>
            </div>
          </button>

          {/* CTA */}
          <button
            onClick={() => { haptic("success"); onAdd(product); }}
            className="btn-shine animate-glowpulse press mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-[#638872] via-[#638872] to-[#638872] bg-[length:200%_200%] text-[13.5px] font-extrabold text-white shadow-soft transition-transform active:scale-[0.98] animate-gradient-shift"
          >
            <IconCart size={18} /> {L("Hoziroq olish", "Забрать по цене дня", "Grab today's price")}
          </button>
        </div>
      </div>
    </section>
  );
}

export function Ticker() {
  const { tl } = useI18n();
  const items = tl("ticker");
  const row = (key: string) => (
    <div key={key} className="flex shrink-0 items-center">
      {items.map((x, i) => (
        <span key={i} className="flex items-center">
          <span className="px-4 text-[10.5px] min-[390px]:px-5 font-extrabold uppercase tracking-[0.24em] text-ink/70">
            {x}
          </span>
          <IconSparkle size={9} className="text-amber" />
        </span>
      ))}
    </div>
  );
  return (
    <Reveal delay={120} className="mt-6">
      <div className="overflow-hidden border-y border-ink/18 bg-paper2/70 py-3">
        <div className="animate-marquee flex w-max">
          {row("a")}
          {row("b")}
        </div>
      </div>
    </Reveal>
  );
}

/* ---------------- 2 · Hero ---------------- */

const HERO_PRICE = 56000;

/**
 * Full-width hero banner.
 * When `product` is provided (the app's real bestseller from the merged
 * server catalog) the banner shows THAT product: live name, live price,
 * real photo, and the CTA opens its product page. Without a product it
 * falls back to the static brand banner and the CTA scrolls to the catalog.
 */
export function Hero({
  product,
  onOpen,
  onCta,
  onHome,
  onCar,
}: {
  product?: Product | null;
  onOpen?: (p: Product) => void;
  onCta: () => void;
  onHome?: () => void;
  onCar?: () => void;
}) {
  const { t, lang } = useI18n();

  // Seasonal accent — auto-detected from month
  const month = new Date().getMonth();
  const seasonBadge =
    month >= 2 && month <= 4
      ? { uz: "Navruz · Yangi formulalar", ru: "Навруз · Новые формулы", en: "Navruz · New formulas", color: "bg-moss" }
      : month >= 10 || month === 0
        ? { uz: "Yangi yil · Sovg'alar", ru: "Новый год · Подарки", en: "New Year · Gift sets", color: "bg-amber" }
        : { uz: "Yozgi parvarish", ru: "Летний уход", en: "Summer care", color: "bg-moss" };

  const hasProduct = !!product;
  const title = hasProduct ? product!.name : "Multi Elixir";
  const subtitle = hasProduct
    ? (product!.desc?.[lang] || t("heroSub"))
    : t("heroSub");
  const price = hasProduct ? product!.price : HERO_PRICE;
  const sold = product?.soldTotal ?? 0;
  const eyebrow =
    hasProduct && sold > 0
      ? lang === "uz"
        ? `Xit · ${sold} ta sotildi`
        : lang === "ru"
          ? `Хит · продано ${sold} шт`
          : `Bestseller · ${sold} sold`
      : t("heroEyebrow");
  const imgSrc = hasProduct && product!.img ? product!.img : "images/hero.jpg";

  const moveLight = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    event.currentTarget.style.setProperty("--hero-x", `${x}%`);
    event.currentTarget.style.setProperty("--hero-y", `${y}%`);
  };

  return (
    <section className="px-4 pt-6 min-[390px]:px-5">
      <Reveal>
        <div
          onPointerMove={moveLight}
          onPointerLeave={(event) => {
            event.currentTarget.style.setProperty("--hero-x", "72%");
            event.currentTarget.style.setProperty("--hero-y", "24%");
          }}
          className="cinematic-hero motion-surface relative h-[540px] overflow-hidden rounded-[32px] shadow-soft"
          style={{ "--hero-x": "72%", "--hero-y": "24%" } as CSSProperties}
        >
          {/* The image stays compositor-safe in Telegram WebView; depth is
              created by lightweight overlays rather than scroll transforms. */}
          <img
            src={imgSrc}
            alt={`DELIS ${title}`}
            loading="eager"
            decoding="async"
            className="cinematic-hero__image absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-pinedeep/95 via-pinedeep/20 to-pinedeep/15" />
          <div className="cinematic-hero__mesh pointer-events-none absolute inset-0" aria-hidden />
          <div className="cinematic-hero__spotlight pointer-events-none absolute inset-0" aria-hidden />
          <div className="cinematic-hero__edge pointer-events-none absolute inset-0" aria-hidden />
          <span className="cinematic-hero__particle is-a" aria-hidden />
          <span className="cinematic-hero__particle is-b" aria-hidden />
          <span className="cinematic-hero__particle is-c" aria-hidden />

          <div className="cinematic-hero__hud absolute left-5 top-5 flex items-center gap-2 text-white/55" aria-hidden>
            <span className="font-mono text-[9px] font-bold tracking-[0.24em]">DELIS / 01</span>
            <span className="h-px w-8 bg-white/25" />
            <span className="cinematic-hero__live h-1.5 w-1.5 rounded-full bg-moss" />
          </div>

          {/* Top-right badges */}
          <div className="absolute right-5 top-5 flex flex-col items-end gap-2">
            <Reveal delay={200}>
              <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3.5 py-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white backdrop-blur-md">
                <IconSparkle size={11} className="text-amber" />
                {t("heroChip")}
              </span>
            </Reveal>
            <Reveal delay={320}>
              <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.16em] ${seasonBadge.color} text-white shadow-sm`}>
                <IconSparkle size={10} /> {seasonBadge[lang]}
              </span>
            </Reveal>
          </div>

          <div className="cinematic-hero__content absolute inset-x-0 bottom-0 p-5 min-[390px]:p-6">
            <Reveal delay={150}>
              <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.22em] text-amber">
                {hasProduct && sold > 0 && <IconFire size={14} />} {eyebrow}
              </p>
            </Reveal>
            <h2 className="mt-3 font-display text-[30px] font-bold leading-[1.04] tracking-tight text-white">
              <MaskLine delay={250}>{title}</MaskLine>
              {!hasProduct && (
                <MaskLine delay={360}>
                  <span className="text-sage">№1</span>
                </MaskLine>
              )}
            </h2>
            <Reveal delay={420}>
              <p className="mt-3 line-clamp-2 max-w-[250px] text-[13.5px] font-medium leading-snug text-white/80">
                {subtitle}
              </p>
            </Reveal>
            <Reveal delay={520}>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <button
                  onClick={() => {
                    haptic("medium");
                    if (onHome) onHome();
                    else if (hasProduct && onOpen) onOpen(product!);
                    else onCta();
                  }}
                  className="press flex items-center gap-2 rounded-full bg-white py-2 pl-4 pr-2 text-[13px] font-bold text-[#30253E] shadow-lift transition-colors hover:bg-[#c3c88c]"
                >
                  <IconHome size={16} />
                  {lang === "ru" ? "Для дома" : lang === "en" ? "For home" : "Uy uchun"}
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#30253E] text-white"><IconArrow size={15} /></span>
                </button>
                <button
                  onClick={() => {
                    haptic("medium");
                    if (onCar) onCar();
                    else onCta();
                  }}
                  className="press flex items-center gap-2 rounded-full border border-white/35 bg-white/12 px-4 py-2.5 text-[13px] font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                >
                  <IconCar size={17} />
                  {lang === "ru" ? "Для авто" : lang === "en" ? "For auto" : "Avto uchun"}
                </button>
                <span className="ml-auto rounded-full border border-white/30 bg-black/20 px-3 py-2.5 text-[11.5px] font-bold text-white/95 backdrop-blur-sm">
                  {formatPrice(price, lang)}
                </span>
              </div>
            </Reveal>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ---------------- 3 · Categories ---------------- */

export function StoreBenefits() {
  const { lang } = useI18n();
  const items = [
    {
      icon: IconSparkle,
      title: lang === "ru" ? "Для дома и авто" : lang === "en" ? "Home & auto" : "Uy va avto uchun",
      text: lang === "ru" ? "Одна марка для повседневной чистоты" : lang === "en" ? "One brand for everyday clean" : "Kundalik tozalik uchun bitta brend",
      tone: "bg-sagetint text-pine",
    },
    {
      icon: IconTruck,
      title: lang === "ru" ? "Доставка по Узбекистану" : lang === "en" ? "Delivery across Uzbekistan" : "O‘zbekiston bo‘ylab yetkazish",
      text: lang === "ru" ? "Выберите удобный способ получения" : lang === "en" ? "Choose a convenient delivery method" : "Qulay yetkazish usulini tanlang",
      tone: "bg-moss/12 text-moss",
    },
    {
      icon: IconShieldCheck,
      title: lang === "ru" ? "Проверенные формулы" : lang === "en" ? "Trusted formulas" : "Ishonchli formulalar",
      text: lang === "ru" ? "Для бережной и эффективной уборки" : lang === "en" ? "Gentle and effective cleaning" : "Ehtiyotkor va samarali tozalash",
      tone: "bg-amber/12 text-amberdeep",
    },
    {
      icon: IconFactory,
      title: lang === "ru" ? "Сделано в Узбекистане" : lang === "en" ? "Made in Uzbekistan" : "O‘zbekistonda ishlab chiqarilgan",
      text: lang === "ru" ? "Контроль качества на каждом этапе" : lang === "en" ? "Quality control at every stage" : "Har bosqichda sifat nazorati",
      tone: "bg-[#30253e]/10 text-pine",
    },
  ];

  return (
    <section className="render-deferred px-4 pt-10 min-[390px]:px-5">
      <SectionHead
        title={lang === "ru" ? "Почему DELIS" : lang === "en" ? "Why DELIS" : "Nega DELIS"}
        sub={lang === "ru" ? "Всё нужное для чистоты — без лишней сложности" : lang === "en" ? "Everything for clean, without the extra fuss" : "Tozalik uchun kerakli hamma narsa — ortiqcha murakkabliksiz"}
      />
      <div className="mt-5 grid grid-cols-2 gap-3">
        {items.map((item, index) => (
          <div key={item.title} className="motion-surface animate-ios-pop rounded-[22px] border border-ink/8 bg-card p-3.5 shadow-soft" style={{ animationDelay: `${index * 70}ms` }}>
            <span className={`motion-icon-tile flex h-10 w-10 items-center justify-center rounded-[14px] ${item.tone}`}><item.icon size={19} /></span>
            <p className="mt-3 text-[12px] font-bold leading-snug text-ink">{item.title}</p>
            <p className="mt-1 text-[10.5px] font-medium leading-snug text-ink/65">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Categories({ onPick }: { onPick: (c: Cat) => void }) {
  const { t } = useI18n();
  const cats: { id: Cat; img: string; overlay: string; chip: string }[] = [
    {
      id: "home",
      img: "images/cat-home.jpg",
      overlay: "bg-gradient-to-t from-[#30253e]/90 via-[#30253e]/30 to-transparent",
      chip: "bg-white/20 text-white border-white/25",
    },
    {
      id: "car",
      img: "images/cat-car.jpg",
      overlay: "bg-gradient-to-t from-[#30253e]/90 via-[#30253e]/30 to-transparent",
      chip: "bg-[#c3c88c]/25 text-white border-[#c3c88c]/35",
    },
  ];
  return (
    <section id="categories" className="render-deferred scroll-mt-16 px-4 pt-10 min-[390px]:px-5">
      <SectionHead title={t("catTitle")} sub={t("catSub")} />
      <div className="mt-6 space-y-4">
        {cats.map((c, i) => {
          const isHome = c.id === "home";
          return (
            <Reveal key={c.id} delay={i * 130}>
              <button
                onClick={() => {
                  haptic("medium");
                  onPick(c.id);
                }}
                className="cinematic-category motion-surface press group relative block h-[218px] w-full overflow-hidden rounded-[28px] text-left shadow-soft"
              >
                <img
                  src={c.img}
                  alt={isHome ? t("homeCare") : t("carCare")}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-active:scale-[1.04]"
                />
                <div className={`absolute inset-0 ${c.overlay}`} />
                <div className="cinematic-category__sweep pointer-events-none absolute inset-0" aria-hidden />
                <span
                  className={`absolute left-5 top-5 rounded-full border px-3.5 py-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.14em] backdrop-blur-md ${c.chip}`}
                >
                  {CAT_COUNTS[c.id]} {t("products")}
                </span>
                <span className="motion-icon-tile absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-white shadow-sm backdrop-blur-md transition-transform duration-300 group-hover:scale-110" aria-hidden>
                  {isHome ? <IconHome size={22} /> : <IconCar size={23} />}
                </span>
                <div className="absolute inset-x-5 bottom-5 flex items-end justify-between">
                  <div>
                    <h3 className="font-display text-[22px] font-bold tracking-tight text-white">
                      {isHome ? t("homeCare") : t("carCare")}
                    </h3>
                    <p className="mt-1 text-[12px] font-medium text-white/75">
                      {isHome ? t("homeCareSub") : t("carCareSub")}
                    </p>
                  </div>
                  <span className="press flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#30253E] shadow-lift transition-colors duration-300 group-hover:bg-amber group-hover:text-white">
                    <IconArrow size={18} />
                  </span>
                </div>
              </button>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

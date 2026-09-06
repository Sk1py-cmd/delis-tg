/**
 * DELIS — Вспомогательные экраны и блоки: лоадер, быстрый доступ, переключатель темы, слайдер hero, страницы FAQ и «О нас».
 */
import { useEffect, useState, type ReactNode } from "react";
import { useI18n, type Lang } from "./i18n";
import { CONFIG } from "./config";
import { useSiteSettings, tgHref, hoursFor } from "./site-settings";
import { ProductImage } from "./kit";
import { haptic, Reveal } from "./kit";
import { addJobApp, type JobPositionId } from "./data";
import {
  IconBag,
  IconBox,
  IconCash,
  IconChart,
  IconCheck,
  IconChevron,
  IconClock,
  IconCreditCard,
  IconFactory,
  IconFlask,
  IconGift,
  IconGrid,
  IconLeaf,
  IconMoon,
  IconPin,
  IconPlay,
  IconQrScan,
  IconReceipt,
  IconRefresh,
  IconScale,
  IconSearch,
  IconSend,
  IconShieldCheck,
  IconStar,
  IconStore,
  IconSun,
  IconUserCheck,
  IconSparkle,
  IconTruck,
} from "./icons";
import { Sheet } from "./chrome";
import { useManagedContent } from "./content-config";
import { BrandLockup } from "./brand";

/* ============================================================
   DELIS LAUNCH LOADER — product-first, not a generic spinner
   ============================================================ */

/* Minimal, luxury splash — Apple / Nothing / Telegram Premium style */
export function DelisLoader({ onComplete }: { onComplete: () => void }) {
  const { lang } = useI18n();
  const content = useManagedContent();
  const [progress, setProgress] = useState(4);
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const stages = [
      { delay: 120, progress: 34, step: 0 },
      { delay: 380, progress: 62, step: 1 },
      { delay: 640, progress: 88, step: 2 },
      { delay: 860, progress: 100, step: 3 },
    ];
    const timers = stages.map((s) => setTimeout(() => {
      setProgress(s.progress);
      setStep(s.step);
    }, s.delay));
    const exit = setTimeout(() => {
      setLeaving(true);
      setTimeout(onComplete, 420);
    }, 1050);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(exit);
    };
  }, [onComplete]);

  return (
    <div
      className={`delis-launch fixed inset-0 z-[100] flex items-center justify-center overflow-hidden ${leaving ? "delis-launch-out" : ""}`}
      style={{ backgroundColor: "#c3c88c", color: "#30253e" }}
    >
      {/* Product-first splash: the bottle immediately explains what DELIS sells. */}
      <img src={content.splash.image || "images/prod-glass.jpg"} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(195,200,140,0.92)_0%,rgba(195,200,140,0.54)_38%,rgba(48,37,62,0.12)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#c3c88c]/90 to-transparent" />

      <div className="relative z-10 flex h-full w-full flex-col items-center px-8 pt-[18vh] text-center">
        <BrandLockup className="delis-loader-brand h-auto w-[272px] max-w-[78vw] drop-shadow-[0_3px_12px_rgba(255,255,255,0.38)]" />

        <div className="mt-auto mb-[12vh] w-40 rounded-full border border-white/40 bg-white/30 px-4 py-2.5 backdrop-blur-sm">
          <p key={step} className="animate-rise truncate text-[11px] font-bold text-[#30253e]/75">
            {(content.splash.steps[step] || content.splash.steps[content.splash.steps.length - 1])[lang]}
          </p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/55">
            <div className="h-full rounded-full bg-[#638872] transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   QUICK ACCESS MENU — faster navigation from top bar
   ============================================================ */

export function QuickAccessSheet({
  open,
  onClose,
  onCatalog,
  onOrders,
  onScan,
  onSearch,
  onTrack,
  onGroup,
  onChat,
}: {
  open: boolean;
  onClose: () => void;
  onCatalog: () => void;
  onOrders: () => void;
  onScan: () => void;
  onSearch?: () => void;
  onTrack?: () => void;
  onGroup?: () => void;
  onChat?: () => void;
}) {
  const { t, lang } = useI18n();
  /* Контакты менеджера — редактируются из админки (вкладка «Сайт»). */
  const site = useSiteSettings();
  const actions = [
    ...(onSearch
      ? [{ icon: IconSearch, title: t("searchAllPh").replace("…", ""), sub: t("searchTryAgain"), action: onSearch, tint: "bg-sagetint text-pine" }]
      : []),
    { icon: IconGrid, title: t("quickCatalog"), sub: t("quickCatalogSub"), action: onCatalog, tint: "bg-sagetint text-pine" },
    { icon: IconBox, title: t("quickOrders"), sub: t("quickOrdersSub"), action: onOrders, tint: "bg-amber/15 text-amberdeep" },
    { icon: IconQrScan, title: t("quickScan"), sub: t("quickScanSub"), action: onScan, tint: "bg-paper2 text-ink" },
    ...(onTrack
      ? [{ icon: IconTruck, title: t("trackTitle"), sub: t("trackSub"), action: onTrack, tint: "bg-moss/10 text-pine" }]
      : []),
    ...(onGroup
      ? [{
          icon: IconUserCheck,
          title: lang === "uz" ? "Guruhli buyurtma" : lang === "ru" ? "Групповой заказ" : "Group order",
          sub: lang === "uz" ? "5 kishi = 20% chegirma" : lang === "ru" ? "5 человек = скидка 20%" : "5 people = 20% off",
          action: onGroup,
          tint: "bg-amber/15 text-amberdeep",
        }]
      : []),
    ...(onChat
      ? [{
          icon: IconSend,
          title: lang === "uz" ? "Menejer bilan chat" : lang === "ru" ? "Чат с менеджером" : "Chat with manager",
          sub: lang === "uz" ? "Savolingizga tez javob" : lang === "ru" ? "Быстрый ответ на вопрос" : "Quick answers",
          action: onChat,
          tint: "bg-[#229ED9]/10 text-[#1B7FAF]",
        }]
      : []),
  ];

  return (
    <Sheet open={open} onClose={onClose} title={t("quickTitle")}>
      <div className="space-y-2.5 pt-1">
        {actions.map((item, i) => (
          <button
            key={i}
            onClick={() => {
              haptic("medium");
              onClose();
              item.action();
            }}
            className="press flex w-full items-center gap-3.5 rounded-[20px] border border-ink/18 bg-card p-4 text-left shadow-sm"
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${item.tint}`}>
              <item.icon size={20} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-ink">{item.title}</span>
              <span className="mt-0.5 block text-[12px] font-medium text-ink/70">{item.sub}</span>
            </span>
            <IconChevron size={15} className="text-ink/75" />
          </button>
        ))}
        <a
          href={tgHref(site.supportTg)}
          target="_blank"
          rel="noreferrer"
          onClick={() => haptic("medium")}
          className="press flex items-center gap-3.5 rounded-[20px] border border-[#229ED9]/20 bg-[#229ED9]/[0.08] p-4 text-left"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#229ED9] text-white">
            <IconSend size={19} />
          </span>
          <span className="flex-1">
            <span className="block text-[14px] font-bold text-ink">{t("quickSupport")}</span>
            <span className="mt-0.5 block text-[12px] font-medium text-ink/70">
              {t("quickSupportSub")} · {site.managerName ? `${site.managerName} · ` : ""}{hoursFor(site, lang)}
            </span>
          </span>
          <IconChevron size={15} className="text-ink/75" />
        </a>
      </div>
    </Sheet>
  );
}

/* ============================================================
   THEME TOGGLE
   ============================================================ */

export function ThemeToggle({ theme, onToggle }: { theme: "light" | "dark"; onToggle: () => void }) {
  const { t } = useI18n();
  const isDark = theme === "dark";
  return (
    <button
      onClick={() => { haptic("light"); onToggle(); }}
      className="press flex items-center gap-2 rounded-full border border-ink/15 bg-card px-3 py-2 text-[11px] font-bold text-ink/70 shadow-sm"
      aria-label={t("themeToggle")}
    >
      {isDark ? <IconMoon size={16} /> : <IconSun size={16} />}
      <span>{isDark ? t("themeDark") : t("themeLight")}</span>
    </button>
  );
}

/* ============================================================
   HERO SLIDER — auto-playing photo carousel for info screens
   ============================================================ */

export function HeroSlider({
  slides,
  height = 300,
}: {
  slides: { img: string; kicker: string; title: string; sub: string }[];
  height?: number;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => setI((v) => (v + 1) % slides.length), 4500);
    return () => clearInterval(id);
  }, [slides.length]);

  return (
    <div className="relative overflow-hidden" style={{ height }}>
      {slides.map((s, idx) => (
        <div
          key={idx}
          className={`absolute inset-0 transition-opacity duration-700 ${idx === i ? "opacity-100" : "opacity-0"}`}
        >
          <img src={s.img} alt="" className="animate-kenburns-slow h-full w-full object-cover" />
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-[#052014] via-[#052014]/45 to-[#052014]/20" />
      <div className="noise-layer" />
      <div className="absolute inset-x-0 bottom-0 p-5">
        <div key={`t${i}`} className="animate-rise">
          <span className="inline-block rounded-full bg-amber/20 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber backdrop-blur-md">
            {slides[i].kicker}
          </span>
          <h1 className="mt-3 font-display text-[30px] font-bold leading-[1.06] tracking-tight text-white">
            {slides[i].title}
          </h1>
          <p className="mt-2 text-[14px] font-semibold text-white/80">{slides[i].sub}</p>
        </div>
        {slides.length > 1 && (
          <div className="mt-4 flex items-center gap-1.5">
            {slides.map((_, d) => (
              <button
                key={d}
                aria-label={`slide ${d + 1}`}
                onClick={() => { haptic("light"); setI(d); }}
                className={`h-1.5 rounded-full transition-all duration-400 ${d === i ? "w-6 bg-amber" : "w-1.5 bg-white/40"}`}
              />
            ))}
            <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
              {i + 1} / {slides.length}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   FAQ SCREEN
   ============================================================ */

export function FaqScreen() {
  const { t } = useI18n();
  const site = useSiteSettings();
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [cat, setCat] = useState("all");
  const cats = [
    { id: "all", label: t("faqCatAll"), icon: IconGrid },
    { id: "delivery", label: t("faqCatDelivery"), icon: IconTruck },
    { id: "payment", label: t("faqCatPayment"), icon: IconCreditCard },
    { id: "quality", label: t("faqCatQuality"), icon: IconShieldCheck },
    { id: "returns", label: t("faqCatReturns"), icon: IconRefresh },
    { id: "stars", label: t("faqCatStars"), icon: IconStar },
    { id: "shop", label: t("faqCatShop"), icon: IconBag },
  ];
  const items = [
    { cat: "quality", q: t("faqQ1"), a: t("faqA1") },
    { cat: "delivery", q: t("faqQ2"), a: t("faqA2") },
    { cat: "payment", q: t("faqQ3"), a: t("faqA3") },
    { cat: "returns", q: t("faqQ4"), a: t("faqA4") },
    { cat: "stars", q: t("faqQ5"), a: t("faqA5") },
    { cat: "quality", q: t("faqQ6"), a: t("faqA6") },
    { cat: "shop", q: t("faqQ7"), a: t("faqA7") },
    { cat: "returns", q: t("faqQ8"), a: t("faqA8") },
    { cat: "delivery", q: t("faqQ9"), a: t("faqA9") },
    { cat: "quality", q: t("faqQ10"), a: t("faqA10") },
    { cat: "shop", q: t("faqQ11"), a: t("faqA11") },
  ];
  const visible = cat === "all" ? items : items.filter((x) => x.cat === cat);
  return (
    <section className="px-4 pt-2 pb-4 min-[390px]:px-5">
      <Reveal>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-moss">{t("supportRow")}</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-tight text-ink">{t("faqTitle")}</h1>
      </Reveal>

      {/* Category chips */}
      <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 min-[390px]:-mx-5 min-[390px]:px-5">
        {cats.map((c) => {
          const active = cat === c.id;
          return (
            <button
              key={c.id}
              onClick={() => { haptic("light"); setCat(c.id); setOpenIdx(null); }}
              className={`press flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-bold transition-colors ${
                active ? "border-ink bg-amber text-white" : "border-ink/15 bg-card text-ink/60"
              }`}
            >
              <c.icon size={13} />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Questions */}
      <div className="mt-5 space-y-2.5">
        {visible.map((it, i) => {
          const open = openIdx === i;
          return (
            <div
              key={i}
              className="overflow-hidden rounded-[22px] border border-ink/18 bg-card shadow-sm"
              style={{ animation: `pop 0.5s ${i * 50}ms cubic-bezier(0.34,1.56,0.64,1) both` }}
            >
              <button
                onClick={() => { haptic("light"); setOpenIdx(open ? null : i); }}
                className="flex w-full items-center gap-3 px-4 py-4 text-left"
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-display font-bold transition-colors ${open ? "bg-amber text-white" : "bg-paper2 text-ink/60"}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-[14px] font-bold leading-snug text-ink">{it.q}</span>
                <IconChevron size={14} className={`text-ink/65 transition-transform duration-400 ${open ? "rotate-90" : ""}`} />
              </button>
              <div className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}>
                <div className="min-h-0">
                  <p className="px-4 pb-4 pl-[60px] text-[13px] font-medium leading-relaxed text-ink2">{it.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Support CTA */}
      <a
        href={tgHref(site.supportTg)}
        target="_blank"
        rel="noreferrer"
        onClick={() => haptic("medium")}
        className="press mt-6 flex items-center justify-center gap-2 rounded-[18px] bg-amber py-4 text-[14px] font-bold text-white hover:opacity-90"
      >
        <IconSend size={16} />
        {t("quickSupport")}
      </a>
      <p className="mt-2.5 text-center text-[12px] font-medium text-ink/70">{t("quickSupportSub")}</p>
    </section>
  );
}

/* ============================================================
   ABOUT / PRODUCTION SCREEN
   ============================================================ */

const ABOUT_TIMELINE: Record<Lang, { y: string; t: string; d: string }[]> = {
  uz: [
    { y: "2022", t: "Oilaviy laboratoriya", d: "Namanganda birinchi formulalar sinovdan o'tadi" },
    { y: "2023", t: "Birinchi liniya", d: "Steril quyish sexi ishga tushadi" },
    { y: "2024", t: "Sertifikatlar", d: "ISO 9001 va GMP standartlari joriy etiladi" },
    { y: "2025", t: "Yangi brend", d: "DELIS nomi bilan Telegram va do'konlarda start" },
    { y: "2026", t: "Butun mamlakat", d: "Barcha viloyatlarga yetkazib berish" },
  ],
  ru: [
    { y: "2022", t: "Семейная лаборатория", d: "Первые формулы тестируются в Намангане" },
    { y: "2023", t: "Первая линия", d: "Запущен стерильный цех розлива" },
    { y: "2024", t: "Сертификация", d: "Внедрены стандарты ISO 9001 и GMP" },
    { y: "2025", t: "Новый бренд", d: "Запуск под именем DELIS в Telegram и магазинах" },
    { y: "2026", t: "Вся страна", d: "Доставка во все регионы Узбекистана" },
  ],
  en: [
    { y: "2022", t: "Family lab", d: "First formulas tested in Namangan" },
    { y: "2023", t: "First line", d: "Sterile filling hall launched" },
    { y: "2024", t: "Certification", d: "ISO 9001 and GMP standards adopted" },
    { y: "2025", t: "New brand", d: "Launched as DELIS on Telegram and in stores" },
    { y: "2026", t: "Whole country", d: "Delivery to every region of Uzbekistan" },
  ],
};

const ABOUT_MISSION: Record<Lang, string> = {
  uz: "Tozalik — bu nafislik",
  ru: "Чистота — это эстетика",
  en: "Cleanliness is an aesthetic",
};
const ABOUT_MISSION_D: Record<Lang, string> = {
  uz: "Biz uy va avto parvarishini premium, ammo tushunarli qilamiz: hech qanday ortiqcha kimyo va murakkab rituallarsiz — faqat natija.",
  ru: "Мы делаем уход за домом и авто премиальным, но понятным: без лишней химии и сложных ритуалов — только результат.",
  en: "We make home & car care premium yet simple: no extra chemicals, no complex rituals — just results.",
};

export function AboutScreen() {
  const { t, lang } = useI18n();
  return (
    <section className="pb-4">
      <HeroSlider
        slides={[
          {
            img: "images/factory.jpg",
            kicker: t("madeIn"),
            title: t("aboutHero"),
            sub: `${t("aboutTitle")} · Namangan`,
          },
          {
            img: "images/prod-glass.jpg",
            kicker: t("madeIn"),
            title: ABOUT_MISSION[lang],
            sub: ABOUT_MISSION_D[lang],
          },
          {
            img: "images/prod-floor.jpg",
            kicker: t("statLabTests"),
            title: "ISO 9001 · GMP",
            sub: t("faqA1"),
          },
        ]}
      />

      <div className="px-5 pt-6">
        <Reveal>
          <p className="text-[14px] font-medium leading-relaxed text-ink2">{t("aboutP1")}</p>
        </Reveal>
        <Reveal delay={100}>
          <p className="mt-4 text-[14px] font-medium leading-relaxed text-ink2">{t("aboutP2")}</p>
        </Reveal>

        {/* Timeline */}
        <Reveal className="mt-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">
            {lang === "uz" ? "Tarix" : lang === "ru" ? "История" : "Timeline"}
          </p>
        </Reveal>
        <div className="mt-4">
          {ABOUT_TIMELINE[lang].map((it, i) => (
            <Reveal key={it.y} delay={i * 70}>
              <div className="relative flex gap-4 pb-5 last:pb-0">
                {i < ABOUT_TIMELINE[lang].length - 1 && (
                  <span className="absolute left-[23px] top-12 h-[calc(100%-3rem)] w-px bg-amber/10" />
                )}
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-ink/18 bg-card font-display text-[13px] font-extrabold text-amber shadow-sm">
                  {it.y}
                </span>
                <div className="pt-1">
                  <h3 className="text-[14px] font-bold text-ink">{it.t}</h3>
                  <p className="mt-0.5 text-[13px] font-medium text-ink2">{it.d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Values */}
        <Reveal className="mt-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">
            {lang === "uz" ? "Qadriyatlar" : lang === "ru" ? "Ценности" : "Values"}
          </p>
        </Reveal>
        <div className="mt-4 space-y-3">
          {[
            { icon: IconLeaf, t: "value1t", d: "value1d" },
            { icon: IconFlask, t: "value2t", d: "value2d" },
            { icon: IconFactory, t: "value3t", d: "value3d" },
            { icon: IconScale, t: "value4t", d: "value4d" },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="flex gap-3.5 rounded-[22px] border border-ink/18 bg-card p-4 shadow-sm">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sagetint text-pine">
                  <s.icon size={19} />
                </span>
                <div>
                  <h3 className="text-[14px] font-bold text-ink">{t(s.t as never)}</h3>
                  <p className="mt-1 text-[13px] font-medium leading-snug text-ink2">{t(s.d as never)}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Stats */}
        <Reveal delay={120} className="mt-7 grid grid-cols-3 gap-2.5">
          {[
            { v: "2", l: t("statFormula") },
            { v: "8", l: t("statBottles") },
            { v: "1", l: t("statLabTests") },
          ].map((s, i) => (
            <div key={i} className="rounded-[18px] border border-ink/18 bg-card p-3.5 text-center shadow-sm">
              <p className="font-display text-[22px] font-bold text-amber">{s.v}</p>
              <p className="mt-1 text-[11px] font-semibold leading-tight text-ink2">{s.l}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ============================================================
   PRODUCTION SCREEN — how DELIS makes products
   ============================================================ */

const PROD_CERTS: Record<Lang, string[]> = {
  uz: ["ISO 9001", "GMP", "Eko-formulalar", "Bio-parchalanadigan"],
  ru: ["ISO 9001", "GMP", "Эко-формулы", "Биоразлагаемые"],
  en: ["ISO 9001", "GMP", "Eco formulas", "Biodegradable"],
};
const PROD_STEP4: Record<Lang, { t: string; d: string }> = {
  uz: { t: "Nazorat va batch-kod", d: "Har bir partiya laboratoriyada tekshiriladi va kod oladi — u chekda ko'rsatiladi." },
  ru: { t: "Контроль и batch-код", d: "Каждая партия проверяется в лаборатории и получает код — он указан в чеке." },
  en: { t: "Control & batch code", d: "Every batch is lab-checked and gets a code — printed on your receipt." },
};
const PROD_CAP: Record<Lang, string> = {
  uz: "Zavod ichida",
  ru: "Внутри завода",
  en: "Inside the factory",
};

export function ProductionScreen() {
  const { t, lang } = useI18n();
  const steps = [
    { icon: IconLeaf, t: "prodStep1t", d: "prodStep1d" },
    { icon: IconFlask, t: "prodStep2t", d: "prodStep2d" },
    { icon: IconFactory, t: "prodStep3t", d: "prodStep3d" },
    { icon: IconShieldCheck, t: PROD_STEP4[lang].t, d: PROD_STEP4[lang].d },
  ];
  const stats = [
    { v: t("prodStat1v"), l: t("prodStat1l") },
    { v: t("prodStat2v"), l: t("prodStat2l") },
    { v: t("prodStat3v"), l: t("prodStat3l") },
  ];
  return (
    <section className="pb-4">
      <HeroSlider
        slides={[
          { img: "images/factory.jpg", kicker: t("prodKicker"), title: t("prodHero"), sub: t("prodP1") },
          { img: "images/prod-glass.jpg", kicker: PROD_CAP[lang], title: t("prodStep2t"), sub: t("prodStep2d") },
          { img: "images/prod-floor.jpg", kicker: PROD_CAP[lang], title: t("prodStep3t"), sub: t("prodStep3d") },
        ]}
      />

      <div className="px-5 pt-6">
        <Reveal>
          <p className="text-[14px] font-medium leading-relaxed text-ink2">{t("prodP2")}</p>
        </Reveal>

        {/* Production stages */}
        <Reveal className="mt-7">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">
            {lang === "uz" ? "Ishlab chiqarish bosqichlari" : lang === "ru" ? "Этапы производства" : "Production stages"}
          </p>
        </Reveal>
        <div className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="flex gap-3.5 rounded-[22px] border border-ink/18 bg-card p-4 shadow-sm">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sagetint text-pine">
                  <s.icon size={19} />
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber text-[10px] font-extrabold text-white">
                    {i + 1}
                  </span>
                </span>
                <div>
                  <h3 className="text-[14px] font-bold text-ink">{typeof s.t === "string" ? s.t : t(s.t as never)}</h3>
                  <p className="mt-1 text-[13px] font-medium leading-snug text-ink2">{typeof s.d === "string" ? s.d : t(s.d as never)}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Stats */}
        <Reveal delay={120} className="mt-7 grid grid-cols-3 gap-2.5">
          {stats.map((s, i) => (
            <div key={i} className="rounded-[18px] border border-ink/18 bg-card p-3.5 text-center shadow-sm">
              <p className="font-display text-[22px] font-bold text-amber">{s.v}</p>
              <p className="mt-1 text-[11px] font-semibold leading-tight text-ink2">{s.l}</p>
            </div>
          ))}
        </Reveal>

        {/* Certificates */}
        <Reveal delay={140} className="mt-7">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">
            {lang === "uz" ? "Sertifikatlar va standartlar" : lang === "ru" ? "Сертификаты и стандарты" : "Certificates & standards"}
          </p>
        </Reveal>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {PROD_CERTS[lang].map((c, i) => (
            <Reveal key={c} delay={i * 70}>
              <div className="flex items-center gap-2.5 rounded-[18px] border border-moss/15 bg-sagetint/60 p-3.5">
                <IconCheck size={15} strokeWidth={2.4} className="shrink-0 text-moss" />
                <span className="text-[13px] font-bold text-pine">{c}</span>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Batch code trust */}
        <Reveal delay={160} className="mt-6 rounded-[22px] border border-ink/18 bg-card p-4 shadow-sm">
          <p className="flex items-center gap-2.5 text-[13px] font-bold text-ink">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amberdeep">
              <IconQrScan size={17} />
            </span>
            {t("prodTrust")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ============================================================
   CAREERS SCREEN — open positions
   ============================================================ */

const JOB_POSITIONS_L: Record<Lang, Record<JobPositionId, { t: string; s: string; exp: boolean }>> = {
  uz: {
    agent: { t: "Agent (savdo vakili)", s: "Namangan viloyati · safarlar", exp: true },
    courier: { t: "Kuryer-yetkazuvchi", s: "Namangan shahri · 9:00–19:00", exp: false },
    factory: { t: "Zavod xodimi", s: "To'raqo'rg'on · smenali ish", exp: false },
    manager: { t: "B2B menejer", s: "Namangan · ofis + safarlar", exp: true },
    smm: { t: "SMM-menejer", s: "Masofaviy / Namangan", exp: true },
  },
  ru: {
    agent: { t: "Агент (торговый представитель)", s: "Наманганская область · разъезды", exp: true },
    courier: { t: "Курьер-доставщик", s: "Наманган · 9:00–19:00", exp: false },
    factory: { t: "Работник завода", s: "Туракурган · сменная работа", exp: false },
    manager: { t: "B2B-менеджер", s: "Наманган · офис + поездки", exp: true },
    smm: { t: "SMM-менеджер", s: "Удалённо / Наманган", exp: true },
  },
  en: {
    agent: { t: "Agent (sales rep)", s: "Namangan region · travel", exp: true },
    courier: { t: "Delivery courier", s: "Namangan · 9:00–19:00", exp: false },
    factory: { t: "Factory worker", s: "Turakurgan · shift work", exp: false },
    manager: { t: "B2B manager", s: "Namangan · office + trips", exp: true },
    smm: { t: "SMM manager", s: "Remote / Namangan", exp: true },
  },
};

const JOB_POSITION_ICONS: Record<JobPositionId, (p: { size?: number; className?: string }) => ReactNode> = {
  agent: IconUserCheck,
  courier: IconTruck,
  factory: IconFactory,
  manager: IconStore,
  smm: IconChart,
};

const CAREERS_EXTRA: Record<Lang, { hire: string; h: { t: string; d: string }[] }> = {
  uz: {
    hire: "Tanlov jarayoni",
    h: [
      { t: "Ariza", d: "Telegram orqali yuborasiz" },
      { t: "Suhbat", d: "15 daqiqa — telefon yoki ofisda" },
      { t: "Sinov smenasi", d: "Bir kunlik amaliyot" },
      { t: "Ish", d: "Rasmiy shartnoma va o'qitish" },
    ],
  },
  ru: {
    hire: "Процесс отбора",
    h: [
      { t: "Заявка", d: "Отправляете через Telegram" },
      { t: "Собеседование", d: "15 минут — по телефону или в офисе" },
      { t: "Пробная смена", d: "Один день практики" },
      { t: "Работа", d: "Официальный договор и обучение" },
    ],
  },
  en: {
    hire: "Hiring process",
    h: [
      { t: "Apply", d: "Send your application via Telegram" },
      { t: "Interview", d: "15 minutes — by phone or in the office" },
      { t: "Trial shift", d: "One day of practice" },
      { t: "Work", d: "Official contract and training" },
    ],
  },
};

const CAREERS_FORM_L: Record<Lang, {
  pick: string;
  expYes: string;
  expNo: string;
  form: string;
  namePh: string;
  phonePh: string;
  notePh: string;
  btn: string;
  need: string;
  okTitle: string;
  okSub: string;
  tg: string;
  again: string;
  tmpl: (pos: string, name: string, phone: string, note: string) => string;
}> = {
  uz: {
    pick: "Lavozimni tanlang",
    expYes: "Tajriba kerak",
    expNo: "Tajribasiz ham mumkin",
    form: "Ariza qoldirish",
    namePh: "Ismingiz",
    phonePh: "Telefon raqamingiz",
    notePh: "Qisqa ma'lumot (ixtiyoriy)",
    btn: "Arizani yuborish",
    need: "Lavozim, ism va telefonni kiriting",
    okTitle: "Ariza tayyor",
    okSub: "Ariza hali yuborilmadi. Telegramda davom etib, tayyor xabarni menejerga yuboring.",
    tg: "Telegramda davom etish",
    again: "Yana ariza qoldirish",
    tmpl: (pos, name, phone, note) => `Salom! DELIS vakansiyasiga ariza qoldirmoqchiman.\nIsm: ${name}\nTelefon: ${phone}\nLavozim: ${pos}${note ? `\nIzoh: ${note}` : ""}`,
  },
  ru: {
    pick: "Выберите должность",
    expYes: "Нужен опыт",
    expNo: "Можно без опыта",
    form: "Оставить заявку",
    namePh: "Ваше имя",
    phonePh: "Номер телефона",
    notePh: "Коротко о себе (необязательно)",
    btn: "Отправить заявку",
    need: "Выберите должность, имя и телефон",
    okTitle: "Заявка принята!",
    okSub: "Менеджер свяжется с вами в течение 24 часов. Осталось отправить сообщение в Telegram.",
    tg: "Продолжить в Telegram",
    again: "Оставить ещё заявку",
    tmpl: (pos, name, phone, note) => `Здравствуйте! Хочу оставить заявку на вакансию в DELIS.\nИмя: ${name}\nТелефон: ${phone}\nДолжность: ${pos}${note ? `\nКомментарий: ${note}` : ""}`,
  },
  en: {
    pick: "Choose a position",
    expYes: "Experience required",
    expNo: "No experience needed",
    form: "Apply now",
    namePh: "Your name",
    phonePh: "Phone number",
    notePh: "About you (optional)",
    btn: "Send application",
    need: "Pick a position, add your name and phone",
    okTitle: "Application received!",
    okSub: "A manager will contact you within 24 hours. Now continue in Telegram — just send the message.",
    tg: "Continue in Telegram",
    again: "Apply again",
    tmpl: (pos, name, phone, note) => `Hello! I would like to apply for a position at DELIS.\nName: ${name}\nPhone: ${phone}\nPosition: ${pos}${note ? `\nNote: ${note}` : ""}`,
  },
};

export function CareersScreen() {
  const { t, lang } = useI18n();
  const site = useSiteSettings();
  const ex = CAREERS_EXTRA[lang];
  const FL = CAREERS_FORM_L[lang];
  const [selected, setSelected] = useState<JobPositionId | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [tgLink, setTgLink] = useState("");

  const perks = [
    { icon: IconShieldCheck, t: "perk1t", d: "perk1d" },
    { icon: IconChart, t: "perk2t", d: "perk2d" },
    { icon: IconGift, t: "perk3t", d: "perk3d" },
  ];

  const canSend = selected && name.trim() && phone.trim();

  const submit = () => {
    if (!canSend || !selected) return;
    haptic("success");
    addJobApp({ position: selected, name: name.trim(), phone: phone.trim(), note: note.trim() || undefined });
    const posLabel = JOB_POSITIONS_L[lang][selected].t;
    const text = encodeURIComponent(FL.tmpl(posLabel, name.trim(), phone.trim(), note.trim()));
    setTgLink(`${tgHref(site.supportTg)}?text=${text}`);
    setSent(true);
  };

  const reset = () => {
    haptic("light");
    setSelected(null);
    setName("");
    setPhone("");
    setNote("");
    setSent(false);
  };

  return (
    <section className="pb-4">
      <HeroSlider
        slides={[
          { img: "images/prod-floor.jpg", kicker: t("careersKicker"), title: t("careersHero"), sub: t("careersP1") },
          { img: "images/prod-glass.jpg", kicker: t("careersKicker"), title: FL.pick, sub: JOB_POSITIONS_L[lang].factory.s },
          { img: "images/factory.jpg", kicker: t("careersKicker"), title: t("careersPerks"), sub: t("careersCtaSub") },
        ]}
      />

      <div className="px-5 pt-6">
        {/* Perks */}
        <Reveal>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">{t("careersPerks")}</p>
        </Reveal>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {perks.map((s, i) => (
            <Reveal key={i} delay={i * 80} className="h-full">
              <div className="flex h-full flex-col rounded-[20px] border border-ink/18 bg-card p-3.5 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sagetint text-pine">
                  <s.icon size={17} />
                </span>
                <h3 className="mt-2.5 text-[12px] font-bold leading-tight text-ink">{t(s.t as never)}</h3>
                <p className="mt-1 text-[11px] font-medium leading-snug text-ink2">{t(s.d as never)}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Position picker */}
        <Reveal className="mt-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">{FL.pick}</p>
        </Reveal>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {(Object.keys(JOB_POSITIONS_L[lang]) as JobPositionId[]).map((id, i) => {
            const pos = JOB_POSITIONS_L[lang][id];
            const active = selected === id;
            const Icon = JOB_POSITION_ICONS[id];
            return (
              <Reveal key={id} delay={i * 60} className="h-full">
                <button
                  onClick={() => { haptic("light"); setSelected(active ? null : id); }}
                  className={`press relative flex h-full w-full flex-col items-start rounded-[20px] border p-3.5 text-left shadow-sm transition-all ${
                    active ? "border-moss bg-sagetint/50 ring-1 ring-moss/40" : "border-ink/18 bg-card"
                  }`}
                >
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border-2 border-ink/15">
                    {active && <span className="h-2.5 w-2.5 rounded-full bg-moss" />}
                  </span>
                  <span className={`flex h-10 w-10 items-center justify-center rounded-[14px] ${active ? "bg-pine text-white" : "bg-sagetint text-pine"}`}>
                    <Icon size={18} />
                  </span>
                  <h3 className="mt-2.5 text-[13px] font-bold leading-tight text-ink">{pos.t}</h3>
                  <p className="mt-1 text-[11px] font-medium leading-snug text-ink2">{pos.s}</p>
                  <span className={`mt-2 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] ${pos.exp ? "bg-amber/15 text-amberdeep" : "bg-moss/12 text-pine"}`}>
                    {pos.exp ? FL.expYes : FL.expNo}
                  </span>
                </button>
              </Reveal>
            );
          })}
        </div>

        {/* Application form */}
        <Reveal className="mt-8">
          <div className="overflow-hidden rounded-[24px] border border-ink/18 bg-card shadow-sm">
            <div className="bg-pinedeep px-5 py-4 text-white">
              <h3 className="font-display text-[17px] font-bold">{FL.form}</h3>
              <p className="mt-0.5 text-[12px] font-medium text-white/60">{t("careersCtaSub")}</p>
            </div>
            {sent ? (
              <div className="p-5 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-moss/15 text-moss">
                  <IconCheck size={30} strokeWidth={2.2} />
                </span>
                <h4 className="mt-3 text-[15px] font-bold text-ink">{FL.okTitle}</h4>
                <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink2">{FL.okSub}</p>
                <a
                  href={tgLink}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => haptic("medium")}
                  className="press mt-5 flex items-center justify-center gap-2 rounded-[16px] bg-[#229ED9] py-3.5 text-[14px] font-bold text-white"
                >
                  <IconSend size={15} />
                  {FL.tg}
                </a>
                <button
                  onClick={reset}
                  className="press mt-2.5 w-full rounded-[16px] border border-ink/15 py-3 text-[13px] font-bold text-ink2"
                >
                  {FL.again}
                </button>
              </div>
            ) : (
              <div className="space-y-3 p-5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={FL.namePh}
                  className="w-full rounded-[16px] border border-ink/15 bg-paper px-4 py-3.5 text-[14px] font-semibold text-ink outline-none placeholder:text-ink/75 focus:border-moss"
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={FL.phonePh}
                  inputMode="tel"
                  className="w-full rounded-[16px] border border-ink/15 bg-paper px-4 py-3.5 text-[14px] font-semibold text-ink outline-none placeholder:text-ink/75 focus:border-moss"
                />
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={FL.notePh}
                  rows={2}
                  className="w-full resize-none rounded-[16px] border border-ink/15 bg-paper px-4 py-3.5 text-[14px] font-semibold text-ink outline-none placeholder:text-ink/75 focus:border-moss"
                />
                <button
                  onClick={submit}
                  disabled={!canSend}
                  className="press w-full rounded-[16px] bg-amber py-4 text-[14px] font-bold text-white hover:brightness-105 disabled:opacity-40"
                >
                  {FL.btn}
                </button>
                <p className="text-center text-[11px] font-medium text-ink/65">{FL.need}</p>
              </div>
            )}
          </div>
        </Reveal>

        {/* Hiring steps */}
        <Reveal className="mt-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">{ex.hire}</p>
        </Reveal>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {ex.h.map((s, i) => (
            <Reveal key={i} delay={i * 70} className="h-full">
              <div className="flex h-full flex-col rounded-[18px] border border-ink/18 bg-card p-3 shadow-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber font-display text-[11px] font-extrabold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-2 text-[12px] font-bold leading-tight text-ink">{s.t}</h3>
                <p className="mt-1 text-[10px] font-medium leading-snug text-ink2">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* CTA */}
        <Reveal delay={120} className="mt-6">
          <a
            href={tgHref(site.supportTg)}
            target="_blank"
            rel="noreferrer"
            onClick={() => haptic("medium")}
            className="press flex items-center justify-center gap-2 rounded-[18px] bg-amber py-4 text-[14px] font-bold text-white hover:opacity-90"
          >
            <IconSend size={16} />
            {t("careersCta")}
          </a>
          <p className="mt-2.5 text-center text-[12px] font-medium text-ink/70">
            {site.managerName ? `${site.managerName} · ` : ""}{site.supportTg} · {hoursFor(site, lang)} — {t("careersCtaSub")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ============================================================
   DELIVERY SCREEN — zones, steps, payment
   ============================================================ */

const DELIVERY_L: Record<Lang, {
  kicker: string;
  slides: { img: string; t: string; s: string }[];
  zones: string;
  zone: { t: string; d: string; price: string }[];
  steps: string;
  step: { t: string; d: string }[];
  pay: string;
  pays: string[];
  track: string;
  trackS: string;
  faq: string;
  fq: { q: string; a: string }[];
}> = {
  uz: {
    kicker: "Yetkazib berish",
    slides: [
      { img: "images/hero.jpg", t: "150 000 so'mdan bepul", s: "Butun O'zbekiston bo'ylab" },
      { img: "images/prod-shampoo.jpg", t: "Namanganda — bugun", s: "Ertalab buyurtma — kechqurun uydasiz" },
      { img: "images/cat-home.jpg", t: "Jonli kuryer xaritasi", s: "Trekingda kuryerni xaritada kuzating" },
    ],
    zones: "Zonalar va muddatlar",
    zone: [
      { t: "Namangan shahri", d: "2–4 soat · bugun", price: "Bepul" },
      { t: "Namangan viloyati", d: "1 kun", price: "Bepul" },
      { t: "Toshkent va viloyatlar", d: "1–3 ish kuni", price: "12 000 so'mdan" },
    ],
    steps: "Buyurtma qanday yetib keladi",
    step: [
      { t: "Buyurtma", d: "Savatdan rasmiylashtirasiz" },
      { t: "Tasdiqlash", d: "Menejer 15 daqiqada qo'ng'iroq qiladi" },
      { t: "Tayyorlash", d: "Zavodda yig'iladi va qadoqlanadi" },
      { t: "Yetkazish", d: "Kuryer chek va batch-kod bilan olib keladi" },
    ],
    pay: "To'lov usullari",
    pays: ["Naqd", "Karta (Humo/Uzcard)", "Payme / Click / Paynet", "Telegram Stars"],
    track: "Buyurtmani kuzatish",
    trackS: "BTS-kod yoki buyurtma raqami orqali",
    faq: "Yetkazib berish haqida savollar",
    fq: [
      { q: "Kuryerga qo'ng'iroq qilish mumkinmi?", a: "Ha — treking sahifasida kuryer raqami ko'rsatiladi." },
      { q: "Qachon bepul yetkazish bo'ladi?", a: "150 000 so'mdan yuqori har qanday buyurtma butun O'zbekiston bo'ylab bepul yetkaziladi." },
      { q: "Vaqtni o'zgartirish mumkinmi?", a: "Ha — menejer tasdiqlash paytida yoki trekingda qulay vaqtni kelishib oladi." },
    ],
  },
  ru: {
    kicker: "Доставка",
    slides: [
      { img: "images/hero.jpg", t: "Бесплатно от 150 000", s: "По всему Узбекистану" },
      { img: "images/prod-shampoo.jpg", t: "В Намангане — сегодня", s: "Заказ утром — дома к вечеру" },
      { img: "images/cat-home.jpg", t: "Живая карта курьера", s: "Следите за курьером на карте в трекинге" },
    ],
    zones: "Зоны и сроки",
    zone: [
      { t: "Город Наманган", d: "2–4 часа · сегодня", price: "Бесплатно" },
      { t: "Наманганская область", d: "1 день", price: "Бесплатно" },
      { t: "Ташкент и регионы", d: "1–3 рабочих дня", price: "от 12 000 сум" },
    ],
    steps: "Как приедет ваш заказ",
    step: [
      { t: "Заказ", d: "Оформляете из корзины" },
      { t: "Подтверждение", d: "Менеджер перезванивает за 15 минут" },
      { t: "Сборка", d: "Собирается и упаковывается на заводе" },
      { t: "Доставка", d: "Курьер привозит с чеком и batch-кодом" },
    ],
    pay: "Способы оплаты",
    pays: ["Наличные", "Карта (Humo/Uzcard)", "Payme / Click / Paynet", "Telegram Stars"],
    track: "Отследить заказ",
    trackS: "По BTS-коду или номеру заказа",
    faq: "Вопросы о доставке",
    fq: [
      { q: "Можно ли позвонить курьеру?", a: "Да — номер курьера показан на странице трекинга." },
      { q: "Когда доставка бесплатная?", a: "Любой заказ от 150 000 сум доставляется бесплатно по всему Узбекистану." },
      { q: "Можно ли перенести доставку?", a: "Да — удобное время согласует менеджер при подтверждении или в трекинге." },
    ],
  },
  en: {
    kicker: "Delivery",
    slides: [
      { img: "images/hero.jpg", t: "Free from 150,000", s: "Across Uzbekistan" },
      { img: "images/prod-shampoo.jpg", t: "In Namangan — today", s: "Order in the morning — home by evening" },
      { img: "images/cat-home.jpg", t: "Live courier map", s: "Watch your courier on the tracking map" },
    ],
    zones: "Zones & ETA",
    zone: [
      { t: "Namangan city", d: "2–4 hours · today", price: "Free" },
      { t: "Namangan region", d: "1 day", price: "Free" },
      { t: "Tashkent & regions", d: "1–3 business days", price: "from 12,000" },
    ],
    steps: "How your order arrives",
    step: [
      { t: "Order", d: "Check out from your cart" },
      { t: "Confirmation", d: "Manager calls within 15 minutes" },
      { t: "Packing", d: "Packed at the factory" },
      { t: "Delivery", d: "Courier brings receipt & batch code" },
    ],
    pay: "Payment methods",
    pays: ["Cash", "Card (Humo/Uzcard)", "Payme / Click / Paynet", "Telegram Stars"],
    track: "Track your order",
    trackS: "By BTS code or order number",
    faq: "Delivery questions",
    fq: [
      { q: "Can I call the courier?", a: "Yes — the courier's number is shown on the tracking page." },
      { q: "When is delivery free?", a: "Any order from 150,000 UZS ships free across Uzbekistan." },
      { q: "Can I reschedule delivery?", a: "Yes — the manager will agree a convenient time at confirmation or in tracking." },
    ],
  },
};

export function DeliveryScreen() {
  const { lang } = useI18n();
  const L = DELIVERY_L[lang];
  return (
    <section className="pb-4">
      <HeroSlider
        slides={L.slides.map((s) => ({ img: s.img, kicker: L.kicker, title: s.t, sub: s.s }))}
      />

      <div className="px-5 pt-6">
        {/* Zones */}
        <Reveal>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">{L.zones}</p>
        </Reveal>
        <div className="mt-4 space-y-2.5">
          {L.zone.map((z, i) => (
            <Reveal key={i} delay={i * 70}>
              <div className="flex items-center gap-3.5 rounded-[20px] border border-ink/18 bg-card p-4 shadow-sm">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sagetint text-pine">
                  <IconPin size={18} />
                </span>
                <div className="flex-1">
                  <h3 className="text-[14px] font-bold text-ink">{z.t}</h3>
                  <p className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-ink/70">
                    <IconClock size={11} /> {z.d}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-[11px] font-extrabold ${z.price.startsWith("Bepul") || z.price.startsWith("Бесплатно") || z.price.startsWith("Free") ? "bg-moss/12 text-pine" : "bg-amber/15 text-amberdeep"}`}>
                  {z.price}
                </span>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Steps */}
        <Reveal className="mt-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">{L.steps}</p>
        </Reveal>
        <div className="mt-4 space-y-3">
          {L.step.map((s, i) => (
            <Reveal key={i} delay={i * 70}>
              <div className="flex gap-3.5 rounded-[22px] border border-ink/18 bg-card p-4 shadow-sm">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amberdeep">
                  <IconTruck size={19} />
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber text-[10px] font-extrabold text-white">
                    {i + 1}
                  </span>
                </span>
                <div>
                  <h3 className="text-[14px] font-bold text-ink">{s.t}</h3>
                  <p className="mt-1 text-[13px] font-medium leading-snug text-ink2">{s.d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Payment methods */}
        <Reveal className="mt-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">{L.pay}</p>
        </Reveal>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {L.pays.map((p, i) => (
            <Reveal key={i} delay={i * 60} className="h-full">
              <div className="flex h-full items-center gap-2.5 rounded-[18px] border border-ink/18 bg-card p-3.5 shadow-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sagetint text-pine">
                  {i === 0 ? <IconCash size={15} /> : i === 1 ? <IconCreditCard size={15} /> : i === 2 ? <IconReceipt size={15} /> : <IconStar size={15} />}
                </span>
                <span className="text-[12px] font-bold leading-tight text-ink">{p}</span>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Tracking CTA */}
        <Reveal delay={120} className="mt-6 flex items-center gap-4 rounded-[22px] border border-moss/15 bg-sagetint/60 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pine text-white">
            <IconQrScan size={19} />
          </span>
          <div className="flex-1">
            <h3 className="text-[14px] font-bold text-pine">{L.track}</h3>
            <p className="mt-0.5 text-[12px] font-medium text-ink2">{L.trackS}</p>
          </div>
          <IconChevron size={15} className="text-pine/40" />
        </Reveal>

        {/* Mini FAQ */}
        <Reveal className="mt-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">{L.faq}</p>
        </Reveal>
        <div className="mt-4 space-y-2.5">
          {L.fq.map((f, i) => (
            <Reveal key={i} delay={i * 60}>
              <div className="rounded-[18px] border border-ink/18 bg-card p-4 shadow-sm">
                <h3 className="text-[13px] font-bold text-ink">{f.q}</h3>
                <p className="mt-1 text-[12px] font-medium leading-snug text-ink2">{f.a}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   RETURNS SCREEN — guarantee, rules, steps
   ============================================================ */

const RETURNS_L: Record<Lang, {
  kicker: string;
  hero: string;
  heroS: string;
  numL: string;
  rules: string;
  rule: { t: string; d: string }[];
  why: string;
  ok: string[];
  not: string;
  nots: string[];
  steps: string;
  step: { t: string; d: string }[];
  cta: string;
  ctaS: string;
  daily: string;
}> = {
  uz: {
    kicker: "Qaytarish",
    hero: "14 kun — to'liq kafolat",
    heroS: "Agar biror narsa mos kelmasa, biz qaytaramiz",
    numL: "kun ichida qaytarishingiz mumkin",
    rules: "Qaytarish shartlari",
    rule: [
      { t: "Foydalanilmagan mahsulot", d: "Flakon to'liq, qadoq saqlangan" },
      { t: "14 kun ichida", d: "Yetkazib berilgan kundan boshlab" },
      { t: "Chek bilan", d: "Chek yoki batch-kod yetarli" },
    ],
    why: "Qaysi hollarda qaytarish mumkin",
    ok: ["Sifat muammosi", "Noto'g'ri mahsulot keldi", "Qadoq shikastlangan", "Fikringizni o'zgartirdingiz"],
    not: "Qaytarib bo'lmaydi",
    nots: ["Foydalanilgan mahsulot", "Cheksiz qaytarish", "30 kundan keyin"],
    steps: "Qanday qaytarish mumkin",
    step: [
      { t: "Ariza", d: "Profil → Buyurtmalar → «Qaytarish»" },
      { t: "Tekshiruv", d: "Menejer 24 soat ichida tasdiqlaydi" },
      { t: "Olib ketish", d: "Kuryer mahsulotni bepul olib ketadi" },
      { t: "To'lov", d: "Pul 1–3 kunda qaytadi" },
    ],
    cta: "Qo'llab-quvvatlashga yozish",
    daily: "har kuni",
    ctaS: `${CONFIG.SUPPORT_TG} · har kuni 9:00–21:00`,
  },
  ru: {
    kicker: "Возврат",
    hero: "14 дней — полная гарантия",
    heroS: "Если что-то не подошло — вернём",
    numL: "дней на возврат",
    rules: "Условия возврата",
    rule: [
      { t: "Неиспользованный товар", d: "Флакон полный, упаковка целая" },
      { t: "В течение 14 дней", d: "С момента доставки" },
      { t: "С чеком", d: "Достаточно чека или batch-кода" },
    ],
    why: "Когда можно вернуть",
    ok: ["Проблема с качеством", "Пришёл не тот товар", "Повреждена упаковка", "Передумали"],
    not: "Вернуть нельзя",
    nots: ["Использованный товар", "Без чека", "Позже 30 дней"],
    steps: "Как оформить возврат",
    step: [
      { t: "Заявка", d: "Профиль → Заказы → «Возврат»" },
      { t: "Проверка", d: "Менеджер подтверждает в течение 24 часов" },
      { t: "Забор", d: "Курьер бесплатно забирает товар" },
      { t: "Возврат", d: "Деньги приходят за 1–3 дня" },
    ],
    cta: "Написать в поддержку",
    daily: "ежедневно",
    ctaS: `${CONFIG.SUPPORT_TG} · ежедневно 9:00–21:00`,
  },
  en: {
    kicker: "Returns",
    hero: "14 days — full guarantee",
    heroS: "If something doesn't fit, we take it back",
    numL: "days to return",
    rules: "Return conditions",
    rule: [
      { t: "Unused product", d: "Bottle full, packaging intact" },
      { t: "Within 14 days", d: "From the delivery date" },
      { t: "With receipt", d: "Receipt or batch code is enough" },
    ],
    why: "When you can return",
    ok: ["Quality issue", "Wrong item delivered", "Damaged packaging", "Changed your mind"],
    not: "Cannot be returned",
    nots: ["Used products", "No receipt", "After 30 days"],
    steps: "How to return",
    step: [
      { t: "Request", d: "Profile → Orders → “Return”" },
      { t: "Check", d: "Manager confirms within 24 hours" },
      { t: "Pickup", d: "Courier picks it up for free" },
      { t: "Refund", d: "Money back in 1–3 days" },
    ],
    cta: "Contact support",
    daily: "daily",
    ctaS: `${CONFIG.SUPPORT_TG} · daily 9:00–21:00`,
  },
};

export function ReturnsScreen() {
  const { lang } = useI18n();
  const site = useSiteSettings();
  const L = RETURNS_L[lang];
  /* Динамическая подпись: имя менеджера (если задано) + редактируемые часы. */
  const ctaSub = `${site.managerName ? `${site.managerName} · ` : ""}${site.supportTg} · ${hoursFor(site, lang)}`;
  return (
    <section className="pb-4">
      <HeroSlider
        slides={[
          { img: "images/prod-wax.jpg", kicker: L.kicker, title: L.hero, sub: L.heroS },
          { img: "images/prod-shampoo.jpg", kicker: L.kicker, title: `${L.numL}`, sub: L.rule[1].d },
          { img: "images/cat-car.jpg", kicker: L.kicker, title: L.ok[3], sub: ctaSub },
        ]}
      />

      <div className="px-5 pt-6">
        {/* Big number */}
        <Reveal className="flex items-center gap-5 rounded-[24px] border border-ink/18 bg-card p-5 shadow-sm">
          <span className="font-display text-[56px] font-extrabold leading-none text-amber">14</span>
          <div>
            <h2 className="text-[15px] font-bold leading-snug text-ink">{L.hero}</h2>
            <p className="mt-1 text-[12px] font-medium text-ink2">{L.numL}</p>
          </div>
        </Reveal>

        {/* Rules */}
        <Reveal className="mt-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">{L.rules}</p>
        </Reveal>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {L.rule.map((r, i) => (
            <Reveal key={i} delay={i * 70} className="h-full">
              <div className="flex h-full flex-col rounded-[20px] border border-ink/18 bg-card p-3.5 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sagetint text-pine">
                  {i === 0 ? <IconBox size={16} /> : i === 1 ? <IconClock size={16} /> : <IconReceipt size={16} />}
                </span>
                <h3 className="mt-2.5 text-[12px] font-bold leading-tight text-ink">{r.t}</h3>
                <p className="mt-1 text-[11px] font-medium leading-snug text-ink2">{r.d}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* OK / NOT */}
        <Reveal className="mt-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">{L.why}</p>
        </Reveal>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {L.ok.map((o, i) => (
            <Reveal key={i} delay={i * 60} className="h-full">
              <div className="flex h-full items-center gap-2.5 rounded-[18px] border border-moss/15 bg-sagetint/60 p-3.5">
                <IconCheck size={15} strokeWidth={2.4} className="shrink-0 text-moss" />
                <span className="text-[12px] font-bold leading-tight text-pine">{o}</span>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-ink/65">{L.not}</p>
        </Reveal>
        <div className="mt-3 flex flex-wrap gap-2">
          {L.nots.map((n, i) => (
            <span key={i} className="rounded-full border border-ink/15 bg-card px-3 py-1.5 text-[11px] font-bold text-ink/70">
              {n}
            </span>
          ))}
        </div>

        {/* Steps */}
        <Reveal className="mt-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">{L.steps}</p>
        </Reveal>
        <div className="mt-4 space-y-3">
          {L.step.map((s, i) => (
            <Reveal key={i} delay={i * 70}>
              <div className="flex gap-3.5 rounded-[22px] border border-ink/18 bg-card p-4 shadow-sm">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amberdeep">
                  <IconRefresh size={19} />
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber text-[10px] font-extrabold text-white">
                    {i + 1}
                  </span>
                </span>
                <div>
                  <h3 className="text-[14px] font-bold text-ink">{s.t}</h3>
                  <p className="mt-1 text-[13px] font-medium leading-snug text-ink2">{s.d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* CTA */}
        <Reveal delay={120} className="mt-6">
          <a
            href={tgHref(site.supportTg)}
            target="_blank"
            rel="noreferrer"
            onClick={() => haptic("medium")}
            className="press flex items-center justify-center gap-2 rounded-[18px] bg-amber py-4 text-[14px] font-bold text-white hover:opacity-90"
          >
            <IconSend size={16} />
            {L.cta}
          </a>
          <p className="mt-2.5 text-center text-[12px] font-medium text-ink/70">{ctaSub}</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ============================================================
   BLOG SCREEN
   ============================================================ */

export function BlogScreen({ onOpen }: { onOpen: () => void }) {
  const { t, lang } = useI18n();
  /* Статьи/видео добавляются из админки («Контент» → «Советы»);
     демо-картинки удалены. Пока нет контента — аккуратная заглушка. */
  const tips = useManagedContent().tips;
  return (
    <section className="px-4 pt-2 pb-4 min-[390px]:px-5">
      <Reveal>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-moss">{t("newsSub")}</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-tight text-ink">{t("blogTitle")}</h1>
      </Reveal>

      <div className="mt-6 space-y-3">
        {tips.length === 0 && (
          <div className="rounded-[22px] border border-dashed border-ink/20 bg-card p-6 text-center">
            <IconSparkle size={22} className="mx-auto text-pine/60" />
            <p className="mt-2 text-[13px] font-semibold leading-snug text-ink2">
              {lang === "ru"
                ? "Скоро здесь появятся полезные статьи и видео об уходе за домом и авто."
                : lang === "en"
                  ? "Helpful articles and videos about home and car care are coming soon."
                  : "Tez orada uy va avto parvarishi haqidagi foydali maqolalar va videolar paydo bo'ladi."}
            </p>
          </div>
        )}

        {tips.map((a, i) => (
          <button
            key={a.id}
            onClick={() => { haptic("light"); onOpen(); }}
            className="press flex w-full gap-3 overflow-hidden rounded-[22px] border border-ink/18 bg-card text-left shadow-sm"
            style={{ animation: `pop 0.5s ${i * 60}ms cubic-bezier(0.34,1.56,0.64,1) both` }}
          >
            <div className="relative h-[96px] w-[96px] shrink-0 overflow-hidden bg-sagetint">
              <ProductImage src={a.image} className="h-full w-full object-cover" />
              {a.kind === "video" && (
                <span className="absolute inset-0 flex items-center justify-center bg-pinedeep/30">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-paper/90 text-ink">
                    <IconPlay size={18} />
                  </span>
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col justify-center pr-3">
              <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] ${a.kind === "video" ? "bg-amber text-white" : "border border-ink/18 text-ink/75"}`}>
                {a.kind === "video" ? t("tagVideo") : t("tagArticle")}
              </span>
              <h3 className="mt-1.5 text-[14px] font-bold leading-snug text-ink">{a.title[lang]}</h3>
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-ink/70">
                <IconClock size={11} /> {a.mins} {t("blogMin")} · {a.steps.length} {t("tipSteps")}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   PULL-TO-REFRESH INDICATOR
   ============================================================ */

export function PullToRefreshIndicator({ pulling, refreshing }: { pulling: number; refreshing: boolean }) {
  if (pulling <= 0 && !refreshing) return null;
  const pct = Math.min(100, (pulling / 75) * 100);
  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[45] -translate-x-1/2"
      style={{ top: `calc(env(safe-area-inset-top, 0px) + 54px)` }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-lift"
        style={{ transform: `scale(${0.6 + (pct / 100) * 0.4})` }}
      >
        {refreshing ? (
          <span className="ptr-spinner h-5 w-5 rounded-full border-2 border-ink/15 border-t-moss" />
        ) : (
          <IconSparkle size={18} className={pct >= 100 ? "text-moss" : "text-ink/65"} />
        )}
      </div>
    </div>
  );
}

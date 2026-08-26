/**
 * DELIS — Средние секции главной страницы: витрина избранного, блок «Почему мы», акции и промо.
 */
import { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n";
import { PRODUCTS, type Cat, type Product } from "./data";
import { formatPrice, haptic, MaskLine as MaskLineWrap, Reveal } from "./kit";
import { IconCheck, IconFire, IconGift, IconHeart, IconPlus, IconStar } from "./icons";
import { SectionHead } from "./chrome";
import { useManagedContent } from "./content-config";

/* ---------------- Add-to-cart button ---------------- */

function AddButton({
  onAdd,
  withLabel = false,
  labels,
}: {
  onAdd: () => void;
  withLabel?: boolean;
  labels: [string, string];
}) {
  const [added, setAdded] = useState(false);
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const click = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic("success");
    onAdd();
    setAdded(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAdded(false), 1300);
  };

  if (withLabel) {
    return (
      <button
        onClick={click}
        className={`press flex h-12 items-center gap-2.5 rounded-full pl-5 pr-2 text-[13px] font-bold transition-colors duration-300 ${
          added ? "bg-moss text-white" : "bg-amber text-white hover:brightness-105"
        }`}
      >
        {added ? labels[1] : labels[0]}
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-300 ${
            added ? "bg-paper/20 text-white" : "bg-pinedeep text-amber"
          }`}
        >
          {added ? <IconCheck size={15} /> : <IconPlus size={16} />}
        </span>
      </button>
    );
  }
  return (
    <button
      onClick={click}
      aria-label={labels[0]}
      className={`press flex h-11 w-11 items-center justify-center rounded-full shadow-soft transition-colors duration-300 ${
        added ? "bg-moss text-white" : "bg-amber text-white hover:bg-pine"
      }`}
    >
      {added ? <IconCheck size={17} /> : <IconPlus size={18} />}
    </button>
  );
}

/* ---------------- 4 · Featured ---------------- */

export type Filter = "all" | Cat | "wishlist";

export function Featured({
  filter,
  setFilter,
  onAdd,
  onOpen,
  favorites = [],
  onToggleFavorite,
  products = PRODUCTS,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  onAdd: (p: Product) => void;
  onOpen?: (p: Product) => void;
  favorites?: string[];
  onToggleFavorite?: (id: string) => void;
  /** Server-synced catalog (prices/stock/soldToday); PRODUCTS is the offline fallback */
  products?: Product[];
}) {
  const { t, lang } = useI18n();
  const signature = products.find((p) => p.signature) || products[0] || PRODUCTS[0];
  if (!signature) return null;
  const row = products.filter((p) => {
    if (p.signature) return false;
    if (filter === "wishlist") return favorites.includes(p.id);
    if (filter === "all") return true;
    return p.cat === filter;
  });
  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: t("filterAll") },
    { id: "home", label: t("filterHome") },
    { id: "car", label: t("filterCar") },
  ];

  return (
    <section id="featured" className="scroll-mt-16 pt-12">
      <div className="px-4 min-[390px]:px-5">
        <SectionHead
          title={t("featuredTitle")}
          sub={t("featuredSub")}
          right={
            <div className="flex gap-1.5 pb-1">
              {chips.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    haptic("light");
                    setFilter(c.id);
                  }}
                  className={`press rounded-full px-3.5 py-2 text-[12px] font-bold transition-colors duration-300 ${
                    filter === c.id
                      ? "bg-amber text-white"
                      : "border border-ink/18 text-ink/75 hover:border-ink/30 hover:text-ink"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          }
        />
      </div>

      <div className="mt-6 px-5">
        {filter !== "home" && (
          <Reveal>
            <div
              onClick={() => onOpen?.(signature)}
              className="relative h-[296px] cursor-pointer overflow-hidden rounded-[28px] bg-graphite shadow-soft"
            >
              <div className="absolute inset-y-0 right-0 w-[54%]">
                <img src={signature.img} alt={signature.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-graphite via-graphite/35 to-transparent" />
              </div>
              <div className="relative flex h-full flex-col justify-between p-6">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-amber px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-white">
                      {t("badgeSignature")}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        haptic("medium");
                        onToggleFavorite?.(signature.id);
                      }}
                      className={`press flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md transition-all ${
                        favorites.includes(signature.id) ? "bg-[#E11D48] text-white" : "bg-paper/20 text-white hover:bg-paper/30"
                      }`}
                      aria-label="Favorite"
                    >
                      <IconHeart size={14} filled={favorites.includes(signature.id)} />
                    </button>
                  </div>
                  <h3 className="mt-5 font-display text-[22px] font-bold tracking-tight text-white">
                    {signature.name}
                  </h3>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
                      {signature.spec[lang]}
                    </p>
                    <span className="flex items-center gap-1 text-[11px] font-bold text-amber">
                      <IconStar size={11} className="text-amber" />
                      {signature.rating}
                    </span>
                  </div>
                  <p className="mt-3 max-w-[190px] text-[13px] font-medium leading-snug text-white/80">
                    {signature.desc[lang]}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-[18px] font-bold text-amber">
                    {formatPrice(signature.price, lang)}
                  </span>
                  <AddButton withLabel onAdd={() => onAdd(signature)} labels={[t("navCart") + " +", t("added")]} />
                </div>
              </div>
            </div>
          </Reveal>
        )}
      </div>

      <div key={filter} className="no-scrollbar mt-4 flex gap-4 overflow-x-auto px-4 pb-1 min-[390px]:px-5 snap-x-m">
        {row.map((p, i) => (
          <article
            key={p.id}
            onClick={() => onOpen?.(p)}
            className="motion-surface animate-ios-pop press group w-[248px] min-w-[248px] snap-item cursor-pointer overflow-hidden rounded-[26px] border border-ink/6 bg-card shadow-soft"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div
              className={`relative h-[206px] overflow-hidden ${p.cat === "home" ? "bg-sagetint" : "bg-graphite2"}`}
            >
              <img
                src={p.img}
                alt={p.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05] group-active:scale-[1.05]"
              />
              <div className="absolute inset-x-3.5 top-3.5 flex items-start justify-between">
                {p.badge ? (
                  <span
                    className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] ${
                      p.badge === "new" ? "bg-moss text-white" : "bg-amber text-white"
                    }`}
                  >
                    {p.badge === "new" ? t("badgeNew") : t("badgeBest")}
                  </span>
                ) : <span />}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    haptic("medium");
                    onToggleFavorite?.(p.id);
                  }}
                  className={`press flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md shadow-sm transition-all ${
                    favorites.includes(p.id) ? "bg-[#E11D48] text-white" : "bg-paper/80 text-ink/60 hover:bg-paper"
                  }`}
                  aria-label="Favorite"
                >
                  <IconHeart size={14} filled={favorites.includes(p.id)} />
                </button>
              </div>

              <div className="absolute bottom-3.5 right-3.5">
                <AddButton onAdd={() => onAdd(p)} labels={[t("navCart"), t("added")]} />
              </div>

              {/* Social proof from the server order log */}
              {p.soldToday != null && p.soldToday > 0 && (
                <span className="absolute bottom-3.5 left-3.5 rounded-full bg-card/90 px-2.5 py-1 text-[10px] font-extrabold text-moss shadow-sm backdrop-blur-sm">
                  <span className="inline-flex items-center gap-1"><IconFire size={11} /> {p.soldToday} {lang === "ru" ? "сегодня" : lang === "en" ? "today" : "bugun"}</span>
                </span>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-[15px] font-bold tracking-tight text-ink">{p.name}</h3>
                <div className="flex items-center gap-1 text-[11px] font-bold text-amberdeep">
                  <IconStar size={11} className="text-amber" />
                  <span>{p.rating}</span>
                </div>
              </div>
              <p className="mt-1.5 text-[13px] font-medium leading-snug text-ink2">{p.desc[lang]}</p>
              <div className="mt-4 flex items-center justify-between">
                <p className="font-display text-[15px] font-bold text-ink">{formatPrice(p.price, lang)}</p>
                <span className="text-[11px] font-bold text-ink/65">{p.spec[lang]}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------------- 5 · Why DELIS ---------------- */

export function Why() {
  const { lang } = useI18n();
  const content = useManagedContent();
  const [slide, setSlide] = useState(0);
  const enabled = content.why.slides.filter((item) => item.active);
  const slides = enabled.length ? enabled : content.why.slides.slice(0, 1);

  useEffect(() => {
    if (slide >= slides.length) setSlide(0);
  }, [slide, slides.length]);

  const go = (dir: 1 | -1) => {
    haptic("light");
    setSlide((s) => (s + dir + slides.length) % slides.length);
  };

  return (
    <section className="relative mt-12 overflow-hidden bg-paper2 text-ink">
      <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-sage/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-56 w-56 rounded-full bg-moss/10 blur-3xl" />

      <div className="relative px-4 pb-12 pt-12 min-[390px]:px-5">
        <Reveal>
          <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-amber">
            <IconSparkleDot />
            {content.why.kicker[lang]}
          </p>
        </Reveal>
        <h2 className="mt-4 max-w-[90%] font-display text-[34px] font-bold leading-[1.05] tracking-tight text-ink">
          <MaskLineWrap>{content.why.title[lang]}</MaskLineWrap>
        </h2>
        <Reveal delay={80}>
          <p className="mt-3 max-w-[330px] text-[14px] font-medium leading-relaxed text-ink/60">
            {content.why.intro[lang]}
          </p>
        </Reveal>

        {/* Slider */}
        <Reveal delay={120} className="mt-8">
            <div className="relative h-[390px] overflow-hidden rounded-[30px] border border-ink/10 bg-pine shadow-lift">
            {/* Slides */}
            {slides.map((slideData, i) => (
              <div
                key={slideData.id}
                className={`absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  i === slide ? "opacity-100 translate-x-0" : i < slide ? "opacity-0 -translate-x-10" : "opacity-0 translate-x-10"
                }`}
              >
                <img src={slideData.image} alt="" className="animate-kenburns-slow h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#30253e] via-[#30253e]/35 to-transparent" />

                {/* Badge */}
                <span className="absolute left-5 top-5 rounded-full bg-[#c3c88c] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#30253e] shadow-sm">
                  {slideData.badge[lang]}
                </span>

                {/* Content */}
                <div className="absolute inset-x-5 bottom-5">
                  <div className="flex items-end gap-2 text-[11px] font-bold uppercase tracking-wider text-white/70">
                    <span className="font-display text-[30px] font-extrabold text-[#c3c88c]">{slideData.stat}</span>
                    <span className="pb-1.5">{slideData.statLabel[lang]}</span>
                  </div>
                  <h3 className="mt-2 font-display text-[24px] font-bold leading-tight tracking-tight text-white">
                    {slideData.title[lang]}
                  </h3>
                  <p className="mt-2 max-w-[280px] text-[14px] font-medium leading-snug text-white/75">
                    {slideData.text[lang]}
                  </p>
                </div>
              </div>
            ))}

            {/* Arrows */}
            <button onClick={() => go(-1)} aria-label="Previous" className="press absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-[#30253e]/70 text-white backdrop-blur-md transition-colors hover:bg-[#638872]">
              ‹
            </button>
            <button onClick={() => go(1)} aria-label="Next" className="press absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-[#30253e]/70 text-white backdrop-blur-md transition-colors hover:bg-[#638872]">
              ›
            </button>

            {/* Dots */}
            <div className="absolute bottom-3 right-4 flex gap-1.5">
              {slides.map((_, i) => (
                <span key={i} className={`h-1 rounded-full transition-all duration-500 ${i === slide ? "w-6 bg-[#c3c88c]" : "w-1.5 bg-white/25"}`} />
              ))}
            </div>
          </div>
        </Reveal>

        {/* Stats below */}
        <div className="mt-8 grid grid-cols-4 gap-2">
          {slides.map((sd, i) => (
            <button key={i} onClick={() => { haptic("light"); setSlide(i); }} className={`press rounded-[16px] border p-3 text-center transition-all ${i === slide ? "border-moss/40 bg-moss/12" : "border-ink/10 bg-card"}`}>
              <p className="font-display text-[18px] font-extrabold text-moss">{sd.stat}</p>
              <p className="mt-1 text-[9px] font-bold uppercase leading-tight tracking-wide text-ink/50">{sd.statLabel[lang]}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function IconSparkleDot() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.5c.8 5.2 4.3 8.7 9.5 9.5-5.2.8-8.7 4.3-9.5 9.5-.8-5.2-4.3-8.7-9.5-9.5 5.2-.8 8.7-4.3 9.5-9.5Z" />
    </svg>
  );
}

/* ---------------- 6 · Promotions ---------------- */

export function Promos({ onToast }: { onToast: (m: string) => void }) {
  const { t } = useI18n();
  const copy = async () => {
    haptic("medium");
    try {
      await navigator.clipboard.writeText("DELIS15");
      onToast(t("copied"));
    } catch {
      onToast(t("copyFailed"));
    }
  };

  return (
    <section className="px-4 pt-12 min-[390px]:px-5">
      <SectionHead title={t("promoTitle")} sub={t("promoSub")} />
      <div className="mt-6 space-y-4">
        <Reveal>
          <div className="press relative overflow-hidden rounded-[28px] bg-[#0c1411] p-5 min-[390px]:p-6 text-white shadow-soft dark:bg-[#182128]">
            <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-amber">{t("promo1tag")}</p>
            <h3 className="mt-3 max-w-[290px] font-display text-[18px] font-bold leading-snug tracking-tight text-white">
              {t("promo1title")}
            </h3>
            <div className="mt-6 flex items-center gap-3">
              <span className="flex-1 rounded-[18px] border border-dashed border-white/30 px-4 py-3 text-center font-display text-[15px] font-bold tracking-[0.2em] text-white">
                DELIS15
              </span>
              <button
                onClick={copy}
                className="press rounded-[18px] bg-white px-4 py-3 text-[12px] font-bold text-[#0c1411] hover:bg-amber hover:text-white"
              >
                {t("promo1cta")}
              </button>
            </div>
            <p className="mt-3 text-[11px] font-semibold text-white/60">{t("promo1note")}</p>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="press flex gap-4 rounded-[28px] border border-moss/15 bg-sagetint p-5 min-[390px]:p-6">
            <span className="animate-float-ring flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-card text-moss shadow-soft">
              <IconGift size={21} />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">{t("promo2tag")}</p>
              <h3 className="mt-1.5 text-[15px] font-bold leading-snug text-ink">{t("promo2title")}</h3>
              <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink/75">
                <IconCheck size={13} className="text-moss" />
                {t("promo2note")}
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

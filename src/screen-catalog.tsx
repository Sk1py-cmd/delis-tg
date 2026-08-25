/**
 * DELIS — Экран каталога: сетка товаров, фильтры (все / категория / избранное) и сортировка (цена, новизна, рейтинг).
 */
import { useMemo, useState, type ChangeEvent } from "react";
import { useI18n } from "./i18n";
import { PRODUCTS, type Cat, type Product } from "./data";
import { formatPrice, haptic, Reveal } from "./kit";
import { IconBag, IconCheck, IconChevron, IconClose, IconFire, IconHeart, IconSearch, IconSparkle, IconStar, IconSymbol } from "./icons";

export type Filter = "all" | Cat | "wishlist";
export type Sort = "default" | "priceAsc" | "priceDesc" | "new" | "best" | "rating";

const sortMap: Record<Sort, "sortDefault" | "sortPriceAsc" | "sortPriceDesc" | "sortNew" | "sortRating"> = {
  default: "sortDefault",
  priceAsc: "sortPriceAsc",
  priceDesc: "sortPriceDesc",
  new: "sortNew",
  best: "sortRating",
  rating: "sortRating",
};

/* ─────────── PRODUCT CARD ─────────── */
function ProductCard({
  p,
  i,
  inCart,
  isFavorite,
  onAdd,
  onOpen,
  onToggleFavorite,
}: {
  p: Product;
  i: number;
  inCart: boolean;
  isFavorite: boolean;
  onAdd: (p: Product) => void;
  onOpen: (p: Product) => void;
  onToggleFavorite?: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  const [added, setAdded] = useState(false);

  const clickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic("success");
    onAdd(p);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  };

  const out = !p.stock || p.stock <= 0;

  return (
    <article
      onClick={() => {
        haptic("light");
        onOpen(p);
      }}
      className="motion-surface press group cursor-pointer overflow-hidden rounded-[24px] border border-ink/6 bg-card shadow-soft"
      style={{ animation: `ios-pop 0.4s ${i * 45}ms cubic-bezier(0.22,1,0.36,1) both` }}
    >
      {/* Image */}
      <div className={`relative aspect-square overflow-hidden ${p.cat === "home" ? "bg-sagetint" : "bg-graphite2"}`}>
        <img
          src={p.img}
          alt={p.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
        />

        {/* Badge */}
        {p.badge && (
          <span className={`animate-pulse-soft absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.14em] shadow-sm ${
            p.badge === "new" ? "bg-moss text-white" : "bg-amber text-white"
          }`}>
            {p.badge === "new" ? t("badgeNew") : t("badgeBest")}
          </span>
        )}

        {/* Favorite */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            haptic("medium");
            onToggleFavorite?.(p.id);
          }}
          aria-label="Favorite"
          className={`press absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full shadow-sm backdrop-blur-md transition-all ${
            isFavorite ? "animate-heartbeat bg-[#E11D48] text-white" : "bg-white/85 text-[#0c1411]/60 hover:text-[#E11D48]"
          }`}
        >
          <IconHeart size={13} filled={isFavorite} />
        </button>

        {/* Low stock */}
        {!out && p.stock !== undefined && p.stock <= 10 && (
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-amber/70 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
            {lang === "uz" ? `Kam: ${p.stock}` : lang === "ru" ? `Мало: ${p.stock}` : `Low: ${p.stock}`}
          </span>
        )}

        {/* Out of stock */}
        {out && (
          <div className="absolute inset-0 flex items-center justify-center bg-paper/60 backdrop-blur-[2px]">
            <span className="rounded-full bg-amber px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white">
              {lang === "uz" ? "Tugagan" : lang === "ru" ? "Нет в наличии" : "Out of stock"}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        <h3 className="truncate font-display text-[14px] font-bold leading-snug tracking-tight text-ink">{p.name}</h3>

        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold">
          <span className="text-ink/65">{p.volume}</span>
          <span className="text-ink/15">·</span>
          <span className="flex items-center gap-0.5 text-amberdeep">
            <IconStar size={9} className="text-amber" /> {p.rating}
          </span>
          {p.soldToday != null && p.soldToday > 0 && (
            <>
              <span className="text-ink/15">·</span>
              <span className="flex items-center gap-0.5 text-moss"><IconFire size={11} /> {p.soldToday} {lang === "ru" ? "сегодня" : lang === "en" ? "today" : "bugun"}</span>
            </>
          )}
        </div>

        {/* Price + add */}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-[15px] font-bold tracking-tight text-ink">{formatPrice(p.price, lang)}</p>
            <p className="mt-0.5 text-[10px] font-bold text-amberdeep">{t("wholesaleSave")} −12%</p>
          </div>
          <button
            onClick={clickAdd}
            disabled={out}
            aria-label={t("navCart")}
            className={`press flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
              added
                ? "bg-moss text-white"
                : inCart
                  ? "bg-moss/12 text-moss ring-1 ring-moss/30"
                  : out
                    ? "bg-amber/5 text-ink/25"
                    : "bg-amber text-white shadow-soft hover:bg-pine"
            }`}
          >
            {added ? <IconCheck size={16} strokeWidth={2.7} /> : <IconBag size={15} />}
          </button>
        </div>
      </div>
    </article>
  );
}

/* ─────────── CATEGORY TAB CHIP ─────────── */
function CategoryChip({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`press flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2.5 text-[12px] font-bold transition-all ${
        active
          ? "bg-amber text-white shadow-lift border-ink"
          : "bg-card/80 text-ink/60 border-ink/15 hover:border-ink/25"
      }`}
    >
      <IconSymbol symbol={icon} size={17} filled={active} />
      <span>{label}</span>
      <span className={`rounded-full px-1.5 text-[10px] font-extrabold ${active ? "bg-paper/20" : "bg-amber/8"}`}>
        {count}
      </span>
    </button>
  );
}

/* ─────────── CATALOG SCREEN ─────────── */
export function CatalogScreen({
  filter,
  setFilter,
  cart,
  favorites = [],
  onAdd,
  onOpen,
  onToggleFavorite,
  products = PRODUCTS,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  cart: Record<string, number>;
  favorites?: string[];
  onAdd: (p: Product) => void;
  onOpen: (p: Product) => void;
  onToggleFavorite?: (id: string) => void;
  products?: Product[];
}) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("default");
  const [sortOpen, setSortOpen] = useState(false);
  const [gridCols, setGridCols] = useState<2 | 3>(2);
  const [subFilter, setSubFilter] = useState("all");

  /* Practical shelf sections: they make the two broad catalog areas easier to browse. */
  const subGroups = filter === "home"
    ? [
        { id: "all", label: lang === "ru" ? "Всё для дома" : lang === "en" ? "All home" : "Uy uchun hammasi", ids: [] as string[] },
        { id: "laundry", label: lang === "ru" ? "Стирка и пол" : lang === "en" ? "Laundry & floor" : "Kir va pol", ids: ["cloud", "floor"] },
        { id: "kitchen", label: lang === "ru" ? "Кухня и стекло" : lang === "en" ? "Kitchen & glass" : "Oshxona va oyna", ids: ["kitchen", "glass"] },
      ]
    : filter === "car"
      ? [
          { id: "all", label: lang === "ru" ? "Всё для авто" : lang === "en" ? "All auto" : "Avto uchun hammasi", ids: [] as string[] },
          { id: "body", label: lang === "ru" ? "Кузов" : lang === "en" ? "Body" : "Kuzov", ids: ["wax", "shampoo"] },
          { id: "interior", label: lang === "ru" ? "Салон и колёса" : lang === "en" ? "Interior & wheels" : "Salon va g‘ildirak", ids: ["interior", "wheel"] },
        ]
      : [];

  /* Category tabs with icons */
  const chips: { id: Filter; label: string; count: number; icon: string }[] = [
    { id: "all", label: t("filterAll"), count: products.length, icon: "✨" },
    { id: "home", label: t("filterHome"), count: products.filter((p) => p.cat === "home").length, icon: "🏠" },
    { id: "car", label: t("filterCar"), count: products.filter((p) => p.cat === "car").length, icon: "🚗" },
    { id: "wishlist", label: t("filterWishlist"), count: favorites.length, icon: "❤️" },
  ];

  /* Filtered products */
  const sorted = useMemo(() => {
    let list = products.filter((p) => {
      if (filter === "wishlist") return favorites.includes(p.id);
      if (filter === "all") return true;
      return p.cat === filter;
    });

    const activeSubGroup = subGroups.find((group) => group.id === subFilter);
    if (activeSubGroup?.ids.length) list = list.filter((p) => activeSubGroup.ids.includes(p.id));

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.desc[lang].toLowerCase().includes(q) ||
          p.spec[lang].toLowerCase().includes(q),
      );
    }

    if (sort === "priceAsc") list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === "priceDesc") list = [...list].sort((a, b) => b.price - a.price);
    else if (sort === "new") list = [...list].sort((a, b) => (b.badge === "new" ? 1 : 0) - (a.badge === "new" ? 1 : 0));
    else if (sort === "best") list = [...list].sort((a, b) => (b.badge === "best" ? 1 : 0) - (a.badge === "best" ? 1 : 0));
    else if (sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);

    return list;
  }, [filter, favorites, query, sort, lang, products, subFilter, subGroups]);

  const resetAll = () => {
    setFilter("all");
    setQuery("");
    setSort("default");
  };

  return (
    <section className="relative">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-paper/85 px-4 pt-3 pb-2 backdrop-blur-xl border-b border-ink/5">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <Reveal>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-moss">
                {t("catalogSub")}
              </p>
              <h1 className="mt-0.5 font-display text-[28px] font-bold leading-none tracking-tight text-ink">
                {filter === "wishlist" ? t("wishlistTitle") : t("catalogTitle")}
              </h1>
            </div>
          </Reveal>
          <button
            onClick={() => { haptic("light"); setGridCols(gridCols === 2 ? 3 : 2); }}
            className="press flex h-9 items-center gap-1.5 rounded-full border border-ink/15 bg-card px-3 text-[11px] font-bold text-ink/70"
          >
            <span className={`inline-block h-3 w-3 rounded-[2px] border ${gridCols === 2 ? "border-ink bg-amber" : "border-ink/40"}`} />
            <span className={`inline-block h-3 w-3 rounded-[2px] border ${gridCols === 3 ? "border-ink bg-amber" : "border-ink/40"}`} />
          </button>
        </div>

        {/* Search */}
        <Reveal delay={80} className="mt-3">
          <label className="flex items-center gap-3 rounded-[18px] border border-ink/18 bg-card px-4 py-3 shadow-sm">
            <IconSearch size={17} className="text-ink/65 shrink-0" />
            <input
              value={query}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              placeholder={t("searchPh")}
              className="flex-1 bg-transparent text-[14px] font-semibold text-ink placeholder:text-ink/60 outline-none"
            />
            {query && (
              <button
                onClick={() => { haptic("light"); setQuery(""); }}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-amber/8 text-ink/70"
                aria-label="Clear"
              >
                <IconClose size={12} />
              </button>
            )}
          </label>
        </Reveal>

        {/* Category chips */}
        <Reveal delay={120} className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {chips.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.label}
              count={c.count}
              icon={c.icon}
              active={filter === c.id}
              onClick={() => {
                haptic("light");
                setFilter(c.id);
                setSubFilter("all");
              }}
            />
          ))}
        </Reveal>

        {subGroups.length > 0 && (
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
            {subGroups.map((group) => {
              const active = subFilter === group.id;
              return (
                <button
                  key={group.id}
                  onClick={() => { haptic("light"); setSubFilter(group.id); }}
                  className={`press shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    active ? "border-moss bg-moss text-white" : "border-ink/15 bg-card/75 text-ink/65"
                  }`}
                >
                  {group.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="px-4 pb-4 pt-4">
        {/* Sort row */}
        <Reveal delay={160} className="flex items-center justify-between gap-3">
          <p className="text-[12px] font-semibold text-ink/70">
            {sorted.length} {lang === "uz" ? t("products").toLowerCase() : lang === "ru" ? t("products").toLowerCase() : t("products").toLowerCase()}
          </p>

          <div className="relative">
            <button
              onClick={() => { haptic("light"); setSortOpen((s) => !s); }}
              className="press flex items-center gap-1.5 rounded-full border border-ink/15 bg-card px-3 py-2 text-[11px] font-bold text-ink/70 shadow-sm"
            >
              {t(sortMap[sort])}
              <IconChevron size={11} className="rotate-90" />
            </button>

            {sortOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setSortOpen(false)} />
                <div className="animate-pop absolute right-0 top-[calc(100%+6px)] z-30 w-[170px] overflow-hidden rounded-[16px] border border-ink/18 bg-card p-1.5 shadow-lift">
                  {(["default", "priceAsc", "priceDesc", "new", "best", "rating"] as Sort[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        haptic("light");
                        setSort(s);
                        setSortOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-[11px] font-semibold transition-colors ${
                        s === sort ? "bg-amber text-white" : "text-ink/70 hover:bg-amber/5"
                      }`}
                    >
                      {t(sortMap[s])}
                      {s === sort && <IconSparkle size={9} className="text-amber" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </Reveal>

        {/* Product grid */}
        {sorted.length === 0 ? (
          <Reveal className="mt-10 rounded-[24px] border border-dashed border-ink/15 bg-card/60 px-6 py-12 text-center">
            <div className="mx-auto flex h-[60px] w-[60px] items-center justify-center rounded-full bg-sagetint text-moss">
              {filter === "wishlist" ? <IconHeart size={26} filled /> : <IconSearch size={26} />}
            </div>
            <p className="mt-4 font-display text-[16px] font-bold text-ink">
              {filter === "wishlist" ? t("wishlistEmpty") : filter === "all" ? t("emptyRes") : t("emptyRes")}
            </p>
            <p className="mt-1.5 text-[13px] font-medium text-ink/70">
              {filter === "wishlist" ? t("wishlistEmptySub") : t("emptyResSub")}
            </p>
            <button
              onClick={resetAll}
              className="press mt-5 rounded-full bg-amber px-5 py-2.5 text-[13px] font-bold text-white shadow-soft"
            >
              {t("resetFilters")}
            </button>
          </Reveal>
        ) : (
          <div className={`mt-4 grid gap-3 ${gridCols === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {sorted.map((p, i) => (
              <ProductCard
                key={p.id}
                p={p}
                i={i}
                inCart={(cart[p.id] ?? 0) > 0}
                isFavorite={favorites.includes(p.id)}
                onAdd={onAdd}
                onOpen={onOpen}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

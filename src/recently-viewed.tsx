/**
 * DELIS — Блок «недавно просмотренные» — история просмотра товаров.
 */
import { useI18n } from "./i18n";
import { PRODUCTS, type Product } from "./data";
import { formatPrice, haptic, Reveal } from "./kit";
import { IconBag, IconClock } from "./icons";

/**
 * Recently viewed products — replaces the daily bonus with something
 * genuinely useful: a one-tap way back to what the customer was considering.
 */
export function RecentlyViewed({
  ids,
  cart,
  onOpen,
  onAdd,
  onClear,
}: {
  ids: string[];
  cart: Record<string, number>;
  onOpen: (p: Product) => void;
  onAdd: (p: Product) => void;
  onClear: () => void;
}) {
  const { t, lang } = useI18n();

  const items = ids
    .map((id) => PRODUCTS.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p));

  if (items.length < 2) return null;

  return (
    <section className="pt-10">
      <div className="flex items-end justify-between px-4 min-[390px]:px-5">
        <Reveal>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper2 text-ink/70">
              <IconClock size={14} />
            </span>
            <h2 className="font-display text-[19px] font-bold tracking-tight text-ink">
              {t("recentlyViewed")}
            </h2>
          </div>
        </Reveal>
        <button
          onClick={() => {
            haptic("light");
            onClear();
          }}
          className="press text-[11.5px] font-bold text-ink/65"
        >
          {t("clearHistory")}
        </button>
      </div>

      <div className="no-scrollbar mt-4 flex snap-x-m gap-3 overflow-x-auto px-4 pb-1 min-[390px]:px-5">
        {items.map((p, i) => {
          const inCart = (cart[p.id] ?? 0) > 0;
          return (
            <Reveal key={p.id} delay={i * 60} className="snap-item">
              <div
                onClick={() => {
                  haptic("light");
                  onOpen(p);
                }}
                className="press w-[142px] cursor-pointer overflow-hidden rounded-[20px] border border-ink/6 bg-card shadow-sm"
              >
                <div className={`relative h-[112px] ${p.cat === "home" ? "bg-sagetint" : "bg-graphite2"}`}>
                  <img src={p.img} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      haptic("success");
                      onAdd(p);
                    }}
                    className={`press absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-colors ${
                      inCart ? "bg-moss text-white" : "bg-paper text-ink"
                    }`}
                    aria-label={t("addToCartLong")}
                  >
                    <IconBag size={14} />
                  </button>
                </div>
                <div className="p-3">
                  <p className="truncate font-display text-[12.5px] font-bold text-ink">{p.name}</p>
                  <p className="mt-1 font-display text-[12.5px] font-bold text-ink/70">
                    {formatPrice(p.price, lang)}
                  </p>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

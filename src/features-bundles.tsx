/**
 * DELIS — Наборы товаров (бандлы): их отображение и добавление в корзину целиком.
 */
import { useState } from "react";
import { useI18n } from "./i18n";
import { BUNDLES, PRODUCTS, bundlePricing, type Bundle } from "./data";
import { formatPrice, haptic, Reveal } from "./kit";
import { IconBag, IconCheck, IconGift } from "./icons";

/* ============================================================
   BUNDLES / SETS WITH DISCOUNT — boost average order value
   ============================================================ */

export function BundleSection({
  onAddBundle,
  onOpenProduct,
}: {
  onAddBundle: (bundle: Bundle) => void;
  onOpenProduct: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const handleAdd = (bundle: Bundle) => {
    haptic("success");
    onAddBundle(bundle);
    setAddedIds((prev) => new Set(prev).add(bundle.id));
    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(bundle.id);
        return next;
      });
    }, 1400);
  };

  if (BUNDLES.length === 0) return null;

  return (
    <section className="px-4 pt-12 min-[390px]:px-5">
      <Reveal>
        <div className="flex items-end justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-moss">
              <IconGift size={14} /> {t("featuredTitle")} · To'plamlar
            </p>
            <p className="mt-1 text-[12px] font-medium text-ink2">
              Birgalikda olsangiz — ko'proq tejaysiz
            </p>
          </div>
        </div>
      </Reveal>

      <div className="mt-4 space-y-3">
        {BUNDLES.map((bundle, idx) => {
          const { retail, bundleTotal, saved } = bundlePricing(bundle);
          const added = addedIds.has(bundle.id);
          const items = bundle.items
            .map((it) => PRODUCTS.find((p) => p.id === it.productId))
            .filter(Boolean);

          return (
            <Reveal key={bundle.id} delay={idx * 90}>
              <div className="motion-surface overflow-hidden rounded-[26px] border border-ink/18 bg-card shadow-sm">
                {/* Header with discount badge */}
                <div className="flex items-center justify-between border-b border-ink/6 bg-paper2/40 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-display text-[15px] font-bold text-ink">
                        {bundle.name[lang]}
                      </span>
                      {bundle.badge && (
                        <span className="shrink-0 rounded-full bg-amber/15 px-2 py-0.5 text-[9px] font-extrabold uppercase text-amberdeep">
                          {bundle.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[12px] font-medium text-ink2">
                      {bundle.desc[lang]}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-moss px-3 py-1.5 font-display text-[12px] font-bold text-white">
                    −{bundle.discountPercent}%
                  </span>
                </div>

                {/* Bundle items chain */}
                <div className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {items.map((p, i) => (
                      <div key={p!.id} className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            haptic("light");
                            onOpenProduct(p!.id);
                          }}
                          className="press relative h-14 w-14 overflow-hidden rounded-[14px] bg-paper2"
                        >
                          <img src={p!.img} alt={p!.name} className="h-full w-full object-cover" />
                          <span className="absolute bottom-0 right-0 bg-amber/80 px-1 text-[9px] font-bold text-white">
                            ×{bundle.items[i].qty}
                          </span>
                        </button>
                        {i < items.length - 1 && <span className="text-[16px] font-bold text-ink/75">+</span>}
                      </div>
                    ))}
                  </div>

                  {/* Pricing */}
                  <div className="mt-3 flex items-center justify-between border-t border-ink/6 pt-3">
                    <div>
                      <p className="text-[11px] font-medium text-ink2 line-through">
                        {formatPrice(retail, lang)}
                      </p>
                      <p className="font-display text-[17px] font-bold text-ink">
                        {formatPrice(bundleTotal, lang)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-bold text-moss">
                        {t("wholesaleSave")}: {formatPrice(saved, lang)}
                      </p>
                      <button
                        onClick={() => handleAdd(bundle)}
                        className={`press mt-1.5 flex h-10 items-center gap-2 rounded-[14px] px-4 text-[12px] font-bold transition-all ${
                          added ? "bg-moss text-white" : "bg-amber text-white"
                        }`}
                      >
                        {added ? <IconCheck size={14} /> : <IconBag size={14} />}
                        {added ? t("added") : "To'plamni olish"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

/** Resolve bundle into cart entries */
export function bundleToCart(bundle: Bundle): Record<string, number> {
  const cart: Record<string, number> = {};
  bundle.items.forEach((it) => {
    cart[it.productId] = (cart[it.productId] ?? 0) + it.qty;
  });
  return cart;
}

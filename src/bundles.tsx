/**
 * DELIS — Секция наборов на главной и панель отдельного набора (состав + цена).
 */
import { useState } from "react";
import { useI18n } from "./i18n";
import { PRODUCTS, type Product } from "./data";
import { formatPrice, haptic } from "./kit";
import { IconCheck, IconPlus, IconSparkle } from "./icons";
import { Sheet } from "./chrome";

type Bundle = {
  id: string;
  title: "bundleCarTitle" | "bundleHomeTitle" | "bundleStartTitle";
  sub: "bundleCarSub" | "bundleHomeSub" | "bundleStartSub";
  ids: string[];
  discount: number;
  color: string;
};

const BUNDLES: Bundle[] = [
  {
    id: "car-shine",
    title: "bundleCarTitle",
    sub: "bundleCarSub",
    ids: ["shampoo", "wax", "wheel"],
    discount: 15,
    color: "from-[#10233e] to-[#0c1411]",
  },
  {
    id: "home-clean",
    title: "bundleHomeTitle",
    sub: "bundleHomeSub",
    ids: ["glass", "kitchen", "floor"],
    discount: 15,
    color: "from-[#dcecff] to-[#eef5ed]",
  },
  {
    id: "starter",
    title: "bundleStartTitle",
    sub: "bundleStartSub",
    ids: ["glass", "shampoo"],
    discount: 10,
    color: "from-[#f6e6bd] to-[#f4f2eb]",
  },
];

export function BundleSection({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <section className="px-5 pt-14">
      <div className="flex items-end justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-amberdeep">
            <IconSparkle size={12} />
            {t("bundlesTitle")}
          </p>
          <p className="mt-1 text-[12px] font-medium text-ink2">{t("bundlesSub")}</p>
        </div>
        <button onClick={onOpen} className="press rounded-full border border-ink/15 px-3 py-1.5 text-[11px] font-bold text-ink2">
          {t("showAll")}
        </button>
      </div>
      <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-1">
        {BUNDLES.map((bundle) => (
          <BundleCard key={bundle.id} bundle={bundle} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function BundleCard({ bundle, onOpen }: { bundle: Bundle; onOpen: () => void }) {
  const { t, lang } = useI18n();
  const products = bundle.ids.map((id) => PRODUCTS.find((p) => p.id === id)).filter((p): p is Product => Boolean(p));
  const retail = products.reduce((sum, p) => sum + p.price, 0);
  const total = Math.round((retail * (100 - bundle.discount)) / 100 / 100) * 100;

  return (
    <button onClick={onOpen} className={`press relative w-[260px] shrink-0 overflow-hidden rounded-[24px] bg-gradient-to-br ${bundle.color} p-4 text-left shadow-soft`}>
      <span className="absolute right-3 top-3 rounded-full bg-amber px-2.5 py-1 text-[9px] font-extrabold uppercase text-white">
        −{bundle.discount}%
      </span>
      <div className="flex -space-x-3 pt-1">
        {products.map((p) => (
          <img key={p.id} src={p.img} alt="" className="h-14 w-14 rounded-full border-2 border-white/70 object-cover" />
        ))}
      </div>
      <p className="mt-4 max-w-[190px] font-display text-[15px] font-bold text-ink">{t(bundle.title)}</p>
      <p className="mt-1 max-w-[220px] text-[11px] font-medium leading-snug text-ink2">{t(bundle.sub)}</p>
      <div className="mt-3 flex items-end gap-2">
        <span className="font-display text-[16px] font-bold text-ink">{formatPrice(total, lang)}</span>
        <span className="text-[11px] font-medium text-ink2 line-through">{formatPrice(retail, lang)}</span>
      </div>
    </button>
  );
}

export function BundleSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (product: Product) => void }) {
  const { t, lang } = useI18n();
  const [added, setAdded] = useState<string | null>(null);

  return (
    <Sheet open={open} onClose={onClose} title={t("bundlesTitle")}>
      <div className="space-y-3 pt-1">
        <p className="text-[13px] font-medium text-ink2">{t("bundlesSub")}</p>
        {BUNDLES.map((bundle) => {
          const products = bundle.ids.map((id) => PRODUCTS.find((p) => p.id === id)).filter((p): p is Product => Boolean(p));
          const retail = products.reduce((sum, p) => sum + p.price, 0);
          const total = Math.round((retail * (100 - bundle.discount)) / 100 / 100) * 100;
          const isAdded = added === bundle.id;
          return (
            <div key={bundle.id} className="rounded-[22px] border border-ink/18 bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3">
                  {products.map((p) => <img key={p.id} src={p.img} alt="" className="h-12 w-12 rounded-full border-2 border-card object-cover" />)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[14px] font-bold text-ink">{t(bundle.title)}</p>
                  <p className="mt-0.5 text-[11px] text-ink2">{t(bundle.sub)}</p>
                </div>
                <span className="rounded-full bg-amber/15 px-2 py-1 text-[10px] font-bold text-amberdeep">−{bundle.discount}%</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-ink/18 pt-3">
                <div><span className="font-display text-[16px] font-bold text-ink">{formatPrice(total, lang)}</span><span className="ml-2 text-[11px] text-ink2 line-through">{formatPrice(retail, lang)}</span></div>
                <button
                  onClick={() => {
                    haptic("success");
                    products.forEach((p) => onAdd(p));
                    setAdded(bundle.id);
                    setTimeout(() => setAdded(null), 1600);
                  }}
                  className={`press flex items-center gap-1.5 rounded-[14px] px-3 py-2 text-[12px] font-bold ${isAdded ? "bg-moss text-white" : "bg-amber text-white"}`}
                >
                  {isAdded ? <IconCheck size={14} /> : <IconPlus size={14} />}
                  {isAdded ? t("bundleAdded") : t("bundleAdd")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
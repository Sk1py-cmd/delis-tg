/**
 * DELIS — Глобальный поиск по товарам (по названию) и фильтр по диапазону цены.
 */
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "./i18n";
import { PRODUCTS, type Product } from "./data";
import { formatPrice, haptic } from "./kit";
import { IconChevron, IconClock, IconClose, IconSearch } from "./icons";
import { Sheet } from "./chrome";

/* ============================================================
   GLOBAL SEARCH — products + FAQ in one place
   ============================================================ */

export function GlobalSearchSheet({
  open,
  onClose,
  onOpenProduct,
  onOpenFaq,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  onOpenProduct: (p: Product) => void;
  onOpenFaq: () => void;
  onToast?: (msg: string) => void;
}) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("delis_search_history") || "[]");
    } catch {
      return [];
    }
  });

  const saveToHistory = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setHistory((prev) => {
      const next = [clean, ...prev.filter((h) => h.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
      try {
        localStorage.setItem("delis_search_history", JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => setQuery(""), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const q = query.trim().toLowerCase();

  const foundProducts = useMemo(() => {
    if (!q) return [];
    return PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.desc[lang].toLowerCase().includes(q) ||
        p.spec[lang].toLowerCase().includes(q),
    ).slice(0, 6);
  }, [q, lang]);

  const faqItems = useMemo(() => {
    if (!q) return [];
    const items = [
      { q: t("faqQ1"), a: t("faqA1") },
      { q: t("faqQ2"), a: t("faqA2") },
      { q: t("faqQ3"), a: t("faqA3") },
      { q: t("faqQ4"), a: t("faqA4") },
      { q: t("faqQ5"), a: t("faqA5") },
    ];
    return items.filter(
      (it) => it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q),
    );
  }, [q, t]);

  const hasResults = foundProducts.length > 0 || faqItems.length > 0;

  return (
    <Sheet open={open} onClose={onClose} title={t("searchAllPh").replace("…", "")}>
      <div className="space-y-4 pt-1">
        {/* Search input */}
        <label className="flex items-center gap-3 rounded-[20px] border border-ink/18 bg-card px-4 py-3.5 shadow-sm">
          <IconSearch size={18} className="text-ink/65" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                haptic("light");
                saveToHistory(query);
              }
            }}
            placeholder={t("searchAllPh")}
            className="flex-1 bg-transparent text-[15px] font-semibold text-ink outline-none placeholder:text-ink/60"
          />
          {query && (
            <button
              onClick={() => { haptic("light"); setQuery(""); }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-amber/8 text-ink/60"
              aria-label="Clear"
            >
              <IconClose size={13} />
            </button>
          )}
          {/* Voice search */}
          <button
            onClick={() => {
              haptic("medium");
              const w = window as unknown as { webkitSpeechRecognition?: new () => any; SpeechRecognition?: new () => any };
              const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
              if (!SR) {
                onToast?.(lang === "uz" ? "Ovozli qidiruv qo'llab-quvvatlanmaydi" : lang === "ru" ? "Голосовой поиск не поддерживается" : "Voice search not supported");
                return;
              }
              const rec = new SR();
              rec.lang = lang === "ru" ? "ru-RU" : lang === "en" ? "en-US" : "uz-UZ";
              rec.interimResults = false;
              rec.maxAlternatives = 1;
              rec.onresult = (e: any) => {
                const text = e.results?.[0]?.[0]?.transcript || "";
                if (text) {
                  setQuery(text);
                  haptic("success");
                }
              };
              rec.onerror = () => { /* silent */ };
              try {
                rec.start();
              } catch { /* ignore */ }
            }}
            aria-label="Voice search"
            className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amberdeep"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="3.5" width="6" height="11" rx="3" />
              <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9.5 21h5" />
            </svg>
          </button>
        </label>

        {/* Empty state before typing — recent searches */}
        {!q && (
          <div className="space-y-4">
            {history.length > 0 ? (
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65">
                    <span className="inline-flex items-center gap-1.5"><IconClock size={13} /> {lang === "uz" ? "Oxirgi qidiruvlar" : lang === "ru" ? "Недавние запросы" : "Recent searches"}</span>
                  </p>
                  <button
                    onClick={() => {
                      setHistory([]);
                      try {
                        localStorage.removeItem("delis_search_history");
                      } catch { /* ignore */ }
                    }}
                    className="text-[11px] font-bold text-ink/60 underline-offset-2 hover:text-[#B3402E] hover:underline"
                  >
                    {lang === "uz" ? "Tozalash" : lang === "ru" ? "Очистить" : "Clear"}
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {history.map((h) => (
                    <button
                      key={h}
                      onClick={() => {
                        haptic("light");
                        setQuery(h);
                      }}
                      className="press flex items-center gap-1.5 rounded-full border border-ink/18 bg-card px-3.5 py-2 text-[12px] font-semibold text-ink/70"
                    >
                      <IconSearch size={11} className="text-ink/75" />
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sagetint text-moss">
                  <IconSearch size={26} />
                </div>
                <p className="mt-4 text-[13px] font-medium text-ink/70">{t("searchAllPh")}</p>
              </div>
            )}
          </div>
        )}

        {/* No results */}
        {q && !hasResults && (
          <div className="py-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-paper2 text-ink/60">
              <IconSearch size={26} />
            </div>
            <p className="mt-4 font-display text-[16px] font-bold text-ink">{t("searchNothing")}</p>
            <p className="mt-1.5 text-[13px] font-medium text-ink/70">{t("searchTryAgain")}</p>
          </div>
        )}

        {/* Live suggestions while typing */}
        {q && (
          <div className="-mt-1">
            <div className="no-scrollbar flex flex-wrap gap-1.5">
              {(() => {
                const ql = q.toLowerCase();
                const byName = PRODUCTS.filter((p) => p.name.toLowerCase().includes(ql)).slice(0, 3);
                const byOther = PRODUCTS.filter(
                  (p) =>
                    !p.name.toLowerCase().includes(ql) &&
                    (p.desc[lang].toLowerCase().includes(ql) || p.spec[lang].toLowerCase().includes(ql)),
                ).slice(0, 3);
                return [...byName, ...byOther].slice(0, 5).map((p) => (
                  <button
                    key={`sug-${p.id}`}
                    onClick={() => {
                      haptic("light");
                      saveToHistory(p.name);
                      onClose();
                      onOpenProduct(p);
                    }}
                    className="press flex items-center gap-1.5 rounded-full border border-moss/20 bg-sagetint/50 px-3 py-1.5 text-[12px] font-bold text-pine"
                  >
                    <span className="h-3.5 w-3.5 overflow-hidden rounded-full">
                      <img src={p.img} alt="" className="h-full w-full object-cover" />
                    </span>
                    {p.name}
                  </button>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Product results */}
        {foundProducts.length > 0 && (
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65">
              {t("searchInProducts")} · {foundProducts.length}
            </p>
            <div className="mt-2.5 space-y-2">
              {foundProducts.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => { haptic("light"); saveToHistory(query); onClose(); onOpenProduct(p); }}
                  className="press flex w-full items-center gap-3 rounded-[18px] border border-ink/18 bg-card p-3 text-left shadow-sm"
                  style={{ animation: `pop 0.35s ${i * 40}ms both` }}
                >
                  <div className={`h-12 w-12 shrink-0 overflow-hidden rounded-[12px] ${p.cat === "home" ? "bg-sagetint" : "bg-graphite2"}`}>
                    <img src={p.img} alt={p.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[14px] font-bold text-ink">{p.name}</p>
                    <p className="truncate text-[12px] font-medium text-ink/70">{p.desc[lang]}</p>
                  </div>
                  <span className="shrink-0 font-display text-[13px] font-bold text-ink">
                    {formatPrice(p.price, lang)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* FAQ results */}
        {faqItems.length > 0 && (
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65">
              {t("searchInFaq")} · {faqItems.length}
            </p>
            <div className="mt-2.5 space-y-2">
              {faqItems.map((it, i) => (
                <button
                  key={i}
                  onClick={() => { haptic("light"); onClose(); onOpenFaq(); }}
                  className="press flex w-full items-center gap-3 rounded-[18px] border border-ink/18 bg-card p-3.5 text-left shadow-sm"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber/15 text-[15px]">
                    ❓
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">{it.q}</span>
                  <IconChevron size={14} className="shrink-0 text-ink/75" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ============================================================
   PRICE RANGE FILTER — dual slider for the catalog
   ============================================================ */

export function PriceFilter({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const { t, lang } = useI18n();
  const [lo, hi] = value;
  const isActive = lo > min || hi < max;

  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  return (
    <div className="rounded-[20px] border border-ink/18 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink/65">
          {t("priceFilter")}
        </p>
        {isActive && (
          <button
            onClick={() => { haptic("light"); onChange([min, max]); }}
            className="text-[11px] font-bold text-moss"
          >
            {t("priceReset")}
          </button>
        )}
      </div>

      {/* Value labels */}
      <div className="mt-2.5 flex items-center justify-between">
        <span className="rounded-full bg-paper2 px-3 py-1.5 font-display text-[12px] font-bold text-ink">
          {formatPrice(lo, lang)}
        </span>
        <span className="text-ink/75">—</span>
        <span className="rounded-full bg-paper2 px-3 py-1.5 font-display text-[12px] font-bold text-ink">
          {formatPrice(hi, lang)}
        </span>
      </div>

      {/* Dual range track */}
      <div className="relative mt-4 h-6">
        {/* Base track */}
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-amber/10" />
        {/* Selected range */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-moss"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        {/* Min slider */}
        <input
          type="range"
          min={min}
          max={max}
          step={1000}
          value={lo}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), hi - 1000);
            onChange([v, hi]);
          }}
          className="price-range absolute inset-0 w-full"
        />
        {/* Max slider */}
        <input
          type="range"
          min={min}
          max={max}
          step={1000}
          value={hi}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), lo + 1000);
            onChange([lo, v]);
          }}
          className="price-range absolute inset-0 w-full"
        />
      </div>
    </div>
  );
}

/**
 * DELIS — Акционные инструменты: калькулятор расхода, умный квиз-подбор, подписки, B2B-форма и список «мои подписки».
 */
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "./i18n";
import { PRODUCTS, WHOLESALE_TIERS, type Product } from "./data";
import { formatPrice, haptic } from "./kit";
import {
  IconBag,
  IconBox,
  IconBuilding,
  IconCalendar,
  IconCheck,
  IconChevron,
  IconClock,
  IconConfetti,
  IconMinus,
  IconPlus,
  IconSparkle,
  IconSymbol,
} from "./icons";
import { Sheet } from "./chrome";

/* ============================================================
   1. CONSUMPTION CALCULATOR
   ============================================================ */

type Surface = "floor" | "tiles" | "glass" | "car" | "salon";

const COVERAGE: Record<Surface, { productId: string; perUnit: number; unit: string }> = {
  floor: { productId: "floor", perUnit: 0.5, unit: "L" },     // 1L concentrate → 40L, covers ~80m²/week
  tiles: { productId: "floor", perUnit: 0.4, unit: "L" },
  glass: { productId: "glass", perUnit: 0.03, unit: "L" },
  car: { productId: "shampoo", perUnit: 0.05, unit: "L" },
  salon: { productId: "interior", perUnit: 0.04, unit: "L" },
};

const FREQ_MULT = [1, 2.5, 7] as const;

export function CalculatorSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (p: Product, qty: number) => void }) {
  const { t, lang } = useI18n();
  const [area, setArea] = useState("45");
  const [surface, setSurface] = useState<Surface>("floor");
  const [freq, setFreq] = useState(0);
  const [addedAll, setAddedAll] = useState(false);

  const product = PRODUCTS.find((p) => p.id === COVERAGE[surface].productId)!;
  const areaNum = parseFloat(area) || 0;
  const weeklyL = areaNum * COVERAGE[surface].perUnit;
  const monthlyL = weeklyL * FREQ_MULT[freq] * 4.3;
  const packsNeeded = Math.max(1, Math.ceil(monthlyL / parseFloat(product.volume)));
  const coveredM2 = areaNum > 0 ? Math.round((parseFloat(product.volume) / (COVERAGE[surface].perUnit * FREQ_MULT[freq] * 4.3)) * areaNum / Math.max(1, packsNeeded)) : 0;

  const surfaces: { id: Surface; label: string; icon: string }[] = [
    { id: "floor", label: t("calcSurface1"), icon: "🪵" },
    { id: "tiles", label: t("calcSurface2"), icon: "🧱" },
    { id: "glass", label: t("calcSurface3"), icon: "🪟" },
    { id: "car", label: t("calcSurface4"), icon: "🚗" },
    { id: "salon", label: t("calcSurface5"), icon: "🛋" },
  ];
  const freqs = [t("calcFreq1"), t("calcFreq2"), t("calcFreq3")];

  const addAll = () => {
    haptic("success");
    onAdd(product, packsNeeded);
    setAddedAll(true);
    setTimeout(() => setAddedAll(false), 1200);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("calcTitle")}>
      <div className="space-y-4 pt-1">
        <p className="text-[12.5px] font-medium text-ink/70">{t("calcSub")}</p>

        {/* Area */}
        <div>
          <label className="text-[11px] font-bold text-ink/70">{t("calcArea")}</label>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            placeholder={t("calcAreaPh")}
            className="mt-1.5 w-full rounded-[16px] border border-ink/15 bg-paper px-4 py-3.5 text-[15px] font-bold text-ink outline-none focus:border-moss"
          />
        </div>

        {/* Surface */}
        <div>
          <label className="text-[11px] font-bold text-ink/70">{t("calcSurfaces")}</label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {surfaces.map((s) => (
              <button
                key={s.id}
                onClick={() => { haptic("light"); setSurface(s.id); }}
                className={`press flex items-center gap-2.5 rounded-[16px] border px-3.5 py-3 text-left text-[12.5px] font-semibold ${
                  surface === s.id ? "border-ink bg-card ring-1 ring-ink" : "border-ink/18 bg-card/60 text-ink/70"
                }`}
              >
                <span className="motion-icon-tile grid h-9 w-9 place-items-center rounded-[11px] bg-black/5"><IconSymbol symbol={s.icon} size={19} /></span>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Frequency */}
        <div>
          <label className="text-[11px] font-bold text-ink/70">{t("calcFrequency")}</label>
          <div className="mt-1.5 flex gap-2">
            {freqs.map((f, i) => (
              <button
                key={i}
                onClick={() => { haptic("light"); setFreq(i); }}
                className={`press flex-1 rounded-[16px] border px-2 py-3 text-center text-[11.5px] font-bold ${
                  freq === i ? "border-ink bg-amber text-white" : "border-ink/15 text-ink/60"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Result */}
        {areaNum > 0 && (
          <div className="animate-pop rounded-[22px] border border-moss/20 bg-sagetint/70 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-pine">{t("calcResult")}</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-[14px] bg-card">
                <img src={product.img} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[14.5px] font-bold text-ink">{product.name}</p>
                <p className="text-[12px] font-semibold text-ink/75">
                  {t("calcNeed")}: {packsNeeded} {t("calcPacks")} · {t("calcCoverage")} ~{coveredM2} m²
                </p>
              </div>
              <span className="font-display text-[15px] font-bold text-ink">{formatPrice(product.price * packsNeeded, lang)}</span>
            </div>
            <button
              onClick={addAll}
              className={`press mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] text-[13.5px] font-bold transition-colors ${addedAll ? "bg-moss text-white" : "bg-amber text-white"}`}
            >
              {addedAll ? <IconCheck size={16} /> : <IconBag size={16} />}
              {addedAll ? t("added") : `${t("calcAddAll")} · ${packsNeeded} ${t("calcPacks")}`}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ============================================================
   2. QUIZ — perfect set finder
   ============================================================ */

const QUIZ_STEPS = [
  {
    qKey: "quizQ1",
    answers: [
      { id: "home", label: "quizA1Home", icon: "🏠" },
      { id: "car", label: "quizA1Car", icon: "🚗" },
    ],
  },
  {
    qKey: "quizQ2",
    answers: [
      { id: "floor", label: "quizA2Floor", icon: "🪵" },
      { id: "glass", label: "quizA2Glass", icon: "🪟" },
      { id: "kitchen", label: "quizA2Kitchen", icon: "🍳" },
      { id: "paint", label: "quizA2Paint", icon: "✨" },
      { id: "salon", label: "quizA2Salon", icon: "🛋" },
    ],
  },
  {
    qKey: "quizQ3",
    answers: [
      { id: "speed", label: "quizA3Speed", icon: "⚡" },
      { id: "shine", label: "quizA3Shine", icon: "💎" },
      { id: "protect", label: "quizA3Protect", icon: "🛡" },
    ],
  },
];

function quizPick(answers: string[]): string[] {
  const set: string[] = [];
  if (answers[0] === "home") {
    set.push("floor", "glass");
    if (answers[1] === "kitchen") set.push("kitchen");
    if (answers[2] === "protect") set.push("wax");
  } else {
    set.push("shampoo", "wax");
    if (answers[1] === "salon") set.push("interior");
  }
  if (answers[2] === "speed") set.push("glass");
  return [...new Set(set)].slice(0, 4);
}

export function QuizSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (p: Product, qty: number) => void }) {
  const { t, lang } = useI18n();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [added, setAdded] = useState(false);

  const resultIds = useMemo(() => quizPick(answers), [answers]);
  const resultProducts = resultIds.map((id) => PRODUCTS.find((p) => p.id === id)!).filter(Boolean);

  const answer = (id: string) => {
    haptic("medium");
    const next = [...answers, id];
    setAnswers(next);
    if (step < QUIZ_STEPS.length - 1) setStep(step + 1);
    else setDone(true);
  };

  const reset = () => {
    setStep(0);
    setAnswers([]);
    setDone(false);
    setAdded(false);
  };

  return (
    <Sheet open={open} onClose={() => { onClose(); setTimeout(reset, 300); }} title={done ? t("quizResult") : t("quizTitle")}>
      {!done ? (
        <div className="space-y-4 pt-1">
          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber/10">
              <div className="h-full rounded-full bg-moss transition-all duration-400" style={{ width: `${((step + 1) / QUIZ_STEPS.length) * 100}%` }} />
            </div>
            <span className="text-[11px] font-bold text-ink/70">
              {t("quizQPrefix")} {step + 1} {t("quizOf")} {QUIZ_STEPS.length}
            </span>
          </div>

          <h3 className="font-display text-[20px] font-bold leading-tight tracking-tight text-ink">
            {t(QUIZ_STEPS[step].qKey as never)}
          </h3>

          <div className="space-y-2.5">
            {QUIZ_STEPS[step].answers.map((a, i) => (
              <button
                key={a.id}
                onClick={() => answer(a.id)}
                className="press flex w-full items-center gap-3.5 rounded-[20px] border border-ink/18 bg-card p-4 text-left shadow-sm"
                style={{ animation: `pop 0.4s ${i * 60}ms cubic-bezier(0.34,1.56,0.64,1) both` }}
              >
                <span className="motion-icon-tile grid h-10 w-10 place-items-center rounded-[13px] bg-black/5 text-pine"><IconSymbol symbol={a.icon} size={22} /></span>
                <span className="flex-1 text-[14px] font-bold text-ink">{t(a.label as never)}</span>
                <IconChevron size={15} className="text-ink/75" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="animate-pop space-y-4 pt-1">
          <div className="flex items-center justify-center gap-3">
            <span className="text-moss"><IconConfetti size={30} /></span>
            <p className="font-display text-[16px] font-bold text-ink">{t("quizViewSet")}</p>
          </div>

          {resultProducts.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 rounded-[20px] border border-ink/18 bg-card p-3.5 shadow-sm" style={{ animation: `pop 0.5s ${i * 80}ms both` }}>
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[14px] bg-paper2">
                <img src={p.img} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[13.5px] font-bold text-ink">{p.name}</p>
                <p className="text-[11.5px] font-medium text-ink/70">{p.desc[lang]}... </p>
              </div>
              <button
                onClick={() => { haptic("success"); onAdd(p, 1); setAdded(true); }}
                className="press flex h-10 w-10 items-center justify-center rounded-full bg-amber text-white"
              >
                <IconPlus size={16} />
              </button>
            </div>
          ))}

          <button
            onClick={() => { haptic("light"); resultProducts.forEach((p) => onAdd(p, 1)); setAdded(true); }}
            className={`press flex h-13 w-full items-center justify-center gap-2 rounded-[20px] text-[14px] font-bold transition-colors ${added ? "bg-moss text-white" : "bg-amber text-white"}`}
          >
            {added ? <IconCheck size={17} /> : <IconBag size={17} />}
            {added ? t("added") : t("quizViewSet")}
          </button>
          <button onClick={reset} className="press w-full py-2 text-center text-[12.5px] font-bold text-ink/70">
            {t("quizAgain")}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/* ============================================================
   3. AUTO-DELIVERY SUBSCRIPTION
   ============================================================ */

export function SubscriptionSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (p: Product, qty: number) => void;
}) {
  const { t, lang } = useI18n();
  const [productId, setProductId] = useState("floor");
  const [qty, setQty] = useState(1);
  const [confirmed, setConfirmed] = useState(false);

  const product = PRODUCTS.find((p) => p.id === productId)!;
  const discountPct = 15;
  const monthly = product.price * qty;
  const monthlyDisc = monthly * (1 - discountPct / 100);
  const nextDate = new Date(Date.now() + 30 * 86400000).toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "short" });

  return (
    <Sheet open={open} onClose={onClose} title={t("subTitle")}>
      {confirmed ? (
        <div className="animate-pop py-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-moss/12 text-moss">
            <IconCheck size={28} />
          </div>
          <h3 className="mt-4 font-display text-[18px] font-bold text-ink">{t("subSuccess")}</h3>
          <p className="mt-2 text-[13px] font-medium text-ink/75">{t("subSuccessSub")}</p>
          <p className="mt-4 inline-block rounded-full bg-sagetint px-4 py-2 text-[12px] font-bold text-pine">
            {t("subNextDate")}: {nextDate}
          </p>
          <button onClick={onClose} className="press mt-7 w-full rounded-[18px] bg-amber py-3.5 text-[13.5px] font-bold text-white">
            {t("done")}
          </button>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          <p className="text-[12.5px] font-medium text-ink/70">{t("subSub")}</p>

          <div>
            <label className="text-[11px] font-bold text-ink/70">{t("subChoose")}</label>
            <div className="mt-1.5 space-y-2">
              {PRODUCTS.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  onClick={() => { haptic("light"); setProductId(p.id); }}
                  className={`press flex w-full items-center gap-3 rounded-[18px] border p-3 text-left ${productId === p.id ? "border-ink bg-card ring-1 ring-ink" : "border-ink/18 bg-card/60"}`}
                >
                  <div className="h-12 w-12 overflow-hidden rounded-[12px] bg-paper2">
                    <img src={p.img} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[13.5px] font-bold text-ink">{p.name}</p>
                    <p className="text-[11.5px] font-medium text-ink/70">{formatPrice(p.price, lang)} · {p.volume}</p>
                  </div>
                  <span className="rounded-full bg-amber/15 px-2.5 py-1 text-[10px] font-extrabold text-amberdeep">−{discountPct}%</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div className="flex items-center justify-between rounded-[18px] border border-ink/18 bg-card p-4">
            <span className="text-[13px] font-bold text-ink">{t("cartTotal")}</span>
            <div className="flex items-center gap-3">
              <button onClick={() => { haptic("light"); setQty(Math.max(1, qty - 1)); }} className="press grid h-9 w-9 place-items-center rounded-full border border-ink/18 text-ink/70"><IconMinus size={14} /></button>
              <span className="w-6 text-center font-display text-[15px] font-bold text-ink">{qty}</span>
              <button onClick={() => { haptic("light"); setQty(qty + 1); }} aria-label="Увеличить количество / Oshirish" className="press flex h-9 w-9 items-center justify-center rounded-full bg-amber text-white"><IconPlus size={14} /></button>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-[20px] border border-moss/20 bg-sagetint/70 p-4">
            <div className="flex items-center justify-between text-[13px] font-semibold text-ink/70">
              <span>{product.name} × {qty}</span>
              <span className="line-through opacity-50">{formatPrice(monthly, lang)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[13px] font-bold text-pine">
                <IconSparkle size={13} className="text-amber" />
                {t("subTotal")}
              </span>
              <span className="font-display text-[22px] font-bold text-ink">{formatPrice(monthlyDisc, lang)}</span>
            </div>
            <p className="mt-1.5 text-[11px] font-semibold text-pine/70">{t("subSave")} {discountPct}% · {t("subEveryMonth")}</p>
          </div>

          <button
            onClick={() => {
              haptic("success");
              onAdd(product, qty);
              setConfirmed(true);
              // Sync with the backend: the bot will send reminders
              import("./api").then(({ createSubscription }) => {
                createSubscription({ productId: product.id, qty, frequency: 30 }).catch(() => {});
              }).catch(() => {});
            }}
            className="press flex h-13 w-full items-center justify-center gap-2 rounded-[20px] bg-amber text-[14px] font-bold text-white shadow-lift"
          >
            <IconClock size={17} />
            {t("subConfirm")} · {formatPrice(monthlyDisc, lang)}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/* ============================================================
   4. B2B SALES OFFICE
   ============================================================ */

export function B2bSheet({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: () => void }) {
  const { t, lang } = useI18n();
  const [code, setCode] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [partnerLabel, setPartnerLabel] = useState<string | null>(null);
  const [tiers, setTiers] = useState<{ minQty: number; percent: number }[] | null>(null);

  // Live wholesale ladder (admin-editable on the server); local mirror as fallback
  useEffect(() => {
    if (!open || tiers) return;
    import("./api").then(({ fetchWholesaleTiers }) => {
      void fetchWholesaleTiers().then((rows) => {
        if (rows.length) setTiers(rows);
      });
    }).catch(() => {});
  }, [open, tiers]);
  const ladder = tiers && tiers.length
    ? tiers
    : WHOLESALE_TIERS.map((t) => ({ minQty: t.minQty, percent: t.discountPercent }));

  const login = async () => {
    if (checking) return;
    haptic("medium");
    setChecking(true);
    setError(false);
    try {
      const { verifyB2bCode } = await import("./api");
      const res = await verifyB2bCode(code);
      if (res.ok) {
        setLoggedIn(true);
        setPartnerLabel(res.label || null);
        haptic("success");
      } else {
        setError(true);
        haptic("error");
      }
    } finally {
      setChecking(false);
    }
  };

  // REAL conditions from the live ladder: min order = first tier, max discount
  // = last tier, price example computed for the flagship product at max tier.
  const flagship = PRODUCTS[0];
  const topLadder = ladder[ladder.length - 1];
  const exampleWholesale = flagship
    ? Math.round((flagship.price * (100 - topLadder.percent)) / 1000) * 10
    : 0;
  const rows = [
    {
      label: t("b2bPrice"),
      value: exampleWholesale ? formatPrice(exampleWholesale, lang) : "—",
      sub: `${flagship?.name || ""} · ${topLadder.minQty}+ dona · −${topLadder.percent}%`,
      icon: "💰",
    },
    { label: t("b2bMinOrder"), value: `${ladder[0].minQty} dona`, sub: ladder.map((x) => `${x.minQty}+ → −${x.percent}%`).join("  ·  "), icon: "📦" },
    { label: t("b2bCredit"), value: "14 kun", sub: "Ishonchli hamkorlar uchun", icon: "⏳" },
    { label: t("b2bShipping"), value: t("deliveryFree"), sub: `${t("coverageAllUzb")}`, icon: "🚚" },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={t("b2bTitle")}>
      {!loggedIn ? (
        <div className="space-y-4 pt-1">
          <p className="text-[12.5px] font-medium text-ink/70">{t("b2bSub")}</p>

          <div className="relative">
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(false); }}
              placeholder={t("b2bCodePh")}
              className={`w-full rounded-[18px] border bg-paper px-4 py-4 text-center font-display text-[16px] font-bold uppercase tracking-[0.14em] text-ink outline-none ${error ? "border-[#B3402E]" : "border-ink/15 focus:border-moss"}`}
            />
          </div>

          <button onClick={() => void login()} disabled={checking} className="press h-13 w-full rounded-[20px] bg-amber text-[14px] font-bold text-white disabled:opacity-50">
            {checking ? "…" : t("b2bEnter")}
          </button>

          {error && <p className="text-center text-[12px] font-semibold text-[#B3402E]">{t("b2bError")}</p>}

          <div className="border-t border-ink/18 pt-4 text-center">
            <p className="text-[12px] font-semibold text-ink/70">{t("b2bApply")}</p>
            <button
              onClick={() => { haptic("light"); onApply(); }}
              className="press mt-2.5 rounded-full bg-amber px-5 py-2.5 text-[12.5px] font-bold text-white"
            >
              {t("wsCta")}
            </button>
          </div>
        </div>
      ) : (
        <div className="animate-pop space-y-4 pt-1">
          <div className="flex items-center gap-3 rounded-[20px] border border-moss/20 bg-sagetint/70 p-4">
            <span className="motion-icon-tile grid h-11 w-11 place-items-center rounded-[14px] bg-moss/10 text-moss"><IconBuilding size={24} /></span>
            <div>
              <p className="font-display text-[14px] font-bold text-ink">{t("b2bWelcome")}</p>
              <p className="text-[11.5px] font-medium text-pine/70">DELIS · {lang === "en" ? "Namangan" : lang === "ru" ? "Наманган" : "Namangan"}{partnerLabel ? ` · ${partnerLabel}` : ""}</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-3.5 rounded-[18px] border border-ink/18 bg-card p-4" style={{ animation: `pop 0.4s ${i * 60}ms both` }}>
                <span className="motion-icon-tile grid h-10 w-10 place-items-center rounded-[13px] bg-black/5 text-pine"><IconSymbol symbol={r.icon} size={21} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink/65">{r.label}</p>
                  <p className="font-display text-[14px] font-bold text-ink">{r.value}</p>
                  <p className="text-[11.5px] font-medium text-ink/70">{r.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => { haptic("light"); onApply(); }}
            className="press h-12 w-full rounded-[18px] bg-amber text-[13.5px] font-bold text-white"
          >
            {t("b2bApply")}
          </button>

          {/* One-click wholesale order — drafts a Telegram message to the B2B manager */}
          <button
            onClick={() => {
              haptic("success");
              const manager = "Sk1py";
              let cartText = "";
              try {
                const raw = localStorage.getItem("cart");
                const cartData = raw ? JSON.parse(raw) : {};
                const lines = Object.entries(cartData)
                  .filter(([, q]) => Number(q) > 0)
                  .map(([id, q]) => {
                    const p = PRODUCTS.find((x) => x.id === id);
                    const name = p?.name || id;
                    const price = p?.price || 0;
                    return `• ${name} × ${q} — ${formatPrice(price * Number(q), lang)}`;
                  });
                cartText = lines.length ? lines.join("\n") : (lang === "ru" ? "(корзина пуста — укажите товары)" : "(savat bo'sh — tovarlarni ko'rsating)");
              } catch { cartText = ""; }
              const msg = encodeURIComponent(
                (lang === "ru"
                  ? `Здравствуйте! Хочу сделать оптовый заказ (B2B).\n\n${cartText}\n\nПрошу рассчитать и подтвердить.`
                  : lang === "en"
                    ? `Hello! I'd like to place a wholesale order (B2B).\n\n${cartText}\n\nPlease confirm availability and pricing.`
                    : `Assalomu alaykum! Opt buyurtma bermoqchiman (B2B).\n\n${cartText}\n\nIltimos, tasdiqlab, narxni yuboring.`)
              );
              window.open(`https://t.me/${manager}?text=${msg}`, "_blank");
            }}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-moss/30 bg-moss/10 text-[13.5px] font-bold text-moss"
          >
            <IconSymbol symbol="⚡" size={16} />
            {lang === "ru" ? "Заказ в 1 клик менеджеру" : lang === "en" ? "1-click order to manager" : "1 bosishda menejerga buyurtma"}
          </button>

          {/* PDF catalog download — opens a print-ready window with the full range */}
          <button
            onClick={() => {
              haptic("success");
              const today = new Date().toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU");
              const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              const productsHtml = PRODUCTS.map((p, i) => {
                const tiers = WHOLESALE_TIERS.map((t) => `${t.minQty}+ → −${t.discountPercent}%`).join(" · ");
                const margin = typeof p.costPrice === "number" && p.costPrice > 0 ? Math.round(((p.price - p.costPrice) / p.price) * 100) : null;
                return `
                  <tr>
                    <td>${i + 1}</td>
                    <td><img src="${esc(p.img)}" alt="" style="width:60px;height:60px;object-fit:cover;border-radius:8px"/></td>
                    <td><b>${esc(p.name)}</b><br/><span style="color:#666;font-size:11px">${esc(p.volume)} · ${esc(p.cat === "car" ? (lang === "ru" ? "Авто" : "Auto") : (lang === "ru" ? "Дом" : "Home"))}</span></td>
                    <td><b>${esc(formatPrice(p.price, lang))}</b></td>
                    <td><span style="font-size:10px;color:#666">${esc(tiers)}</span></td>
                    <td>${margin !== null ? `<span style="color:#16a34a;font-weight:bold">${margin}%</span>` : "—"}</td>
                  </tr>
                `;
              }).join("");
              const html = `<!doctype html><html><head><meta charset="utf-8"><title>DELIS — ${lang === "ru" ? "Каталог оптовых цен" : lang === "en" ? "Wholesale catalog" : "Opt narxlar katalogi"}</title>
                <style>
                  body{font-family:Arial,sans-serif;padding:24px;color:#0c1411;max-width:900px;margin:0 auto}
                  h1{font-size:24px;color:#211a2b;margin:0 0 4px}
                  .sub{color:#54685f;font-size:12px;margin:0 0 18px}
                  table{width:100%;border-collapse:collapse;font-size:11px}
                  td,th{border:1px solid #e2e8e5;padding:8px 10px;text-align:left;vertical-align:middle}
                  th{background:#638872;color:white;font-size:10px;text-transform:uppercase;letter-spacing:0.06em}
                  td:nth-child(4){font-weight:bold;color:#16a34a;text-align:right}
                  .footer{margin-top:24px;padding-top:12px;border-top:2px solid #638872;color:#54685f;font-size:11px}
                  @media print{body{padding:8mm}}
                </style></head><body>
                  <h1>📦 DELIS — ${lang === "ru" ? "Оптовый каталог" : lang === "en" ? "Wholesale catalog" : "Opt narxlar katalogi"}</h1>
                  <p class="sub">"DELIS GROUP" MChJ · Namangan, O'zbekiston · ${today}</p>
                  <table>
                    <thead><tr>
                      <th style="width:24px">#</th>
                      <th style="width:80px">${lang === "ru" ? "Фото" : lang === "en" ? "Photo" : "Foto"}</th>
                      <th>${lang === "ru" ? "Товар" : lang === "en" ? "Product" : "Mahsulot"}</th>
                      <th style="text-align:right">${lang === "ru" ? "Цена" : lang === "en" ? "Price" : "Narx"}</th>
                      <th>${lang === "ru" ? "Оптовые скидки" : lang === "en" ? "Wholesale" : "Opt"}</th>
                      <th>${lang === "ru" ? "Маржа" : lang === "en" ? "Margin" : "Foyda"}</th>
                    </tr></thead>
                    <tbody>${productsHtml}</tbody>
                  </table>
                  <div class="footer">
                    <b>${lang === "ru" ? "Контакты:" : lang === "en" ? "Contacts:" : "Kontaktlar:"}</b><br/>
                    📞 +998 88 044-66-55 · +998 94 331-64-64<br/>
                    💬 t.me/Sk1py · ✉️ hello@delis.uz<br/>
                    🌐 delis.uz · @delisgroup_bot
                  </div>
                  <script>setTimeout(()=>window.print(), 500);</script>
                </body></html>`;
              const win = window.open("", "_blank", "width=900,height=700");
              if (win) { win.document.write(html); win.document.close(); }
              else {
                const blob = new Blob([html], { type: "text/html;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `DELIS_catalog_${new Date().toISOString().slice(0, 10)}.html`;
                a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
              }
            }}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-ink/15 bg-card text-[13px] font-bold text-ink2 hover:text-ink"
          >
            <IconSymbol symbol="📄" size={16} />
            {lang === "ru" ? "Скачать PDF-каталог" : lang === "en" ? "Download PDF catalog" : "PDF katalogni yuklash"}
          </button>
          <button onClick={() => { haptic("light"); setLoggedIn(false); setCode(""); }} className="press w-full py-2 text-center text-[12px] font-bold text-ink/70">
            {t("b2bExit")}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/* ============================================================
   MY SUBSCRIPTIONS — view & cancel active product subscriptions
   ============================================================ */

export function MySubscriptionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useI18n();
  const [subs, setSubs] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);

  const refresh = () => {
    import("./api").then(({ fetchSubscriptions }) => {
      fetchSubscriptions().then((rows) => {
        setSubs(rows || []);
        setLoaded(true);
      }).catch(() => { setLoaded(true); });
    }).catch(() => { setLoaded(true); });
  };

  if (open && !loaded) refresh();

  const cancel = (id: string) => {
    import("./api").then(({ deleteSubscription }) => {
      deleteSubscription(id).catch(() => {});
    }).catch(() => {});
    setSubs((prev) => prev.filter((s) => s.id !== id));
    haptic("success");
  };

  return (
    <Sheet open={open} onClose={onClose} title={L("Mening obunalarim", "Мои подписки", "My subscriptions")}>
      <div className="space-y-3 pt-1">
        {!loaded ? (
          <p className="py-10 text-center text-[13px] font-medium text-ink/70">…</p>
        ) : subs.length === 0 ? (
          <div className="py-10 text-center">
            <div className="motion-icon-tile mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-sagetint text-pine"><IconBox size={29} /></div>
            <p className="mt-4 font-display text-[16px] font-bold text-ink">{L("Obunalar yo'q", "Нет подписок", "No subscriptions")}</p>
            <p className="mx-auto mt-1.5 max-w-[260px] text-[12.5px] font-medium text-ink/70">
              {L("«Abuna» bo'limidan mahsulotga eslatma o'rnating.", "Оформите подписку в разделе «Абонемент».", "Set up a subscription in the «Subscription» section.")}
            </p>
          </div>
        ) : (
          subs.map((s) => {
            const p = PRODUCTS.find((x) => x.id === s.product_id);
            return (
              <div key={s.id} className="rounded-[20px] border border-ink/18 bg-card p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  {p && <img src={p.img} alt="" className="h-12 w-12 rounded-[14px] object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[13.5px] font-bold text-ink">{p?.name || s.product_id}</p>
                    <p className="mt-0.5 text-[11.5px] font-medium text-ink/70">
                      × {s.qty} · {L("har", "каждые", "every")} {s.frequency} {L("kun", "дней", "days")}
                    </p>
                    <p className="mt-0.5 text-[10.5px] font-semibold text-pine">
                      <span className="inline-flex items-center gap-1"><IconCalendar size={13} /> {L("Keyingi:", "Следующая:", "Next:")}</span> {s.next_date ? new Date(s.next_date).toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU") : "—"}
                    </p>
                  </div>
                  <button
                    onClick={() => cancel(s.id)}
                    className="press shrink-0 rounded-full border border-[#B3402E]/20 bg-[#B3402E]/5 px-3 py-2 text-[11px] font-bold text-[#B3402E]"
                  >
                    {L("Bekor qilish", "Отменить", "Cancel")}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Sheet>
  );
}

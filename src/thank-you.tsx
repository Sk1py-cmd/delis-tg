/**
 * DELIS — Экран «Спасибо за заказ» после успешного оформления.
 * Максимум праздника: эффектная анимация появления, конфетти,
 * сочные зелёно-золотые цвета, красивые кнопки.
 */
import { useEffect, useState } from "react";
import { useI18n } from "./i18n";
import type { Order } from "./data";
import { cashbackStars } from "./data";
import { formatPrice, haptic, lockScroll, unlockScroll } from "./kit";
import { IconArrow, IconCheck, IconFactory, IconPhone, IconStar, IconTruck } from "./icons";

const CONFETTI_COLORS = ["#1f2937", "#374151", "#ffffff", "#6b7280", "#d1d5db", "#e11d48"];

export function ThankYouScreen({
  order,
  onContinue,
  onViewOrder,
}: {
  order: Order | null;
  onContinue: () => void;
  onViewOrder: () => void;
}) {
  const { t, lang } = useI18n();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (order) {
      haptic("success");
      const r = requestAnimationFrame(() => setShown(true));
      lockScroll();
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    unlockScroll();
  }, [order]);

  useEffect(() => () => { unlockScroll(); }, []);

  if (!order) return null;

  const earnedStars = order.expectedStars ?? cashbackStars(order.total, 0);

  const steps = [
    { icon: IconPhone, title: t("thanksStep1"), sub: t("thanksStep1Sub"), tint: "bg-amber/15 text-amberdeep" },
    { icon: IconFactory, title: t("thanksStep2"), sub: t("thanksStep2Sub"), tint: "bg-sagetint text-pine" },
    { icon: IconTruck, title: t("thanksStep3"), sub: t("thanksStep3Sub"), tint: "bg-amber/15 text-amberdeep" },
  ];

  const confetti = Array.from({ length: 30 }).map((_, i) => {
    const size = 4 + ((i * 7) % 6);
    const round = i % 4 === 0;
    return {
      left: `${(i * 3.4 + 1) % 97}%`,
      delay: `${(i * 90) % 2800}ms`,
      dur: `${2.6 + ((i * 11) % 18) / 10}s`,
      w: size,
      h: round ? size : size * 1.7,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      radius: round ? "50%" : "3px",
    };
  });

  const rise = (i: number) => ({
    style: { animationDelay: `${i}ms` },
  });

  return (
    <div className="fixed inset-0 z-[95] flex h-[100dvh] flex-col bg-paper">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Hero */}
        <div className="relative overflow-hidden bg-gradient-to-b from-[#111827] via-[#111827] to-[#1f2937] pt-[calc(env(safe-area-inset-top,0px)+52px)] pb-16 text-center">
          {/* glow orbs */}
          <div className="absolute inset-0 bg-[radial-gradient(80%_70%_at_50%_-10%,rgba(10,132,255,0.35),transparent_65%)]" />
          <span className="ty-float absolute -left-10 top-20 h-32 w-32 rounded-full bg-amber/20 blur-2xl" />
          <span className="ty-float absolute -right-12 top-28 h-36 w-36 rounded-full bg-moss/30 blur-2xl" style={{ animationDelay: "1.1s" }} />

          {/* Confetti */}
          {confetti.map((c, i) => (
            <span
              key={i}
              className="thanks-confetti absolute rounded-full"
              style={{
                left: c.left,
                top: "8%",
                width: c.w,
                height: c.h,
                background: c.color,
                borderRadius: c.radius,
                opacity: 0.9,
                animationDelay: c.delay,
                animationDuration: c.dur,
              }}
            />
          ))}

          <div className="relative z-10">
            {/* check with springy entrance */}
            <div className="mx-auto flex h-[120px] w-[120px] items-center justify-center">
              {shown && (
                <span className="ty-burst absolute inset-0 rounded-full border-2 border-amber/70" />
              )}
              {shown && (
                <span className="ty-burst-2 absolute inset-0 rounded-full border-2 border-white/40" />
              )}
              <span
                className="ty-spring flex h-[96px] w-[96px] items-center justify-center rounded-full bg-gradient-to-br from-[#6b7280] to-[#1f2937] shadow-[0_20px_50px_-12px_rgba(55,65,81,0.9)]"
                style={{ animationDelay: "0ms" }}
              >
                <svg width="46" height="46" viewBox="0 0 52 52" fill="none">
                  <path
                    d="M14 27.5 22 35.5 38 17"
                    stroke="#ffffff"
                    strokeWidth="5.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="check-draw"
                    style={{ animationDelay: "0.2s" }}
                  />
                </svg>
              </span>
            </div>

            <h1 className="ty-rise mt-6 font-display text-[40px] font-bold tracking-tight text-white" {...rise(120)}>
              {t("thanksTitle")}
            </h1>
            <p className="ty-rise mt-2 text-[15px] font-medium text-white/80" {...rise(220)}>
              {t("thanksSub")}
            </p>

            <div className="ty-bob ty-rise mx-auto mt-6 inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 backdrop-blur-md" {...rise(320)}>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">
                {t("orderNumber")}
              </span>
              <span className="font-display text-[16px] font-bold text-amber">#{order.id}</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="relative z-10 px-5 pb-10">
          {/* Total + cashback */}
          <div className="ty-rise -mt-10" {...rise(400)}>
            <div className="rounded-[26px] bg-card p-5 shadow-lift ring-1 ring-ink/8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink/50">
                    {lang === "ru" ? "Ваш заказ" : lang === "en" ? "Your order" : "Buyurtmangiz"}
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-ink/75">
                    {order.count} {t("itemsWord")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink/50">
                    {lang === "ru" ? "Сумма" : lang === "en" ? "Total" : "Jami"}
                  </p>
                  <p className="font-display text-[30px] font-extrabold leading-none text-ink">
                    {formatPrice(order.total, lang)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2.5 rounded-[16px] bg-paper2/70 px-3.5 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-moss/12 text-moss">
                  <IconTruck size={16} />
                </span>
                <p className="truncate text-[13px] font-semibold text-ink/75">{order.deliveryTime}</p>
              </div>
            </div>

            {/* cashback */}
            <div className="mt-3 flex items-center gap-4 overflow-hidden rounded-[26px] bg-gradient-to-r from-amber/[0.18] to-moss/[0.14] p-5 ring-1 ring-amber/20">
              <span className="ty-bob flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-amber text-white shadow-[0_10px_24px_-10px_rgba(11,107,68,0.95)]">
                <IconStar size={26} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-ink">
                  {lang === "ru" ? "Ожидаемый кэшбэк" : lang === "en" ? "Expected cashback" : "Kutilayotgan keshbek"}
                </p>
                <p className="mt-0.5 font-display text-[26px] font-extrabold leading-tight text-amberdeep">
                  +{earnedStars} ⭐
                </p>
                <p className="text-[11px] font-medium text-ink/60">
                  {lang === "ru" ? "начислится после оплаты или доставки" : lang === "en" ? "credited after payment or delivery" : "to'lov yoki yetkazib berishdan so'ng hisoblanadi"}
                </p>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="ty-rise mt-8" {...rise(520)}>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/60">
              {t("thanksTimeline")}
            </p>
            <div className="mt-3 space-y-3">
              {steps.map((s, i) => (
                <div
                  key={i}
                  className="ty-rise flex items-center gap-4 rounded-[20px] bg-card p-4 shadow-sm ring-1 ring-ink/8"
                  style={{ animationDelay: `${560 + i * 150}ms` }}
                >
                  <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] ${s.tint}`}>
                    <s.icon size={20} />
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber font-display text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-ink">{s.title}</p>
                    <p className="mt-0.5 text-[12px] font-medium text-ink/70">{s.sub}</p>
                  </div>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-moss/12 text-moss">
                    <IconCheck size={14} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div
        className="z-10 shrink-0 border-t border-ink/8 bg-paper/95 px-5 pt-4 pb-4 backdrop-blur-xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
      >
        <button
          onClick={() => { haptic("medium"); onViewOrder(); }}
          className="press flex h-[58px] w-full items-center justify-center gap-2 rounded-[18px] bg-[#1f2937] text-[15px] font-bold text-white transition-colors duration-300 hover:bg-[#1f2937] active:scale-[0.98]"
        >
          <IconCheck size={18} />
          {t("ordersTitle")}
        </button>
        <button
          onClick={() => { haptic("light"); onContinue(); }}
          className="press mt-2.5 flex h-[50px] w-full items-center justify-center gap-1.5 rounded-[18px] bg-paper2 text-[14px] font-bold text-ink/75 transition-colors hover:bg-amber/5 active:scale-[0.98]"
        >
          {t("thanksContinue")}
          <IconArrow size={14} className="rotate-180" />
        </button>
      </div>
    </div>
  );
}

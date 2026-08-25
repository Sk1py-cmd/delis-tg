/**
 * DELIS — Финальные штрихи: онбординг-подсказки, экспорт заказов, панель с банковскими реквизитами.
 */
import { useState } from "react";
import { useI18n } from "./i18n";
import { CONFIG } from "./config";
import type { Order } from "./data";
import { formatPrice, haptic } from "./kit";
import { IconArrow, IconCheck, IconClipboard, IconCopy, IconSymbol } from "./icons";
import { Sheet } from "./chrome";

/* ============================================================
   1. ONBOARDING TOOLTIPS — 3 short tips on first visit
   ============================================================ */

type TooltipStep = { title: string; text: string; icon: string; arrow: string };

export function OnboardingTooltips({
  active,
  onComplete,
}: {
  active: boolean;
  onComplete: () => void;
}) {
  const { t, lang } = useI18n();
  const [idx, setIdx] = useState(0);

  if (!active) return null;

  const steps: TooltipStep[] = [
    { title: t("tip1Title"), text: t("tip1Text"), icon: "🛒", arrow: "↓" },
    { title: t("tip2Title"), text: t("tip2Text"), icon: "📦", arrow: "↓" },
    { title: t("tip3Title"), text: t("tip3Text"), icon: "👈", arrow: "←" },
  ];

  const step = steps[idx];

  const next = () => {
    haptic("medium");
    if (idx < steps.length - 1) setIdx(idx + 1);
    else onComplete();
  };

  return (
    <div className="fixed inset-0 z-[88]">
      {/* Dimmed backdrop */}
      <div className="absolute inset-0 bg-pinedeep/50 backdrop-blur-[2px]" />

      {/* Tooltip card — bottom center */}
      <div
        className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+150px)] left-1/2 w-[min(92vw,360px)] -translate-x-1/2 animate-pop"
        key={idx}
      >
        <div className="relative overflow-hidden rounded-[26px] bg-paper shadow-lift text-ink">
          {/* Gradient illustration header */}
          <div
            className="relative h-[130px]"
            style={{ background: ["linear-gradient(135deg,#1f2937 0%,#6b7280 100%)", "linear-gradient(135deg,#8a5a1a 0%,#1f2937 100%)", "linear-gradient(135deg,#1a3a6b 0%,#2f7fd9 100%)"][idx] }}
          >
            <div className="animate-floaty-soft absolute left-4 top-4 h-10 w-10 rounded-full bg-white/15" />
            <div className="animate-floaty-soft absolute right-6 top-8 h-6 w-6 rounded-full bg-white/15" style={{ animationDelay: "0.7s" }} />
            <div className="absolute bottom-2 left-1/2 h-8 w-8 -translate-x-1/2 rounded-full bg-white/10" />
            <div className="animate-bump absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[52px] drop-shadow-lg">
              <IconSymbol symbol={step.icon} size={30} />
            </div>
          </div>

          {/* Step badge */}
          <span className="absolute left-4 top-3 rounded-full bg-black/25 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
            {idx + 1} / {steps.length}
          </span>

          <div className="p-5 pt-4 text-center">
            <p className="font-display text-[16px] font-bold text-ink">{step.title}</p>
            <p className="mx-auto mt-1.5 max-w-[300px] text-[13px] font-medium leading-relaxed text-ink/65">{step.text}</p>

            <div className="mt-4 flex items-center justify-center gap-1.5">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === idx ? "w-6 bg-amber" : "w-1.5 bg-amber/20"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={next}
              className="btn-shine press mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-amber text-[14px] font-bold text-white shadow-soft"
            >
              {idx === steps.length - 1 ? t("tipDone") : t("tipNext")}
              <IconArrow size={14} />
            </button>
            {idx < steps.length - 1 && (
              <button onClick={onComplete} className="press mt-2.5 text-[11px] font-bold text-ink/60 underline-offset-2 hover:underline">
                {lang === "ru" ? "Пропустить" : lang === "en" ? "Skip" : "O'tkazib yuborish"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Spotlight hints */}
      {idx === 0 && (
        <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+92px)] left-1/2 -translate-x-1/2 flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber/60 shadow-[0_0_40px_rgba(11,107,68,0.4)]">
          <IconSymbol symbol="🛒" size={27} />
        </div>
      )}
      {idx === 1 && (
        <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+92px)] left-1/2 -translate-x-1/2 h-16 w-16 rounded-full border-2 border-moss/60 shadow-[0_0_40px_rgba(18,160,95,0.4)]" />
      )}
    </div>
  );
}

/* ============================================================
   2. ORDER EXPORT — text report for accountants
   ============================================================ */

export function OrderExportSheet({
  open,
  onClose,
  orders,
}: {
  open: boolean;
  onClose: () => void;
  orders: Order[];
}) {
  const { t, lang } = useI18n();
  const [copied, setCopied] = useState(false);

  const report = (() => {
    const header = [
      "═══════════════════════════════════════",
      "  DELIS — HISOB-FAKTURA / EXPORT",
      `  ${new Date().toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long", year: "numeric" })}`,
      "═══════════════════════════════════════",
      "",
    ].join("\n");

    const body = orders
      .map((o, i) => {
        const items = o.items.map((it) => `    • ${it.name} × ${it.qty} — ${formatPrice(it.price * it.qty, lang)}`).join("\n");
        return [
          `${i + 1}. #${o.id} · ${o.date} · ${o.status}`,
          items,
          `  ${t("cartTotal")}: ${formatPrice(o.total, lang)}`,
          o.promoCode ? `  Promo: ${o.promoCode} (−${formatPrice(o.discount, lang)})` : "",
          o.deliveryFee > 0 ? `  Delivery: ${formatPrice(o.deliveryFee, lang)}` : "",
          "",
        ].join("\n");
      })
      .join("");

    const total = orders.reduce((s, o) => s + o.total, 0);
    const footer = [
      "═══════════════════════════════════════",
      `  Orders: ${orders.length}`,
      `  ${t("cartTotal")}: ${formatPrice(total, lang)}`,
      "═══════════════════════════════════════",
    ].join("\n");

    return header + body + footer;
  })();

  const copy = async () => {
    haptic("medium");
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("exportOrders")}>
      {orders.length === 0 ? (
        <div className="py-12 text-center">
          <div className="motion-icon-tile mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-sagetint text-pine"><IconClipboard size={28} /></div>
          <p className="mt-4 font-display text-[16px] font-bold text-ink">{t("exportOrdersEmpty")}</p>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          <p className="text-[12px] font-medium text-ink/70">{t("exportOrdersDesc")}</p>
          <div className="overflow-hidden rounded-[20px] border border-ink/18 bg-card p-4">
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink/80 max-h-[260px] overflow-y-auto">
              {report}
            </pre>
          </div>
          <button
            onClick={copy}
            className={`press flex h-13 w-full items-center justify-center gap-2 rounded-[20px] text-[14px] font-bold transition-colors ${copied ? "bg-moss text-white" : "bg-amber text-white"}`}
          >
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            {copied ? t("exportOrdersReady") : t("bankCopyAll")}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/* ============================================================
   3. BANK REQUISITES / COMPANY DETAILS — B2B
   ============================================================ */

/* Single source of truth: src/config.ts (COMPANY_NAME + REQUISITES). */
const REQUISITES = { name: CONFIG.COMPANY_NAME, ...CONFIG.REQUISITES };

export function BankDetailsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const allDetails = [
    `${t("bankName")}: ${REQUISITES.name}`,
    `${t("bankInn")}: ${REQUISITES.inn}`,
    `${t("bankMfo")}: ${REQUISITES.mfo}`,
    `${t("bankAccount")}: ${REQUISITES.account}`,
    `${t("bankBank")}: ${REQUISITES.bank}`,
    `${t("bankAddress")}: ${REQUISITES.address}`,
    `${t("bankDirector")}: ${REQUISITES.director}`,
  ].join("\n");

  const copyAll = async () => {
    haptic("medium");
    try {
      await navigator.clipboard.writeText(allDetails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("bankDetails")}>
      <div className="space-y-2.5 pt-1">
        {Object.entries(REQUISITES).map(([key, val]) => {
          const labelMap: Record<string, string> = {
            name: t("bankName"),
            inn: t("bankInn"),
            mfo: t("bankMfo"),
            account: t("bankAccount"),
            bank: t("bankBank"),
            address: t("bankAddress"),
            director: t("bankDirector"),
          };
          return (
            <div key={key} className="flex items-center justify-between rounded-[16px] bg-card border border-ink/6 px-4 py-3 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink/70">{labelMap[key]}</span>
              <span className="text-[13px] font-semibold text-ink">{val}</span>
            </div>
          );
        })}

        <button
          onClick={copyAll}
          className={`press mt-3 flex h-13 w-full items-center justify-center gap-2 rounded-[20px] text-[14px] font-bold transition-colors ${copied ? "bg-moss text-white" : "bg-amber text-white"}`}
        >
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          {copied ? t("bankCopied") : t("bankCopyAll")}
        </button>
      </div>
    </Sheet>
  );
}

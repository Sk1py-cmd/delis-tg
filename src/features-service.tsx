/**
 * DELIS — Сервис заказов: заказ в один клик, счёт, кнопка чата с менеджером, бейдж наличия.
 */
import { useEffect, useState } from "react";
import { useI18n } from "./i18n";
import { CONFIG } from "./config";
import { useSiteSettings, tgHref } from "./site-settings";
import { wholesalePrice, type Order, type Product } from "./data";
import { formatPrice, haptic, sendDataToBot, type TgUser } from "./kit";
import { IconCheck, IconCopy, IconMinus, IconPlus, IconSend } from "./icons";
import { Sheet } from "./chrome";

/* ============================================================
   1. ONE-CLICK ORDER — for wholesalers, no forms
   ============================================================ */

export function OneClickOrderSheet({
  open,
  onClose,
  product,
  initialQty = 6,
  user,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  initialQty?: number;
  user: TgUser | null;
}) {
  const { t, lang } = useI18n();
  const [qty, setQty] = useState(initialQty);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) {
      setQty(initialQty);
      setSent(false);
    }
  }, [open, initialQty]);

  if (!product) return null;

  const ws = wholesalePrice(product.price, qty);
  const total = ws.unit * qty;

  const send = () => {
    haptic("success");
    sendDataToBot({
      type: "one_click_order",
      product_id: product.id,
      product_name: product.name,
      qty,
      unit_price: ws.unit,
      discount_percent: ws.discount,
      total,
      currency: "UZS",
      customer: {
        tg_id: user?.id ?? null,
        tg_username: user?.username ?? null,
        name: [user?.first_name, user?.last_name].filter(Boolean).join(" ") || null,
        phone: user?.phone_number ?? null,
      },
    });
    setSent(true);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("oneClickTitle")}>
      {sent ? (
        <div className="animate-pop py-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-moss/12 text-moss">
            <IconCheck size={28} />
          </div>
          <h3 className="mt-4 font-display text-[17px] font-bold text-ink">{t("oneClickSent")}</h3>
          <button onClick={onClose} className="press mt-7 w-full rounded-[18px] bg-amber py-3.5 text-[14px] font-bold text-white">
            {t("done")}
          </button>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          <p className="text-[13px] font-medium text-ink/70">{t("oneClickSub")}</p>

          <div className="flex items-center gap-3.5 rounded-[20px] border border-ink/18 bg-card p-3.5">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[14px] bg-paper2">
              <img src={product.img} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[14px] font-bold text-ink">{product.name}</p>
              <p className="text-[12px] font-medium text-ink/70">
                {formatPrice(ws.unit, lang)} · {t("perUnit")}
                {ws.discount > 0 && <span className="ml-1 font-bold text-moss">−{ws.discount}%</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { haptic("light"); setQty(Math.max(1, qty - 1)); }}
                className="press flex h-9 w-9 items-center justify-center rounded-full border border-ink/18 text-ink/70"
              ><IconMinus size={14} /></button>
              <span className="w-7 text-center font-display text-[15px] font-bold text-ink">{qty}</span>
              <button
                onClick={() => { haptic("light"); setQty(qty + 1); }}
                className="press flex h-9 w-9 items-center justify-center rounded-full bg-amber text-white"
              ><IconPlus size={14} /></button>
            </div>
          </div>

          <div className="flex items-baseline justify-between rounded-[18px] bg-paper2/70 px-4 py-3">
            <span className="text-[13px] font-bold text-ink/60">{t("totalForQty")}</span>
            <span className="font-display text-[20px] font-bold text-ink">{formatPrice(total, lang)}</span>
          </div>

          <button
            onClick={send}
            className="press flex h-14 w-full items-center justify-center gap-2.5 rounded-[20px] bg-amber text-[15px] font-bold text-white shadow-lift"
          >
            <IconSend size={17} />
            {t("oneClickSend")}
          </button>
          <p className="text-center text-[11px] font-semibold text-ink/65">{t("oneClickNote")}</p>
        </div>
      )}
    </Sheet>
  );
}

/* ============================================================
   2. B2B INVOICE — text invoice for accounting
   ============================================================ */

export function InvoiceSheet({
  open,
  onClose,
  order,
  user,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  order: Order | null;
  user: TgUser | null;
  onToast: (msg: string) => void;
}) {
  const { t, lang } = useI18n();
  if (!order) return null;

  const invoiceNo = `INV-${order.id}`;
  const buyerName = order.recipientName || [user?.first_name, user?.last_name].filter(Boolean).join(" ");

  const invoiceText = [
    `═══ DELIS — ${t("invoiceTitle")} ═══`,
    `${t("invoiceNumber")}: ${invoiceNo}`,
    `${order.date}`,
    ``,
    `${t("invoiceSeller")}: ${CONFIG.COMPANY_NAME_SHORT}`,
    `${CONFIG.REQUISITES.address}`,
    `${t("invoiceBuyer")}: ${buyerName} · ${order.recipientPhone}`,
    ``,
    `${t("invoiceItems")}:`,
    ...order.items.map(
      (it, i) => `${i + 1}. ${it.name} — ${it.qty} × ${formatPrice(it.price, lang)} = ${formatPrice(it.price * it.qty, lang)}`,
    ),
    ``,
    `${t("subtotal")}: ${formatPrice(order.subtotal, lang)}`,
    order.discount > 0 ? `${t("discount")}: −${formatPrice(order.discount, lang)}` : "",
    `${t("deliveryFee")}: ${order.deliveryFee === 0 ? t("deliveryFree") : formatPrice(order.deliveryFee, lang)}`,
    `${t("cartTotal")}: ${formatPrice(order.total, lang)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const copy = async () => {
    haptic("medium");
    try {
      await navigator.clipboard.writeText(invoiceText);
      onToast(t("invoiceCopied"));
    } catch {
      onToast(t("invoiceCopied"));
    }
  };

  const sendToBot = () => {
    haptic("success");
    sendDataToBot({ type: "invoice_request", order_id: order.id, invoice_no: invoiceNo, invoice_text: invoiceText });
    onToast(t("invoiceCopied"));
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("invoiceTitle")}>
      <div className="space-y-4 pt-1">
        {/* Invoice preview — monospace paper style */}
        <div className="rounded-[20px] border border-ink/15 bg-card p-4">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink/85">{invoiceText}</pre>
        </div>

        <div className="flex gap-2.5">
          <button
            onClick={copy}
            className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-[18px] bg-paper2 text-[13px] font-bold text-ink"
          >
            <IconCopy size={15} /> {t("invoiceCopy")}
          </button>
          <button
            onClick={sendToBot}
            className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-[18px] bg-amber text-[13px] font-bold text-white"
          >
            <IconSend size={15} /> {t("sendReceiptToBot").split(" ")[0]}
          </button>
        </div>
        <p className="text-center text-[11px] font-semibold text-ink/65">{t("invoiceSendBot")}</p>
      </div>
    </Sheet>
  );
}

/* ============================================================
   3. FLOATING MANAGER CHAT BUTTON
   ============================================================ */

export function ManagerChatButton({ hidden = false }: { hidden?: boolean }) {
  const { supportTg } = useSiteSettings();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Auto-expand hint once, collapse after 4s
    const show = setTimeout(() => setExpanded(true), 3000);
    const hide = setTimeout(() => setExpanded(false), 8000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);

  if (hidden) return null;

  return (
    <a
      href={tgHref(supportTg)}
      target="_blank"
      rel="noreferrer"
      onClick={() => haptic("medium")}
      className="press fixed z-30 flex items-center gap-2.5 rounded-full bg-[#229ED9] text-white shadow-nav transition-all duration-500"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 148px)",
        right: "max(12px, calc(50vw - 199px))",
        padding: expanded ? "10px 16px 10px 12px" : "12px",
      }}
      aria-label={t("managerChat")}
    >
      <span className="relative flex h-7 w-7 items-center justify-center">
        <IconSend size={20} />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-[#4ADE80] ring-2 ring-[#229ED9]" />
      </span>
      {expanded && (
        <span className="animate-fadein max-w-[140px]">
          <span className="block text-[12px] font-bold leading-tight">{t("managerChat")}</span>
          <span className="block text-[10px] font-medium leading-tight opacity-80">{t("managerChatSub")}</span>
        </span>
      )}
    </a>
  );
}

/* ============================================================
   4. STOCK BADGE — reusable availability indicator
   ============================================================ */

export function StockBadge({ stock, compact = false }: { stock?: number; compact?: boolean }) {
  const { t } = useI18n();
  const s = stock ?? 0;

  const state = s <= 0 ? "out" : s <= 5 ? "low" : "ok";
  const label = state === "out" ? t("stockOut") : state === "low" ? `${t("stockLow")} · ${s} ${t("stockUnits")}` : `${t("stockInStock")} · ${s} ${t("stockUnits")}`;
  const dot = state === "out" ? "bg-amber/30" : state === "low" ? "bg-amber" : "bg-moss";
  const text = state === "out" ? "text-ink/70" : state === "low" ? "text-amberdeep" : "text-moss";

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot} ${state !== "out" ? "animate-pulse" : ""}`} />
        {state === "out" ? t("stockOut") : `${s} ${t("stockUnits")}`}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-[11px] font-bold shadow-sm ${text}`}>
      <span className={`h-2 w-2 rounded-full ${dot} ${state !== "out" ? "animate-pulse" : ""}`} />
      {label}
      <span className="text-[10px] font-semibold text-ink/60">· {t("stockWarehouse")}</span>
    </span>
  );
}

/**
 * DELIS — Удобство для бизнеса: экспорт CSV, печать счёта в PDF, журнал операций и аудит.
 */
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "./i18n";
import { CONFIG } from "./config";
import { useSiteSettings, phoneHref } from "./site-settings";
import { type Order } from "./data";
import { formatPrice, haptic } from "./kit";
import { IconCheck, IconCopy, IconFileText, IconNote, IconPhone, IconTrash, IconUser } from "./icons";
import { Sheet } from "./chrome";

/* ============================================================
   1. CSV EXPORT FOR 1C / EXCEL
   ============================================================ */

export function CsvExportSheet({
  open,
  onClose,
  orders,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  orders: Order[];
  onToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const csvContent = useMemo(() => {
    // Header with BOM for Excel Cyrillic support
    const header = ["id", "date", "status", "payment", "name", "phone", "region", "address", "items", "subtotal", "discount", "delivery_fee", "total"];
    const rows = orders.map((o) => [
      `#${o.id}`,
      o.date,
      o.status,
      o.paymentMethod,
      o.recipientName,
      o.recipientPhone,
      o.deliveryZone || "",
      (o.deliveryAddress || "").replace(/;/g, ","),
      o.items.map((it) => `${it.name} x${it.qty}`).join(" | "),
      o.subtotal,
      o.discount,
      o.deliveryFee,
      o.total,
    ]);

    const escape = (v: string | number) => {
      const s = String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [header, ...rows].map((row) => row.map(escape).join(";"));
    return "\uFEFF" + lines.join("\r\n");
  }, [orders]);

  const handleDownload = () => {
    haptic("success");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DELIS_orders_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onToast(t("csvDownloaded"));
  };

  const handleCopy = async () => {
    haptic("medium");
    try {
      await navigator.clipboard.writeText(csvContent.replace(/^\uFEFF/, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("csvTitle")}>
      <div className="space-y-4 pt-1">
        <p className="text-[13px] font-medium text-ink2">{t("csvDesc")}</p>

        <div className="rounded-[22px] border border-moss/20 bg-sagetint/60 p-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-pine"><IconFileText size={15} /> DELIS_orders_2026.csv</span>
            <span className="rounded-full bg-card px-2.5 py-0.5 text-[10px] font-bold text-ink2">
              {orders.length} qator
            </span>
          </div>
          <p className="mt-1 text-[11px] font-mono text-ink2/85">
            UTF-8 + BOM · ; separator · 1C & Excel ready
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2.5">
          <button
            onClick={handleDownload}
            className="press flex h-13 flex-1 items-center justify-center gap-2 rounded-[20px] bg-amber text-[14px] font-bold text-white shadow-lift hover:bg-pine"
          >
            <IconFileText size={16} />
            <span>{t("csvDownload")}</span>
          </button>
          <button
            onClick={handleCopy}
            className={`press flex h-13 w-13 items-center justify-center rounded-[20px] text-[13px] font-bold transition-colors ${
              copied ? "bg-moss text-white" : "bg-paper2 text-ink hover:bg-amber/10"
            }`}
            aria-label="Copy"
          >
            {copied ? <IconCheck size={17} /> : <IconCopy size={17} />}
          </button>
        </div>

        {/* Preview */}
        <div className="overflow-hidden rounded-[18px] border border-ink/18 bg-card">
          <p className="border-b border-ink/18 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-ink2">
            Ko'rinish
          </p>
          <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all p-3.5 font-mono text-[10px] leading-relaxed text-ink/70">
            {csvContent.slice(0, 900)}
            {csvContent.length > 900 ? "…" : ""}
          </pre>
        </div>
      </div>
    </Sheet>
  );
}

/* ============================================================
   2. PRINT / PDF INVOICE — uses browser print dialog
   ============================================================ */

export function printInvoiceAsPdf(order: Order, lang: "uz" | "ru" | "en") {
  haptic("medium");

  const printWindow = window.open("", "_blank", "width=800,height=900");
  if (!printWindow) {
    // Fallback: alert-free silent return
    return;
  }

  const itemsHtml = order.items
    .map(
      (it) => `
      <tr>
        <td>${it.name}</td>
        <td>${it.qty}</td>
        <td style="text-align:right">${formatPrice(it.price, lang)}</td>
        <td style="text-align:right">${formatPrice(it.price * it.qty, lang)}</td>
      </tr>`,
    )
    .join("");

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>DELIS Invoice #${order.id}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #0c1411; padding: 32px; }
          .brand { font-size: 22px; font-weight: 800; letter-spacing: 2px; color: #1f2937; }
          .muted { color: #54685f; font-size: 12px; }
          h1 { font-size: 18px; margin: 24px 0 4px; }
          .meta { display: flex; justify-content: space-between; flex-wrap: wrap; margin: 12px 0 20px; }
          .meta div { width: 48%; margin-bottom: 8px; }
          .label { color: #54685f; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
          .value { font-weight: 600; font-size: 13px; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; }
          th { background: #f2f5f3; text-align: left; font-size: 11px; padding: 8px; text-transform: uppercase; }
          td { padding: 8px; border-bottom: 1px solid #e5e9e7; font-size: 13px; }
          .totals { margin-top: 12px; text-align: right; }
          .totals div { margin: 4px 0; font-size: 13px; }
          .total-row { font-size: 17px; font-weight: 800; border-top: 2px solid #0c1411; padding-top: 8px; }
          .footer { margin-top: 40px; font-size: 11px; color: #54685f; border-top: 1px solid #e5e9e7; padding-top: 12px; }
        </style>
      </head>
      <body>
        <div class="brand">DELIS</div>
        <div class="muted">Uy va avto parvarish · Namangan zavodi</div>
        <h1>Инвойс / Invoice #${order.id}</h1>
        <div class="meta">
          <div>
            <div class="label">Дата / Date</div>
            <div class="value">${order.date}</div>
          </div>
          <div>
            <div class="label">Получатель / Recipient</div>
            <div class="value">${order.recipientName} · ${order.recipientPhone}</div>
          </div>
          <div>
            <div class="label">Адрес / Address</div>
            <div class="value">${order.deliveryAddress}</div>
          </div>
          <div>
            <div class="label">Доставка / Delivery</div>
            <div class="value">${order.deliveryTime} · ${order.deliveryMethod}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr><th>Товар</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals">
          <div>Подытог: ${formatPrice(order.subtotal, lang)}</div>
          ${order.discount > 0 ? `<div>Скидка (${order.promoCode}): -${formatPrice(order.discount, lang)}</div>` : ""}
          <div>Доставка: ${order.deliveryFee === 0 ? "Бесплатно" : formatPrice(order.deliveryFee, lang)}</div>
          <div class="total-row">Итого: ${formatPrice(order.total, lang)}</div>
        </div>

        <div class="footer">
          ${CONFIG.COMPANY_NAME_SHORT} · ${CONFIG.REQUISITES.address}<br/>
          Спасибо за покупку! / Xaridingiz uchun rahmat!
        </div>

        <script>window.onload = () => { window.print(); };</script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

/* ============================================================
   3. OPERATION LOGS (admin audit trail)
   ============================================================ */

export type OpLogEntry = {
  id: string;
  time: number;
  action: string;
  detail: string;
  operator: string;
};

export function loadOpLogs(): OpLogEntry[] {
  try {
    const raw = localStorage.getItem("delis_op_logs");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function appendOpLog(entry: Omit<OpLogEntry, "id" | "time">) {
  try {
    const logs = loadOpLogs();
    logs.unshift({ ...entry, id: `op-${Date.now()}`, time: Date.now() });
    localStorage.setItem("delis_op_logs", JSON.stringify(logs.slice(0, 100)));
  } catch {}
}

/** Structured audit entry: what changed specifically */
export type AuditChange = {
  field: string;
  before: string | number;
  after: string | number;
};

export function appendAuditLog({
  entity,
  field,
  before,
  after,
  operator = "Admin",
  tag,
}: {
  entity: string;
  field: string;
  before: string | number;
  after: string | number;
  operator?: string;
  tag?: string;
}) {
  appendOpLog({
    action: "✏️",
    detail: `${entity}: ${field} ${before} → ${after}${tag ? ` · ${tag}` : ""}`,
    operator,
  });
}

/** Audit for status transitions */
export function appendStatusLog({
  entityId,
  fromStatus,
  toStatus,
  operator = "Admin",
}: {
  entityId: string;
  fromStatus: string;
  toStatus: string;
  operator?: string;
}) {
  appendAuditLog({
    entity: `#${entityId}`,
    field: "status",
    before: fromStatus,
    after: toStatus,
    operator,
  });
}

/** Audit for composition changes (stock, price, etc.) */
export function appendProductLog({
  productId,
  changes,
  operator = "Admin",
}: {
  productId: string;
  changes: Record<string, unknown>;
  operator?: string;
}) {
  const detail = Object.entries(changes)
    .map(([key, val]) => `${key}=${val}`)
    .join(" · ");
  appendAuditLog({
    entity: productId,
    field: detail ? "props" : "",
    before: "",
    after: detail,
    operator,
  });
}

export function OpLogsSheet({ open, onClose, onToast }: { open: boolean; onClose: () => void; onToast: (msg: string) => void }) {
  const { t } = useI18n();
  const [logs, setLogs] = useState<OpLogEntry[]>([]);

  useEffect(() => {
    if (open) setLogs(loadOpLogs());
  }, [open]);

  const clearLogs = () => {
    haptic("light");
    localStorage.removeItem("delis_op_logs");
    setLogs([]);
    onToast(t("opLogCleared"));
  };

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "now";
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("opLogsTitle")}>
      <div className="space-y-3 pt-1">
        {logs.length === 0 ? (
          <div className="py-10 text-center">
            <div className="motion-icon-tile mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-paper2 text-pine"><IconNote size={28} /></div>
            <p className="mt-4 text-[13px] font-medium text-ink2">{t("opLogsEmpty")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-ink2">{logs.length} operatsiya</span>
              <button
                onClick={clearLogs}
                className="press flex items-center gap-1.5 rounded-full bg-[#B3402E]/10 px-3 py-1.5 text-[11px] font-bold text-[#B3402E]"
              >
                <IconTrash size={12} /> {t("opLogsClear")}
              </button>
            </div>
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-[16px] border border-ink/18 bg-card p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[13px] font-bold text-ink">{log.action}</span>
                    <span className="font-mono text-[10px] text-ink2">{timeAgo(log.time)}</span>
                  </div>
                  <p className="mt-0.5 text-[12px] font-medium text-ink2">{log.detail}</p>
                  <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-moss"><IconUser size={12} /> {log.operator}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ============================================================
   4. FLOATING QUICK CALL BUTTON — for manager contact
   ============================================================ */

export function FloatingQuickCallButton({ hidden = false }: { hidden?: boolean }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const { supportPhone } = useSiteSettings();

  useEffect(() => {
    const show = setTimeout(() => setExpanded(true), 6000);
    const hide = setTimeout(() => setExpanded(false), 12000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  if (hidden) return null;

  return (
    <a
      href={phoneHref(supportPhone)}
      onClick={() => haptic("medium")}
      className="press fixed z-30 flex items-center gap-2.5 rounded-full bg-[#1f2937] text-white shadow-nav transition-all duration-500 hover:bg-[#1f2937]"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 148px)",
        left: "max(12px, calc(50vw - 199px))",
        padding: expanded ? "10px 16px 10px 12px" : "12px",
      }}
      aria-label={t("quickCallTooltip")}
    >
      <span className="relative flex h-7 w-7 items-center justify-center">
        <IconPhone size={19} />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-amber ring-2 ring-[#1f2937]" />
      </span>
      {expanded && (
        <span className="animate-fadein max-w-[150px]">
          <span className="block text-[12px] font-bold leading-tight">{t("quickCall")}</span>
          <span className="block text-[10px] font-medium leading-tight opacity-80">{supportPhone}</span>
        </span>
      )}
    </a>
  );
}

/**
 * DELIS Admin — premium UI primitives.
 * Pure presentation: no business logic, no API calls.
 * Colours resolve through the CSS variables overridden by `.admin-pro`,
 * so the whole panel re-themes from one place (see index.css).
 */
import type { ReactNode } from "react";
import { IconSearch } from "./icons";

/* ─────────────────────────── Card ─────────────────────────── */

export function AdminCard({
  children,
  className = "",
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "gold" | "green";
}) {
  const toneCls =
    tone === "gold"
      ? "border-amber/25 bg-gradient-to-b from-amber/[0.10] via-card to-card"
      : tone === "green"
        ? "border-moss/20 bg-gradient-to-b from-sagetint/60 via-card to-card"
        : "border-white/8 bg-card/85";
  return (
    <div className={`rounded-[22px] border p-4 shadow-[0_20px_44px_-28px_rgba(0,0,0,0.9)] ${toneCls} ${className}`}>
      {children}
    </div>
  );
}

/* ───────────────────── Section label ──────────────────────── */

export function AdminSectionLabel({
  icon,
  children,
  action,
}: {
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="flex min-w-0 items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink2">
        {icon}
        <span className="truncate">{children}</span>
      </p>
      {action}
    </div>
  );
}

/* ─────────────────────────── KPI ──────────────────────────── */

export function AdminKpi({
  label,
  value,
  icon,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: string;
  tone?: "default" | "gold" | "green" | "blue" | "red";
}) {
  const valueCls =
    tone === "gold"
      ? "text-amber"
      : tone === "green"
        ? "text-moss"
        : tone === "blue"
          ? "text-sky-300"
          : tone === "red"
            ? "text-rose-300"
            : "text-ink";
  return (
    <div className="rounded-[18px] border border-white/8 bg-card/85 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-ink2">{label}</p>
        {icon && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] border border-white/8 bg-white/4 text-ink2">
            {icon}
          </span>
        )}
      </div>
      <p className={`mt-2 font-display text-[17px] font-extrabold leading-none ${valueCls}`}>{value}</p>
      {hint && <p className="mt-1.5 truncate text-[10px] font-semibold text-ink/45">{hint}</p>}
    </div>
  );
}

/* ───────────────────────── Progress ───────────────────────── */

export function AdminBar({
  pct,
  tone = "gold",
  className = "",
}: {
  pct: number;
  tone?: "gold" | "green" | "blue";
  className?: string;
}) {
  const toneCls =
    tone === "green"
      ? "from-moss/70 to-moss"
      : tone === "blue"
        ? "from-sky-400/70 to-sky-300"
        : "from-amber/70 to-amber";
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-white/6 ${className}`}>
      <div
        className={`h-full rounded-full bg-gradient-to-r ${toneCls} transition-all duration-500`}
        style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

/* ─────────────────────── Status pill ──────────────────────── */

const STATUS_TONES: Record<string, string> = {
  new: "border-amber/40 bg-amber/12 text-amber",
  preparing: "border-sky-400/40 bg-sky-400/12 text-sky-300",
  shipped: "border-violet-400/40 bg-violet-400/12 text-violet-300",
  delivered: "border-moss/40 bg-moss/12 text-moss",
  canceled: "border-rose-400/40 bg-rose-400/12 text-rose-300",
};

export function AdminStatusPill({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] ${STATUS_TONES[status] || "border-white/10 bg-white/5 text-ink2"}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}

/* ───────────────────────── Chip ───────────────────────────── */

export function AdminChip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-bold transition-all ${
        active
          ? "border-amber/50 bg-gradient-to-r from-amber to-amberdeep text-[#17110a] shadow-[0_8px_20px_-8px_rgba(232,200,116,0.65)]"
          : "border-white/8 bg-card/80 text-ink2 hover:border-white/15 hover:text-ink"
      }`}
    >
      {children}
      {typeof count === "number" && (
        <span
          className={`rounded-full px-1.5 py-0.5 font-display text-[9px] font-bold ${
            active ? "bg-black/10 text-[#17110a]" : "bg-paper2 text-ink2"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* ───────────────────────── Search ─────────────────────────── */

export function AdminSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink2">
        <IconSearch size={15} />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[16px] border border-white/10 bg-card/85 py-3 pl-10 pr-3.5 text-[13px] font-semibold text-ink outline-none placeholder:text-ink/35 focus:border-amber/50 focus:ring-2 focus:ring-amber/10"
      />
    </div>
  );
}

/* ───────────────────────── Button ─────────────────────────── */

export function AdminBtn({
  children,
  onClick,
  icon,
  variant = "soft",
  disabled,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  variant?: "primary" | "soft" | "ghost" | "danger" | "green";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const variantCls =
    variant === "primary"
      ? "bg-gradient-to-r from-amber to-amberdeep text-[#17110a] shadow-[0_10px_24px_-10px_rgba(232,200,116,0.6)]"
      : variant === "green"
        ? "bg-sagetint/70 border border-moss/25 text-moss"
        : variant === "danger"
          ? "border border-rose-400/25 bg-rose-400/8 text-rose-300"
          : variant === "ghost"
            ? "border border-white/10 bg-white/4 text-ink2 hover:text-ink"
            : "border border-white/10 bg-card/85 text-ink/75 hover:text-ink";
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`press inline-flex h-10 items-center justify-center gap-2 rounded-[14px] px-3.5 text-[12px] font-bold transition-all disabled:opacity-35 ${variantCls} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

/* ─────────────────────── Empty state ──────────────────────── */

export function AdminEmpty({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <div className="rounded-[20px] border border-white/8 bg-card/70 p-8 text-center">
      <p className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] border border-white/8 bg-white/4 text-ink2">
        {icon || "📭"}
      </p>
      <p className="mt-2.5 text-[13px] font-semibold text-ink2">{text}</p>
    </div>
  );
}

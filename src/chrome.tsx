/**
 * DELIS — «Каркас» интерфейса: верхняя панель с брендом, нижняя навигация по вкладкам, заголовки секций, всплывающие тосты и кнопка «наверх». То, что повторяется на всех экранах.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useI18n, type TKey } from "./i18n";
import { haptic, lockScroll, Reveal, unlockScroll } from "./kit";
import { IconArrow, IconBag, IconBell, IconBox, IconClose, IconDots, IconGrid, IconHome, IconMoon, IconSun, IconUser } from "./icons";
import { BrandWordmark } from "./brand";

/* ---------------- Top bar (native Telegram Mini App chrome) ---------------- */

export function TopBar({
  onAction,
  onNotifications,
  notifCount = 0,
  theme,
  onToggleTheme,
}: {
  onAction: () => void;
  onNotifications?: () => void;
  notifCount?: number;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-40 bg-paper/80 backdrop-blur-2xl"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex h-12 items-center justify-between border-b border-ink/6 bg-paper/80 px-4 transition-colors duration-300 dark:border-white/8">
        <button
          aria-label="Menu"
          className="press -ml-1 flex h-9 w-9 items-center justify-center rounded-full text-ink/75 hover:bg-amber/6"
          onClick={() => {
            haptic("light");
            onAction();
          }}
        >
          <IconDots size={20} />
        </button>
        <BrandWordmark className="h-[22px] w-[96px] dark:invert" />
        <div className="flex items-center gap-0.5">
          {onNotifications && (
            <button
              aria-label="Notifications"
              className="press relative flex h-9 w-9 items-center justify-center rounded-full text-ink/75 hover:bg-amber/6"
              onClick={() => {
                haptic("light");
                onNotifications();
              }}
            >
              <IconBell size={19} />
              {notifCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E11D48] px-1 text-[8px] font-bold text-white">
                  {notifCount}
                </span>
              )}
            </button>
          )}
          <button
            aria-label="Toggle Theme"
            className="press -mr-1 flex h-9 w-9 items-center justify-center rounded-full text-ink/75 hover:bg-ink/6"
            onClick={() => {
              haptic("light");
              onToggleTheme();
            }}
          >
            {theme === "dark" ? <IconMoon size={19} /> : <IconSun size={19} />}
          </button>
        </div>
      </div>
    </header>
  );
}

/* ---------------- Section heading ---------------- */

export function SectionHead({
  title,
  sub,
  dark = false,
  right,
}: {
  title: string;
  sub?: string;
  dark?: boolean;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <Reveal>
        <h2
          className={`font-display text-[24px] font-bold leading-tight tracking-tight ${
            dark ? "text-white" : "text-ink"
          }`}
        >
          {title}
        </h2>
        {sub && <p className={`mt-1.5 text-[13px] ${dark ? "text-white/60" : "text-ink2"}`}>{sub}</p>}
      </Reveal>
      {right && <Reveal delay={120}>{right}</Reveal>}
    </div>
  );
}

/* ---------------- Bottom navigation ---------------- */

export type Tab = "home" | "catalog" | "cart" | "orders" | "profile";

const TABS: {
  id: Tab;
  icon: (p: { size?: number; filled?: boolean }) => ReactNode;
  label: TKey;
  color: string; // iOS system color per tab (used for active tint + pill)
  tint: string; // translucent bg for active pill
}[] = [
  { id: "home", icon: (p) => <IconHome {...p} />, label: "navHome", color: "#638872", tint: "rgba(99,136,114,0.18)" },
  { id: "catalog", icon: (p) => <IconGrid {...p} />, label: "navCatalog", color: "#638872", tint: "rgba(99,136,114,0.18)" },
  { id: "cart", icon: (p) => <IconBag {...p} />, label: "navCart", color: "#638872", tint: "rgba(99,136,114,0.18)" },
  { id: "orders", icon: (p) => <IconBox {...p} />, label: "navOrders", color: "#638872", tint: "rgba(99,136,114,0.18)" },
  { id: "profile", icon: (p) => <IconUser {...p} />, label: "navProfile", color: "#638872", tint: "rgba(99,136,114,0.18)" },
];

export function BottomNav({
  tab,
  cartCount,
  onTab,
}: {
  tab: Tab;
  cartCount: number;
  onTab: (t: Tab) => void;
}) {
  const { t } = useI18n();
  const idx = TABS.findIndex((x) => x.id === tab);
  return (
    <nav
      className="fixed inset-x-0 z-40 px-3"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
    >
      <div className="relative mx-auto max-w-[406px]">
        {/* iOS-style floating glass bar: light frosted glass in light theme,
            dark frosted glass in dark theme, soft shadow + hairline border */}
        <div className="cinematic-nav relative grid h-[68px] grid-cols-5 overflow-hidden rounded-[26px] border border-black/5 bg-white/75 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur-2xl dark:border-white/12 dark:bg-[#1c242c]/80 dark:shadow-[0_10px_40px_-12px_rgba(0,0,0,0.8)]">
          {/* Sliding active pill behind the selected icon (iOS style) */}
          <div
            className="cinematic-nav__pill absolute top-[6px] bottom-[6px] rounded-full bg-black/[0.06] transition-[left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-white/[0.12]"
            style={{ width: "calc(20% - 8px)", left: `calc(${idx * 20}% + 4px)` }}
          />
          {TABS.map((x) => {
            const active = x.id === tab;
            return (
              <button
                key={x.id}
                onClick={() => onTab(x.id)}
                className="relative z-10 flex flex-col items-center justify-center gap-[3px]"
                aria-label={t(x.label)}
              >
                <span
                  className="relative flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-300"
                  style={active ? { backgroundColor: x.tint } : undefined}
                >
                  <span
                    key={active ? "on" : "off"}
                    className={`relative transition-all duration-300 ${
                      active
                        ? "scale-[1.08] animate-bump"
                        : "text-[#9aa0a6] hover:text-[#638872] dark:text-[#8b949d] dark:hover:text-[#638872]"
                    }`}
                    style={active ? { color: x.color } : undefined}
                  >
                    {x.icon({ size: 22, filled: active })}
                    {x.id === "cart" && cartCount > 0 && (
                      <span
                        key={cartCount}
                        className="animate-bump absolute -right-2.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#E11D48] px-1 font-display text-[9px] font-bold text-white shadow-[0_2px_8px_rgba(225,29,72,0.5)]"
                      >
                        {cartCount}
                      </span>
                    )}
                  </span>
                </span>
                <span
                  className={`text-[9.5px] font-semibold tracking-wide transition-colors duration-300 ${
                    active ? "text-[#30253E] dark:text-[#f5f5f7]" : "text-[#9aa0a6] dark:text-[#8b949d]"
                  }`}
                  style={active ? { color: x.color } : undefined}
                >
                  {t(x.label)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/* ---------------- Scroll-to-top ---------------- */

export function ScrollTop({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      aria-label={t("toTop")}
      className={`press fixed z-30 flex h-11 items-center gap-1.5 rounded-full border border-white/15 bg-[#30253E]/90 pl-3.5 pr-3 text-[11px] font-bold text-white shadow-nav backdrop-blur-xl transition-all duration-500 dark:bg-[#182128]/95 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)", right: "max(12px, calc(50vw - 199px))" }}
    >
      <IconArrow size={15} className="-rotate-90" />
      {t("toTop")}
    </button>
  );
}

/* ---------------- Toast ---------------- */

export function Toast({ msg, toastKey }: { msg: string | null; toastKey: number }) {
  if (!msg) return null;
  return (
    <div
      key={toastKey}
      className="animate-rise pointer-events-none fixed left-1/2 z-[70] -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-[#30253E] px-5 py-2.5 text-[13px] font-semibold text-white shadow-lift dark:bg-[#182128]"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)" }}
    >
      {msg}
    </div>
  );
}

/* ---------------- Bottom sheet ---------------- */

export function Sheet({
  open,
  onClose,
  children,
  title,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  footer?: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      lockScroll();
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    unlockScroll();
    const timer = setTimeout(() => setMounted(false), 380);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(
    () => () => {
      unlockScroll();
    },
    [],
  );

  if (!mounted) return null;
  return (
    <div className="fixed inset-0 z-50" aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-[3px] transition-opacity duration-400 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`absolute bottom-0 left-1/2 flex max-h-[92dvh] w-full max-w-[430px] -translate-x-1/2 flex-col rounded-t-[30px] border-t border-ink/15 bg-paper shadow-lift transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex flex-col items-center pb-1 pt-3">
          <span className="h-[5px] w-10 rounded-full bg-amber/15" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-4 pb-2 pt-1 min-[390px]:px-6">
            <h3 className="font-display text-[19px] font-bold tracking-tight text-ink">{title}</h3>
            <button
              onClick={onClose}
              aria-label="Close"
              className="press flex h-9 w-9 items-center justify-center rounded-full bg-amber/6 text-ink/70 hover:bg-amber/10"
            >
              <IconClose size={16} />
            </button>
          </div>
        )}
        <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] min-[390px]:px-6 min-[390px]:pb-[calc(env(safe-area-inset-bottom,0px)+28px)] pt-2 text-ink">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-ink/10 bg-paper/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur-xl min-[390px]:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

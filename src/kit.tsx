/**
 * DELIS — Низкоуровневые переиспользуемые утилиты и мелкие компоненты: работа с Telegram (initData, вибрация, оплата), форматирование цен, анимации появления блоков, тип пользователя.
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { Lang } from "./i18n";

/* ---------------- Telegram bridge ---------------- */

export type TgUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  phone_number?: string;
  language_code?: string;
  photo_url?: string;
};

export function getTelegramUser(): TgUser | null {
  try {
    const tg = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: TgUser } } } })
      .Telegram?.WebApp;
    return tg?.initDataUnsafe?.user ?? null;
  } catch {
    return null;
  }
}

/** Sends structured order data straight to the bot the user opened the Mini App from.
 *  Telegram delivers it as a `web_app_data` service message to the bot. */
export function sendDataToBot(payload: unknown): boolean {
  try {
    const tg = (window as unknown as {
      Telegram?: { WebApp?: { sendData?: (data: string) => void } };
    }).Telegram?.WebApp;
    if (tg?.sendData) {
      tg.sendData(JSON.stringify(payload));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Requests the user's phone number via Telegram's native contact prompt. */
export function requestTelegramContact(cb: (phone: string | null) => void) {
  try {
    const tg = (window as unknown as {
      Telegram?: {
        WebApp?: {
          requestContact?: (
            cb: (ok: boolean, res?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => void,
          ) => void;
        };
      };
    }).Telegram?.WebApp;
    if (tg?.requestContact) {
      tg.requestContact((ok, res) => {
        cb(ok ? res?.responseUnsafe?.contact?.phone_number ?? null : null);
      });
    } else {
      cb(null);
    }
  } catch {
    cb(null);
  }
}

export function initTelegram() {
  try {
    const tg = (window as unknown as {
      Telegram?: {
        WebApp?: {
          ready?: () => void;
          expand?: () => void;
          setHeaderColor?: (c: string) => void;
          setBackgroundColor?: (c: string) => void;
        };
      };
    }).Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
    // Header/background color is set by App's theme effect (light/dark aware);
    // setting a stale color here caused a navy flash on launch.
  } catch {
    /* not in Telegram — ignore */
  }
}

/** Opens Telegram's native invoice modal for XTR / Stars payments. */
export function openTelegramInvoice(
  invoiceUrl: string,
  onDone?: (status: "paid" | "cancelled" | "failed" | "pending") => void,
) {
  try {
    const tg = (window as unknown as {
      Telegram?: { WebApp?: { openInvoice?: (url: string, cb?: (status: string) => void) => void } };
    }).Telegram?.WebApp;
    if (tg?.openInvoice) {
      tg.openInvoice(invoiceUrl, (status) => {
        onDone?.(status as "paid" | "cancelled" | "failed" | "pending");
      });
      return true;
    }
    window.open(invoiceUrl, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

/* ---------------- Telegram Native MainButton & BackButton ---------------- */

type MainButtonParams = {
  text: string;
  onClick?: () => void;
  color?: string;
  textColor?: string;
  isActive?: boolean;
  isVisible?: boolean;
  isProgress?: boolean;
};

let currentMainButtonClick: (() => void) | null = null;
let currentBackButtonClick: (() => void) | null = null;

export function updateTelegramMainButton(params: MainButtonParams) {
  try {
    const mb = (window as unknown as {
      Telegram?: {
        WebApp?: {
          MainButton?: {
            setText: (t: string) => void;
            onClick: (fn: () => void) => void;
            offClick: (fn: () => void) => void;
            show: () => void;
            hide: () => void;
            enable: () => void;
            disable: () => void;
            showProgress: (leaveActive?: boolean) => void;
            hideProgress: () => void;
            setParams: (p: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }) => void;
          };
        };
      };
    }).Telegram?.WebApp?.MainButton;

    if (!mb) return;

    if (currentMainButtonClick) {
      mb.offClick(currentMainButtonClick);
      currentMainButtonClick = null;
    }

    if (params.isVisible !== false && params.text) {
      mb.setParams({
        text: params.text,
        color: params.color || "#1f2937", // DELIS Amber
        text_color: params.textColor || "#00143b", // DELIS Pine Deep
        is_active: params.isActive !== false,
        is_visible: true,
      });

      if (params.onClick) {
        currentMainButtonClick = params.onClick;
        mb.onClick(currentMainButtonClick);
      }

      if (params.isProgress) mb.showProgress(false);
      else mb.hideProgress();

      mb.show();
    } else {
      mb.hide();
    }
  } catch {
    /* ignore outside Telegram */
  }
}

export function hideTelegramMainButton() {
  try {
    const mb = (window as unknown as {
      Telegram?: { WebApp?: { MainButton?: { hide: () => void; offClick: (fn: () => void) => void } } };
    }).Telegram?.WebApp?.MainButton;
    if (mb) {
      if (currentMainButtonClick) {
        mb.offClick(currentMainButtonClick);
        currentMainButtonClick = null;
      }
      mb.hide();
    }
  } catch {
    /* ignore */
  }
}

export function updateTelegramBackButton(onClick: (() => void) | null) {
  try {
    const bb = (window as unknown as {
      Telegram?: { WebApp?: { BackButton?: { show: () => void; hide: () => void; onClick: (fn: () => void) => void; offClick: (fn: () => void) => void } } };
    }).Telegram?.WebApp?.BackButton;

    if (!bb) return;

    if (currentBackButtonClick) {
      bb.offClick(currentBackButtonClick);
      currentBackButtonClick = null;
    }

    if (onClick) {
      currentBackButtonClick = onClick;
      bb.onClick(currentBackButtonClick);
      bb.show();
    } else {
      bb.hide();
    }
  } catch {
    /* ignore */
  }
}

/* ---------------- Telegram CloudStorage / LocalStorage Bridge ---------------- */

export async function storageSetItem(key: string, value: string): Promise<boolean> {
  // Always write to localStorage for instant sync & offline
  try {
    localStorage.setItem(`delis_${key}`, value);
  } catch {
    /* ignore */
  }

  // Also write to Telegram CloudStorage if available
  return new Promise((resolve) => {
    try {
      const cs = (window as unknown as {
        Telegram?: { WebApp?: { CloudStorage?: { setItem: (k: string, v: string, cb?: (err: Error | null, stored: boolean) => void) => void } } };
      }).Telegram?.WebApp?.CloudStorage;
      if (cs?.setItem) {
        cs.setItem(`delis_${key}`, value, (err, stored) => {
          resolve(!err && !!stored);
        });
      } else {
        resolve(true);
      }
    } catch {
      resolve(true);
    }
  });
}

export async function storageGetItem(key: string): Promise<string | null> {
  // First try localStorage
  let localVal: string | null = null;
  try {
    localVal = localStorage.getItem(`delis_${key}`);
  } catch {
    /* ignore */
  }

  if (localVal !== null) return localVal;

  // Fallback / sync from Telegram CloudStorage
  return new Promise((resolve) => {
    try {
      const cs = (window as unknown as {
        Telegram?: { WebApp?: { CloudStorage?: { getItem: (k: string, cb: (err: Error | null, val?: string) => void) => void } } };
      }).Telegram?.WebApp?.CloudStorage;
      if (cs?.getItem) {
        cs.getItem(`delis_${key}`, (err, val) => {
          if (!err && val) {
            try {
              localStorage.setItem(`delis_${key}`, val);
            } catch {
              /* ignore */
            }
            resolve(val);
          } else {
            resolve(null);
          }
        });
      } else {
        resolve(null);
      }
    } catch {
      resolve(null);
    }
  });
}

/** Open native Telegram Share modal for viral/friend sharing */
export function openTelegramShare(url: string, text: string) {
  haptic("light");
  try {
    const tg = (window as unknown as {
      Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } };
    }).Telegram?.WebApp;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, "_blank");
    }
  } catch {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, "_blank");
  }
}

/* Scroll-lock with a counter so NESTED overlays don't fight each other:
   each open() locks, each close() unlocks; the body only gets released
   when the LAST overlay closes. Fixes background scroll jumping when two
   sheets are open at once. */
let scrollLockCount = 0;
export function lockScroll() {
  scrollLockCount++;
  document.body.style.overflow = "hidden";
  // Some WebViews (iOS Safari / Telegram) scroll the <html> element, not
  // <body> — lock both so the page behind a sheet never moves.
  document.documentElement.style.overflow = "hidden";
}
export function unlockScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  }
}

export function haptic(style: "light" | "medium" | "success" | "error" = "light") {
  try {
    const fb = (window as unknown as {
      Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred?: (s: string) => void; notificationOccurred?: (s: string) => void } } };
    }).Telegram?.WebApp?.HapticFeedback;
    if (style === "success" || style === "error") fb?.notificationOccurred?.(style);
    else fb?.impactOccurred?.(style);
  } catch {
    /* ignore */
  }
}

/* ---------------- motion ---------------- */

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fn = () => setReduced(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduced;
}

/** Live online/offline status from the browser network events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/* ---------------- Skeleton loading ---------------- */
export function useSimulatedLoading(delay = 650) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return loading;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/* ---------------- Pull-to-refresh ---------------- */
export function usePullToRefresh(onRefresh: () => void) {
  const [pulling, setPulling] = useState(0); // px
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const active = useRef(false);

  useEffect(() => {
    const THRESHOLD = 75;
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0) {
        startY.current = e.touches[0].clientY;
        active.current = true;
      } else {
        active.current = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!active.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) {
        setPulling(Math.min(dy * 0.5, 110));
      }
    };
    const onTouchEnd = () => {
      if (!active.current) {
        setPulling(0);
        return;
      }
      active.current = false;
      if (pulling >= THRESHOLD) {
        setRefreshing(true);
        setPulling(THRESHOLD);
        haptic("medium");
        Promise.resolve(onRefresh()).finally(() => {
          setTimeout(() => {
            setRefreshing(false);
            setPulling(0);
          }, 900);
        });
      } else {
        setPulling(0);
      }
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [pulling, onRefresh]);

  return { pulling, refreshing };
}

/* ---------------- Theme ---------------- */
export type Theme = "light" | "dark";
export function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem("delis_theme");
    if (saved === "dark" || saved === "light") return saved;
    const tg = (window as unknown as { Telegram?: { WebApp?: { colorScheme?: string } } }).Telegram?.WebApp;
    if (tg?.colorScheme === "dark") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function useInView<T extends HTMLElement>(threshold = 0.16) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

export function Reveal({
  children,
  delay = 0,
  className = "",
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? "in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  );
}

export function MaskLine({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  return (
    <span ref={ref} className={`mask-line ${inView ? "in" : ""} ${className}`}>
      <span style={{ transitionDelay: `${delay}ms` }}>{children}</span>
    </span>
  );
}

export function useCountUp(target: number, start: boolean, duration = 1400) {
  const reduced = useReducedMotion();
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (reduced) {
      setVal(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, target, duration, reduced]);
  return val;
}

export function useParallax<T extends HTMLElement>(speed = 0.12) {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const mid = r.top + r.height / 2 - window.innerHeight / 2;
        el.style.transform = `translate3d(0, ${(-mid * speed).toFixed(1)}px, 0)`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [speed, reduced]);
  return ref;
}

/* ---------------- helpers ---------------- */

export function formatPrice(n: number, lang: Lang) {
  const grouped = n.toLocaleString(lang === "en" ? "en-US" : "ru-RU").replace(/,/g, lang === "en" ? "," : " ");
  if (lang === "uz") return `${grouped} so'm`;
  if (lang === "ru") return `${grouped} сум`;
  return `${grouped} UZS`;
}

export function greetingKey(date = new Date()): "greetingMorning" | "greetingDay" | "greetingEvening" {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "greetingMorning";
  if (h >= 11 && h < 17) return "greetingDay";
  return "greetingEvening";
}

export function scrollToId(id: string, reduced: boolean) {
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

export function scrollToTop(reduced: boolean) {
  window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
}

/**
 * Downscale a picked photo so it is safe to upload as base64 JSON:
 * max 900px on the long edge, JPEG q=0.82 → typically 60-150 KB.
 * Falls back to the raw data URL when canvas is unavailable.
 */
export function compressImageFile(file: File, maxEdge = 900, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const raw = String(reader.result || "");
      try {
        const img = new Image();
        img.onerror = () => resolve(raw); // exotic formats: send as-is
        img.onload = () => {
          try {
            const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return resolve(raw);
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", quality));
          } catch {
            resolve(raw);
          }
        };
        img.src = raw;
      } catch {
        resolve(raw);
      }
    };
    reader.readAsDataURL(file);
  });
}

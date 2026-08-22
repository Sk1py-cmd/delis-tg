/**
 * DELIS — Корневой компонент всего приложения. Здесь собираются все экраны и панели, живёт общее состояние (пользователь, корзина, заказы, язык) и «роутинг» между экранами. Отсюда же запускается загрузка данных с сервера.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I18nProvider, useI18n, type Lang } from "./i18n";
import { fetchOrders, fetchMe, fetchReferral, fetchProducts, fetchPromos, fetchDeliveryConfig, fetchLoyaltyCard, fetchLoyaltyConfig, fetchFavorites, toggleFavorite as apiToggleFavorite, fetchAddresses, fetchReviews, saveAddress as apiSaveAddress, deleteAddress as apiDeleteAddress, fetchReturns, fetchAdminReturns, createReturnRequest, adminSetReturnStatus, prepareBrowserCheckoutSession, hasTelegramSession, isApiConfigured, redeemStarsReward as apiRedeemStarsReward, joinWaitlist as apiJoinWaitlist, fetchAdminWaitlist, adminNotifyWaitlist, attachReferral as apiAttachReferral, type LoyaltyCardResponse, type LoyaltyConfig } from "./api";
import { LoyaltyCard, type LoyaltyCardData } from "./loyalty-card";
import { StarsShopSheet, type StarsReward } from "./stars-shop";
import { GiftCertificateSheet } from "./gift-certificate";
import { ManagerChatSheet } from "./manager-chat";
import { type Cat, type Order, type Product, type ServerPromo, PRODUCTS, hydrateServerPromos, hydrateDeliveryConfig, addLocalPromoOverride, type PromoCode } from "./data";
import {
  getInitialTheme,
  getTelegramUser,
  haptic,
  initTelegram,
  scrollToId,
  scrollToTop,
  storageGetItem,
  storageSetItem,
  Skeleton,
  useOnline,
  usePullToRefresh,
  useReducedMotion,
  type Theme,
} from "./kit";
import { BottomNav, ScrollTop, Toast, TopBar, type Tab } from "./chrome";
import { Categories, DailyDeal, Greeting, Hero, StoreBenefits, Ticker, ToolsSection } from "./sections-home";
import { Featured, Promos, Why, type Filter } from "./sections-mid";
import { Footer, News, Wholesale } from "./sections-end";
import { OrdersSheet, PartnerSheet, ProfileSheet } from "./overlays";
import { CatalogScreen } from "./screen-catalog";
import { ProductScreen } from "./screen-product";
import { CheckoutSheet, OrderDetailModal } from "./checkout-modal";
import { StoriesBar } from "./stories";
import { SmartQuiz } from "./quiz";
import { WheelOfFortune } from "./wheel";
import {
  AboutScreen,
  BlogScreen,
  CareersScreen,
  DelisLoader,
  DeliveryScreen,
  FaqScreen,
  ProductionScreen,
  PullToRefreshIndicator,
  QuickAccessSheet,
  ReturnsScreen,
} from "./screen-extras";
import {
  AddressBookSheet,
  ReturnsSheet,
  type SavedAddress,
  type ReturnRequest,
} from "./features-extra";
import { B2bSheet, CalculatorSheet, MySubscriptionsSheet, SubscriptionSheet } from "./features-sales";
import { ProductComparisonSheet, QrScannerSheet } from "./features-power";
import { InvoiceSheet } from "./features-service";
import { ReviewSheet, type UserReview } from "./reviews";
import { RecentlyViewed } from "./recently-viewed";
import { AdminPushPanel } from "./admin-push";
import { useCartAbandonment, ScheduledPromosSheet } from "./features-improvements";
import { GlobalSearchSheet } from "./global-search";
import { ThankYouScreen } from "./thank-you";
import { OnboardingTooltips, OrderExportSheet, BankDetailsSheet } from "./features-finish";
import { AdminPanelSheet } from "./features-admin";
import {
  LegalDocsSheet,
  WaitlistSheet,
  ReferralHubSheet,
  PaymentGatewayModal,
} from "./features-legal-waitlist";
import {
  CsvExportSheet,
  OpLogsSheet,
  appendOpLog,
} from "./features-convenience";
import { OrderTrackingSheet, SmartRecommendations } from "./features-smart2";
import { BundleSheet } from "./bundles";
import { BundleSection, bundleToCart } from "./features-bundles";
import {
  LoyaltyHomeBanner,
  NotificationPanel,
  useNotifications,
} from "./features-hub";
import {
  type LegalDocType,
  type WaitlistEntry,
  type ReferralStats,
  DEFAULT_REFERRAL_STATS,
} from "./data";
import { IconArrow } from "./icons";

type SheetId = null | "cart" | "orders" | "profile" | "partner";
type ScreenId = "home" | "catalog";
type ContentScreen = null | "faq" | "about" | "blog" | "production" | "careers" | "delivery" | "returns";

/* ─────────── Server catalog sync ───────────
   The server is the source of truth for price/stock/badge/rating.
   Local products keep their rich content (desc/story/tips…) that the
   server does not store. Cached so the next launch paints instantly. */

const SERVER_CATALOG_KEY = "delis_server_catalog";
const EMPTY_L10N = { uz: "", ru: "", en: "" };

type ServerProductInfo = {
  id: string; cat: string; price: number; name: string;
  volume?: string | null; badge?: string | null; stock?: number;
  rating?: number; reviewsCount?: number; img?: string | null;
  soldToday?: number; soldTotal?: number;
};

const LEGACY_DEFAULT_MEDIA: Record<string, string> = {
  cloud: "images/prod-floor.jpg",
  interior: "images/prod-shampoo.jpg",
  kitchen: "images/prod-glass.jpg",
  wheel: "images/prod-wax.jpg",
};

function mergeServerCatalog(base: Product[], serverList: ServerProductInfo[]): Product[] {
  const byId = new Map(base.map((p) => [p.id, p]));
  const merged = serverList.map((sp): Product => {
    const localMatch = byId.get(sp.id);
    const localBase: Product = localMatch ?? ({
      id: sp.id,
      cat: (sp.cat === "car" ? "car" : "home") as Cat,
      name: sp.name,
      price: sp.price,
      img: sp.img || "images/prod-floor.jpg",
      volume: sp.volume || "500 ml",
      desc: EMPTY_L10N, spec: EMPTY_L10N, color: "#16402e",
      usage: EMPTY_L10N, composition: EMPTY_L10N, story: EMPTY_L10N,
      tips: [], rating: 5, reviewsCount: 0, reviews: [],
    } as Product);
    return {
      ...localBase,
      name: sp.name || localBase.name,
      price: sp.price,
      stock: sp.stock,
      badge: sp.badge === "new" || sp.badge === "best" ? sp.badge : undefined,
      rating: typeof sp.rating === "number" ? sp.rating : localBase.rating,
      reviewsCount: typeof sp.reviewsCount === "number" ? sp.reviewsCount : localBase.reviewsCount,
      // Preserve the new bundled brand cover while an older API deployment
      // still returns the known reused default. Any admin/custom media wins.
      img: sp.img && sp.img !== LEGACY_DEFAULT_MEDIA[sp.id] ? sp.img : localBase.img,
      volume: sp.volume || localBase.volume,
      soldToday: typeof sp.soldToday === "number" ? sp.soldToday : localBase.soldToday,
      soldTotal: typeof sp.soldTotal === "number" ? sp.soldTotal : localBase.soldTotal,
    };
  });
  const serverIds = new Set(serverList.map((p) => p.id));
  const localOnly = base.filter((p) => !serverIds.has(p.id));
  return [...merged, ...localOnly];
}

function loadCachedServerCatalog(): ServerProductInfo[] {
  try {
    const raw = localStorage.getItem(SERVER_CATALOG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed as ServerProductInfo[];
    }
  } catch { /* ignore */ }
  return [];
}

function Shell() {
  const { t, lang } = useI18n();
  const reduced = useReducedMotion();
  const user = useMemo(() => getTelegramUser(), []);
  const online = useOnline();

  const [tab, setTab] = useState<Tab>("home");
  const [screen, setScreen] = useState<ScreenId>("home");
  const [contentScreen, setContentScreen] = useState<ContentScreen>(null);
  const [sheet, setSheet] = useState<SheetId>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [stars, setStars] = useState<number>(0);
  const [loyaltyCardOpen, setLoyaltyCardOpen] = useState(false);
  const [loyaltyCardLoading, setLoyaltyCardLoading] = useState(false);
  const [loyaltyCardRemote, setLoyaltyCardRemote] = useState<LoyaltyCardResponse | null>(null);
  const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig | null>(null);
  const [starsShopOpen, setStarsShopOpen] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [starsCoupon, setStarsCoupon] = useState<string | null>(null);
  // Stars-shop gifts are now free via personal fixed coupons, so this stays
  // empty — kept only for backwards compatibility with older sessions.
  const [gifts] = useState<string[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [toast, setToast] = useState<{ msg: string; key: number }>({ msg: "", key: 0 });
  const [showTop, setShowTop] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);

  // theme + launch loader + refresh
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [appReady, setAppReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);

  // recently viewed products (replaces the daily bonus)
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);

  // notifications hook
  const notifs = useNotifications();

  // Cart abandonment timer — saves intent for bot reminders
  useCartAbandonment(cart, lang);

  // customer reviews
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewProduct, setReviewProduct] = useState<Product | null>(null);
  const [userReviews, setUserReviews] = useState<UserReview[]>([]);

  // global search + price filter + thank-you
  const [searchOpen, setSearchOpen] = useState(false);
  const [thanksOrder, setThanksOrder] = useState<Order | null>(null);

  // onboarding tooltips + export + bank details
  const [tooltipsActive, setTooltipsActive] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);

  // addresses / daily / returns
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressBookOpen, setAddressBookOpen] = useState(false);
  const [addressSelectMode, setAddressSelectMode] = useState(false);
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [returns, setReturns] = useState<ReturnRequest[]>([]);

  // sales tools (calculator / quiz / subscription / b2b)
  const [calcOpen, setCalcOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [b2bOpen, setB2bOpen] = useState(false);

  // production-ready power features (comparison and authenticity scanner)
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareInitialProduct, setCompareInitialProduct] = useState<Product | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  // service features (one-click order / invoice)
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);

  // live inventory products state (seed with built-in + custom from storage)
  const [productsList, setProductsList] = useState<Product[]>(() => {
    try {
      const custom = JSON.parse(localStorage.getItem("delis_custom_products") || "[]") as Product[];
      const overrides = JSON.parse(localStorage.getItem("delis_product_overrides") || "{}") as Record<string, Partial<Product>>;
      const merged = [...PRODUCTS, ...custom]
        .map((p) => ({ ...p, ...(overrides[p.id] || {}) }))
        .filter((p) => (overrides[p.id] as { active?: boolean } | undefined)?.active !== false);
      const cachedServer = loadCachedServerCatalog();
      return cachedServer.length ? mergeServerCatalog(merged, cachedServer) : merged;
    } catch {
      return PRODUCTS;
    }
  });
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [referralStats, setReferralStats] = useState<ReferralStats>(DEFAULT_REFERRAL_STATS);

  // admin & legal & waitlist & payment gateway modals
  const [adminOpen, setAdminOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalDocType, setLegalDocType] = useState<LegalDocType>("oferta");
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistProduct, setWaitlistProduct] = useState<Product | null>(null);
  const [referralOpen, setReferralOpen] = useState(false);
  const [gatewayOpen, setGatewayOpen] = useState(false);
  const [gatewayOrder, setGatewayOrder] = useState<Order | null>(null);

  // convenience features (CSV export / logs / quick call)
  const [csvOpen, setCsvOpen] = useState(false);
  const [opLogsOpen, setOpLogsOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [trackingQuery, setTrackingQuery] = useState("");
  const [bundlesOpen, setBundlesOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [schedPromosOpen, setSchedPromosOpen] = useState(false);

  const toastTimer = useRef<number>(0);
  const scrollRef = useRef<number>(0);

  /* Initialize Telegram, theme class & restore CloudStorage */
  useEffect(() => {
    initTelegram();
    (async () => {
      try {
        const safeParse = (raw: string | null) => {
          try { return raw ? JSON.parse(raw) : null; } catch { return null; }
        };

        const themeSaved = await storageGetItem("theme");
        if (themeSaved === "dark" || themeSaved === "light") setTheme(themeSaved);
        const savedCart = await storageGetItem("cart");
        if (savedCart) { const v = safeParse(savedCart); if (v) setCart(v); }
        const savedFavs = await storageGetItem("favorites");
        if (savedFavs) { const v = safeParse(savedFavs); if (v) setFavorites(v); }
        const savedStars = await storageGetItem("stars");
        if (savedStars) setStars(Number(savedStars) || 0);
        const savedOrders = await storageGetItem("orders");
        if (savedOrders) { const v = safeParse(savedOrders); if (Array.isArray(v)) setOrders(v); }
        const savedAddr = await storageGetItem("addresses");
        if (savedAddr) { const v = safeParse(savedAddr); if (Array.isArray(v)) setAddresses(v); }
        const savedReturns = await storageGetItem("returns");
        if (savedReturns) { const v = safeParse(savedReturns); if (Array.isArray(v)) setReturns(v); }
        const savedReviews = await storageGetItem("user_reviews");
        if (savedReviews) { const v = safeParse(savedReviews); if (Array.isArray(v)) setUserReviews(v); }
        const savedViewed = await storageGetItem("recently_viewed");
        if (savedViewed) { const v = safeParse(savedViewed); if (Array.isArray(v)) setRecentlyViewed(v); }
        const tipsDone = await storageGetItem("tips_done");
        if (tipsDone !== "1") {
          setTimeout(() => setTooltipsActive(true), 3200);
        }
      } catch {
        /* defaults */
      }

      // Server sync (only when the backend is configured): catalog, orders, profile, promos
      try {
        if (isApiConfigured()) {
          // A stable signed guest identity lets the normal browser keep orders,
          // favorites, addresses, returns and support messages across reloads.
          if (!hasTelegramSession()) await prepareBrowserCheckoutSession();
          const [serverOrders, me, serverProducts, serverPromos, deliveryCfg, loyaltyCfg, serverFavorites, serverAddresses, customerReturns, adminReturns] = await Promise.all([
            fetchOrders(lang),
            fetchMe(),
            fetchProducts(lang),
            fetchPromos(),
            fetchDeliveryConfig(),
            fetchLoyaltyConfig(),
            fetchFavorites(),
            fetchAddresses(),
            fetchReturns(),
            fetchAdminReturns(),
          ]);
          if (serverOrders) setOrders(serverOrders);
          if (me) setStars(Number(me.stars) || 0);
          if (serverProducts && serverProducts.length) {
            setProductsList((prev) => mergeServerCatalog(prev, serverProducts as ServerProductInfo[]));
            try { localStorage.setItem(SERVER_CATALOG_KEY, JSON.stringify(serverProducts)); } catch { /* ignore */ }
          }
          if (serverPromos) hydrateServerPromos(serverPromos as ServerPromo[]);
          if (deliveryCfg) hydrateDeliveryConfig(deliveryCfg as any);
          if (loyaltyCfg) setLoyaltyConfig(loyaltyCfg);
          if (serverFavorites) setFavorites(serverFavorites);
          if (serverAddresses) {
            setAddresses(serverAddresses.map((address) => ({
              id: address.id,
              label: (["home", "work", "other"].includes(address.label) ? address.label : "other") as SavedAddress["label"],
              customLabel: ["home", "work", "other"].includes(address.label) ? undefined : address.label,
              regionId: address.region_id,
              district: address.district,
              street: address.street,
              apartment: address.apartment || undefined,
              phone: address.phone || "",
              isDefault: Boolean(address.is_default),
            })));
          }
          if (adminReturns) setReturns(adminReturns);
          else if (customerReturns) setReturns(customerReturns);
          // Admin-only endpoint: silently null for regular users
          const adminWl = await fetchAdminWaitlist();
          if (adminWl) {
            setWaitlist(adminWl.map((w): WaitlistEntry => ({
              id: `wl-${w.id}`,
              productId: w.productId,
              productName: w.productName[lang] || w.productName.uz,
              phone: w.phone || "",
              tgUsername: w.customer?.replace(/^@/, "") || undefined,
              requestedQty: w.qty,
              createdAt: Date.parse(w.createdAt.replace(" ", "T") + "Z") || Date.now(),
              notified: w.notified,
            })));
          }
        }
      } catch {
        /* offline — keep local data */
      }
    })();
  }, []);

  // Refresh operational queues every time the real administrator opens the
  // panel; regular customers simply receive null/403 and keep their own data.
  useEffect(() => {
    if (!adminOpen) return;
    void Promise.all([fetchAdminReturns(), fetchAdminWaitlist()]).then(([returnRows, waitRows]) => {
      if (returnRows) setReturns(returnRows);
      if (waitRows) {
        setWaitlist(waitRows.map((row): WaitlistEntry => ({
          id: `wl-${row.id}`,
          productId: row.productId,
          productName: row.productName[lang] || row.productName.uz,
          phone: row.phone || "",
          tgUsername: row.customer?.replace(/^@/, "") || undefined,
          requestedQty: row.qty,
          createdAt: Date.parse(row.createdAt.replace(" ", "T") + "Z") || Date.now(),
          notified: row.notified,
        })));
      }
    });
  }, [adminOpen, lang]);

  /* Re-fetch the catalog in the new language when it changes */
  const langLoaded = useRef(false);
  useEffect(() => {
    if (!langLoaded.current) { langLoaded.current = true; return; }
    if (!isApiConfigured()) return;
    void (async () => {
      const serverProducts = await fetchProducts(lang);
      if (serverProducts && serverProducts.length) {
        setProductsList((prev) => mergeServerCatalog(prev, serverProducts as ServerProductInfo[]));
        try { localStorage.setItem(SERVER_CATALOG_KEY, JSON.stringify(serverProducts)); } catch { /* ignore */ }
      }
    })();
  }, [lang]);

  /* Apply theme class to root */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    storageSetItem("theme", theme);
    try {
      const tg = (window as unknown as { Telegram?: { WebApp?: { setHeaderColor?: (c: string) => void; setBackgroundColor?: (c: string) => void } } }).Telegram?.WebApp;
      tg?.setHeaderColor?.(theme === "dark" ? "#0f1418" : "#ffffff");
      tg?.setBackgroundColor?.(theme === "dark" ? "#0f1418" : "#ffffff");
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  /* Persist state to CloudStorage */
  useEffect(() => { storageSetItem("cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => { storageSetItem("favorites", JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { storageSetItem("stars", String(stars)); }, [stars]);
  useEffect(() => { storageSetItem("orders", JSON.stringify(orders)); }, [orders]);
  useEffect(() => { storageSetItem("addresses", JSON.stringify(addresses)); }, [addresses]);
  useEffect(() => { storageSetItem("returns", JSON.stringify(returns)); }, [returns]);

  /* Scroll → back-to-top */
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 900);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Pull-to-refresh */
  const onRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setCatalogLoading(true);
    setTimeout(() => setCatalogLoading(false), 900);
    showToast(t("version"));
  }, [t]);
  const { pulling, refreshing } = usePullToRefresh(onRefresh);

  /* Language toast */
  const firstLang = useRef(true);
  useEffect(() => {
    if (firstLang.current) {
      firstLang.current = false;
      return;
    }
    showToast(t("langToast"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const showToast = useCallback((msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToast({ msg, key: Date.now() });
    toastTimer.current = window.setTimeout(() => setToast((s) => ({ ...s, msg: "" })), 2100);
  }, []);

  const refreshLoyaltyCard = useCallback(async () => {
    setLoyaltyCardLoading(true);
    try {
      const card = await fetchLoyaltyCard(lang);
      if (!card) return;
      setLoyaltyCardRemote(card);
      setStars(Number(card.stars) || 0);
    } finally {
      setLoyaltyCardLoading(false);
    }
  }, [lang]);

  const openLoyaltyCard = useCallback(() => {
    haptic("medium");
    setSheet(null);
    setLoyaltyCardOpen(true);
    setLoyaltyCardRemote(null);
    void refreshLoyaltyCard();
  }, [refreshLoyaltyCard]);

  /* Cart */
  const addToCart = useCallback(
    (p: Product) => {
      setCart((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }));
      showToast(`${p.name} · ${t("added")}`);
    },
    [showToast, t],
  );
  const inc = useCallback((id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 })), []);

  /* Deep links from the bot: ?tab=cart|orders|profile|admin,
     ?start=buy_<productId> | p_<productId> | ref_<tgId>,
     and Telegram's initDataUnsafe.start_param for direct Mini-App links.
     Runs exactly once — the boot catalog is synchronously available. */
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    let tab: string | null = null;
    let start: string | null = null;
    let orderParam: string | null = null;
    let cartParam: string | null = null;
    try {
      const q = new URLSearchParams(window.location.search);
      tab = q.get("tab");
      start = q.get("start");
      orderParam = q.get("order");
      cartParam = q.get("cart");
      const tgStart = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } } })
        .Telegram?.WebApp?.initDataUnsafe?.start_param;
      if (!start && tgStart) start = tgStart;
    } catch { /* ignore */ }

    if (tab === "cart") setSheet("cart");
    else if (tab === "orders") setSheet("orders");
    else if (tab === "profile") setSheet("profile");
    else if (tab === "chat") setChatOpen(true);
    // "📊 Panelni ochish" button in the bot's daily report → Admin Operations Panel
    else if (tab === "admin") setAdminOpen(true);
    // /track DL-1234 in the bot → tracking sheet, pre-filled with the order id
    else if (tab === "tracking") {
      if (orderParam) setTrackingQuery(orderParam);
      setTrackingOpen(true);
    }

    // Cart-by-link: ?cart=wax:2,glass:1,shampoo:3 → pre-fills the basket
    if (cartParam) {
      try {
        const items = cartParam.split(",").map((s) => s.trim()).filter(Boolean);
        const prefill: Record<string, number> = {};
        let added = 0;
        for (const item of items) {
          const [pid, qtyStr] = item.split(":");
          const qty = Math.max(1, Math.min(99, parseInt(qtyStr || "1", 10) || 1));
          const product = productsList.find((p) => p.id === pid.trim());
          if (product) { prefill[pid.trim()] = qty; added++; }
        }
        if (added > 0) {
          setCart((c) => ({ ...c, ...prefill }));
          setSheet("cart");
          showToast(`✓ ${added} ${lang === "ru" ? "товаров в корзине" : lang === "en" ? "items in cart" : "ta tovar savatda"}`);
        }
      } catch { /* ignore */ }
    }

    if (!start) return;
    if (start === "admin") { setAdminOpen(true); return; }
    if (start.startsWith("buy_")) {
      const product = productsList.find((p) => p.id === start.slice(4));
      if (product) { addToCart(product); setSheet("cart"); }
    } else if (start.startsWith("p_")) {
      const product = productsList.find((p) => p.id === start.slice(2));
      if (product) setActiveProduct(product);
    } else if (start.startsWith("ref_")) {
      const referrerId = Number(start.slice(4));
      if (Number.isFinite(referrerId) && referrerId > 0) {
        try {
          if (localStorage.getItem("delis_ref_attached") !== String(referrerId)) {
            void apiAttachReferral(referrerId).then((res) => {
              if (res?.ok) { try { localStorage.setItem("delis_ref_attached", String(referrerId)); } catch { /* ignore */ } }
            });
          }
        } catch { /* ignore */ }
      }
    }
  }, [productsList, addToCart]);

  /* Stars shop — server-authoritative: stars are debited and a personal
     single-use coupon (ST-XXXXXX) is issued on the backend, never locally. */
  const redeemStarsReward = useCallback(
    async (r: StarsReward): Promise<boolean> => {
      if (stars < r.cost) return false;
      const res = await apiRedeemStarsReward(r.id);
      if (!res || !res.ok) {
        haptic("error");
        const error = res && !res.ok ? (res as { error?: string }).error : "network";
        const message = error === "insufficient_stars"
          ? t("starsNotEnough")
          : error === "rewards_paused" || error === "reward_not_found"
            ? lang === "ru"
              ? "Награда временно недоступна — Stars не списаны"
              : lang === "en"
                ? "This reward is temporarily unavailable — no Stars were debited"
                : "Mukofot vaqtincha mavjud emas — Stars yechilmadi"
            : lang === "ru"
              ? "Нет связи с сервером — звёзды не списаны"
              : lang === "en"
                ? "No server connection — stars were not debited"
                : "Server bilan aloqa yo'q — Stars yechilmadi";
        showToast(message);
        return false;
      }
      haptic("success");
      setStars(res.stars);
      // Register the issued personal coupon locally so checkout can show/apply it
      const promo: PromoCode = {
        code: res.code,
        type: res.type,
        value: res.value,
        minSpend: res.minSpend,
        maxDiscount: res.maxDiscount || undefined,
        requiredProductId: res.requiredProductId || undefined,
        retailOnly: res.retailOnly,
        title: res.titles,
        active: true,
      };
      addLocalPromoOverride(promo);
      setStarsCoupon(res.code);
      if (r.kind === "gift" && r.productId) {
        const p = PRODUCTS.find((x) => x.id === r.productId);
        if (p) addToCart(p);
      }
      showToast(`⭐ ${r.title[lang]} — ${res.code}`);
      return true;
    },
    [stars, lang, addToCart, showToast, t],
  );
  const dec = useCallback(
    (id: string) =>
      setCart((c) => {
        const q = (c[id] ?? 0) - 1;
        const next = { ...c };
        if (q <= 0) delete next[id];
        else next[id] = q;
        return next;
      }),
    [],
  );
  const clearCart = useCallback(() => setCart({}), []);
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  /* Wishlist */
  const toggleFavorite = useCallback(
    (productId: string) => {
      setFavorites((prev) => {
        const exists = prev.includes(productId);
        showToast(exists ? t("removeFromWishlist") : t("addToWishlist"));
        return exists ? prev.filter((id) => id !== productId) : [...prev, productId];
      });
      void apiToggleFavorite(productId).then((result) => {
        if (!result) return;
        setFavorites((prev) => result.favorited
          ? (prev.includes(productId) ? prev : [...prev, productId])
          : prev.filter((id) => id !== productId));
      });
    },
    [showToast, t],
  );

  /* Order placed: Stars cashback is awarded server-side once the order
     is paid or delivered — the app only reflects the server balance. */
  const handleOrderPlaced = useCallback(
    (newOrder: Order) => {
      setOrders((prev) => [newOrder, ...prev]);
      // Close checkout sheet
      setSheet(null);

      // If paying online (not cash-on-delivery), route to Payment Gateway
      if (newOrder.paymentMethod !== "cash") {
        setGatewayOrder(newOrder);
        setGatewayOpen(true);
      } else {
        setThanksOrder(newOrder);
      }
    },
    [],
  );

  const handleRepeatOrder = useCallback(
    (order: Order) => {
      const nextCart: Record<string, number> = {};
      order.items.forEach((it) => (nextCart[it.id] = it.qty));
      setCart(nextCart);
      setSheet("cart");
      showToast(t("cartTitle"));
    },
    [showToast, t],
  );

  /* Admin updates */
  const handleUpdateOrderStatus = useCallback(
    (orderId: string, status: Order["status"], extra?: { btsCode?: string; courierName?: string }) => {
      const orderBefore = orders.find((o) => o.id === orderId);
      const oldStatus = orderBefore?.status;

      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          return {
            ...o,
            status,
            courierNote: extra?.btsCode ? `BTS Express: ${extra.btsCode}` : o.courierNote,
          };
        }),
      );
      appendOpLog({
        action: t("opStatusChanged"),
        detail: `#${orderId} ${oldStatus} → ${status}${extra?.btsCode ? ` · BTS: ${extra.btsCode}` : ""}`,
        operator: "Admin",
      });
    },
    [t, orders],
  );

  const handleUpdateProduct = useCallback(
    (productId: string, patch: Partial<Product>) => {
      setProductsList((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, ...patch } : p)),
      );
      // Secure backend update
      import("./api").then(({ adminUpdateProduct }) => {
        adminUpdateProduct(productId, patch);
      }).catch(() => {});

      try {
        const overrides = JSON.parse(localStorage.getItem("delis_product_overrides") || "{}") as Record<string, Partial<Product>>;
        overrides[productId] = { ...(overrides[productId] || {}), ...patch };
        localStorage.setItem("delis_product_overrides", JSON.stringify(overrides));
      } catch { /* offline fallback */ }
      const p = PRODUCTS.find((x) => x.id === productId);
      const detail = Object.entries(patch)
        .filter(([, v]) => v !== undefined)
        .map(([key, val]) => `${key}=${String(val)}`)
        .join(" · ");
      appendOpLog({
        action: t("opUpdate"),
        detail: `${p?.name ?? productId}${detail ? `: ${detail}` : ""}`,
        operator: "Admin",
      });
    },
    [t],
  );

  const handleAddProduct = useCallback((product: Product) => {
    setProductsList((prev) => [product, ...prev]);
    // Secure backend save
    import("./api").then(({ adminAddProduct }) => {
      adminAddProduct(product);
    }).catch(() => {});

    try {
      const custom = JSON.parse(localStorage.getItem("delis_custom_products") || "[]") as Product[];
      custom.push(product);
      localStorage.setItem("delis_custom_products", JSON.stringify(custom));
    } catch {}
    appendOpLog({ action: t("opAdd"), detail: `${product.name} (${product.price} UZS)`, operator: "Admin" });
  }, [t]);

  const handleMoveProduct = useCallback((productId: string, dir: -1 | 1) => {
    setProductsList((prev) => {
      const idx = prev.findIndex((p) => p.id === productId);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, []);

  const handleDeleteProduct = useCallback((productId: string) => {
    setProductsList((prev) => prev.filter((p) => p.id !== productId));
    // Secure backend delete (active = 0)
    import("./api").then(({ adminUpdateProduct }) => {
      adminUpdateProduct(productId, { active: false } as any);
    }).catch(() => {});

    try {
      const custom = JSON.parse(localStorage.getItem("delis_custom_products") || "[]") as Product[];
      localStorage.setItem("delis_custom_products", JSON.stringify(custom.filter((p) => p.id !== productId)));
    } catch {}
    appendOpLog({ action: "Delete", detail: `Product #${productId}`, operator: "Admin" });
  }, []);

  const handleUpdateReturnStatus = useCallback((returnId: string, status: ReturnRequest["status"]) => {
    if (status === "pending") return;
    void adminSetReturnStatus(returnId, status).then((result) => {
      if (!result) { showToast(`Return #${returnId}: error`); return; }
      setReturns((prev) => prev.map((request) => request.id === returnId ? { ...request, status } : request));
      appendOpLog({
        action: t("opStatusChanged"),
        detail: `Return #${returnId} → ${status}`,
        operator: "Admin",
      });
    });
  }, [t, showToast]);

  const handleNotifyWaitlist = useCallback((waitlistId: string) => {
    const entry = waitlist.find((w) => w.id === waitlistId);
    setWaitlist((prev) =>
      prev.map((w) => (w.id === waitlistId ? { ...w, notified: true } : w)),
    );
    // The server sends the real Telegram message to everyone waiting on this product
    if (entry) void adminNotifyWaitlist(entry.productId);
    appendOpLog({
      action: "Notify waitlist",
      detail: `#${waitlistId} notified`,
      operator: "Admin",
    });
  }, [waitlist]);

  const handleJoinWaitlist = useCallback((entry: WaitlistEntry) => {
    setWaitlist((prev) => [entry, ...prev]);
    showToast(t("waitlistSuccess"));
    // Authoritative record lives on the server — auto-notify fires when
    // the product is restocked there. Local copy is for instant UI only.
    void apiJoinWaitlist({
      productId: entry.productId,
      qty: entry.requestedQty,
      phone: entry.phone,
      language: lang,
    });
  }, [showToast, t, lang]);

  /* Navigation */
  const goFeatured = useCallback(() => {
    setSheet(null);
    setContentScreen(null);
    setScreen("home");
    setTab("home");
    setTimeout(() => scrollToId("featured", reduced), 60);
  }, [reduced]);

  const openCatalog = useCallback((f?: Filter) => {
    if (f) setFilter(f);
    setContentScreen(null);
    setScreen("catalog");
    setTab("catalog");
    scrollRef.current = window.scrollY;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const openWishlist = useCallback(() => openCatalog("wishlist"), [openCatalog]);

  const openContent = useCallback((c: ContentScreen) => {
    haptic("light");
    setContentScreen(c);
    setTab("home");
    scrollRef.current = window.scrollY;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const onTab = useCallback(
    (next: Tab) => {
      haptic("light");
      setTab(next);
      if (next === "home") {
        setScreen("home");
        setContentScreen(null);
        scrollToTop(reduced);
      } else if (next === "catalog") {
        openCatalog();
      } else {
        setSheet(next);
      }
    },
    [reduced, openCatalog],
  );

  const onCategory = useCallback((c: Cat) => openCatalog(c), [openCatalog]);

  // Hero banner shows the REAL bestseller from the merged server catalog
  // (no fake "Multi Elixir №1" anymore) — falls back to the first product.
  const heroProduct = useMemo(() => {
    const list = productsList.length ? productsList : PRODUCTS;
    return [...list].sort((a, b) => (b.soldTotal ?? 0) - (a.soldTotal ?? 0))[0] ?? null;
  }, [productsList]);
  const openProduct = useCallback((p: Product) => {
    setActiveProduct(p);
    void fetchReviews(p.id).then((rows) => {
      if (!rows) return;
      const remote: UserReview[] = rows.map((review: any) => ({
        id: String(review.id),
        productId: p.id,
        rating: Number(review.rating || 5),
        text: String(review.comment || ""),
        author: String(review.author || "DELIS customer"),
        date: String(review.date || ""),
      }));
      setUserReviews((prev) => [
        ...remote,
        ...prev.filter((local) => local.productId !== p.id || !remote.some((item) => item.id === local.id)),
      ]);
    });
    // Remember what the customer looked at — shown on the home screen
    setRecentlyViewed((prev) => {
      const next = [p.id, ...prev.filter((id) => id !== p.id)].slice(0, 8);
      storageSetItem("recently_viewed", JSON.stringify(next));
      return next;
    });
  }, []);

  /* Telegram BackButton sync.
     The native MainButton is intentionally NEVER used for cart actions: it
     duplicated the in-app cart CTAs (the sticky "add to cart / view cart"
     button on the product screen and the cart tab with its badge in the
     bottom nav), so customers saw two identical buttons at once. The in-app
     UI is the single source of truth — it also works outside Telegram
     (delis.uz / Pages), where MainButton does not exist. */
  useEffect(() => {
    import("./kit").then(({ updateTelegramBackButton, hideTelegramMainButton }) => {
      if (activeOrder) updateTelegramBackButton(() => setActiveOrder(null));
      else if (activeProduct) updateTelegramBackButton(() => setActiveProduct(null));
      else if (loyaltyCardOpen) updateTelegramBackButton(() => setLoyaltyCardOpen(false));
      else if (sheet) updateTelegramBackButton(() => setSheet(null));
      else if (contentScreen) updateTelegramBackButton(() => { setContentScreen(null); });
      else if (screen === "catalog") updateTelegramBackButton(() => { setScreen("home"); setTab("home"); });
      else updateTelegramBackButton(null);

      // Keep the native bar empty so it can never shadow the in-app CTA.
      hideTelegramMainButton();
    });
  }, [activeProduct, activeOrder, loyaltyCardOpen, sheet, screen, contentScreen]);

  const fallbackLevel = stars >= 1500 ? "gold" : stars >= 500 ? "silver" : "bronze";
  const fallbackNext = fallbackLevel === "bronze" ? "silver" : fallbackLevel === "silver" ? "gold" : null;
  const fallbackThreshold = fallbackNext === "silver" ? 500 : fallbackNext === "gold" ? 1500 : null;
  const loyaltyCardData: LoyaltyCardData = loyaltyCardRemote ?? {
    level: fallbackLevel,
    stars,
    cardCode: "",
    starValueUzs: 100,
    cashbackPercent: fallbackLevel === "gold" ? 8 : fallbackLevel === "silver" ? 5 : 3,
    nextLevel: fallbackNext,
    nextThreshold: fallbackThreshold,
    remainingToNext: fallbackThreshold ? Math.max(0, fallbackThreshold - stars) : 0,
    progressPercent: fallbackThreshold ? Math.min(100, Math.round((stars / fallbackThreshold) * 100)) : 100,
    expiring: { amount: 0, date: null },
    birthday: { configured: false, eligible: false, claimed: false, bonus: 100 },
    totalEarned: stars,
    totalSpent: 0,
    missions: [],
    history: [],
  };
  const loyaltyCardUserName = loyaltyCardRemote?.userName || user?.first_name || t("guestName");

  return (
    <div className={`theme-transition relative min-h-dvh ${theme === "dark" ? "dark" : ""}`}>
      {/* ambient desktop backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0 hidden md:block" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(52% 42% at 18% 12%, rgba(60,60,67,0.25) 0%, transparent 70%), radial-gradient(46% 38% at 86% 82%, rgba(60,60,67,0.12) 0%, transparent 72%), #1c1c1e",
          }}
        />
        <div className="noise-layer" />
        <p className="absolute left-9 bottom-10 select-none text-[10px] font-extrabold uppercase tracking-[0.34em] text-white/25" style={{ writingMode: "vertical-rl" }}>
          Telegram Mini App — DELIS V2
        </p>
        <p className="absolute right-9 top-10 select-none text-[10px] font-extrabold uppercase tracking-[0.34em] text-white/25" style={{ writingMode: "vertical-rl" }}>
          DELIS Factory · Namangan, Turakurgan · 2026
        </p>
      </div>

      {/* Premium launch loading screen */}
      {!appReady && <DelisLoader onComplete={() => setAppReady(true)} />}

      {/* PULL-TO-REFRESH INDICATOR */}
      <PullToRefreshIndicator pulling={pulling} refreshing={refreshing} />

      {/* OFFLINE BADGE — shown when the device loses its internet connection */}
      {!online && (
        <div
          className="pointer-events-none fixed inset-x-0 z-[80] flex justify-center px-4"
          style={{ top: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="animate-rise mt-2 flex items-center gap-2 rounded-full border border-ink/10 bg-[#0c1411] px-4 py-2 text-[12px] font-semibold text-white shadow-lift dark:border-white/10 dark:bg-[#182128]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber" />
            {lang === "ru" ? "Вы офлайн — данные могут быть не свежими" : lang === "en" ? "You're offline — data may be stale" : "Siz oflaynsiz — ma'lumotlar eskirgan bo'lishi mumkin"}
          </div>
        </div>
      )}

      {/* app column */}
      <div className="relative z-10 mx-auto min-h-dvh w-full max-w-[430px] bg-paper shadow-[0_0_140px_rgba(0,0,0,0.55)]">
        {/* Intentionally no decorative colour wash: products remain the visual focus. */}
        <div className="relative z-10">
        <TopBar onAction={() => setQuickOpen(true)} onNotifications={() => setNotifPanelOpen(true)} notifCount={notifs.unreadCount} theme={theme} onToggleTheme={toggleTheme} />

        <main>
          <div key={contentScreen ?? screen} className="animate-ios-slide-up">
          {contentScreen === "faq" ? (
            <ContentWrap onBack={() => { setContentScreen(null); window.scrollTo({ top: scrollRef.current, behavior: "auto" }); }}>
              <FaqScreen />
            </ContentWrap>
          ) : contentScreen === "about" ? (
            <ContentWrap onBack={() => { setContentScreen(null); window.scrollTo({ top: scrollRef.current, behavior: "auto" }); }}>
              <AboutScreen />
            </ContentWrap>
          ) : contentScreen === "production" ? (
            <ContentWrap onBack={() => { setContentScreen(null); window.scrollTo({ top: scrollRef.current, behavior: "auto" }); }}>
              <ProductionScreen />
            </ContentWrap>
          ) : contentScreen === "careers" ? (
            <ContentWrap onBack={() => { setContentScreen(null); window.scrollTo({ top: scrollRef.current, behavior: "auto" }); }}>
              <CareersScreen />
            </ContentWrap>
          ) : contentScreen === "delivery" ? (
            <ContentWrap onBack={() => { setContentScreen(null); window.scrollTo({ top: scrollRef.current, behavior: "auto" }); }}>
              <DeliveryScreen />
            </ContentWrap>
          ) : contentScreen === "returns" ? (
            <ContentWrap onBack={() => { setContentScreen(null); window.scrollTo({ top: scrollRef.current, behavior: "auto" }); }}>
              <ReturnsScreen />
            </ContentWrap>
          ) : contentScreen === "blog" ? (
            <ContentWrap onBack={() => { setContentScreen(null); window.scrollTo({ top: scrollRef.current, behavior: "auto" }); }}>
              <BlogScreen onOpen={() => showToast(t("newsOpen"))} />
            </ContentWrap>
          ) : screen === "home" ? (
            <>
              <Greeting user={user} />
              <StoriesBar tgUser={user} onOpenChange={setStoryOpen} onBuy={(productId) => {
                const p = PRODUCTS.find((x) => x.id === productId);
                if (p) openProduct(p);
              }} />
              <LoyaltyHomeBanner stars={stars} config={loyaltyConfig} onPress={openLoyaltyCard} onShop={() => setStarsShopOpen(true)} />
              <Ticker />
              <DailyDeal onAdd={addToCart} onOpen={openProduct} />
              <Hero
                product={heroProduct}
                onOpen={openProduct}
                onCta={() => scrollToId("featured", reduced)}
                onHome={() => openCatalog("home")}
                onCar={() => openCatalog("car")}
              />
              <Categories onPick={onCategory} />
              <StoreBenefits />
              <ToolsSection
                onCalc={() => setCalcOpen(true)}
                onQuiz={() => setQuizOpen(true)}
                onWheel={() => setWheelOpen(true)}
                onSub={() => setSubOpen(true)}
                onCompare={() => {
                  setCompareInitialProduct(null);
                  setCompareOpen(true);
                }}
                onScan={() => setScanOpen(true)}
                onBundles={() => setBundlesOpen(true)}
              />
              <Featured filter={filter} setFilter={setFilter} onAdd={addToCart} onOpen={openProduct} favorites={favorites} onToggleFavorite={toggleFavorite} products={productsList} />
              <RecentlyViewed
                ids={recentlyViewed}
                cart={cart}
                onOpen={openProduct}
                onAdd={addToCart}
                onClear={() => {
                  setRecentlyViewed([]);
                  storageSetItem("recently_viewed", "[]");
                }}
              />
              <SmartRecommendations
                orders={orders}
                favorites={favorites}
                cart={cart}
                onAdd={addToCart}
                onOpen={openProduct}
                onReorder={(o) => handleRepeatOrder(o)}
              />
              <BundleSection
                onAddBundle={(bundle) => {
                  // Add all bundle items to cart at once
                  const cartEntries = bundleToCart(bundle);
                  Object.entries(cartEntries).forEach(([id, qty]) => {
                    for (let i = 0; i < qty; i++) {
                      const p = PRODUCTS.find((x) => x.id === id);
                      if (p) addToCart(p);
                    }
                  });
                  showToast(`🎁 ${bundle.name[lang]} — ${bundle.discountPercent}% ${t("wholesaleSave")}`);
                }}
                onOpenProduct={(id) => {
                  const p = PRODUCTS.find((x) => x.id === id);
                  if (p) openProduct(p);
                }}
              />
              <Why />
              <Promos onToast={showToast} />
              <Wholesale
                onPartner={() => { haptic("medium"); setSheet("partner"); }}
                onBankDetails={() => { haptic("light"); setBankOpen(true); }}
              />
              <News />
            </>
          ) : catalogLoading ? (
            <CatalogSkeleton />
          ) : (
            <CatalogScreen
              key={refreshKey}
              filter={filter}
              setFilter={setFilter}
              cart={cart}
              favorites={favorites}
              onAdd={addToCart}
              onOpen={openProduct}
              onToggleFavorite={toggleFavorite}
              products={productsList}
            />
          )}
          </div>
        </main>

        {screen === "home" && !contentScreen && (
          <Footer onNavigate={(s) => openContent(s)} />
        )}

        <div className="h-[118px]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
        </div>
      </div>

      {/* Full-screen stories: hide the tab bar so it never overlaps the
          viewer's CTA card (it is also visually covered by the portal) */}
      {!storyOpen && <BottomNav tab={tab} cartCount={cartCount} onTab={onTab} />}
      <ScrollTop visible={showTop} onClick={() => scrollToTop(reduced)} />
      <Toast msg={toast.msg || null} toastKey={toast.key} />

      {/* Customer review composer */}
      <ReviewSheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        product={reviewProduct}
        user={user}
        onToast={showToast}
        onSubmit={(review, serverStars) => {
          setUserReviews((prev) => {
            const next = [review, ...prev];
            storageSetItem("user_reviews", JSON.stringify(next));
            return next;
          });
          setStars(serverStars);
        }}
      />

      {/* Header quick actions */}
      <QuickAccessSheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onCatalog={() => openCatalog()}
        onOrders={() => setSheet("orders")}
        onScan={() => setScanOpen(true)}
        onSearch={() => setSearchOpen(true)}
        onTrack={() => setTrackingOpen(true)}
        onChat={() => setChatOpen(true)}
      />

      {/* Order tracking by BTS code / order number */}
      <OrderTrackingSheet
        open={trackingOpen}
        onClose={() => setTrackingOpen(false)}
        orders={orders}
        initialQuery={trackingQuery}
      />

      <BundleSheet
        open={bundlesOpen}
        onClose={() => setBundlesOpen(false)}
        onAdd={addToCart}
      />

      <CheckoutSheet
        open={sheet === "cart"}
        onClose={() => setSheet(null)}
        cart={cart}
        products={productsList}
        onInc={inc}
        onDec={dec}
        onClearCart={clearCart}
        onOrderPlaced={handleOrderPlaced}
        goFeatured={goFeatured}
        user={user}
        addresses={addresses}
        onOpenAddresses={() => {
          setAddressSelectMode(true);
          setAddressBookOpen(true);
        }}
        starsCoupon={starsCoupon}
        onClearStarsCoupon={() => setStarsCoupon(null)}
        gifts={gifts}
      />
      <MySubscriptionsSheet open={subsOpen} onClose={() => setSubsOpen(false)} />
      <GiftCertificateSheet open={certOpen} onClose={() => setCertOpen(false)} user={user} onToast={showToast} />
      <ManagerChatSheet open={chatOpen} onClose={() => setChatOpen(false)} />
      <StarsShopSheet
        open={starsShopOpen}
        onClose={() => setStarsShopOpen(false)}
        stars={stars}
        onRedeem={redeemStarsReward}
        onToast={showToast}
      />
      <OrdersSheet
        open={sheet === "orders"}
        onClose={() => setSheet(null)}
        orders={orders}
        goFeatured={goFeatured}
        onSelectOrder={(ord) => setActiveOrder(ord)}
        onRepeatLast={() => {
          if (orders.length > 0) {
            setSheet(null);
            handleRepeatOrder(orders[0]);
          }
        }}
        onExport={() => setExportOpen(true)}
      />
      <OrderDetailModal
        order={activeOrder}
        onClose={() => setActiveOrder(null)}
        onRepeatOrder={handleRepeatOrder}
        onOpenInvoice={(ord) => {
          setActiveOrder(null);
          setInvoiceOrder(ord);
          setInvoiceOpen(true);
        }}
      />
      <ProfileSheet
        open={sheet === "profile"}
        onClose={() => setSheet(null)}
        user={user}
        onPartner={() => setSheet("partner")}
        favoritesCount={favorites.length}
        onOpenWishlist={openWishlist}
        stars={stars}
        loyaltyConfig={loyaltyConfig}
        addressesCount={addresses.length}
        onOpenAddresses={() => {
          setAddressSelectMode(false);
          setAddressBookOpen(true);
        }}
        onOpenReturns={() => setReturnsOpen(true)}
        onOpenB2b={() => setB2bOpen(true)}
        onOpenCert={() => setCertOpen(true)}
        onOpenSubs={() => setSubsOpen(true)}
        onOpenCompare={() => {
          setCompareInitialProduct(null);
          setCompareOpen(true);
        }}
        onOpenLoyaltyCard={openLoyaltyCard}
        onOpenScan={() => setScanOpen(true)}
        onOpenAdmin={() => {
          haptic("medium");
          setAdminOpen(true);
        }}
        onOpenReferral={() => {
          haptic("medium");
          setReferralOpen(true);
          // Load real referral stats from the backend when available
          void (async () => {
            try {
              const info = await fetchReferral();
              if (info) {
                setReferralStats({
                  invitedCount: info.invitees,
                  firstOrdersCount: info.bonusEarned ? 1 : 0,
                  earnedCashbackTotal: info.bonusEarned ? info.bonusStars * 100 : 0,
                  personalCode: info.code,
                });
              }
            } catch { /* offline — keep demo stats */ }
          })();
        }}
        onOpenLegal={() => {
          haptic("light");
          setLegalDocType("oferta");
          setLegalOpen(true);
        }}
      />
      {loyaltyCardOpen && (
        <LoyaltyCard
          userName={loyaltyCardUserName}
          data={loyaltyCardData}
          loading={loyaltyCardLoading}
          onRefresh={refreshLoyaltyCard}
          onClose={() => setLoyaltyCardOpen(false)}
        />
      )}
      <PartnerSheet open={sheet === "partner"} onClose={() => setSheet(null)} />

      <ProductScreen
        product={activeProduct}
        onClose={() => setActiveProduct(null)}
        cart={cart}
        onAdd={addToCart}
        onInc={inc}
        onDec={dec}
        onOpen={openProduct}
        onGoCart={() => {
          setActiveProduct(null);
          setSheet("cart");
        }}
        isFavorite={activeProduct ? favorites.includes(activeProduct.id) : false}
        onToggleFavorite={toggleFavorite}
        onOpenCompare={(p) => {
          setActiveProduct(null);
          setCompareInitialProduct(p);
          setCompareOpen(true);
        }}
        onOpenScanner={() => {
          setActiveProduct(null);
          setScanOpen(true);
        }}
        onWriteReview={(p) => {
          setReviewProduct(p);
          setReviewOpen(true);
        }}
        userReviews={userReviews}
        onOpenWaitlist={(p) => {
          setActiveProduct(null);
          setWaitlistProduct(p);
          setWaitlistOpen(true);
        }}
      />

      {/* Address book */}
      <AddressBookSheet
        open={addressBookOpen}
        onClose={() => { setAddressBookOpen(false); setAddressSelectMode(false); }}
        addresses={addresses}
        selectMode={addressSelectMode}
        onSave={(address) => {
          const alreadyStored = addresses.some((item) => item.id === address.id);
          void apiSaveAddress({
            id: alreadyStored ? address.id : undefined,
            label: address.label === "other" && address.customLabel ? address.customLabel : address.label,
            regionId: address.regionId,
            district: address.district,
            street: address.street,
            apartment: address.apartment,
            phone: address.phone,
            isDefault: address.isDefault,
          }).then((saved) => {
            if (!saved) { showToast(lang === "ru" ? "Адрес не сохранён" : "Manzil saqlanmadi"); return; }
            const persisted = { ...address, id: saved.id };
            setAddresses((prev) => {
              const without = prev.filter((item) => item.id !== address.id && item.id !== saved.id);
              return persisted.isDefault
                ? [persisted, ...without.map((item) => ({ ...item, isDefault: false }))]
                : [...without, persisted];
            });
            showToast(t("addressSaved"));
          });
        }}
        onDelete={(id) => {
          void apiDeleteAddress(id).then((result) => {
            if (!result) { showToast(lang === "ru" ? "Адрес не удалён" : "Manzil o'chirilmadi"); return; }
            setAddresses((prev) => prev.filter((address) => address.id !== id));
            showToast(t("addressDeleted"));
          });
        }}
        onSelect={(a) => {
          // selection is handled inside checkout via openAddresses callback path
          setAddressBookOpen(false);
          setAddressSelectMode(false);
          showToast(`${a.street}`);
        }}
      />

      {/* Returns */}
      <ReturnsSheet
        open={returnsOpen}
        onClose={() => setReturnsOpen(false)}
        orders={orders}
        returns={returns}
        onSubmit={async (request) => {
          const created = await createReturnRequest({
            orderId: request.orderId,
            productId: request.itemId,
            reason: request.reason,
            note: request.note,
          });
          if (!created) return false;
          setReturns((prev) => [created, ...prev]);
          showToast(t("returnsSuccess"));
          return true;
        }}
      />

      {/* Sales tools */}
      <CalculatorSheet open={calcOpen} onClose={() => setCalcOpen(false)} onAdd={(p, qty) => {
        for (let i = 0; i < qty; i++) addToCart(p);
      }} />
      {quizOpen && <SmartQuiz onAdd={(p) => addToCart(p)} />}
      {wheelOpen && <WheelOfFortune onClose={() => setWheelOpen(false)} onWin={(_amount, serverStars) => setStars(serverStars)} />}
      <SubscriptionSheet open={subOpen} onClose={() => setSubOpen(false)} onAdd={(p) => addToCart(p)} />
      <B2bSheet
        open={b2bOpen}
        onClose={() => setB2bOpen(false)}
        onApply={() => {
          setB2bOpen(false);
          setSheet("partner");
        }}
      />

      {/* Side-by-Side Product Comparison Matrix */}
      <ProductComparisonSheet
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        initialProduct={compareInitialProduct}
        onAddToCart={(p) => addToCart(p)}
      />

      {/* Genuine Bottle Authenticity QR Scanner */}
      <QrScannerSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onOpenProduct={(p) => {
          setActiveProduct(p);
        }}
      />

      {/* B2B Invoice */}
      <InvoiceSheet
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        order={invoiceOrder}
        user={user}
        onToast={showToast}
      />

      {/* Global search across products & FAQ */}
      <GlobalSearchSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenProduct={openProduct}
        onOpenFaq={() => openContent("faq")}
        onToast={showToast}
      />

      {/* Full-screen thank-you after checkout */}
      <ThankYouScreen
        order={thanksOrder}
        onContinue={() => {
          setThanksOrder(null);
          setScreen("home");
          setTab("home");
          scrollToTop(reduced);
        }}
        onViewOrder={() => {
          setThanksOrder(null);
          setSheet("orders");
        }}
      />

      {/* Onboarding tooltips — shown once */}
      <OnboardingTooltips
        active={tooltipsActive}
        onComplete={() => {
          setTooltipsActive(false);
          storageSetItem("tips_done", "1");
        }}
      />

      {/* Export orders to text report */}
      <OrderExportSheet open={exportOpen} onClose={() => setExportOpen(false)} orders={orders} />

      {/* Bank requisites / company details */}
      <BankDetailsSheet open={bankOpen} onClose={() => setBankOpen(false)} />

      {/* Admin Operations Panel (PIN protected) */}
      <AdminPanelSheet
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        orders={orders}
        onUpdateOrderStatus={handleUpdateOrderStatus}
        products={productsList}
        onUpdateProduct={handleUpdateProduct}
        onAddProduct={handleAddProduct}
        onDeleteProduct={handleDeleteProduct}
        onMoveProduct={handleMoveProduct}
        returns={returns}
        onUpdateReturnStatus={handleUpdateReturnStatus}
        waitlist={waitlist}
        onNotifyWaitlist={handleNotifyWaitlist}
        onToast={showToast}
        onOpenPush={() => setPushOpen(true)}
      />

      {/* Push notifications — send mass messages to customers */}
      <AdminPushPanel
        open={pushOpen}
        onClose={() => setPushOpen(false)}
        onToast={showToast}
      />

      {/* Scheduled promo codes management */}
      <ScheduledPromosSheet
        open={schedPromosOpen}
        onClose={() => setSchedPromosOpen(false)}
      />

      {/* CSV Export button — standalone launcher */}
      <CsvExportSheet
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        orders={orders}
        onToast={showToast}
      />

      {/* Legal Documents & Compliance */}
      <LegalDocsSheet
        open={legalOpen}
        onClose={() => setLegalOpen(false)}
        initialDoc={legalDocType}
      />

      {/* Waitlist / Pre-order for out-of-stock products */}
      <WaitlistSheet
        open={waitlistOpen}
        onClose={() => setWaitlistOpen(false)}
        product={waitlistProduct}
        onJoinWaitlist={handleJoinWaitlist}
      />

      {/* Referral Hub / Friends Program */}
      <ReferralHubSheet
        open={referralOpen}
        onClose={() => setReferralOpen(false)}
        stats={referralStats}
        onToast={showToast}
      />

      {/* Payment Gateway for Cash/online checkout */}
      <PaymentGatewayModal
        open={gatewayOpen}
        onClose={() => setGatewayOpen(false)}
        order={gatewayOrder}
        onPaymentSuccess={(o) => {
          setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, paymentStatus: "paid" } : x)));
          appendOpLog({ action: "Payment", detail: `#${o.id} — paid ✅`, operator: "System" });
          showToast("✅ To'lov muvaffaqiyatli yakunlandi!");
        }}
      />

      {/* Operation logs (admin audit trail) */}
      <OpLogsSheet open={opLogsOpen} onClose={() => setOpLogsOpen(false)} onToast={showToast} />

      {/* Notification center */}
      <NotificationPanel
        open={notifPanelOpen}
        onClose={() => setNotifPanelOpen(false)}
        notifications={notifs.items}
        unreadCount={notifs.unreadCount}
        onMarkRead={notifs.markRead}
        onMarkAllRead={notifs.markAllRead}
        onClear={notifs.clear}
      />

      {/* NOTE: floating call & chat buttons removed — they were covering the UI */}
    </div>
  );
}

/* Small back wrapper for content screens */
function ContentWrap({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button onClick={onBack} className="press absolute z-20 mt-3 ml-5 flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-[12px] font-bold text-ink shadow-soft">
        <IconArrow size={14} className="rotate-180" />
      </button>
      <div className="pt-12">{children}</div>
    </div>
  );
}

/* Skeleton for catalog */
function CatalogSkeleton() {
  return (
    <section className="px-4 pt-2 pb-4 min-[390px]:px-5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-2 h-8 w-48" />
      <Skeleton className="mt-5 h-14 w-full" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-[24px] border border-ink/6 bg-card">
            <Skeleton className="aspect-square w-full !rounded-none" />
            <div className="p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-4 h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [lang, setLang] = useState<Lang>("uz");
  return (
    <I18nProvider lang={lang} setLang={setLang}>
      <Shell />
    </I18nProvider>
  );
}

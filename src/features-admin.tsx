/**
 * DELIS — Админ-панель: управление заказами, товарами, промокодами, доставкой. Точка входа для всех админ-функций.
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { useI18n } from "./i18n";
import {
  type Order,
  type Product,
  type WaitlistEntry,
  type PromoCode,
  type DailyDealConfig,
  type JobApp,
  type JobPositionId,
  PRODUCTS,
  getAdminPin,
  setAdminPin,
  loadPromoCodes,
  savePromoCodes,
  loadDailyDeal,
  saveDailyDeal,
  loadJobApps,
  saveJobApps,
  serverPromosToMap,
} from "./data";
import type { ReturnRequest } from "./features-extra";
import type { AdminSaveOutcome } from "./api";
import { formatPrice, haptic, compressImageFile } from "./kit";
import { IconBox, IconChart, IconCheck, IconClock, IconClose, IconCopy, IconCreditCard, IconDownload, IconFactory, IconFileText, IconLock, IconMedal, IconPhone, IconPlus, IconRefresh, IconSend, IconSettings, IconShield, IconSparkle, IconSymbol, IconTag, IconTrash, IconUser, IconUserCheck, IconTruck } from "./icons";
import { Sheet } from "./chrome";
import { ContentManagementTab } from "./content-config";
import { SiteSettingsTab } from "./site-settings-tab";
import { PaymentsAdminTab } from "./payments-admin";
import { LoyaltyAdminTab } from "./loyalty-admin";
import { BrandMark, BrandWordmark } from "./brand";
import { AdminCard, AdminSectionLabel, AdminKpi, AdminBar, AdminStatusPill, AdminChip, AdminSearch, AdminBtn, AdminEmpty } from "./admin-ui";
import { adminDeleteStory, adminSetStoryStatus, fetchAdminStories, fetchAdminOrders, adminSetOrderStatus, adminSetPaymentStatus, fetchAdminPromos, adminUpsertPromo, adminDeletePromo, adminUploadProductGalleryImage, fetchAdminStats, fetchOrdersCsv, downloadAdminBackup, isApiConfigured, type ApiStory, type AdminStats } from "./api";
import { QrBatchesAdminTab, B2bAdminTab, CertsAdminTab } from "./features-admin-extra";
import { PRODUCTS as PRODUCT_CATALOG } from "./data";
import { loadAdminStories, saveAdminStories, type Story as AdminStory } from "./stories";

type AdminTab = "analytics" | "orders" | "inventory" | "requests" | "jobs" | "promos" | "content" | "site" | "payments" | "logs" | "stories" | "clients" | "loyalty" | "backup" | "deal" | "qr" | "b2b" | "certs" | "delivery";
type AdminOrderStatus = Order["status"];
const ADMIN_ORDER_FLOW: Exclude<AdminOrderStatus, "canceled">[] = ["new", "preparing", "shipped", "delivered"];
const ADMIN_ORDER_TRANSITIONS: Record<AdminOrderStatus, AdminOrderStatus[]> = {
  new: ["preparing", "canceled"],
  preparing: ["shipped", "canceled"],
  shipped: ["delivered", "canceled"],
  delivered: [],
  canceled: [],
};

function orderStatusLabel(status: AdminOrderStatus, lang: string): string {
  return status === "new"
    ? lang === "uz" ? "Yangi" : lang === "ru" ? "Новый" : "New"
    : status === "preparing"
      ? lang === "uz" ? "Zavodda" : lang === "ru" ? "Готовится" : "Preparing"
      : status === "shipped"
        ? lang === "uz" ? "Kuryerda" : lang === "ru" ? "У курьера" : "Shipped"
        : status === "delivered"
          ? lang === "uz" ? "Yetkazildi" : lang === "ru" ? "Доставлен" : "Delivered"
          : lang === "uz" ? "Bekor" : lang === "ru" ? "Отменён" : "Canceled";
}

export function AdminPanelSheet({
  open,
  onClose,
  orders,
  onUpdateOrderStatus,
  products,
  onUpdateProduct,
  onAddProduct,
  onDeleteProduct,
  onMoveProduct,
  returns,
  onUpdateReturnStatus,
  waitlist,
  onNotifyWaitlist,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  orders: Order[];
  onUpdateOrderStatus: (orderId: string, status: Order["status"], extra?: { btsCode?: string; courierName?: string }) => void;
  products: Product[];
  onUpdateProduct: (productId: string, patch: Partial<Product>) => Promise<AdminSaveOutcome>;
  onAddProduct: (product: Product) => Promise<AdminSaveOutcome>;
  onDeleteProduct: (productId: string) => Promise<AdminSaveOutcome>;
  onMoveProduct?: (productId: string, dir: -1 | 1) => void;
  returns: ReturnRequest[];
  onUpdateReturnStatus: (returnId: string, status: ReturnRequest["status"]) => void;
  waitlist: WaitlistEntry[];
  onNotifyWaitlist: (waitlistId: string) => void;
  onToast: (msg: string) => void;
  onOpenPush: () => void;
}) {
  const { t, lang } = useI18n();

  // Scroll container of the underlying Sheet — reset to the top when the
  // admin opens, logs in, or switches tabs, so the user never lands in the
  // middle of a long tab ("scrolls to the wrong place").
  const sheetScrollRef = useRef<HTMLDivElement>(null);

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  // PIN change state
  const [showPinSettings, setShowPinSettings] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // Active Tab — remember last visited tab
  // Analytics period filter
  const [analyticsRange, setAnalyticsRange] = useState<"today" | "7d" | "30d" | "all">("all");

  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    try {
      const saved = localStorage.getItem("delis_admin_tab");
      const all: AdminTab[] = ["analytics", "orders", "inventory", "requests", "jobs", "promos", "content", "site", "payments", "logs", "stories", "clients", "loyalty", "backup", "deal", "qr", "b2b", "certs", "delivery"];
      if (saved && (all as string[]).includes(saved)) return saved as AdminTab;
    } catch { /* ignore */ }
    return "analytics";
  });

  useEffect(() => {
    try {
      localStorage.setItem("delis_admin_tab", activeTab);
    } catch { /* ignore */ }
  }, [activeTab]);

  // Reset the sheet scroll whenever the panel opens, the admin logs in, or
  // the active tab changes — otherwise the user lands in the middle of a
  // long tab after switching.
  useEffect(() => {
    sheetScrollRef.current?.scrollTo({ top: 0 });
  }, [open, isAuthenticated, activeTab]);

  // Order manager: status filter + search
  const [orderFilter, setOrderFilter] = useState<"all" | Order["status"]>("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Server-side orders (admin panel): when the API is configured, show the real DB.
  // Polls every 20s while the panel is open so new orders appear live with a
  // sound + toast + badge (no manual refresh needed).
  const [serverOrders, setServerOrders] = useState<Order[] | null>(null);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [lastOrderIds, setLastOrderIds] = useState<string[] | null>(null);

  const playNewOrderChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const notes = [880, 1174.66, 1567.98]; // A5 · D6 · G6 — pleasant ascending chime
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + i * 0.12 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.6);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.7);
      });
    } catch { /* no audio */ }
  };

  useEffect(() => {
    if (!open) return;
    if (!isApiConfigured()) return;
    let cancelled = false;

    const load = async (notify: boolean) => {
      const [o, s] = await Promise.all([fetchAdminOrders(), fetchAdminStats()]);
      if (cancelled) return;
      if (s) setAdminStats(s);
      if (o) {
        setServerOrders(o);
        // Detect brand-new "new" orders since the last poll → notify the owner
        if (notify && lastOrderIds !== null) {
          const fresh = o.filter((ord) => ord.status === "new" && !lastOrderIds.includes(ord.id));
          if (fresh.length > 0) {
            playNewOrderChime();
            haptic("medium");
            fresh.forEach((ord) => onToast(
              lang === "ru" ? `🛎️ Новый заказ #${ord.id} — ${formatPrice(ord.total, lang)}!` : lang === "en" ? `🛎️ New order #${ord.id} — ${formatPrice(ord.total, lang)}!` : `🛎️ Yangi buyurtma #${ord.id} — ${formatPrice(ord.total, lang)}!`
            ));
          }
        }
        setLastOrderIds(o.map((x) => x.id));
      }
    };

    void load(false);
    const timer = setInterval(() => void load(true), 20_000);
    return () => { cancelled = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const allOrders = serverOrders ?? orders;

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return allOrders.filter((o) => {
      if (orderFilter !== "all" && o.status !== orderFilter) return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        o.recipientName.toLowerCase().includes(q) ||
        o.recipientPhone.replace(/\s+/g, "").includes(q.replace(/\s+/g, "")) ||
        (o.customerUsername || "").toLowerCase().includes(q)
      );
    });
  }, [allOrders, orderFilter, orderSearch]);

  // Editing state for inventory — complete product attributes
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [stockDelta, setStockDelta] = useState<string>("24");
  const [newPrice, setNewPrice] = useState<string>("");
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editVolume, setEditVolume] = useState("");
  const [editCat, setEditCat] = useState<"home" | "car">("home");
  const [editVolumes, setEditVolumes] = useState<string[]>([]);
  const [editCostPrice, setEditCostPrice] = useState<string>("");
  const [editBadge, setEditBadge] = useState<"" | "new" | "best">("");
  const [editGallery, setEditGallery] = useState<string[]>([]);

  // New product creation state
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [savingNewProduct, setSavingNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductCat, setNewProductCat] = useState<"home" | "car">("home");
  const [newProductVolume, setNewProductVolume] = useState("500 ml");
  const [newProductVolumes, setNewProductVolumes] = useState<string[]>([]);
  const [newProductCost, setNewProductCost] = useState("");
  const [newProductBadge, setNewProductBadge] = useState<"" | "new" | "best">("");
  const [newProductStock, setNewProductStock] = useState("24");
  const [newProductDesc, setNewProductDesc] = useState("");
  const [newProductGallery, setNewProductGallery] = useState<string[]>([]);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);

  // Inventory search
  const [productSearch, setProductSearch] = useState("");

  // Bulk edit: select several products, set price and/or stock in one action
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(() => new Set());
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");

  const toggleBulk = (id: string) => {
    haptic("light");
    setSelectedForBulk((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBulkEdit = async () => {
    const priceVal = parseInt(bulkPrice, 10);
    const stockVal = parseInt(bulkStock, 10);
    if (selectedForBulk.size === 0) return;
    if ((!bulkPrice.trim() || isNaN(priceVal) || priceVal < 1000) && (bulkStock.trim() === "" || isNaN(stockVal) || stockVal < 0)) {
      onToast(lang === "ru" ? "Укажите цену и/или остаток" : lang === "en" ? "Set price and/or stock" : "Narx va/yoki qoldiq kiriting");
      return;
    }
    let n = 0;
    let failed = 0;
    for (const id of selectedForBulk) {
      const target = products.find((p) => p.id === id);
      if (!target) continue;
      const patch: Partial<Product> = {};
      if (bulkPrice.trim() !== "" && !isNaN(priceVal) && priceVal >= 1000) patch.price = priceVal;
      if (bulkStock.trim() !== "" && !isNaN(stockVal) && stockVal >= 0) patch.stock = stockVal;
      if (Object.keys(patch).length === 0) continue;
      const outcome = await onUpdateProduct(id, patch);
      if (outcome.ok) n += 1;
      else failed += 1;
    }
    if (n > 0) {
      haptic("success");
      onToast(lang === "ru" ? `✓ Обновлено товаров: ${n}` : lang === "en" ? `✓ Updated products: ${n}` : `✓ Yangilangan mahsulotlar: ${n}`);
      setSelectedForBulk(new Set());
      setBulkPrice("");
      setBulkStock("");
    } else {
      haptic("error");
      onToast(lang === "ru" ? "Не удалось обновить товары на сервере" : lang === "en" ? "Could not update products on the server" : "Mahsulotlarni serverda yangilab bo'lmadi");
    }
  };

  // Bulk import from CSV (Excel-exported)
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  const handleImportProducts = async () => {
    // Expected format per line:
    //   name;price;category(home|car);volume;stock;cost;photo
    // photo (optional): up to several photos separated by "|" — the first one is
    //   the cover, the rest form the gallery. Each photo can be an existing public
    //   path ("images/prod-wax.jpg"), a bare filename ("prod-wax.jpg" — auto-prefixed
    //   with images/), an absolute https:// URL, or a data:image/... URL.
    //   Empty → default image per category.
    const normalizeImg = (raw: string): string => {
      let out = raw.trim();
      if (!out) return "";
      if (/^(https?:|data:image\/|blob:)/i.test(out)) return out;
      out = out.replace(/^\/+/, ""); // "/images/x.jpg" → "images/x.jpg"
      if (!out.startsWith("images/")) out = `images/${out}`; // "prod-wax.jpg" → "images/prod-wax.jpg"
      return out;
    };
    const lines = importText.split("\n").map((l) => l.trim()).filter(Boolean);
    let added = 0;
    let failed = 0;
    for (const line of lines) {
      const parts = line.split(";").map((s) => s.trim());
      if (parts.length < 2) continue;
      const [name, priceStr, cat, volume, stockStr, costStr, imgRaw] = parts;
      const price = parseInt(priceStr, 10);
      if (!name || isNaN(price) || price < 1000) continue;
      const category = cat === "car" ? "car" : "home";
      const photos = (imgRaw || "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(normalizeImg)
        .filter(Boolean);
      const img = photos[0] || (category === "car" ? "images/prod-wax.jpg" : "images/prod-floor.jpg");
      const gallery = photos.length > 1 ? photos : undefined;
      const product: Product = {
        id: `custom-${Date.now()}-${added}`,
        cat: category,
        price,
        costPrice: costStr ? parseInt(costStr, 10) || undefined : undefined,
        name,
        img,
        gallery,
        desc: { uz: name, ru: name, en: name },
        spec: { uz: "Import", ru: "Импорт", en: "Imported" },
        volume: volume || "500 ml",
        color: "#eaf4ff",
        usage: { uz: "", ru: "", en: "" },
        composition: { uz: "", ru: "", en: "" },
        story: { uz: name, ru: name, en: name },
        tips: [],
        rating: 5,
        reviewsCount: 0,
        reviews: [],
        stock: stockStr ? parseInt(stockStr, 10) || 0 : 0,
      };
      const outcome = await onAddProduct(product);
      if (outcome.ok) added++;
      else failed++;
    }
    haptic(added > 0 ? "success" : "error");
    if (failed > 0 && added === 0) {
      onToast(lang === "ru" ? "Товары не сохранены — проверьте права администратора и сервер" : lang === "en" ? "Products were not saved — check admin rights and the server" : "Mahsulotlar saqlanmadi — admin huquqi va serverni tekshiring");
      return;
    }
    onToast(
      added > 0
        ? (lang === "ru" ? `✓ Импортировано товаров: ${added}` : lang === "en" ? `✓ Imported products: ${added}` : `✓ Import qilindi: ${added}`)
        : (lang === "ru" ? "Формат: Название;Цена;home|car;Объём;Остаток;Себестоимость;Фото" : lang === "en" ? "Format: Name;Price;home|car;Volume;Stock;Cost;Photo" : "Format: Nomi;Narxi;home|car;Hajmi;Qoldiq;Sotib olish;Foto")
    );
    if (added > 0) { setImportText(""); setShowImport(false); }
  };

  /* Photo helpers — pick → client-side compress (≤900px JPEG) → server upload.
     Server stores to Supabase CDN when configured, else keeps the data URL. */
  const handlePhotoPick = async (file: File, onReady: (dataUrl: string) => void) => {
    if (file.size > 10_000_000) {
      onToast("Foto 10 MB dan kichik bo'lsin / Фото до 10 МБ");
      return;
    }
    const dataUrl = await compressImageFile(file);
    onReady(dataUrl);
  };

  /* Upload one extra gallery photo (cover stays unchanged) and append it to the
     in-progress edit list. Offline fallback keeps the data URL — it is re-uploaded
     by the server when the admin saves the gallery (the update endpoint uploads
     any data:image/... item). */
  const handleEditAddPhoto = (productId: string, file: File) => {
    void handlePhotoPick(file, async (dataUrl) => {
      setUploadingPhotoId(productId);
      try {
        const res = await adminUploadProductGalleryImage(productId, dataUrl);
        if (res?.ok) {
          setEditGallery((prev) => [...prev, res.img]);
          onToast(res.stored === "supabase" ? "✓ Foto CDN ga yuklandi" : "✓ Foto qo'shildi");
        } else {
          setEditGallery((prev) => [...prev, dataUrl]);
          onToast("Server javob bermadi — foto lokal saqlandi");
        }
      } finally {
        setUploadingPhotoId(null);
      }
    });
  };

  // Tracking inputs for order dispatch
  const [btsCodeInputs, setBtsCodeInputs] = useState<Record<string, string>>({});

  // Job applications (careers form)
  const [jobApps, setJobApps] = useState<JobApp[]>(() => loadJobApps());

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The local PIN is only a second screen lock. The server must also confirm
    // that signed Telegram initData belongs to ADMIN_CHAT_ID (or the dev token).
    if (pinInput.trim() !== getAdminPin()) {
      haptic("light");
      setPinError(true);
      return;
    }
    const verified = await fetchAdminStats();
    if (!verified) {
      haptic("error");
      setPinError(true);
      onToast(lang === "ru" ? "Telegram-аккаунт не имеет прав администратора" : lang === "en" ? "This Telegram account is not an administrator" : "Telegram akkauntida admin huquqi yo'q");
      return;
    }
    setAdminStats(verified);
    haptic("success");
    setIsAuthenticated(true);
    setPinError(false);
    setPinInput("");
  };

  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    const msgShort = lang === "ru" ? "PIN должен содержать минимум 4 символа" : lang === "en" ? "PIN must be at least 4 characters" : "PIN kamida 4 belgi bo'lishi kerak";
    const msgMismatch = lang === "ru" ? "PIN-коды не совпадают!" : lang === "en" ? "PIN codes do not match!" : "PIN kodlar mos kelmaydi!";
    const msgOk = lang === "ru" ? "✓ PIN успешно обновлён!" : lang === "en" ? "✓ PIN updated successfully!" : "✓ PIN muvaffaqiyatli yangilandi!";
    if (newPin.length < 4) { onToast(msgShort); return; }
    if (newPin !== confirmPin) { onToast(msgMismatch); return; }
    setAdminPin(newPin);
    haptic("success");
    onToast(msgOk);
    setShowPinSettings(false);
    setNewPin("");
    setConfirmPin("");
  };

  const handleAddProduct = async () => {
    const name = newProductName.trim();
    const price = parseInt(newProductPrice);
    if (!name || isNaN(price) || price < 1000) { onToast("Mahsulot nomini va narxini kiriting"); return; }

    haptic("medium");
    const newId = `custom-${Date.now()}`;
    const newProduct: Product = {
      id: newId,
      cat: newProductCat,
      price,
      costPrice: newProductCost ? parseInt(newProductCost) : undefined,
      badge: newProductBadge || undefined,
      name,
      img: newProductGallery[0] || (newProductCat === "home" ? "images/prod-floor.jpg" : "images/prod-wax.jpg"),
      gallery: newProductGallery.length > 1 ? newProductGallery : undefined,
      desc: { uz: newProductDesc || name, ru: newProductDesc || name, en: newProductDesc || name },
      spec: { uz: "Yangi mahsulot", ru: "Новый продукт", en: "New product" },
      volume: newProductVolume,
      volumes: newProductVolumes.length > 0 ? newProductVolumes.map((l) => ({ label: l, liters: parseFloat(l) * (l.includes("ml") ? 0.001 : 1) })) : undefined,
      color: "#eaf4ff",
      usage: { uz: "Qo'llanma", ru: "Инструкция", en: "Manual" },
      composition: { uz: "DELIS formula", ru: "Формула DELIS", en: "DELIS formula" },
      story: { uz: name, ru: name, en: name },
      tips: [],
      rating: 5,
      reviewsCount: 0,
      reviews: [],
      stock: Number(newProductStock) || 0,
    };

    // Server-first: only when the backend confirms the save does the product
    // enter the catalog. Otherwise it would look added but fail at checkout.
    setSavingNewProduct(true);
    const outcome = await onAddProduct(newProduct);
    setSavingNewProduct(false);

    if (!outcome.ok) {
      haptic("error");
      if (outcome.offline) {
        onToast(lang === "ru" ? "Сервер недоступен — товар не сохранён" : lang === "en" ? "Server unreachable — product was not saved" : "Serverga ulanib bo'lmadi — mahsulot saqlanmadi");
      } else if (outcome.status === 403) {
        onToast(lang === "ru" ? "Нет прав администратора — товар не сохранён на сервере" : lang === "en" ? "No admin rights — product was not saved on the server" : "Admin huquqi yo'q — mahsulot serverda saqlanmadi");
      } else {
        onToast(lang === "ru" ? "Товар не сохранён на сервере — попробуйте ещё раз" : lang === "en" ? "Product was not saved on the server — try again" : "Mahsulot serverda saqlanmadi — qayta urinib ko'ring");
      }
      return;
    }

    haptic("success");
    onToast(`✓ ${name} qo'shildi!`);
    setShowNewProduct(false);
    setNewProductName("");
    setNewProductPrice("");
    setNewProductCat("home");
    setNewProductVolume("500 ml");
    setNewProductVolumes([]);
    setNewProductCost("");
    setNewProductBadge("");
    setNewProductStock("24");
    setNewProductDesc("");
    setNewProductGallery([]);
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteProduct = (productId: string) => {
    // Simple two-step: first click shows inline confirmation, second confirms
    if (confirmDeleteId !== productId) {
      haptic("medium");
      setConfirmDeleteId(productId);
      return;
    }
    haptic("light");
    setConfirmDeleteId(null);
    void (async () => {
      const outcome = await onDeleteProduct(productId);
      if (!outcome.ok) {
        haptic("error");
        onToast(lang === "ru" ? "Не удалось удалить товар на сервере" : lang === "en" ? "Could not delete product on the server" : "Mahsulotni serverda o'chirib bo'lmadi");
        return;
      }
      onToast("🗑️ " + (lang === "ru" ? "Товар удалён" : lang === "en" ? "Product deleted" : "Mahsulot o'chirildi"));
    })();
  };

  const cancelDelete = () => setConfirmDeleteId(null);

  // Orders within the selected analytics period
  const rangeOrders = useMemo(() => {
    const day = 86_400_000;
    const now = Date.now();
    const cut =
      analyticsRange === "today" ? now - day
      : analyticsRange === "7d" ? now - 7 * day
      : analyticsRange === "30d" ? now - 30 * day
      : 0;
    return cut ? allOrders.filter((o) => o.createdAt >= cut) : allOrders;
  }, [allOrders, analyticsRange]);

  // Live Analytics Computations
  const analytics = useMemo(() => {
    const totalRevenue = rangeOrders.reduce((sum, o) => sum + o.total, 0);
    const completedOrders = rangeOrders.filter((o) => o.status === "delivered" || o.status === "shipped").length;
    const avgOrderValue = rangeOrders.length > 0 ? Math.round(totalRevenue / rangeOrders.length) : 0;

    // Wholesale orders (orders with > 12 items or discount >= 20%)
    const wholesaleOrders = rangeOrders.filter((o) => o.count >= 12 || o.discount >= 20000);
    const wholesaleRevenue = wholesaleOrders.reduce((sum, o) => sum + o.total, 0);
    const wholesaleShare = totalRevenue > 0 ? Math.round((wholesaleRevenue / totalRevenue) * 100) : 0;

    // Regional breakdown
    const regionCounts: Record<string, number> = {};
    rangeOrders.forEach((o) => {
      const z = o.deliveryZone || "Namangan viloyati";
      regionCounts[z] = (regionCounts[z] || 0) + 1;
    });

    const topRegions = Object.entries(regionCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    // Top products by revenue
    const prodStats = new Map<string, { name: string; qty: number; revenue: number }>();
    rangeOrders.forEach((o) => {
      o.items.forEach((it) => {
        const cur = prodStats.get(it.id) || { name: it.name, qty: 0, revenue: 0 };
        cur.qty += it.qty;
        cur.revenue += it.price * it.qty;
        prodStats.set(it.id, cur);
      });
    });
    const topProducts = Array.from(prodStats.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Month-end forecast
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const daysElapsed = Math.max(1, new Date().getDate());
    const monthRevenue = rangeOrders.filter((o) => o.createdAt >= monthStart.getTime()).reduce((s, o) => s + o.total, 0);
    const last30 = rangeOrders.filter((o) => o.createdAt >= Date.now() - 30 * 86_400_000);
    const avgDaily = last30.length > 0 ? last30.reduce((s, o) => s + o.total, 0) / 30 : 0;
    const forecast = Math.round(avgDaily * daysInMonth);

    return {
      totalRevenue,
      completedOrders,
      totalOrders: rangeOrders.length,
      avgOrderValue,
      wholesaleShare,
      topRegions,
      topProducts,
      // Orders by hour of day — for courier planning
      hourCounts: (() => {
        const hc = new Array<number>(24).fill(0);
        rangeOrders.forEach((o) => {
          const h = new Date(o.createdAt).getHours();
          if (h >= 0 && h <= 23) hc[h] += 1;
        });
        return hc;
      })(),
      forecast,
      monthRevenue,
      daysElapsed,
      daysInMonth,
      conversionRate: 4.8,
    };
  }, [rangeOrders]);

  const handleStockUpdate = async (productId: string) => {
    const delta = parseInt(stockDelta, 10);
    if (isNaN(delta)) return;
    const target = products.find((p) => p.id === productId);
    if (!target) return;
    const nextStock = Math.max(0, (target.stock || 0) + delta);
    const outcome = await onUpdateProduct(productId, { stock: nextStock });
    if (!outcome.ok) {
      haptic("error");
      onToast(lang === "ru" ? "Не удалось обновить остаток на сервере" : lang === "en" ? "Could not update stock on the server" : "Qoldiqni serverda yangilab bo'lmadi");
      return;
    }
    haptic("success");
    onToast(`${target.name}: ${t("stockWarehouse")} +${delta} (${nextStock} ${t("stockUnits")})`);
    setEditingProductId(null);
  };

  const handlePriceUpdate = async (productId: string) => {
    const priceVal = parseInt(newPrice, 10);
    if (isNaN(priceVal) || priceVal < 1000) return;
    const target = products.find((p) => p.id === productId);
    if (!target) return;
    const outcome = await onUpdateProduct(productId, { price: priceVal });
    if (!outcome.ok) {
      haptic("error");
      onToast(lang === "ru" ? "Не удалось обновить цену на сервере" : lang === "en" ? "Could not update price on the server" : "Narxni serverda yangilab bo'lmadi");
      return;
    }
    haptic("success");
    onToast(`${target.name}: ${formatPrice(priceVal, lang)}`);
    setEditingProductId(null);
    setNewPrice("");
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        onClose();
        setIsAuthenticated(false);
        setPinInput("");
      }}
      title={undefined}
      panelClassName="admin-pro admin-sheet"
      contentRef={sheetScrollRef}
    >
      {!isAuthenticated ? (
        /* PIN Login Screen — premium lock */
        <div className="-mx-4 min-[390px]:-mx-5 -mt-2 overflow-hidden rounded-t-[26px]">
          <div className="admin-hero">
            <div className="admin-grid-bg relative px-5 pb-7 pt-8 text-center">
              <div className="admin-logo-tile mx-auto">
                <BrandMark size={40} className="invert" />
              </div>
              <p className="mt-4 font-display text-[22px] font-extrabold tracking-tight text-white">
                DELIS <span className="text-amber">Console</span>
              </p>
              <p className="mx-auto mt-1.5 max-w-[260px] text-[12px] font-semibold leading-relaxed text-white/45">
                {t("adminSub")}
              </p>
              <div className="mx-auto mt-4 h-px w-16 bg-gradient-to-r from-transparent via-amber/60 to-transparent" />
              <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <IconLock size={12} className="text-amber" />
                <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/55">Secure access</span>
              </div>
            </div>
          </div>

          <form onSubmit={handlePinSubmit} className="mt-4 space-y-3 px-1">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setPinError(false);
              }}
              placeholder={t("adminPinPlaceholder")}
              className={`admin-pin-input w-full px-4 py-4 text-center font-display text-[24px] font-bold tracking-[0.3em] text-ink outline-none placeholder:text-ink/25 ${
                pinError ? "!border-rose-400/50 !ring-2 !ring-rose-400/15" : ""
              }`}
            />
            {pinError && <p className="text-[12px] font-bold text-rose-300">{t("adminPinError")}</p>}

            <button
              type="submit"
              className="press flex h-13 w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-amber to-amberdeep text-[14px] font-bold text-[#17110a] shadow-[0_16px_34px_-14px_rgba(232,200,116,0.65)]"
            >
              <IconLock size={16} />
              <span>{t("adminPinSubmit")}</span>
            </button>
          </form>
        </div>
      ) : (
        /* Authenticated Admin Dashboard */
        <div className="space-y-3.5 pt-0">
          {/* Hero header */}
          <div className="-mx-4 min-[390px]:-mx-5 -mt-2 overflow-hidden rounded-t-[26px]">
            <div className="admin-hero">
              <div className="admin-grid-bg relative px-4 pb-5 pt-4 min-[390px]:px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="admin-logo-tile" style={{ width: 46, height: 46 }}>
                      <BrandMark size={32} className="invert" />
                    </span>
                    <div>
                      <BrandWordmark className="h-[14px] w-[66px] invert" />
                      <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.2em] text-white/45">
                        {lang === "uz" ? "Boshqaruv konsoli" : lang === "ru" ? "Консоль владельца" : "Owner console"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="admin-live"><span className="admin-live-dot" /> LIVE</span>
                    <button
                      onClick={onClose}
                      aria-label="Close"
                      className="press flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white"
                    >
                      <IconClose size={15} />
                    </button>
                  </div>
                </div>

                <p className="mt-4 font-display text-[22px] font-extrabold leading-none text-white">{t("adminTitle")}</p>
                <p className="mt-1.5 text-[11px] font-semibold text-white/40">
                  {lang === "uz"
                    ? `Namangan zavodi · ${allOrders.length} ta buyurtma`
                    : lang === "ru"
                      ? `Завод в Намангане · ${allOrders.length} заказов`
                      : `Namangan factory · ${allOrders.length} orders`}
                </p>

                {/* Quick stats on the hero */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="admin-hero-chip p-2.5 text-center">
                    <p className="font-display text-[18px] font-extrabold text-amber">
                      {allOrders.filter((o) => o.status === "new").length}
                    </p>
                    <p className="mt-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-white/45">
                      {lang === "uz" ? "Yangi" : lang === "ru" ? "Новые" : "New"}
                    </p>
                  </div>
                  <div className="admin-hero-chip p-2.5 text-center">
                    <p className="font-display text-[18px] font-extrabold text-moss">{products.length}</p>
                    <p className="mt-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-white/45">
                      {lang === "uz" ? "Tovarlar" : lang === "ru" ? "Товары" : "Products"}
                    </p>
                  </div>
                  <div className="admin-hero-chip p-2.5 text-center">
                    <p className="font-display text-[18px] font-extrabold text-sky-300">
                      {Object.values(loadPromoCodes()).filter((p) => p.active !== false).length}
                    </p>
                    <p className="mt-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-white/45">
                      {lang === "uz" ? "Promokod" : lang === "ru" ? "Промо" : "Promos"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation: grouped sub-tabs, sticky above content */}
          <div className="sticky top-0 z-20 -mx-4 min-[390px]:-mx-5 border-b border-white/5 bg-paper/95 px-4 py-2 backdrop-blur-xl min-[390px]:px-5">
            {(() => {
              const TABS = [
                { id: "analytics", label: t("adminTabAnalytics"), icon: IconChart, badge: 0 },
                { id: "orders", label: t("adminTabOrders"), icon: IconBox, badge: allOrders.filter((o) => o.status === "new").length },
                { id: "inventory", label: t("adminTabProducts"), icon: IconFactory, badge: 0 },
                { id: "requests", label: t("adminTabReturns"), icon: IconRefresh, badge: returns.filter((r) => r.status === "pending").length + waitlist.filter((w) => !w.notified).length },
                { id: "promos", label: t("adminTabPromos"), icon: IconTag, badge: 0 },
                { id: "content", label: lang === "ru" ? "Контент" : "Kontent", icon: IconFileText, badge: 0 },
                { id: "site", label: lang === "ru" ? "Сайт" : lang === "en" ? "Site" : "Sayt", icon: IconSettings, badge: 0 },
                { id: "payments", label: lang === "ru" ? "Платежи" : lang === "en" ? "Payments" : "To'lovlar", icon: IconCreditCard, badge: 0 },
                { id: "stories", label: "Stories", icon: IconMedal, badge: 0 },
                { id: "clients", label: lang === "ru" ? "Клиенты" : lang === "en" ? "Clients" : "Mijozlar", icon: IconUser, badge: 0 },
                { id: "loyalty", label: lang === "ru" ? "Лояльность" : lang === "en" ? "Loyalty" : "Loyallik", icon: IconMedal, badge: 0 },
                { id: "backup", label: lang === "ru" ? "Бекап" : lang === "en" ? "Backup" : "Zaxira", icon: IconShield, badge: 0 },
                { id: "deal", label: lang === "ru" ? "Товар дня" : "Kun taklifi", icon: IconSparkle, badge: 0 },
                { id: "qr", label: lang === "ru" ? "QR-коды" : lang === "en" ? "QR codes" : "QR-kodlar", icon: IconShield, badge: 0 },
                { id: "b2b", label: "B2B", icon: IconFactory, badge: 0 },
                { id: "certs", label: lang === "ru" ? "Сертификаты" : lang === "en" ? "Certificates" : "Sertifikatlar", icon: IconMedal, badge: 0 },
                { id: "delivery", label: lang === "ru" ? "Доставка" : lang === "en" ? "Delivery" : "Yetkazish", icon: IconTruck, badge: 0 },
                { id: "logs", label: t("opLogsTitle"), icon: IconClock, badge: 0 },
              ] as const;
              const OPS = lang === "uz" ? "Operatsiya" : lang === "ru" ? "Операции" : "Operations";
              const MKT = lang === "uz" ? "Marketing" : lang === "ru" ? "Маркетинг" : "Marketing";
              const SYS = lang === "uz" ? "Tizim" : lang === "ru" ? "Система" : "System";
              const GROUPS: Array<{ label: string; ids: readonly string[] }> = [
                { label: OPS, ids: ["analytics", "orders", "inventory", "requests", "clients", "jobs"] },
                { label: MKT, ids: ["promos", "deal", "loyalty", "stories", "certs", "qr", "b2b"] },
                { label: SYS, ids: ["content", "site", "payments", "delivery", "backup", "logs"] },
              ];
              return GROUPS.map((g) => (
                <div key={g.label} className="mb-2 last:mb-0">
                  <p className="px-1.5 pb-1 text-[9px] font-extrabold uppercase tracking-[0.24em] text-ink/30">{g.label}</p>
                  <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                    {TABS.filter((tab) => (g.ids as readonly string[]).includes(tab.id)).map((tab) => {
                      const active = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            haptic("light");
                            setActiveTab(tab.id);
                          }}
                          className={`press relative flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-bold transition-all ${
                            active
                              ? "border-amber/55 bg-gradient-to-r from-amber to-amberdeep text-[#17110a] shadow-[0_10px_22px_-10px_rgba(232,200,116,0.6)]"
                              : "border-white/8 bg-card/70 text-ink2 hover:border-white/15 hover:text-ink"
                          }`}
                        >
                          <span className={active ? "text-[#17110a]/70" : "text-ink2/80"}>
                            <tab.icon size={14} />
                          </span>
                          <span>{tab.label}</span>
                          {tab.badge > 0 && (
                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                              {tab.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>

          {/* Admin quick actions: change PIN / create product */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                haptic("light");
                setShowPinSettings((s) => !s);
              }}
              className="press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-white/10 bg-card/80 text-[12px] font-bold text-ink2 hover:border-white/20 hover:text-ink"
            >
              <IconLock size={14} className="text-amber" /> {showPinSettings ? "Yopish" : "PIN o'zgartirish"}
            </button>
            <button
              onClick={() => {
                haptic("light");
                setShowNewProduct((s) => !s);
                setActiveTab("inventory");
              }}
              className="press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-moss/25 bg-sagetint/50 text-[12px] font-bold text-moss hover:bg-sagetint"
            >
              <IconPlus size={14} />
              <span>Yangi mahsulot</span>
            </button>
          </div>

          {/* PIN change form */}
          {showPinSettings && (
            <form
              onSubmit={handleChangePin}
              className="animate-fadein space-y-3 rounded-[20px] border border-ink/12 bg-card p-4 shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <span className="motion-icon-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-amber/15 text-amberdeep">
                  <IconLock size={18} />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-[13px] font-bold text-ink">
                    {lang === "ru" ? "Смена PIN-кода" : lang === "en" ? "Change PIN code" : "PIN kodni almashtirish"}
                  </p>
                  <p className="text-[11px] font-medium text-ink/55">
                    {lang === "ru" ? "Минимум 4 цифры · действует на этом устройстве" : lang === "en" ? "At least 4 digits · applies on this device" : "Kamida 4 ta raqam · shu qurilmada ishlaydi"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink/55">
                    {lang === "ru" ? "Новый PIN" : lang === "en" ? "New PIN" : "Yangi PIN"}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••"
                    className="w-full rounded-[14px] border border-ink/15 bg-paper px-3.5 py-3 font-display text-[17px] font-bold tracking-[0.3em] text-ink outline-none placeholder:text-ink/25 focus:border-moss"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink/55">
                    {lang === "ru" ? "Повторите PIN" : lang === "en" ? "Confirm PIN" : "PIN ni tasdiqlang"}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••"
                    className={`w-full rounded-[14px] border bg-paper px-3.5 py-3 font-display text-[17px] font-bold tracking-[0.3em] text-ink outline-none placeholder:text-ink/25 focus:border-moss ${
                      confirmPin.length > 0 && newPin !== confirmPin ? "border-[#B3402E] ring-2 ring-[#B3402E]/15" : "border-ink/15"
                    }`}
                  />
                </div>
              </div>

              {/* Live match hint — no toast surprises */}
              {confirmPin.length > 0 &&
                (newPin === confirmPin ? (
                  <p className="text-[11px] font-bold text-moss">
                    <span className="inline-flex items-center gap-1"><IconCheck size={13} /> {lang === "ru" ? "PIN-коды совпадают" : lang === "en" ? "PINs match" : "PIN kodlar mos keldi"}</span>
                  </p>
                ) : (
                  <p className="text-[11px] font-bold text-[#B3402E]">
                    <span className="inline-flex items-center gap-1"><IconClose size={13} /> {lang === "ru" ? "PIN-коды не совпадают" : lang === "en" ? "PINs do not match" : "PIN kodlar mos kelmayapti"}</span>
                  </p>
                ))}

              <button
                type="submit"
                disabled={newPin.length < 4 || newPin !== confirmPin}
                className="press h-11 w-full rounded-[14px] bg-amber text-[13px] font-bold text-white disabled:opacity-30"
              >
                {lang === "ru" ? "Сохранить PIN" : lang === "en" ? "Save PIN" : "PIN ni saqlash"}
              </button>
            </form>
          )}

          {/* New product form */}
          {showNewProduct && (
            <div className="space-y-2.5 rounded-[20px] border border-moss/25 bg-sagetint/40 p-3.5 animate-fadein">
              <p className="flex items-center gap-1.5 font-display text-[13px] font-bold text-pine"><IconSparkle size={14} /> Yangi mahsulot yaratish</p>
              <input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="Mahsulot nomi (masalan: Window Cleaner)"
                className="w-full rounded-[12px] border border-ink/18 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
              />
              <input
                type="number"
                value={newProductPrice}
                onChange={(e) => setNewProductPrice(e.target.value)}
                placeholder="Narxi (UZS, masalan: 55000)"
                className="w-full rounded-[12px] border border-ink/18 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newProductCat}
                  onChange={(e) => setNewProductCat(e.target.value as "home" | "car")}
                  className="rounded-[12px] border border-ink/18 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
                >
                  <option value="home">Home Care</option>
                  <option value="car">Car Care</option>
                </select>
                <div>
                  <input
                    value={newProductVolume}
                    onChange={(e) => setNewProductVolume(e.target.value)}
                    placeholder="500 ml"
                    className="w-full rounded-[12px] border border-ink/18 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
                  />
                  <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-ink/50">{lang === "ru" ? "Выберите доступные объёмы" : lang === "en" ? "Select available sizes" : "Qaysi hajmlar mavjud?"}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {["300 ml","500 ml","1 L","2 L","5 L","10 L","20 L"].map((v) => {
                      const on = newProductVolumes.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => { haptic("light"); setNewProductVolumes(on ? newProductVolumes.filter((x) => x !== v) : [...newProductVolumes, v]); }}
                          className={`press rounded-full border px-2 py-0.5 text-[10px] font-bold transition-all ${
                            on ? "border-moss bg-moss/10 text-moss" : "border-ink/15 text-ink2"
                          }`}
                        >
                          {on ? "✓ " : ""}{v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={newProductStock}
                  onChange={(e) => setNewProductStock(e.target.value)}
                  placeholder="Ombor qoldig'i"
                  className="rounded-[12px] border border-ink/18 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
                />
                <input
                  type="number"
                  value={newProductCost}
                  onChange={(e) => setNewProductCost(e.target.value)}
                  placeholder={lang === "ru" ? "Себестоимость (закуп)" : lang === "en" ? "Cost price" : "Sotib olish narxi"}
                  className="rounded-[12px] border border-ink/18 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
                />
              </div>
              <div className="flex gap-1.5">
                {(["new", "best"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => { haptic("light"); setNewProductBadge(newProductBadge === b ? "" : b); }}
                    className={`press flex-1 rounded-[12px] border px-2 py-2 text-[11px] font-bold transition-all ${
                      newProductBadge === b ? "border-amber bg-amber/10 text-amberdeep" : "border-ink/15 text-ink2"
                    }`}
                  >
                    {newProductBadge === b ? "✓ " : ""}{b === "new" ? (lang === "ru" ? "НОВИНКА" : lang === "en" ? "NEW" : "YANGI") : (lang === "ru" ? "ХИТ" : lang === "en" ? "BEST" : "HIT")}
                  </button>
                ))}
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink/50">{lang === "ru" ? "Фото товара (несколько — листаются)" : lang === "en" ? "Product photos (several — swipeable)" : "Mahsulot fotolari (bir nechta — suriladi)"}</p>
                <div className="flex flex-wrap gap-2">
                  {newProductGallery.map((src, i) => (
                    <div key={`${i}-${src.slice(-12)}`} className="relative">
                      <img src={src} alt="" className="h-16 w-16 rounded-[12px] border border-ink/15 object-cover" />
                      <button
                        type="button"
                        onClick={() => { haptic("light"); setNewProductGallery(newProductGallery.filter((_, idx) => idx !== i)); }}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#B3402E] text-white"
                      >
                        <IconClose size={11} />
                      </button>
                      {i === 0 && (
                        <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 text-[8px] font-bold text-white">
                          {lang === "ru" ? "Обложка" : lang === "en" ? "Cover" : "Muqova"}
                        </span>
                      )}
                    </div>
                  ))}
                  <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[12px] border border-dashed border-moss/40 bg-sagetint/40 text-pine">
                    <IconPlus size={16} />
                    <span className="text-[9px] font-bold">{lang === "ru" ? "Фото" : "Foto"}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void handlePhotoPick(file, (dataUrl) => setNewProductGallery((prev) => [...prev, dataUrl]));
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
              <textarea
                value={newProductDesc}
                onChange={(e) => setNewProductDesc(e.target.value)}
                placeholder="Qisqa tavsif (ixtiyoriy)"
                rows={2}
                className="w-full resize-none rounded-[12px] border border-ink/18 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
              />
              <button
                onClick={() => void handleAddProduct()}
                disabled={savingNewProduct}
                className="press h-10 w-full rounded-[12px] bg-moss text-[12px] font-bold text-white disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1">{savingNewProduct ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : <IconCheck size={14} />} {savingNewProduct ? (lang === "ru" ? "Сохранение…" : lang === "en" ? "Saving…" : "Saqlanmoqda…") : "Mahsulotni qo'shish"}</span>
              </button>
            </div>
          )}

          {/* ─────────────── TAB 1: LIVE ANALYTICS ─────────────── */}
          {activeTab === "analytics" && (
            <div className="space-y-3 animate-pop">
              {/* Revenue hero — live server numbers when the API is connected */}
              {adminStats && (
                <AdminCard tone="gold" className="relative overflow-hidden">
                  <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-amber/12 blur-3xl" />
                  <AdminSectionLabel
                    icon={<IconSymbol symbol="📡" size={13} />}
                    action={<span className="admin-live"><span className="admin-live-dot" /> LIVE</span>}
                  >
                    {lang === "uz" ? "Server statistikasi" : lang === "ru" ? "Статистика сервера" : "Server stats"}
                  </AdminSectionLabel>

                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink/40">
                        {lang === "uz" ? "Jami tushum" : lang === "ru" ? "Выручка всего" : "Total revenue"}
                      </p>
                      <p className="mt-1 truncate font-display text-[26px] font-extrabold leading-none text-amber">
                        {formatPrice(adminStats.totals.revenueAll, lang)}
                      </p>
                      <p className="mt-2 text-[11px] font-semibold text-ink/45">
                        {adminStats.totals.ordersCount} {lang === "uz" ? "buyurtma" : lang === "ru" ? "заказов" : "orders"}
                        {" · "}{formatPrice(adminStats.totals.avgOrderValue, lang)}
                        {" / "}{lang === "uz" ? "o'rtacha" : lang === "ru" ? "средний" : "avg"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-[20px] font-extrabold text-moss">{adminStats.totals.usersCount}</p>
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-ink/40">
                        {lang === "uz" ? "Mijozlar" : lang === "ru" ? "Клиенты" : "Customers"}
                      </p>
                    </div>
                  </div>

                  {/* 14-day revenue sparkline */}
                  {adminStats.revenueByDay.length > 0 && (
                    <div className="mt-4 flex h-16 items-end gap-1">
                      {adminStats.revenueByDay.map((d) => {
                        const max = Math.max(...adminStats.revenueByDay.map((x) => x.revenue), 1);
                        return (
                          <div key={d.date} className="flex-1" title={`${d.date}: ${formatPrice(d.revenue, lang)} · ${d.orders}`}>
                            <div
                              className="w-full rounded-t-[5px] bg-gradient-to-t from-amber/20 to-amber/90 transition-all duration-500"
                              style={{ height: `${Math.max(6, (d.revenue / max) * 62)}px` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Compact server KPIs */}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-[14px] border border-white/8 bg-card/70 p-2.5 text-center">
                      <p className="font-display text-[15px] font-extrabold text-ink">{adminStats.totals.repeatCustomers}</p>
                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-ink2">{lang === "uz" ? "Qaytgan" : lang === "ru" ? "Повтор" : "Repeat"}</p>
                    </div>
                    <div className="rounded-[14px] border border-white/8 bg-card/70 p-2.5 text-center">
                      <p className="font-display text-[15px] font-extrabold text-ink">{adminStats.totals.pendingWaitlist}</p>
                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-ink2">Waitlist</p>
                    </div>
                    <div className="rounded-[14px] border border-white/8 bg-card/70 p-2.5 text-center">
                      <p className="font-display text-[15px] font-extrabold text-ink">{adminStats.totals.activeSubscriptions}</p>
                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-ink2">{lang === "uz" ? "Obuna" : lang === "ru" ? "Подписки" : "Subs"}</p>
                    </div>
                  </div>

                  {/* 30d comparison */}
                  {adminStats.compare && (
                    <div className="mt-3 rounded-[14px] border border-white/8 bg-card/70 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink2">
                          {lang === "uz" ? "30 kun vs oldingi 30" : lang === "ru" ? "30 дней vs предыдущие 30" : "30d vs previous 30"}
                        </p>
                        {adminStats.compare.revenueDeltaPct === null ? (
                          <span className="text-[11px] font-bold text-ink2">—</span>
                        ) : (
                          <span className={`text-[12px] font-extrabold ${adminStats.compare.revenueDeltaPct >= 0 ? "text-moss" : "text-rose-300"}`}>
                            {adminStats.compare.revenueDeltaPct >= 0 ? "▲" : "▼"} {Math.abs(adminStats.compare.revenueDeltaPct)}%
                          </span>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wide text-ink/40">{lang === "uz" ? "So'nggi 30" : lang === "ru" ? "Последние 30" : "Last 30"}</p>
                          <p className="font-display text-[13px] font-extrabold text-ink">{formatPrice(adminStats.compare.last30, lang)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wide text-ink/40">{lang === "uz" ? "Oldingi 30" : lang === "ru" ? "Предыдущие 30" : "Previous 30"}</p>
                          <p className="font-display text-[13px] font-extrabold text-ink2">{formatPrice(adminStats.compare.prev30, lang)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top products (server) */}
                  {adminStats.topProducts.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink/40">
                        {lang === "uz" ? "Top-5 (server)" : lang === "ru" ? "Топ-5 (сервер)" : "Top 5 (server)"}
                      </p>
                      {adminStats.topProducts.map((p, i) => (
                        <div key={p.id} className="flex items-center justify-between rounded-[12px] border border-white/6 bg-card/60 px-3 py-2">
                          <span className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-ink">
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 font-display text-[9px] font-bold text-amber">{i + 1}</span>
                            <span className="truncate">{p.name}</span>
                          </span>
                          <span className="ml-2 shrink-0 text-[11px] font-bold text-moss">{p.qty} {t("stockUnits")} · {formatPrice(p.revenue, lang)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </AdminCard>
              )}

              {/* Period filter */}
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto pt-0.5">
                {([
                  { id: "today", label: lang === "uz" ? "Bugun" : lang === "ru" ? "Сегодня" : "Today" },
                  { id: "7d", label: lang === "uz" ? "7 kun" : lang === "ru" ? "7 дней" : "7 days" },
                  { id: "30d", label: lang === "uz" ? "30 kun" : lang === "ru" ? "30 дней" : "30 days" },
                  { id: "all", label: lang === "uz" ? "Hammasi" : lang === "ru" ? "Всё время" : "All" },
                ] as const).map((f) => (
                  <AdminChip
                    key={f.id}
                    active={analyticsRange === f.id}
                    onClick={() => { haptic("light"); setAnalyticsRange(f.id); }}
                  >
                    {f.label}
                  </AdminChip>
                ))}
              </div>

              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <AdminKpi
                  label={t("adminAnalyticsRev")}
                  value={formatPrice(analytics.totalRevenue, lang)}
                  hint={`${analytics.totalOrders} ${lang === "uz" ? "buyurtma" : lang === "ru" ? "заказов" : "orders"}`}
                  icon={<IconSymbol symbol="💰" size={13} />}
                  tone="gold"
                />
                <AdminKpi
                  label={t("adminAnalyticsWholesale")}
                  value={`${analytics.wholesaleShare}%`}
                  hint="B2B + Do'konlar"
                  icon={<IconFactory size={13} />}
                  tone="green"
                />
                <AdminKpi
                  label={t("adminAnalyticsAvg")}
                  value={formatPrice(analytics.avgOrderValue, lang)}
                  icon={<IconSymbol symbol="🧾" size={13} />}
                />
                <AdminKpi
                  label={t("adminConversionRate")}
                  value={`${analytics.conversionRate}%`}
                  hint="Telegram Mini App"
                  icon={<IconChart size={13} />}
                  tone="blue"
                />
              </div>

              {/* Regional sales */}
              <AdminCard>
                <AdminSectionLabel icon={<IconSymbol symbol="📍" size={13} />}>
                  {t("adminTopRegions")} (O'zbekiston)
                </AdminSectionLabel>
                <div className="mt-3 space-y-2.5">
                  {analytics.topRegions.map((reg, idx) => {
                    const maxCount = Math.max(...analytics.topRegions.map((r) => r.count), 1);
                    return (
                      <div key={idx}>
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 font-display text-[10px] font-bold text-ink2">{idx + 1}</span>
                            <span className="truncate font-semibold text-ink">{reg.name}</span>
                          </span>
                          <span className="shrink-0 font-display text-[11px] font-bold text-amber">{reg.count} {lang === "uz" ? "buyurtma" : lang === "ru" ? "заказов" : "orders"}</span>
                        </div>
                        <AdminBar className="mt-1.5" pct={(reg.count / maxCount) * 100} />
                      </div>
                    );
                  })}
                </div>
              </AdminCard>

              {/* Top products with share bars */}
              {analytics.topProducts.length > 0 && (
                <AdminCard>
                  <AdminSectionLabel icon={<IconSymbol symbol="🏆" size={13} />}>
                    {lang === "uz" ? "Top mahsulotlar" : lang === "ru" ? "Топ товары" : "Top products"}
                  </AdminSectionLabel>
                  <div className="mt-3 space-y-3">
                    {analytics.topProducts.map((p, i) => {
                      const pct = analytics.totalRevenue > 0 ? Math.round((p.revenue / analytics.totalRevenue) * 100) : 0;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between gap-2 text-[12px]">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 font-display text-[10px] font-bold text-amber">{i + 1}</span>
                              <span className="truncate font-bold text-ink">{p.name}</span>
                              <span className="shrink-0 text-[10px] font-semibold text-ink/45">× {p.qty}</span>
                            </span>
                            <span className="shrink-0 font-display text-[12px] font-bold text-ink/70">{formatPrice(p.revenue, lang)} · {pct}%</span>
                          </div>
                          <AdminBar className="mt-1.5" pct={pct} tone="green" />
                        </div>
                      );
                    })}
                  </div>
                </AdminCard>
              )}

              {/* Orders by hour */}
              {allOrders.length > 0 && (
                <AdminCard>
                  <AdminSectionLabel
                    icon={<IconClock size={13} />}
                    action={(() => {
                      const max = Math.max(...analytics.hourCounts, 1);
                      const peak = analytics.hourCounts.indexOf(max);
                      return max > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber/25 bg-amber/8 px-2 py-0.5 text-[10px] font-bold text-amber">
                          <IconSparkle size={11} /> {lang === "uz" ? "Eng gavjum" : lang === "ru" ? "Пик" : "Peak"}: {peak}:00
                        </span>
                      ) : null;
                    })()}
                  >
                    {lang === "uz" ? "Soat bo'yicha buyurtmalar" : lang === "ru" ? "Заказы по часам" : "Orders by hour"}
                  </AdminSectionLabel>
                  <div className="mt-4 flex h-[70px] items-end gap-[3px]">
                    {analytics.hourCounts.map((count, h) => {
                      const max = Math.max(...analytics.hourCounts, 1);
                      const hPx = Math.max(4, Math.round((count / max) * 62));
                      const isPeak = count > 0 && count === Math.max(...analytics.hourCounts);
                      return (
                        <div
                          key={h}
                          className={`flex-1 rounded-t-[5px] transition-all duration-500 ${
                            isPeak
                              ? "bg-gradient-to-t from-amber/80 to-amber"
                              : count > 0
                                ? "bg-gradient-to-t from-sky-400/30 to-sky-300/80"
                                : "bg-white/4"
                          }`}
                          style={{ height: `${hPx}px` }}
                          title={`${h}:00 — ${count}`}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-1.5 flex justify-between text-[9px] font-bold text-ink/40">
                    <span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
                  </div>
                </AdminCard>
              )}

              {/* Month-end forecast */}
              {allOrders.length > 0 && (
                <AdminCard tone="gold">
                  <AdminSectionLabel
                    icon={<IconSparkle size={13} />}
                    action={
                      <span className="rounded-full border border-amber/30 bg-amber/10 px-2.5 py-1 font-display text-[12px] font-bold text-amber">
                        {formatPrice(analytics.forecast, lang)}
                      </span>
                    }
                  >
                    {lang === "uz" ? "Oy yakuni prognozi" : lang === "ru" ? "Прогноз на конец месяца" : "Month-end forecast"}
                  </AdminSectionLabel>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-ink/60">
                      <span>{lang === "uz" ? "Hozircha" : lang === "ru" ? "Сейчас" : "Now"}: {formatPrice(analytics.monthRevenue, lang)}</span>
                      <span>{analytics.daysElapsed}/{analytics.daysInMonth}</span>
                    </div>
                    <AdminBar className="mt-2" pct={(analytics.monthRevenue / Math.max(1, analytics.forecast)) * 100} />
                  </div>
                </AdminCard>
              )}
            </div>
          )}

          {/* ─────────────── TAB 2: ORDER DISPATCH MANAGER ─────────────── */}
          {activeTab === "orders" && (
            <div className="space-y-3 animate-pop">
              {/* Search */}
              <AdminSearch
                value={orderSearch}
                onChange={setOrderSearch}
                placeholder={lang === "uz" ? "Qidirish: #id, ism, telefon yoki @username" : lang === "ru" ? "Поиск: #id, имя, телефон или @username" : "Search: #id, name, phone or @username"}
              />

              {/* Export filtered orders to CSV */}
              {filteredOrders.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      haptic("medium");
                      const date = new Date().toISOString().slice(0, 10);
                      const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
                      const rows = [
                        ["ID", "Sana", "Mijoz", "Telefon", "Hudud", "Summa", "To'lov", "Holat"].map(esc).join(";"),
                        ...filteredOrders.map((o) =>
                          [o.id, new Date(o.createdAt).toLocaleString(), o.recipientName, o.recipientPhone, o.deliveryZone || "", o.total, o.paymentMethod, o.status].map(esc).join(";"),
                        ),
                      ].join("\r\n");
                      const blob = new Blob(["\uFEFF" + rows], { type: "text/csv;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `DELIS_orders_${date}.csv`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 2000);
                      onToast(`⬇️ DELIS_orders_${date}.csv (${filteredOrders.length})`);
                    }}
                    className="press flex h-10 items-center justify-center gap-2 rounded-[14px] border border-moss/25 bg-sagetint/50 text-[12px] font-bold text-moss"
                  >
                    <IconDownload size={15} /> {lang === "uz" ? "CSV eksport" : lang === "ru" ? "Экспорт CSV" : "Export CSV"}
                  </button>

                  {/* PDF report */}
                  <button
                    onClick={() => {
                      haptic("medium");
                      const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                      const date = new Date().toISOString().slice(0, 10);
                      const rows = filteredOrders
                        .map(
                          (o) =>
                            `<tr><td>${esc(o.id)}</td><td>${esc(new Date(o.createdAt).toLocaleString())}</td><td>${esc(o.recipientName)}</td><td>${esc(o.recipientPhone)}</td><td class="r">${formatPrice(o.total, lang)}</td><td>${esc(o.status)}</td></tr>`,
                        )
                        .join("");
                      const html = `<!doctype html><html><head><meta charset="utf-8"><title>DELIS orders ${date}</title>
                        <style>
                          body{font-family:Arial,sans-serif;padding:24px;color:#0c1411}
                          h1{font-size:20px;color:#1f2937;margin:0}
                          .sub{color:#54685f;font-size:12px;margin:4px 0 16px}
                          table{width:100%;border-collapse:collapse;font-size:11px}
                          td{border:1px solid #e2e8e5;padding:6px 8px}
                          tr:first-child td{background:#eaf4ff;font-weight:bold}
                          .r{text-align:right}
                          .sum{font-weight:bold;background:#fdf3e0}
                        </style></head><body>
                        <h1>📦 DELIS — ${esc(lang === "uz" ? "Buyurtmalar" : lang === "ru" ? "Заказы" : "Orders")}</h1>
                        <p class="sub">${date} · ${filteredOrders.length} ${esc(lang === "uz" ? "ta" : lang === "ru" ? "шт" : "items")}</p>
                        <table><tr><td>ID</td><td>${esc(lang === "uz" ? "Sana" : lang === "ru" ? "Дата" : "Date")}</td><td>${esc(lang === "uz" ? "Mijoz" : lang === "ru" ? "Клиент" : "Client")}</td><td>Telefon</td><td class="r">${esc(lang === "uz" ? "Summa" : lang === "ru" ? "Сумма" : "Total")}</td><td>${esc(lang === "uz" ? "Holat" : lang === "ru" ? "Статус" : "Status")}</td></tr>${rows}
                        <tr class="sum"><td colspan="4">${esc(lang === "uz" ? "JAMI" : lang === "ru" ? "ИТОГО" : "TOTAL")}</td><td class="r">${formatPrice(filteredOrders.reduce((s, o) => s + o.total, 0), lang)}</td><td></td></tr></table>
                        <p style="margin-top:20px;color:#54685f;font-size:10px">DELIS · ${date}</p>
                        </body></html>`;
                      const win = window.open("", "_blank", "width=900,height=700");
                      if (win) {
                        win.document.write(html);
                        win.document.close();
                        setTimeout(() => win.print(), 400);
                      } else {
                        onToast(lang === "uz" ? "Brauzer qalqib chiquvchi oynani blokladi" : lang === "ru" ? "Браузер заблокировал всплывающее окно" : "Popup blocked");
                      }
                    }}
                    className="press flex h-10 items-center justify-center gap-2 rounded-[14px] border border-white/10 bg-card/80 text-[12px] font-bold text-ink2 hover:text-ink"
                  >
                    <IconSymbol symbol="🖨️" size={15} /> {lang === "uz" ? "PDF hisobot" : lang === "ru" ? "PDF-отчёт" : "PDF report"}
                  </button>
                </div>
              )}

              {/* Status filter chips with counts */}
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                {(["all", "new", "preparing", "shipped", "delivered", "canceled"] as const).map((f) => {
                  const count = f === "all" ? allOrders.length : allOrders.filter((o) => o.status === f).length;
                  const active = orderFilter === f;
                  return (
                    <AdminChip key={f} active={active} onClick={() => { haptic("light"); setOrderFilter(f); }} count={count}>
                      <IconSymbol symbol={f === "all" ? "📋" : f === "new" ? "🆕" : f === "preparing" ? "📦" : f === "shipped" ? "🚚" : f === "delivered" ? "✅" : "❌"} size={13} />
                      <span>{f === "all" ? (lang === "uz" ? "Hammasi" : lang === "ru" ? "Все" : "All") : f === "new" ? (lang === "uz" ? "Yangi" : lang === "ru" ? "Новые" : "New") : f === "preparing" ? (lang === "uz" ? "Zavodda" : lang === "ru" ? "На заводе" : "Preparing") : f === "shipped" ? (lang === "uz" ? "Kuryerda" : lang === "ru" ? "У курьера" : "Shipped") : f === "delivered" ? (lang === "uz" ? "Yetkazildi" : lang === "ru" ? "Доставлено" : "Delivered") : (lang === "uz" ? "Bekor" : lang === "ru" ? "Отменено" : "Canceled")}</span>
                    </AdminChip>
                  );
                })}
              </div>

              {filteredOrders.length === 0 && (
                <AdminEmpty
                  icon={<IconSymbol symbol="📭" size={27} />}
                  text={lang === "uz" ? "Hech narsa topilmadi." : lang === "ru" ? "Ничего не найдено." : "Nothing found."}
                />
              )}

              {filteredOrders.map((o) => (
                <div key={o.id} className="rounded-[22px] border border-white/8 bg-card/85 p-4 shadow-[0_20px_44px_-28px_rgba(0,0,0,0.9)] space-y-3">
                  <div className="flex items-center justify-between border-b border-white/6 pb-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-[14px] font-bold text-ink">#{o.id}</p>
                        <AdminStatusPill status={o.status} label={orderStatusLabel(o.status, lang)} />
                      </div>
                      <p className="mt-1 text-[12px] font-medium text-ink2">
                        {o.recipientName} · {o.recipientPhone}
                        {o.customerName && o.customerName !== o.recipientName && (
                          <span className="ml-1.5 font-bold text-pine">TG: {o.customerName}</span>
                        )}
                        {o.customerUsername && <span className="ml-1.5 text-moss">@{o.customerUsername}</span>}
                      </p>
                      {o.customerSource === "browser" || Number(o.customerTgId) < 0 ? (
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-moss"><IconSymbol symbol="🌐" size={12} /> {lang === "uz" ? "Brauzer buyurtmasi" : lang === "ru" ? "Заказ из браузера" : "Browser order"}</p>
                      ) : o.customerTgId ? (
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-ink/65"><IconSymbol symbol="🆔" size={12} /> Telegram ID: {o.customerTgId}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {o.recipientPhone && (
                        <a
                          href={`tel:${o.recipientPhone}`}
                          className="press flex h-8 items-center gap-1.5 rounded-full bg-sagetint px-3 text-[11px] font-bold text-pine"
                        >
                          <IconPhone size={14} /> {lang === "uz" ? "Qo'ng'iroq" : lang === "ru" ? "Позвонить" : "Call"}
                        </a>
                      )}
                      {o.deliveryAddress && (
                        <button
                          onClick={() => {
                            haptic("light");
                            try { void navigator.clipboard.writeText(o.deliveryAddress); } catch { /* ignore */ }
                            onToast(`📍 ${o.deliveryAddress}`);
                          }}
                          title={lang === "ru" ? "Скопировать адрес" : lang === "en" ? "Copy address" : "Manzilni nusxalash"}
                          className="press flex h-8 w-8 items-center justify-center rounded-full bg-paper2 text-ink2"
                        >
                          <IconCopy size={14} />
                        </button>
                      )}
                      {o.deliveryAddress && (
                        <a
                          href={`https://yandex.ru/maps/?text=${encodeURIComponent(o.deliveryAddress)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => haptic("medium")}
                          className="press flex h-8 items-center gap-1.5 rounded-full bg-[#FC3F1D]/10 px-2.5 text-[11px] font-bold text-[#E0301E]"
                        >
                          <IconSymbol symbol="🗺" size={13} /> {lang === "uz" ? "Xarita" : lang === "ru" ? "Карты" : "Maps"}
                        </a>
                      )}
                      <span className="font-display text-[15px] font-bold text-moss">
                        {formatPrice(o.total, lang)}
                      </span>
                    </div>
                  </div>

                  <p className="text-[12px] font-semibold text-ink2">
                    <span className="inline-flex items-start gap-1"><IconSymbol symbol="📍" size={13} className="mt-0.5 shrink-0" /> {o.deliveryAddress}</span>
                  </p>

                  <button
                    onClick={() => { haptic("light"); setExpandedOrder(expandedOrder === o.id ? null : o.id); }}
                    className="press flex h-9 w-full items-center justify-center gap-1 rounded-[14px] border border-white/8 bg-white/4 text-[12px] font-bold text-ink2 hover:border-white/15 hover:text-ink"
                  >
                    {expandedOrder === o.id ? "▲" : "▼"} {lang === "uz" ? "Batafsil" : lang === "ru" ? "Детали" : "Details"}
                  </button>

                  {/* Forward-only status flow — the API enforces the same graph. */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: "new", label: lang === "uz" ? "Yangi" : lang === "ru" ? "Новый" : "New", tint: "bg-gradient-to-r from-amber to-amberdeep text-[#17110a]" },
                        { id: "preparing", label: lang === "uz" ? "Zavodda" : lang === "ru" ? "Готовится" : "Preparing", tint: "bg-sky-400 text-[#04121f]" },
                        { id: "shipped", label: lang === "uz" ? "Kuryerda" : lang === "ru" ? "У курьера" : "Shipped", tint: "bg-violet-400 text-[#170b2b]" },
                        { id: "delivered", label: lang === "uz" ? "Yetkazildi" : lang === "ru" ? "Доставлен" : "Delivered", tint: "bg-moss text-[#052012]" },
                      ] as const
                    ).map((st) => {
                      const active = o.status === st.id;
                      const allowed = ADMIN_ORDER_TRANSITIONS[o.status]?.includes(st.id) ?? false;
                      const currentIndex = ADMIN_ORDER_FLOW.indexOf(o.status as Exclude<AdminOrderStatus, "canceled">);
                      const completed = currentIndex > ADMIN_ORDER_FLOW.indexOf(st.id);
                      return (
                        <button
                          key={st.id}
                          disabled={!allowed}
                          onClick={async () => {
                            if (!allowed) return;
                            haptic("medium");
                            if (isApiConfigured()) {
                              const res = await adminSetOrderStatus(o.id, st.id);
                              if (res?.ok) {
                                setServerOrders((prev) => prev ? prev.map((x) => (x.id === o.id ? { ...x, status: st.id } : x)) : prev);
                                const telegramCustomer = o.customerSource === "telegram" || Number(o.customerTgId) > 0;
                                onToast(telegramCustomer
                                  ? (lang === "uz" ? `#${o.id}: status yangilandi, mijozga xabar yuborildi` : lang === "ru" ? `#${o.id}: статус обновлён, клиент уведомлён` : `#${o.id}: status updated, customer notified`)
                                  : (lang === "uz" ? `#${o.id}: status yangilandi` : lang === "ru" ? `#${o.id}: статус обновлён` : `#${o.id}: status updated`));
                              } else {
                                onToast(lang === "uz" ? "Bu statusga o'tish mumkin emas" : lang === "ru" ? "Этот переход статуса запрещён" : "This status transition is not allowed");
                              }
                              return;
                            }
                            onUpdateOrderStatus(o.id, st.id);
                            onToast(`Order #${o.id}: ${st.label}`);
                          }}
                          className={`rounded-[14px] py-2 text-center text-[10px] font-bold uppercase transition-all ${
                            active
                              ? `${st.tint} shadow-[0_8px_18px_-8px_rgba(0,0,0,0.7)] ring-2 ring-white/10`
                              : completed
                                ? "border border-moss/25 bg-moss/8 text-moss"
                                : allowed
                                  ? "press border border-white/10 bg-card/70 text-ink/65 hover:border-moss/30 hover:bg-moss/5 hover:text-moss"
                                  : "cursor-not-allowed border border-white/5 bg-paper2/40 text-ink/25"
                          }`}
                        >
                          {completed ? <span className="inline-flex items-center gap-1"><IconCheck size={10} />{st.label}</span> : st.label}
                        </button>
                      );
                    })}
                  </div>
                  {o.status === "canceled" && (
                    <div className="rounded-[14px] border border-[#B3402E]/20 bg-[#B3402E]/[0.07] px-3 py-2 text-center text-[11px] font-bold text-[#B3402E]">
                      {lang === "uz" ? "Buyurtma bekor qilingan" : lang === "ru" ? "Заказ отменён" : "Order canceled"}
                    </div>
                  )}

                  {/* BTS Express Tracking input if regional */}
                  <div className="flex gap-2">
                    <input
                      value={btsCodeInputs[o.id] ?? ""}
                      onChange={(e) => setBtsCodeInputs((prev) => ({ ...prev, [o.id]: e.target.value }))}
                      placeholder={t("adminBtsTrackingCode") + " (BTS-XXXX)"}
                      className="flex-1 rounded-[14px] border border-ink/15 bg-paper px-3 py-2 text-[12px] font-semibold text-ink outline-none uppercase"
                    />
                    <button
                      onClick={() => {
                        const code = btsCodeInputs[o.id];
                        if (code) {
                          onUpdateOrderStatus(o.id, o.status, { btsCode: code });
                          onToast(`BTS code saved: ${code}`);
                        }
                      }}
                      className="press rounded-[14px] bg-amber px-3 py-2 text-[11px] font-bold text-white"
                    >
                      ✓
                    </button>
                    {o.recipientPhone && (
                      <a
                        href={`tel:${o.recipientPhone}`}
                        className="press flex h-9 w-9 items-center justify-center rounded-[14px] bg-sagetint text-pine"
                      >
                        <IconPhone size={16} />
                      </a>
                    )}
                  </div>

                  {/* Expandable details */}
                  {expandedOrder === o.id && (
                    <div className="animate-fadein space-y-2 border-t border-ink/18 pt-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink/65">{lang === "uz" ? "Buyurtma tarkibi" : lang === "ru" ? "Состав заказа" : "Order items"}</p>
                      <div className="space-y-1">
                        {o.items.map((it, i) => (
                          <div key={i} className="flex items-center justify-between rounded-[12px] bg-paper2 px-3 py-1.5 text-[12px]">
                            <span className="min-w-0 flex-1 truncate font-semibold text-ink/80">{it.name} <span className="text-ink/65">× {it.qty}</span></span>
                            <span className="ml-2 shrink-0 font-bold text-ink">{formatPrice(it.price * it.qty, lang)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-1 rounded-[14px] bg-paper2/60 px-3 py-2.5 text-[12px]">
                        <div className="flex justify-between text-ink/60"><span>{lang === "uz" ? "Summa" : lang === "ru" ? "Сумма" : "Subtotal"}</span><span>{formatPrice(o.subtotal, lang)}</span></div>
                        {o.discount > 0 && <div className="flex justify-between font-bold text-amberdeep"><span>{lang === "uz" ? "Chegirma" : lang === "ru" ? "Скидка" : "Discount"} {o.promoCode ? `(${o.promoCode})` : ""}</span><span>−{formatPrice(o.discount, lang)}</span></div>}
                        <div className="flex justify-between text-ink/60"><span>{lang === "uz" ? "Yetkazish" : lang === "ru" ? "Доставка" : "Delivery"}</span><span>{o.deliveryFee === 0 ? "0" : formatPrice(o.deliveryFee, lang)}</span></div>
                        <div className="flex justify-between border-t border-ink/18 pt-1.5 font-display text-[13px] font-bold text-ink"><span>Total</span><span>{formatPrice(o.total, lang)}</span></div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-moss/10 px-2.5 py-1 text-[10px] font-bold text-moss">{o.paymentMethod}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${o.paymentStatus === "paid" ? "bg-moss/15 text-pine" : o.paymentStatus === "pending" ? "bg-amber/15 text-amberdeep" : "bg-paper2 text-ink2"}`}>
                          {o.paymentStatus === "paid" ? <><IconSymbol symbol="💳" size={12} /> {lang === "uz" ? "To'langan" : lang === "ru" ? "Оплачено" : "Paid"}</> : o.paymentStatus === "pending" ? <><IconClock size={12} /> {lang === "uz" ? "Kutilmoqda" : lang === "ru" ? "Ожидает оплаты" : "Pending"}</> : "COD"}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${o.adminNotifiedAt ? "bg-[#229ED9]/12 text-[#1c88bd]" : "bg-amber/12 text-amberdeep"}`}>
                          <IconSend size={11} /> {o.adminNotifiedAt ? (lang === "uz" ? "Admin xabardor" : lang === "ru" ? "Админ уведомлён" : "Admin notified") : (lang === "uz" ? "TG navbatda" : lang === "ru" ? "TG ожидает" : "TG pending")}
                        </span>
                        {o.paymentStatus !== "paid" && o.status !== "canceled" && (
                          <button
                            onClick={async () => {
                              haptic("medium");
                              if (isApiConfigured()) {
                                const res = await adminSetPaymentStatus(o.id, "paid");
                                if (res?.ok) {
                                  setServerOrders((prev) => prev ? prev.map((x) => (x.id === o.id ? { ...x, paymentStatus: "paid" } : x)) : prev);
                                  onToast(lang === "uz" ? "To'lov tasdiqlandi ✓" : lang === "ru" ? "Оплата подтверждена ✓" : "Payment confirmed ✓");
                                  return;
                                }
                              }
                              onToast(lang === "uz" ? "API ulanganda ishlaydi" : lang === "ru" ? "Работает при подключённом API" : "Works when API is connected");
                            }}
                            className="press rounded-full bg-amber px-2.5 py-1 text-[10px] font-bold text-white"
                          >
                            {lang === "uz" ? "To'langan deb belgilash" : lang === "ru" ? "Отметить оплаченным" : "Mark paid"}
                          </button>
                        )}
                        {o.courierNote && <span className="inline-flex items-center gap-1 rounded-full bg-amber/12 px-2.5 py-1 text-[10px] font-bold text-amberdeep"><IconSymbol symbol="📝" size={12} /> {o.courierNote}</span>}
                        {o.courier?.name && <span className="inline-flex items-center gap-1 rounded-full bg-pine/10 px-2.5 py-1 text-[10px] font-bold text-pine"><IconSymbol symbol="👨‍🔧" size={12} /> {o.courier.name}</span>}
                      </div>
                      {ADMIN_ORDER_TRANSITIONS[o.status]?.includes("canceled") && (
                        <AdminBtn
                          variant="danger"
                          className="w-full"
                          icon={<IconClose size={14} />}
                          onClick={async () => {
                            const confirmed = window.confirm(lang === "uz" ? `#${o.id} buyurtmani bekor qilasizmi?` : lang === "ru" ? `Отменить заказ #${o.id}?` : `Cancel order #${o.id}?`);
                            if (!confirmed) return;
                            haptic("medium");
                            if (isApiConfigured()) {
                              const res = await adminSetOrderStatus(o.id, "canceled");
                              if (res?.ok) {
                                setServerOrders((prev) => prev ? prev.map((x) => (x.id === o.id ? { ...x, status: "canceled" } : x)) : prev);
                                onToast(lang === "uz" ? `#${o.id}: bekor qilindi, qoldiq tiklandi` : lang === "ru" ? `#${o.id}: заказ отменён, остаток восстановлен` : `#${o.id}: canceled and stock restored`);
                              } else {
                                onToast(lang === "uz" ? "Buyurtmani bekor qilib bo'lmadi" : lang === "ru" ? "Не удалось отменить заказ" : "Couldn't cancel the order");
                              }
                              return;
                            }
                            onUpdateOrderStatus(o.id, "canceled");
                          }}
                        >
                          {lang === "uz" ? "Buyurtmani bekor qilish" : lang === "ru" ? "Отменить заказ" : "Cancel order"}
                        </AdminBtn>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ─────────────── TAB 3: INVENTORY & PRICES EDITOR ─────────────── */}
          {activeTab === "inventory" && (
            <div className="space-y-3 animate-pop">
              <AdminCard tone="green" className="p-3.5">
                <p className="flex items-start gap-2 text-[12px] font-semibold text-moss">
                  <IconFactory size={16} className="mt-0.5 shrink-0" />
                  <span>
                    <b className="text-ink">{lang === "uz" ? "Namangan zavodi ombori" : lang === "ru" ? "Склад завода в Намангане" : "Namangan factory warehouse"}:</b>{" "}
                    {lang === "uz" ? "Barcha formulalar bo'yicha qoldiq va narxlar real vaqtda yangilanadi." : lang === "ru" ? "Остатки и цены по всем формулам обновляются в реальном времени." : "Stock and prices update in real time for every formula."}
                  </span>
                </p>
              </AdminCard>

              {/* Search */}
              <AdminSearch
                value={productSearch}
                onChange={setProductSearch}
                placeholder={lang === "uz" ? "Mahsulotni qidirish..." : lang === "ru" ? "Поиск товара по названию..." : "Search product by name..."}
              />

              {/* Bulk edit: select several products, change price & stock at once */}
              <div className="rounded-[18px] border border-amber/30 bg-amber/[0.06] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-extrabold text-ink">
                    {lang === "ru" ? "⚡ Массовое изменение" : lang === "en" ? "⚡ Bulk edit" : "⚡ Ommaviy tahrir"}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {selectedForBulk.size > 0 && (
                      <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-extrabold text-amberdeep">{selectedForBulk.size}</span>
                    )}
                    <button
                      onClick={() => {
                        haptic("light");
                        const filtered = products.filter((p) => p.name.toLowerCase().includes(productSearch.trim().toLowerCase()));
                        setSelectedForBulk((prev) => {
                          const all = filtered.map((p) => p.id);
                          const allSelected = all.length > 0 && all.every((id) => prev.has(id));
                          return allSelected ? new Set() : new Set(all);
                        });
                      }}
                      className="press rounded-full bg-paper px-2.5 py-1 text-[10px] font-bold text-ink2"
                    >
                      {lang === "ru" ? "Все/снять" : lang === "en" ? "All/clear" : "Barchasi/tozalash"}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-ink2">{lang === "ru" ? "Цена, сум" : lang === "en" ? "Price, UZS" : "Narx, so'm"}</label>
                    <input
                      type="number"
                      value={bulkPrice}
                      onChange={(e) => setBulkPrice(e.target.value)}
                      placeholder={lang === "ru" ? "новая цена" : lang === "en" ? "new price" : "yangi narx"}
                      className="mt-1 w-full rounded-[12px] border border-ink/15 bg-paper px-2.5 py-2 text-[13px] font-semibold text-ink outline-none focus:border-amber"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-ink2">{lang === "ru" ? "Остаток, шт" : lang === "en" ? "Stock, pcs" : "Qoldiq, dona"}</label>
                    <input
                      type="number"
                      value={bulkStock}
                      onChange={(e) => setBulkStock(e.target.value)}
                      placeholder={lang === "ru" ? "новый остаток" : lang === "en" ? "new stock" : "yangi qoldiq"}
                      className="mt-1 w-full rounded-[12px] border border-ink/15 bg-paper px-2.5 py-2 text-[13px] font-semibold text-ink outline-none focus:border-amber"
                    />
                  </div>
                </div>
                <button
                  onClick={applyBulkEdit}
                  disabled={selectedForBulk.size === 0}
                  className="press h-9 w-full rounded-[12px] bg-amber text-[12px] font-extrabold text-white disabled:opacity-40"
                >
                  {lang === "ru" ? `Применить к ${selectedForBulk.size} товар.` : lang === "en" ? `Apply to ${selectedForBulk.size} product(s)` : `${selectedForBulk.size} ta mahsulotga qo'llash`}
                </button>
              </div>

              {/* Bulk import from CSV */}
              {!showImport ? (
                <button
                  onClick={() => { haptic("light"); setShowImport(true); }}
                  className="press flex h-10 w-full items-center justify-center gap-2 rounded-[14px] border border-dashed border-moss/40 bg-sagetint/30 text-[12px] font-bold text-pine"
                >
                  <IconSymbol symbol="📥" size={14} /> {lang === "ru" ? "Импорт товаров (CSV)" : lang === "en" ? "Import products (CSV)" : "Import mahsulotlar (CSV)"}
                </button>
              ) : (
                <div className="space-y-2 rounded-[18px] border border-moss/25 bg-sagetint/30 p-3 animate-fadein">
                  <p className="text-[11px] font-bold text-pine">
                    {lang === "ru" ? "Каждая строка: Название;Цена;home|car;Объём;Остаток;Себестоимость;Фото" : lang === "en" ? "Each line: Name;Price;home|car;Volume;Stock;Cost;Photo" : "Har bir qator: Nomi;Narxi;home|car;Hajmi;Qoldiq;Sotib olish;Foto"}
                  </p>
                  <p className="text-[10px] font-semibold leading-relaxed text-pine/70">
                    {lang === "ru" ? "Фото (необязательно): images/xxx.jpg · имя файла (prod-wax.jpg) · https://… · data:image/…. Несколько фото — через «|» (первое = обложка)." : lang === "en" ? "Photo (optional): images/xxx.jpg · a filename (prod-wax.jpg) · https://… · data:image/…. Several photos — separated by «|» (first = cover)." : "Foto (ixtiyoriy): images/xxx.jpg · fayl nomi (prod-wax.jpg) · https://… · data:image/…. Bir nechta foto — «|» bilan (birinchisi = muqova)."}
                  </p>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={"Window Cleaner;55000;home;500 ml;24;40000;images/prod-glass.jpg\nCar Wax;128000;car;500 ml;12;90000;prod-wax.jpg|prod-wheel.jpg"}
                    rows={4}
                    className="w-full resize-none rounded-[12px] border border-ink/15 bg-paper px-3 py-2.5 font-mono text-[12px] font-semibold text-ink outline-none focus:border-moss"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowImport(false); setImportText(""); }}
                      className="press h-9 flex-1 rounded-[12px] bg-paper2 text-[12px] font-bold text-ink2"
                    >
                      {lang === "ru" ? "Отмена" : lang === "en" ? "Cancel" : "Bekor"}
                    </button>
                    <button
                      onClick={handleImportProducts}
                      className="press h-9 flex-1 rounded-[12px] bg-moss text-[12px] font-bold text-white"
                    >
                      {lang === "ru" ? "Импортировать" : lang === "en" ? "Import" : "Import"}
                    </button>
                  </div>
                </div>
              )}

              {products.filter((p) => p.name.toLowerCase().includes(productSearch.trim().toLowerCase())).map((p) => {
                const isEditing = editingProductId === p.id;
                return (
                  <div key={p.id} className="rounded-[22px] border border-ink/18 bg-card p-4 shadow-sm space-y-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleBulk(p.id)}
                        aria-label="select"
                        className={`press flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border text-white transition-colors ${
                          selectedForBulk.has(p.id) ? "border-amber bg-amber" : "border-ink/25 bg-paper"
                        }`}
                      >
                        {selectedForBulk.has(p.id) && <IconCheck size={14} />}
                      </button>
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[14px] bg-paper2">
                        <img src={p.img} alt={p.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-display text-[14px] font-bold text-ink">{p.name}</p>
                          <span className="flex items-center gap-1.5">
                            {p.badge && (
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${p.badge === "new" ? "bg-moss/15 text-moss" : "bg-amber/15 text-amberdeep"}`}>
                                {p.badge === "new" ? (lang === "ru" ? "NEW" : "YANGI") : "HIT"}
                              </span>
                            )}
                            <button
                              onClick={() => {
                                try { void navigator.clipboard.writeText(p.id); } catch {}
                                onToast(`📋 ID: ${p.id}`);
                              }}
                              className="press rounded-full bg-paper2 px-1.5 py-0.5 font-mono text-[9px] text-ink2 hover:text-ink"
                              title="Copy ID"
                            >
                              📋 {p.id}
                            </button>
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12px] font-semibold text-moss">
                          {formatPrice(p.price, lang)} · {p.volume}
                          {typeof p.costPrice === "number" && p.costPrice > 0 && (
                            <span className="ml-1.5 rounded-full bg-moss/10 px-1.5 py-0.5 text-[10px] font-bold text-pine">
                              {(lang === "ru" ? "маржа" : lang === "en" ? "margin" : "foyda")}: {formatPrice(p.price - p.costPrice, lang)}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] font-bold text-ink">
                          {t("stockWarehouse")}: <span className={p.stock && p.stock > 0 ? "text-pine" : "text-[#B3402E]"}>{p.stock || 0} {t("stockUnits")}</span>
                        </p>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="border-t border-ink/18 pt-3 space-y-2.5 animate-fadein">
                        {/* Name and Category */}
                        <div className="flex gap-2">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder={t("adminProductName" as any)}
                            className="flex-1 rounded-[12px] border border-ink/15 bg-paper px-2.5 py-1.5 text-[13px] font-semibold text-ink outline-none"
                          />
                          <select
                            value={editCat}
                            onChange={(e) => setEditCat(e.target.value as "home" | "car")}
                            className="rounded-[12px] border border-ink/15 bg-paper px-2.5 py-1.5 text-[12px] font-bold text-ink outline-none"
                          >
<option value="home">Home</option>
                          <option value="car">Car</option>
                          </select>
                        </div>

                        {/* Volume with presets */}
                        <div>
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] font-bold text-ink2 w-28">Hajmi / Объём:</label>
                            <input
                              value={editVolume}
                              onChange={(e) => setEditVolume(e.target.value)}
                              placeholder="500 ml"
                              className="flex-1 rounded-[12px] border border-ink/15 bg-paper px-2.5 py-1.5 text-[13px] font-semibold text-ink outline-none"
                            />
                          </div>
                          <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-ink/50 pl-28">{lang === "ru" ? "Доступные объёмы (выберите)" : lang === "en" ? "Available sizes (select)" : "Qaysi hajmlar bor (tanlang)"}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5 pl-28">
                            {["300 ml","500 ml","1 L","2 L","5 L","10 L","20 L"].map((v) => {
                              const on = editVolumes.includes(v);
                              return (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => { haptic("light"); setEditVolumes(on ? editVolumes.filter((x) => x !== v) : [...editVolumes, v]); }}
                                  className={`press rounded-full border px-2.5 py-1 text-[10px] font-bold transition-all ${
                                    on ? "border-moss bg-moss/10 text-moss" : "border-ink/15 text-ink2 hover:text-ink"
                                  }`}
                                >
                                  {on ? "✓ " : ""}{v}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Description */}
                        <div>
                          <textarea
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            placeholder={t("adminProductDesc" as any)}
                            rows={2}
                            className="w-full resize-none rounded-[12px] border border-ink/15 bg-paper px-2.5 py-1.5 text-[13px] font-semibold text-ink outline-none"
                          />
                          <button
                            onClick={async () => {
                              if (!editDesc.trim()) { onToast(lang === "ru" ? "Введите текст" : lang === "en" ? "Enter text" : "Matn kiriting"); return; }
                              haptic("medium");
                              import("./api").then(({ adminTranslate }) => {
                                adminTranslate({ text: editDesc, from: lang === "en" ? "en" : lang === "ru" ? "ru" : "uz", to: (["uz","ru","en"] as const).filter((l) => l !== (lang === "en" ? "en" : lang === "ru" ? "ru" : "uz")) }).then((res) => {
                                  if (!res) { onToast(lang === "ru" ? "Сервер недоступен" : lang === "en" ? "Server unavailable" : "Server yo'q"); return; }
                                  if (!res.hasKey) { onToast(lang === "ru" ? "⚠️ Укажите OPENAI_API_KEY на Render" : lang === "en" ? "⚠️ Set OPENAI_API_KEY on Render" : "⚠️ Render'da OPENAI_API_KEY qo'ying"); return; }
                                  onToast(lang === "ru" ? "✓ Переведено" : lang === "en" ? "✓ Translated" : "✓ Tarjima qilindi");
                                });
                              });
                            }}
                            className="press mt-1 flex h-8 w-full items-center justify-center gap-1.5 rounded-[10px] border border-moss/30 bg-moss/5 text-[11px] font-bold text-moss"
                          >
                            🤖 {lang === "ru" ? "Авто-перевод" : lang === "en" ? "Auto-translate" : "Avto-tarjima"}
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-[11px] font-bold text-ink2 w-28">{t("adminStockAdd")}:</label>
                          <input
                            type="number"
                            value={stockDelta}
                            onChange={(e) => setStockDelta(e.target.value)}
                            className="w-20 rounded-[12px] border border-ink/15 bg-paper px-2.5 py-1.5 text-center font-display text-[13px] font-bold text-ink"
                          />
                          <button
                            onClick={() => handleStockUpdate(p.id)}
                            className="press flex-1 rounded-[12px] bg-moss py-1.5 text-[12px] font-bold text-white"
                          >
                            + {t("adminStockAdd").split(" ")[0]}
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-[11px] font-bold text-ink2 w-28">{t("adminPriceUpdate")}:</label>
                          <input
                            type="number"
                            placeholder={String(p.price)}
                            value={newPrice}
                            onChange={(e) => setNewPrice(e.target.value)}
                            className="w-28 rounded-[12px] border border-ink/15 bg-paper px-2.5 py-1.5 text-center font-display text-[13px] font-bold text-ink"
                          />
                          <button
                            onClick={() => handlePriceUpdate(p.id)}
                            className="press flex-1 rounded-[12px] bg-amber py-1.5 text-[12px] font-bold text-white"
                          >
                            <IconCheck size={14} />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-[11px] font-bold text-ink2 w-28">{lang === "ru" ? "Себестоимость" : lang === "en" ? "Cost price" : "Sotib olish"}:</label>
                          <input
                            type="number"
                            placeholder={typeof p.costPrice === "number" ? String(p.costPrice) : "0"}
                            value={editCostPrice}
                            onChange={(e) => setEditCostPrice(e.target.value)}
                            className="w-28 rounded-[12px] border border-ink/15 bg-paper px-2.5 py-1.5 text-center font-display text-[13px] font-bold text-ink"
                          />
                          <span className="text-[11px] font-bold text-pine">
                            {(() => {
                              const cp = parseInt(editCostPrice) || 0;
                              const pr = parseInt(newPrice) || p.price;
                              return cp > 0 ? `${(lang === "ru" ? "маржа" : lang === "en" ? "margin" : "foyda")}: ${formatPrice(pr - cp, lang)}` : "";
                            })()}
                          </span>
                        </div>

                        <div className="flex gap-1.5">
                          {(["new", "best"] as const).map((b) => (
                            <button
                              key={b}
                              type="button"
                              onClick={() => { haptic("light"); setEditBadge(editBadge === b ? "" : b); }}
                              className={`press flex-1 rounded-[12px] border px-2 py-1.5 text-[11px] font-bold transition-all ${
                                editBadge === b ? "border-amber bg-amber/10 text-amberdeep" : "border-ink/15 text-ink2"
                              }`}
                            >
                              {editBadge === b ? "✓ " : ""}{b === "new" ? (lang === "ru" ? "НОВИНКА" : lang === "en" ? "NEW" : "YANGI") : (lang === "ru" ? "ХИТ" : lang === "en" ? "BEST" : "HIT")}
                            </button>
                          ))}
                        </div>

                        {/* Wholesale price preview per tier */}
                        <div className="rounded-[14px] bg-amber/[0.06] border border-amber/20 p-3">
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-amberdeep">
                            <IconFactory size={12} className="inline mr-1" />
                            {lang === "ru" ? "Оптовые цены" : lang === "en" ? "Wholesale prices" : "Opt narxlari"}
                          </p>
                          <div className="mt-1.5 space-y-1">
                            {(() => {
                              const retail = parseInt(newPrice) || p.price;
                              const tiers = [{minQty:6,pct:12},{minQty:12,pct:20},{minQty:24,pct:28},{minQty:48,pct:35}];
                              return tiers.map((t) => {
                                const unit = Math.round(retail * (100 - t.pct) / 100 / 10) * 10;
                                const save = retail - unit;
                                return (
                                  <div key={t.minQty} className="flex items-center justify-between text-[11px]">
                                    <span className="font-semibold text-ink/70">{t.minQty}+ dona</span>
                                    <span className="font-bold text-ink">{formatPrice(unit, lang)}</span>
                                    <span className="text-[10px] text-moss">−{t.pct}% ({formatPrice(save, lang)})</span>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>

                        {/* Save all changes button */}
                        <button
                          onClick={() => {
                            void (async () => {
                              haptic("medium");
                              const outcome = await onUpdateProduct(p.id, {
                                name: editName,
                                cat: editCat,
                                volume: editVolume,
                                volumes: editVolumes.length > 0 ? editVolumes.map((l) => ({ label: l, liters: parseFloat(l) * (l.includes("ml") ? 0.001 : 1) })) : undefined,
                                costPrice: editCostPrice ? parseInt(editCostPrice) : undefined,
                                badge: editBadge || undefined,
                                img: editGallery[0] || p.img,
                                gallery: editGallery.length ? editGallery : undefined,
                                desc: { uz: editDesc, ru: editDesc, en: editDesc } as any,
                              });
                              if (!outcome.ok) {
                                haptic("error");
                                onToast(lang === "ru" ? "Не удалось сохранить изменения на сервере" : lang === "en" ? "Could not save changes on the server" : "O'zgarishlarni serverda saqlab bo'lmadi");
                                return;
                              }
                              haptic("success");
                              onToast("✓ " + editName + " yangilandi!");
                              setEditingProductId(null);
                            })();
                          }}
                          className="press flex h-10 w-full items-center justify-center gap-2 rounded-[14px] bg-moss text-[13px] font-bold text-white"
                        >
                          <IconCheck size={15} />
                          <span>Saqlash / Сохранить</span>
                        </button>

                        <div>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink/50">
                            {lang === "ru" ? "Фото (первое = обложка)" : lang === "en" ? "Photos (first = cover)" : "Fotolar (birinchisi = muqova)"}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {editGallery.map((src, i) => (
                              <div key={`${i}-${src.slice(-12)}`} className="relative">
                                <img src={src} alt="" className="h-16 w-16 rounded-[12px] border border-ink/15 object-cover" />
                                {editGallery.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => { haptic("light"); setEditGallery(editGallery.filter((_, idx) => idx !== i)); }}
                                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#B3402E] text-white"
                                  >
                                    <IconClose size={11} />
                                  </button>
                                )}
                                {i === 0 && (
                                  <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 text-[8px] font-bold text-white">
                                    {lang === "ru" ? "Обложка" : lang === "en" ? "Cover" : "Muqova"}
                                  </span>
                                )}
                              </div>
                            ))}
                            <label className={`flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[12px] border border-dashed border-moss/40 bg-sagetint/40 text-pine ${uploadingPhotoId === p.id ? "opacity-60 pointer-events-none" : ""}`}>
                              {uploadingPhotoId === p.id ? <IconClock size={16} /> : <IconPlus size={16} />}
                              <span className="text-[9px] font-bold">{uploadingPhotoId === p.id ? "…" : lang === "ru" ? "Фото" : "Foto"}</span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                disabled={uploadingPhotoId === p.id}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  handleEditAddPhoto(p.id, file);
                                  e.target.value = ""; // re-picking the same file must re-trigger
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => { haptic("light"); onMoveProduct?.(p.id, -1); }}
                            disabled={!onMoveProduct}
                            className="press flex h-[17px] w-8 items-center justify-center rounded-[8px] bg-paper2 text-[9px] font-bold text-ink2 hover:text-pine disabled:opacity-40"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => { haptic("light"); onMoveProduct?.(p.id, 1); }}
                            disabled={!onMoveProduct}
                            className="press flex h-[17px] w-8 items-center justify-center rounded-[8px] bg-paper2 text-[9px] font-bold text-ink2 hover:text-pine disabled:opacity-40"
                          >
                            ▼
                          </button>
                        </div>
                        <button
                          onClick={() => {
                            haptic("light");
                            setEditingProductId(p.id);
                            setNewPrice(String(p.price));
                            setEditName(p.name);
                            setEditDesc(p.desc[lang] || "");
                            setEditVolume(p.volume);
                            setEditVolumes(p.volumes ? p.volumes.map((v) => v.label) : []);
                            setEditCostPrice(typeof p.costPrice === "number" && p.costPrice > 0 ? String(p.costPrice) : "");
                            setEditBadge(p.badge || "");
                            setEditCat(p.cat);
                            setEditGallery(p.gallery && p.gallery.length ? [...p.gallery] : [p.img]);
                          }}
                        className="press flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-paper2 text-[12px] font-bold text-ink2 hover:text-ink"
                      >
                        <IconSettings size={14} />
                        <span>{t("addressEdit")}</span>
                      </button>
                        {confirmDeleteId === p.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={handleDeleteProduct.bind(null, p.id)}
                              className="press flex h-9 w-20 items-center justify-center gap-1 rounded-[14px] bg-[#B3402E] text-[11px] font-bold text-white shadow-sm animate-fadein"
                            >
                              <IconTrash size={12} /> Ha
                            </button>
                            <button
                              onClick={cancelDelete}
                              className="press flex h-9 w-14 items-center justify-center rounded-[14px] bg-paper2 text-[11px] font-bold text-ink2"
                            >
                              Yo'q
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { handleDeleteProduct(p.id); }}
                            className="press flex h-9 w-10 items-center justify-center rounded-[14px] bg-[#B3402E]/10 text-[#B3402E] hover:bg-[#B3402E]/20"
                            aria-label={t("promoDelete")}
                          >
                            <IconTrash size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ─────────────── TAB 4: RETURNS & WAITLIST REQUESTS ─────────────── */}
          {activeTab === "jobs" && (
            <JobsAdminTab
              apps={jobApps}
              onChange={(next) => { setJobApps(next); saveJobApps(next); }}
              onToast={onToast}
            />
          )}

          {activeTab === "requests" && (
            <div className="space-y-4 animate-pop">
              {/* Waitlist Section */}
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink2">
                  <span className="inline-flex items-center gap-1.5"><IconClock size={14} /> {t("waitlistTitle")} ({waitlist.length})</span>
                </p>
                <div className="mt-2 space-y-2">
                  {waitlist.length === 0 ? (
                    <p className="text-[12px] text-ink2 italic">Hozircha kutish ro'yxatida arizalar yo'q.</p>
                  ) : (
                    waitlist.map((wl) => (
                      <div key={wl.id} className="flex items-center justify-between rounded-[20px] border border-ink/18 bg-card p-3.5 shadow-sm">
                        <div>
                          <p className="font-display text-[13px] font-bold text-ink">{wl.productName}</p>
                          <p className="text-[12px] font-medium text-ink2">
                            {wl.phone} · {wl.requestedQty} {t("stockUnits")}
                          </p>
                          {wl.tgUsername && <p className="text-[11px] text-moss">@{wl.tgUsername}</p>}
                        </div>
                        <button
                          onClick={() => {
                            haptic("success");
                            onNotifyWaitlist(wl.id);
                            onToast(`Xabarnoma yuborildi: ${wl.phone}`);
                          }}
                          className={`press rounded-[14px] px-3.5 py-2 text-[11px] font-bold ${
                            wl.notified ? "bg-moss/15 text-moss" : "bg-amber text-white"
                          }`}
                        >
                          <span className="inline-flex items-center gap-1">{wl.notified && <IconCheck size={12} />} {wl.notified ? "Xabar berildi" : "Xabar yuborish"}</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Customer Returns Section */}
              <div className="border-t border-ink/18 pt-3">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink2">
                  <span className="inline-flex items-center gap-1.5"><IconRefresh size={14} /> {t("returnsTitle")} ({returns.length})</span>
                </p>
                <div className="mt-2 space-y-2">
                  {returns.length === 0 ? (
                    <p className="text-[12px] text-ink2 italic">Qaytarish arizalari mavjud emas.</p>
                  ) : (
                    returns.map((ret) => (
                      <div key={ret.id} className="rounded-[20px] border border-ink/18 bg-card p-3.5 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-display text-[13px] font-bold text-ink">#{ret.id} · {ret.itemName}</p>
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                            ret.status === "approved" ? "bg-moss/12 text-moss" : ret.status === "rejected" ? "bg-[#B3402E]/10 text-[#B3402E]" : "bg-amber/15 text-amberdeep"
                          }`}>
                            {ret.status}
                          </span>
                        </div>
                        <p className="text-[12px] text-ink2">Buyurtma #{ret.orderId} · {ret.reason}</p>
                        {ret.note && <p className="text-[11px] italic text-ink2">“{ret.note}”</p>}

                        {ret.status === "pending" && (
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => {
                                onUpdateReturnStatus(ret.id, "approved");
                                onToast(`Return #${ret.id} approved`);
                              }}
                              className="press flex-1 rounded-[12px] bg-moss py-1.5 text-[12px] font-bold text-white"
                            >
                              <span className="inline-flex items-center gap-1"><IconCheck size={12} /> Qabul qilish</span>
                            </button>
                            <button
                              onClick={() => {
                                onUpdateReturnStatus(ret.id, "rejected");
                                onToast(`Return #${ret.id} rejected`);
                              }}
                              className="press flex-1 rounded-[12px] bg-[#B3402E]/10 py-1.5 text-[12px] font-bold text-[#B3402E]"
                            >
                              <span className="inline-flex items-center gap-1"><IconClose size={12} /> Rad etish</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─────────────── TAB 5: PROMO CODE EDITOR ─────────────── */}
          {activeTab === "promos" && (
            <PromoEditor
              products={products}
              onToast={onToast}
            />
          )}

          {/* ─────────────── MANAGED HOME CONTENT ─────────────── */}
          {activeTab === "content" && (
            <ContentManagementTab onToast={onToast} />
          )}
          {activeTab === "payments" && <PaymentsAdminTab onToast={onToast} />}

          {activeTab === "site" && (
            <SiteSettingsTab onToast={onToast} />
          )}

          {/* ─────────────── LOYALTY CONTROL / QR MEMBER CARD ─────────────── */}
          {activeTab === "loyalty" && <LoyaltyAdminTab onToast={onToast} />}

          {/* ─────────────── QR BATCHES (shtrikh-kod registry) ─────────────── */}
          {activeTab === "qr" && <QrBatchesAdminTab onToast={onToast} />}

          {/* ─────────────── B2B wholesale ladder + access codes ─────────────── */}
          {activeTab === "b2b" && <B2bAdminTab onToast={onToast} />}

          {/* ─────────────── GIFT CERTIFICATES ─────────────── */}
          {activeTab === "certs" && <CertsAdminTab onToast={onToast} />}

          {/* ─────────────── DELIVERY TARIFFS ─────────────── */}
          {activeTab === "delivery" && <DeliveryAdminTab onToast={onToast} />}

          {/* ─────────────── TAB 6: OPERATION LOGS ─────────────── */}
          {activeTab === "logs" && (
            <div className="space-y-2.5 animate-pop">
              <p className="text-[12px] font-medium text-ink2">
                Barcha admin operatsiyalari: status o'zgarishlar, ombor va narx yangilanishlari, to'lovlar va bildirishnomalar.
              </p>
              {(() => {
                try {
                  const raw = localStorage.getItem("delis_op_logs");
                  const logs = raw ? JSON.parse(raw) : [];
                  if (logs.length === 0) {
                    return <p className="text-[12px] italic text-ink2">{t("opLogsEmpty")}</p>;
                  }
                  return (
                    <div className="space-y-2">
                      {logs.slice(0, 30).map((log: { id: string; action: string; detail: string; operator: string; time: number }) => (
                        <div key={log.id} className="rounded-[16px] border border-ink/18 bg-card p-3 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-display text-[13px] font-bold text-ink">{log.action}</span>
                            <span className="font-mono text-[10px] text-ink2">
                              {new Date(log.time).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[12px] font-medium text-ink2">{log.detail}</p>
                          <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-moss"><IconUser size={12} /> {log.operator}</p>
                        </div>
                      ))}
                    </div>
                  );
                } catch {
                  return <p className="text-[12px] italic text-ink2">{t("opLogsEmpty")}</p>;
                }
              })()}
            </div>
          )}

          {/* ─────────────── TAB 7: STORIES MODERATION ─────────────── */}
          {activeTab === "stories" && (
            <StoriesCombinedTab onToast={onToast} />
          )}

          {/* ─────────────── TAB 8: CLIENTS DATABASE ─────────────── */}
          {activeTab === "clients" && (
            <ClientsAdminTab orders={allOrders} onToast={onToast} />
          )}

          {/* ─────────────── TAB 10: BACKUP & RESET ─────────────── */}
          {activeTab === "backup" && (
            <BackupAdminTab onToast={onToast} />
          )}

          {/* ─────────────── TAB 12: DAILY DEAL CONTROL ─────────────── */}
          {activeTab === "deal" && (
            <DailyDealAdminTab onToast={onToast} />
          )}

          {/* Logout */}
          <button
            onClick={() => {
              haptic("light");
              setIsAuthenticated(false);
              setPinInput("");
              setActiveTab("analytics");
              onClose();
            }}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-[#B3402E]/20 bg-[#B3402E]/5 text-[13px] font-bold text-[#B3402E] hover:bg-[#B3402E]/10"
          >
            ↑ {t("b2bExit")} / Boshqaruvdan chiqish
          </button>
        </div>
      )}
    </Sheet>
  );
}

/* Floating push notification launcher handle */
export function Launcher({ onOpenPush }: { onOpenPush: () => void }) {
  const { lang } = useI18n();
  return (
    <button
      onClick={() => {
        haptic("medium");
        onOpenPush();
      }}
      className="press fixed bottom-[calc(env(safe-area-inset-bottom,0px)+92px)] right-2 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-amber text-[22px] shadow-nav backdrop-blur-md transition-transform hover:scale-110"
      aria-label={lang === "uz" ? "Push yuborish" : "Push рассылка"}
    >
      <IconSymbol symbol="📢" size={22} />
    </button>
  );
}

/* ============================================================
   STORIES ADMIN — moderation queue (pending / approved / rejected)
   ============================================================ */

function StoriesCombinedTab({ onToast }: { onToast: (msg: string) => void }) {
  const { lang } = useI18n();
  const [view, setView] = useState<"admin" | "customer">("admin");
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  return (
    <div className="space-y-3 animate-pop">
      <div className="flex gap-1.5 rounded-[18px] bg-paper2 p-1.5">
        <button
          onClick={() => { haptic("light"); setView("admin"); }}
          className={`press flex-1 rounded-[14px] px-3 py-2 text-[12px] font-bold transition-all ${view === "admin" ? "bg-amber text-white shadow-sm" : "text-ink2"}`}
        >
          🎬 {L("DELIS storylari", "Истории DELIS", "DELIS stories")}
        </button>
        <button
          onClick={() => { haptic("light"); setView("customer"); }}
          className={`press flex-1 rounded-[14px] px-3 py-2 text-[12px] font-bold transition-all ${view === "customer" ? "bg-amber text-white shadow-sm" : "text-ink2"}`}
        >
          👥 {L("Mijoz storylari", "Истории клиентов", "Customer stories")}
        </button>
      </div>
      {view === "admin" ? <AdminStoriesPanel onToast={onToast} /> : <StoriesAdminTab onToast={onToast} />}
    </div>
  );
}

function StoriesAdminTab({ onToast }: { onToast: (msg: string) => void }) {
  const { lang } = useI18n();
  const [stories, setStories] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem("delis_custom_stories");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const refresh = () => {
    void fetchAdminStories().then((rows) => {
      if (!rows) return;
      const remote = rows.map((row: ApiStory) => ({
        id: row.id,
        title: { uz: row.title, ru: row.title, en: row.title },
        desc: { uz: row.description, ru: row.description, en: row.description },
        image: row.media,
        mediaKind: row.media_kind,
        emoji: row.media_kind === "video" ? "🎬" : "📸",
        author: { name: row.first_name || "Customer", nickname: row.username, tgId: row.tg_id, phone: row.phone, role: row.role },
        createdAt: Date.parse(row.created_at) || Date.now(),
        status: row.status,
        remote: true,
      }));
      setStories(remote);
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  const deleteStory = (id: string) => {
    const next = stories.filter((s: any) => s.id !== id);
    setStories(next);
    try {
      localStorage.setItem("delis_custom_stories", JSON.stringify(next));
    } catch {}
    haptic("medium");
    onToast("Story o'chirildi");
    void adminDeleteStory(id);
  };

  const setStatus = (id: string, status: "approved" | "rejected") => {
    setStories((prev) => prev.map((story) => story.id === id ? { ...story, status } : story));
    void adminSetStoryStatus(id, status);
    haptic("success");
    onToast(status === "approved" ? "Story tasdiqlandi ✓" : "Story rad etildi");
  };

  const filtered = stories.filter((s) =>
    filterStatus === "all" || s.status === filterStatus
  );

  if (filtered.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-[13px] font-medium text-ink2">
          {filterStatus === "all"
            ? "Hozircha mijozlar tomonidan qo'shilgan storylar yo'q."
            : `Bu statusda storylar yo'q (${filterStatus}).`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex gap-1.5 no-scrollbar overflow-x-auto rounded-[16px] bg-paper2 p-1">
        {(["all", "pending", "approved", "rejected"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(s)}
            className={`press flex-1 shrink-0 rounded-[12px] px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-all ${
              filterStatus === s
                ? "bg-card text-ink shadow-sm"
                : "bg-paper2 text-ink2"
            }`}
          >
            {s === "all" ? "Hammasi" : s === "pending" ? "Kutilmoqda" : s === "approved" ? "Tasdiqlandi" : "Rad etildi"}
          </button>
        ))}
      </div>

      {filtered.map((story: any) => (
        <div key={story.id} className="rounded-[20px] border border-ink/18 bg-card p-3.5">
          <div className="flex gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[14px] bg-paper2">
              {story.image ? <img src={story.image} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-pine"><IconSymbol symbol={story.emoji || "📸"} size={22} /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[13px] font-bold text-ink truncate">{story.title?.[lang] || story.title?.uz || "Story"}</p>
              <p className="flex items-center gap-1 text-[11px] text-ink2"><IconUser size={12} /> {story.author?.name || "Noma'lum"} {story.author?.nickname ? `@${story.author.nickname}` : ""}</p>
              <p className="flex flex-wrap items-center gap-1 text-[11px] text-ink2"><IconSymbol symbol="🆔" size={11} /> {story.author?.tgId || "—"} · <IconPhone size={11} /> {story.author?.phone || "yo'q"} · <IconClock size={11} /> {new Date(story.createdAt).toLocaleString(lang === "en" ? "en-GB" : "ru-RU")}</p>
              <p className="mt-1 text-[11px] text-ink/70 line-clamp-2">{story.desc?.[lang] || ""}</p>
              {story.status && (
                <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${story.status === "approved" ? "bg-moss/10 text-moss" : story.status === "rejected" ? "bg-[#B3402E]/10 text-[#B3402E]" : "bg-amber/15 text-amberdeep"}`}>
                  {story.status}
                </span>
              )}
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            {story.status === "pending" && (
              <>
                <button onClick={() => setStatus(story.id, "approved")} className="press flex h-8 flex-1 items-center justify-center rounded-[12px] bg-moss/10 text-[11px] font-bold text-moss">Tasdiqlash</button>
                <button onClick={() => setStatus(story.id, "rejected")} className="press flex h-8 flex-1 items-center justify-center rounded-[12px] bg-amber/10 text-[11px] font-bold text-amberdeep">Rad etish</button>
              </>
            )}
            <button onClick={() => deleteStory(story.id)} className="press flex h-8 flex-1 items-center justify-center rounded-[12px] bg-[#B3402E]/10 text-[11px] font-bold text-[#B3402E]">
              O'chirish
            </button>
            {story.author?.phone && (
              <a href={`tel:${story.author.phone}`} className="press flex h-8 flex-1 items-center justify-center rounded-[12px] bg-sagetint text-[11px] font-bold text-pine">
                Qo'ng'iroq
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   ADMIN-OWNED STORIES — the owner manages these directly.
   Customers see them in the stories bar at the top of the home screen.
   ============================================================ */

function AdminStoriesPanel({ onToast }: { onToast: (msg: string) => void }) {
  const { lang } = useI18n();
  const [list, setList] = useState<AdminStory[]>(() => loadAdminStories());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Partial<AdminStory>>({});
  const [mediaUploading, setMediaUploading] = useState(false);

  const persist = (next: AdminStory[]) => { setList(next); saveAdminStories(next); };

  const blankStory = (): Partial<AdminStory> => ({
    title: { uz: "Yangi story", ru: "Новая история", en: "New story" },
    desc: { uz: "", ru: "", en: "" },
    emoji: "✨",
    gradient: "linear-gradient(135deg, #3f6b52, #e0a63c)",
    author: { name: "DELIS", role: "admin", nickname: "delis_official" },
    createdAt: Date.now(),
  });

  const startCreate = () => { setDraft(blankStory()); setCreating(true); setEditingId(null); };
  const startEdit = (id: string) => {
    const s = list.find((x) => x.id === id);
    if (!s) return;
    setDraft({ ...s, title: { ...s.title }, desc: { ...s.desc } });
    setEditingId(id); setCreating(false);
  };

  const cancel = () => { setEditingId(null); setCreating(false); setDraft({}); };

  const saveDraft = () => {
    if (!draft.title?.uz && !draft.title?.ru && !draft.title?.en) {
      onToast(lang === "ru" ? "Введите заголовок" : lang === "en" ? "Enter title" : "Sarlavha kiriting");
      return;
    }
    const completed: AdminStory = {
      id: editingId || `admin-story-${Date.now()}`,
      title: {
        uz: draft.title?.uz?.trim() || draft.title?.ru || draft.title?.en || "",
        ru: draft.title?.ru?.trim() || draft.title?.uz || draft.title?.en || "",
        en: draft.title?.en?.trim() || draft.title?.ru || draft.title?.uz || "",
      },
      desc: {
        uz: draft.desc?.uz?.trim() || draft.desc?.ru || draft.desc?.en || "",
        ru: draft.desc?.ru?.trim() || draft.desc?.uz || draft.desc?.en || "",
        en: draft.desc?.en?.trim() || draft.desc?.ru || draft.desc?.uz || "",
      },
      image: draft.image || undefined,
      mediaKind: draft.mediaKind,
      emoji: draft.emoji || "✨",
      gradient: draft.gradient || "linear-gradient(135deg, #3f6b52, #e0a63c)",
      productId: draft.productId || undefined,
      promoCode: draft.promoCode || undefined,
      author: draft.author || { name: "DELIS", role: "admin", nickname: "delis_official" },
      createdAt: editingId ? (list.find((x) => x.id === editingId)?.createdAt ?? Date.now()) : Date.now(),
    };
    if (creating) persist([completed, ...list]);
    else persist(list.map((s) => (s.id === editingId ? completed : s)));
    haptic("success");
    onToast(creating ? (lang === "ru" ? "✓ История создана" : lang === "en" ? "✓ Story created" : "✓ Story qo'shildi") : (lang === "ru" ? "✓ Сохранено" : lang === "en" ? "✓ Saved" : "✓ Saqlandi"));
    cancel();
  };

  const removeStory = (id: string) => {
    if (!window.confirm(lang === "ru" ? "Удалить эту историю?" : lang === "en" ? "Delete this story?" : "Bu story o'chirilsinmi?")) return;
    haptic("medium");
    persist(list.filter((s) => s.id !== id));
    onToast(lang === "ru" ? "🗑️ История удалена" : lang === "en" ? "🗑️ Story deleted" : "🗑️ Story o'chirildi");
  };

  const bumpFreshness = (id: string) => {
    haptic("success");
    persist(list.map((s) => (s.id === id ? { ...s, createdAt: Date.now() } : s)));
    onToast(lang === "ru" ? "✓ Поднято в начало (24ч)" : lang === "en" ? "✓ Bumped to top (24h)" : "✓ Yuqoriga ko'tarildi (24 soat)");
  };

  const lbl = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  const GRADIENTS = [
    "linear-gradient(135deg, #0a2a1b, #16402e)",
    "linear-gradient(135deg, #1a3a2a, #2d5a3f)",
    "linear-gradient(135deg, #1a1f1b, #2d3a2a)",
    "linear-gradient(135deg, #8a5a1a, #e0a63c)",
    "linear-gradient(135deg, #3f6b52, #e0a63c)",
    "linear-gradient(135deg, #101d3d, #1f6fff)",
    "linear-gradient(135deg, #5a1f8a, #e0a63c)",
    "linear-gradient(135deg, #8a1f3a, #e06b3c)",
  ];
  const EMOJIS = ["🏭", "🏠", "✨", "🎁", "🚗", "💧", "🧴", "🌿", "🔥", "💎", "📦", "🌟"];

  return (
    <div className="space-y-3 animate-pop">
      {!creating && editingId === null && (
        <button
          onClick={startCreate}
          className="press flex h-11 w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-moss/40 bg-sagetint/40 text-[13px] font-bold text-pine"
        >
          <IconPlus size={14} /> {lbl("Yangi story yaratish", "Создать историю", "Create story")}
        </button>
      )}

      {(creating || editingId) && (
        <div className="space-y-3 rounded-[22px] border border-moss/25 bg-card p-4 shadow-sm">
          <p className="font-display text-[14px] font-bold text-ink">
            {creating ? lbl("Yangi story", "Новая история", "New story") : lbl("Tahrirlash", "Редактирование", "Edit")}
          </p>

          {/* Preview */}
          <div className="flex items-center gap-3 rounded-[16px] bg-paper2 p-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[14px]" style={{ background: draft.gradient || "#3f6b52" }}>
              {draft.image ? <img src={draft.image} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[26px]">{draft.emoji || "✨"}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[14px] font-bold text-ink">{draft.title?.[lang] || draft.title?.uz || lbl("Sarlavha", "Заголовок", "Title")}</p>
              <p className="truncate text-[11px] font-medium text-ink/70">{draft.desc?.[lang] || draft.desc?.uz || ""}</p>
              <p className="mt-0.5 text-[10px] font-bold text-moss">
                {draft.productId ? `🎯 ${PRODUCT_CATALOG.find((p) => p.id === draft.productId)?.name || draft.productId}` : ""}
                {draft.promoCode ? ` · 🎁 ${draft.promoCode}` : ""}
              </p>
            </div>
          </div>

          {/* Title UZ/RU/EN */}
          <div className="grid grid-cols-3 gap-1.5">
            {(["uz", "ru", "en"] as const).map((lng) => (
              <input
                key={lng}
                value={draft.title?.[lng] || ""}
                onChange={(e) => setDraft((d) => ({ ...d, title: { ...(d.title || { uz: "", ru: "", en: "" }), [lng]: e.target.value } }))}
                placeholder={`Sarlavha (${lng.toUpperCase()})`}
                className="rounded-[12px] border border-ink/15 bg-paper px-2.5 py-2 text-[12px] font-semibold text-ink outline-none focus:border-moss"
              />
            ))}
          </div>

          {/* Desc UZ/RU/EN */}
          <div className="grid grid-cols-3 gap-1.5">
            {(["uz", "ru", "en"] as const).map((lng) => (
              <textarea
                key={lng}
                value={draft.desc?.[lng] || ""}
                onChange={(e) => setDraft((d) => ({ ...d, desc: { ...(d.desc || { uz: "", ru: "", en: "" }), [lng]: e.target.value } }))}
                placeholder={`Tavsif (${lng.toUpperCase()})`}
                rows={2}
                className="rounded-[12px] border border-ink/15 bg-paper px-2.5 py-1.5 text-[11px] font-semibold text-ink outline-none focus:border-moss"
              />
            ))}
          </div>

          {/* Image / Video */}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink2">{lbl("Rasm yoki video", "Фото или видео", "Image or video")}</label>
            <div className="mb-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => { haptic("light"); setDraft((d) => ({ ...d, mediaKind: "image" })); }}
                className={`press flex-1 rounded-[10px] border px-2 py-1.5 text-[11px] font-bold ${draft.mediaKind !== "video" ? "border-amber bg-amber/10 text-amberdeep" : "border-ink/15 text-ink2"}`}
              >
                📸 {lbl("Foto", "Фото", "Photo")}
              </button>
              <button
                type="button"
                onClick={() => { haptic("light"); setDraft((d) => ({ ...d, mediaKind: "video" })); }}
                className={`press flex-1 rounded-[10px] border px-2 py-1.5 text-[11px] font-bold ${draft.mediaKind === "video" ? "border-amber bg-amber/10 text-amberdeep" : "border-ink/15 text-ink2"}`}
              >
                🎬 {lbl("Video", "Видео", "Video")}
              </button>
            </div>
            <input
              value={draft.image || ""}
              onChange={(e) => setDraft((d) => ({ ...d, image: e.target.value }))}
              placeholder="https://... yoki images/factory.jpg"
              className="w-full rounded-[12px] border border-ink/15 bg-paper px-3 py-2 text-[12px] font-semibold text-ink outline-none focus:border-moss"
            />
            <label className={`mt-1.5 flex cursor-pointer items-center justify-center rounded-[12px] border border-dashed border-moss/40 bg-sagetint/40 px-3 py-2 text-[12px] font-bold text-pine ${mediaUploading ? "opacity-60 pointer-events-none" : ""}`}>
              <span>{mediaUploading ? "⏳ " : (draft.mediaKind === "video" ? "🎬 " : "📷 ")}{mediaUploading ? lbl("Yuklanmoqda…", "Загрузка…", "Uploading…") : lbl("Fayldan yuklash", "Загрузить файл", "Upload file")}</span>
              <input
                type="file"
                accept={draft.mediaKind === "video" ? "video/*" : "image/*"}
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const isVideo = draft.mediaKind === "video";
                  const maxBytes = isVideo ? 100_000_000 : 20_000_000;
                  if (file.size > maxBytes) {
                    onToast(isVideo ? lbl("Video 100 MB dan kichik", "Видео до 100 МБ", "Video up to 100 MB") : lbl("Foto 20 MB dan kichik", "Фото до 20 МБ", "Photo up to 20 MB"));
                    return;
                  }
                  setMediaUploading(true);
                  try {
                    let dataUrl: string;
                    if (isVideo) {
                      // Video uploaded as-is (no client-side re-encode — keeps quality)
                      dataUrl = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onerror = () => reject(new Error("read_failed"));
                        reader.onload = () => resolve(String(reader.result || ""));
                        reader.readAsDataURL(file);
                      });
                    } else {
                      // Photo compressed client-side: good quality (1600px, q0.85) → smaller, no lag
                      dataUrl = await compressImageFile(file, 1600, 0.85);
                    }
                    setDraft((d) => ({ ...d, image: dataUrl, mediaKind: isVideo ? "video" : "image", emoji: isVideo ? "🎬" : (d.emoji || "✨") }));
                  } catch {
                    onToast(lbl("Yuklash xatosi", "Ошибка загрузки", "Upload error"));
                  } finally {
                    setMediaUploading(false);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {/* Emoji */}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink2">{lbl("Emoji", "Эмодзи", "Emoji")}</label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => { haptic("light"); setDraft((d) => ({ ...d, emoji: e })); }}
                  className={`press h-9 w-9 rounded-[10px] border text-[16px] ${draft.emoji === e ? "border-amber bg-amber/10" : "border-ink/15 bg-paper"}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Gradient */}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink2">{lbl("Fon gradienti", "Фон", "Background")}</label>
            <div className="flex flex-wrap gap-1.5">
              {GRADIENTS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { haptic("light"); setDraft((d) => ({ ...d, gradient: g })); }}
                  className={`press h-9 w-9 rounded-[10px] border-2 ${draft.gradient === g ? "border-amber" : "border-ink/15"}`}
                  style={{ background: g }}
                  aria-label="gradient"
                />
              ))}
            </div>
          </div>

          {/* Product link */}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink2">{lbl("Mahsulot (ixtiyoriy)", "Товар (необязательно)", "Product (optional)")}</label>
            <select
              value={draft.productId || ""}
              onChange={(e) => { haptic("light"); setDraft((d) => ({ ...d, productId: e.target.value || undefined })); }}
              className="w-full rounded-[12px] border border-ink/15 bg-paper px-3 py-2 text-[12px] font-semibold text-ink outline-none focus:border-moss"
            >
              <option value="">— {lbl("yo'q", "нет", "none")} —</option>
              {PRODUCT_CATALOG.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Promo code */}
          <input
            value={draft.promoCode || ""}
            onChange={(e) => setDraft((d) => ({ ...d, promoCode: e.target.value.toUpperCase() || undefined }))}
            placeholder={lbl("Promokod (ixtiyoriy)", "Промокод (необязательно)", "Promo code (optional)")}
            className="w-full rounded-[12px] border border-ink/15 bg-paper px-3 py-2 text-[13px] font-bold uppercase text-ink outline-none focus:border-moss"
          />

          <div className="flex gap-2">
            <button onClick={cancel} className="press h-10 flex-1 rounded-[12px] bg-paper2 text-[12px] font-bold text-ink2">
              {lbl("Bekor", "Отмена", "Cancel")}
            </button>
            <button onClick={saveDraft} className="press h-10 flex-1 rounded-[12px] bg-moss text-[12px] font-bold text-white">
              <span className="inline-flex items-center gap-1"><IconCheck size={14} /> {creating ? lbl("Yaratish", "Создать", "Create") : lbl("Saqlash", "Сохранить", "Save")}</span>
            </button>
          </div>
        </div>
      )}

      {/* List of admin stories */}
      <div className="space-y-2">
        {list.length === 0 ? (
          <p className="py-6 text-center text-[13px] italic text-ink2">{lbl("Storylar yo'q. Birinchisini yarating.", "Историй нет. Создайте первую.", "No stories yet. Create the first one.")}</p>
        ) : (
          list.map((s) => {
            const isStale = Date.now() - s.createdAt > 24 * 60 * 60 * 1000;
            return (
              <div key={s.id} className={`rounded-[18px] border p-3 shadow-sm ${isStale ? "border-amber/30 bg-amber/[0.04]" : "border-ink/18 bg-card"}`}>
                <div className="flex gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[14px]" style={{ background: s.gradient }}>
                    {s.image ? <img src={s.image} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[22px]">{s.emoji}</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[13px] font-bold text-ink truncate">{s.title[lang] || s.title.uz}</p>
                    <p className="truncate text-[11px] font-medium text-ink/70">{s.desc[lang] || s.desc.uz}</p>
                    <p className="mt-0.5 text-[10px] font-semibold text-pine">
                      {s.productId && `🎯 ${PRODUCT_CATALOG.find((p) => p.id === s.productId)?.name || s.productId}`}
                      {s.promoCode && ` · 🎁 ${s.promoCode}`}
                    </p>
                    {isStale && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-bold text-amberdeep">
                        ⏰ {lbl("Eski (24h+)", "Старая (24+ ч)", "Stale (24h+)" )}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button onClick={() => startEdit(s.id)} className="press h-8 flex-1 rounded-[12px] bg-paper2 text-[11px] font-bold text-ink2 hover:text-ink">
                    ✏️ {lbl("Tahrir", "Изменить", "Edit")}
                  </button>
                  <button onClick={() => bumpFreshness(s.id)} className="press h-8 flex-1 rounded-[12px] bg-moss/10 text-[11px] font-bold text-moss" title={lbl("24 soat yangilash", "Обновить (24ч)", "Refresh (24h)")}>
                    🔄 {lbl("Yangilash", "Обновить", "Refresh")}
                  </button>
                  <button onClick={() => removeStory(s.id)} className="press h-8 w-10 rounded-[12px] bg-[#B3402E]/10 text-[11px] font-bold text-[#B3402E]">
                    <IconTrash size={13} className="mx-auto" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ============================================================
   CLIENTS DATABASE — report: when bought, how much, what bought
   ============================================================ */

function ClientsAdminTab({ orders, onToast }: { orders: Order[]; onToast: (msg: string) => void }) {
  const { lang } = useI18n();
  const [segmentFilter, setSegmentFilter] = useState<"all" | "bronze" | "silver" | "gold">("all");

  const SEGMENT_THRESHOLDS = {
    bronze: 500_000,     // up to 500k
    silver: 2_000_000,   // 500k–2M
    // gold: 2M+
  };

  function getSegment(total: number): "bronze" | "silver" | "gold" {
    if (total >= SEGMENT_THRESHOLDS.silver) return "gold";
    if (total >= SEGMENT_THRESHOLDS.bronze) return "silver";
    return "bronze";
  }

  const SEGMENT_BADGE: Record<string, { emoji: string; cls: string; labelUz: string; labelRu: string; labelEn: string }> = {
    bronze: { emoji: "🥉", cls: "bg-[#cd7f32]/15 text-[#a05a1a]", labelUz: "Bronza", labelRu: "Бронза", labelEn: "Bronze" },
    silver: { emoji: "🥈", cls: "bg-[#c0c0c0]/20 text-[#666]", labelUz: "Kumush", labelRu: "Серебро", labelEn: "Silver" },
    gold: { emoji: "👑", cls: "bg-amber/20 text-amberdeep", labelUz: "Oltin", labelRu: "Золото", labelEn: "Gold" },
  };

  const clients = useMemo(() => {
    const map = new Map<string, { name: string; phones: Set<string>; tgIds: Set<string>; usernames: Set<string>; orders: Order[]; total: number; totalItems: number; lastDate: number }>();
    for (const o of orders) {
      const key = (o.recipientPhone || o.recipientName || "anon").trim();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { name: o.recipientName, phones: new Set(), tgIds: new Set(), usernames: new Set(), orders: [], total: 0, totalItems: 0, lastDate: 0 });
      }
      const entry = map.get(key)!;
      entry.phones.add(o.recipientPhone);
      if (o.customerTgId) entry.tgIds.add(String(o.customerTgId));
      if (o.customerUsername) entry.usernames.add(o.customerUsername);
      entry.name = o.recipientName || entry.name;
      entry.orders.push(o);
      entry.total += o.total;
      entry.totalItems += o.count;
      entry.lastDate = Math.max(entry.lastDate, o.createdAt);
    }
    return Array.from(map.values())
      .map((c) => ({ ...c, phones: Array.from(c.phones), tgIds: Array.from(c.tgIds), usernames: Array.from(c.usernames) }))
      .sort((a, b) => b.total - a.total);
  }, [orders]);

  const segmentCounts = useMemo(() => {
    const counts = { bronze: 0, silver: 0, gold: 0 };
    for (const c of clients) counts[getSegment(c.total)]++;
    return counts;
  }, [clients]);

  const filteredClients = segmentFilter === "all" ? clients : clients.filter((c) => getSegment(c.total) === segmentFilter);

  if (clients.length === 0) {
    return <p className="text-[13px] text-ink2 italic">Hozircha mijozlar bazasi bo'sh — buyurtmalar paydo bo'lgach shu yerda ko'rinadi.</p>;
  }

  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);

  const exportClientsCsv = () => {
    haptic("medium");
    const esc = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Mijoz", "Telefon", "Telegram", "ID", "Segment", "Buyurtmalar", "Dona", "Jami so'm", "So'nggi xarid", "Xarid tarixi"].map(esc).join(";"),
      ...clients.map((c) =>
        [
          c.name,
          c.phones.join(" / "),
          c.usernames.length ? `@${c.usernames.join(", @")}` : "",
          c.tgIds.join(" / "),
          getSegment(c.total),
          c.orders.length,
          c.totalItems,
          c.total,
          new Date(c.lastDate).toISOString().slice(0, 10),
          c.orders.map((o) => `${o.id} (${o.items.map((i) => `${i.name} x${i.qty}`).join(" + ")})`).join(" | "),
        ].map(esc).join(";"),
      ),
    ].join("\r\n");
    const blob = new Blob(["\uFEFF" + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DELIS_clients_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    onToast(`⬇️ DELIS_clients_*.csv (${clients.length})`);
  };

  return (
    <div className="space-y-2.5">
      <div className="rounded-[18px] bg-sagetint/60 p-3 text-[12px] font-medium text-pine">
        {L("Hammasi", "Всего", "Total")}: {clients.length} {L("mijoz", "клиентов", "clients")} · {orders.length} {L("buyurtma", "заказов", "orders")} · {L("savdo", "выручка", "revenue")}: {formatPrice(clients.reduce((s, c) => s + c.total, 0), lang)}
      </div>

      {/* Segment filter chips */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto rounded-[18px] bg-paper2 p-1.5">
        {([
          { id: "all", emoji: "👥", label: L("Hammasi", "Все", "All"), count: clients.length },
          { id: "gold", emoji: "👑", label: L("Oltin", "Золото", "Gold"), count: segmentCounts.gold },
          { id: "silver", emoji: "🥈", label: L("Kumush", "Серебро", "Silver"), count: segmentCounts.silver },
          { id: "bronze", emoji: "🥉", label: L("Bronza", "Бронза", "Bronze"), count: segmentCounts.bronze },
        ] as const).map((s) => (
          <button
            key={s.id}
            onClick={() => { haptic("light"); setSegmentFilter(s.id); }}
            className={`press flex shrink-0 items-center gap-1.5 rounded-[13px] px-3 py-2 text-[11px] font-bold transition-all ${
              segmentFilter === s.id ? "bg-amber text-white shadow-sm" : "bg-card text-ink2"
            }`}
          >
            <span>{s.emoji}</span>
            <span>{s.label}</span>
            <span className={`rounded-full px-1.5 py-0.5 font-display text-[9px] font-bold ${segmentFilter === s.id ? "bg-white/20" : "bg-paper2"}`}>{s.count}</span>
          </button>
        ))}
      </div>

      {/* Export clients CSV */}
      <button
        onClick={exportClientsCsv}
        className="press flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-moss/20 bg-sagetint/50 text-[12px] font-bold text-pine"
      >
        <IconChart size={15} /> {L("CSV eksport", "Экспорт в CSV", "Export CSV")}
      </button>
      {filteredClients.map((c, idx) => {
        const seg = getSegment(c.total);
        const badge = SEGMENT_BADGE[seg];
        return (
        <div key={idx} className="rounded-[20px] border border-ink/18 bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-display text-[14px] font-bold text-ink">{c.name || L("Ismsiz mijoz", "Без имени", "Unnamed")}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge.cls}`}>
                  {badge.emoji} {L(badge.labelUz, badge.labelRu, badge.labelEn)}
                </span>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] font-medium text-ink2"><IconPhone size={12} /> {c.phones.join(", ")} · {c.usernames.length ? `@${c.usernames.join(", @")}` : "—"} · <IconSymbol symbol="🆔" size={12} /> {c.tgIds.join(", ") || "—"}</p>
              <p className="text-[11px] text-ink2/85">{L("So'nggi xarid", "Последний заказ", "Last order")}: {new Date(c.lastDate).toLocaleDateString()}</p>
              <p className="mt-1 text-[11px] text-ink/60">{L("Jami", "Всего", "Total")}: {c.totalItems} {L("dona", "шт", "pcs")} · {c.orders.length} {L("buyurtma", "заказов", "orders")}</p>
            </div>
            <span className="shrink-0 rounded-full bg-moss/10 px-3 py-1 font-display text-[12px] font-bold text-moss">{formatPrice(c.total, lang)}</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {c.orders.slice(0, 4).map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-[12px] bg-paper2 px-3 py-2 text-[11px]">
                <span className="font-mono font-bold text-ink">#{o.id}</span>
                <span className="text-ink2">{new Date(o.createdAt).toLocaleDateString()} · {o.count} {L("dona", "шт", "pcs")}</span>
                <span className="font-bold text-ink">{formatPrice(o.total, lang)}</span>
              </div>
            ))}
            <div className="text-[11px] text-ink2">
              {L("Sotib olgan", "Купил", "Bought")}: {c.orders.flatMap(o => o.items.map(i => i.name)).slice(0, 6).join(", ")}
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   PROMO CODE EDITOR — create, edit, toggle, delete
   ============================================================ */

function PromoEditor({ products, onToast }: { products: Product[]; onToast: (msg: string) => void }) {
  const { t, lang } = useI18n();

  // Load codes from localStorage (or defaults)
  const [codes, setCodes] = useState<Record<string, PromoCode>>(() => loadPromoCodes());

  // The server is authoritative — pull the live promo list on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remote = await fetchAdminPromos();
      if (!cancelled && remote) {
        setCodes(serverPromosToMap(remote));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Editor form state
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState<PromoCode["type"]>("percent");
  const [newValue, setNewValue] = useState("15");
  const [newMinSpend, setNewMinSpend] = useState("0");
  const [newMaxDiscount, setNewMaxDiscount] = useState("");
  const [newProductId, setNewProductId] = useState("");

  // Persist whenever codes change
  useEffect(() => {
    savePromoCodes(codes);
  }, [codes]);

  const resetForm = () => {
    setEditingCode(null);
    setNewCode("");
    setNewType("percent");
    setNewValue("15");
    setNewMinSpend("0");
    setNewMaxDiscount("");
    setNewProductId("");
  };

  const startCreate = () => {
    haptic("light");
    resetForm();
    setEditingCode("__new__");
  };

  const startEdit = (code: string, promo: PromoCode) => {
    haptic("light");
    setEditingCode(code);
    setNewCode(code);
    setNewType(promo.type);
    setNewValue(String(promo.value));
    setNewMinSpend(String(promo.minSpend ?? 0));
    setNewMaxDiscount(typeof promo.maxDiscount === "number" ? String(promo.maxDiscount) : "");
    setNewProductId(promo.requiredProductId || "");
  };

  const savePromo = () => {
    const code = newCode.trim().toUpperCase();
    if (!code) return;

    const maxDiscount = newMaxDiscount ? parseInt(newMaxDiscount) : undefined;
    const productId = newProductId || null;

    haptic("success");
    const updated: Record<string, PromoCode> = {
      ...codes,
      [code]: {
        code,
        type: newType,
        value: newType === "percent" ? Math.min(90, Math.max(1, parseInt(newValue) || 0)) : Math.max(0, parseInt(newValue) || 0),
        minSpend: parseInt(newMinSpend) || 0,
        maxDiscount,
        requiredProductId: productId || undefined,
        title: {
          uz: `${newType === "percent" ? `${newValue}% chegirma` : newType === "fixed" ? `${formatPrice(parseInt(newValue) || 0, "uz")} chegirma` : "Bepul yetkazish"} — DELIS`,
          ru: `${newType === "percent" ? `Скидка ${newValue}%` : newType === "fixed" ? `Скидка ${formatPrice(parseInt(newValue) || 0, "ru")}` : "Бесплатная доставка"} — DELIS`,
          en: `${newType === "percent" ? `${newValue}% off` : newType === "fixed" ? `${formatPrice(parseInt(newValue) || 0, "en")} off` : "Free delivery"} — DELIS`,
        },
        active: true,
      },
    };

    setCodes(updated);
    // Persist to the server — checkout validates promos there
    void adminUpsertPromo({
      code,
      type: newType,
      value: updated[code].value,
      minSpend: updated[code].minSpend ?? 0,
      maxDiscount,
      requiredProductId: productId,
      active: true,
      titles: { uz: updated[code].title.uz, ru: updated[code].title.ru, en: updated[code].title.en },
    });
    resetForm();
    onToast(editingCode === "__new__" ? t("promoCreated") : t("promoUpdated"));
  };

  const togglePromo = (code: string) => {
    haptic("light");
    setCodes((prev) => {
      const next = { ...prev, [code]: { ...prev[code], active: prev[code]?.active === false } };
      const p = next[code];
      if (p) {
        void adminUpsertPromo({
          code, type: p.type, value: p.value, minSpend: p.minSpend ?? 0,
          maxDiscount: p.maxDiscount,
          requiredProductId: p.requiredProductId || null,
          active: p.active !== false,
          titles: { uz: p.title.uz, ru: p.title.ru, en: p.title.en },
        });
      }
      return next;
    });
  };

  const deletePromo = (code: string) => {
    haptic("medium");
    setCodes((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
    void adminDeletePromo(code);
    onToast(`${code}: ${t("promoDeleted")}`);
  };

  return (
    <div className="space-y-3 animate-pop">
      {/* Create button */}
      {editingCode === null && (
        <button
          onClick={startCreate}
          className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-dashed border-moss/40 bg-sagetint/40 text-[13px] font-bold text-pine hover:bg-sagetint"
        >
          <IconPlus size={16} />
          <span>{t("promoCreate")}</span>
        </button>
      )}

      {/* Editor form */}
      {editingCode !== null && (
        <div className="space-y-3 rounded-[22px] border border-moss/25 bg-card p-4 shadow-sm">
          <p className="font-display text-[14px] font-bold text-ink">
            <span className="inline-flex items-center gap-1.5">{editingCode === "__new__" ? <IconSparkle size={15} /> : <IconFileText size={15} />} {editingCode === "__new__" ? t("promoCreate") : `${t("promoEdit")}: ${editingCode}`}</span>
          </p>

          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder={t("promoCodePh")}
            className="w-full rounded-[14px] border border-ink/15 bg-paper px-3.5 py-2.5 font-display text-[15px] font-bold uppercase tracking-wider text-ink outline-none focus:border-moss"
          />

          <div className="grid grid-cols-3 gap-2">
            {(["percent", "fixed", "freeship"] as const).map((type) => (
              <button
                key={type}
                onClick={() => {
                  haptic("light");
                  setNewType(type);
                }}
                className={`press rounded-[14px] py-2 text-[11px] font-bold transition-all ${
                  newType === type ? "bg-amber text-white" : "bg-paper2 text-ink2"
                }`}
              >
                {type === "percent" ? t("promoTypePercent") : type === "fixed" ? t("promoTypeFixed") : t("promoTypeFreeship")}
              </button>
            ))}
          </div>

          {newType !== "freeship" && (
            <>
              <input
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={t("promoValuePh")}
                className="w-full rounded-[14px] border border-ink/15 bg-paper px-3.5 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
              />
              <input
                type="number"
                value={newMinSpend}
                onChange={(e) => setNewMinSpend(e.target.value)}
                placeholder={t("promoMinSpendPh")}
                className="w-full rounded-[14px] border border-ink/15 bg-paper px-3.5 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
              />
              <input
                type="number"
                value={newMaxDiscount}
                onChange={(e) => setNewMaxDiscount(e.target.value)}
                placeholder={lang === "ru" ? "Лимит скидки, сум (необязательно)" : lang === "en" ? "Max discount, UZS (optional)" : "Chegirma limiti, so'm (ixtiyoriy)"}
                className="w-full rounded-[14px] border border-ink/15 bg-paper px-3.5 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
              />
            </>
          )}

          {/* Product-bound promo: applies only to a chosen product */}
          <div>
            <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ink2">
              {lang === "ru" ? "Товар (необязательно)" : lang === "en" ? "Product (optional)" : "Mahsulot (ixtiyoriy)"}
            </p>
            <select
              value={newProductId}
              onChange={(e) => { haptic("light"); setNewProductId(e.target.value); }}
              className="w-full rounded-[14px] border border-ink/15 bg-paper px-3.5 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
            >
              <option value="">{lang === "ru" ? "— На любой товар —" : lang === "en" ? "— Any product —" : "— Istalgan mahsulot —"}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {newProductId && (
              <p className="mt-1 text-[11px] font-semibold text-moss">
                {lang === "ru" ? "✓ Скидка только на этот товар" : lang === "en" ? "✓ Discount applies only to this product" : "✓ Chegirma faqat shu mahsulotga"}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={resetForm}
              className="press h-11 flex-1 rounded-[14px] bg-paper2 text-[13px] font-bold text-ink2"
            >
              {t("promoCancel")}
            </button>
            <button
              onClick={savePromo}
              className="press h-11 flex-1 rounded-[14px] bg-amber text-[13px] font-bold text-white"
            >
              <span className="inline-flex items-center gap-1"><IconCheck size={14} /> {t("promoSave")}</span>
            </button>
          </div>
        </div>
      )}

      {/* List of codes */}
      <div className="space-y-2">
        {Object.entries(codes).map(([code, p]) => {
          const isActive = p.active !== false;
          return (
            <div
              key={code}
              className={`rounded-[18px] border p-3.5 shadow-sm transition-opacity ${
                isActive ? "border-ink/18 bg-card" : "border-ink/6 bg-paper2/60 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[14px] font-bold tracking-wider text-ink">{code}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                        isActive ? "bg-moss/15 text-moss" : "bg-amber/10 text-ink2"
                      }`}
                    >
                      {isActive ? t("promoActive") : t("promoInactive")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] font-semibold text-moss">
                    {p.type === "percent" ? `−${p.value}%` : p.type === "fixed" ? `−${formatPrice(p.value, lang)}` : "Bepul yetkazish"}
                    {p.minSpend ? ` · ${t("promoMinSpend")} ${formatPrice(p.minSpend, lang)}` : ""}
                    {typeof p.maxDiscount === "number" && p.maxDiscount > 0 ? ` · max ${formatPrice(p.maxDiscount, lang)}` : ""}
                  </p>
                  {p.requiredProductId && (
                    <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber/10 px-2 py-0.5 text-[10px] font-bold text-amberdeep">
                      🎯 {products.find((x) => x.id === p.requiredProductId)?.name || p.requiredProductId}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Toggle */}
                  <button
                    onClick={() => togglePromo(code)}
                    role="switch"
                    aria-checked={isActive}
                    className={`relative h-6 w-11 rounded-full transition-colors ${isActive ? "bg-moss" : "bg-amber/15"}`}
                  >
                    <span
                      className={`absolute top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-[left] ${
                        isActive ? "left-[22px]" : "left-[2px]"
                      }`}
                    />
                  </button>
                  {/* Edit */}
                  <button
                    onClick={() => startEdit(code, p)}
                    className="press flex h-8 w-8 items-center justify-center rounded-full bg-paper2 text-ink2 hover:text-ink"
                    aria-label={t("promoEdit")}
                  >
                    <IconSettings size={14} />
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => deletePromo(code)}
                    className="press flex h-8 w-8 items-center justify-center rounded-full bg-[#B3402E]/10 text-[#B3402E]"
                    aria-label={t("promoDelete")}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* ============================================================
   BACKUP & RESET — export JSON, reset cached local data (two-tap)
   ============================================================ */

const BACKUP_KEYS = [
  "orders", "addresses", "returns", "user_reviews", "favorites", "cart", "stars",
  "recently_viewed", "delis_promo_codes", "delis_custom_products", "delis_product_overrides",
  "delis_custom_stories", "delis_notifs", "delis_op_logs", "delis_tariff_overrides",
  "delis_abandoned_cart", "delis_stars_log", "delis_search_history",
  "delis_birthday", "delis_bottles", "delis_group_order",
];

function BackupAdminTab({ onToast }: { onToast: (msg: string) => void }) {
  const { lang } = useI18n();
  const [armed, setArmed] = useState(false);
  const [csvDownloading, setCsvDownloading] = useState(false);
  const [backupDownloading, setBackupDownloading] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ supabase: boolean; gpt: boolean } | null>(null);
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);

  useEffect(() => {
    import("./api").then(({ fetchBackupStatus }) => {
      void fetchBackupStatus().then((s) => { if (s?.ok) setBackupStatus({ supabase: s.supabase, gpt: s.gpt }); });
    }).catch(() => {});
  }, []);

  const exportBackup = async () => {
    haptic("medium");
    setBackupDownloading(true);
    try {
      const blob = await downloadAdminBackup();
      if (!blob) {
        onToast(L("Server javob bermadi — bekap olinmadi", "Сервер не ответил — бекап не получен", "Server unreachable — backup failed"));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DELIS_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      onToast(`⬇️ DELIS_backup_${new Date().toISOString().slice(0, 10)}.json`);
    } finally {
      setBackupDownloading(false);
    }
  };

  const resetLocalData = () => {
    if (!armed) {
      haptic("medium");
      setArmed(true);
      onToast(L("⚠️ Yana bosing — barcha ma'lumotlar o'chadi", "⚠️ Нажмите ещё раз — все данные будут удалены", "⚠️ Tap again — all data will be cleared"));
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    haptic("light");
    setArmed(false);
    BACKUP_KEYS.forEach((k) => {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    });
    onToast(L("✅ Barcha ma'lumotlar o'chirildi. Sahifa yangilanadi…", "✅ Все данные удалены. Страница обновится…", "✅ All data cleared. Reloading…"));
    setTimeout(() => window.location.reload(), 900);
  };

  return (
    <div className="space-y-3 animate-pop">
      <div className="rounded-[20px] bg-sagetint/70 p-3.5 text-[12px] font-medium text-pine">
        <span className="inline-flex items-start gap-1.5"><IconSymbol symbol="💾" size={15} className="mt-0.5 shrink-0" /> {L("Barcha ma'lumotlar bitta faylda: buyurtmalar, mijozlar, sklad, promokodlar, sozlamalar.", "Все данные одним файлом: заказы, клиенты, склад, промокоды, настройки.", "All data in one file: orders, clients, stock, promos, settings.")}</span>
      </div>

      {/* Backup & GPT status indicators */}
      {backupStatus && (
        <div className="grid grid-cols-2 gap-2">
          <div className={`rounded-[14px] border p-3 ${backupStatus.supabase ? "border-moss/25 bg-moss/[0.06]" : "border-amber/25 bg-amber/[0.06]"}`}>
            <p className="flex items-center gap-1.5 text-[11px] font-bold">
              <IconSymbol symbol={backupStatus.supabase ? "✅" : "⚠️"} size={13} />
              {backupStatus.supabase ? (L("Supabase ulangan", "Supabase подключён", "Supabase connected")) : (L("Supabase yo'q", "Supabase не подключён", "Supabase not connected"))}
            </p>
            <p className="mt-0.5 text-[10px] text-ink2">
              {backupStatus.supabase
                ? L("Avto-bekap har 30 soniyada", "Авто-бекап каждые 30 сек", "Auto-backup every 30s")
                : L("Render'da SUPABASE_URL + KEY qo'ying", "На Render укажите SUPABASE_URL + KEY", "Set SUPABASE_URL + KEY on Render")}
            </p>
          </div>
          <div className={`rounded-[14px] border p-3 ${backupStatus.gpt ? "border-moss/25 bg-moss/[0.06]" : "border-amber/25 bg-amber/[0.06]"}`}>
            <p className="flex items-center gap-1.5 text-[11px] font-bold">
              <IconSymbol symbol={backupStatus.gpt ? "✅" : "⚠️"} size={13} />
              {backupStatus.gpt ? (L("Tarjima ON", "Перевод ON", "Translation ON")) : (L("Tarjima OFF", "Перевод OFF", "Translation OFF"))}
            </p>
            <p className="mt-0.5 text-[10px] text-ink2">
              {backupStatus.gpt
                ? L("🤖 Bepul avto-tarjima", "🤖 Бесплатный авто-перевод", "🤖 Free auto-translate")
                : L("Serverda muammo", "Проблема на сервере", "Server issue")}
            </p>
          </div>
        </div>
      )}

      <button
        onClick={() => void exportBackup()}
        disabled={backupDownloading}
        className="press flex w-full items-center gap-3 rounded-[18px] border border-moss/20 bg-sagetint/50 p-3.5 text-left disabled:opacity-60"
      >
        <span className="motion-icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-moss text-white"><IconSymbol symbol={backupDownloading ? "⏳" : "⬇️"} size={21} /></span>
        <span className="flex-1">
          <span className="block text-[13px] font-bold text-ink">{backupDownloading ? L("Yuklanmoqda…", "Загрузка…", "Downloading…") : L("Zaxira nusxani yuklab olish", "Скачать резервную копию", "Download backup")}</span>
          <span className="mt-0.5 block text-[11px] font-semibold text-pine/70">DELIS_backup_*.json</span>
        </span>
      </button>

      {/* Server-side CSV export — every order straight from the DB */}
      <button
        onClick={() => {
          void (async () => {
            haptic("medium");
            setCsvDownloading(true);
            try {
              const csv = await fetchOrdersCsv();
              if (csv == null) {
                onToast(L("Server javob bermadi — CSV olingan emas", "Сервер не ответил — CSV не получен", "Server unreachable — no CSV"));
                return;
              }
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `delis-orders-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 2000);
              onToast(`⬇️ delis-orders-*.csv (${csv.trim().split("\n").length - 1})`);
            } finally {
              setCsvDownloading(false);
            }
          })();
        }}
        disabled={csvDownloading}
        className="press flex w-full items-center gap-3 rounded-[18px] border border-ink/15 bg-card p-3.5 text-left disabled:opacity-60"
      >
        <span className="motion-icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-amber text-white"><IconSymbol symbol={csvDownloading ? "⏳" : "📊"} size={21} /></span>
        <span className="flex-1">
          <span className="block text-[13px] font-bold text-ink">
            {csvDownloading
              ? L("Yuklanmoqda…", "Загрузка…", "Downloading…")
              : L("Buyurtmalarni CSV qilib olish", "Экспорт заказов в CSV", "Export orders to CSV")}
          </span>
          <span className="mt-0.5 block text-[11px] font-semibold text-ink2/80">
            {L("Server DB dan — Excel uchun tayyor", "Из базы сервера — готово для Excel", "From the server DB — Excel-ready")}
          </span>
        </span>
      </button>

      <div className="rounded-[16px] border border-amber/20 bg-amber/[0.04] p-3.5">
        <p className="text-[12px] font-bold text-ink">{L("Xavfli zona", "Опасная зона", "Danger zone")}</p>
        <p className="mt-1 text-[11px] font-medium text-ink/70">
          {L("Barcha mahalliy ma'lumotlarni o'chiradi (buyurtmalar, korzina, sozlamalar). Avval zaxira oling!", "Удаляет все локальные данные (заказы, корзину, настройки). Сначала сделайте бэкап!", "Clears all local data (orders, cart, settings). Backup first!")}
        </p>
        <button
          onClick={resetLocalData}
          className={`press mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[14px] text-[13px] font-bold transition-all ${
            armed ? "animate-pulse bg-[#B3402E] text-white shadow-lift" : "bg-[#B3402E]/10 text-[#B3402E]"
          }`}
        >
          <IconTrash size={15} /> {armed ? L("Yana bosing — tasdiqlash!", "Нажмите ещё раз — подтверждение!", "Tap again to confirm!") : L("Barcha ma'lumotlarni o'chirish", "Удалить все данные", "Clear all data")}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   DAILY DEAL CONTROL — pick product, discount, enable/disable
   ============================================================ */

function DailyDealAdminTab({ onToast }: { onToast: (msg: string) => void }) {
  const { lang } = useI18n();
  const [cfg, setCfg] = useState<DailyDealConfig>(() => loadDailyDeal());

  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  const product = PRODUCTS.find((p) => p.id === cfg.productId);
  const dealPrice = product ? Math.round((product.price * (100 - cfg.discount)) / 1000) * 10 : 0;

  const save = (patch: Partial<DailyDealConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveDailyDeal(next);
    haptic("success");
    onToast("✓ " + L("Saqlandi", "Сохранено", "Saved"));
  };

  return (
    <div className="space-y-3 animate-pop">
      <div className="rounded-[20px] bg-amber/[0.07] border border-amber/20 p-3.5 text-[12px] font-medium text-amberdeep">
        <span className="inline-flex items-start gap-1.5"><IconSymbol symbol="🔥" size={16} className="mt-0.5 shrink-0" /> {L("Kun taklifi — bosh sahifada ko'rinadi. Tovar, chegirma va holatni tanlang.", "Товар дня — показывается на главной. Выберите товар, скидку и статус.", "Daily deal — shown on the home page. Pick a product, discount and status.")}</span>
      </div>

      {/* Enable toggle */}
      <button
        onClick={() => save({ enabled: !cfg.enabled })}
        className={`press flex w-full items-center justify-between rounded-[18px] border px-4 py-3.5 transition-all ${
          cfg.enabled ? "border-moss/30 bg-moss/10" : "border-ink/15 bg-card"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 items-center justify-center rounded-full text-[17px] ${cfg.enabled ? "bg-moss text-white" : "bg-paper2 text-ink/65"}`}>
            {cfg.enabled ? <IconCheck size={17} /> : <IconClose size={16} />}
          </span>
          <span>
            <span className="block text-[14px] font-bold text-ink">{L("Aktiv", "Активен", "Active")}</span>
            <span className="block text-[11px] font-medium text-ink/70">
              {cfg.enabled ? L("Hozir bosh sahifada ko'rinmoqda", "Сейчас показывается на главной", "Currently shown on the home page") : L("Hozircha o'chirilgan", "Сейчас выключен", "Currently disabled")}
            </span>
          </span>
        </span>
        <span className={`h-7 w-12 rounded-full p-1 transition-colors ${cfg.enabled ? "bg-moss" : "bg-amber/15"}`}>
          <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${cfg.enabled ? "translate-x-5" : ""}`} />
        </span>
      </button>

      {/* Product picker */}
      <div>
        <label className="text-[11px] font-bold text-ink/70">{L("Mahsulot", "Товар", "Product")}</label>
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
          {PRODUCTS.slice(0, 8).map((p) => (
            <button
              key={p.id}
              onClick={() => { haptic("light"); save({ productId: p.id }); }}
              className={`press flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-all ${
                cfg.productId === p.id ? "border-ink bg-amber text-white" : "border-ink/15 bg-card text-ink/60"
              }`}
            >
              <span className="h-4 w-4 overflow-hidden rounded-full">
                <img src={p.img} alt="" className="h-full w-full object-cover" />
              </span>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Discount slider */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-ink/70">{L("Chegirma", "Скидка", "Discount")}</label>
          <span className="rounded-full bg-amber/15 px-3 py-1 font-display text-[14px] font-bold text-amberdeep">−{cfg.discount}%</span>
        </div>
        <input
          type="range"
          min={5}
          max={50}
          step={5}
          value={cfg.discount}
          onChange={(e) => { haptic("light"); save({ discount: Number(e.target.value) }); }}
          className="mt-2 w-full accent-amber"
        />
        <div className="mt-1 flex justify-between text-[10px] font-bold text-ink/60">
          <span>5%</span><span>25%</span><span>50%</span>
        </div>
      </div>

      {/* Custom title */}
      <div>
        <label className="text-[11px] font-bold text-ink/70">{L("Sarlavha (ixtiyoriy)", "Заголовок (необязательно)", "Title (optional)")}</label>
        <input
          value={cfg.title || ""}
          onChange={(e) => save({ title: e.target.value })}
          placeholder={L("Masalan: Hafta xitlari", "Напр.: Хиты недели", "E.g.: Weekly hits")}
          className="mt-2 w-full rounded-[14px] border border-ink/15 bg-card px-3.5 py-2.5 text-[13px] font-semibold text-ink outline-none placeholder:text-ink/75 focus:border-moss"
        />
      </div>

      {/* Preview */}
      {product && (
        <div className="rounded-[18px] border border-amber/25 bg-gradient-to-r from-amber/[0.10] to-transparent p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amberdeep">{L("Oldindan ko'rish", "Предпросмотр", "Preview")}</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[14px] bg-paper2">
              <img src={product.img} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[14px] font-bold text-ink">{product.name}</p>
              <p className="mt-0.5 text-[12px] font-semibold text-ink/70">
                <span className="text-amberdeep line-through">{formatPrice(product.price, lang)}</span>
                <span className="ml-2 font-display text-[14px] font-bold text-moss">{formatPrice(dealPrice, lang)}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   JOB APPLICATIONS — careers form submissions from the app
   ============================================================ */

const JOB_POS_LABEL: Record<JobPositionId, { uz: string; ru: string; en: string }> = {
  agent: { uz: "Agent (savdo vakili)", ru: "Агент (торговый представитель)", en: "Agent (sales rep)" },
  courier: { uz: "Kuryer-yetkazuvchi", ru: "Курьер-доставщик", en: "Delivery courier" },
  factory: { uz: "Zavod xodimi", ru: "Работник завода", en: "Factory worker" },
  manager: { uz: "B2B menejer", ru: "B2B-менеджер", en: "B2B manager" },
  smm: { uz: "SMM-menejer", ru: "SMM-менеджер", en: "SMM manager" },
};

function JobsAdminTab({
  apps,
  onChange,
  onToast,
}: {
  apps: JobApp[];
  onChange: (next: JobApp[]) => void;
  onToast: (msg: string) => void;
}) {
  const { lang } = useI18n();
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  const newCount = apps.filter((a) => a.status === "new").length;
  const sorted = [...apps].sort((a, b) => b.createdAt - a.createdAt);

  const setStatus = (id: string, status: JobApp["status"]) => {
    haptic("light");
    onChange(apps.map((a) => (a.id === id ? { ...a, status } : a)));
  };

  const remove = (id: string) => {
    if (confirmDel !== id) { setConfirmDel(id); return; }
    haptic("medium");
    onChange(apps.filter((a) => a.id !== id));
    setConfirmDel(null);
    onToast(L("Ariza o'chirildi", "Заявка удалена", "Application removed"));
  };

  return (
    <div className="space-y-3 animate-pop">
      <div className="rounded-[16px] bg-sagetint/60 px-3.5 py-2.5 text-[12px] font-semibold text-pine">
        {newCount > 0
          ? L(`${newCount} ta yangi ariza`, `${newCount} новых заявок`, `${newCount} new applications`)
          : L("Yangi arizalar yo'q", "Новых заявок нет", "No new applications")}
        {" · "}{apps.length}{L(" ta jami", " всего", " total")}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-ink/15 bg-card/60 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-sagetint text-pine">
            <IconUserCheck size={24} />
          </div>
          <p className="mt-3 text-[13px] font-semibold text-ink2">
            {L("Arizalar yo'q", "Заявок нет", "No applications")}
          </p>
          <p className="mt-1 text-[11px] text-ink/70">
            {L("«Vakansiyalar» sahifasidagi forma orqali keladi", "Приходят через форму на странице «Вакансии»", "Submissions from the Careers page form appear here")}
          </p>
        </div>
      ) : (
        sorted.map((a) => {
          const pos = JOB_POS_LABEL[a.position];
          return (
            <div key={a.id} className={`rounded-[20px] border p-4 ${a.status === "new" ? "border-amber/40 bg-amber/[0.06]" : "border-ink/18 bg-card"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-pinedeep px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-white">
                      {pos[lang]}
                    </span>
                    {a.status === "new" && (
                      <span className="rounded-full bg-amber px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] text-white">
                        {L("Yangi", "Новая", "New")}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-display text-[14px] font-bold text-ink">{a.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-semibold text-ink2">
                    <span className="inline-flex items-center gap-1">
                      <IconPhone size={11} /> {a.phone}
                    </span>
                    <span className="text-ink/60">·</span>
                    <span>{new Date(a.createdAt).toLocaleDateString()} {new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </p>
                  {a.note && (
                    <p className="mt-1.5 rounded-[12px] bg-paper2 px-3 py-2 text-[12px] font-medium text-ink2">“{a.note}”</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <a
                  href={`tel:${a.phone.replace(/[^+\d]/g, "")}`}
                  className="press flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[12px] border border-moss/25 bg-sagetint/40 text-[12px] font-bold text-pine"
                >
                  <IconPhone size={13} /> {L("Qo'ng'iroq", "Позвонить", "Call")}
                </a>
                {a.status !== "closed" && (
                  <button
                    onClick={() => setStatus(a.id, a.status === "new" ? "contacted" : "closed")}
                    className="press flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[12px] bg-amber text-[12px] font-bold text-white"
                  >
                    <IconCheck size={13} />
                    {a.status === "new" ? L("Bog'landim", "Связался", "Contacted") : L("Yopish", "Закрыть", "Close")}
                  </button>
                )}
                {a.status === "closed" && (
                  <button
                    onClick={() => setStatus(a.id, "contacted")}
                    className="press h-9 flex-1 rounded-[12px] border border-ink/15 text-[12px] font-bold text-ink2"
                  >
                    {L("Qayta ochish", "Открыть", "Reopen")}
                  </button>
                )}
                <button
                  onClick={() => remove(a.id)}
                  className={`press flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${confirmDel === a.id ? "bg-[#E11D48] text-white" : "border border-ink/15 text-ink/65"}`}
                  aria-label={L("O'chirish", "Удалить", "Delete")}
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ============================================================
   DELIVERY TARIFFS — admin-editable courier/BTS prices & threshold
   ============================================================ */

function DeliveryAdminTab({ onToast }: { onToast: (msg: string) => void }) {
  const { lang } = useI18n();
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  const [cfg, setCfg] = useState<{ freeShippingThreshold: number; tariffs: Record<string, { courier: number; bts: number; days: [number, number] }>; defaultTariff: { courier: number; bts: number; days: [number, number] } } | null>(null);
  const [threshold, setThreshold] = useState("150000");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const REGION_LABELS: Record<string, string> = {
    namangan: "Namangan",
    fergana: "Farg'ona",
    andijan: "Andijon",
    tashkent_city: "Toshkent sh.",
    tashkent_reg: "Toshkent vil.",
    syrdarya: "Sirdaryo",
    jizzakh: "Jizzax",
    samarkand: "Samarqand",
    navoi: "Navoiy",
    kashkadarya: "Qashqadaryo",
    bukhara: "Buxoro",
    surkhandarya: "Surxondaryo",
    khorezm: "Xorazm",
    karakalpakstan: "Qoraqalpog'iston",
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { fetchDeliveryConfig, fetchAdminDeliveryConfig } = await import("./api");
      const remote = await fetchAdminDeliveryConfig() || await fetchDeliveryConfig();
      if (!cancelled && remote) {
        setCfg(remote as any);
        setThreshold(String((remote as any).freeShippingThreshold));
      } else if (!cancelled) {
        // fallback to local defaults
        const { REGION_TARIFFS, DEFAULT_TARIFF } = await import("./data");
        setCfg({ freeShippingThreshold: 150000, tariffs: REGION_TARIFFS as any, defaultTariff: DEFAULT_TARIFF as any });
        setThreshold("150000");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const updateTariff = (id: string, field: "courier" | "bts", value: string) => {
    const num = Math.max(0, Math.min(500000, parseInt(value) || 0));
    setCfg((prev) => {
      if (!prev) return prev;
      return { ...prev, tariffs: { ...prev.tariffs, [id]: { ...prev.tariffs[id], [field]: num } } };
    });
  };

  const handleSave = async () => {
    if (!cfg) return;
    haptic("medium");
    setSaving(true);
    const toSave = { ...cfg, freeShippingThreshold: Math.max(0, Math.min(1000000, parseInt(threshold) || 0)) };
    const { adminPutDeliveryConfig } = await import("./api");
    const { hydrateDeliveryConfig } = await import("./data");
    const res: any = await adminPutDeliveryConfig(toSave as any);
    if (res?.ok) {
      hydrateDeliveryConfig(toSave as any);
      onToast(L("✓ Yetkazish narxlari saqlandi", "✓ Тарифы доставки сохранены", "✓ Delivery tariffs saved"));
      haptic("success");
    } else {
      onToast(L("Xatolik — server javob bermadi", "Ошибка — сервер не ответил", "Error — server unreachable"));
      haptic("error");
    }
    setSaving(false);
  };

  if (loading || !cfg) {
    return <div className="py-10 text-center text-[13px] text-ink2">{L("Yuklanmoqda...", "Загрузка...", "Loading...")}</div>;
  }

  return (
    <div className="space-y-3 animate-pop">
      <div className="rounded-[20px] bg-sagetint/70 border border-moss/20 p-3.5 text-[12px] font-medium text-pine">
        <span className="inline-flex items-start gap-1.5"><IconTruck size={16} className="mt-0.5 shrink-0" /> {L("Har bir viloyat uchun kuryer va BTS narxlarini shu yerda o'zgartiring. O'zgarish darhol mijozlarda ko'rinadi (server + kesh).", "Меняйте цены курьера и BTS для каждого региона здесь. Изменения сразу видны клиентам (сервер + кэш).", "Change courier and BTS prices per region here. Changes apply instantly to customers (server + cache).")}</span>
      </div>

      {/* Free shipping threshold */}
      <div className="rounded-[22px] border border-ink/18 bg-card p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink2">{L("Bepul yetkazish chegarasi", "Порог бесплатной доставки", "Free shipping threshold")}</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="flex-1 rounded-[12px] border border-ink/15 bg-paper px-3 py-2.5 text-[15px] font-bold text-ink outline-none"
          />
          <span className="text-[12px] font-bold text-ink2">so'm</span>
        </div>
        <p className="mt-1.5 text-[11px] text-ink/60">{L("Masalan 150000 — savat 150k dan oshsa yetkazish bepul", "Напр. 150000 — если корзина ≥150k, доставка бесплатно", "E.g. 150000 — cart ≥150k, delivery is free")}</p>
      </div>

      {/* Tariffs table */}
      <div className="rounded-[22px] border border-ink/18 bg-card p-3">
        <div className="grid grid-cols-[1fr_78px_78px] gap-2 px-1 py-1 text-[10px] font-extrabold uppercase tracking-wider text-ink/60">
          <span>{L("Viloyat", "Регион", "Region")}</span>
          <span className="flex items-center justify-center gap-1"><IconTruck size={12} /> {L("Kuryer", "Курьер", "Courier")}</span>
          <span className="flex items-center justify-center gap-1"><IconBox size={12} /> BTS</span>
        </div>
        <div className="mt-1 space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
          {Object.entries(cfg.tariffs).map(([id, t]) => (
            <div key={id} className="grid grid-cols-[1fr_78px_78px] items-center gap-2 rounded-[14px] bg-paper2 px-2 py-1.5">
              <span className="truncate text-[12px] font-bold text-ink">{REGION_LABELS[id] || id}</span>
              <input
                type="number"
                value={String(t.courier)}
                onChange={(e) => updateTariff(id, "courier", e.target.value)}
                className="w-full rounded-[10px] border border-ink/15 bg-paper px-1.5 py-1.5 text-center text-[12px] font-bold text-ink outline-none"
              />
              <input
                type="number"
                value={String(t.bts)}
                onChange={(e) => updateTariff(id, "bts", e.target.value)}
                className="w-full rounded-[10px] border border-ink/15 bg-paper px-1.5 py-1.5 text-center text-[12px] font-bold text-ink outline-none"
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between rounded-[12px] bg-amber/[0.08] px-3 py-2">
          <span className="text-[11px] font-bold text-ink/70">{L("Standart (fallback)", "Стандарт (фолбэк)", "Default (fallback)")}</span>
          <div className="flex gap-2">
            <span className="text-[11px] font-bold text-ink">{cfg.defaultTariff.courier}</span>
            <span className="text-ink/30">/</span>
            <span className="text-[11px] font-bold text-ink">{cfg.defaultTariff.bts}</span>
          </div>
        </div>
      </div>

      <button
        onClick={() => void handleSave()}
        disabled={saving}
        className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-amber text-[13px] font-bold text-white shadow-lift disabled:opacity-50"
      >
        {saving ? <><IconClock size={15} /> {L("Saqlanmoqda...", "Сохранение...", "Saving...")}</> : <><IconCheck size={15} /> {L("Saqlash", "Сохранить", "Save")}</>}
      </button>
      <p className="text-center text-[11px] text-ink/60">{L("Saqlagandan so'ng mijoz ilovani qayta ochganda yangi narxlar ko'rinadi", "После сохранения новые цены появятся у клиентов после перезапуска приложения", "New prices appear for customers after they reopen the app")}</p>
    </div>
  );
}


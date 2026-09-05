/**
 * DELIS API client — connects the Telegram Mini App frontend to the backend.
 * All requests include the Telegram initData token for authentication.
 *
 * Base URL: VITE_API_URL (env) → same-origin by default.
 * If the API is unreachable, calls resolve to null and the app keeps
 * working on locally stored data (offline-first).
 */

import type { Order, Product } from "./data";

/** "/" = same-origin (Vite dev proxy or the single Docker image).
 * Separate static deployments such as GitHub Pages set VITE_API_URL explicitly. */
const configuredBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
/* Docker and Cloudflare use same-origin `/` (Cloudflare's worker proxies API
   paths to Render). Pages sets VITE_API_URL explicitly in its workflow. */
const rawBase = configuredBase || "/";
const BASE: string = rawBase === "/" ? "" : rawBase.replace(/\/+$/, "");
const BROWSER_SESSION_KEY = "delis_browser_session_v1";

function browserSessionToken(): string {
  try { return localStorage.getItem(BROWSER_SESSION_KEY) || ""; } catch { return ""; }
}

function clearBrowserSession(): void {
  try { localStorage.removeItem(BROWSER_SESSION_KEY); } catch {}
}

async function ensureBrowserSession(): Promise<boolean> {
  if (browserSessionToken()) return true;
  try {
    const res = await fetch(`${BASE}/v1/auth/browser-session`, { method: "POST" });
    if (!res.ok) return false;
    const body = await res.json() as { token?: string };
    if (!body.token || body.token.length < 40) return false;
    localStorage.setItem(BROWSER_SESSION_KEY, body.token);
    return true;
  } catch {
    return false;
  }
}

export async function prepareBrowserCheckoutSession(): Promise<boolean> {
  return ensureBrowserSession();
}

/* ─────────── Telegram/browser auth header ─────────── */

export function hasTelegramSession(): boolean {
  try {
    const initData = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } })
      .Telegram?.WebApp?.initData || "";
    if (initData) return true;
  } catch {}
  return Boolean(import.meta.env.DEV && import.meta.env.VITE_DEV_ADMIN_TOKEN);
}

function authHeader(): Record<string, string> {
  try {
    const initData = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } })
      .Telegram?.WebApp?.initData || "";
    if (initData) return { Authorization: `Telegram ${initData}` };
  } catch {}
  /* Local preview / dev testing without Telegram: only active in `vite dev`
     (import.meta.env.DEV is false in production builds) and only when the
     server has DELIS_DEV_ADMIN_TOKEN set to the same value. Never ships. */
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_ADMIN_TOKEN) {
    return { "X-Delis-Dev-Admin": import.meta.env.VITE_DEV_ADMIN_TOKEN };
  }
  const browserToken = browserSessionToken();
  if (browserToken) return { "X-Delis-Browser-Session": browserToken };
  return {};
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    // Content-Type only when a body is actually sent — a JSON content type on
    // plain GETs forces an unnecessary CORS preflight on every request.
    const headers: Record<string, string> = { ...authHeader() };
    if (init?.body) headers["Content-Type"] = "application/json";
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null; // offline / network error
  }
}

export function isApiConfigured(): boolean {
  return rawBase === "/" || Boolean(BASE);
}

export type PaymentAvailability = {
  payme: boolean;
  click: boolean;
  cash: boolean;
  stars: boolean;
};

export async function fetchPaymentAvailability(): Promise<PaymentAvailability | null> {
  return apiFetch<PaymentAvailability>("/v1/payment-methods");
}

/* ─────────── Admin: payment keys (Payme / Click / Stars) ─────────── */

export type PaymentFieldId =
  | "paymeMerchantId"
  | "paymeKey"
  | "clickServiceId"
  | "clickMerchantId"
  | "clickSecret";

export type AdminPaymentField = {
  id: PaymentFieldId;
  /** Secrets are returned masked («••••1234») and are never sent back in full. */
  secret: boolean;
  configured: boolean;
  source: "admin" | "env" | "none";
  value: string;
};

export type AdminPaymentsState = {
  availability: PaymentAvailability;
  fields: AdminPaymentField[];
  webhooks: { payme: string; click: string };
  baseUrl: string;
  botToken: boolean;
  adminChatId: boolean;
  appUrl: string;
};

export type AdminPaymentsCheck = {
  id: string;
  level: "ok" | "warn" | "fail";
  title: string;
  detail: string;
};

export async function fetchAdminPayments(): Promise<AdminPaymentsState | null> {
  return apiFetch<AdminPaymentsState>("/v1/admin/payments");
}

/** Omit a field to keep it, send "" to drop the admin override (back to ENV). */
export async function adminSavePayments(
  patch: Partial<Record<PaymentFieldId, string>>,
): Promise<(AdminPaymentsState & { ok: boolean }) | null> {
  const result = await apiFetch<AdminPaymentsState & { ok: boolean }>("/v1/admin/payments", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  // Same-tab checkout updates immediately. Other tabs and already-open checkout
  // instances are covered by focus/visibility refresh and a short poll.
  if (result && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("delis:payments-updated", { detail: result.availability }));
  }
  return result;
}

export async function adminPaymentsSelfCheck(): Promise<
  { ok: boolean; ready: PaymentAvailability; checks: AdminPaymentsCheck[] } | null
> {
  return apiFetch("/v1/admin/payments/self-check", { method: "POST" });
}

/* ─────────── Managed Home Content ─────────── */

export async function fetchManagedContent<T>(): Promise<T | null> {
  return apiFetch<T>("/v1/content");
}

export async function adminSaveManagedContent<T>(content: T): Promise<{ ok: boolean } | null> {
  return apiFetch("/v1/admin/content", {
    method: "POST",
    body: JSON.stringify(content),
  });
}

export async function adminChannelPost(input: { title: string; text: string }): Promise<{
  ok: boolean; channel?: string; error?: string; hint?: string; status?: number;
}> {
  return rawJson("/v1/admin/channel-post", { method: "POST", body: JSON.stringify(input) });
}

/* ─────────── Site Settings (contacts & socials) ─────────── */

export type SiteSettingsPayload = {
  supportPhone?: string;
  supportPhone2?: string;
  supportEmail?: string;
  supportTg?: string;
  telegram?: string;
  instagram?: string;
  youtube?: string;
};

export async function fetchSiteSettings(): Promise<SiteSettingsPayload | null> {
  return apiFetch<SiteSettingsPayload>("/v1/site-settings");
}

export async function adminSaveSiteSettings(content: SiteSettingsPayload): Promise<{ ok: boolean } | null> {
  return apiFetch("/v1/admin/site-settings", {
    method: "POST",
    body: JSON.stringify(content),
  });
}

/* ─────────── Community Stories ─────────── */

export type ApiStory = {
  id: string;
  tg_id?: number;
  title: string;
  description: string;
  media: string;
  media_kind: "image" | "video";
  role: "admin" | "customer";
  status: "pending" | "approved" | "rejected";
  created_at: string;
  first_name?: string;
  username?: string;
  phone?: string;
};

export async function fetchStories(): Promise<ApiStory[] | null> {
  return apiFetch<ApiStory[]>("/v1/stories");
}

export async function createStory(payload: {
  title: string;
  description: string;
  media: string;
  mediaKind: "image" | "video";
  phone?: string;
}): Promise<{ ok: boolean; id: string; status: string } | null> {
  return apiFetch("/v1/stories", { method: "POST", body: JSON.stringify(payload) });
}

export async function fetchAdminStories(): Promise<ApiStory[] | null> {
  return apiFetch<ApiStory[]>("/v1/admin/stories");
}

export async function adminSetStoryStatus(id: string, status: "pending" | "approved" | "rejected") {
  return apiFetch(`/v1/admin/stories/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export async function adminDeleteStory(id: string) {
  return apiFetch(`/v1/admin/stories/${id}`, { method: "DELETE" });
}

/** A customer deletes their OWN story (owner-only, verified on the server). */
export async function deleteMyStory(id: string) {
  return apiFetch(`/v1/stories/${id}`, { method: "DELETE" });
}

/* ─────────── Products ─────────── */

export async function fetchProducts(lang: "uz" | "ru" | "en", cat?: string): Promise<Product[] | null> {
  const q = cat ? `?cat=${cat}&lang=${lang}` : `?lang=${lang}`;
  return apiFetch<Product[]>(`/v1/products${q}`);
}

export async function fetchProduct(id: string, lang: "uz" | "ru" | "en"): Promise<Product | null> {
  return apiFetch<Product>(`/v1/products/${id}?lang=${lang}`);
}

/* ─────────── User Profile ─────────── */

export type MeResponse = {
  id: number;
  name: string;
  username: string;
  stars: number;
  tier: string;
  language: string;
  isAdmin: boolean;
  welcome?: {
    issued: boolean;
    code?: string;
    percent?: number;
    minSpend?: number;
    maxDiscount?: number;
    expiresAt?: string;
  };
};

export async function fetchMe(): Promise<MeResponse | null> {
  return apiFetch<MeResponse>("/v1/me");
}

export type LoyaltyConfig = {
  starValueUzs: number;
  expirationDays: number;
  expiryWarningDays: number;
  birthdayBonus: number;
  tiers: {
    bronze: { minStars: 0; cashbackPercent: number };
    silver: { minStars: number; cashbackPercent: number };
    gold: { minStars: number; cashbackPercent: number };
  };
};

export type LoyaltyMission = {
  id: string;
  metric: string;
  target: number;
  progress: number;
  reward: number;
  title: string;
  description: string;
  icon: string;
  claimed: boolean;
  claimable: boolean;
};

export type LoyaltyCardResponse = {
  userId: number;
  userName: string;
  cardCode: string;
  level: "bronze" | "silver" | "gold";
  stars: number;
  starValueUzs: number;
  cashbackPercent: number;
  nextLevel: "silver" | "gold" | null;
  nextThreshold: number | null;
  remainingToNext: number;
  progressPercent: number;
  expiring: { amount: number; date: string | null };
  birthday: { configured: boolean; eligible: boolean; claimed: boolean; bonus: number };
  totalEarned: number;
  totalSpent: number;
  history: Array<{
    id: string;
    type: "earn" | "spend";
    source?: string;
    amount: number;
    date: string;
    description: string;
  }>;
  missions: LoyaltyMission[];
};

export async function fetchLoyaltyConfig(): Promise<LoyaltyConfig | null> {
  return apiFetch<LoyaltyConfig>("/v1/loyalty-config");
}

/** Real Stars balance, opaque card number, missions and append-only history. */
export async function fetchLoyaltyCard(lang: "uz" | "ru" | "en"): Promise<LoyaltyCardResponse | null> {
  return apiFetch<LoyaltyCardResponse>(`/v1/me/loyalty?lang=${lang}`);
}

export async function claimLoyaltyMission(id: string, lang: "uz" | "ru" | "en") {
  return rawJson(`/v1/me/loyalty/missions/${encodeURIComponent(id)}/claim?lang=${lang}`, { method: "POST" });
}

export async function claimBirthdayReward() {
  return rawJson("/v1/me/loyalty/birthday/claim", { method: "POST" });
}

export type AdminLoyaltyProfile = LoyaltyCardResponse & {
  customer: {
    code: string;
    tg_id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    phone?: string;
    birthday?: string;
    created_at?: string;
  };
};

export async function adminLookupLoyaltyCard(code: string, lang: "uz" | "ru" | "en") {
  return apiFetch<AdminLoyaltyProfile>(`/v1/admin/loyalty/${encodeURIComponent(code)}?lang=${lang}`);
}

export async function adminSearchLoyaltyMembers(query: string) {
  return apiFetch<{ members: Array<{ tg_id: number; first_name?: string; username?: string; phone?: string; stars: number; tier: string; code: string }> }>(
    `/v1/admin/loyalty/search?q=${encodeURIComponent(query)}`,
  );
}

export async function adminAdjustLoyalty(
  code: string,
  input: { type: "earn" | "spend"; amount: number; reason: string },
) {
  return rawJson(`/v1/admin/loyalty/${encodeURIComponent(code)}/adjust`, {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ ok: boolean; stars?: number; error?: string; profile?: AdminLoyaltyProfile }>;
}

export async function adminRotateLoyaltyCard(code: string) {
  return rawJson(`/v1/admin/loyalty/${encodeURIComponent(code)}/rotate`, { method: "POST" }) as Promise<{
    ok: boolean; code?: string; error?: string; profile?: AdminLoyaltyProfile;
  }>;
}

export async function fetchAdminLoyaltyConfig(): Promise<LoyaltyConfig | null> {
  return apiFetch<LoyaltyConfig>("/v1/admin/loyalty/config");
}

export async function adminSaveLoyaltyConfig(config: LoyaltyConfig) {
  return rawJson("/v1/admin/loyalty/config", { method: "PUT", body: JSON.stringify(config) });
}

export type AdminStarsReward = {
  id: string;
  active: boolean;
  cost: number;
  kind: "percent" | "freeship" | "gift";
  value?: number;
  productId?: string;
  minSpend: number;
  maxDiscount?: number;
  expiresInDays: number;
  titles: { uz: string; ru: string; en: string };
  subtitles: { uz: string; ru: string; en: string };
};

export type RewardEconomics = {
  averageCourierCost: number;
  averageBtsCost: number;
  paymentFeePercent: number;
  targetMarginPercent: number;
  fallbackCostPercent: number;
  profitGuardEnabled: boolean;
};

export type AdminStarsRewardConfig = {
  enabled: boolean;
  rewards: AdminStarsReward[];
  economics: RewardEconomics;
  products: Array<{
    id: string;
    nameUz: string;
    nameRu: string;
    nameEn: string;
    price: number;
    costPrice: number;
    active: number;
  }>;
};

export type RewardAnalytics = {
  issued: number;
  redeemed: number;
  expired: number;
  outstanding: number;
  redemptionRate: number;
  outstandingLiability: number;
  rewardOrders: number;
  rewardRevenue: number;
  averageRewardOrder: number;
  averageRegularOrder: number;
  benefitGranted: number;
  productCost: number;
  fulfillmentCost: number;
  paymentFees: number;
  estimatedProfit: number;
  estimatedMarginPercent: number;
  targetMarginPercent: number;
  costCoveragePercent: number;
  warnings: string[];
  byReward: Array<{
    id: string;
    active: boolean;
    issued: number;
    redeemed: number;
    expired: number;
    outstanding: number;
    liability: number;
    revenue: number;
    benefit: number;
    averageOrder: number;
  }>;
};

export async function fetchAdminStarsRewards(): Promise<AdminStarsRewardConfig | null> {
  return apiFetch<AdminStarsRewardConfig>("/v1/admin/loyalty/rewards");
}

export async function saveAdminStarsRewards(input: {
  enabled: boolean;
  rewards: Array<Pick<AdminStarsReward, "id" | "active" | "cost" | "minSpend" | "maxDiscount" | "expiresInDays" | "productId">>;
  economics: RewardEconomics;
  productCosts: Record<string, number>;
}): Promise<{ ok: boolean; config?: AdminStarsRewardConfig; error?: string }> {
  return rawJson("/v1/admin/loyalty/rewards", { method: "PUT", body: JSON.stringify(input) });
}

export async function fetchRewardAnalytics(): Promise<RewardAnalytics | null> {
  return apiFetch<RewardAnalytics>("/v1/admin/loyalty/rewards/analytics");
}

export type AdminMissionInput = {
  id: string;
  metric: "orders" | "spend" | "daily" | "referrals";
  target: number;
  reward: number;
  title: { uz: string; ru: string; en: string };
  description: { uz: string; ru: string; en: string };
  icon: string;
  active: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
};

export async function fetchAdminLoyaltyMissions() {
  return apiFetch<{ missions: any[] }>("/v1/admin/loyalty/missions");
}

export async function adminSaveLoyaltyMission(mission: AdminMissionInput) {
  return rawJson("/v1/admin/loyalty/missions", { method: "POST", body: JSON.stringify(mission) });
}

export async function adminDeleteLoyaltyMission(id: string) {
  return rawJson(`/v1/admin/loyalty/missions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* ─────────── Favorites ─────────── */

export async function fetchFavorites(): Promise<string[] | null> {
  return apiFetch<string[]>("/v1/me/favorites");
}

export async function toggleFavorite(productId: string): Promise<{ favorited: boolean } | null> {
  return apiFetch<{ favorited: boolean }>(`/v1/me/favorites/${productId}`, { method: "POST" });
}

/* ─────────── Orders ─────────── */

export async function fetchOrders(lang: "uz" | "ru" | "en"): Promise<Order[] | null> {
  return apiFetch<Order[]>(`/v1/me/orders?lang=${lang}`);
}

/** Server-computed order result — the money values here are authoritative. */
export type ServerOrder = {
  order_id: string;
  subtotal: number;
  discount: number;
  /** Amount covered by the gift certificate (0 when none was applied). */
  certApplied?: number;
  deliveryFee: number;
  total: number;
  /** Stars the customer will receive once the order is paid/delivered. */
  expectedStars: number;
  status?: string;
  payment_status?: string;
  /** Hosted Payme/Click checkout URL, or null when the merchant is not configured. */
  payment_url?: string | null;
};

/**
 * Distinguishes the three real outcomes of order submission:
 *  - "ok"      — server accepted the order (totals recomputed server-side)
 *  - "rejected"— server answered with an error (bad promo, unknown product…)
 *  - "offline" — network failure; checkout must keep the cart and retry later
 *
 * Orders are never created only on the client: stock, prices, coupons and
 * certificates must be committed atomically by the server first.
 */
export type CreateOrderResult =
  | { kind: "ok"; order: ServerOrder }
  | { kind: "rejected"; status: number; error?: string }
  | { kind: "offline" };

export async function createOrder(payload: {
  items: { id: string; qty: number; price: number }[];
  delivery: { method: string; zone: string; address: string; time: string; note?: string };
  recipient: { name: string; phone: string };
  payment: { method: string };
  subtotal: number;
  discount: number;
  promoCode?: string;
  /** Gift certificate to redeem with this order (server-validated). */
  certCode?: string;
  deliveryFee: number;
  total: number;
}): Promise<CreateOrderResult> {
  try {
    const browserCheckout = !hasTelegramSession() && payload.payment.method !== "stars";
    if (browserCheckout && !(await ensureBrowserSession())) return { kind: "offline" };

    const send = () => fetch(`${BASE}/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(payload),
    });
    let res = await send();
    // A 30-day browser token may have expired between visits. Rotate it once
    // and retry the exact same authoritative order payload.
    if (browserCheckout && res.status === 401) {
      clearBrowserSession();
      if (await ensureBrowserSession()) res = await send();
    }
    if (res.ok) {
      return { kind: "ok", order: (await res.json()) as ServerOrder };
    }
    const body = await res.json().catch(() => null);
    return { kind: "rejected", status: res.status, error: body?.error };
  } catch {
    return { kind: "offline" };
  }
}

/** Lightweight status poll (owner-only) — used by the payment gateway modal. */
export async function fetchOrderStatus(orderId: string): Promise<{
  id: string;
  status: string;
  paymentStatus: string;
  total: number;
  paymentUrl?: string | null;
} | null> {
  return apiFetch(`/v1/orders/${encodeURIComponent(orderId)}`);
}

/** Courier live position for a shipped order (owner or admin). */
export async function fetchOrderTracking(orderId: string): Promise<{
  active: boolean;
  lat?: number;
  lon?: number;
  updatedMs?: number;
  liveUntilMs?: number;
  staleSec?: number;
} | null> {
  return apiFetch(`/v1/orders/${encodeURIComponent(orderId)}/track`);
}

/** Attach referrer when the app was opened via a shared ?start=ref_<id> link. */
export async function attachReferral(referrerId: number): Promise<{ ok: boolean; attached: boolean } | null> {
  return apiFetch("/v1/me/referral/attach", {
    method: "POST",
    body: JSON.stringify({ referrerId }),
  });
}

/** Admin: download the full DB backup as JSON — all tables (sqlite_master). */
export async function downloadAdminBackup(): Promise<Blob | null> {
  try {
    const res = await fetch(`${BASE}/v1/admin/backup`, { headers: { ...authHeader() } });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** Admin: download the full orders export as CSV text. */
export async function fetchOrdersCsv(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/v1/admin/orders.csv`, { headers: { ...authHeader() } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function createStarsInvoice(orderId: string): Promise<{
  invoiceUrl: string;
  stars: number;
  orderId: string;
} | null> {
  // Amount is taken from the order in the DB on the server.
  return apiFetch("/v1/payments/stars", {
    method: "POST",
    body: JSON.stringify({ orderId }),
  });
}

/* ─────────── Admin Secured Actions ─────────── */

/** Result of an admin catalog mutation. `offline` distinguishes a network
 *  failure from an actual server rejection, so the admin panel can surface
 *  the real reason and never leave a phantom product in the local catalog
 *  (a product that appears in the UI but cannot be ordered because the
 *  server never saved it). */
export type AdminSaveOutcome =
  | { ok: true; id?: string; img?: string; gallery?: string[] }
  | { ok: false; offline: boolean; status?: number; error?: string };

export async function adminAddProduct(product: Product): Promise<AdminSaveOutcome> {
  try {
    const res = await fetch(`${BASE}/v1/admin/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(product),
    });
    const body = await res.json().catch(() => null) as { id?: string; img?: string; gallery?: string[]; error?: string } | null;
    if (res.ok) return { ok: true, id: body?.id, img: body?.img, gallery: body?.gallery };
    return { ok: false, offline: false, status: res.status, error: body?.error };
  } catch {
    return { ok: false, offline: true };
  }
}

export async function adminUpdateProduct(productId: string, patch: Partial<Product>): Promise<AdminSaveOutcome> {
  try {
    const res = await fetch(`${BASE}/v1/admin/products/${encodeURIComponent(productId)}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(patch),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null) as { error?: string } | null;
    return { ok: false, offline: false, status: res.status, error: body?.error };
  } catch {
    return { ok: false, offline: true };
  }
}

/** Upload a product photo (already compressed data URL). Returns the final image URL. */
export async function adminUploadProductImage(
  productId: string,
  dataUrl: string,
): Promise<{ ok: boolean; img: string; stored: "supabase" | "db" } | null> {
  return apiFetch(`/v1/admin/products/${encodeURIComponent(productId)}/image`, {
    method: "POST",
    body: JSON.stringify({ dataUrl }),
  });
}

/** Upload one extra gallery photo (cover stays unchanged). Returns the final image URL. */
export async function adminUploadProductGalleryImage(
  productId: string,
  dataUrl: string,
): Promise<{ ok: boolean; img: string; stored: "supabase" | "db" } | null> {
  return apiFetch(`/v1/admin/products/${encodeURIComponent(productId)}/gallery-image`, {
    method: "POST",
    body: JSON.stringify({ dataUrl }),
  });
}

export async function repeatOrder(orderId: string): Promise<{ items: { id: string; qty: number; price: number }[] } | null> {
  return apiFetch(`/v1/orders/${orderId}/repeat`, { method: "POST" });
}

/* ─────────── Promo Codes ─────────── */

export async function validatePromo(code: string, lang: "uz" | "ru" | "en"): Promise<{
  valid: boolean;
  code?: string;
  type?: string;
  value?: number;
  minSpend?: number;
  maxDiscount?: number | null;
  requiredProductId?: string | null;
  retailOnly?: boolean;
  title?: string;
} | null> {
  return apiFetch(`/v1/promo/validate?code=${encodeURIComponent(code)}&lang=${lang}`);
}

export type ApiPromo = {
  code: string;
  type: "percent" | "fixed" | "freeship" | string;
  value: number;
  minSpend: number;
  maxDiscount?: number | null;
  required_product_id?: string | null;
  title_uz: string | null;
  title_ru: string | null;
  title_en: string | null;
  active: number;
};

/** List of ACTIVE promos — used to hydrate the client's local catalog copy. */
export async function fetchPromos(): Promise<ApiPromo[] | null> {
  return apiFetch<ApiPromo[]>("/v1/promos");
}

export async function fetchAdminPromos(): Promise<ApiPromo[] | null> {
  return apiFetch<ApiPromo[]>("/v1/admin/promos");
}

export async function adminUpsertPromo(promo: {
  code: string;
  type: "percent" | "fixed" | "freeship";
  value: number;
  minSpend?: number;
  maxDiscount?: number;
  requiredProductId?: string | null;
  active?: boolean;
  titles?: { uz?: string; ru?: string; en?: string };
}): Promise<{ ok: boolean; code: string } | null> {
  return apiFetch("/v1/admin/promos", { method: "POST", body: JSON.stringify(promo) });
}

export async function adminDeletePromo(code: string): Promise<{ ok: boolean } | null> {
  return apiFetch(`/v1/admin/promos/${encodeURIComponent(code)}`, { method: "DELETE" });
}

/* ─────────── Daily Reward ─────────── */

export async function getDailyStatus(): Promise<{ claimed: boolean; today: string } | null> {
  return apiFetch("/v1/me/daily");
}

export async function claimDaily(): Promise<{ amount: number; today: string; stars: number } | null> {
  return apiFetch("/v1/me/daily/claim", { method: "POST" });
}

/* ─────────── Abandoned cart (bot reminder after 2h) ─────────── */

export async function postAbandonedCart(payload: {
  items: { id: string; qty: number; name?: string; price?: number }[];
  totalItems: number;
  totalValue: number;
  language: string;
}): Promise<{ ok: boolean } | null> {
  return apiFetch("/v1/abandoned-cart", { method: "POST", body: JSON.stringify(payload) });
}

/* ─────────── Addresses ─────────── */

export type ApiAddress = {
  id: string;
  label: string;
  region_id: string;
  district: string;
  street: string;
  apartment?: string;
  phone?: string;
  is_default: number;
};

export async function fetchAddresses(): Promise<ApiAddress[] | null> {
  return apiFetch<ApiAddress[]>("/v1/me/addresses");
}

export async function saveAddress(address: {
  id?: string;
  label: string;
  regionId: string;
  district: string;
  street: string;
  apartment?: string;
  phone: string;
  isDefault?: boolean;
}): Promise<{ id: string } | null> {
  const path = address.id ? `/v1/me/addresses/${encodeURIComponent(address.id)}` : "/v1/me/addresses";
  return apiFetch(path, {
    method: address.id ? "PUT" : "POST",
    body: JSON.stringify(address),
  });
}

export async function deleteAddress(id: string): Promise<{ ok: boolean } | null> {
  return apiFetch(`/v1/me/addresses/${id}`, { method: "DELETE" });
}

/* ─────────── Returns ─────────── */

export type ApiReturnRequest = {
  id: string;
  orderId: string;
  itemId: string;
  itemName: string;
  itemImg: string;
  reason: string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
};

export async function fetchReturns(): Promise<ApiReturnRequest[] | null> {
  return apiFetch<ApiReturnRequest[]>("/v1/me/returns");
}

export async function createReturnRequest(input: {
  orderId: string;
  productId: string;
  reason: string;
  note?: string;
}): Promise<ApiReturnRequest | null> {
  return apiFetch<ApiReturnRequest>("/v1/me/returns", { method: "POST", body: JSON.stringify(input) });
}

export async function fetchAdminReturns(): Promise<ApiReturnRequest[] | null> {
  return apiFetch<ApiReturnRequest[]>("/v1/admin/returns");
}

export async function adminSetReturnStatus(id: string, status: "approved" | "rejected") {
  return apiFetch<{ ok: boolean; id: string; status: "approved" | "rejected" }>(`/v1/admin/returns/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

/* ─────────── Support chat ─────────── */

export type SupportMessage = { id: string; from: "user" | "manager"; text: string; time: number };

export async function fetchSupportMessages(): Promise<SupportMessage[] | null> {
  return apiFetch<SupportMessage[]>("/v1/me/chat");
}

export async function postSupportMessage(text: string): Promise<{ id: string; deliveredToAdmin: boolean; time: number } | null> {
  return apiFetch("/v1/me/chat", { method: "POST", body: JSON.stringify({ text }) });
}

/* ─────────── Reviews ─────────── */

export async function fetchReviews(productId: string): Promise<any[] | null> {
  return apiFetch(`/v1/products/${productId}/reviews`);
}

export async function postReview(productId: string, rating: number, comment: string): Promise<{ ok: boolean; reviewId: number; starsAwarded: number; stars: number } | null> {
  return apiFetch(`/v1/products/${productId}/reviews`, {
    method: "POST",
    body: JSON.stringify({ rating, comment }),
  });
}

/* ─────────── Price formatting utility ─────────── */

export function formatPriceUZS(n: number, lang: "uz" | "ru" | "en"): string {
  const grouped = n.toLocaleString(lang === "en" ? "en-US" : "ru-RU").replace(/,/g, lang === "en" ? "," : " ");
  if (lang === "uz") return `${grouped} so'm`;
  if (lang === "ru") return `${grouped} сум`;
  return `${grouped} UZS`;
}

/* ─────────── Subscriptions ─────────── */

export type ApiSubscription = {
  id: string;
  product_id: string;
  qty: number;
  frequency: number;
  status: string;
  next_date: string;
};

export async function createSubscription(payload: {
  productId: string;
  qty: number;
  frequency: number;
}): Promise<{ id: string; status: string; next_date: string } | null> {
  return apiFetch("/v1/me/subscriptions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchSubscriptions(): Promise<ApiSubscription[] | null> {
  return apiFetch("/v1/me/subscriptions");
}

export async function deleteSubscription(id: string): Promise<{ ok: boolean } | null> {
  return apiFetch(`/v1/me/subscriptions/${id}`, { method: "DELETE" });
}

/** Save the customer's birthday (MM-DD) — the bot sends a gift promo on that day. */
export async function saveBirthdayRemote(birthday: string): Promise<{ ok: boolean } | null> {
  return apiFetch("/v1/me/birthday", {
    method: "POST",
    body: JSON.stringify({ birthday }),
  });
}

/* ─────────── Admin orders (server-side) ─────────── */

export async function fetchAdminOrders(): Promise<Order[] | null> {
  return apiFetch<Order[]>("/v1/admin/orders?lang=ru");
}

export async function adminSetOrderStatus(orderId: string, status: string): Promise<{ ok: boolean; status: string } | null> {
  return apiFetch("/v1/admin/orders/:id/status".replace(":id", encodeURIComponent(orderId)), {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export async function adminSetPaymentStatus(orderId: string, paymentStatus: "pending" | "paid" | "cod"): Promise<{ ok: boolean; paymentStatus: string } | null> {
  return apiFetch(`/v1/admin/orders/${encodeURIComponent(orderId)}/payment`, {
    method: "POST",
    body: JSON.stringify({ paymentStatus }),
  });
}

/* ─────────── Referral program ─────────── */

export type ReferralInfo = {
  code: string;
  link: string;
  invitees: number;
  bonusStars: number;
  bonusEarned: boolean;
  invitedBy: number | null;
};

export async function fetchReferral(): Promise<ReferralInfo | null> {
  return apiFetch<ReferralInfo>("/v1/me/referral");
}

/* ─────────── QR authenticity ─────────── */

export type QrInfo = {
  valid: boolean;
  code: string;
  productId: string;
  productName: string;
  img: string | null;
  volume: string | null;
  producedAt: string;
  batchNo: number;
};

export async function fetchQrInfo(code: string): Promise<QrInfo | null> {
  return apiFetch<QrInfo>(`/v1/qr/${encodeURIComponent(code)}`);
}

/** True when Telegram's native QR popup can actually scan (Bot API 6.4+,
    inside a real Telegram client). The telegram-web-app.js script defines
    stub methods even on desktop browsers — webcam there never works through
    the popup — so require a real session (initData) + version. When false,
    fall back to the in-app getUserMedia scanner. */
export function hasNativeQrScanner(): boolean {
  try {
    const wa = (window as unknown as {
      Telegram?: { WebApp?: {
        initData?: string;
        version?: string;
        showScanQrPopup?: unknown;
        isVersionAtLeast?: (v: string) => boolean;
      } };
    }).Telegram?.WebApp;
    if (!wa || typeof wa.showScanQrPopup !== "function") return false;
    if (!wa.initData) return false; // plain browser / preview — no Telegram session
    if (typeof wa.isVersionAtLeast === "function") return wa.isVersionAtLeast("6.4");
    return true;
  } catch {
    return false;
  }
}

/** Open Telegram's NATIVE camera QR scanner (Bot API 6.4+). Returns the
    decoded text or null when cancelled/unsupported. */
export function scanQrNative(prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const wa = (window as unknown as {
        Telegram?: { WebApp?: {
          showScanQrPopup?: (p: { text?: string }, cb: (text: string) => boolean | void) => void;
          closeScanQrPopup?: () => void;
        } };
      }).Telegram?.WebApp;
      if (!wa?.showScanQrPopup) return resolve(null);
      let settled = false;
      wa.showScanQrPopup({ text: prompt }, (text) => {
        if (settled) return true;
        settled = true;
        resolve(text || null);
        return true; // true = close the popup
      });
      // Safety: if the user closes the popup without scanning, resolve null
      setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, 120_000);
    } catch {
      resolve(null);
    }
  });
}

/* ─────────── QR batches — admin ─────────── */

export type QrBatchRow = {
  code: string;
  product_id: string;
  produced_at: string;
  batch_no: number;
  name_uz?: string | null;
  name_ru?: string | null;
  name_en?: string | null;
  img?: string | null;
};

/** null = request failed (offline / 403) — lets the UI show a warning
    instead of a misleading "no codes yet". */
export async function fetchAdminQrBatches(): Promise<QrBatchRow[] | null> {
  const r = await apiFetch<{ batches: QrBatchRow[] }>("/v1/admin/qr-batches");
  return r ? r.batches : null;
}

export async function adminCreateQrBatch(input: {
  code?: string; productId: string; producedAt: string; batchNo: number;
}): Promise<{ ok: boolean; code?: string; error?: string; status?: number; details?: unknown }> {
  return rawJson("/v1/admin/qr-batches", { method: "POST", body: JSON.stringify(input) });
}

export async function adminUpdateQrBatch(code: string, patch: {
  productId?: string; producedAt?: string; batchNo?: number;
}): Promise<{ ok: boolean; error?: string }> {
  return rawJson(`/v1/admin/qr-batches/${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function adminDeleteQrBatch(code: string): Promise<{ ok: boolean; error?: string }> {
  return rawJson(`/v1/admin/qr-batches/${encodeURIComponent(code)}`, { method: "DELETE" });
}

/* ─────────── Wholesale tiers (B2B ladder) ─────────── */

export type WholesaleTier = { minQty: number; percent: number };

export async function fetchWholesaleTiers(): Promise<WholesaleTier[]> {
  const r = await apiFetch<{ tiers: { min_qty: number; percent: number }[] }>("/v1/wholesale-tiers");
  return (r?.tiers ?? []).map((t) => ({ minQty: Number(t.min_qty), percent: Number(t.percent) }));
}

export async function adminPutWholesaleTiers(tiers: WholesaleTier[]): Promise<{ ok: boolean; error?: string }> {
  return rawJson("/v1/admin/wholesale-tiers", { method: "PUT", body: JSON.stringify({ tiers }) });
}

/* ─────────── B2B access codes ─────────── */

export async function verifyB2bCode(code: string): Promise<{ ok: boolean; label?: string }> {
  const r = await rawJson("/v1/b2b/verify", { method: "POST", body: JSON.stringify({ code }) });
  return { ok: Boolean(r?.ok), label: r?.label };
}

export type B2bCodeRow = { code: string; label: string | null; active: number; created_at: string };

export async function fetchAdminB2bCodes(): Promise<B2bCodeRow[]> {
  const r = await apiFetch<{ codes: B2bCodeRow[] }>("/v1/admin/b2b-codes");
  return r?.codes ?? [];
}

export async function adminCreateB2bCode(code?: string, label?: string): Promise<{ ok: boolean; code?: string; error?: string }> {
  return rawJson("/v1/admin/b2b-codes", { method: "POST", body: JSON.stringify({ code, label }) });
}

export async function adminDeleteB2bCode(code: string): Promise<{ ok: boolean; error?: string }> {
  return rawJson(`/v1/admin/b2b-codes/${encodeURIComponent(code)}`, { method: "DELETE" });
}

/* ─────────── Gift certificates ─────────── */

export type CertificateRow = {
  code: string;
  amount: number;
  from_name: string | null;
  to_name: string | null;
  message: string | null;
  status: "pending" | "active" | "redeemed" | "revoked";
  created_at: string;
  order_id?: string | null;
};

/** Like apiFetch but returns the parsed error body too (we need 409/404 reasons). */
async function rawJson(path: string, init?: RequestInit): Promise<any> {
  try {
    const headers: Record<string, string> = { ...authHeader() };
    if (init?.body) headers["Content-Type"] = "application/json";
    const res = await fetch(`${BASE}${path}`, { ...init, headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, ...(body || {}) };
    return body;
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function createCertificate(input: {
  amount: number; to?: string; from?: string; message?: string;
}): Promise<{ ok: boolean; code?: string; error?: string }> {
  return rawJson("/v1/certificates", { method: "POST", body: JSON.stringify(input) });
}

export async function fetchMyCertificates(): Promise<CertificateRow[]> {
  const r = await apiFetch<{ certificates: CertificateRow[] }>("/v1/me/certificates");
  return r?.certificates ?? [];
}

export async function checkCertificate(code: string): Promise<{ ok: boolean; amount?: number; status?: string; error?: string }> {
  return rawJson("/v1/certificates/check", { method: "POST", body: JSON.stringify({ code }) });
}

export async function fetchAdminCertificates(): Promise<CertificateRow[]> {
  const r = await apiFetch<{ certificates: CertificateRow[] }>("/v1/admin/certificates");
  return r?.certificates ?? [];
}

export async function adminIssueCertificate(amount: number, to?: string, message?: string): Promise<{ ok: boolean; code?: string; error?: string }> {
  return rawJson("/v1/admin/certificates", { method: "POST", body: JSON.stringify({ amount, to, message }) });
}

export async function adminCertificateAction(code: string, action: "activate" | "revoke"): Promise<{ ok: boolean; error?: string }> {
  return rawJson(`/v1/admin/certificates/${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify({ action }) });
}

/* ─────────── Stars shop (server-authoritative catalog + redemption) ─────────── */

export type ApiStarsReward = {
  id: string;
  cost: number;
  kind: "percent" | "freeship" | "gift";
  value?: number;
  productId?: string;
  minSpend: number;
  maxDiscount?: number | null;
  expiresInDays: number;
  retailOnly: boolean;
  titles: { uz: string; ru: string; en: string };
  subtitles: { uz: string; ru: string; en: string };
};

export async function fetchStarsRewards(): Promise<ApiStarsReward[] | null> {
  return apiFetch<ApiStarsReward[]>("/v1/stars/rewards");
}

export type RedeemStarsResult = {
  ok: boolean;
  code: string;
  rewardId: string;
  stars: number;
  type: "percent" | "fixed" | "freeship";
  value: number;
  minSpend: number;
  maxDiscount: number | null;
  requiredProductId: string | null;
  retailOnly: boolean;
  titles: { uz: string; ru: string; en: string };
  subtitles: { uz: string; ru: string; en: string };
  expiresInDays: number;
};

/** Redeem a stars reward. Returns null ONLY on network failure —
 *  HTTP errors (402 insufficient etc.) are parsed and returned. */
export async function redeemStarsReward(
  rewardId: string,
): Promise<RedeemStarsResult | { ok: false; error: string; stars?: number } | null> {
  try {
    const res = await fetch(`${BASE}/v1/stars/redeem`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ rewardId }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: body?.error || `http_${res.status}`, stars: body?.stars };
    return body as RedeemStarsResult;
  } catch {
    return null; // offline / network error
  }
}

/* ─────────── Waitlist (back-in-stock) ─────────── */

export async function joinWaitlist(payload: {
  productId: string;
  qty: number;
  phone?: string;
  language: "uz" | "ru" | "en";
}): Promise<{ ok: boolean; productId: string } | null> {
  return apiFetch("/v1/waitlist", { method: "POST", body: JSON.stringify(payload) });
}

export type MyWaitlistEntry = {
  productId: string;
  qty: number;
  notified: boolean;
  createdAt: string;
  name: { uz: string; ru: string; en: string };
  price: number;
  inStock: boolean;
};

export async function fetchMyWaitlist(): Promise<MyWaitlistEntry[] | null> {
  return apiFetch<MyWaitlistEntry[]>("/v1/me/waitlist");
}

export async function leaveWaitlist(productId: string): Promise<{ ok: boolean } | null> {
  return apiFetch(`/v1/me/waitlist/${encodeURIComponent(productId)}`, { method: "DELETE" });
}

export type AdminWaitlistEntry = {
  id: number;
  tgId: number;
  productId: string;
  qty: number;
  phone: string | null;
  notified: boolean;
  createdAt: string;
  productName: { uz: string; ru: string; en: string };
  customer: string | null;
};

export async function fetchAdminWaitlist(): Promise<AdminWaitlistEntry[] | null> {
  return apiFetch<AdminWaitlistEntry[]>("/v1/admin/waitlist");
}

export async function adminNotifyWaitlist(productId: string): Promise<{ ok: boolean; notified: number } | null> {
  return apiFetch("/v1/admin/waitlist/notify", { method: "POST", body: JSON.stringify({ productId }) });
}

/* ─────────── Delivery config (tariffs + free-shipping threshold) ─────────── */
export type DeliveryConfig = {
  freeShippingThreshold: number;
  tariffs: Record<string, { courier: number; bts: number; days: [number, number] }>;
  defaultTariff: { courier: number; bts: number; days: [number, number] };
};

export async function fetchDeliveryConfig(): Promise<DeliveryConfig | null> {
  return apiFetch<DeliveryConfig>("/v1/delivery-config");
}

export async function fetchAdminDeliveryConfig(): Promise<DeliveryConfig | null> {
  return apiFetch<DeliveryConfig>("/v1/admin/delivery-config");
}

export async function adminPutDeliveryConfig(cfg: DeliveryConfig): Promise<{ ok: boolean } | null> {
  return apiFetch("/v1/admin/delivery-config", { method: "PUT", body: JSON.stringify(cfg) });
}

/* ─────────── Admin dashboard stats ─────────── */

export type AdminStats = {
  totals: {
    ordersCount: number;
    revenueAll: number;
    avgOrderValue: number;
    usersCount: number;
    repeatCustomers: number;
    pendingWaitlist: number;
    activeSubscriptions: number;
  };
  byStatus: Record<string, number>;
  byPayment: Record<string, number>;
  revenueByDay: { date: string; revenue: number; orders: number }[];
  compare?: { last30: number; prev30: number; revenueDeltaPct: number | null };
  topProducts: { id: string; name: string; qty: number; revenue: number }[];
};

export async function fetchAdminStats(): Promise<AdminStats | null> {
  return apiFetch<AdminStats>("/v1/admin/stats");
}

export async function adminSendBroadcast(input: {
  kind: "promo" | "product" | "system";
  title: string;
  body: string;
}): Promise<{ ok: boolean; queued?: boolean; attempted: number; sent: number; failed: number } | null> {
  return apiFetch("/v1/admin/broadcast", { method: "POST", body: JSON.stringify(input) });
}

export type TranslateLang = "uz" | "ru" | "en";

/** Server-side translation via GPT (or graceful no-op fallback when
 *  OPENAI_API_KEY is not set on the server). Returns the original text for
 *  any locale the server failed to translate. */
export async function adminTranslate(input: {
  text: string;
  from: TranslateLang;
  to: TranslateLang[];
}): Promise<{ ok: boolean; hasKey: boolean; translations: Record<string, string> } | null> {
  return apiFetch("/v1/admin/translate", { method: "POST", body: JSON.stringify(input) });
}

/** Lightweight health check used by the admin panel to surface whether the
 *  Supabase auto-backup is wired in (env vars present on the server). */
export async function fetchBackupStatus(): Promise<{ ok: boolean; supabase: boolean; gpt: boolean } | null> {
  return apiFetch("/v1/admin/status");
}

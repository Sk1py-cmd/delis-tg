/**
 * DELIS — pure order-pricing logic.
 *
 * Lives outside of index.ts so it can be unit-tested without a database.
 * The HTTP layer injects DB lookups (getProduct / getPromo) — the math itself
 * stays pure and deterministic.
 *
 * RULE: prices, discounts and totals are always computed here, on the server,
 * from database values. Nothing coming from the client is ever trusted.
 */

export type OrderLineInput = { id: string; qty: number };

export type ProductPricingInfo = {
  id: string;
  price: number;
  active: number;
  stock: number;
};

export type PromoPricingInfo = {
  code: string;
  type: "percent" | "fixed" | "freeship" | string;
  value: number;
  min_spend: number;
  /** Optional cap for percent discounts or the delivery credit. */
  max_discount?: number | null;
  /** Gift coupon must contain this SKU; one unit's price is discounted. */
  required_product_id?: string | null;
} | null;

export type ComputedTotals = {
  /** Lines with authoritative per-unit prices (with wholesale discount). */
  lines: { id: string; qty: number; price: number }[];
  subtotal: number;
  discount: number;
  freeship: boolean;
  deliveryFee: number;
  /** Part of the goods total covered by a gift certificate (0 when none). */
  certApplied: number;
  /** Goods discount + delivery credit attributable to the promo code. */
  promoBenefit: number;
  total: number;
};

export type PricingError = {
  error: "unknown_product" | "inactive_product" | "insufficient_stock" | "invalid_promo" | "promo_min_spend" | "promo_required_product";
  product?: string;
  available?: number;
  minSpend?: number;
};

/** Default wholesale ladder — used to SEED the wholesale_tiers table and as
    a fallback when the caller passes none. Mirrors src/data.ts WHOLESALE_TIERS. */
export const WHOLESALE_TIERS: [minQty: number, percent: number][] = [
  [6, 12],
  [12, 20],
  [24, 28],
  [48, 35],
];

export function wholesaleUnit(
  retail: number,
  qty: number,
  tiers: readonly [number, number][] = WHOLESALE_TIERS,
): number {
  let discount = 0;
  for (const [minQty, percent] of tiers) {
    if (qty >= minQty) discount = percent;
  }
  return Math.round((retail * (100 - discount)) / 1000) * 10;
}

/**
 * Compute the authoritative order totals.
 * Returns ComputedTotals on success or a PricingError.
 */
export function computeTotals(opts: {
  items: OrderLineInput[];
  getProduct: (id: string) => ProductPricingInfo | undefined;
  promoCode?: string;
  getPromo: (code: string) => PromoPricingInfo;
  deliveryMethod: string;
  /** Client's fee hint — accepted only bounded, never trusted blindly. */
  deliveryFeeHint?: number;
  freeShippingThreshold?: number;
  /** Hard cap for the client fee hint. */
  maxDeliveryFee?: number;
  /** Wholesale ladder from the DB (admin-editable). Defaults to WHOLESALE_TIERS. */
  wholesaleTiers?: readonly [number, number][];
  /** Face value of a pre-validated ACTIVE gift certificate (UZS). 0 = none. */
  certificateAmount?: number;
  /** Optional seller-safe cart threshold offer; never stacks with promo or wholesale. */
  cartNudge?: { threshold: number; percent: number; maxDiscount: number };
}): { ok: true; totals: ComputedTotals } | { ok: false; err: PricingError } {
  const FREE_SHIPPING = opts.freeShippingThreshold ?? 150_000;
  const MAX_FEE = opts.maxDeliveryFee ?? 100_000;
  const tiers = opts.wholesaleTiers ?? WHOLESALE_TIERS;

  /* ── Lines: price per unit ALWAYS from the products table ── */
  const lines: ComputedTotals["lines"] = [];
  for (const it of opts.items) {
    const p = opts.getProduct(it.id);
    if (!p) return { ok: false, err: { error: "unknown_product", product: it.id } };
    if (!p.active) return { ok: false, err: { error: "inactive_product", product: it.id } };
    // stock = 0 means "made to order" (can always be bought);
    // stock > 0 is a real warehouse balance that caps the quantity.
    if (p.stock > 0 && it.qty > p.stock) {
      return { ok: false, err: { error: "insufficient_stock", product: it.id, available: p.stock } };
    }
    lines.push({ id: it.id, qty: it.qty, price: wholesaleUnit(p.price, it.qty, tiers) });
  }
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);

  /* ── Promo: validated against the promo_codes table ── */
  let discount = 0;
  let freeship = false;
  let promoMaxDiscount = 0;
  const promoCode = opts.promoCode?.toUpperCase().trim();
  if (promoCode) {
    const promo = opts.getPromo(promoCode);
    if (!promo) return { ok: false, err: { error: "invalid_promo" } };
    if (subtotal < (promo.min_spend || 0)) {
      return { ok: false, err: { error: "promo_min_spend", minSpend: promo.min_spend } };
    }
    if (promo.required_product_id && !lines.some((line) => line.id === promo.required_product_id)) {
      return { ok: false, err: { error: "promo_required_product", product: promo.required_product_id } };
    }
    promoMaxDiscount = Number(promo.max_discount || 0);
    if (promo.type === "percent") {
      const rawDiscount = Math.floor((subtotal * promo.value) / 100);
      discount = promoMaxDiscount > 0 ? Math.min(rawDiscount, promoMaxDiscount) : rawDiscount;
    } else if (promo.type === "fixed") {
      discount = Math.min(promo.value, subtotal);
    } else if (promo.type === "freeship") {
      freeship = true;
    }
  }

  /* A cart nudge is deliberately exclusive: it cannot reduce wholesale or
     stack with a code. This keeps the offer profitable for the seller. */
  if (!promoCode && opts.cartNudge && !lines.some((line) => line.qty >= tiers[0]?.[0])) {
    const offer = opts.cartNudge;
    if (subtotal >= offer.threshold) {
      discount = Math.min(Math.floor(subtotal * offer.percent / 100), offer.maxDiscount);
    }
  }

  /* ── Gift certificate: covers the goods part AFTER the promo, never the
        delivery fee. Validity (exists / active / not redeemed) is the
        caller's job — here we only bound the amount. ── */
  const goodsAfterPromo = Math.max(0, subtotal - discount);
  const certApplied = Math.min(Math.max(opts.certificateAmount ?? 0, 0), goodsAfterPromo);

  /* ── Delivery fee: recomputed server-side (client hint accepted only capped).
        A capped freeship reward acts as a delivery credit instead of creating
        unlimited liability on expensive regions. Legacy freeship promos with
        no cap still waive the full fee. ── */
  let deliveryFee = 0;
  let deliveryCredit = 0;
  if (opts.deliveryMethod !== "pickup" && goodsAfterPromo < FREE_SHIPPING) {
    const rawDeliveryFee = Math.min(Math.max(opts.deliveryFeeHint ?? 0, 0), MAX_FEE);
    if (freeship) {
      const shippingCredit = promoMaxDiscount > 0 ? promoMaxDiscount : rawDeliveryFee;
      deliveryFee = Math.max(0, rawDeliveryFee - shippingCredit);
      deliveryCredit = rawDeliveryFee - deliveryFee;
    } else {
      deliveryFee = rawDeliveryFee;
    }
  }

  const promoBenefit = discount + deliveryCredit;
  const total = Math.max(0, goodsAfterPromo - certApplied) + deliveryFee;
  return { ok: true, totals: { lines, subtotal, discount, freeship, deliveryFee, certApplied, promoBenefit, total } };
}

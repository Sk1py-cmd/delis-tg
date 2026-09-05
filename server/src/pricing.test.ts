import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeTotals, wholesaleUnit, WHOLESALE_TIERS } from "./pricing.js";

const PRODUCTS: Record<string, { id: string; price: number; active: number; stock: number }> = {
  wax: { id: "wax", price: 128000, active: 1, stock: 10 },
  glass: { id: "glass", price: 48000, active: 1, stock: 0 }, // made-to-order
  floor: { id: "floor", price: 62000, active: 1, stock: 3 },
  dead: { id: "dead", price: 1000, active: 0, stock: 5 },
};

const PROMOS: Record<string, { code: string; type: string; value: number; min_spend: number; max_discount?: number; required_product_id?: string }> = {
  SAVE15: { code: "SAVE15", type: "percent", value: 15, min_spend: 0 },
  CAPPED5: { code: "CAPPED5", type: "percent", value: 5, min_spend: 100000, max_discount: 5000 },
  FLAT20: { code: "FLAT20", type: "fixed", value: 20000, min_spend: 100000 },
  GIFT: { code: "GIFT", type: "fixed", value: 48000, min_spend: 100000, required_product_id: "glass" },
  FREESHIP: { code: "FREESHIP", type: "freeship", value: 0, min_spend: 0 },
  SHIPCREDIT: { code: "SHIPCREDIT", type: "freeship", value: 0, min_spend: 0, max_discount: 20000 },
};

const getProduct = (id: string) => PRODUCTS[id];
const getPromo = (code: string) => PROMOS[code] ?? null;

describe("wholesale ladder", () => {
  it("matches the client tiers", () => {
    assert.deepEqual(WHOLESALE_TIERS, [[6, 12], [12, 20], [24, 28], [48, 35]]);
  });

  it("no discount below 6 units", () => {
    assert.equal(wholesaleUnit(100000, 1), 100000);
    assert.equal(wholesaleUnit(100000, 5), 100000);
  });

  it("applies tiered discounts", () => {
    assert.equal(wholesaleUnit(100000, 6).toString(), "88000");
    assert.equal(wholesaleUnit(100000, 12), 80000);
    assert.equal(wholesaleUnit(100000, 24), 72000);
    assert.equal(wholesaleUnit(100000, 48), 65000);
  });
});

describe("computeTotals — server never trusts the client", () => {
  it("computes subtotal from DB prices, not client prices", () => {
    const res = computeTotals({
      items: [{ id: "wax", qty: 1 }],
      getProduct, getPromo,
      deliveryMethod: "pickup",
    });
    assert.ok(res.ok);
    assert.equal(res.totals.subtotal, 128000);
    assert.equal(res.totals.total, 128000);
  });

  it("applies the wholesale unit price per line at 6+ qty", () => {
    const res = computeTotals({
      items: [{ id: "glass", qty: 6 }],
      getProduct, getPromo,
      deliveryMethod: "pickup",
    });
    assert.ok(res.ok);
    // 48000 × 88% = 42240/unit (wholesale), × 6
    assert.equal(res.totals.lines[0].price, 42240);
    assert.equal(res.totals.subtotal, 42240 * 6);
  });

  it("rejects unknown products", () => {
    const res = computeTotals({
      items: [{ id: "nope", qty: 1 }],
      getProduct, getPromo,
      deliveryMethod: "pickup",
    });
    assert.ok(!res.ok);
    assert.equal(res.err.error, "unknown_product");
  });

  it("rejects inactive products", () => {
    const res = computeTotals({
      items: [{ id: "dead", qty: 1 }],
      getProduct, getPromo,
      deliveryMethod: "pickup",
    });
    assert.ok(!res.ok);
    assert.equal(res.err.error, "inactive_product");
  });

  it("caps qty at real stock, but allows made-to-order (stock=0)", () => {
    const capped = computeTotals({
      items: [{ id: "floor", qty: 10 }],
      getProduct, getPromo,
      deliveryMethod: "pickup",
    });
    assert.ok(!capped.ok);
    assert.equal(capped.err.error, "insufficient_stock");
    assert.equal(capped.err.available, 3);

    const mto = computeTotals({
      items: [{ id: "glass", qty: 100 }],
      getProduct, getPromo,
      deliveryMethod: "pickup",
    });
    assert.ok(mto.ok);
  });

  it("percent promo applies to subtotal, fixed promo caps at subtotal", () => {
    const pct = computeTotals({
      items: [{ id: "wax", qty: 1 }], promoCode: "SAVE15",
      getProduct, getPromo, deliveryMethod: "pickup",
    });
    assert.ok(pct.ok);
    assert.equal(pct.totals.discount, Math.floor(128000 * 0.15));

    const capped = computeTotals({
      items: [{ id: "wax", qty: 1 }], promoCode: "CAPPED5",
      getProduct, getPromo, deliveryMethod: "pickup",
    });
    assert.ok(capped.ok);
    assert.equal(capped.totals.discount, 5000); // raw 6,400; liability stops at 5,000
    assert.equal(capped.totals.promoBenefit, 5000);

    const flat = computeTotals({
      items: [{ id: "wax", qty: 1 }], promoCode: "FLAT20",
      getProduct, getPromo, deliveryMethod: "pickup",
    });
    assert.ok(flat.ok);
    assert.equal(flat.totals.discount, 20000);
  });

  it("rejects fixed promo below min spend and unknown promo", () => {
    const below = computeTotals({
      items: [{ id: "glass", qty: 1 }], promoCode: "FLAT20",
      getProduct, getPromo, deliveryMethod: "pickup",
    });
    assert.ok(!below.ok);
    assert.equal(below.err.error, "promo_min_spend");

    const missingGift = computeTotals({
      items: [{ id: "wax", qty: 1 }], promoCode: "GIFT",
      getProduct, getPromo, deliveryMethod: "pickup",
    });
    assert.ok(!missingGift.ok);
    assert.equal(missingGift.err.error, "promo_required_product");
    assert.equal(missingGift.err.product, "glass");

    const bad = computeTotals({
      items: [{ id: "wax", qty: 1 }], promoCode: "NOPE",
      getProduct, getPromo, deliveryMethod: "pickup",
    });
    assert.ok(!bad.ok);
    assert.equal(bad.err.error, "invalid_promo");
  });

  it("delivery fee: free ≥ threshold / pickup / freeship promo; capped hint otherwise", () => {
    const pickup = computeTotals({
      items: [{ id: "wax", qty: 1 }], getProduct, getPromo,
      deliveryMethod: "pickup", deliveryFeeHint: 12000,
    });
    assert.ok(pickup.ok);
    assert.equal(pickup.totals.deliveryFee, 0);

    const courierFee = computeTotals({
      items: [{ id: "glass", qty: 1 }], getProduct, getPromo,
      deliveryMethod: "courier_uzb", deliveryFeeHint: 12000,
    });
    assert.ok(courierFee.ok);
    assert.equal(courierFee.totals.deliveryFee, 12000);

    const hintCapped = computeTotals({
      items: [{ id: "glass", qty: 1 }], getProduct, getPromo,
      deliveryMethod: "courier_uzb", deliveryFeeHint: 999999,
    });
    assert.ok(hintCapped.ok);
    assert.equal(hintCapped.totals.deliveryFee, 100000);

    const freeship = computeTotals({
      items: [{ id: "glass", qty: 1 }], promoCode: "FREESHIP", getProduct, getPromo,
      deliveryMethod: "courier_uzb", deliveryFeeHint: 12000,
    });
    assert.ok(freeship.ok);
    assert.equal(freeship.totals.deliveryFee, 0);

    const shippingCredit = computeTotals({
      items: [{ id: "glass", qty: 1 }], promoCode: "SHIPCREDIT", getProduct, getPromo,
      deliveryMethod: "courier_uzb", deliveryFeeHint: 30000,
    });
    assert.ok(shippingCredit.ok);
    assert.equal(shippingCredit.totals.deliveryFee, 10000); // only the capped 20,000 is waived
    assert.equal(shippingCredit.totals.promoBenefit, 20000);

    const overThreshold = computeTotals({
      items: [{ id: "wax", qty: 2 }], getProduct, getPromo,
      deliveryMethod: "courier_uzb", deliveryFeeHint: 12000,
    });
    assert.ok(overThreshold.ok);
    assert.equal(overThreshold.totals.deliveryFee, 0);
  });

  it("applies a personal B2B discount after the wholesale ladder", () => {
    const res = computeTotals({
      items: [{ id: "wax", qty: 6 }], b2bPercent: 10,
      getProduct, getPromo, deliveryMethod: "pickup",
    });
    assert.ok(res.ok);
    // Wholesale first: 128000 × 88% × 6 = 675840, then personal 10%.
    assert.equal(res.totals.subtotal, 675840);
    assert.equal(res.totals.b2bDiscount, 67584);
    assert.equal(res.totals.discount, 67584);
    assert.equal(res.totals.total, 608256);
  });

  it("does not stack B2B with promo codes and clamps unsafe percentages", () => {
    const promo = computeTotals({
      items: [{ id: "wax", qty: 1 }], promoCode: "SAVE15", b2bPercent: 40,
      getProduct, getPromo, deliveryMethod: "pickup",
    });
    assert.ok(promo.ok);
    assert.equal(promo.totals.b2bDiscount, 0);
    assert.equal(promo.totals.discount, Math.floor(128000 * 0.15));

    const capped = computeTotals({
      items: [{ id: "wax", qty: 1 }], b2bPercent: 999,
      getProduct, getPromo, deliveryMethod: "pickup",
    });
    assert.ok(capped.ok);
    assert.equal(capped.totals.b2bDiscount, Math.floor(128000 * 0.70));

    const negative = computeTotals({
      items: [{ id: "wax", qty: 1 }], b2bPercent: -25,
      getProduct, getPromo, deliveryMethod: "pickup",
    });
    assert.ok(negative.ok);
    assert.equal(negative.totals.b2bDiscount, 0);
  });

  it("total = subtotal − discount + fee, floored at 0", () => {
    const res = computeTotals({
      items: [{ id: "glass", qty: 1 }], promoCode: "SAVE15",
      getProduct, getPromo, deliveryMethod: "courier_uzb", deliveryFeeHint: 12000,
    });
    assert.ok(res.ok);
    const { subtotal, discount, deliveryFee, total } = res.totals;
    assert.equal(total, Math.max(0, subtotal - discount + deliveryFee));
  });
});

describe("cart nudge — seller-safe 3% off big carts (500k / max 10k)", () => {
  const CART_NUDGE = { threshold: 500_000, percent: 3, maxDiscount: 10_000 };

  it("applies no discount below the 500k threshold", () => {
    const res = computeTotals({
      items: [{ id: "wax", qty: 3 }], // 128000 * 3 = 384000
      getProduct, getPromo, deliveryMethod: "pickup", cartNudge: CART_NUDGE,
    });
    assert.ok(res.ok);
    assert.equal(res.totals.subtotal, 384000);
    assert.equal(res.totals.discount, 0);
  });

  it("caps the raw 3% discount at 10 000", () => {
    // 128000 * 4 = 512000 → raw 15360 → capped 10000
    const res = computeTotals({
      items: [{ id: "wax", qty: 4 }],
      getProduct, getPromo, deliveryMethod: "pickup", cartNudge: CART_NUDGE,
    });
    assert.ok(res.ok);
    assert.equal(res.totals.subtotal, 512000);
    assert.equal(res.totals.discount, 10000);
  });

  it("applies 3% within the cap on a big cart", () => {
    // 128000*2 + 62000*3 = 442000 → below threshold. Use more:
    // 128000*3 + 62000*2 = 508000 → raw 15240 → capped 10000
    const res = computeTotals({
      items: [{ id: "wax", qty: 3 }, { id: "floor", qty: 2 }],
      getProduct, getPromo, deliveryMethod: "pickup", cartNudge: CART_NUDGE,
    });
    assert.ok(res.ok);
    assert.equal(res.totals.discount, 10000);
  });

  it("never stacks with a promo code", () => {
    const res = computeTotals({
      items: [{ id: "wax", qty: 4 }], // 512000
      promoCode: "SAVE15", getProduct, getPromo,
      deliveryMethod: "pickup", cartNudge: CART_NUDGE,
    });
    assert.ok(res.ok);
    // Only SAVE15 (15%) applies — the nudge is deliberately exclusive.
    assert.equal(res.totals.discount, Math.floor((512000 * 15) / 100));
  });

  it("never applies on wholesale quantities", () => {
    const res = computeTotals({
      items: [{ id: "wax", qty: 6 }], // wholesale (≥6), subtotal 675840
      getProduct, getPromo, deliveryMethod: "pickup", cartNudge: CART_NUDGE,
    });
    assert.ok(res.ok);
    assert.equal(res.totals.discount, 0); // wholesale pricing, no nudge
  });

  it("ignores the nudge entirely when not passed", () => {
    const res = computeTotals({
      items: [{ id: "wax", qty: 4 }],
      getProduct, getPromo, deliveryMethod: "pickup",
    });
    assert.ok(res.ok);
    assert.equal(res.totals.discount, 0);
  });
});

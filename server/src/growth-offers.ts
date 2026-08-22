/** Seller-safe growth offers. Values are intentionally capped and require spend. */
/** Cart nudge: 3% off big carts, capped at 10 000 UZS so margin is protected. */
export const CART_NUDGE = { threshold: 500_000, percent: 3, maxDiscount: 10_000, code: "CART3" } as const;
/** Welcome offer for first-time customers: 5% (max 10 000 UZS) from 180 000 UZS. */
export const WELCOME_OFFER = { percent: 5, minSpend: 180_000, maxDiscount: 10_000, days: 14 } as const;
export const ABANDONED_OFFER = { percent: 5, minSpend: 150_000, maxDiscount: 10_000 } as const;

export function cappedPercentDiscount(subtotal: number, percent: number, cap: number) {
  return Math.min(Math.floor(Math.max(0, subtotal) * percent / 100), cap);
}

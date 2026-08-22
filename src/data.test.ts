import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WHOLESALE_TIERS,
  wholesalePrice,
  cashbackRate,
  cashbackStars,
  PROMO_CODES,
  loadPromoCodes,
  PRODUCTS,
  UZBEKISTAN_REGIONS,
  REGION_TARIFFS,
  DEFAULT_TARIFF,
  getRegionTariff,
  type PromoCode,
} from "./data";

describe("wholesale pricing", () => {
  it("has the standard ladder", () => {
    expect(WHOLESALE_TIERS.map((t) => t.minQty)).toEqual([6, 12, 24, 48]);
    expect(WHOLESALE_TIERS.map((t) => t.discountPercent)).toEqual([12, 20, 28, 35]);
  });

  it("applies no discount below the first tier", () => {
    expect(wholesalePrice(100000, 1)).toEqual({ unit: 100000, discount: 0 });
    expect(wholesalePrice(100000, 5)).toEqual({ unit: 100000, discount: 0 });
  });

  it("applies tier discounts", () => {
    expect(wholesalePrice(100000, 6).discount).toBe(12);
    expect(wholesalePrice(100000, 12).discount).toBe(20);
    expect(wholesalePrice(100000, 24).discount).toBe(28);
    expect(wholesalePrice(100000, 48).discount).toBe(35);
  });

  it("rounds unit price to 10 so'm", () => {
    const r = wholesalePrice(128000, 6);
    expect(r.unit % 10).toBe(0);
    expect(r.discount).toBe(12);
  });

  it("never returns a negative price", () => {
    expect(wholesalePrice(5000, 1000).unit).toBeGreaterThan(0);
  });
});

describe("cashback", () => {
  it("applies tier rates 3/5/8%", () => {
    expect(cashbackRate(0)).toBe(0.03);
    expect(cashbackRate(499)).toBe(0.03);
    expect(cashbackRate(500)).toBe(0.05);
    expect(cashbackRate(1499)).toBe(0.05);
    expect(cashbackRate(1500)).toBe(0.08);
  });

  it("computes stars for a price (1 ⭐ = 100 so'm of value)", () => {
    expect(cashbackStars(100000, 0)).toBe(30); // 3% → 3000 → 30
    expect(cashbackStars(100000, 600)).toBe(50); // 5% → 5000 → 50
    expect(cashbackStars(100000, 2000)).toBe(80); // 8% → 8000 → 80
  });
});

describe("promo codes", () => {
  it("has valid built-in codes", () => {
    expect(PROMO_CODES.DELIS15.type).toBe("percent");
    expect(PROMO_CODES.DELIS15.value).toBe(15);
    expect(PROMO_CODES.FREESHIP.type).toBe("freeship");
    expect(PROMO_CODES.UZB2026.type).toBe("fixed");
  });

  it("every promo has tri-lingual title", () => {
    for (const code of Object.values(PROMO_CODES) as PromoCode[]) {
      expect(code.title.uz).toBeTruthy();
      expect(code.title.ru).toBeTruthy();
      expect(code.title.en).toBeTruthy();
    }
  });

  it("loads merged promo codes (localStorage fallback)", () => {
    expect(typeof loadPromoCodes()).toBe("object");
  });
});

describe("catalog data integrity", () => {
  it("has unique product ids", () => {
    const ids = PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every product has required fields", () => {
    for (const p of PRODUCTS) {
      expect(p.name).toBeTruthy();
      expect(p.price).toBeGreaterThan(0);
      expect(p.desc.uz).toBeTruthy();
      expect(p.desc.ru).toBeTruthy();
      expect(p.desc.en).toBeTruthy();
      expect(p.cat).toMatch(/^(home|car)$/);
      expect(p.img).toBeTruthy();
    }
  });

  it("gives every product distinct brand media and a matching gallery cover", () => {
    const images = PRODUCTS.map((product) => product.img);
    expect(new Set(images).size).toBe(images.length);
    for (const product of PRODUCTS) {
      expect(product.gallery?.[0]).toBe(product.img);
      expect(product.gallery?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("has both categories represented", () => {
    expect(PRODUCTS.some((p) => p.cat === "home")).toBe(true);
    expect(PRODUCTS.some((p) => p.cat === "car")).toBe(true);
  });
});

describe("mobile design regressions", () => {
  it("does not override absolute motion icon positioning", () => {
    const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
    const categories = readFileSync(new URL("./sections-home.tsx", import.meta.url), "utf8");
    const stories = readFileSync(new URL("./stories.tsx", import.meta.url), "utf8");
    const checkout = readFileSync(new URL("./checkout-modal.tsx", import.meta.url), "utf8");
    const chrome = readFileSync(new URL("./chrome.tsx", import.meta.url), "utf8");
    const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const thankYou = readFileSync(new URL("./thank-you.tsx", import.meta.url), "utf8");
    const admin = readFileSync(new URL("./features-admin.tsx", import.meta.url), "utf8");
    expect(css).toContain(".motion-icon-tile:not(.absolute):not(.fixed):not(.sticky)");
    expect(css).not.toMatch(/\.motion-icon-tile\s*\{\s*position:\s*relative/);
    expect(categories).toContain("motion-icon-tile absolute right-5 top-5");
    expect(stories).toContain("line-clamp-2 h-7 w-[76px]");
    expect(stories).not.toContain("story.title[lang].slice");
    expect(chrome).toContain("sheet-panel");
    expect(css).toContain(".sheet-panel");
    expect(css).toMatch(/\.sheet-panel\s*\{\s*max-height: 92vh/);
    expect(checkout).toContain("checkout-cart-footer");
    expect(checkout).toContain("mt-3 grid grid-cols-2 gap-2.5");
    expect(checkout).toContain("h-11 w-11");
    expect(api).toContain("export function hasTelegramSession");
    expect(api).toContain("ensureBrowserSession");
    expect(api).toContain("prepareBrowserCheckoutSession");
    expect(api).toContain("fetchPaymentAvailability");
    expect(checkout).toContain("SAFE_PAYMENT_DEFAULTS");
    expect(checkout).toContain("requiresTelegramPayment ?");
    expect(checkout).toContain("browserCheckoutReady ?");
    expect(checkout).toContain("setShowConfirm(false)");
    expect(checkout).toContain('step === "delivery" ?');
    expect(checkout).toContain("border-moss/55 bg-card shadow-sm ring-1 ring-moss/25");
    expect(checkout).not.toContain('space-y-2 max-h-[360px] overflow-y-auto');
    expect(thankYou).toContain("Ожидаемый кэшбэк");
    expect(thankYou).not.toContain("Вам начислено");
    expect(admin).toContain("ADMIN_ORDER_TRANSITIONS");
    expect(admin).toContain("disabled={!allowed}");
    expect(admin).toContain("Отменить заказ");
  });

  it("never duplicates the cart button with the Telegram MainButton", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const product = readFileSync(new URL("./screen-product.tsx", import.meta.url), "utf8");
    const chrome = readFileSync(new URL("./chrome.tsx", import.meta.url), "utf8");
    // The native MainButton must never be shown: it duplicated the in-app CTAs.
    expect(app).not.toContain("updateTelegramMainButton");
    expect(app).toContain("hideTelegramMainButton()");
    // In-app cart CTAs stay the single source of truth.
    expect(product).toContain('t("addToCartLong")');
    expect(product).toContain("onClick={onGoCart}");
    expect(chrome).toContain('x.id === "cart" && cartCount > 0');
  });

  it("keeps payment keys server-side and pasteable from the admin panel", () => {
    const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const tab = readFileSync(new URL("./payments-admin.tsx", import.meta.url), "utf8");
    const admin = readFileSync(new URL("./features-admin.tsx", import.meta.url), "utf8");
    // Keys are read/written only through the admin API — never bundled.
    expect(api).toContain("/v1/admin/payments");
    expect(api).toContain("/v1/admin/payments/self-check");
    expect(tab).toContain("adminSavePayments");
    expect(tab).toContain("adminPaymentsSelfCheck");
    // No credential ever hardcoded in the frontend.
    expect(tab).not.toMatch(/PAYME_KEY\s*=|CLICK_SECRET\s*=/);
    // The tab is actually reachable in the admin hub.
    expect(admin).toContain("PaymentsAdminTab");
    expect(admin).toContain('id: "payments"');
  });

  it("keeps the owner-uploaded logo byte-for-byte and uses only its pixel crops", () => {
    const source = readFileSync(new URL("../public/brand/delis-original.jpg", import.meta.url));
    const component = readFileSync(new URL("./brand.tsx", import.meta.url), "utf8");
    const icon = readFileSync(new URL("../public/icons/icon-512.png", import.meta.url));
    expect(createHash("sha256").update(source).digest("hex")).toBe("274ea265d6b855e61efb9e69e21954d0f96893b85e9df748359796ca3beeba04");
    expect(component).toContain('brandAsset("delis-wordmark.png")');
    expect(component).toContain('brandAsset("delis-lockup.png")');
    expect(component).not.toContain("onWhite");
    expect([...icon.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});

describe("delivery regions & tariffs", () => {
  it("has all 14 regions with districts", () => {
    expect(UZBEKISTAN_REGIONS.length).toBe(14);
    for (const r of UZBEKISTAN_REGIONS) {
      expect(r.id).toBeTruthy();
      expect(r.districts.length).toBeGreaterThan(0);
    }
  });

  it("every region has a tariff, default fallback works", () => {
    for (const r of UZBEKISTAN_REGIONS) {
      const t = getRegionTariff(r.id);
      expect(t.courier).toBeGreaterThan(0);
      expect(t.bts).toBeGreaterThan(0);
      expect(t.days[1]).toBeGreaterThanOrEqual(t.days[0]);
    }
    expect(getRegionTariff("unknown_region")).toEqual(DEFAULT_TARIFF);
    expect(getRegionTariff("tashkent_city")).toEqual(REGION_TARIFFS.tashkent_city);
  });
});

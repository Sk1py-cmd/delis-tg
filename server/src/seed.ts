/**
 * DELIS — Начальные данные (сид) для базы: каталог, тарифы, промокоды.
 */
import "dotenv/config";
import { getDb } from "./db.js";

const db = getDb();

/* ──────────── Seed products ──────────── */

const products = [
  {
    id: "wax", cat: "car", price: 128000, name_uz: "Graphite Wax", name_ru: "Graphite Wax", name_en: "Graphite Wax",
    volume: "250 ml", badge: null, stock: 168, rating: 4.95, reviews: 148, img: "images/prod-wax.jpg",
    features_uz: "T1 Braziliya karnauba mumi,Kuchli hidrofob qatlam,UV quyoshdan himoya",
    features_ru: "Бразильский карнауба T1,Мощный гидрофобный слой,UV защита",
    features_en: "T1 Brazilian Carnauba Wax,Super hydrophobic shield,UV fading protection",
  },
  {
    id: "glass", cat: "home", price: 48000, name_uz: "Glass №4", name_ru: "Glass №4", name_en: "Glass №4",
    volume: "500 ml", badge: "best", stock: 320, rating: 4.92, reviews: 214, img: "images/prod-glass.jpg",
    features_uz: "Spirtsiz formula,Antistatik changdan himoya",
    features_ru: "Формула без спирта,Антистатик",
    features_en: "Gentle alcohol-free formula,Anti-static dust repellent",
  },
  {
    id: "floor", cat: "home", price: 62000, name_uz: "Velvet Floor", name_ru: "Velvet Floor", name_en: "Velvet Floor",
    volume: "1 L", badge: "new", stock: 96, rating: 4.88, reviews: 89, img: "images/prod-floor.jpg",
    features_uz: "Biologik parchalanadi,Bolalar va uy hayvonlari uchun xavfsiz",
    features_ru: "Биоразлагаемый,Безопасно для детей и питомцев",
    features_en: "100% Biodegradable,Pet and child safe",
  },
  {
    id: "shampoo", cat: "car", price: 86000, name_uz: "Noir Shampoo", name_ru: "Noir Shampoo", name_en: "Noir Shampoo",
    volume: "1 L", badge: null, stock: 210, rating: 4.96, reviews: 172, img: "images/prod-shampoo.jpg",
    features_uz: "pH 7.0 mutlaq neytral,Yuqori konsentratsiya 1:200",
    features_ru: "pH 7.0 нейтральный,Концентрат 1:200",
    features_en: "pH 7.0 balanced,Concentrated 1:200",
  },
  {
    id: "cloud", cat: "home", price: 54000, name_uz: "Cloud Softener", name_ru: "Cloud Softener", name_en: "Cloud Softener",
    volume: "1.5 L", badge: "new", stock: 14, rating: 4.89, reviews: 64, img: "images/prod-cloud.jpg",
    features_uz: "Gipoallergen,Oson dazmollash effekti",
    features_ru: "Гипоаллергенный,Эффект лёгкого глажения",
    features_en: "Hypoallergenic,Easy iron effect",
  },
  {
    id: "interior", cat: "car", price: 92000, name_uz: "Velvet Interior", name_ru: "Velvet Interior", name_en: "Velvet Interior",
    volume: "500 ml", badge: null, stock: 145, rating: 4.93, reviews: 118, img: "images/prod-interior.jpg",
    features_uz: "Matoviy original ko'rinish,Tabiiy charm uchun xavfsiz",
    features_ru: "Матовый оригинальный финиш,Безопасно для натуральной кожи",
    features_en: "Original matte finish,Safe for genuine leather",
  },
  {
    id: "kitchen", cat: "home", price: 46000, name_uz: "Kitchen №2", name_ru: "Kitchen №2", name_en: "Kitchen №2",
    volume: "500 ml", badge: "best", stock: 0, rating: 4.91, reviews: 156, img: "images/prod-kitchen.jpg",
    features_uz: "Kuchli yog' erituvchi formula,O'tkir hidsiz",
    features_ru: "Мощная антижир формула,Без едкого запаха",
    features_en: "Powerful grease dissolve,No harsh fumes",
  },
  {
    id: "wheel", cat: "car", price: 74000, name_uz: "Iron Wheel", name_ru: "Iron Wheel", name_en: "Iron Wheel",
    volume: "500 ml", badge: null, stock: 88, rating: 4.97, reviews: 183, img: "images/prod-wheel.jpg",
    features_uz: "Rang indikatori,Disk lakiga xavfsiz",
    features_ru: "Цветовой индикатор,Безопасно для ЛКП",
    features_en: "Color changing indicator,Safe for clearcoat",
  },
];

const promoCodes = [
  { code: "DELIS15",  type: "percent", value: 15, min_spend: 0,     active: 1, title_uz: "15% chegirma",      title_ru: "Скидка 15%",          title_en: "15% off first order" },
  { code: "WELCOME10",type: "percent", value: 10, min_spend: 0,     active: 1, title_uz: "10% chegirma",      title_ru: "Скидка 10%",          title_en: "10% welcome discount" },
  { code: "FREESHIP", type: "freeship",value: 0,  min_spend: 0,     active: 1, title_uz: "Bepul yetkazish",   title_ru: "Бесплатная доставка", title_en: "Free delivery coupon" },
  { code: "UZB2026",  type: "fixed",   value: 20000, min_spend: 100000, active: 1, title_uz: "20 000 so'm", title_ru: "20 000 сум",          title_en: "20,000 UZS off" },
];

// Seed products
const insertProduct = db.prepare(`
  INSERT OR IGNORE INTO products (id, cat, price, name_uz, name_ru, name_en, volume, badge, stock, rating, reviews, img, features_uz, features_ru, features_en)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertPromo = db.prepare(`
  INSERT OR IGNORE INTO promo_codes (code, type, value, min_spend, active, title_uz, title_ru, title_en)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const enableSeededPromos = process.env.ENABLE_SEEDED_PROMOS === "true";

const txn = db.transaction(() => {
  for (const p of products) {
    insertProduct.run(p.id, p.cat, p.price, p.name_uz, p.name_ru, p.name_en, p.volume, p.badge, p.stock, p.rating, p.reviews, p.img, p.features_uz, p.features_ru, p.features_en);
  }
  for (const pr of promoCodes) {
    insertPromo.run(pr.code, pr.type, pr.value, pr.min_spend, enableSeededPromos ? pr.active : 0, pr.title_uz, pr.title_ru, pr.title_en);
  }
});

txn();

console.log(`✅ Seeded ${products.length} products and ${promoCodes.length} promo codes into SQLite.`);
db.close();

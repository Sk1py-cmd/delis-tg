/**
 * DELIS — Запуск сида при старте сервера, если база пустая.
 */
import { getDb } from "./db.js";

const products = [
  { id: "luxe-softener", cat: "home", price: 50000, cost: 32500, name_uz: "DELIS Luxe — Mato yumshatgichi", name_ru: "DELIS Luxe — Кондиционер для белья", name_en: "DELIS Luxe — Fabric Conditioner", volume: "1.4 L", badge: "new", stock: 100, rating: 5, reviews: 0, img: "images/prod-softener.jpg", features_uz: "Matoni yumshatadi,Uzoq hid,Ranglarga xavfsiz", features_ru: "Смягчает ткань,Стойкий аромат,Для белого и цветного", features_en: "Softens fabric,Long-lasting scent,Colour-safe" },
  { id: "luxe-gel", cat: "home", price: 70000, cost: 45500, name_uz: "DELIS Luxe — Kir yuvish geli", name_ru: "DELIS Luxe — Гель для стирки", name_en: "DELIS Luxe — Laundry Gel", volume: "2 L", badge: "new", stock: 100, rating: 5, reviews: 0, img: "images/prod-gel.jpg", features_uz: "Dog'larni ketkazadi,Rangni asraydi,Orxideya ifori", features_ru: "Удаляет пятна,Защита цвета,Аромат орхидеи", features_en: "Stain removal,Colour protection,Orchid scent" },
];

/** Legacy demo catalog — only inserted in tests via seedOnStart(true). */
const TEST_CATALOG_PRODUCTS = [
  { id: "wax", cat: "car", price: 128000, cost: 83200, name_uz: "Graphite Wax", name_ru: "Graphite Wax", name_en: "Graphite Wax", volume: "250 ml", badge: null, stock: 168, rating: 4.95, reviews: 148, img: "images/prod-wax.jpg", features_uz: "T1 karnauba mum,UV himoya,Yuqori hidrofob", features_ru: "Карнауба T1,UV защита,Гидрофоб", features_en: "T1 Carnauba,UV protection,Hydrophobic" },
  { id: "glass", cat: "home", price: 48000, cost: 31200, name_uz: "Glass №4", name_ru: "Glass №4", name_en: "Glass №4", volume: "500 ml", badge: "best", stock: 320, rating: 4.92, reviews: 214, img: "images/prod-glass.jpg", features_uz: "Spirtsiz,Antistatik", features_ru: "Без спирта,Антистатик", features_en: "Alcohol-free,Anti-static" },
  { id: "floor", cat: "home", price: 62000, cost: 40300, name_uz: "Velvet Floor", name_ru: "Velvet Floor", name_en: "Velvet Floor", volume: "1 L", badge: "new", stock: 96, rating: 4.88, reviews: 89, img: "images/prod-floor.jpg", features_uz: "Biologik parchalanadi,Bolalarga xavfsiz", features_ru: "Биоразлагаемый,Для детей", features_en: "Biodegradable,Child-safe" },
  { id: "shampoo", cat: "car", price: 86000, cost: 55900, name_uz: "Noir Shampoo", name_ru: "Noir Shampoo", name_en: "Noir Shampoo", volume: "1 L", badge: null, stock: 210, rating: 4.96, reviews: 172, img: "images/prod-shampoo.jpg", features_uz: "pH 7.0 neytral,1:200 konsentrat", features_ru: "pH 7.0 нейтрал,1:200", features_en: "pH 7.0 neutral,1:200 concentrate" },
  { id: "cloud", cat: "home", price: 54000, cost: 35100, name_uz: "Cloud Softener", name_ru: "Cloud Softener", name_en: "Cloud Softener", volume: "1.5 L", badge: "new", stock: 14, rating: 4.89, reviews: 64, img: "images/prod-cloud.jpg", features_uz: "Gipoallergen,Yumshoq", features_ru: "Гипоаллергенный,Мягкий", features_en: "Hypoallergenic,Gentle" },
  { id: "interior", cat: "car", price: 92000, cost: 59800, name_uz: "Velvet Interior", name_ru: "Velvet Interior", name_en: "Velvet Interior", volume: "500 ml", badge: null, stock: 145, rating: 4.93, reviews: 118, img: "images/prod-interior.jpg", features_uz: "Matoviy charm xavfsiz", features_ru: "Матовый финиш,Кожа", features_en: "Matte finish,Leather-safe" },
  { id: "kitchen", cat: "home", price: 46000, cost: 29900, name_uz: "Kitchen №2", name_ru: "Kitchen №2", name_en: "Kitchen №2", volume: "500 ml", badge: "best", stock: 0, rating: 4.91, reviews: 156, img: "images/prod-kitchen.jpg", features_uz: "Anti-yog',Hidsiz", features_ru: "Антижир,Без запаха", features_en: "Anti-grease,No fumes" },
  { id: "wheel", cat: "car", price: 74000, cost: 48100, name_uz: "Iron Wheel", name_ru: "Iron Wheel", name_en: "Iron Wheel", volume: "500 ml", badge: null, stock: 88, rating: 4.97, reviews: 183, img: "images/prod-wheel.jpg", features_uz: "Rang indikatori,Kislotasiz", features_ru: "Индикатор цвета,Бескислотный", features_en: "Color indicator,Acid-free" },
];

const promos = [
  { code: "DELIS15",  type: "percent",  value: 15,    min_spend: 0,      active: 1, title_uz: "15% chegirma",      title_ru: "Скидка 15%",     title_en: "15% off first order" },
  { code: "WELCOME10",type: "percent",  value: 10,    min_spend: 0,      active: 1, title_uz: "10% chegirma",      title_ru: "Скидка 10%",     title_en: "10% welcome discount" },
  { code: "FREESHIP", type: "freeship", value: 0,     min_spend: 0,      active: 1, title_uz: "Bepul yetkazish",   title_ru: "Бесплатная доставка", title_en: "Free delivery coupon" },
  { code: "UZB2026",  type: "fixed",    value: 20000, min_spend: 100000, active: 1, title_uz: "20 000 so'm",      title_ru: "20 000 сум",    title_en: "20,000 UZS off" },
];

function upgradeDefaultProductMedia(db: ReturnType<typeof getDb>) {
  const upgrades = [
    ["cloud", "images/prod-floor.jpg", "images/prod-cloud.jpg"],
    ["interior", "images/prod-shampoo.jpg", "images/prod-interior.jpg"],
    ["kitchen", "images/prod-glass.jpg", "images/prod-kitchen.jpg"],
    ["wheel", "images/prod-wax.jpg", "images/prod-wheel.jpg"],
  ] as const;
  const update = db.prepare("UPDATE products SET img = ? WHERE id = ? AND img = ?");
  for (const [id, oldImage, newImage] of upgrades) update.run(newImage, id, oldImage);
}

export function seedOnStart(includeTestCatalog = false) {
  const db = getDb();
  const count: any = db.prepare("SELECT COUNT(*) as c FROM products").get();
  if (count?.c > 0) {
    upgradeDefaultProductMedia(db);
    console.log("📦 DB already seeded — defaults checked.");
    return;
  }
  // Seeded promo codes are examples. Production starts with them disabled
  // unless the owner explicitly opts in after reviewing the economics.
  const enableSeededPromos = process.env.ENABLE_SEEDED_PROMOS === "true" || process.env.DELIS_DB_PATH === ":memory:";
  const rows = includeTestCatalog ? [...products, ...TEST_CATALOG_PRODUCTS] : products;
  const ip = db.prepare(`INSERT OR IGNORE INTO products (id, cat, price, cost_price, name_uz, name_ru, name_en, volume, badge, stock, rating, reviews, img, features_uz, features_ru, features_en) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const ipr = db.prepare(`INSERT OR IGNORE INTO promo_codes (code, type, value, min_spend, active, title_uz, title_ru, title_en) VALUES (?,?,?,?,?,?,?,?)`);
  const txn = db.transaction(() => {
    for (const p of rows) ip.run(p.id, p.cat, p.price, Number(p.cost || 0), p.name_uz, p.name_ru, p.name_en, p.volume, p.badge, p.stock, p.rating, p.reviews, p.img, p.features_uz, p.features_ru, p.features_en);
    for (const pr of promos) ipr.run(pr.code, pr.type, pr.value, pr.min_spend, enableSeededPromos ? pr.active : 0, pr.title_uz, pr.title_ru, pr.title_en);
  });
  txn();
  console.log(`✅ Seeded ${rows.length} products and ${promos.length} promo codes.`);
}

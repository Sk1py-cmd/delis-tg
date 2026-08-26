/**
 * DELIS — Начальные данные (сид) для базы: каталог, тарифы, промокоды.
 */
import "dotenv/config";
import { getDb } from "./db.js";

const db = getDb();

/* ──────────── Seed products ──────────── */

const products = [
  {
    id: "luxe-softener", cat: "home", price: 50000, name_uz: "DELIS Luxe — Mato yumshatgichi", name_ru: "DELIS Luxe — Кондиционер для белья", name_en: "DELIS Luxe — Fabric Conditioner",
    volume: "1.4 L", badge: "new", stock: 100, rating: 5, reviews: 0, img: "images/prod-softener.jpg",
    features_uz: "Matoni yumshatadi va dazmollashni osonlashtiradi,Uzoq saqlanuvchi yoqimli hid,Oq va rangli kiyimlar uchun mos",
    features_ru: "Смягчает ткань и облегчает глажение,Стойкий приятный аромат,Подходит для белого и цветного белья",
    features_en: "Softens fabric and eases ironing,Long-lasting pleasant scent,Suitable for white and coloured fabrics",
  },
  {
    id: "luxe-gel", cat: "home", price: 70000, name_uz: "DELIS Luxe — Kir yuvish geli", name_ru: "DELIS Luxe — Гель для стирки", name_en: "DELIS Luxe — Laundry Gel",
    volume: "2 L", badge: "new", stock: 100, rating: 5, reviews: 0, img: "images/prod-gel.jpg",
    features_uz: "Kuchli dog'larni samarali ketkazadi,Ranglarni asraydigan oqartirish,Ekzotik orxideya ifori",
    features_ru: "Эффективно удаляет стойкие пятна,Отбеливает не вредя цвету,Стойкий аромат экзотической орхидеи",
    features_en: "Effectively removes tough stains,Whitening that protects colours,Long-lasting exotic orchid scent",
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

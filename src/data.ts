/**
 * DELIS — Общая «база» приложения: типы, каталог товаров PRODUCTS, категории, отзывы, промокоды, тарифы доставки, а также функции чтения/записи localStorage. Почти все экраны берут данные отсюда.
 */
import type { L10n } from "./i18n";

export type Cat = "home" | "car";

export type ProductReview = {
  id: string;
  author: string;
  city: string;
  rating: number; // 1-5
  date: string;
  comment: L10n;
  verified: boolean;
};

export type ProductCompareDetails = {
  ph: string;
  scent: L10n;
  surfaces: L10n;
  safety: L10n;
  concentration: string;
  origin: string;
};

/** Wholesale tier: qty threshold → discount % off the retail unit price */
export type WholesaleTier = { minQty: number; discountPercent: number };

/** Standard DELIS wholesale ladder applied to every product */
export const WHOLESALE_TIERS: WholesaleTier[] = [
  { minQty: 6, discountPercent: 12 }, // small shop pack
  { minQty: 12, discountPercent: 20 }, // half-box
  { minQty: 24, discountPercent: 28 }, // full box
  { minQty: 48, discountPercent: 35 }, // distributor pallet
];

/** Minimum units required to start a wholesale order */
export const WHOLESALE_MIN_QTY = 6;

/** Calculate a wholesale unit price. `tiers` may come from the admin-managed API;
 * the bundled ladder remains a reliable offline fallback. */
export function wholesalePrice(
  retail: number,
  qty: number,
  tiers: readonly WholesaleTier[] = WHOLESALE_TIERS,
): { unit: number; discount: number } {
  let discount = 0;
  for (const tier of tiers) {
    if (qty >= tier.minQty) discount = tier.discountPercent;
  }
  return { unit: Math.round((retail * (100 - discount)) / 1000) * 10, discount };
}

/** Supported container sizes for a product (ml / L). */
export type VolumeOption = {
  label: string; // e.g. "300 ml" | "1 L" | "5 L" | "20 L"
  liters: number; // numeric value in liters
  retailPrice?: number; // override price for this volume (per unit/retail)
};

export type Product = {
  id: string;
  cat: Cat;
  price: number; // UZS retail unit price
  costPrice?: number; // UZS purchase/wholesale cost per unit (margin = price - costPrice)
  badge?: "new" | "best";
  signature?: boolean;
  img: string;
  gallery?: string[];
  name: string;
  desc: L10n;
  spec: L10n;
  volume: string;
  volumes?: VolumeOption[]; // available sizes 0.3L ... 20L
  color: string; // bg color for swatches
  usage: L10n;
  composition: L10n;
  story: L10n;
  tips: L10n[];
  rating: number;
  reviewsCount: number;
  reviews: ProductReview[];
  features?: L10n[];
  compare?: ProductCompareDetails;
  batchCode?: string;
  unitsPerBox?: number; // how many bottles in a wholesale box
  stock?: number; // units available at the Namangan warehouse
  soldToday?: number; // social proof from the server order log
  soldTotal?: number;
};

/* ─────────── Product bundles / sets with discount ─────────── */

export type Bundle = {
  id: string;
  name: L10n;
  desc: L10n;
  items: { productId: string; qty: number }[];
  discountPercent: number; // extra saving vs buying separately
  badge?: string;
};

export const BUNDLES: Bundle[] = [
  {
    id: "bundle-detail-essentials",
    name: {
      uz: "Avto detailing to'plami",
      ru: "Набор для авто-детейлинга",
      en: "Auto Detailing Bundle",
    },
    desc: {
      uz: "Graphite Wax + Noir Shampoo — ideal juftlik, chuqur yaltirash uchun",
      ru: "Graphite Wax + Noir Shampoo — идеальная пара для глубокого блеска",
      en: "Graphite Wax + Noir Shampoo — the perfect pair for deep gloss",
    },
    items: [
      { productId: "wax", qty: 1 },
      { productId: "shampoo", qty: 1 },
    ],
    discountPercent: 15,
    badge: "🔥 Hit",
  },
  {
    id: "bundle-home-clean",
    name: {
      uz: "Uy tozalash to'plami",
      ru: "Комплект для уборки дома",
      en: "Home Cleaning Bundle",
    },
    desc: {
      uz: "Glass №4 + Velvet Floor — oynalar va pollar uchun kompleks yechim",
      ru: "Glass №4 + Velvet Floor — комплексное решение для стёкол и пола",
      en: "Glass №4 + Velvet Floor — a complete solution for glass and floors",
    },
    items: [
      { productId: "glass", qty: 1 },
      { productId: "floor", qty: 1 },
    ],
    discountPercent: 12,
  },
  {
    id: "bundle-car-home",
    name: {
      uz: "Full Care to'plami",
      ru: "Комплект Full Care",
      en: "Full Care Bundle",
    },
    desc: {
      uz: "Avto va uy parvarishi — bitta oylik zaxira",
      ru: "Авто и дом — месячный запас в одном наборе",
      en: "Car + home care — a one-month supply",
    },
    items: [
      { productId: "wax", qty: 1 },
      { productId: "shampoo", qty: 1 },
      { productId: "glass", qty: 1 },
    ],
    discountPercent: 18,
    badge: "👑 Premium",
  },
];

/** Calculate bundle total after discount vs retail sum */
export function bundlePricing(bundle: Bundle): { retail: number; bundleTotal: number; saved: number } {
  const retail = bundle.items.reduce((sum, it) => {
    const p = PRODUCTS.find((x) => x.id === it.productId);
    return sum + (p ? p.price * it.qty : 0);
  }, 0);
  const bundleTotal = Math.round((retail * (100 - bundle.discountPercent)) / 100);
  return { retail, bundleTotal, saved: retail - bundleTotal };
}

export type GiftBoxStyle = {
  id: string;
  name: L10n;
  desc: L10n;
  boxColor: string;
  ribbonColor: string;
  accentColor: string;
  price: number; // UZS
};

export const GIFT_BOX_STYLES: GiftBoxStyle[] = [
  {
    id: "pine_luxury",
    name: {
      uz: "DELIS Pine & Gold — Premium quti",
      ru: "DELIS Pine & Gold — Премиальный бокс",
      en: "DELIS Pine & Gold — Luxury Box",
    },
    desc: {
      uz: "To'q yashil baxmal quti, oltin tasma va maxsus qutlov kartochkasi bilan.",
      ru: "Глубокий хвойный бархат с золотой лентой и персонализированной открыткой.",
      en: "Deep pine velvet finish with gold satin ribbon and handwritten note.",
    },
    boxColor: "#0A2118",
    ribbonColor: "#E0A63C",
    accentColor: "#3F6B52",
    price: 35000,
  },
  {
    id: "porcelain_minimal",
    name: {
      uz: "Porcelain Minimal — Oq chinnidek nafis",
      ru: "Porcelain Minimal — Фарфоровая чистота",
      en: "Porcelain Minimal — Clean Porcelain",
    },
    desc: {
      uz: "Yengil matoviy chinni quti va adaçayı (sage) rangli ipak tasma.",
      ru: "Матовая светлая коробка с шелковистой лентой цвета шалфея.",
      en: "Matte porcelain surface with sage silk ribbon and botanical card.",
    },
    boxColor: "#F4F2EB",
    ribbonColor: "#3F6B52",
    accentColor: "#A9C39E",
    price: 30000,
  },
  {
    id: "midnight_graphite",
    name: {
      uz: "Midnight Graphite — Avto detailing uslubi",
      ru: "Midnight Graphite — Стиль автодетейлинга",
      en: "Midnight Graphite — Detailing Edition",
    },
    desc: {
      uz: "Grafit qora quti va quyosh kabi yaltiroq amber tasma — avto ixlosmandlari uchun.",
      ru: "Графитово-чёрная коробка с янтарной лентой — идеальный подарок для автолюбителя.",
      en: "Matte graphite box with amber ribbon — the ultimate auto detailing gift.",
    },
    boxColor: "#14161A",
    ribbonColor: "#E0A63C",
    accentColor: "#8A6420",
    price: 35000,
  },
];

export type LoyaltyTier = "bronze" | "silver" | "gold";

export type LoyaltyTierInfo = {
  tier: LoyaltyTier;
  name: L10n;
  cashbackPercent: number;
  minStars: number;
  maxStars: number;
  color: string;
  badge: string;
  benefits: L10n[];
};

export const LOYALTY_TIERS: Record<LoyaltyTier, LoyaltyTierInfo> = {
  bronze: {
    tier: "bronze",
    name: { uz: "Bronza a'zolik", ru: "Бронзовый уровень", en: "Bronze Member" },
    cashbackPercent: 3,
    minStars: 0,
    maxStars: 500,
    color: "#CD7F32",
    badge: "🥉",
    benefits: [
      { uz: "Har bir xariddan 3% Stars keshbek", ru: "3% кэшбэк Stars с каждой покупки", en: "3% Stars cashback on every order" },
      { uz: "Tug'ilgan kunga maxsus Stars sovg'a", ru: "Специальный подарок Stars на день рождения", en: "Special Stars gift on your birthday" },
    ],
  },
  silver: {
    tier: "silver",
    name: { uz: "Kumush a'zolik", ru: "Серебряный уровень", en: "Silver Member" },
    cashbackPercent: 5,
    minStars: 500,
    maxStars: 1500,
    color: "#94A3B8",
    badge: "🥈",
    benefits: [
      { uz: "Har bir xariddan 5% Stars keshbek", ru: "5% кэшбэк Stars с каждой покупки", en: "5% Stars cashback on every order" },
      { uz: "Har bir buyurtmaga miniatyura sovg'a", ru: "Подарочная миниатюра к каждому заказу", en: "Gift miniature with every order" },
      { uz: "Yangi mahsulotlarni 3 kun oldin xarid qilish", ru: "Ранний доступ к новинкам за 3 дня", en: "Early access to new drops 3 days prior" },
    ],
  },
  gold: {
    tier: "gold",
    name: { uz: "Oltin VIP a'zolik", ru: "Золотой VIP уровень", en: "Gold VIP Member" },
    cashbackPercent: 8,
    minStars: 1500,
    maxStars: 99999,
    color: "#E0A63C",
    badge: "👑",
    benefits: [
      { uz: "Har bir xariddan 8% Stars keshbek", ru: "8% кэшбэк Stars с каждой покупки", en: "8% Stars cashback on every order" },
      { uz: "Doimiy bepul kuryerlik yetkazish", ru: "Всегда бесплатная курьерская доставка", en: "Free courier delivery on all orders" },
      { uz: "Shaxsiy DELIS parvarish maslahatchisi", ru: "Персональный консультант по уходу", en: "Personal dedicated care consultant" },
      { uz: "Eksklyuziv sovg'alar to'plami", ru: "Эксклюзивные подарочные наборы", en: "Exclusive luxury gift sets" },
    ],
  },
};

export const PRODUCTS: Product[] = [
  {
    id: "wax",
    cat: "car",
    price: 128000,
    signature: true,
    img: "images/prod-wax.jpg",
    gallery: ["images/prod-wax.jpg", "images/news-car.jpg", "images/cat-car.jpg"],
    name: "Graphite Wax",
    desc: {
      uz: "Karnauba mum — chuqur yaltirash va himoya",
      ru: "Карнаубский воск — глубокий блеск и защита",
      en: "Carnauba wax — deep gloss and protection",
    },
    spec: { uz: "6 oy himoya", ru: "6 мес защиты", en: "6 months of protection" },
    volume: "250 ml",
    color: "#1e2126",
    rating: 4.95,
    reviewsCount: 148,
    batchCode: "DL-26-W09",
    unitsPerBox: 12,
    stock: 168,
    volumes: [
      { label: "300 ml", liters: 0.3 },
      { label: "500 ml", liters: 0.5 },
      { label: "1 L", liters: 1 },
      { label: "5 L", liters: 5 },
      { label: "10 L", liters: 10 },
      { label: "20 L", liters: 20 },
    ],
    compare: {
      ph: "Neytral (Wax matrix)",
      scent: { uz: "Tabiiy karamel va qahrabo", ru: "Натуральная карамель и амбра", en: "Natural caramel & amber" },
      surfaces: { uz: "Avto bo'yog'i, xrom, lak", ru: "Кузов авто, хром, лак", en: "Car paint, chrome, clearcoat" },
      safety: { uz: "Lak uchun 100% xavfsiz", ru: "100% безопасно для ЛКП", en: "100% clearcoat safe" },
      concentration: "100% tayyor pasta",
      origin: "Namangan zavodi, 2026",
    },
    reviews: [
      {
        id: "r1",
        author: "Bekzod R.",
        city: "Toshkent",
        rating: 5,
        date: "22 Feb 2026",
        comment: {
          uz: "Natijasi aql bovar qilmas darajada. Mashina rangi chuqur oyna kabi yaltiradi!",
          ru: "Эффект невероятный. Цвет кузова стал глубоким, как зеркало!",
          en: "Incredible result. The paint gained deep mirror reflection!",
        },
        verified: true,
      },
      {
        id: "r2",
        author: "Sardor K.",
        city: "Namangan",
        rating: 5,
        date: "18 Feb 2026",
        comment: {
          uz: "Yomg'irdan keyin suv tomchilari sirpanib ketadi. 3 oy bo'ldi hali ham ta'siri bor.",
          ru: "После дождя капли воды просто скатываются. Прошло 3 месяца — гидрофоб держится.",
          en: "Water beads roll right off after rain. 3 months in and still hydrophobic.",
        },
        verified: true,
      },
    ],
    features: [
      { uz: "T1 Braziliya karnauba mumi", ru: "Бразильский воск карнауба T1", en: "T1 Brazilian Carnauba Wax" },
      { uz: "Kuchli hidrofob qatlam", ru: "Мощный гидрофобный слой", en: "Super hydrophobic shield" },
      { uz: "UV quyoshdan himoya", ru: "Защита от UV выгорания", en: "UV fading protection" },
    ],
    usage: {
      uz: "Sof, quruq sirtga yumshoq shimgich bilan ingichka qatlam qilib surting. 10–15 daqiqadan so'ng mikrofiber bilan silliqlang.",
      ru: "Нанесите тонким слоем мягкой губкой на чистую сухую поверхность. Через 10–15 минут располируйте микрофиброй.",
      en: "Apply a thin layer with a soft applicator to a clean dry surface. After 10–15 minutes buff with a microfibre cloth.",
    },
    composition: {
      uz: "Tabiiy karnauba mumi T1, polimerlar, UV-filtr, efir moyi.",
      ru: "Натуральный карнаубский воск T1, полимеры, UV-фильтр, эфирное масло.",
      en: "Natural T1 carnauba wax, polymers, UV filter, essential oil.",
    },
    story: {
      uz: "Formulani ko'p marta sinab ko'rdik, to ideal natijaga erishgunimizcha. Graphite Wax — biz o'z mashinalarimizga ishlatadigan mahsulot.",
      ru: "Мы много раз дорабатывали формулу, пока не получили идеальный результат. Graphite Wax — то, что мы используем на своих машинах.",
      en: "We refined the formula many times until it was perfect. Graphite Wax is what we use on our own cars.",
    },
    tips: [
      {
        uz: "Eng yaxshi natija — soyada va 15–25°C haroratda",
        ru: "Лучший результат — в тени при 15–25°C",
        en: "Best result in shade at 15–25°C",
      },
      {
        uz: "Bir dona flakon 3 ta to'liq qo'llashga yetadi",
        ru: "Одной банки хватает на 3 полных нанесения",
        en: "One tin is enough for three full applications",
      },
    ],
  },
  {
    id: "glass",
    cat: "home",
    price: 48000,
    badge: "best",
    img: "images/prod-glass.jpg",
    gallery: ["images/prod-glass.jpg", "images/cat-home.jpg"],
    name: "Glass №4",
    desc: {
      uz: "Oyna va ko'zgular uchun sprey — iz qoldirmaydi",
      ru: "Спрей для стёкол и зеркал — без разводов",
      en: "Glass & mirror spray — streak-free",
    },
    spec: { uz: "30 soniyada quriydi", ru: "Высыхает за 30 сек", en: "Dries in 30 seconds" },
    volume: "500 ml",
    color: "#A9C39E",
    rating: 4.92,
    reviewsCount: 214,
    batchCode: "DL-26-G04",
    unitsPerBox: 24,
    stock: 320,
    compare: {
      ph: "7.2 (Neytral)",
      scent: { uz: "Yengil tog' havosi", ru: "Свежий горный воздух", en: "Crisp mountain air" },
      surfaces: { uz: "Oyna, ko'zgu, ekranlar, xrom", ru: "Стёкла, зеркала, экраны, хром", en: "Glass, mirrors, screens, chrome" },
      safety: { uz: "Izsiz va spirtsiz", ru: "Без разводов и резкого спирта", en: "Streak-free & gentle" },
      concentration: "Sprey (tayyor)",
      origin: "Namangan zavodi, 2026",
    },
    reviews: [
      {
        id: "r3",
        author: "Dilnoza M.",
        city: "Samarqand",
        rating: 5,
        date: "20 Feb 2026",
        comment: {
          uz: "Ko'zgularda zarracha chiziq yoki iz qolmaydi. Boshqa sprey sotib olmayman!",
          ru: "На зеркалах ни одного развода. Никаких других средств больше не беру!",
          en: "Zero streaks on mirrors. I'm never buying another brand again!",
        },
        verified: true,
      },
    ],
    features: [
      { uz: "Spirtsiz formula", ru: "Формула без резкого спирта", en: "Gentle alcohol-free formula" },
      { uz: "Antistatik changdan himoya", ru: "Антистатик против пыли", en: "Anti-static dust repellent" },
    ],
    usage: {
      uz: "Sirtni püskürtün, mikrofiber bilan yuqoridan pastga tozalang. Ikki marta artish kerak emas.",
      ru: "Распылите на поверхность, протрите микрофиброй сверху вниз. Второго прохода не требуется.",
      en: "Spray the surface, wipe top to bottom with a microfibre cloth. No second pass needed.",
    },
    composition: {
      uz: "Demineralizatsiyalangan suv, izopropanol, bio-PAN, efir moyi.",
      ru: "Деминерализованная вода, изопропанол, био-ПАВ, эфирное масло.",
      en: "Demineralised water, isopropanol, bio surfactant, essential oil.",
    },
    story: {
      uz: "№4 — to'rtinchi formulamiz. Bir necha bor qayta ishlab chiqilgach, u oynada zarracha iz qoldirmaydigan yakuniy variantga aylandi.",
      ru: "№4 — наша четвёртая формула. После нескольких доработок она стала финальной версией, не оставляющей следов на стекле.",
      en: "№4 is our fourth formula. After several refinements it became the final streak-free version.",
    },
    tips: [
      {
        uz: "Quyoshda ishlamang — tez quriydi va iz qoladi",
        ru: "Не работайте на солнце — быстро сохнет и оставляет следы",
        en: "Don't work in direct sun — it dries too fast and streaks",
      },
      {
        uz: "Ikki marta püskürtmang — bir marta yetarli",
        ru: "Не распыляйте дважды — одного раза достаточно",
        en: "Don't spray twice — one pass is enough",
      },
    ],
  },
  {
    id: "floor",
    cat: "home",
    price: 62000,
    badge: "new",
    img: "images/prod-floor.jpg",
    gallery: ["images/prod-floor.jpg", "images/cat-home.jpg"],
    name: "Velvet Floor",
    desc: {
      uz: "Pol uchun konsentrat — 40 litr tayyor eritma",
      ru: "Концентрат для пола — 40 литров раствора",
      en: "Floor concentrate — makes 40 litres",
    },
    spec: { uz: "Hid 2 soat saqlanadi", ru: "Аромат сохраняется 2 часа", en: "Scent lingers for 2 hours" },
    volume: "1 L",
    color: "#E4ECDA",
    rating: 4.88,
    reviewsCount: 89,
    batchCode: "DL-26-F12",
    unitsPerBox: 12,
    stock: 96,
    compare: {
      ph: "6.8 (Yumshoq neytral)",
      scent: { uz: "Evkalipt va yovvoyi ignabarg", ru: "Эвкалипт и дикая хвоя", en: "Eucalyptus & wild pine" },
      surfaces: { uz: "Laminat, parket, kafel, marmar", ru: "Ламинат, паркет, кафель, мрамор", en: "Laminate, hardwood, tile, marble" },
      safety: { uz: "Yuvish shart emas, bolalarga xavfsiz", ru: "Не требует смывания, безопасно для детей", en: "No rinse, pet & child safe" },
      concentration: "1:40 yuqori konsentrat",
      origin: "Namangan zavodi, 2026",
    },
    reviews: [
      {
        id: "r4",
        author: "Malika T.",
        city: "Toshkent",
        rating: 5,
        date: "15 Feb 2026",
        comment: {
          uz: "Laminat pol yaltirab qoldi va xonada yoqimli o'rmon ifori taraldi.",
          ru: "Ламинат блестит без липкости, и в комнате невероятный аромат хвои.",
          en: "Laminate shines without stickiness, and the pine scent is divine.",
        },
        verified: true,
      },
    ],
    features: [
      { uz: "Biologik parchalanadi", ru: "Биоразлагаемый состав", en: "100% Biodegradable" },
      { uz: "Bolalar va uy hayvonlari uchun xavfsiz", ru: "Безопасно для детей и питомцев", en: "Pet and child safe" },
    ],
    usage: {
      uz: "Chelakka 25 ml qo'shing va 10 litr iliq suv bilan aralashtiring. Yuvishdan keyin quritish shart emas.",
      ru: "Добавьте 25 мл в ведро с 10 литрами тёплой воды. Смывать не нужно.",
      en: "Add 25 ml to a bucket of 10 litres of warm water. No rinsing required.",
    },
    composition: {
      uz: "APG-PAV, glitserin, evkalipt efir moyi, limon kislotasi.",
      ru: "АПГ-ПАВ, глицерин, эфирное масло эвкалипта, лимонная кислота.",
      en: "APG surfactant, glycerin, eucalyptus essential oil, citric acid.",
    },
    story: {
      uz: "Bu mahsulotning hidi — bizning zavodimizda ishlaydigan xodimlarimizning sevimlisi.",
      ru: "Аромат этого средства — любимый у сотрудников нашего завода.",
      en: "The scent of this product is our factory team's favourite.",
    },
    tips: [
      {
        uz: "Laminat uchun 15 ml/chelak — yetarli",
        ru: "Для ламината хватит 15 мл на ведро",
        en: "For laminate — 15 ml per bucket is enough",
      },
    ],
  },
  {
    id: "shampoo",
    cat: "car",
    price: 86000,
    img: "images/prod-shampoo.jpg",
    gallery: ["images/prod-shampoo.jpg", "images/news-car.jpg"],
    name: "Noir Shampoo",
    desc: {
      uz: "pH-neytral avto-shampun — mum qatlamini saqlaydi",
      ru: "pH-нейтральный автошампунь — бережёт воск",
      en: "pH-neutral car shampoo — wax-safe",
    },
    spec: { uz: "1:200 konsentrat", ru: "1:200 концентрат", en: "1:200 concentrate" },
    volume: "1 L",
    color: "#14161A",
    rating: 4.96,
    reviewsCount: 172,
    batchCode: "DL-26-S01",
    unitsPerBox: 12,
    stock: 210,
    compare: {
      ph: "7.0 (Mutlaq neytral)",
      scent: { uz: "Nozik qora muskus", ru: "Тонкий чёрный мускус", en: "Subtle black musk" },
      surfaces: { uz: "Avto bo'yoq, mumlangan yuzalar", ru: "Кузов авто, восковые покрытия", en: "Car paint, waxed finishes" },
      safety: { uz: "Mumni yuvib tashlamaydi", ru: "Бережёт воск и керамику", en: "Wax & ceramic safe" },
      concentration: "1:200 ultra-konsentrat",
      origin: "Namangan zavodi, 2026",
    },
    reviews: [
      {
        id: "r5",
        author: "Javohir N.",
        city: "Andijon",
        rating: 5,
        date: "14 Feb 2026",
        comment: {
          uz: "Ko'pigi juda quyuq. Lakka umuman ziyon yetkazmaydi.",
          ru: "Пена невероятно плотная. Лак кузова остаётся в идеале.",
          en: "Foam is super thick. Keeps the clear coat flawless.",
        },
        verified: true,
      },
    ],
    features: [
      { uz: "pH 7.0 mutlaq neytral", ru: "pH 7.0 абсолютно нейтрален", en: "pH 7.0 balanced" },
      { uz: "Yuqori konsentratsiya 1:200", ru: "Концентрат 1:200", en: "Concentrated 1:200" },
    ],
    usage: {
      uz: "10 litr suvga 50 ml qo'shing. Ko'pik pistoleti yoki chelakda ishlatiladi.",
      ru: "Добавьте 50 мл в 10 литров воды. Используется в пенокомплекте или ведре.",
      en: "Add 50 ml to 10 litres of water. Use in a foam lance or bucket.",
    },
    composition: {
      uz: "APG-PAV, glitserin, polimer stabilizator, UV-filtr.",
      ru: "АПГ-ПАВ, глицерин, полимерный стабилизатор, UV-фильтр.",
      en: "APG surfactant, glycerin, polymer stabiliser, UV filter.",
    },
    story: {
      uz: "Noir — bu bizning birinchi mahsulotimiz. Hali ham zavodning eng ko'p sotiladigan formulasi.",
      ru: "Noir — наш первый продукт. До сих пор самая продаваемая формула на заводе.",
      en: "Noir was our very first product. It remains the best-selling formula at the plant.",
    },
    tips: [
      {
        uz: "Ikki chelak usuli — eng xavfsiz",
        ru: "Метод двух вёдер — самый безопасный",
        en: "The two-bucket method is the safest",
      },
    ],
  },
  {
    id: "cloud",
    cat: "home",
    price: 54000,
    badge: "new",
    img: "images/prod-cloud.jpg",
    gallery: ["images/prod-cloud.jpg", "images/prod-floor.jpg", "images/cat-home.jpg"],
    name: "Cloud Softener",
    desc: {
      uz: "Kiyim yumshatgichi — 40 yuvish uchun",
      ru: "Кондиционер для белья — на 40 стирок",
      en: "Fabric conditioner — 40 washes",
    },
    spec: { uz: "Gipoallergen", ru: "Гипоаллергенный", en: "Hypoallergenic" },
    volume: "1.5 L",
    color: "#EBE8DD",
    rating: 4.89,
    reviewsCount: 64,
    batchCode: "DL-26-C07",
    unitsPerBox: 8,
    stock: 14,
    compare: {
      ph: "5.5 (Teri uchun ideal)",
      scent: { uz: "Nozik oppoq paxta", ru: "Нежный белый хлопок", en: "Soft white cotton" },
      surfaces: { uz: "Barcha turdagi matolar, kiyim", ru: "Все виды тканей, одежда, постельное бельё", en: "All textiles, apparel, linen" },
      safety: { uz: "Gipoallergen, bolalarga mos", ru: "Гипоаллергенно, для детей", en: "Hypoallergenic, baby safe" },
      concentration: "40 marta yuvish",
      origin: "Namangan zavodi, 2026",
    },
    reviews: [
      {
        id: "r6",
        author: "Zarina U.",
        city: "Buxoro",
        rating: 5,
        date: "10 Feb 2026",
        comment: {
          uz: "Sochiqlar bulut kabi yumshoq bo'ldi, hidi esa nozik paxta ifori.",
          ru: "Полотенца как облако, аромат лёгкого хлопка держится днями.",
          en: "Towels feel like clouds, the soft cotton scent lasts days.",
        },
        verified: true,
      },
    ],
    features: [
      { uz: "Gipoallergen sinovdan o'tgan", ru: "Протестировано дерматологами", en: "Dermatologically tested" },
      { uz: "Oson dazmollash effekti", ru: "Эффект лёгкого глажения", en: "Easy iron effect" },
    ],
    usage: {
      uz: "30 ml ni mashinaning yumshatgichi bo'limiga quying.",
      ru: "Добавьте 30 мл в отсек для кондиционера.",
      en: "Pour 30 ml into the fabric softener compartment.",
    },
    composition: {
      uz: "Kation PAВ, parfyumeriya kompozitsiyasi, limon kislotasi.",
      ru: "Катионные ПАВ, парфюмерная композиция, лимонная кислота.",
      en: "Cationic surfactant, fragrance, citric acid.",
    },
    story: {
      uz: "Cloud — eng yumshoq formulamiz. Bolalar kiyimlari uchun tavsiya etiladi.",
      ru: "Cloud — наша самая мягкая формула. Рекомендована для детской одежды.",
      en: "Cloud is our softest formula. Recommended for children's clothing.",
    },
    tips: [
      {
        uz: "Sport kiyimlari uchun 15 ml yetarli",
        ru: "Для спортивной одежды достаточно 15 мл",
        en: "15 ml is enough for sportswear",
      },
    ],
  },
  {
    id: "interior",
    cat: "car",
    price: 92000,
    img: "images/prod-interior.jpg",
    gallery: ["images/prod-interior.jpg", "images/prod-shampoo.jpg", "images/cat-car.jpg"],
    name: "Velvet Interior",
    desc: {
      uz: "Salon uchun universal tozalovchi — charm va plastik",
      ru: "Универсал для салона — кожа и пластик",
      en: "All-surface interior cleaner — leather & plastic",
    },
    spec: { uz: "Antistatik effekt", ru: "Антистатический эффект", en: "Anti-static effect" },
    volume: "500 ml",
    color: "#46584E",
    rating: 4.93,
    reviewsCount: 118,
    batchCode: "DL-26-I03",
    unitsPerBox: 24,
    stock: 145,
    compare: {
      ph: "7.0 (Neytral)",
      scent: { uz: "Yangi charm va vanil", ru: "Свежая кожа и ваниль", en: "Fresh leather & vanilla" },
      surfaces: { uz: "Tabiiy charm, vinil, plastik", ru: "Натуральная кожа, винил, пластик", en: "Leather, vinyl, dashboard plastic" },
      safety: { uz: "Yog'siz matoviy qatlam", ru: "Матовый финиш без жирного слоя", en: "Non-greasy matte finish" },
      concentration: "Sprey (tayyor)",
      origin: "Namangan zavodi, 2026",
    },
    reviews: [
      {
        id: "r7",
        author: "Otabek S.",
        city: "Qarshi",
        rating: 5,
        date: "09 Feb 2026",
        comment: {
          uz: "Plastikdagi chang va yog'larni bir zumda tozaladi, matoviy original holiga qaytdi.",
          ru: "Очистил пластик и кожу до оригинального матового состояния без жирного блеска.",
          en: "Restored plastic and leather to original factory matte look without grease.",
        },
        verified: true,
      },
    ],
    features: [
      { uz: "Matoviy original ko'rinish", ru: "Матовый оригинальный финиш", en: "Original matte finish" },
      { uz: "Tabiiy charm uchun xavfsiz", ru: "Безопасно для натуральной кожи", en: "Safe for genuine leather" },
    ],
    usage: {
      uz: "Sirtni püskürtün, 30 soniya kuting, yumshoq cho'tka yoki mikrofiber bilan arting.",
      ru: "Распылите на поверхность, подождите 30 секунд, протрите мягкой щёткой или микрофиброй.",
      en: "Spray the surface, wait 30 seconds, wipe with a soft brush or microfibre cloth.",
    },
    composition: {
      uz: "APG-PAV, silikon emulsiyasi, parfyumeriya.",
      ru: "АПГ-ПАВ, силиконовая эмульсия, парфюмерия.",
      en: "APG surfactant, silicone emulsion, fragrance.",
    },
    story: {
      uz: "Salon tozaligi — bu haydovchining kayfiyati.",
      ru: "Чистота салона — это настроение водителя.",
      en: "A clean interior is the driver's mood.",
    },
    tips: [
      {
        uz: "Charm uchun avval kichik joyda sinab ko'ring",
        ru: "На коже сначала проверьте на небольшом участке",
        en: "Test on a small patch of leather first",
      },
    ],
  },
  {
    id: "kitchen",
    cat: "home",
    price: 46000,
    badge: "best",
    img: "images/prod-kitchen.jpg",
    gallery: ["images/prod-kitchen.jpg", "images/prod-glass.jpg", "images/cat-home.jpg"],
    name: "Kitchen №2",
    desc: {
      uz: "Oshxona uchun — yog' va kuygan izlarni olib tashlaydi",
      ru: "Для кухни — удаляет жир и нагар",
      en: "For kitchens — cuts grease and burnt residue",
    },
    spec: { uz: "Oziq-ovqat uchun xavfsiz", ru: "Безопасно для продуктов", en: "Food-contact safe" },
    volume: "500 ml",
    color: "#A9C39E",
    rating: 4.91,
    reviewsCount: 156,
    batchCode: "DL-26-K02",
    unitsPerBox: 24,
    stock: 0,
    compare: {
      ph: "10.5 (Yog' erituvchi ishqoriy)",
      scent: { uz: "Yovvoyi greyfrut va limon", ru: "Грейпфрут и лимон", en: "Wild grapefruit & citrus" },
      surfaces: { uz: "Plita, duxovka, marmar, kafel", ru: "Плита, духовка, вытяжка, фартук", en: "Stovetops, ovens, range hoods, tile" },
      safety: { uz: "Oziq-ovqat yuzalariga xavfsiz", ru: "Безопасно в зоне готовки", en: "Food-contact area safe" },
      concentration: "Sprey (faol formula)",
      origin: "Namangan zavodi, 2026",
    },
    reviews: [
      {
        id: "r8",
        author: "Shahnoza K.",
        city: "Nukus",
        rating: 5,
        date: "04 Feb 2026",
        comment: {
          uz: "Plita va duxovkadagi qotib qolgan yog'larni 2 daqiqada eritdi. Super!",
          ru: "Застарелый жир на плите растаял за 2 минуты без едкого запаха.",
          en: "Stubborn oven grease melted in 2 minutes with no harsh odor.",
        },
        verified: true,
      },
    ],
    features: [
      { uz: "Kuchli yog' erituvchi formula", ru: "Мощная антижир формула", en: "Powerful grease dissolve" },
      { uz: "O'tkir hidsiz", ru: "Без едкого едкого запаха", en: "No harsh fumes" },
    ],
    usage: {
      uz: "Sirtni püskürtün, 2 daqiqa kuting, suv bilan yuvib tashlang.",
      ru: "Распылите, подождите 2 минуты, смойте водой.",
      en: "Spray, wait 2 minutes, rinse with water.",
    },
    composition: {
      uz: "Natriy gidroksid, limon kislotasi, bio-PAV.",
      ru: "Гидроксид натрия, лимонная кислота, био-ПАВ.",
      en: "Sodium hydroxide, citric acid, bio surfactant.",
    },
    story: {
      uz: "Oshxonadagi eng qiyin yog'lar uchun.",
      ru: "Для самых сложных кухонных загрязнений.",
      en: "For the toughest kitchen grease.",
    },
    tips: [
      {
        uz: "Duxovkada — 5 daqiqa va bir marta artish",
        ru: "В духовке — 5 минут и один проход",
        en: "In the oven — 5 minutes and one wipe",
      },
    ],
  },
  {
    id: "wheel",
    cat: "car",
    price: 74000,
    img: "images/prod-wheel.jpg",
    gallery: ["images/prod-wheel.jpg", "images/prod-wax.jpg", "images/news-car.jpg"],
    name: "Iron Wheel",
    desc: {
      uz: "Disklar uchun — temir zarrachalarini olib tashlaydi",
      ru: "Для дисков — удаляет металлические частицы",
      en: "For wheels — dissolves iron particles",
    },
    spec: { uz: "Rang o'zgaradi — ko'kdan qizilga", ru: "Меняет цвет — с синего на красный", en: "Changes colour — blue to red" },
    volume: "500 ml",
    color: "#3F6B52",
    rating: 4.97,
    reviewsCount: 183,
    batchCode: "DL-26-W08",
    unitsPerBox: 24,
    stock: 88,
    compare: {
      ph: "6.5 (Disk lakiga xavfsiz)",
      scent: { uz: "Neytral efirli", ru: "Нейтральный с эфирным оттенком", en: "Neutral fresh" },
      surfaces: { uz: "Qotishma disklar, tormoz kaliperlari", ru: "Литые диски, суппорты", en: "Alloy wheels, calipers" },
      safety: { uz: "Kislotasiz, rang indikatori", ru: "Бескислотный, с индикатором", en: "Acid-free, color indicator" },
      concentration: "Sprey (faol)",
      origin: "Namangan zavodi, 2026",
    },
    reviews: [
      {
        id: "r9",
        author: "Rustam B.",
        city: "Toshkent",
        rating: 5,
        date: "01 Feb 2026",
        comment: {
          uz: "Diskka sepgach binafsha rangga aylanadi va tormoz changini tozalaydi. Disklar yangiday!",
          ru: "При реакции с тормозной пылью меняет цвет на фиолетовый. Диски как новые!",
          en: "Turns purple reacting to brake dust. Wheels look brand new!",
        },
        verified: true,
      },
    ],
    features: [
      { uz: "Rang indikatori orqali ta'sir nazorati", ru: "Цветовой индикатор реакции", en: "Color changing indicator" },
      { uz: "Disk lakiga va tormozga xavfsiz", ru: "Безопасно для тормозов и лака", en: "Safe for calipers and clearcoat" },
    ],
    usage: {
      uz: "Sovuq diskka püskürtün, 3 daqiqa kuting, yuqori bosimli suv bilan yuvib tashlang.",
      ru: "Распылите на холодный диск, подождите 3 минуты, смойте водой под давлением.",
      en: "Spray on a cool wheel, wait 3 minutes, rinse with high-pressure water.",
    },
    composition: {
      uz: "Natriy tioglikolat, bio-PAV, parfyumeriya.",
      ru: "Тиогликолат натрия, био-ПАВ, парфюмерия.",
      en: "Sodium thioglycolate, bio surfactant, fragrance.",
    },
    story: {
      uz: "Rang o'zgarishi — reaksiya ishlashini ko'rsatadi.",
      ru: "Смена цвета — сигнал, что реакция работает.",
      en: "The colour change means the reaction is working.",
    },
    tips: [
      {
        uz: "Issiq diskka ishlatmang",
        ru: "Не используйте на горячих дисках",
        en: "Don't use on hot wheels",
      },
    ],
  },
];

export const CAT_COUNTS: Record<Cat, number> = {
  home: PRODUCTS.filter((p) => p.cat === "home").length,
  car: PRODUCTS.filter((p) => p.cat === "car").length,
};

export type NewsItem = {
  id: string;
  kind: "video" | "article";
  cover?: string;
  typo?: { num: string; tint: "sage" | "graphite" };
  duration: string;
  title: L10n;
  tag?: L10n;
  steps?: L10n[];
};

export const NEWS: NewsItem[] = [
  {
    id: "n1",
    kind: "video",
    cover: "images/news-car.jpg",
    duration: "0:25",
    tag: { uz: "Avto", ru: "Авто", en: "Car" },
    title: {
      uz: "Avtoni chiziqlarsiz yuvish",
      ru: "Мойка авто без царапин",
      en: "Washing a car without scratches",
    },
    steps: [
      {
        uz: "Avval chang va qumni suv bilan yuvib tashlang — aynan qum chiziqlar qoldiradi",
        ru: "Сначала смойте пыль и песок водой — именно песок оставляет царапины",
        en: "First rinse off dust and sand with water — sand is what leaves scratches",
      },
      {
        uz: "Shampunni yumshoq gubkaga surtib, yuqoridan pastga yuving",
        ru: "Нанесите шампунь на мягкую губку, мойте сверху вниз",
        en: "Apply shampoo to a soft mitt and wash top to bottom",
      },
      {
        uz: "Ko'pikni yuvib, darhol mikrofiber bilan quriting",
        ru: "Смойте пену и сразу высушите микрофиброй — не давайте каплям высохнуть",
        en: "Rinse off the foam and dry with microfiber right away",
      },
      {
        uz: "Himoya mumi surting — yaltirash uzoq saqlanadi, kamroq ifloslanadi",
        ru: "Нанесите защитный воск — блеск дольше, грязи прилипает меньше",
        en: "Apply protective wax — longer shine, less dirt sticks",
      },
    ],
  },
  {
    id: "n2",
    kind: "video",
    cover: "images/prod-glass.jpg",
    duration: "0:20",
    tag: { uz: "Uy", ru: "Дом", en: "Home" },
    title: {
      uz: "Oynalar: uch qoida",
      ru: "Стёкла без разводов",
      en: "Glass: three rules",
    },
    steps: [
      {
        uz: "Tozalagichni nam mikrofiberga surtib, oynani arting",
        ru: "Нанесите очиститель на влажную микрофибру и протрите стекло",
        en: "Apply cleaner to a damp microfiber cloth and wipe the glass",
      },
      {
        uz: "Quruq latta bilan qolgan moddani arting",
        ru: "Сухой тканью снимите остатки средства",
        en: "Remove remaining product with a dry cloth",
      },
      {
        uz: "Tashqaridan vertikal, ichkaridan gorizontal — izlar shunda ko'rinadi",
        ru: "Снаружи — вертикально, внутри — горизонтально: так видно разводы",
        en: "Vertical outside, horizontal inside — streaks become visible",
      },
    ],
  },
  {
    id: "n3",
    kind: "video",
    cover: "images/prod-floor.jpg",
    duration: "0:20",
    tag: { uz: "Uy", ru: "Дом", en: "Home" },
    title: {
      uz: "Laminat parvarishi",
      ru: "Уход за ламинатом",
      en: "Caring for laminate",
    },
    steps: [
      {
        uz: "Supurib yoki changyutkich bilan o'ting — qum qoplamani tirnaydi",
        ru: "Подметите или пропылесосьте — песок царапает покрытие",
        en: "Sweep or vacuum first — sand scratches the floor",
      },
      {
        uz: "Vositani suvda suyultiring: 5 litrga 2 qopqoq",
        ru: "Разведите средство: 2 колпачка на 5 литров воды",
        en: "Dilute the product: 2 caps per 5 liters of water",
      },
      {
        uz: "Yaxshi siqilgan shvabra bilan arting — ko'lmak qoldirmang",
        ru: "Протрите хорошо отжатой шваброй — без луж",
        en: "Wipe with a well-wrung mop — no puddles",
      },
      {
        uz: "Oyiga bir marta politol — yaltiroqlikni qaytaradi",
        ru: "Раз в месяц — полироль, чтобы вернуть блеск",
        en: "Once a month use polish to restore the shine",
      },
    ],
  },
  {
    id: "n4",
    kind: "video",
    cover: "images/cat-car.jpg",
    duration: "0:14",
    tag: { uz: "Avto", ru: "Авто", en: "Car" },
    title: {
      uz: "Disklar va shinalar",
      ru: "Диски и шины",
      en: "Wheels and tires",
    },
    steps: [
      {
        uz: "Diskni suv bilan ho'llab, tozalagich surting",
        ru: "Смочите диск водой и нанесите очиститель",
        en: "Wet the wheel and apply the cleaner",
      },
      {
        uz: "Cho'tka bilan tozalab, suv bilan yuvib tashlang",
        ru: "Почистите щёткой и смойте водой",
        en: "Scrub with a brush and rinse off",
      },
      {
        uz: "Shinalarga konditsioner surting — yangi ko'rinish va rezina himoyasi",
        ru: "Нанесите кондиционер для шин — свежий вид и защита резины",
        en: "Apply tire conditioner — fresh look and rubber protection",
      },
    ],
  },
  {
    id: "n5",
    kind: "video",
    cover: "images/cat-home.jpg",
    duration: "0:14",
    tag: { uz: "Uy", ru: "Дом", en: "Home" },
    title: {
      uz: "Oshxona 10 daqiqada",
      ru: "Кухня за 10 минут",
      en: "Kitchen in 10 minutes",
    },
    steps: [
      {
        uz: "Vositani sirtga purkang",
        ru: "Распылите средство на поверхность",
        en: "Spray the product onto the surface",
      },
      {
        uz: "1–2 daqiqa kuting — yog' o'zi eriydi",
        ru: "Оставьте на 1–2 минуты — жир растворится",
        en: "Wait 1–2 minutes — grease dissolves",
      },
      {
        uz: "Gubka bilan artib, suv bilan yuving",
        ru: "Протрите губкой и смойте водой",
        en: "Wipe with a sponge and rinse",
      },
    ],
  },
  {
    id: "n6",
    kind: "video",
    cover: "images/prod-shampoo.jpg",
    duration: "0:15",
    tag: { uz: "Uy", ru: "Дом", en: "Home" },
    title: {
      uz: "Obiyka va to'qimachilik",
      ru: "Обивка и текстиль",
      en: "Upholstery and textiles",
    },
    steps: [
      {
        uz: "Obiykani changyutkich bilan tozalang",
        ru: "Пропылесосьте обивку",
        en: "Vacuum the upholstery",
      },
      {
        uz: "Dog'ga ko'pik surtib, yumshoq cho'tka bilan ishqalang",
        ru: "Вспеньте средство на пятне, потрите мягкой щёткой",
        en: "Foam the product on the stain and scrub gently",
      },
      {
        uz: "Ko'pikni quruq latta bilan yig'ing",
        ru: "Соберите пену сухой тканью",
        en: "Collect the foam with a dry cloth",
      },
      {
        uz: "Xonani shamollating — obiyka yangiday",
        ru: "Проветрите — и обивка как новая",
        en: "Air the room — upholstery looks new",
      },
    ],
  },
];

export type DeliveryMethod = "courier_uzb" | "bts_express" | "pickup";
export type PaymentMethod =
  | "payme"
  | "click"
  | "paynet"
  | "uzum"
  | "card_uz"
  | "card_intl"
  | "cash"
  | "stars";

export type OrderItem = {
  id: string;
  name: string;
  qty: number;
  price: number;
  img: string;
};

export type CourierStatus = "assigned" | "picking" | "onway" | "nearby" | "delivered";

export type CourierInfo = {
  id: string;
  name: string;
  phone: string;
  avatar: string;
  rating: string;
  vehicle: string;
  status: CourierStatus;
  eta: string; // e.g. "18:40"
  progress: number; // 0..100 for map
  live: boolean;
};

export type Order = {
  id: string;
  date: string;
  createdAt: number;
  subtotal: number;
  discount: number;
  promoCode?: string;
  deliveryFee: number;
  total: number;
  count: number;
  items: OrderItem[];
  deliveryMethod: DeliveryMethod;
  deliveryZone?: string;
  deliveryAddress: string;
  deliveryTime: string;
  recipientName: string;
  recipientPhone: string;
  customerTgId?: number;
  /** Verified source identity; browser guests use signed negative internal IDs. */
  customerSource?: "telegram" | "browser";
  customerUsername?: string;
  customerName?: string; // first_name from Telegram client
  paymentMethod: PaymentMethod;
  paymentStatus: "paid" | "pending" | "cod";
  /** Server-side Telegram notification delivery state for the admin inbox. */
  adminNotifiedAt?: string;
  adminNotifyAttempts?: number;
  /** Hosted Payme/Click URL generated by the server from runtime config. */
  paymentUrl?: string | null;
  /** Server-calculated DELIS Stars awarded after payment/delivery. */
  expectedStars?: number;
  status: "new" | "preparing" | "shipped" | "delivered" | "canceled";
  courierNote?: string;
  courier?: CourierInfo;
  cardMeta?: {
    last4: string;
    type: "humo" | "uzcard" | "visa" | "mastercard";
    holder: string;
  };
};

export type PromoCode = {
  code: string;
  type: "percent" | "fixed" | "freeship";
  value: number; // 15 for 15%, 20000 for 20k UZS
  minSpend?: number;
  maxDiscount?: number;
  requiredProductId?: string;
  retailOnly?: boolean;
  title: L10n;
  active?: boolean;
};

export const PROMO_CODES: Record<string, PromoCode> = {
  DELIS15: {
    code: "DELIS15",
    type: "percent",
    value: 15,
    title: {
      uz: "15% chegirma — birinchi buyurtma",
      ru: "Скидка 15% на первый заказ",
      en: "15% off first order",
    },
    active: true,
  },
  WELCOME10: {
    code: "WELCOME10",
    type: "percent",
    value: 10,
    title: {
      uz: "10% xush kelibsiz chegirmasi",
      ru: "Скидка 10% для новых клиентов",
      en: "10% welcome discount",
    },
    active: true,
  },
  FREESHIP: {
    code: "FREESHIP",
    type: "freeship",
    value: 0,
    title: {
      uz: "Bepul yetkazib berish",
      ru: "Бесплатная доставка",
      en: "Free delivery coupon",
    },
    active: true,
  },
  UZB2026: {
    code: "UZB2026",
    type: "fixed",
    value: 20000,
    minSpend: 100000,
    title: {
      uz: "20 000 so'm chegirma (100 000+ so'm)",
      ru: "Скидка 20 000 сум (от 100 000 сум)",
      en: "20,000 UZS off (orders 100k+)",
    },
    active: true,
  },
  BDAY10: {
    code: "BDAY10",
    type: "percent",
    value: 10,
    title: {
      uz: "🎂 Tug'ilgan kun sovg'asi — 10%",
      ru: "🎂 Подарок на день рождения — 10%",
      en: "🎂 Birthday gift — 10% off",
    },
    active: true,
  },
  BOTTLES15: {
    code: "BOTTLES15",
    type: "percent",
    value: 15,
    title: {
      uz: "♻️ Ekoprogramma: 5 flakon → 15%",
      ru: "♻️ Экопрограмма: 5 флаконов → 15%",
      en: "♻️ Eco program: 5 bottles → 15% off",
    },
    active: true,
  },
};

/* ─────────── Manageable promo codes ───────────
   Merge order: defaults < server-hydrated < admin-local overrides.
   The server is authoritative at checkout time; the local copy is only
   for instant display/offline estimates. */

/** Cache of promos fetched from the server (written by hydrateServerPromos). */
const SERVER_PROMOS_KEY = "delis_server_promos";

/** Shape returned by GET /v1/promos (kept loose to avoid a circular import). */
export type ServerPromo = {
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

export function serverPromosToMap(list: ServerPromo[]): Record<string, PromoCode> {
  const map: Record<string, PromoCode> = {};
  for (const p of list) {
    map[p.code] = {
      code: p.code,
      type: (p.type === "fixed" || p.type === "freeship" ? p.type : "percent") as PromoCode["type"],
      value: p.value,
      minSpend: p.minSpend || 0,
      maxDiscount: p.maxDiscount ?? undefined,
      requiredProductId: p.required_product_id || undefined,
      title: {
        uz: p.title_uz || p.code,
        ru: p.title_ru || p.title_uz || p.code,
        en: p.title_en || p.title_ru || p.title_uz || p.code,
      },
      active: p.active === 1,
    };
  }
  return map;
}

/** Persist the server's promo list locally (called once per app start). */
export function hydrateServerPromos(list: ServerPromo[]): void {
  try {
    localStorage.setItem(SERVER_PROMOS_KEY, JSON.stringify(list));
  } catch {}
}

/**
 * Register a single personal coupon (e.g. issued by /v1/stars/redeem) in the
 * local override layer so the checkout UI can display and apply it instantly.
 * The server still re-validates it authoritatively at order time.
 */
export function addLocalPromoOverride(promo: PromoCode): void {
  try {
    const raw = localStorage.getItem("delis_promo_codes");
    const parsed = raw ? (JSON.parse(raw) as Record<string, PromoCode>) : {};
    parsed[promo.code] = promo;
    localStorage.setItem("delis_promo_codes", JSON.stringify(parsed));
  } catch {}
}

function loadServerPromos(): Record<string, PromoCode> {
  try {
    const raw = localStorage.getItem(SERVER_PROMOS_KEY);
    if (raw) return serverPromosToMap(JSON.parse(raw) as ServerPromo[]);
  } catch {}
  return {};
}

export function loadPromoCodes(): Record<string, PromoCode> {
  const merged: Record<string, PromoCode> = { ...PROMO_CODES, ...loadServerPromos() };
  try {
    const raw = localStorage.getItem("delis_promo_codes");
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, PromoCode>;
      Object.entries(parsed).forEach(([code, promo]) => {
        merged[code] = { ...merged[code], ...promo };
      });
    }
  } catch {}
  return merged;
}

export function savePromoCodes(codes: Record<string, PromoCode>): void {
  try {
    localStorage.setItem("delis_promo_codes", JSON.stringify(codes));
  } catch {}
}

export function isPromoActive(code: string, codes: Record<string, PromoCode> = loadPromoCodes()): boolean {
  return codes[code]?.active !== false;
}

export type Region = {
  id: string;
  uz: string;
  ru: string;
  en: string;
  districts: string[];
};

/* ---------------- Regional delivery tariffs ----------------
   Real logistics from the DELIS factory in Turakurgan, Namangan.
   `courier` — door-to-door price in UZS, `bts` — pickup-point price,
   `days` — estimated delivery window [min, max]. */
export type RegionTariff = { courier: number; bts: number; days: [number, number] };

export const REGION_TARIFFS: Record<string, RegionTariff> = {
  namangan: { courier: 12000, bts: 9000, days: [1, 1] },
  fergana: { courier: 16000, bts: 11000, days: [1, 2] },
  andijan: { courier: 16000, bts: 11000, days: [1, 2] },
  tashkent_city: { courier: 20000, bts: 14000, days: [1, 2] },
  tashkent_reg: { courier: 24000, bts: 16000, days: [2, 3] },
  syrdarya: { courier: 26000, bts: 17000, days: [2, 3] },
  jizzakh: { courier: 28000, bts: 18000, days: [2, 3] },
  samarkand: { courier: 30000, bts: 19000, days: [2, 3] },
  navoi: { courier: 32000, bts: 21000, days: [2, 4] },
  kashkadarya: { courier: 36000, bts: 23000, days: [3, 4] },
  bukhara: { courier: 36000, bts: 23000, days: [3, 4] },
  surkhandarya: { courier: 42000, bts: 27000, days: [3, 5] },
  khorezm: { courier: 45000, bts: 29000, days: [3, 5] },
  karakalpakstan: { courier: 52000, bts: 33000, days: [4, 6] },
};

export const DEFAULT_TARIFF: RegionTariff = { courier: 30000, bts: 20000, days: [2, 4] };

/* ─────────── Admin-editable delivery config (server → localStorage override) ─────────── */
export type DeliveryConfig = {
  freeShippingThreshold: number;
  tariffs: Record<string, RegionTariff>;
  defaultTariff: RegionTariff;
};
const DELIVERY_CONFIG_KEY = "delis_delivery_config";

export function hydrateDeliveryConfig(cfg: DeliveryConfig): void {
  try {
    localStorage.setItem(DELIVERY_CONFIG_KEY, JSON.stringify(cfg));
  } catch {}
}
function loadDeliveryConfigRaw(): DeliveryConfig | null {
  try {
    const raw = localStorage.getItem(DELIVERY_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeliveryConfig;
    if (typeof parsed.freeShippingThreshold === "number" && typeof parsed.tariffs === "object") return parsed;
  } catch {}
  return null;
}
export function getDeliveryConfig(): DeliveryConfig {
  const stored = loadDeliveryConfigRaw();
  if (stored) return stored;
  return { freeShippingThreshold: 150_000, tariffs: REGION_TARIFFS, defaultTariff: DEFAULT_TARIFF };
}
export function getFreeShippingThreshold(): number {
  return getDeliveryConfig().freeShippingThreshold;
}

/* ─────────── Cart nudge: 3% off big carts, capped at 10 000 UZS ───────────
 * Mirrors server/src/growth-offers.ts CART_NUDGE. Exclusive: it never stacks
 * with a promo code or wholesale quantities, so the seller margin is safe. */
export type CartNudge = { threshold: number; percent: number; maxDiscount: number };
export const CART_NUDGE: CartNudge = { threshold: 500_000, percent: 3, maxDiscount: 10_000 };
export function getCartNudge(): CartNudge {
  return CART_NUDGE;
}
export function cartNudgeDiscount(subtotal: number, nudge: CartNudge): number {
  if (subtotal < nudge.threshold) return 0;
  return Math.min(Math.floor((subtotal * nudge.percent) / 100), nudge.maxDiscount);
}
export function getRegionTariff(regionId: string): RegionTariff {
  const cfg = getDeliveryConfig();
  return cfg.tariffs[regionId] ?? cfg.defaultTariff ?? REGION_TARIFFS[regionId] ?? DEFAULT_TARIFF;
}

/* ─────────── Stars helpers: cashback rate & stars ─────────── */

export function cashbackRate(stars: number): number {
  return stars >= 1500 ? 0.08 : stars >= 500 ? 0.05 : 0.03;
}

/** How many stars the customer earns for a given price with current balance. */
export function cashbackStars(price: number, stars: number): number {
  return Math.round((price * cashbackRate(stars)) / 100);
}

/* ─────────── Birthday (for bot congratulations + promo) ─────────── */

const BIRTHDAY_KEY = "delis_birthday"; // "MM-DD"

export function loadBirthday(): string {
  try {
    return localStorage.getItem(BIRTHDAY_KEY) || "";
  } catch {
    return "";
  }
}

export function saveBirthday(mmdd: string) {
  try {
    localStorage.setItem(BIRTHDAY_KEY, mmdd);
  } catch { /* ignore */ }
}

export function isBirthdayToday(mmdd: string): boolean {
  if (!mmdd) return false;
  const now = new Date();
  const today = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return mmdd === today;
}

/* ─────────── Eco program: empty bottles → discount ─────────── */

const BOTTLES_KEY = "delis_bottles";
export const BOTTLES_TARGET = 5;

export function loadBottles(): number {
  try {
    return Number(localStorage.getItem(BOTTLES_KEY) || "0");
  } catch {
    return 0;
  }
}

export function addBottles(n: number): number {
  const next = Math.min(BOTTLES_TARGET, loadBottles() + n);
  try {
    localStorage.setItem(BOTTLES_KEY, String(next));
  } catch { /* ignore */ }
  return next;
}

export function resetBottles() {
  try {
    localStorage.removeItem(BOTTLES_KEY);
  } catch { /* ignore */ }
}

/* ─────────── Daily Deal (admin-managed) ─────────── */

export type DailyDealConfig = {
  productId: string;
  discount: number; // percent 0-90
  enabled: boolean;
  title?: string; // optional custom title
};

const DEAL_KEY = "delis_daily_deal";

export const DEFAULT_DEAL: DailyDealConfig = { productId: "wax", discount: 15, enabled: false };

export function loadDailyDeal(): DailyDealConfig {
  try {
    const raw = localStorage.getItem(DEAL_KEY);
    if (raw) return { ...DEFAULT_DEAL, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_DEAL;
}

export function saveDailyDeal(config: DailyDealConfig) {
  try {
    localStorage.setItem(DEAL_KEY, JSON.stringify(config));
  } catch { /* ignore */ }
}

/** Seconds until midnight — for the live deal timer */
export function secondsUntilMidnight(): number {
  const now = new Date();
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return Math.max(0, Math.round((end.getTime() - now.getTime()) / 1000));
}

/* ─────────── Job applications (careers form) ─────────── */

export type JobPositionId = "agent" | "courier" | "factory" | "manager" | "smm";

export type JobApp = {
  id: string;
  position: JobPositionId;
  name: string;
  phone: string;
  note?: string;
  createdAt: number;
  status: "new" | "contacted" | "closed";
};

const JOB_APPS_KEY = "delis_job_apps";

export function loadJobApps(): JobApp[] {
  try {
    return JSON.parse(localStorage.getItem(JOB_APPS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addJobApp(app: Omit<JobApp, "id" | "createdAt" | "status">): JobApp {
  const full: JobApp = { ...app, id: `j${Date.now()}`, createdAt: Date.now(), status: "new" };
  try {
    localStorage.setItem(JOB_APPS_KEY, JSON.stringify([full, ...loadJobApps()]));
  } catch { /* ignore */ }
  return full;
}

export function saveJobApps(list: JobApp[]) {
  try {
    localStorage.setItem(JOB_APPS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

export const UZBEKISTAN_REGIONS: Region[] = [
  {
    id: "tashkent_city",
    uz: "Toshkent shahri",
    ru: "г. Ташкент",
    en: "Tashkent City",
    districts: [
      "Mirobod tumani",
      "Yunusobod tumani",
      "Chilonzor tumani",
      "Shayxontohur tumani",
      "Yakkasaroy tumani",
      "Mirzo Ulug'bek tumani",
      "Yashnobod tumani",
      "Sergeli tumani",
      "Uchtepa tumani",
      "Olmazor tumani",
      "Bektemir tumani",
      "Yangihayot tumani",
    ],
  },
  {
    id: "tashkent_reg",
    uz: "Toshkent viloyati",
    ru: "Ташкентская область",
    en: "Tashkent Region",
    districts: [
      "Nurafshon shahri",
      "Angren shahri",
      "Bekobod shahri",
      "Chirchiq shahri",
      "Olmaliq shahri",
      "Ohangaron tumani",
      "Bo'ka tumani",
      "Yangiyo'l tumani",
      "Parkent tumani",
      "Piskent tumani",
      "Zangiota tumani",
      "Qibray tumani",
    ],
  },
  {
    id: "samarkand",
    uz: "Samarqand viloyati",
    ru: "Самаркандская область",
    en: "Samarkand Region",
    districts: [
      "Samarqand shahri",
      "Kattaqo'rg'on shahri",
      "Urgut tumani",
      "Bulung'ur tumani",
      "Jomboy tumani",
      "Ishtixon tumani",
      "Oqdaryo tumani",
      "Pastdarg'om tumani",
      "Payariq tumani",
      "Nurobod tumani",
    ],
  },
  {
    id: "bukhara",
    uz: "Buxoro viloyati",
    ru: "Бухарская область",
    en: "Bukhara Region",
    districts: [
      "Buxoro shahri",
      "Kogon shahri",
      "G'ijduvon tumani",
      "Vobkent tumani",
      "Romitan tumani",
      "Jondor tumani",
      "Qorako'l tumani",
      "Olot tumani",
      "Peshku tumani",
      "Shofirkon tumani",
    ],
  },
  {
    id: "fergana",
    uz: "Farg'ona viloyati",
    ru: "Ферганская область",
    en: "Fergana Region",
    districts: [
      "Farg'ona shahri",
      "Marg'ilon shahri",
      "Qo'qon shahri",
      "Quvasoy shahri",
      "Rishton tumani",
      "Beshariq tumani",
      "Bag'dod tumani",
      "Oltiariq tumani",
      "Quva tumani",
      "Yozyovon tumani",
    ],
  },
  {
    id: "andijan",
    uz: "Andijon viloyati",
    ru: "Андижанская область",
    en: "Andijan Region",
    districts: [
      "Andijon shahri",
      "Asaka shahri",
      "Xonobod shahri",
      "Shahrixon tumani",
      "Marhamat tumani",
      "Baliqchi tumani",
      "Bo'ston tumani",
      "Izboskan tumani",
      "Jalaquduq tumani",
      "Qo'rg'ontepa tumani",
    ],
  },
  {
    id: "namangan",
    uz: "Namangan viloyati",
    ru: "Наманганская область",
    en: "Namangan Region",
    districts: [
      "Namangan shahri",
      "Chust tumani",
      "Kosonsoy tumani",
      "Pop tumani",
      "Chortoq tumani",
      "To'raqo'rg'on tumani",
      "Uychi tumani",
      "Norin tumani",
      "Mingbuloq tumani",
      "Yangiqo'rg'on tumani",
    ],
  },
  {
    id: "kashkadarya",
    uz: "Qashqadaryo viloyati",
    ru: "Кашкадарьинская область",
    en: "Kashkadarya Region",
    districts: [
      "Qarshi shahri",
      "Shahrisabz shahri",
      "Kitob tumani",
      "G'uzor tumani",
      "Koson tumani",
      "Muborak tumani",
      "Kasbi tumani",
      "Chiroqchi tumani",
      "Dehqonobod tumani",
      "Yakkabog' tumani",
    ],
  },
  {
    id: "surkhandarya",
    uz: "Surxondaryo viloyati",
    ru: "Сурхандарьинская область",
    en: "Surkhandarya Region",
    districts: [
      "Termiz shahri",
      "Denov tumani",
      "Sho'rchi tumani",
      "Boysun tumani",
      "Sariosiyo tumani",
      "Angor tumani",
      "Jarqo'rg'on tumani",
      "Qumqo'rg'on tumani",
      "Sherobod tumani",
      "Uzun tumani",
    ],
  },
  {
    id: "khorezm",
    uz: "Xorazm viloyati",
    ru: "Хорезмская область",
    en: "Khorezm Region",
    districts: [
      "Urganch shahri",
      "Xiva shahri",
      "Bog'ot tumani",
      "Gurlan tumani",
      "Qo'shko'pir tumani",
      "Shovot tumani",
      "Xonqa tumani",
      "Hazorasp tumani",
      "Yangiariq tumani",
      "Yangibozor tumani",
    ],
  },
  {
    id: "navoi",
    uz: "Navoiy viloyati",
    ru: "Навоийская область",
    en: "Navoi Region",
    districts: [
      "Navoiy shahri",
      "Zarafshon shahri",
      "Konimex tumani",
      "Karmana tumani",
      "Qiziltepa tumani",
      "Navbahor tumani",
      "Nurota tumani",
      "Tomdi tumani",
      "Uchquduq tumani",
      "Xatirchi tumani",
    ],
  },
  {
    id: "jizzakh",
    uz: "Jizzax viloyati",
    ru: "Джизакская область",
    en: "Jizzakh Region",
    districts: [
      "Jizzax shahri",
      "G'allaorol tumani",
      "Do'stlik tumani",
      "Zomin tumani",
      "Paxtakor tumani",
      "Forish tumani",
      "Sharof Rashidov tumani",
      "Baxmal tumani",
      "Mirzacho'l tumani",
      "Zafarobod tumani",
    ],
  },
  {
    id: "syrdarya",
    uz: "Sirdaryo viloyati",
    ru: "Сырдарьинская область",
    en: "Syrdarya Region",
    districts: [
      "Guliston shahri",
      "Yangiyer shahri",
      "Shirin shahri",
      "Sirdaryo tumani",
      "Boyovut tumani",
      "Sayxunobod tumani",
      "Oqoltin tumani",
      "Mirzaobod tumani",
      "Xovos tumani",
      "Sardoba tumani",
    ],
  },
  {
    id: "karakalpakstan",
    uz: "Qoraqalpog'iston Respublikasi",
    ru: "Республика Каракалпакстан",
    en: "Republic of Karakalpakstan",
    districts: [
      "Nukus shahri",
      "Xo'jayli tumani",
      "Chimboy tumani",
      "Qo'ng'irot tumani",
      "Beruniy tumani",
      "To'rtko'l tumani",
      "Amudaryo tumani",
      "Ellikqal'a tumani",
      "Mo'ynoq tumani",
      "Taxtako'pir tumani",
    ],
  },
];

export const TIME_SLOTS: { id: string; label: L10n }[] = [
  {
    id: "today_evening",
    label: {
      uz: "Bugun kechqurun · 18:00 – 21:00",
      ru: "Сегодня вечером · 18:00 – 21:00",
      en: "Today evening · 18:00 – 21:00",
    },
  },
  {
    id: "tomorrow_morning",
    label: {
      uz: "Ertaga ertalab · 10:00 – 14:00",
      ru: "Завтра утром · 10:00 – 14:00",
      en: "Tomorrow morning · 10:00 – 14:00",
    },
  },
  {
    id: "tomorrow_afternoon",
    label: {
      uz: "Ertaga kunduzi · 14:00 – 18:00",
      ru: "Завтра днём · 14:00 – 18:00",
      en: "Tomorrow afternoon · 14:00 – 18:00",
    },
  },
  {
    id: "tomorrow_evening",
    label: {
      uz: "Ertaga kechqurun · 18:00 – 21:00",
      ru: "Завтра вечером · 18:00 – 21:00",
      en: "Tomorrow evening · 18:00 – 21:00",
    },
  },
  {
    id: "asap",
    label: {
      uz: "Imkon qadar tezroq (ekspress)",
      ru: "Как можно скорее (экспресс)",
      en: "As soon as possible (express)",
    },
  },
];

/* ─────────────── Operational & Business Types ─────────────── */

export type WaitlistEntry = {
  id: string;
  productId: string;
  productName: string;
  phone: string;
  tgUsername?: string;
  requestedQty: number;
  createdAt: number;
  notified: boolean;
};

export type ReferralStats = {
  invitedCount: number;
  firstOrdersCount: number;
  earnedCashbackTotal: number;
  personalCode: string;
};

export type LegalDocType = "oferta" | "privacy" | "delivery_terms" | "warranty";

export const DEFAULT_ADMIN_PIN = "2026";

/* ─────────── Changeable admin PIN (stored in localStorage) ─────────── */

export function getAdminPin(): string {
  try {
    const saved = localStorage.getItem("delis_admin_pin");
    if (saved) return saved;
  } catch {}
  return DEFAULT_ADMIN_PIN;
}

export function setAdminPin(newPin: string): void {
  try {
    localStorage.setItem("delis_admin_pin", newPin);
  } catch {}
}

/* ─────────── Custom admin-created products (localStorage) ─────────── */

export function loadCustomProducts(): Product[] {
  try {
    const raw = localStorage.getItem("delis_custom_products");
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveCustomProducts(products: Product[]): void {
  try {
    localStorage.setItem("delis_custom_products", JSON.stringify(products));
  } catch {}
}

export function loadAllProducts(): Product[] {
  return [...PRODUCTS, ...loadCustomProducts()];
}

/** Real referral stats come from the server (/v1/me/referral) — this is just
 *  the empty-state placeholder. */
export const DEFAULT_REFERRAL_STATS: ReferralStats = {
  invitedCount: 0,
  firstOrdersCount: 0,
  earnedCashbackTotal: 0,
  personalCode: "",
};


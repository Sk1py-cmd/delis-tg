/**
 * DELIS Loyalty engine: balance, opaque membership cards, append-only ledger,
 * configurable tiers, expiry, birthday rewards and claimable missions.
 */
import crypto from "node:crypto";
import type Database from "better-sqlite3";

export type LoyaltyEventType = "earn" | "spend";
export type LoyaltyEventSource =
  | "order"
  | "daily"
  | "review"
  | "referral"
  | "reward"
  | "admin"
  | "mission"
  | "birthday"
  | "campaign"
  | "expiry";
export type LoyaltyTier = "bronze" | "silver" | "gold";
export type LoyaltyLang = "uz" | "ru" | "en";

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

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  starValueUzs: 100,
  expirationDays: 365,
  expiryWarningDays: 30,
  birthdayBonus: 100,
  tiers: {
    bronze: { minStars: 0, cashbackPercent: 3 },
    silver: { minStars: 500, cashbackPercent: 5 },
    gold: { minStars: 1500, cashbackPercent: 8 },
  },
};

const CONFIG_KEY = "loyalty_config";

export function getLoyaltyConfig(db: Database.Database): LoyaltyConfig {
  try {
    const row = db.prepare("SELECT value_json FROM content_settings WHERE key = ?").get(CONFIG_KEY) as
      | { value_json: string }
      | undefined;
    if (!row) return DEFAULT_LOYALTY_CONFIG;
    const raw = JSON.parse(row.value_json) as Partial<LoyaltyConfig>;
    const silver = Number(raw.tiers?.silver?.minStars ?? DEFAULT_LOYALTY_CONFIG.tiers.silver.minStars);
    const gold = Number(raw.tiers?.gold?.minStars ?? DEFAULT_LOYALTY_CONFIG.tiers.gold.minStars);
    if (!Number.isFinite(silver) || !Number.isFinite(gold) || silver < 1 || gold <= silver) return DEFAULT_LOYALTY_CONFIG;
    return {
      starValueUzs: Math.max(1, Math.trunc(Number(raw.starValueUzs ?? DEFAULT_LOYALTY_CONFIG.starValueUzs))),
      expirationDays: Math.max(0, Math.trunc(Number(raw.expirationDays ?? DEFAULT_LOYALTY_CONFIG.expirationDays))),
      expiryWarningDays: Math.max(1, Math.trunc(Number(raw.expiryWarningDays ?? DEFAULT_LOYALTY_CONFIG.expiryWarningDays))),
      birthdayBonus: Math.max(0, Math.trunc(Number(raw.birthdayBonus ?? DEFAULT_LOYALTY_CONFIG.birthdayBonus))),
      tiers: {
        bronze: {
          minStars: 0,
          cashbackPercent: Number(raw.tiers?.bronze?.cashbackPercent ?? DEFAULT_LOYALTY_CONFIG.tiers.bronze.cashbackPercent),
        },
        silver: {
          minStars: silver,
          cashbackPercent: Number(raw.tiers?.silver?.cashbackPercent ?? DEFAULT_LOYALTY_CONFIG.tiers.silver.cashbackPercent),
        },
        gold: {
          minStars: gold,
          cashbackPercent: Number(raw.tiers?.gold?.cashbackPercent ?? DEFAULT_LOYALTY_CONFIG.tiers.gold.cashbackPercent),
        },
      },
    };
  } catch {
    return DEFAULT_LOYALTY_CONFIG;
  }
}

export function saveLoyaltyConfig(db: Database.Database, config: LoyaltyConfig): void {
  db.prepare(`
    INSERT INTO content_settings (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
  `).run(CONFIG_KEY, JSON.stringify(config));
}

export function tierForStars(stars: number, config: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): LoyaltyTier {
  return stars >= config.tiers.gold.minStars ? "gold" : stars >= config.tiers.silver.minStars ? "silver" : "bronze";
}

export function cashbackPercentForStars(db: Database.Database, stars: number): number {
  const config = getLoyaltyConfig(db);
  return config.tiers[tierForStars(stars, config)].cashbackPercent;
}

export function syncLoyaltyTier(db: Database.Database, tgId: number): LoyaltyTier {
  const row = db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(tgId) as { stars?: number } | undefined;
  const config = getLoyaltyConfig(db);
  const tier = tierForStars(Number(row?.stars || 0), config);
  db.prepare("UPDATE users SET tier = ? WHERE tg_id = ?").run(tier, tgId);
  return tier;
}

function newCardCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chars = Array.from(crypto.randomBytes(12), (byte) => alphabet[byte % alphabet.length]).join("");
  return `DLX-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function normalizeLoyaltyCode(value: string): string {
  return value.trim().toUpperCase().replace(/^DELIS-CARD:/, "");
}

export function ensureLoyaltyCard(db: Database.Database, tgId: number): string {
  const existing = db.prepare("SELECT code FROM loyalty_cards WHERE tg_id = ?").get(tgId) as { code: string } | undefined;
  if (existing?.code) return existing.code;
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = newCardCode();
    try {
      db.prepare("INSERT INTO loyalty_cards (code, tg_id) VALUES (?, ?)").run(code, tgId);
      return code;
    } catch (error) {
      if (!String(error).includes("UNIQUE")) throw error;
      const raced = db.prepare("SELECT code FROM loyalty_cards WHERE tg_id = ?").get(tgId) as { code: string } | undefined;
      if (raced?.code) return raced.code;
    }
  }
  throw new Error("loyalty_card_generation_failed");
}

export function rotateLoyaltyCard(db: Database.Database, tgId: number): string {
  ensureLoyaltyCard(db, tgId);
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = newCardCode();
    try {
      db.prepare("UPDATE loyalty_cards SET code = ?, last_used_at = NULL, created_at = datetime('now') WHERE tg_id = ?")
        .run(code, tgId);
      return code;
    } catch (error) {
      if (!String(error).includes("UNIQUE")) throw error;
    }
  }
  throw new Error("loyalty_card_rotation_failed");
}

export function recordLoyaltyEvent(
  db: Database.Database,
  input: {
    tgId: number;
    type: LoyaltyEventType;
    amount: number;
    source: LoyaltyEventSource;
    referenceId: string;
    description?: string;
    actorTgId?: number;
    expiresAt?: string | null;
  },
): boolean {
  const amount = Math.max(0, Math.trunc(input.amount));
  if (!amount) return false;
  let expiresAt = input.expiresAt;
  if (expiresAt === undefined && input.type === "earn") {
    const days = getLoyaltyConfig(db).expirationDays;
    expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  }
  const result = db.prepare(`
    INSERT OR IGNORE INTO loyalty_transactions
      (tg_id, type, amount, source, reference_id, description, actor_tg_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.tgId,
    input.type,
    amount,
    input.source,
    input.referenceId,
    input.description || null,
    input.actorTgId || null,
    expiresAt || null,
  );
  return result.changes > 0;
}

/** Expire only the still-unspent part of old earn lots (FIFO accounting). */
export function expireLoyaltyStars(db: Database.Database, tgId: number): number {
  const earns = db.prepare(`
    SELECT id, amount, expires_at
    FROM loyalty_transactions
    WHERE tg_id = ? AND type = 'earn'
    ORDER BY datetime(created_at), id
  `).all(tgId) as Array<{ id: number; amount: number; expires_at?: string | null }>;
  let spentBudget = Number((db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS n FROM loyalty_transactions WHERE tg_id = ? AND type = 'spend'",
  ).get(tgId) as { n: number }).n || 0);
  const now = Date.now();
  let expiredTotal = 0;

  db.transaction(() => {
    for (const earn of earns) {
      const consumed = Math.min(earn.amount, spentBudget);
      spentBudget -= consumed;
      const remaining = earn.amount - consumed;
      if (!remaining || !earn.expires_at || Date.parse(earn.expires_at) > now) continue;
      const referenceId = `earn-${earn.id}`;
      const already = db.prepare(
        "SELECT 1 FROM loyalty_transactions WHERE tg_id = ? AND source = 'expiry' AND reference_id = ?",
      ).get(tgId, referenceId);
      if (already) continue;
      const balance = Number((db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(tgId) as { stars?: number })?.stars || 0);
      const amount = Math.min(remaining, Math.max(0, balance));
      if (!amount) continue;
      db.prepare("UPDATE users SET stars = stars - ? WHERE tg_id = ?").run(amount, tgId);
      recordLoyaltyEvent(db, {
        tgId,
        type: "spend",
        amount,
        source: "expiry",
        referenceId,
        expiresAt: null,
      });
      expiredTotal += amount;
    }
  })();
  if (expiredTotal) syncLoyaltyTier(db, tgId);
  return expiredTotal;
}

const SOURCE_LABELS: Record<LoyaltyEventSource | "opening", Record<LoyaltyLang, string>> = {
  order: { uz: "Buyurtma uchun cashback", ru: "Кэшбэк за заказ", en: "Order cashback" },
  daily: { uz: "Kunlik bonus", ru: "Ежедневный бонус", en: "Daily bonus" },
  review: { uz: "Xarid uchun izoh", ru: "Отзыв о покупке", en: "Purchase review" },
  referral: { uz: "Do'st uchun bonus", ru: "Бонус за друга", en: "Referral bonus" },
  reward: { uz: "Stars mukofotiga almashtirish", ru: "Обмен на награду Stars", en: "Stars reward redemption" },
  admin: { uz: "Menejer tuzatishi", ru: "Корректировка менеджера", en: "Manager adjustment" },
  mission: { uz: "Missiya mukofoti", ru: "Награда за миссию", en: "Mission reward" },
  birthday: { uz: "Tug'ilgan kun sovg'asi", ru: "Подарок ко дню рождения", en: "Birthday gift" },
  campaign: { uz: "Maxsus aksiya", ru: "Специальная акция", en: "Special campaign" },
  expiry: { uz: "Stars muddati tugadi", ru: "Срок Stars истёк", en: "Stars expired" },
  opening: { uz: "Boshlang'ich balans", ru: "Начальный баланс", en: "Opening balance" },
};

function eventDescription(
  db: Database.Database,
  source: LoyaltyEventSource,
  referenceId: string,
  lang: LoyaltyLang,
  custom?: string | null,
): string {
  // Mission claims keep their stable mission id in the ledger. Resolve the
  // title at read time so changing the app language also translates history.
  if (source === "mission") {
    const row = db.prepare(`SELECT title_${lang} AS title, title_uz AS fallback FROM loyalty_missions WHERE id = ?`)
      .get(referenceId) as { title?: string; fallback?: string } | undefined;
    return row?.title || row?.fallback || SOURCE_LABELS.mission[lang];
  }
  if (custom) return custom;
  const label = SOURCE_LABELS[source]?.[lang] || source;
  if (source === "order") return `${label} #${referenceId}`;
  return label;
}

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

function missionProgress(db: Database.Database, tgId: number, metric: string): number {
  if (metric === "orders") {
    return Number((db.prepare("SELECT COUNT(*) AS n FROM orders WHERE tg_id = ? AND stars_awarded = 1").get(tgId) as { n: number }).n || 0);
  }
  if (metric === "spend") {
    return Number((db.prepare("SELECT COALESCE(SUM(total), 0) AS n FROM orders WHERE tg_id = ? AND stars_awarded = 1 AND status != 'canceled'").get(tgId) as { n: number }).n || 0);
  }
  if (metric === "daily") {
    const dates = new Set((db.prepare(
      "SELECT claimed_at FROM daily_rewards WHERE tg_id = ? ORDER BY claimed_at DESC LIMIT 400",
    ).all(tgId) as Array<{ claimed_at: string }>).map((row) => row.claimed_at));
    let cursor = new Date(Date.now() + 5 * 3_600_000);
    let key = cursor.toISOString().slice(0, 10);
    // A streak remains alive until the end of the next Tashkent day.
    if (!dates.has(key)) {
      cursor = new Date(cursor.getTime() - 86_400_000);
      key = cursor.toISOString().slice(0, 10);
    }
    let streak = 0;
    while (dates.has(key)) {
      streak++;
      cursor = new Date(cursor.getTime() - 86_400_000);
      key = cursor.toISOString().slice(0, 10);
    }
    return streak;
  }
  if (metric === "referrals") {
    return Number((db.prepare("SELECT COUNT(*) AS n FROM users WHERE referrer_id = ? AND referral_paid = 1").get(tgId) as { n: number }).n || 0);
  }
  return 0;
}

export function getLoyaltyMissions(db: Database.Database, tgId: number, lang: LoyaltyLang): LoyaltyMission[] {
  const rows = db.prepare(`
    SELECT m.*, CASE WHEN c.tg_id IS NULL THEN 0 ELSE 1 END AS claimed
    FROM loyalty_missions m
    LEFT JOIN loyalty_mission_claims c ON c.mission_id = m.id AND c.tg_id = ?
    WHERE m.active = 1
      AND (m.starts_at IS NULL OR m.starts_at <= datetime('now'))
      AND (m.ends_at IS NULL OR m.ends_at > datetime('now'))
    ORDER BY m.created_at, m.id
  `).all(tgId) as any[];
  return rows.map((row) => {
    const progress = missionProgress(db, tgId, String(row.metric));
    const claimed = Boolean(row.claimed);
    return {
      id: row.id,
      metric: row.metric,
      target: Number(row.target),
      progress: Math.min(progress, Number(row.target)),
      reward: Number(row.reward),
      title: row[`title_${lang}`] || row.title_uz,
      description: row[`description_${lang}`] || row.description_uz || "",
      icon: row.icon || "⚡",
      claimed,
      claimable: !claimed && progress >= Number(row.target),
    };
  });
}

export function claimLoyaltyMission(
  db: Database.Database,
  tgId: number,
  missionId: string,
  lang: LoyaltyLang,
): { ok: true; reward: number; stars: number } | { ok: false; error: string } {
  const mission = getLoyaltyMissions(db, tgId, lang).find((item) => item.id === missionId);
  if (!mission) return { ok: false, error: "mission_not_found" };
  if (mission.claimed) return { ok: false, error: "already_claimed" };
  if (!mission.claimable) return { ok: false, error: "mission_incomplete" };
  return db.transaction(() => {
    const inserted = db.prepare(
      "INSERT OR IGNORE INTO loyalty_mission_claims (tg_id, mission_id) VALUES (?, ?)",
    ).run(tgId, mission.id);
    if (!inserted.changes) return { ok: false as const, error: "already_claimed" };
    db.prepare("UPDATE users SET stars = stars + ? WHERE tg_id = ?").run(mission.reward, tgId);
    recordLoyaltyEvent(db, {
      tgId,
      type: "earn",
      amount: mission.reward,
      source: "mission",
      referenceId: mission.id,
      description: mission.title,
    });
    syncLoyaltyTier(db, tgId);
    const stars = Number((db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(tgId) as { stars: number }).stars);
    return { ok: true as const, reward: mission.reward, stars };
  })();
}

export function getExpiryPreview(db: Database.Database, tgId: number, warningDays: number): { amount: number; date: string | null } {
  const rows = db.prepare(`
    SELECT amount, expires_at FROM loyalty_transactions
    WHERE tg_id = ? AND type = 'earn' AND expires_at IS NOT NULL
    ORDER BY datetime(created_at), id
  `).all(tgId) as Array<{ amount: number; expires_at: string }>;
  let spent = Number((db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS n FROM loyalty_transactions WHERE tg_id = ? AND type = 'spend'",
  ).get(tgId) as { n: number }).n || 0);
  const limit = Date.now() + warningDays * 86_400_000;
  let amount = 0;
  let date: string | null = null;
  for (const row of rows) {
    const consumed = Math.min(row.amount, spent);
    spent -= consumed;
    const remaining = row.amount - consumed;
    if (remaining > 0 && Date.parse(row.expires_at) <= limit) {
      amount += remaining;
      if (!date || row.expires_at < date) date = row.expires_at;
    }
  }
  return { amount, date };
}

export type LoyaltySummary = {
  userId: number;
  userName: string;
  cardCode: string;
  level: LoyaltyTier;
  stars: number;
  starValueUzs: number;
  cashbackPercent: number;
  nextLevel: LoyaltyTier | null;
  nextThreshold: number | null;
  remainingToNext: number;
  progressPercent: number;
  expiring: { amount: number; date: string | null };
  birthday: { configured: boolean; eligible: boolean; claimed: boolean; bonus: number };
  totalEarned: number;
  totalSpent: number;
  history: Array<{
    id: string;
    type: LoyaltyEventType;
    source: LoyaltyEventSource | "opening";
    amount: number;
    date: string;
    description: string;
  }>;
  missions: LoyaltyMission[];
};

export function getLoyaltySummary(db: Database.Database, tgId: number, lang: LoyaltyLang): LoyaltySummary | null {
  expireLoyaltyStars(db, tgId);
  const user = db.prepare(
    "SELECT tg_id, first_name, username, stars, birthday, created_at FROM users WHERE tg_id = ?",
  ).get(tgId) as any;
  if (!user) return null;

  const rows = db.prepare(`
    SELECT id, type, amount, source, reference_id, description, created_at
    FROM loyalty_transactions
    WHERE tg_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 50
  `).all(tgId) as any[];
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'earn' THEN amount ELSE 0 END), 0) AS earned,
      COALESCE(SUM(CASE WHEN type = 'spend' THEN amount ELSE 0 END), 0) AS spent
    FROM loyalty_transactions WHERE tg_id = ?
  `).get(tgId) as { earned: number; spent: number };

  const stars = Math.max(0, Number(user.stars || 0));
  const ledgerEarned = Number(totals.earned || 0);
  const ledgerSpent = Number(totals.spent || 0);
  const openingBalance = stars - (ledgerEarned - ledgerSpent);
  const totalEarned = ledgerEarned + Math.max(0, openingBalance);
  const totalSpent = ledgerSpent + Math.max(0, -openingBalance);
  const config = getLoyaltyConfig(db);
  const level = tierForStars(stars, config);
  const nextLevel: LoyaltyTier | null = level === "bronze" ? "silver" : level === "silver" ? "gold" : null;
  const currentMin = config.tiers[level].minStars;
  const nextThreshold = nextLevel ? config.tiers[nextLevel].minStars : null;
  const progressPercent = nextThreshold
    ? Math.max(0, Math.min(100, Math.round(((stars - currentMin) / (nextThreshold - currentMin)) * 100)))
    : 100;
  const today = new Date(Date.now() + 5 * 3_600_000).toISOString();
  const mmdd = today.slice(5, 10);
  const year = Number(today.slice(0, 4));
  const birthdayClaim = db.prepare("SELECT 1 FROM birthday_rewards WHERE tg_id = ? AND reward_year = ?").get(tgId, year);

  const history: LoyaltySummary["history"] = rows.map((row) => ({
    id: String(row.id),
    type: row.type as LoyaltyEventType,
    source: row.source as LoyaltyEventSource,
    amount: Number(row.amount),
    date: row.created_at,
    description: eventDescription(db, row.source, row.reference_id, lang, row.description),
  }));
  if (openingBalance !== 0) {
    history.push({
      id: "opening-balance",
      type: openingBalance > 0 ? "earn" : "spend",
      source: "opening",
      amount: Math.abs(openingBalance),
      date: user.created_at || "",
      description: SOURCE_LABELS.opening[lang],
    });
  }

  return {
    userId: Number(user.tg_id),
    userName: user.first_name || (user.username ? `@${user.username}` : { uz: "DELIS a'zosi", ru: "Участник DELIS", en: "DELIS Member" }[lang]),
    cardCode: ensureLoyaltyCard(db, tgId),
    level,
    stars,
    starValueUzs: config.starValueUzs,
    cashbackPercent: config.tiers[level].cashbackPercent,
    nextLevel,
    nextThreshold,
    remainingToNext: nextThreshold ? Math.max(0, nextThreshold - stars) : 0,
    progressPercent,
    expiring: getExpiryPreview(db, tgId, config.expiryWarningDays),
    birthday: {
      configured: Boolean(user.birthday),
      eligible: Boolean(user.birthday && user.birthday === mmdd && !birthdayClaim),
      claimed: Boolean(birthdayClaim),
      bonus: config.birthdayBonus,
    },
    totalEarned,
    totalSpent,
    history,
    missions: getLoyaltyMissions(db, tgId, lang),
  };
}

export function adjustLoyaltyBalance(
  db: Database.Database,
  input: { tgId: number; type: LoyaltyEventType; amount: number; reason: string; actorTgId: number },
): { ok: true; stars: number } | { ok: false; error: string; stars: number } {
  const amount = Math.max(1, Math.trunc(input.amount));
  return db.transaction(() => {
    if (input.type === "spend") {
      const debit = db.prepare("UPDATE users SET stars = stars - ? WHERE tg_id = ? AND stars >= ?")
        .run(amount, input.tgId, amount);
      if (!debit.changes) {
        const stars = Number((db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(input.tgId) as { stars?: number })?.stars || 0);
        return { ok: false as const, error: "insufficient_stars", stars };
      }
    } else {
      db.prepare("UPDATE users SET stars = stars + ? WHERE tg_id = ?").run(amount, input.tgId);
    }
    recordLoyaltyEvent(db, {
      tgId: input.tgId,
      type: input.type,
      amount,
      source: "admin",
      referenceId: crypto.randomUUID(),
      description: input.reason,
      actorTgId: input.actorTgId,
    });
    syncLoyaltyTier(db, input.tgId);
    const stars = Number((db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(input.tgId) as { stars: number }).stars);
    return { ok: true as const, stars };
  })();
}

export function claimBirthdayReward(
  db: Database.Database,
  tgId: number,
): { ok: true; amount: number; stars: number } | { ok: false; error: string } {
  const user = db.prepare("SELECT birthday FROM users WHERE tg_id = ?").get(tgId) as { birthday?: string } | undefined;
  if (!user?.birthday) return { ok: false, error: "birthday_not_set" };
  const now = new Date(Date.now() + 5 * 3_600_000).toISOString();
  if (user.birthday !== now.slice(5, 10)) return { ok: false, error: "not_birthday" };
  const year = Number(now.slice(0, 4));
  const amount = getLoyaltyConfig(db).birthdayBonus;
  if (!amount) return { ok: false, error: "birthday_bonus_disabled" };
  return db.transaction(() => {
    const claim = db.prepare("INSERT OR IGNORE INTO birthday_rewards (tg_id, reward_year, amount) VALUES (?, ?, ?)")
      .run(tgId, year, amount);
    if (!claim.changes) return { ok: false as const, error: "already_claimed" };
    db.prepare("UPDATE users SET stars = stars + ? WHERE tg_id = ?").run(amount, tgId);
    recordLoyaltyEvent(db, {
      tgId,
      type: "earn",
      amount,
      source: "birthday",
      referenceId: String(year),
    });
    syncLoyaltyTier(db, tgId);
    const stars = Number((db.prepare("SELECT stars FROM users WHERE tg_id = ?").get(tgId) as { stars: number }).stars);
    return { ok: true as const, amount, stars };
  })();
}

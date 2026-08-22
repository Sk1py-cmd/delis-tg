/**
 * DELIS Loyalty — Graphite Digital membership card, missions and real ledger.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BrandMark } from "./brand";
import { claimBirthdayReward, claimLoyaltyMission, type LoyaltyMission } from "./api";
import type { L10n } from "./i18n";
import { useI18n } from "./i18n";
import { haptic } from "./kit";
import {
  IconBag,
  IconCheck,
  IconClock,
  IconCopy,
  IconGift,
  IconLoyaltyCore,
  IconQrScan,
  IconRefresh,
  IconShare,
  IconSparkle,
  IconStar,
  IconStarsOrbit,
  IconTierSignal,
} from "./icons";
import { Sheet } from "./chrome";

export type LoyaltyLevel = "bronze" | "silver" | "gold";

export type LoyaltyCardData = {
  level: LoyaltyLevel;
  stars: number;
  cardCode: string;
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
  missions: LoyaltyMission[];
  history: Array<{
    id: string;
    type: "earn" | "spend";
    source?: string;
    amount: number;
    date: string;
    description: string;
  }>;
};

function MissionGlyph({ metric, claimed }: { metric: string; claimed: boolean }) {
  if (claimed) return <IconCheck size={22} strokeWidth={2.8} />;
  if (metric === "orders") return <IconBag size={23} />;
  if (metric === "daily") return <IconRefresh size={23} />;
  if (metric === "referrals") return <IconShare size={23} />;
  if (metric === "spend") return <IconStarsOrbit size={25} />;
  return <IconLoyaltyCore size={24} />;
}

function useAnimatedNumber(target: number, duration = 900) {
  const [value, setValue] = useState(target);
  const previous = useRef(target);
  useEffect(() => {
    const from = previous.current;
    previous.current = target;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

export function LoyaltyCard({
  userName,
  data,
  loading = false,
  onRefresh,
  onClose,
}: {
  userName: string;
  data: LoyaltyCardData;
  loading?: boolean;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [pending, setPending] = useState<string | null>(null);
  const [celebration, setCelebration] = useState(0);
  const [tierUp, setTierUp] = useState<LoyaltyLevel | null>(null);
  const previousLevel = useRef<LoyaltyLevel>(data.level);
  const [historyFilter, setHistoryFilter] = useState<"all" | "earn" | "spend">("all");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const balance = useAnimatedNumber(data.stars);

  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  const levelNames: Record<LoyaltyLevel, L10n> = {
    bronze: { uz: "BRONZA YADROSI", ru: "БРОНЗОВОЕ ЯДРО", en: "BRONZE CORE" },
    silver: { uz: "KUMUSH IMPULS", ru: "СЕРЕБРЯНЫЙ ИМПУЛЬС", en: "SILVER PULSE" },
    gold: { uz: "OLTIN TURBO", ru: "ЗОЛОТОЙ ТУРБОРЕЖИМ", en: "GOLD OVERDRIVE" },
  };
  const tierShort: Record<"silver" | "gold", L10n> = {
    silver: { uz: "Kumush", ru: "Серебро", en: "Silver" },
    gold: { uz: "Oltin", ru: "Золото", en: "Gold" },
  };
  const filterLabels: Record<"all" | "earn" | "spend", L10n> = {
    all: { uz: "Barchasi", ru: "Все", en: "All" },
    earn: { uz: "Olindi", ru: "Начислено", en: "Earned" },
    spend: { uz: "Sarflandi", ru: "Списано", en: "Spent" },
  };
  const sourceLabels: Record<string, L10n> = {
    order: { uz: "Buyurtma", ru: "Заказ", en: "Order" },
    daily: { uz: "Kunlik bonus", ru: "Ежедневный бонус", en: "Daily reward" },
    referral: { uz: "Tavsiya", ru: "Реферал", en: "Referral" },
    reward: { uz: "Mukofot", ru: "Награда", en: "Reward" },
    admin: { uz: "Menejer", ru: "Менеджер", en: "Manager" },
    mission: { uz: "Missiya", ru: "Миссия", en: "Mission" },
    birthday: { uz: "Tug'ilgan kun", ru: "День рождения", en: "Birthday" },
    campaign: { uz: "Aksiya", ru: "Акция", en: "Campaign" },
    expiry: { uz: "Muddati tugadi", ru: "Срок истёк", en: "Expired" },
    opening: { uz: "Boshlang'ich", ru: "Начальный", en: "Opening" },
    stars: { uz: "Stars", ru: "Stars", en: "Stars" },
  };
  const accent = data.level === "gold" ? "#f6c453" : data.level === "silver" ? "#9ce7ff" : "#60ff9b";
  const qrCodeValue = data.cardCode ? `DELIS-CARD:${data.cardCode}` : "";
  const particles = useMemo(() => Array.from({ length: 18 }, (_, index) => ({
    id: index,
    left: `${7 + ((index * 29) % 88)}%`,
    delay: `${(index % 7) * 0.08}s`,
    color: index % 3 === 0 ? "#7dd3fc" : index % 2 ? "#60ff9b" : "#d8b4fe",
  })), []);
  const filteredHistory = data.history.filter((item) => historyFilter === "all" || item.type === historyFilter);
  const visibleHistory = historyExpanded ? filteredHistory : filteredHistory.slice(0, 10);
  const completedMissions = data.missions.filter((mission) => mission.claimed).length;
  const missionRadarPercent = data.missions.length ? Math.round((completedMissions / data.missions.length) * 100) : 0;

  useEffect(() => {
    if (!showQr) setCopied(false);
  }, [showQr]);

  useEffect(() => {
    const rank: Record<LoyaltyLevel, number> = { bronze: 0, silver: 1, gold: 2 };
    const previous = previousLevel.current;
    previousLevel.current = data.level;
    if (rank[data.level] <= rank[previous]) return;
    setTierUp(data.level);
    setCelebration((value) => value + 1);
    haptic("success");
    const timer = window.setTimeout(() => { setTierUp(null); setCelebration(0); }, 2400);
    return () => window.clearTimeout(timer);
  }, [data.level]);

  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientY - rect.top) / rect.height - 0.5) * -9;
    const y = ((event.clientX - rect.left) / rect.width - 0.5) * 11;
    setTilt({ x, y });
  };

  const copyCode = async () => {
    if (!qrCodeValue) return;
    haptic("light");
    try {
      await navigator.clipboard.writeText(qrCodeValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* visible code remains available */ }
  };

  const celebrateAndRefresh = async () => {
    setCelebration((value) => value + 1);
    haptic("success");
    await onRefresh();
    window.setTimeout(() => setCelebration(0), 1500);
  };

  const claimMission = async (mission: LoyaltyMission) => {
    if (!mission.claimable || pending) return;
    setPending(mission.id);
    const result = await claimLoyaltyMission(mission.id, lang);
    if (result.ok) await celebrateAndRefresh();
    else haptic("error");
    setPending(null);
  };

  const claimBirthday = async () => {
    if (pending) return;
    setPending("birthday");
    const result = await claimBirthdayReward();
    if (result.ok) await celebrateAndRefresh();
    else haptic("error");
    setPending(null);
  };

  return (
    <Sheet open={true} onClose={onClose} title={L("DELIS ID", "DELIS ID", "DELIS ID")}>
      <div className="loyalty-cyber-shell relative space-y-4 pb-3">
        {celebration > 0 && (
          <div key={celebration} className="pointer-events-none fixed inset-0 z-[90] overflow-hidden" aria-hidden>
            {particles.map((particle) => (
              <i
                key={particle.id}
                className="loyalty-confetti absolute top-1/3 h-2 w-2 rounded-sm"
                style={{ left: particle.left, background: particle.color, animationDelay: particle.delay }}
              />
            ))}
          </div>
        )}

        {tierUp && (
          <div className="loyalty-tier-up fixed inset-0 z-[91] grid place-items-center p-6 pointer-events-none" role="status">
            <div className="loyalty-tier-up__backdrop absolute inset-0" />
            <div className="loyalty-tier-up__core relative text-center" style={{ "--loyalty-accent": accent } as CSSProperties}>
              <span className="loyalty-tier-up__signal mx-auto grid h-24 w-24 place-items-center rounded-[28px]" style={{ color: accent }}>
                <IconTierSignal size={58} filled />
              </span>
              <p className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.34em] text-white/60">{L("YANGI DARAJA", "НОВЫЙ УРОВЕНЬ", "TIER ASCENDED")}</p>
              <p className="mt-2 font-display text-[27px] font-black text-white">{levelNames[tierUp][lang]}</p>
            </div>
          </div>
        )}

        <div
          onPointerMove={pointerMove}
          onPointerLeave={() => setTilt({ x: 0, y: 0 })}
          className="loyalty-cyber-card relative overflow-hidden rounded-[30px] border p-5 text-white"
          style={{
            "--loyalty-accent": accent,
            transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          } as CSSProperties}
        >
          <div className="loyalty-grid absolute inset-0" />
          <div className="loyalty-hologram pointer-events-none absolute inset-0" aria-hidden />
          <div className="loyalty-scanline absolute inset-x-0 top-0 h-20" />
          <div className="loyalty-neon-orb absolute -right-16 -top-16 h-52 w-52 rounded-full" />
          <div className="noise-layer opacity-20" />
          <div className="loyalty-card-sheen pointer-events-none absolute inset-y-0 -left-1/2 w-1/3" />

          <div className="relative z-10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.34em] text-white/45">
                  <span className="loyalty-live-dot h-1.5 w-1.5 rounded-full" /> {L("FAOL A'ZO", "АКТИВНЫЙ УЧАСТНИК", "LIVE MEMBER")}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <BrandMark size={30} className="invert opacity-90" />
                  <h2 className="font-display text-[17px] font-black tracking-tight">{levelNames[data.level][lang]}</h2>
                </div>
              </div>
              <div className="loyalty-chip motion-icon-tile grid h-11 w-12 place-items-center rounded-[13px] border border-white/20" style={{ color: accent }}>
                <IconTierSignal size={27} filled />
              </div>
            </div>

            <div className="mt-7 flex items-end justify-between gap-3">
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-[0.24em] text-white/45">{L("Aktiv balans", "Активный баланс", "Active balance")}</p>
                <p className={`mt-1 font-display text-[45px] font-black leading-none tracking-[-0.05em] ${loading ? "animate-pulse" : ""}`}>
                  {balance.toLocaleString(lang === "en" ? "en-US" : "ru-RU")}
                  <span className="ml-2 inline-flex align-middle tracking-normal" style={{ color: accent }}><IconStarsOrbit size={24} /></span>
                </p>
                <p className="mt-2 text-[10px] font-bold text-white/50">
                  {formatPrice(data.stars * data.starValueUzs, lang)} · {data.cashbackPercent}% {L("keshbek", "кэшбэк", "cashback")}
                </p>
              </div>
              <div className="rounded-[14px] border border-white/10 bg-white/[0.06] px-3 py-2 text-right backdrop-blur-xl">
                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-white/35">{L("A'zo", "Участник", "Member")}</p>
                <p className="max-w-[110px] truncate text-[11px] font-extrabold">{userName}</p>
              </div>
            </div>

            <div className="mt-6 flex items-end justify-between gap-3 border-t border-white/10 pt-4">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/35">{L("Himoyalangan karta", "Защищённая карта", "Secure card")}</p>
                <p className="mt-1 font-mono text-[11px] font-bold tracking-[0.08em]" style={{ color: accent }}>
                  {data.cardCode || L("SINXRONLANMOQDA…", "СИНХРОНИЗАЦИЯ…", "SYNCING…")}
                </p>
              </div>
              <button
                type="button"
                disabled={!data.cardCode}
                onClick={() => { haptic("medium"); setShowQr((value) => !value); }}
                className="loyalty-neon-button press flex h-11 items-center gap-2 rounded-[14px] px-4 text-[11px] font-black uppercase tracking-wider disabled:opacity-40"
              >
                <IconQrScan size={15} /> {L("QR KIRISH", "QR-ДОСТУП", "QR ACCESS")}
              </button>
            </div>
          </div>
        </div>

        {/* Tier telemetry */}
        <div className="loyalty-panel motion-surface rounded-[24px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="loyalty-kicker">{L("DARAJA TELEMETRIYASI", "ТЕЛЕМЕТРИЯ УРОВНЯ", "LEVEL TELEMETRY")}</p>
              <p className="mt-1 text-[14px] font-black text-ink">
                {data.nextLevel ? <span className="inline-flex items-center gap-1.5">{tierShort[data.nextLevel][lang].toUpperCase()} // {data.remainingToNext} <IconStarsOrbit size={15} /></span> : L("MAKSIMAL DARAJA", "МАКСИМАЛЬНЫЙ УРОВЕНЬ", "MAX LEVEL")}
              </p>
            </div>
            <div className="relative grid h-14 w-14 place-items-center rounded-full" style={{ background: `conic-gradient(${accent} ${data.progressPercent}%, rgb(255 255 255 / .08) 0)` }}>
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[#0b0e14] text-[10px] font-black text-white">{data.progressPercent}%</div>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/20">
            <div className="loyalty-progress h-full rounded-full" style={{ width: `${data.progressPercent}%`, background: accent }} />
          </div>
        </div>

        {showQr && qrCodeValue && (
          <div className="loyalty-qr-panel animate-pop relative overflow-hidden rounded-[26px] p-5 text-center">
            <div className="loyalty-qr-corners mx-auto grid h-52 w-52 place-items-center rounded-[22px] bg-white p-3">
              <QRCodeSVG value={qrCodeValue} size={176} level="H" marginSize={1} bgColor="#ffffff" fgColor="#05070b" title={L("DELIS himoyalangan sodiqlik ID-si", "Защищённый ID лояльности DELIS", "DELIS secure loyalty ID")} />
            </div>
            <p className="mt-4 text-[12px] font-black uppercase tracking-[0.18em] text-white">{L("Menejer skanerlaydi", "Покажите менеджеру", "Show to manager")}</p>
            <p className="mt-1 text-[10px] text-white/45">{L("Balans QR ichida saqlanmaydi", "Баланс не хранится внутри QR", "No balance is stored in the QR")}</p>
            <button type="button" onClick={copyCode} className="press mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-bold text-white">
              <IconCopy size={13} /> {copied ? t("cardCopied") : data.cardCode}
            </button>
          </div>
        )}

        {data.expiring.amount > 0 && (
          <div className="loyalty-warning motion-surface flex items-center gap-3 rounded-[20px] p-3.5">
            <span className="motion-icon-tile grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-amber-500/10 text-amber-600"><IconClock size={23} /></span>
            <div>
              <p className="flex items-center gap-1 text-[12px] font-black text-amberdeep">{data.expiring.amount} <IconStarsOrbit size={14} /> {L("tez orada tugaydi", "скоро сгорят", "expire soon")}</p>
              <p className="text-[10px] font-medium text-ink2">{formatHistoryDate(data.expiring.date || "", lang)}</p>
            </div>
          </div>
        )}

        {data.birthday.eligible && (
          <button onClick={claimBirthday} disabled={pending === "birthday"} className="loyalty-birthday press relative w-full overflow-hidden rounded-[22px] p-4 text-left text-white">
            <div className="relative z-10 flex items-center justify-between">
              <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/55">{L("TUG'ILGAN KUN SOVG'ASI", "ПОДАРОК КО ДНЮ РОЖДЕНИЯ", "BIRTHDAY DROP")}</p><p className="mt-1 text-[15px] font-black">+{data.birthday.bonus} DELIS Stars</p></div>
              <span className="motion-icon-tile grid h-12 w-12 place-items-center rounded-[16px] border border-white/15 bg-white/10 text-white"><IconGift size={27} /></span>
            </div>
          </button>
        )}

        {/* Missions */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div><p className="loyalty-kicker">{L("FAOL MISSIYALAR", "АКТИВНЫЕ МИССИИ", "ACTIVE MISSIONS")}</p><h3 className="mt-1 text-[16px] font-black text-ink">{L("Mukofotlar markazi", "Центр наград", "Reward center")}</h3></div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#60ff9b]/10 px-2.5 py-1 text-[9px] font-black text-[#20a85b]">{data.missions.filter((m) => !m.claimed).length} {L("FAOL", "АКТИВНО", "LIVE")}</span>
              <div className="loyalty-mission-radar grid h-11 w-11 place-items-center rounded-full" style={{ "--mission-radar": `${missionRadarPercent}%` } as CSSProperties} title={`${missionRadarPercent}%`}>
                <div className="grid h-8 w-8 place-items-center rounded-full bg-card text-[#20a85b]"><IconLoyaltyCore size={19} /></div>
              </div>
            </div>
          </div>
          <div className="space-y-2.5">
            {data.missions.length === 0 && (
              <div className="loyalty-panel motion-surface rounded-[20px] p-6 text-center text-[11px] text-ink2">
                {L("Hozircha faol missiyalar yo'q", "Активных миссий пока нет", "No active missions yet")}
              </div>
            )}
            {data.missions.map((mission, index) => {
              const pct = Math.min(100, Math.round((mission.progress / mission.target) * 100));
              return (
                <button
                  key={mission.id}
                  onClick={() => claimMission(mission)}
                  disabled={!mission.claimable || mission.claimed || Boolean(pending)}
                  className={`loyalty-mission motion-surface press w-full rounded-[22px] p-4 text-left ${mission.claimable ? "is-ready" : ""} ${mission.claimed ? "is-claimed" : ""}`}
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="motion-icon-tile grid h-12 w-12 shrink-0 place-items-center rounded-[16px] bg-black/10 text-[#20a85b]">
                      <MissionGlyph metric={mission.metric} claimed={mission.claimed} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2"><p className="truncate text-[13px] font-black text-ink">{mission.title}</p><span className="inline-flex items-center gap-1 text-[11px] font-black text-[#20a85b]">+{mission.reward} <IconStarsOrbit size={13} /></span></div>
                      <p className="mt-0.5 truncate text-[10.5px] font-medium text-ink2">{mission.description}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-gradient-to-r from-[#18d66b] to-[#67e8f9] transition-all duration-700" style={{ width: `${pct}%` }} /></div>
                      <div className="mt-1 flex justify-between text-[9px] font-bold text-ink2"><span>{mission.progress.toLocaleString()} / {mission.target.toLocaleString()}</span><span>{mission.claimed ? L("Olindi", "Получено", "Claimed") : mission.claimable ? L("OLISH", "ЗАБРАТЬ", "CLAIM") : `${pct}%`}</span></div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <div className="loyalty-panel motion-surface rounded-[20px] p-4"><p className="loyalty-kicker">{L("JAMI OLINDI", "ВСЕГО НАЧИСЛЕНО", "TOTAL EARNED")}</p><p className="mt-2 flex items-center gap-1 font-display text-[23px] font-black text-[#20a85b]">+{data.totalEarned.toLocaleString()} <IconStarsOrbit size={18} /></p><p className="mt-1 text-[10px] text-ink2">{formatPrice(data.totalEarned * data.starValueUzs, lang)}</p></div>
          <div className="loyalty-panel motion-surface rounded-[20px] p-4"><p className="loyalty-kicker">{L("JAMI SARFLANDI", "ВСЕГО СПИСАНО", "TOTAL SPENT")}</p><p className="mt-2 flex items-center gap-1 font-display text-[23px] font-black text-[#a855f7]">-{data.totalSpent.toLocaleString()} <IconStarsOrbit size={18} /></p><p className="mt-1 text-[10px] text-ink2">{formatPrice(data.totalSpent * data.starValueUzs, lang)}</p></div>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="loyalty-kicker">{L("TRANZAKSIYALAR OQIMI", "ПОТОК ТРАНЗАКЦИЙ", "TRANSACTION STREAM")}</p>
            <div className="flex rounded-full bg-black/10 p-0.5">
              {(["all", "earn", "spend"] as const).map((filter) => (
                <button key={filter} onClick={() => { setHistoryFilter(filter); setHistoryExpanded(false); }} className={`rounded-full px-2.5 py-1 text-[8px] font-black uppercase ${historyFilter === filter ? "bg-[#05070b] text-[#60ff9b]" : "text-ink2"}`}>{filterLabels[filter][lang]}</button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="space-y-2">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-[18px] bg-card" />)}</div>
          ) : filteredHistory.length === 0 ? (
            <div className="loyalty-panel motion-surface rounded-[20px] p-7 text-center text-[12px] text-ink2">{t("cardNoHistory")}</div>
          ) : (
            <div className="loyalty-transaction-flow space-y-2">
              {visibleHistory.map((item, index) => (
                <div key={item.id} className={`loyalty-history-row motion-surface is-${item.type} flex items-center justify-between gap-3 rounded-[18px] p-3`} style={{ animationDelay: `${index * 45}ms` }}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[12px] ${item.type === "earn" ? "bg-[#60ff9b]/12 text-[#20a85b]" : "bg-[#a855f7]/12 text-[#9333ea]"}`}>{item.type === "earn" ? <IconSparkle size={15} /> : <IconStar size={15} />}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-[11.5px] font-extrabold text-ink">{item.description}</p><p className="mt-0.5 text-[9.5px] text-ink2">{formatHistoryDate(item.date, lang)} · {(sourceLabels[item.source || "stars"]?.[lang] || item.source || "Stars").toUpperCase()}</p></div>
                  <span className={`inline-flex shrink-0 items-center gap-1 font-display text-[13px] font-black ${item.type === "earn" ? "text-[#20a85b]" : "text-[#9333ea]"}`}>{item.type === "earn" ? "+" : "-"}{item.amount.toLocaleString()} <IconStarsOrbit size={13} /></span>
                </div>
              ))}
              {filteredHistory.length > 10 && (
                <button onClick={() => setHistoryExpanded((value) => !value)} className="press w-full rounded-[14px] border border-ink/10 py-2.5 text-[9px] font-black uppercase tracking-wider text-ink2">
                  {historyExpanded ? L("Yopish", "Свернуть", "Collapse") : L(`Barchasi (${filteredHistory.length})`, `Показать все (${filteredHistory.length})`, `Show all (${filteredHistory.length})`)}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
}

function formatPrice(n: number, lang: string): string {
  const formatted = n.toLocaleString(lang === "en" ? "en-US" : "ru-RU");
  return `${formatted}${lang === "uz" ? " so'm" : lang === "ru" ? " сум" : " UZS"}`;
}

function formatHistoryDate(value: string, lang: string): string {
  if (!value) return "";
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "uz" ? "uz-UZ" : lang === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

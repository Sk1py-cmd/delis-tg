/** DELIS Loyalty Control — secure QR lookup, balance operations and rules. */
import { useEffect, useState } from "react";
import {
  adminAdjustLoyalty,
  adminDeleteLoyaltyMission,
  adminLookupLoyaltyCard,
  adminRotateLoyaltyCard,
  adminSaveLoyaltyConfig,
  adminSaveLoyaltyMission,
  adminSearchLoyaltyMembers,
  fetchAdminLoyaltyConfig,
  fetchAdminLoyaltyMissions,
  fetchAdminStarsRewards,
  fetchRewardAnalytics,
  saveAdminStarsRewards,
  hasNativeQrScanner,
  scanQrNative,
  type AdminLoyaltyProfile,
  type AdminStarsRewardConfig,
  type LoyaltyConfig,
  type RewardAnalytics,
} from "./api";
import { CameraQrScanner } from "./features-power";
import { useI18n } from "./i18n";
import { formatPrice, haptic } from "./kit";
import { IconBag, IconChart, IconCheck, IconLoyaltyCore, IconQrScan, IconRefresh, IconSearch, IconShare, IconSparkle, IconStarsOrbit, IconStore, IconTrash, IconTruck } from "./icons";

const input = "w-full rounded-[14px] border border-white/10 bg-black/20 px-3.5 py-3 text-[12px] font-bold text-white outline-none placeholder:text-white/30 focus:border-[#60ff9b]/50";
type MissionLanguage = "uz" | "ru" | "en";
type MissionMetric = "orders" | "spend" | "daily" | "referrals";
type LocalizedMissionText = Record<MissionLanguage, string>;

const emptyMissionText = (): LocalizedMissionText => ({ uz: "", ru: "", en: "" });

function MissionAdminGlyph({ metric }: { metric: MissionMetric }) {
  if (metric === "orders") return <IconBag size={21} />;
  if (metric === "daily") return <IconRefresh size={21} />;
  if (metric === "referrals") return <IconShare size={21} />;
  if (metric === "spend") return <IconStarsOrbit size={23} />;
  return <IconLoyaltyCore size={22} />;
}

export function LoyaltyAdminTab({ onToast }: { onToast: (message: string) => void }) {
  const { lang } = useI18n();
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  const [tab, setTab] = useState<"member" | "rules" | "missions" | "rewards">("member");
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<AdminLoyaltyProfile | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);
  const [adjustType, setAdjustType] = useState<"earn" | "spend">("earn");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [config, setConfig] = useState<LoyaltyConfig | null>(null);
  const [missions, setMissions] = useState<any[]>([]);
  const [missionTitle, setMissionTitle] = useState<LocalizedMissionText>(emptyMissionText);
  const [missionDescription, setMissionDescription] = useState<LocalizedMissionText>(emptyMissionText);
  const [missionMetric, setMissionMetric] = useState<MissionMetric>("orders");
  const [missionTarget, setMissionTarget] = useState("1");
  const [missionReward, setMissionReward] = useState("100");
  const [rewardConfig, setRewardConfig] = useState<AdminStarsRewardConfig | null>(null);
  const [rewardAnalytics, setRewardAnalytics] = useState<RewardAnalytics | null>(null);
  const [rewardSaving, setRewardSaving] = useState(false);

  const tabLabels = {
    member: L("A'zo", "Участник", "Member"),
    rules: L("Qoidalar", "Правила", "Rules"),
    missions: L("Missiyalar", "Миссии", "Missions"),
    rewards: L("Mukofot", "Награды", "Rewards"),
  };
  const tierLabels = {
    bronze: L("Bronza", "Бронза", "Bronze"),
    silver: L("Kumush", "Серебро", "Silver"),
    gold: L("Oltin", "Золото", "Gold"),
  };
  const adjustLabels = {
    earn: L("Hisoblash", "Начислить", "Credit"),
    spend: L("Yechish", "Списать", "Debit"),
  };
  const metricLabels: Record<MissionMetric, string> = {
    orders: L("Buyurtmalar", "Заказы", "Orders"),
    spend: L("Xarajat, UZS", "Расходы, UZS", "Spend, UZS"),
    daily: L("Kunlik bonuslar", "Ежедневные бонусы", "Daily claims"),
    referrals: L("Tavsiyalar", "Рефералы", "Referrals"),
  };
  const sourceLabels: Record<string, string> = {
    order: L("Buyurtma", "Заказ", "Order"),
    daily: L("Kunlik bonus", "Ежедневный бонус", "Daily reward"),
    referral: L("Tavsiya", "Реферал", "Referral"),
    reward: L("Mukofot", "Награда", "Reward"),
    admin: L("Menejer", "Менеджер", "Manager"),
    mission: L("Missiya", "Миссия", "Mission"),
    birthday: L("Tug'ilgan kun", "День рождения", "Birthday"),
    campaign: L("Aksiya", "Акция", "Campaign"),
    expiry: L("Muddati tugadi", "Срок истёк", "Expired"),
    opening: L("Boshlang'ich", "Начальный", "Opening"),
  };

  const refreshRules = async () => {
    const [cfg, list] = await Promise.all([fetchAdminLoyaltyConfig(), fetchAdminLoyaltyMissions()]);
    if (cfg) setConfig(cfg);
    if (list) setMissions(list.missions || []);
  };
  const refreshRewards = async () => {
    const [settings, analytics] = await Promise.all([fetchAdminStarsRewards(), fetchRewardAnalytics()]);
    if (settings) setRewardConfig(settings);
    if (analytics) setRewardAnalytics(analytics);
  };
  useEffect(() => { void refreshRules(); void refreshRewards(); }, []);
  useEffect(() => {
    const currentCode = profile?.cardCode;
    if (!currentCode) return;
    void adminLookupLoyaltyCard(currentCode, lang).then((translated) => {
      if (translated) setProfile(translated);
    });
    // Only language changes should refresh the already-selected profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const localizedError = (error?: string) => {
    if (error === "insufficient_stars") return L("Stars yetarli emas", "Недостаточно Stars", "Insufficient Stars");
    if (error === "card_not_found") return L("Karta topilmadi", "Карта не найдена", "Card not found");
    if (error === "forbidden") return L("Ruxsat yo'q", "Нет доступа", "Access denied");
    return L("Amalni bajarib bo'lmadi", "Не удалось выполнить операцию", "Operation failed");
  };

  const normalize = (raw: string) => raw.trim().toUpperCase().replace(/^DELIS-CARD:/, "");
  const lookup = async (raw = code) => {
    const normalized = normalize(raw);
    if (!normalized) return;
    setLoading(true);
    const found = await adminLookupLoyaltyCard(normalized, lang);
    setLoading(false);
    if (!found) {
      haptic("error");
      onToast(L("Karta topilmadi", "Карта не найдена", "Card not found"));
      return;
    }
    setCode(found.cardCode);
    setProfile(found);
    setMembers([]);
    haptic("success");
  };

  const scan = async () => {
    if (!hasNativeQrScanner()) {
      setCameraLive(true);
      return;
    }
    const value = await scanQrNative(L("DELIS kartasini skanerlang", "Сканируйте карту DELIS", "Scan DELIS card"));
    if (value) {
      setCode(normalize(value));
      await lookup(value);
    }
  };

  const search = async () => {
    if (query.trim().length < 2) return;
    const result = await adminSearchLoyaltyMembers(query.trim());
    setMembers(result?.members || []);
  };

  const adjust = async () => {
    if (!profile || !Number(amount) || reason.trim().length < 3) return;
    setLoading(true);
    const result = await adminAdjustLoyalty(profile.cardCode, {
      type: adjustType,
      amount: Number(amount),
      reason: reason.trim(),
    });
    setLoading(false);
    if (!result.ok || !result.profile) {
      haptic("error");
      onToast(localizedError(result.error));
      return;
    }
    setProfile(result.profile);
    setAmount("");
    setReason("");
    haptic("success");
    onToast(`${adjustType === "earn" ? "+" : "−"}${Number(amount)} DELIS Stars`);
  };

  const rotateCard = async () => {
    if (!profile || !window.confirm(L(
      "QR kod yangilansinmi? Eski kod ishlamaydi.",
      "Обновить QR? Старый код перестанет работать.",
      "Rotate QR? The old code will stop working.",
    ))) return;
    const result = await adminRotateLoyaltyCard(profile.cardCode);
    if (!result.ok || !result.profile || !result.code) {
      haptic("error");
      onToast(localizedError(result.error));
      return;
    }
    setProfile(result.profile);
    setCode(result.code);
    haptic("success");
    onToast(L("Yangi QR yaratildi", "Новый QR создан", "New QR created"));
  };

  const saveConfig = async () => {
    if (!config) return;
    const result = await adminSaveLoyaltyConfig(config);
    if (!result.ok) {
      haptic("error");
      onToast(localizedError(result.error));
      return;
    }
    haptic("success");
    onToast(L("Qoidalar saqlandi", "Правила сохранены", "Rules saved"));
  };

  const updateReward = (id: string, patch: Partial<AdminStarsRewardConfig["rewards"][number]>) => {
    setRewardConfig((current) => current ? {
      ...current,
      rewards: current.rewards.map((reward) => reward.id === id ? { ...reward, ...patch } : reward),
    } : current);
  };

  const persistRewards = async (next = rewardConfig) => {
    if (!next || rewardSaving) return;
    setRewardSaving(true);
    const result = await saveAdminStarsRewards({
      enabled: next.enabled,
      rewards: next.rewards.map((reward) => ({
        id: reward.id,
        active: reward.active,
        cost: Math.max(1, Math.round(reward.cost)),
        minSpend: Math.max(0, Math.round(reward.minSpend)),
        maxDiscount: reward.maxDiscount ? Math.max(0, Math.round(reward.maxDiscount)) : undefined,
        expiresInDays: Math.max(1, Math.round(reward.expiresInDays)),
        productId: reward.productId,
      })),
      economics: next.economics,
      productCosts: Object.fromEntries(next.products.map((product) => [product.id, Math.max(0, Math.round(product.costPrice || 0))])),
    });
    setRewardSaving(false);
    if (!result.ok) {
      haptic("error");
      onToast(L("Mukofot sozlamalari saqlanmadi", "Настройки наград не сохранены", "Reward settings were not saved"));
      return;
    }
    if (result.config) setRewardConfig(result.config);
    await refreshRewards();
    haptic("success");
    onToast(L("Mukofot iqtisodiyoti saqlandi", "Экономика наград сохранена", "Reward economics saved"));
  };

  const toggleRewardCenter = async () => {
    if (!rewardConfig) return;
    const next = { ...rewardConfig, enabled: !rewardConfig.enabled };
    setRewardConfig(next);
    await persistRewards(next);
  };

  const createMission = async () => {
    const titles = {
      uz: missionTitle.uz.trim(),
      ru: missionTitle.ru.trim(),
      en: missionTitle.en.trim(),
    };
    const descriptions = {
      uz: missionDescription.uz.trim(),
      ru: missionDescription.ru.trim(),
      en: missionDescription.en.trim(),
    };
    if (
      Object.values(titles).some((value) => !value)
      || Object.values(descriptions).some((value) => !value)
      || Number(missionTarget) < 1
      || Number(missionReward) < 1
    ) {
      onToast(L("Uch tildagi barcha maydonlarni to'ldiring", "Заполните все поля на трёх языках", "Complete every field in all three languages"));
      return;
    }
    const id = `${titles.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mission"}-${Date.now().toString(36)}`;
    const result = await adminSaveLoyaltyMission({
      id,
      metric: missionMetric,
      target: Number(missionTarget),
      reward: Number(missionReward),
      title: titles,
      description: descriptions,
      icon: "⚡",
      active: true,
    });
    if (!result.ok) {
      haptic("error");
      onToast(localizedError(result.error));
      return;
    }
    setMissionTitle(emptyMissionText());
    setMissionDescription(emptyMissionText());
    await refreshRules();
    haptic("success");
    onToast(L("Missiya yaratildi", "Миссия создана", "Mission created"));
  };

  const deleteMission = async (id: string) => {
    if (!window.confirm(L("Missiya o'chirilsinmi?", "Удалить миссию?", "Delete this mission?"))) return;
    const result = await adminDeleteLoyaltyMission(id);
    if (!result.ok) {
      haptic("error");
      onToast(localizedError(result.error));
      return;
    }
    await refreshRules();
    onToast(L("Missiya o'chirildi", "Миссия удалена", "Mission deleted"));
  };

  return (
    <div className="loyalty-admin rounded-[24px] border border-[#60ff9b]/15 bg-[#070a0f] p-4 text-white shadow-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[#60ff9b]/60">
            {L("SODIQLIK BOSHQARUVI", "УПРАВЛЕНИЕ ЛОЯЛЬНОСТЬЮ", "LOYALTY CONTROL")}
          </p>
          <h3 className="mt-1 font-display text-[17px] font-black">
            {L("DELIS//BOSHQARUVCHI", "DELIS//ОПЕРАТОР", "DELIS//OPERATOR")}
          </h3>
        </div>
        <span className="loyalty-live-dot h-2 w-2 rounded-full bg-[#60ff9b]" title={L("Tizim faol", "Система активна", "System online")} />
      </div>

      <div className="mb-4 grid grid-cols-4 gap-1 rounded-[14px] bg-white/[0.05] p-1">
        {(["member", "rules", "missions", "rewards"] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-[11px] py-2 text-[9px] font-black uppercase tracking-wider ${tab === id ? "bg-[#60ff9b] text-[#05070b]" : "text-white/45"}`}
          >
            {tabLabels[id]}
          </button>
        ))}
      </div>

      {tab === "member" && (
        <div className="space-y-3">
          {cameraLive && (
            <CameraQrScanner
              onCode={(value) => { setCameraLive(false); setCode(normalize(value)); void lookup(value); }}
              onClose={() => setCameraLive(false)}
            />
          )}
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void lookup()}
              placeholder="DLX-XXXX-XXXX-XXXX"
              aria-label={L("Karta kodi", "Код карты", "Card code")}
              className={input}
            />
            <button onClick={() => lookup()} aria-label={L("Kartani topish", "Найти карту", "Find card")} className="grid w-12 shrink-0 place-items-center rounded-[14px] bg-[#60ff9b] text-black">
              <IconSearch size={17} />
            </button>
            <button onClick={scan} aria-label={L("QR skanerlash", "Сканировать QR", "Scan QR")} className="grid w-12 shrink-0 place-items-center rounded-[14px] border border-[#67e8f9]/25 bg-[#67e8f9]/10 text-[#67e8f9]">
              <IconQrScan size={18} />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void search()}
              placeholder={L("Ism, telefon, Telegram ID", "Имя, телефон, Telegram ID", "Name, phone, Telegram ID")}
              className={input}
            />
            <button onClick={search} aria-label={L("A'zoni qidirish", "Найти участника", "Search members")} className="rounded-[14px] border border-white/10 px-3 text-[10px] font-black">
              <IconRefresh size={15} />
            </button>
          </div>
          {members.length > 0 && (
            <div className="space-y-1.5">
              {members.map((member) => (
                <button
                  key={member.tg_id}
                  onClick={() => { setCode(member.code); void lookup(member.code); }}
                  className="flex w-full items-center justify-between rounded-[14px] bg-white/[0.05] p-3 text-left"
                >
                  <div><p className="text-[11px] font-bold">{member.first_name || member.username || member.tg_id}</p><p className="text-[9px] text-white/35">{member.code}</p></div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-black text-[#60ff9b]">{member.stars} <IconStarsOrbit size={14} /></span>
                </button>
              ))}
            </div>
          )}
          {loading && <div className="h-28 animate-pulse rounded-[18px] bg-white/[0.05]" />}
          {profile && (
            <>
              <div className="relative overflow-hidden rounded-[22px] border border-[#60ff9b]/20 bg-gradient-to-br from-[#141b27] to-[#07090e] p-4">
                <div className="loyalty-grid absolute inset-0" />
                <div className="relative">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-[9px] font-black text-white/35">{profile.cardCode}</p>
                      <p className="mt-1 text-[15px] font-black">{profile.userName}</p>
                      <p className="text-[9px] text-white/40">@{profile.customer.username || "—"} · {profile.customer.phone || "—"}</p>
                    </div>
                    <span className="text-[10px] font-black uppercase text-[#67e8f9]">{tierLabels[profile.level]}</span>
                  </div>
                  <p className="mt-5 flex items-center gap-2 font-display text-[38px] font-black leading-none">{profile.stars.toLocaleString()} <span className="text-[#60ff9b]"><IconStarsOrbit size={24} /></span></p>
                  <p className="mt-1 text-[9px] text-white/35">
                    {profile.totalEarned} {L("olindi", "начислено", "earned")} · {profile.totalSpent} {L("sarflandi", "списано", "spent")}
                  </p>
                </div>
              </div>
              <button onClick={rotateCard} className="w-full rounded-[12px] border border-[#67e8f9]/20 bg-[#67e8f9]/8 py-2 text-[9px] font-black uppercase tracking-wider text-[#67e8f9]">
                ↻ {L("HIMOYALANGAN QR-NI YANGILASH", "ОБНОВИТЬ ЗАЩИЩЁННЫЙ QR", "ROTATE SECURE QR")}
              </button>
              <div className="grid grid-cols-2 gap-2">
                {(["earn", "spend"] as const).map((id) => (
                  <button
                    key={id}
                    onClick={() => setAdjustType(id)}
                    className={`rounded-[13px] py-2.5 text-[10px] font-black uppercase ${adjustType === id ? id === "earn" ? "bg-[#60ff9b] text-black" : "bg-[#a855f7] text-white" : "bg-white/[0.05] text-white/40"}`}
                  >
                    {adjustLabels[id]}
                  </button>
                ))}
              </div>
              <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={L("Stars miqdori", "Количество Stars", "Stars amount")} className={input} />
              <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={L("Sabab (jurnal uchun)", "Причина для журнала", "Audit reason")} className={input} />
              <button onClick={adjust} disabled={loading} className="press flex w-full items-center justify-center gap-2 rounded-[15px] bg-gradient-to-r from-[#18d66b] to-[#67e8f9] py-3 text-[11px] font-black text-black">
                <IconCheck size={15} /> {L("TRANZAKSIYANI QO'LLASH", "ПРИМЕНИТЬ ТРАНЗАКЦИЮ", "APPLY TRANSACTION")}
              </button>
              <div className="max-h-60 space-y-1.5 overflow-y-auto">
                {profile.history.slice(0, 12).map((history) => (
                  <div key={history.id} className="flex justify-between rounded-[12px] bg-white/[0.04] p-2.5">
                    <div className="min-w-0"><p className="truncate text-[10px] font-bold">{history.description}</p><p className="text-[9px] text-white/30">{sourceLabels[history.source || ""] || history.source || "Stars"}</p></div>
                    <span className={`text-[10px] font-black ${history.type === "earn" ? "text-[#60ff9b]" : "text-[#c084fc]"}`}>{history.type === "earn" ? "+" : "−"}{history.amount}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "rules" && config && (
        <div className="space-y-3">
          <Rule label={L("1 Star qiymati, UZS", "Стоимость 1 Star, UZS", "1 Star value, UZS")} value={config.starValueUzs} onChange={(value) => setConfig({ ...config, starValueUzs: value })} />
          <Rule label={L("Amal qilish (kun, 0=cheksiz)", "Срок действия (дней, 0=∞)", "Expiry days (0=∞)")} value={config.expirationDays} onChange={(value) => setConfig({ ...config, expirationDays: value })} />
          <Rule label={L("Ogohlantirish (kun)", "Предупреждать за дней", "Warning days")} value={config.expiryWarningDays} onChange={(value) => setConfig({ ...config, expiryWarningDays: value })} />
          <Rule label={L("Tug'ilgan kun bonusi", "Бонус на день рождения", "Birthday bonus")} value={config.birthdayBonus} onChange={(value) => setConfig({ ...config, birthdayBonus: value })} />
          {(["bronze", "silver", "gold"] as const).map((tier) => (
            <div key={tier} className="rounded-[16px] border border-white/8 bg-white/[0.04] p-3">
              <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-[#67e8f9]">{tierLabels[tier]}</p>
              <div className="grid grid-cols-2 gap-2">
                <Rule label={L("Min. Stars", "Мин. Stars", "Min Stars")} value={config.tiers[tier].minStars} disabled={tier === "bronze"} onChange={(value) => setConfig({ ...config, tiers: { ...config.tiers, [tier]: { ...config.tiers[tier], minStars: value } } })} />
                <Rule label={L("Keshbek, %", "Кэшбэк, %", "Cashback, %")} value={config.tiers[tier].cashbackPercent} onChange={(value) => setConfig({ ...config, tiers: { ...config.tiers, [tier]: { ...config.tiers[tier], cashbackPercent: value } } })} />
              </div>
            </div>
          ))}
          <button onClick={saveConfig} className="press w-full rounded-[15px] bg-[#60ff9b] py-3 text-[11px] font-black text-black">
            {L("SODIQLIK QOIDALARINI SAQLASH", "СОХРАНИТЬ ПРАВИЛА ЛОЯЛЬНОСТИ", "SAVE LOYALTY RULES")}
          </button>
        </div>
      )}

      {tab === "missions" && (
        <div className="space-y-3">
          <div className="space-y-2 rounded-[18px] border border-white/8 bg-white/[0.04] p-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-[#67e8f9]">
              {L("UCH TILDAGI KONTENT", "КОНТЕНТ НА ТРЁХ ЯЗЫКАХ", "CONTENT IN THREE LANGUAGES")}
            </p>
            {(["uz", "ru", "en"] as const).map((fieldLang) => (
              <div key={fieldLang} className="grid grid-cols-[32px_1fr] gap-2">
                <span className="grid place-items-center rounded-[10px] bg-white/[0.06] text-[9px] font-black uppercase text-white/45">{fieldLang}</span>
                <div className="space-y-2">
                  <input
                    value={missionTitle[fieldLang]}
                    onChange={(event) => setMissionTitle({ ...missionTitle, [fieldLang]: event.target.value })}
                    placeholder={`${L("Missiya nomi", "Название миссии", "Mission title")} · ${fieldLang.toUpperCase()}`}
                    className={input}
                  />
                  <input
                    value={missionDescription[fieldLang]}
                    onChange={(event) => setMissionDescription({ ...missionDescription, [fieldLang]: event.target.value })}
                    placeholder={`${L("Missiya tavsifi", "Описание миссии", "Mission description")} · ${fieldLang.toUpperCase()}`}
                    className={input}
                  />
                </div>
              </div>
            ))}
            <select value={missionMetric} onChange={(event) => setMissionMetric(event.target.value as MissionMetric)} aria-label={L("Missiya ko'rsatkichi", "Метрика миссии", "Mission metric")} className={input}>
              {(Object.keys(metricLabels) as MissionMetric[]).map((metric) => <option key={metric} value={metric}>{metricLabels[metric]}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input value={missionTarget} onChange={(event) => setMissionTarget(event.target.value.replace(/\D/g, ""))} inputMode="numeric" className={input} placeholder={L("Maqsad", "Цель", "Target")} />
              <input value={missionReward} onChange={(event) => setMissionReward(event.target.value.replace(/\D/g, ""))} inputMode="numeric" className={input} placeholder={L("Mukofot", "Награда", "Reward")} />
            </div>
            <button onClick={createMission} className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-[#67e8f9] py-2.5 text-[10px] font-black text-black">
              <IconSparkle size={14} /> {L("MISSIYA YARATISH", "СОЗДАТЬ МИССИЮ", "CREATE MISSION")}
            </button>
          </div>
          {missions.length === 0 && <p className="py-4 text-center text-[10px] text-white/35">{L("Missiyalar yo'q", "Миссий пока нет", "No missions yet")}</p>}
          {missions.map((mission) => (
            <div key={mission.id} className="motion-surface flex items-center gap-3 rounded-[16px] bg-white/[0.05] p-3">
              <span className="motion-icon-tile grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-[#60ff9b]/10 text-[#60ff9b]"><MissionAdminGlyph metric={mission.metric as MissionMetric} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-black">{mission[`title_${lang}`] || mission.title_uz}</p>
                <p className="flex flex-wrap items-center gap-1 text-[9px] text-white/35">
                  {metricLabels[mission.metric as MissionMetric] || mission.metric}: {mission.target} · +{mission.reward} <IconStarsOrbit size={11} /> · {mission.active ? L("Faol", "Активна", "Active") : L("O'chirilgan", "Отключена", "Disabled")}
                </p>
              </div>
              {Boolean(mission.active) && (
                <button onClick={() => void deleteMission(mission.id)} aria-label={L("Missiyani o'chirish", "Удалить миссию", "Delete mission")} className="grid h-8 w-8 place-items-center rounded-[10px] bg-red-500/10 text-red-300">
                  <IconTrash size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "rewards" && (
        <div className="space-y-3">
          {!rewardConfig && <div className="h-40 animate-pulse rounded-[18px] bg-white/[0.05]" />}
          {rewardConfig && (
            <>
              <div className={`rounded-[18px] border p-3.5 ${rewardConfig.enabled ? "border-[#60ff9b]/25 bg-[#60ff9b]/8" : "border-red-400/25 bg-red-400/8"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-white">{L("Mukofot markazi", "Центр наград", "Reward Center")}</p>
                    <p className="mt-0.5 text-[9px] text-white/45">{rewardConfig.enabled ? L("Mijozlar uchun ochiq", "Доступен клиентам", "Available to customers") : L("Favqulodda pauza", "Экстренная пауза", "Emergency pause")}</p>
                  </div>
                  <button
                    onClick={() => void toggleRewardCenter()}
                    disabled={rewardSaving}
                    className={`rounded-full px-3 py-2 text-[9px] font-black uppercase ${rewardConfig.enabled ? "bg-red-400/15 text-red-300" : "bg-[#60ff9b] text-black"}`}
                  >
                    {rewardConfig.enabled ? L("To'xtatish", "Остановить", "Pause") : L("Yoqish", "Enable", "Enable")}
                  </button>
                </div>
              </div>

              {rewardAnalytics && (
                <div className="space-y-2 rounded-[18px] border border-[#67e8f9]/15 bg-[#67e8f9]/[0.04] p-3">
                  <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[#67e8f9]"><IconChart size={13} /> ROI CONTROL</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      [L("Berildi", "Выдано", "Issued"), rewardAnalytics.issued.toLocaleString()],
                      [L("Ishlatildi", "Использовано", "Redeemed"), `${rewardAnalytics.redeemed} · ${rewardAnalytics.redemptionRate}%`],
                      [L("Bog'liq tushum", "Связанная выручка", "Linked revenue"), formatPrice(rewardAnalytics.rewardRevenue, lang)],
                      [L("Bonus xarajati", "Выданная выгода", "Benefit granted"), formatPrice(rewardAnalytics.benefitGranted, lang)],
                      [L("Potensial majburiyat", "Потенциальные обязательства", "Outstanding liability"), formatPrice(rewardAnalytics.outstandingLiability, lang)],
                      [L("Taxminiy marja", "Расчётная маржа", "Estimated margin"), `${rewardAnalytics.estimatedMarginPercent}% / ${rewardAnalytics.targetMarginPercent}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[13px] bg-white/[0.05] p-2.5">
                        <p className="text-[9px] font-black uppercase text-white/30">{label}</p>
                        <p className="mt-1 text-[11px] font-black text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-[12px] bg-black/20 p-2.5 text-[9px] text-white/50">
                    {L("Mukofotli o'rtacha chek", "Средний чек с наградой", "Reward AOV")}: <b className="text-white">{formatPrice(rewardAnalytics.averageRewardOrder, lang)}</b> · {L("Oddiy", "Без награды", "Regular")}: <b className="text-white">{formatPrice(rewardAnalytics.averageRegularOrder, lang)}</b>
                    <br />{L("Tannarx qamrovi", "Заполненность себестоимости", "Cost coverage")}: <b className={rewardAnalytics.costCoveragePercent === 100 ? "text-[#60ff9b]" : "text-amber-300"}>{rewardAnalytics.costCoveragePercent}%</b>
                  </div>
                  {rewardAnalytics.warnings.map((warning) => (
                    <p key={warning} className="rounded-[11px] border border-amber-300/15 bg-amber-300/8 px-2.5 py-2 text-[9px] font-bold text-amber-200">
                      {warning === "missing_product_costs"
                        ? L("Barcha mahsulotlar tannarxini kiriting", "Заполните себестоимость всех товаров", "Enter cost for every product")
                        : warning === "margin_below_target"
                          ? L("Marja maqsaddan past", "Маржа ниже целевой", "Margin is below target")
                          : L("Mukofot markazi pauzada", "Центр наград на паузе", "Reward Center is paused")}
                    </p>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {rewardConfig.rewards.map((reward) => {
                  const stats = rewardAnalytics?.byReward.find((item) => item.id === reward.id);
                  const giftProduct = reward.kind === "gift" ? rewardConfig.products.find((product) => product.id === reward.productId) : null;
                  const title = giftProduct
                    ? L(`Sovg'a: ${giftProduct.nameUz}`, `Подарок: ${giftProduct.nameRu || giftProduct.nameUz}`, `Gift: ${giftProduct.nameEn || giftProduct.nameUz}`)
                    : reward.titles[lang] || reward.titles.uz;
                  return (
                    <div key={reward.id} className={`rounded-[17px] border p-3 ${reward.active ? "border-white/10 bg-white/[0.045]" : "border-white/5 bg-white/[0.02] opacity-60"}`}>
                      <div className="mb-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#60ff9b]/10 text-[#60ff9b]">{reward.kind === "freeship" ? <IconTruck size={17} /> : reward.kind === "gift" ? <IconStore size={17} /> : <IconStarsOrbit size={18} />}</span>
                          <div><p className="text-[11px] font-black">{title}</p><p className="text-[9px] text-white/30">{stats?.redeemed || 0}/{stats?.issued || 0} · {formatPrice(stats?.revenue || 0, lang)}</p></div>
                        </div>
                        <button onClick={() => updateReward(reward.id, { active: !reward.active })} role="switch" aria-checked={reward.active} className={`relative h-7 w-12 rounded-full ${reward.active ? "bg-[#60ff9b]" : "bg-white/10"}`}>
                          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-[left] ${reward.active ? "left-6" : "left-1"}`} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Rule label={L("Narxi, Stars", "Цена, Stars", "Cost, Stars")} value={reward.cost} onChange={(value) => updateReward(reward.id, { cost: value })} />
                        <Rule label={L("Min. savat", "Мин. корзина", "Min basket")} value={reward.minSpend} onChange={(value) => updateReward(reward.id, { minSpend: value })} />
                        {reward.kind !== "gift" && <Rule label={L("Maks. foyda", "Макс. выгода", "Benefit cap")} value={reward.maxDiscount || 0} onChange={(value) => updateReward(reward.id, { maxDiscount: value })} />}
                        <Rule label={L("Muddat, kun", "Срок, дней", "TTL, days")} value={reward.expiresInDays} onChange={(value) => updateReward(reward.id, { expiresInDays: value })} />
                      </div>
                      {reward.kind === "gift" && (
                        <label className="mt-2 block">
                          <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-white/35">{L("Sovg'a mahsuloti", "Товар-подарок", "Gift product")}</span>
                          <select value={reward.productId || ""} onChange={(event) => updateReward(reward.id, { productId: event.target.value })} className={input}>
                            {rewardConfig.products.filter((product) => Boolean(product.active)).map((product) => <option key={product.id} value={product.id}>{product.nameRu || product.nameUz} · {formatPrice(product.price, lang)}</option>)}
                          </select>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 rounded-[18px] border border-white/8 bg-white/[0.04] p-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-[#67e8f9]">{L("Iqtisodiy model", "Экономическая модель", "Economics model")}</p>
                <button
                  onClick={() => setRewardConfig({ ...rewardConfig, economics: { ...rewardConfig.economics, profitGuardEnabled: !rewardConfig.economics.profitGuardEnabled } })}
                  role="switch"
                  aria-checked={rewardConfig.economics.profitGuardEnabled}
                  className={`flex w-full items-center justify-between rounded-[12px] border px-3 py-2.5 text-left ${rewardConfig.economics.profitGuardEnabled ? "border-[#60ff9b]/20 bg-[#60ff9b]/8" : "border-red-300/15 bg-red-300/5"}`}
                >
                  <span><b className="block text-[9px] uppercase text-white">Profit Guard</b><small className="text-[9px] text-white/35">{L("Maqsadli marjadan past mukofotni rad etadi", "Не применяет награду ниже целевой маржи", "Rejects rewards below target margin")}</small></span>
                  <span className={rewardConfig.economics.profitGuardEnabled ? "text-[#60ff9b]" : "text-red-300"}>{rewardConfig.economics.profitGuardEnabled ? "ON" : "OFF"}</span>
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <Rule label={L("Kuryer tannarxi", "Стоимость курьера", "Courier cost")} value={rewardConfig.economics.averageCourierCost} onChange={(value) => setRewardConfig({ ...rewardConfig, economics: { ...rewardConfig.economics, averageCourierCost: value } })} />
                  <Rule label={L("BTS tannarxi", "Стоимость BTS", "BTS cost")} value={rewardConfig.economics.averageBtsCost} onChange={(value) => setRewardConfig({ ...rewardConfig, economics: { ...rewardConfig.economics, averageBtsCost: value } })} />
                  <Rule label={L("To'lov komissiyasi, %", "Комиссия оплаты, %", "Payment fee, %")} value={rewardConfig.economics.paymentFeePercent} onChange={(value) => setRewardConfig({ ...rewardConfig, economics: { ...rewardConfig.economics, paymentFeePercent: value } })} />
                  <Rule label={L("Maqsadli marja, %", "Целевая маржа, %", "Target margin, %")} value={rewardConfig.economics.targetMarginPercent} onChange={(value) => setRewardConfig({ ...rewardConfig, economics: { ...rewardConfig.economics, targetMarginPercent: value } })} />
                  <Rule label={L("Tannarx zaxirasi, %", "Резерв себестоимости, %", "Fallback COGS, %")} value={rewardConfig.economics.fallbackCostPercent} onChange={(value) => setRewardConfig({ ...rewardConfig, economics: { ...rewardConfig.economics, fallbackCostPercent: value } })} />
                </div>
              </div>

              <div className="space-y-1.5 rounded-[18px] border border-white/8 bg-white/[0.04] p-3">
                <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-[#67e8f9]">{L("Mahsulot tannarxi", "Себестоимость товаров", "Product cost")}</p>
                {rewardConfig.products.filter((product) => Boolean(product.active)).map((product) => (
                  <label key={product.id} className="grid grid-cols-[1fr_120px] items-center gap-2 rounded-[11px] bg-black/15 px-2.5 py-2">
                    <span className="truncate text-[9px] font-bold text-white/70">{product.nameRu || product.nameUz}<small className="ml-1 text-white/25">{formatPrice(product.price, lang)}</small></span>
                    <input type="number" min="0" value={product.costPrice || 0} onChange={(event) => setRewardConfig({ ...rewardConfig, products: rewardConfig.products.map((item) => item.id === product.id ? { ...item, costPrice: Number(event.target.value) } : item) })} className="rounded-[10px] border border-white/10 bg-black/20 px-2 py-2 text-right text-[10px] font-black text-white outline-none" />
                  </label>
                ))}
              </div>

              <button onClick={() => void persistRewards()} disabled={rewardSaving} className="press flex w-full items-center justify-center gap-2 rounded-[15px] bg-[#60ff9b] py-3 text-[11px] font-black text-black disabled:opacity-50">
                <IconCheck size={15} /> {rewardSaving ? "…" : L("IQTISODIYOTNI SAQLASH", "СОХРАНИТЬ ЭКОНОМИКУ", "SAVE ECONOMICS")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Rule({ label, value, onChange, disabled = false }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-white/35">{label}</span>
      <input disabled={disabled} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} className={`${input} disabled:opacity-35`} />
    </label>
  );
}

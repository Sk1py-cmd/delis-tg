/**
 * DELIS — Магазин за Telegram-звёзды: обмен звёзд на бонусы (процент, доставка, подарок).
 */
import { useEffect, useState } from "react";
import { useI18n, type L10n } from "./i18n";
import { fetchStarsRewards } from "./api";
import { PRODUCTS } from "./data";
import { formatPrice, haptic } from "./kit";
import { Sheet } from "./chrome";
import { IconCheck, IconGift, IconStarsOrbit, IconStore, IconTag, IconTruck } from "./icons";

export type StarsRewardKind = "percent" | "freeship" | "gift";

export type StarsReward = {
  id: string;
  cost: number;
  kind: StarsRewardKind;
  value?: number; // percent for kind=percent
  productId?: string; // gift product for kind=gift
  minSpend: number;
  maxDiscount?: number;
  expiresInDays: number;
  retailOnly: boolean;
  title: L10n;
  sub: L10n;
};

export const STARS_REWARDS: StarsReward[] = [
  {
    id: "stars2", cost: 300, kind: "percent", value: 2, minSpend: 180_000, maxDiscount: 10_000, expiresInDays: 14, retailOnly: true,
    title: { uz: "2% chegirma", ru: "Скидка 2%", en: "2% discount" },
    sub: { uz: "180 000 so'mdan · 10 000 gacha", ru: "От 180 000 сум · до 10 000", en: "From 180,000 UZS · up to 10,000" },
  },
  {
    id: "stars5", cost: 700, kind: "percent", value: 5, minSpend: 300_000, maxDiscount: 25_000, expiresInDays: 14, retailOnly: true,
    title: { uz: "5% chegirma", ru: "Скидка 5%", en: "5% discount" },
    sub: { uz: "300 000 so'mdan · 25 000 gacha", ru: "От 300 000 сум · до 25 000", en: "From 300,000 UZS · up to 25,000" },
  },
  {
    id: "starship", cost: 900, kind: "freeship", minSpend: 130_000, maxDiscount: 20_000, expiresInDays: 14, retailOnly: true,
    title: { uz: "Yetkazishga 20 000", ru: "20 000 на доставку", en: "20,000 toward delivery" },
    sub: { uz: "130 000 so'mlik buyurtmadan", ru: "При заказе от 130 000 сум", en: "On orders from 130,000 UZS" },
  },
  {
    id: "stargift", cost: 1000, kind: "gift", productId: "glass", minSpend: 350_000, expiresInDays: 14, retailOnly: true,
    title: { uz: "Sovg'a: Glass №4", ru: "Подарок: Glass №4", en: "Gift: Glass №4" },
    sub: { uz: "350 000 so'mlik savatga qo'shiladi", ru: "Добавится к корзине от 350 000 сум", en: "Added to a basket from 350,000 UZS" },
  },
];

function RewardGlyph({ kind }: { kind: StarsRewardKind }) {
  if (kind === "freeship") return <IconTruck size={25} />;
  if (kind === "gift") return <IconGift size={25} />;
  return <IconTag size={25} />;
}

export function StarsShopSheet({
  open,
  onClose,
  stars,
  onRedeem,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  stars: number;
  onRedeem: (reward: StarsReward) => Promise<boolean>;
  onToast: (msg: string) => void;
}) {
  const { lang } = useI18n();
  const [boughtId, setBoughtId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rewards, setRewards] = useState<StarsReward[]>(STARS_REWARDS);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetchStarsRewards().then((catalog) => {
      if (!active || catalog === null) return;
      // Never expose legacy rewards that lack the server-enforced basket/cap
      // contract. During a rolling frontend/backend deploy the shop pauses
      // instead of issuing an unsafe old coupon.
      const compatible = catalog.every((reward) =>
        Number(reward.minSpend) > 0
        && Number(reward.expiresInDays) > 0
        && reward.retailOnly === true
        && (reward.kind === "gift" || Number(reward.maxDiscount) > 0),
      );
      if (!compatible) {
        setRewards([]);
        return;
      }
      setRewards(catalog.map((reward) => ({
        id: reward.id,
        cost: reward.cost,
        kind: reward.kind,
        value: reward.value,
        productId: reward.productId,
        minSpend: reward.minSpend,
        maxDiscount: reward.maxDiscount || undefined,
        expiresInDays: reward.expiresInDays,
        retailOnly: reward.retailOnly,
        title: reward.titles,
        sub: reward.subtitles,
      })));
    });
    return () => { active = false; };
  }, [open]);

  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);

  const redeem = async (r: StarsReward) => {
    if (pendingId) return; // one redemption in flight at a time
    if (stars < r.cost) {
      haptic("light");
      onToast(L("Yetarli yulduz yo'q", "Не хватает звёзд", "Not enough stars"));
      return;
    }
    setPendingId(r.id);
    try {
      const ok = await onRedeem(r);
      if (!ok) return;
      setBoughtId(r.id);
      window.setTimeout(() => setBoughtId(null), 2000);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={L("DELIS Stars do'koni", "Магазин DELIS Stars", "DELIS Stars shop")}>
      <div className="space-y-4 pt-1">
        {/* Balance */}
        <div className="loyalty-shop-hero relative flex items-center justify-between overflow-hidden rounded-[24px] border border-[#60ff9b]/20 p-4 text-white">
          <div>
            <p className="text-[9px] font-extrabold uppercase tracking-[0.24em] text-[#60ff9b]/65">
              {L("Sizning balansingiz", "Ваш баланс", "Your balance")}
            </p>
            <p className="mt-1 font-display text-[30px] font-black leading-none text-white">
              {stars.toLocaleString()} <span className="ml-1 inline-flex align-middle text-[#60ff9b]"><IconStarsOrbit size={23} /></span>
            </p>
            <p className="mt-1 text-[10px] font-semibold text-white/45">
              {L("Xarid bonuslariga almashtiring", "Обменивайте на бонусы к покупке", "Exchange for purchase rewards")}
            </p>
          </div>
          <div className="motion-icon-tile grid h-14 w-14 place-items-center rounded-[18px] border border-[#60ff9b]/20 bg-[#60ff9b]/10 text-[#60ff9b]"><IconStore size={29} /></div>
        </div>

        <div className="rounded-[18px] border border-moss/15 bg-sagetint/45 px-3.5 py-3">
          <p className="text-[12px] font-bold leading-relaxed text-pine">
            {L(
              "Har bir mukofot savat minimumiga ega — shunda bonus foydali xaridni ochadi.",
              "Каждая награда открывается при минимальной корзине — бонус дополняет выгодную покупку.",
              "Each reward unlocks at a minimum basket, so the bonus supports a valuable purchase.",
            )}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-ink/55">
            {L("1 kupon · chakana buyurtma", "1 купон · розничный заказ", "1 coupon · retail order")} · {rewards[0]?.expiresInDays ?? 14} {L("kun", "дней", "days")}
          </p>
        </div>

        {rewards.length === 0 && (
          <div className="rounded-[20px] border border-amber/20 bg-amber/8 p-4 text-center">
            <p className="font-display text-[13px] font-bold text-ink">{L("Mukofotlar vaqtincha to'xtatilgan", "Награды временно приостановлены", "Rewards are temporarily paused")}</p>
            <p className="mt-1 text-[11px] font-medium text-ink2">{L("Stars balansingiz saqlanadi", "Ваш баланс Stars сохраняется", "Your Stars balance is safe")}</p>
          </div>
        )}

        <div className="space-y-2.5">
          {rewards.map((r) => {
            const affordable = stars >= r.cost;
            const giftProduct = r.kind === "gift" && r.productId ? PRODUCTS.find((p) => p.id === r.productId) : null;
            const justBought = boughtId === r.id;
            const pending = pendingId === r.id;
            return (
              <button
                key={r.id}
                onClick={() => redeem(r)}
                disabled={pending}
                className={`loyalty-shop-item motion-surface press w-full rounded-[22px] border p-4 text-left transition-all ${
                  justBought ? "border-[#60ff9b]/60 is-ready" : pending ? "border-[#67e8f9]/40" : affordable ? "border-ink/12" : "border-ink/6 opacity-45"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span className={`motion-icon-tile flex h-13 w-13 shrink-0 items-center justify-center rounded-[18px] ${affordable ? "bg-amber/15 text-amberdeep" : "bg-paper2 text-ink2"}`}>
                    <RewardGlyph kind={r.kind} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[15px] font-bold text-ink">{r.title[lang]}</p>
                    <p className="mt-0.5 text-[12px] font-medium text-ink/70">
                      {r.sub[lang]}
                      {giftProduct ? ` · ${giftProduct.name} (${formatPrice(giftProduct.price, lang)})` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-display text-[15px] font-extrabold ${justBought ? "text-moss" : "text-amberdeep"}`}>
                      {justBought ? <IconCheck size={18} strokeWidth={2.8} /> : pending ? "…" : <span className="inline-flex items-center gap-1">{r.cost.toLocaleString()} <IconStarsOrbit size={15} /></span>}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

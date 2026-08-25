/**
 * DELIS — Групповой заказ — совместная покупка, где участники собирают одну корзину.
 */
import { useState } from "react";
import { useI18n } from "./i18n";
import { CONFIG } from "./config";
import { PRODUCTS, type Product } from "./data";
import { formatPrice, haptic } from "./kit";
import { IconCheck, IconConfetti, IconCopy, IconRocket, IconShare, IconUsers } from "./icons";
import { Sheet } from "./chrome";

type Member = { name: string; items: number; sum: number; joinedAt: number };

const STORAGE_KEY = "delis_group_order";

function loadGroup(): { productId: string; members: Member[]; link: string; createdAt: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function GroupOrderSheet({ open, onClose, onToast }: { open: boolean; onClose: () => void; onToast: (msg: string) => void }) {
  const { lang } = useI18n();
  const [productId, setProductId] = useState("wax");
  const [group, setGroup] = useState<ReturnType<typeof loadGroup>>(() => loadGroup());
  const [copied, setCopied] = useState(false);

  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  const product: Product | undefined = PRODUCTS.find((p) => p.id === productId);

  const GROUP_SIZE = 5;
  const GROUP_DISCOUNT = 20;

  const createGroup = () => {
    if (!product) return;
    haptic("success");
    const id = Math.random().toString(36).slice(2, 8).toUpperCase();
    const link = `https://t.me/share/url?url=${encodeURIComponent(`${CONFIG.BOT_LINK}?start=group_${id}`)}&text=${encodeURIComponent(
      `${L("🛍 Qo'shil! Birgalikda", "🛍 Присоединяйся! Вместе", "🛍 Join us! Together")} ${product.name} — ${GROUP_SIZE} ${L("kishi = −20%", "человек = −20%", "people = −20%")}!`,
    )}`;
    const g = { productId: product.id, members: [{ name: L("Siz", "Вы", "You"), items: 1, sum: product.price, joinedAt: Date.now() }], link, createdAt: Date.now() };
    setGroup(g);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(g));
    } catch { /* ignore */ }
  };

  const shareLink = () => {
    if (!group) return;
    haptic("medium");
    window.open(group.link, "_blank", "noopener,noreferrer");
  };

  const copyLink = () => {
    if (!group) return;
    haptic("success");
    const id = group.link.match(/group_([A-Z0-9]+)/)?.[1] || "";
    const url = `${CONFIG.BOT_LINK}?start=group_${id}`;
    try {
      void navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      onToast(url);
    }
  };

  const progress = group ? Math.min(100, Math.round((group.members.length / GROUP_SIZE) * 100)) : 0;

  return (
    <Sheet open={open} onClose={onClose} title={L("Guruhli buyurtma", "Групповой заказ", "Group order")}>
      <div className="space-y-4 pt-1">
        <p className="text-[13px] font-medium leading-relaxed text-ink/70">
          {L(
            "Qo'shnilar, ofis yoki oila bilan birlashing — 5 kishi yig'ilsa, hamma 20% chegirma oladi!",
            "Объединитесь с соседями, офисом или семьёй — соберёте 5 человек, все получат скидку 20%!",
            "Team up with neighbours, office or family — 5 people = everyone gets 20% off!",
          )}
        </p>

        {!group ? (
          <>
            <div>
              <label className="text-[11px] font-bold text-ink/70">{L("Mahsulotni tanlang", "Выберите товар", "Choose product")}</label>
              <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
                {PRODUCTS.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { haptic("light"); setProductId(p.id); }}
                    className={`press flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-all ${
                      productId === p.id ? "border-ink bg-amber text-white" : "border-ink/15 bg-card text-ink/60"
                    }`}
                  >
                    <span className="h-4 w-4 overflow-hidden rounded-full">
                      <img src={p.img} alt="" className="h-full w-full object-cover" />
                    </span>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {product && (
              <div className="rounded-[18px] border border-moss/20 bg-sagetint/50 p-4">
                <div className="flex items-center justify-between text-[13px] font-bold">
                  <span className="text-ink">{product.name}</span>
                  <span className="text-moss">−{GROUP_DISCOUNT}%</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[12px]">
                  <span className="text-ink/70">{L("Odatiy narx", "Обычная цена", "Regular price")}</span>
                  <span className="text-ink/70 line-through">{formatPrice(product.price, lang)}</span>
                </div>
                <div className="flex items-center justify-between text-[13px] font-bold">
                  <span className="text-pine">{L("Guruh narxi", "Групповая цена", "Group price")}</span>
                  <span className="font-display text-pine">{formatPrice(Math.round(product.price * (100 - GROUP_DISCOUNT) / 100), lang)}</span>
                </div>
              </div>
            )}

            <button
              onClick={createGroup}
              className="btn-shine press flex h-13 w-full items-center justify-center gap-2 rounded-[20px] bg-amber text-[14px] font-bold text-white shadow-lift"
            >
              <IconRocket size={18} /> {L("Guruh yaratish", "Создать группу", "Create group")}
            </button>
          </>
        ) : (
          <>
            <div className="rounded-[20px] border border-amber/20 bg-amber/[0.05] p-4">
              <div className="flex items-center justify-between text-[12px] font-bold">
                <span className="flex items-center gap-1 text-amberdeep"><IconUsers size={15} /> {L("Qatnashchilar", "Участники", "Members")}: {group.members.length}/{GROUP_SIZE}</span>
                <span className="font-display text-[16px] text-amberdeep">{progress}%</span>
              </div>
              <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-amber/6">
                <div className="h-full rounded-full bg-gradient-to-r from-amber to-amberdeep transition-all duration-700" style={{ width: `${progress}%` }} />
              </div>
              {progress < 100 ? (
                <p className="mt-2 text-[11px] font-semibold text-ink/70">
                  {L("Yana", "Ещё", "Need")} {GROUP_SIZE - group.members.length} {L("kishi — hamma −20%", "человек — все −20%", "more — everyone −20%")}
                </p>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] font-bold text-moss"><IconConfetti size={16} /> {L("Guruh yig'ildi! Hammaga −20%", "Группа собрана! Всем −20%", "Group complete! Everyone −20%")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              {group.members.map((m, i) => (
                <div key={i} className="flex items-center justify-between rounded-[14px] bg-paper2/70 px-3.5 py-2.5">
                  <span className="flex items-center gap-2 text-[13px] font-bold text-ink">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pine text-[11px] text-white">{m.name.slice(0, 1).toUpperCase()}</span>
                    {m.name}
                  </span>
                  <span className="text-[12px] font-semibold text-ink/70">{m.items} {L("dona", "шт", "pcs")} · {formatPrice(m.sum, lang)}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={shareLink} className="press flex h-12 items-center justify-center gap-2 rounded-[16px] bg-amber text-[13px] font-bold text-white">
                <IconShare size={15} /> {L("Taklif qilish", "Пригласить", "Invite")}
              </button>
              <button onClick={copyLink} className="press flex h-12 items-center justify-center gap-2 rounded-[16px] border border-ink/15 bg-card text-[13px] font-bold text-ink/70">
                {copied ? <IconCheck size={15} className="text-moss" /> : <IconCopy size={15} />}
                {copied ? L("Nusxalandi", "Скопировано", "Copied") : L("Havola", "Ссылка", "Link")}
              </button>
            </div>

            <button
              onClick={() => {
                setGroup(null);
                try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
                haptic("light");
              }}
              className="press w-full text-center text-[11px] font-bold text-ink/60 underline-offset-2 hover:underline"
            >
              {L("Guruhni yopish", "Закрыть группу", "Close group")}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

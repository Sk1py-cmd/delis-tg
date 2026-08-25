/**
 * DELIS — Сохранённые платёжные карты пользователя.
 */
import { useState } from "react";
import { useI18n } from "./i18n";
import { haptic } from "./kit";
import { IconClose } from "./icons";

export type SavedCard = {
  id: string;
  last4: string;
  type: "humo" | "uzcard" | "visa" | "mastercard";
  holder: string;
  expMonth: string;
  expYear: string;
  savedAt: number;
};

function CardIcon({ type }: { type: string }) {
  if (type === "humo") return <span className="font-display text-[10px] font-black text-amber">HUMO</span>;
  if (type === "uzcard") return <span className="font-display text-[10px] font-black text-amber">UZCARD</span>;
  if (type === "visa") return <span className="font-display text-[11px] font-black italic text-[#1a1f71]">VISA</span>;
  return <span className="font-display text-[9px] font-black tracking-tight">MC</span>;
}

export function SavedCards({ cards, onSelect, onDelete }: { cards: SavedCard[]; onSelect: (card: SavedCard) => void; onDelete: (id: string) => void }) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState<string | null>(null);
  if (cards.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-ink/65">{t("cardSave")}</p>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 snap-x-m">
        {cards.map((c) => (
          <button
            key={c.id}
            onClick={() => { haptic("light"); onSelect(c); }}
            onMouseEnter={() => setHovered(c.id)}
            onMouseLeave={() => setHovered(null)}
            className={`snap-item press flex w-[218px] shrink-0 items-center gap-3 rounded-[20px] border bg-card p-3.5 text-left shadow-soft transition-all ${hovered === c.id ? "border-ink/30 -translate-y-0.5" : "border-ink/6"}`}
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] shadow-sm ${
              c.type === "humo" ? "bg-[#047857]/10 text-[#047857]" :
              c.type === "uzcard" ? "bg-[#10B981]/10 text-[#059669]" :
              c.type === "visa" ? "bg-[#1E3A8A]/10 text-[#1E3A8A]" :
              "bg-[#111]/5 text-ink/60"
            }`}>
              <CardIcon type={c.type} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-[13px] font-bold text-ink truncate">···· {c.last4}</span>
                {c.savedAt && Date.now() - c.savedAt < 86400000 && (
                  <span className="rounded-full bg-amber/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-amberdeep">NEW</span>
                )}
              </div>
              <p className="text-[12px] font-medium text-ink/70">{c.holder} · {c.expMonth}/{c.expYear}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); haptic("light"); onDelete(c.id); }}
              className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink/75 hover:bg-amber/5 hover:text-[#B3402E]"
              aria-label="Delete card"
            >
              <IconClose size={13} />
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}

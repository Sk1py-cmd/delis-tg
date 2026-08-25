/** DELIS — real Telegram broadcast from the authenticated admin panel. */
import { useState } from "react";
import { useI18n } from "./i18n";
import { adminSendBroadcast } from "./api";
import { haptic } from "./kit";
import { Sheet } from "./chrome";
import { IconSymbol } from "./icons";

export function AdminPushPanel({
  open,
  onClose,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const { lang } = useI18n();

  const handleSend = async (kind: "promo" | "product" | "system", title: string, body: string) => {
    haptic("medium");
    const result = await adminSendBroadcast({ kind, title, body });
    if (!result) {
      haptic("error");
      onToast(lang === "ru" ? "Рассылка не отправлена: проверьте бота и права администратора" : "Xabar yuborilmadi: bot va admin huquqlarini tekshiring");
      return false;
    }
    haptic("success");
    onToast(result.queued
      ? (lang === "ru" ? `Рассылка поставлена в очередь: ${result.attempted}` : `Xabar navbatga qo'yildi: ${result.attempted}`)
      : (lang === "ru" ? `Отправлено: ${result.sent}, ошибок: ${result.failed}` : `Yuborildi: ${result.sent}, xato: ${result.failed}`));
    return true;
  };

  return (
    <Sheet open={open} onClose={onClose} title={lang === "uz" ? "Telegram xabarnoma" : lang === "ru" ? "Telegram-рассылка" : "Telegram broadcast"}>
      <div className="space-y-4 pt-1">
        <p className="text-[13px] font-medium text-ink2">
          {lang === "uz" ? "Xabar botni ishga tushirgan barcha mijozlarga Telegram orqali yuboriladi." : lang === "ru" ? "Сообщение будет отправлено через Telegram всем клиентам, которые запускали бота." : "The bot sends this message to every customer who has started it."}
        </p>
        <AdminPushInline onSend={handleSend} />
      </div>
    </Sheet>
  );
}

function AdminPushInline({ onSend }: { onSend: (kind: "promo" | "product" | "system", title: string, body: string) => Promise<boolean> }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<"promo" | "product" | "system">("promo");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const kinds = [
    { id: "promo", label: t("pushPromo"), icon: "🎉" },
    { id: "product", label: t("pushProduct"), icon: "🆕" },
    { id: "system", label: t("pushSystem"), icon: "💡" },
  ] as const;

  const submit = async () => {
    if (!title.trim() || !body.trim() || sending) return;
    setSending(true);
    const ok = await onSend(kind, title.trim(), body.trim());
    setSending(false);
    if (ok) { setTitle(""); setBody(""); }
  };

  return (
    <div className="space-y-3 animate-pop">
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink2">{t("pushTitle")}</p>
      <div className="flex gap-1.5">
        {kinds.map((item) => (
          <button key={item.id} onClick={() => setKind(item.id)} className={`press flex-1 rounded-[16px] px-3 py-2.5 text-center text-[12px] font-bold transition-all ${kind === item.id ? "bg-amber text-white shadow-sm" : "border border-ink/18 bg-paper2 text-ink2"}`}>
            <span className="inline-flex items-center justify-center gap-1.5"><IconSymbol symbol={item.icon} size={16} /> {item.label}</span>
          </button>
        ))}
      </div>
      <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder={t("pushTitlePh")} className="w-full rounded-[16px] border border-ink/15 bg-card px-4 py-3 text-[14px] font-semibold text-ink outline-none placeholder:text-ink2/75 focus:border-moss" />
      <textarea value={body} maxLength={1000} onChange={(event) => setBody(event.target.value)} placeholder={t("pushBodyPh")} rows={4} className="w-full resize-none rounded-[16px] border border-ink/15 bg-card px-4 py-3 text-[14px] font-semibold text-ink outline-none placeholder:text-ink2/75 focus:border-moss" />
      <button onClick={() => void submit()} disabled={!title.trim() || !body.trim() || sending} className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-amber text-[14px] font-bold text-white shadow-sm disabled:opacity-40">
        <IconSymbol symbol="⚡" size={16} /> {sending ? "…" : t("pushSend")}
      </button>
    </div>
  );
}

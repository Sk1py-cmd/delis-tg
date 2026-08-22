/**
 * DELIS — persistent support chat. Customer messages are stored by the API and
 * forwarded to the configured Telegram administrator; a Telegram Reply from
 * the administrator is written back into this thread.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n";
import { CONFIG } from "./config";
import { fetchSupportMessages, postSupportMessage, type SupportMessage } from "./api";
import { haptic } from "./kit";
import { IconSend, IconSymbol, IconUser } from "./icons";
import { Sheet } from "./chrome";

const QUICK_QUESTIONS: Record<string, string[]> = {
  uz: ["🕒 Buyurtmam qachon yetib keladi?", "📦 Tovar borligini tekshirib bering", "💳 To'lov qanday qilaman?", "🚚 Yetkazish qancha turadi?"],
  ru: ["🕒 Когда приедет мой заказ?", "📦 Проверьте наличие товара", "💳 Как оплатить заказ?", "🚚 Сколько стоит доставка?"],
  en: ["🕒 When will my order arrive?", "📦 Check product availability", "💳 How do I pay?", "🚚 How much is delivery?"],
};

export function ManagerChatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useI18n();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);

  const refresh = useCallback(async () => {
    const rows = await fetchSupportMessages();
    if (rows) {
      setMessages(rows);
      setError(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8_000);
    return () => window.clearInterval(timer);
  }, [open, refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    setError(false);
    const result = await postSupportMessage(clean);
    setSending(false);
    if (!result) {
      haptic("error");
      setError(true);
      return;
    }
    haptic("success");
    setInput("");
    await refresh();
  };

  return (
    <Sheet open={open} onClose={onClose} title={L("Menejer bilan chat", "Чат с менеджером", "Chat with manager")}>
      <div className="flex h-[58vh] min-h-[380px] flex-col pt-1">
        <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
          <div className="flex items-start gap-2.5">
            <span className="motion-icon-tile flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-pine text-white"><IconUser size={17} /></span>
            <div className="max-w-[82%] rounded-[18px] rounded-tl-[6px] bg-paper2 px-3.5 py-2.5 text-[13px] font-medium leading-relaxed text-ink">
              {L("Assalomu alaykum! Xabaringiz to'g'ridan-to'g'ri DELIS menejeriga boradi.", "Здравствуйте! Сообщение отправляется напрямую менеджеру DELIS.", "Hello! Your message goes directly to a DELIS manager.")}
            </div>
          </div>

          {messages.map((message) => (
            <div key={message.id} className={`flex items-start gap-2.5 ${message.from === "user" ? "flex-row-reverse" : ""}`}>
              {message.from === "manager" && <span className="motion-icon-tile flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-pine text-white"><IconUser size={17} /></span>}
              <div className={`max-w-[82%] rounded-[18px] px-3.5 py-2.5 text-[13px] font-medium leading-relaxed ${message.from === "user" ? "rounded-tr-[6px] bg-amber text-white" : "rounded-tl-[6px] bg-paper2 text-ink"}`}>
                {message.text}
                <span className={`mt-1 block text-right text-[9px] font-semibold ${message.from === "user" ? "text-white/60" : "text-ink/60"}`}>
                  {new Date(message.time).toLocaleTimeString(lang === "en" ? "en-GB" : "ru-RU", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          ))}

          {sending && <div className="text-center text-[11px] font-semibold text-ink/60">{L("Yuborilmoqda…", "Отправляем…", "Sending…")}</div>}
          <div ref={bottomRef} />
        </div>

        <div className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
          {(QUICK_QUESTIONS[lang] || QUICK_QUESTIONS.uz).map((question) => (
            <button key={question} onClick={() => void send(question)} className="press shrink-0 rounded-full border border-ink/15 bg-card px-3 py-1.5 text-[11px] font-semibold text-ink/70">
              <span className="inline-flex items-center gap-1.5"><IconSymbol symbol={question.split(" ")[0]} size={14} /> {question.slice(question.indexOf(" ") + 1)}</span>
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-2 text-center text-[11px] font-semibold text-[#B3402E]">
            {L("Serverga ulanib bo'lmadi.", "Не удалось связаться с сервером.", "Could not reach support.")} {" "}
            <a className="underline" href={CONFIG.SUPPORT_TG_LINK}>{CONFIG.SUPPORT_TG}</a>
          </p>
        )}

        <div className="mt-2 flex gap-2">
          <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void send(input)} maxLength={1000} placeholder={L("Xabar yozing…", "Напишите сообщение…", "Type a message…")} className="flex-1 rounded-[18px] border border-ink/15 bg-card px-4 py-3 text-[13.5px] font-medium text-ink outline-none placeholder:text-ink/75 focus:border-moss" />
          <button onClick={() => void send(input)} disabled={!input.trim() || sending} className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber text-white shadow-lift disabled:opacity-35" aria-label="Send"><IconSend size={17} /></button>
        </div>

        <p className="mt-2 text-center text-[10px] font-semibold text-ink/60">
          {L("Javob shu yerda va Telegram orqali keladi", "Ответ появится здесь и придёт в Telegram", "The reply appears here and in Telegram")}
        </p>
      </div>
    </Sheet>
  );
}

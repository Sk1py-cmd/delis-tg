/**
 * DELIS — admin tab «Support»:
 *  1) «Message to manager» — send a note directly to the manager's Telegram;
 *  2) Customer inquiries — threads of the support chat, reply from the panel
 *     (the customer sees the answer in the «Chat with manager» sheet);
 *  3) Chat settings — greeting and quick questions, editable without a release.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminSaveSupportSettings,
  fetchManagerNotes,
  fetchSupportSettings,
  fetchSupportThread,
  fetchSupportThreads,
  postManagerNote,
  postSupportReply,
  type ManagerNote,
  type SupportMessage,
  type SupportSettings,
  type SupportThread,
} from "./api";
import { haptic } from "./kit";
import { IconArrowLeft, IconChat, IconSend, IconUser } from "./icons";

const LANGS = ["uz", "ru", "en"] as const;
type Lang3 = (typeof LANGS)[number];
const LANG_LABEL: Record<Lang3, string> = { uz: "UZ", ru: "RU", en: "EN" };

function fmtTime(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border border-ink/15 bg-card p-4">
      <p className="text-[13px] font-extrabold text-ink">{title}</p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-ink2">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

/* ───────────────────────── 1) Message to manager ───────────────────────── */

function ManagerNoteCard({ onToast }: { onToast: (message: string) => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [notes, setNotes] = useState<ManagerNote[] | null>(null);

  const refresh = useCallback(async () => {
    const rows = await fetchManagerNotes();
    if (rows) setNotes(rows);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const send = async () => {
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    const result = await postManagerNote(clean);
    setSending(false);
    if (!result) {
      haptic("error");
      onToast("The bot is unavailable — the note has not been sent");
      return;
    }
    haptic("success");
    setText("");
    onToast(result.delivered ? "Sent to the manager's Telegram ✓" : "The note has been saved (Telegram delivery was not performed)");
    void refresh();
  };

  return (
    <Card title="Message to manager" hint="The note will be sent to the manager's Telegram. The most recent 5 are saved below.">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          maxLength={500}
          placeholder="Example: call the customer about the order…"
          className="flex-1 rounded-[14px] border border-ink/15 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none placeholder:text-ink/50 focus:border-moss"
        />
        <button
          onClick={() => void send()}
          disabled={!text.trim() || sending}
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-moss text-white shadow-lift disabled:opacity-35"
          aria-label="Send to manager"
        >
          <IconSend size={16} />
        </button>
      </div>
      {notes && notes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {notes.slice(0, 5).map((note) => (
            <li key={note.id} className="flex items-start gap-2 rounded-[12px] bg-paper px-3 py-2 text-[11px] font-semibold text-ink">
              <span className="mt-0.5 shrink-0 text-[10px]" title={note.delivered ? "Sent to Telegram" : "Saved only"}>
                {note.delivered ? "✅" : "📝"}
              </span>
              <span className="flex-1 leading-snug">{note.text}</span>
              <span className="shrink-0 text-ink/50">{fmtTime(note.time)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ───────────────────────── 2) Support inbox ───────────────────────── */

function InboxCard({ onToast }: { onToast: (message: string) => void }) {
  const [openTgId, setOpenTgId] = useState<number | null>(null);
  const [threads, setThreads] = useState<SupportThread[] | null>(null);
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshThreads = useCallback(async () => {
    const rows = await fetchSupportThreads();
    if (rows) setThreads(rows);
  }, []);

  const refreshThread = useCallback(async (tgId: number) => {
    const rows = await fetchSupportThread(tgId);
    if (rows) setMessages(rows);
  }, []);

  useEffect(() => {
    if (openTgId === null) {
      void refreshThreads();
      return;
    }
    void refreshThread(openTgId);
    const timer = window.setInterval(() => void refreshThread(openTgId), 10_000);
    return () => window.clearInterval(timer);
  }, [openTgId, refreshThread, refreshThreads]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendReply = async () => {
    const clean = reply.trim();
    if (!clean || sending || openTgId === null) return;
    setSending(true);
    const result = await postSupportReply(openTgId, clean);
    setSending(false);
    if (!result) {
      haptic("error");
      onToast("The answer has not been sent");
      return;
    }
    haptic("success");
    setReply("");
    onToast(result.delivered ? "Answer sent: saved in the chat and to the customer's Telegram ✓" : "Answer saved in the chat (Telegram delivery was not performed)");
    void refreshThread(openTgId);
    void refreshThreads();
  };

  const openThread = threads?.find((t) => t.tgId === openTgId);

  if (openTgId !== null) {
    return (
      <Card title={`Inquiry · ${openThread?.name || `ID ${openTgId}`}`} hint={openThread?.username ? `@${openThread.username.replace(/^@/, "")} · message ${openThread.total}` : undefined}>
        <button onClick={() => setOpenTgId(null)} className="press mb-2 flex items-center gap-1.5 text-[11px] font-bold text-ink2">
          <IconArrowLeft size={13} /> Back to inquiries
        </button>
        <div className="h-[300px] space-y-2 overflow-y-auto pr-1">
          {(messages || []).map((message) => (
            <div key={message.id} className={`flex items-start gap-2 ${message.from === "manager" ? "flex-row-reverse" : ""}`}>
              {message.from === "manager" && (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-moss text-white"><IconUser size={14} /></span>
              )}
              <div className={`max-w-[85%] rounded-[14px] px-3 py-2 text-[12px] font-medium leading-relaxed ${message.from === "manager" ? "bg-moss/10 text-ink" : "bg-paper2 text-ink"}`}>
                {message.text}
                <span className={`mt-0.5 block text-right text-[9px] font-semibold ${message.from === "manager" ? "text-ink/50" : "text-ink/40"}`}>
                  {fmtTime(message.time)}
                </span>
              </div>
            </div>
          ))}
          {messages !== null && messages.length === 0 && <p className="pt-6 text-center text-[11px] font-semibold text-ink/50">The thread is empty</p>}
          <div ref={bottomRef} />
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void sendReply()}
            maxLength={1000}
            placeholder="Reply to the customer…"
            className="flex-1 rounded-[14px] border border-ink/15 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none placeholder:text-ink/50 focus:border-moss"
          />
          <button
            onClick={() => void sendReply()}
            disabled={!reply.trim() || sending}
            className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-moss text-white shadow-lift disabled:opacity-35"
            aria-label="Send reply"
          >
            <IconSend size={16} />
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Customer inquiries" hint="All messages from the «Chat with manager». Click a thread to reply.">
      {threads === null && <p className="py-4 text-center text-[11px] font-semibold text-ink/50">Loading…</p>}
      {threads !== null && threads.length === 0 && <p className="py-4 text-center text-[11px] font-semibold text-ink/50">No inquiries yet</p>}
      <ul className="space-y-1.5">
        {(threads || []).slice(0, 50).map((thread) => (
          <li key={thread.tgId}>
            <button
              onClick={() => setOpenTgId(thread.tgId)}
              className="press flex w-full items-center gap-2.5 rounded-[14px] bg-paper px-3 py-2.5 text-left"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-pine text-white"><IconUser size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12px] font-extrabold text-ink">{thread.name || `ID ${thread.tgId}`}</span>
                  <span className="shrink-0 text-[9px] font-bold text-ink/50">{fmtTime(thread.lastAt)}</span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={`truncate text-[11px] font-medium ${thread.lastSender === "customer" ? "text-ink" : "text-ink/60"}`}>
                    {thread.lastSender === "manager" ? "You: " : ""}{thread.lastText}
                  </span>
                  <span className="shrink-0 rounded-full bg-paper2 px-1.5 py-0.5 text-[9px] font-bold text-ink/60">{thread.total}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ───────────────────────── 3) Chat settings ───────────────────────── */

function ChatSettingsCard({ onToast }: { onToast: (message: string) => void }) {
  const [draft, setDraft] = useState<SupportSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchSupportSettings().then((row) => { if (row) setDraft(row); });
  }, []);

  const setGreeting = (lang: Lang3, value: string) => {
    setDraft((d) => (d ? { ...d, greeting: { ...d.greeting, [lang]: value } } : d));
  };
  const setQuestions = (lang: Lang3, value: string) => {
    const list = value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8);
    setDraft((d) => (d ? { ...d, quickQuestions: { ...d.quickQuestions, [lang]: list } } : d));
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    const result = await adminSaveSupportSettings({ greeting: draft.greeting, quickQuestions: draft.quickQuestions });
    setSaving(false);
    if (!result) {
      haptic("error");
      onToast("Settings have not been saved");
      return;
    }
    haptic("success");
    onToast("Chat settings saved ✓");
  };

  if (!draft) return <Card title="Chat settings"><p className="py-4 text-center text-[11px] font-semibold text-ink/50">Loading…</p></Card>;

  return (
    <Card title="«Chat with manager» settings" hint="Greeting and quick questions in the customer's chat. Blank fields will display the standard text. Up to 8 questions, one per line.">
      <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ink2">Greeting</p>
      <div className="space-y-2">
        {LANGS.map((lang) => (
          <div key={lang} className="flex items-center gap-2">
            <span className="w-7 shrink-0 text-[10px] font-extrabold text-ink2">{LANG_LABEL[lang]}</span>
            <input
              value={draft.greeting[lang]}
              onChange={(e) => setGreeting(lang, e.target.value)}
              maxLength={300}
              className="flex-1 rounded-[12px] border border-ink/15 bg-paper px-3 py-2 text-[12px] font-semibold text-ink outline-none focus:border-moss"
            />
          </div>
        ))}
      </div>

      <p className="mb-1.5 mt-4 text-[10px] font-extrabold uppercase tracking-wider text-ink2">Quick questions (one per line)</p>
      <div className="space-y-2">
        {LANGS.map((lang) => (
          <div key={lang} className="flex items-start gap-2">
            <span className="mt-2 w-7 shrink-0 text-[10px] font-extrabold text-ink2">{LANG_LABEL[lang]}</span>
            <textarea
              value={draft.quickQuestions[lang].join("\n")}
              onChange={(e) => setQuestions(lang, e.target.value)}
              rows={3}
              className="flex-1 resize-none rounded-[12px] border border-ink/15 bg-paper px-3 py-2 text-[12px] font-semibold text-ink outline-none focus:border-moss"
            />
          </div>
        ))}
      </div>

      <button
        onClick={() => void save()}
        disabled={saving}
        className="mt-4 w-full rounded-[16px] bg-moss py-3 text-[13px] font-bold text-white transition disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save settings"}
      </button>
    </Card>
  );
}

/* ───────────────────────── Tab ───────────────────────── */

export function SupportAdminTab({ onToast }: { onToast: (message: string) => void }) {
  return (
    <div className="space-y-3 animate-pop">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-pine text-white"><IconChat size={17} /></span>
        <div>
          <p className="text-[14px] font-extrabold text-ink">Support</p>
          <p className="text-[11px] font-semibold text-ink2">Manager's inquiries, answers, and chat settings</p>
        </div>
      </div>
      <ManagerNoteCard onToast={onToast} />
      <InboxCard onToast={onToast} />
      <ChatSettingsCard onToast={onToast} />
    </div>
  );
}

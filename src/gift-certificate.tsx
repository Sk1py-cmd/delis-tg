/**
 * DELIS — Подарочные сертификаты: выбор номинала и оформление.
 */
import { useEffect, useState } from "react";
import { useI18n } from "./i18n";
import { formatPrice, haptic } from "./kit";
import { IconCheck, IconCopy, IconMedal } from "./icons";
import { Sheet } from "./chrome";
import {
  createCertificate,
  fetchMyCertificates,
  type CertificateRow,
} from "./api";

/* DELIS gift certificates — SERVER-AUTHORITATIVE.
   Flow: customer picks an amount → request lands on the server (status
   "pending") → the admin sees it in Админка → Сертификаты and ACTIVATES it
   after receiving payment → the code becomes redeemable once at checkout.
   Everything a customer sees here comes from the server, no localStorage. */

const CERT_AMOUNTS = [100_000, 200_000, 500_000];
const MIN_AMOUNT = 50_000;
const MAX_AMOUNT = 5_000_000;

const STATUS_META: Record<CertificateRow["status"], { uz: string; ru: string; en: string; cls: string }> = {
  pending: { uz: "To'lov kutilmoqda", ru: "Ждёт активации", en: "Awaiting activation", cls: "bg-amber/15 text-amberdeep" },
  active: { uz: "Faol ✓", ru: "Активен ✓", en: "Active ✓", cls: "bg-moss/15 text-pine" },
  redeemed: { uz: "Ishlatilgan", ru: "Погашен", en: "Redeemed", cls: "bg-amber/8 text-ink/50" },
  revoked: { uz: "Bekor qilingan", ru: "Отозван", en: "Revoked", cls: "bg-[#E11D48]/10 text-[#E11D48]" },
};

/** The premium-looking certificate card — dark green, gold trim, seal. */
function CertCard({ cert, lang }: { cert: CertificateRow; lang: string }) {
  const meta = STATUS_META[cert.status];
  const date = new Date(cert.created_at).toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", {
    day: "numeric", month: "short", year: "numeric",
  });
  return (
    <div className="relative overflow-hidden rounded-[22px] p-[1.5px] shadow-lift"
      style={{ background: "linear-gradient(135deg, #d9b45b, #8a6a1f 40%, #f3e2a7 60%, #b08d2f)" }}>
      <div className="relative overflow-hidden rounded-[20.5px] bg-gradient-to-br from-[#0d2419] via-[#123526] to-[#0a1c13] p-5 text-white">
        {/* guilloche-ish rings */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border border-[#d9b45b]/15" />
        <div className="pointer-events-none absolute -right-4 -top-4 h-40 w-40 rounded-full border border-[#d9b45b]/10" />
        <div className="pointer-events-none absolute -bottom-14 -left-14 h-44 w-44 rounded-full border border-[#d9b45b]/10" />

        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9.5px] font-extrabold uppercase tracking-[0.3em] text-[#e6c878]">
              DELIS · Gift Certificate
            </p>
            <p className="mt-2 font-display text-[26px] font-bold tracking-tight text-white">
              {formatPrice(cert.amount, lang as never)}
            </p>
          </div>
          {/* wax seal */}
          <div className="motion-icon-tile flex h-12 w-12 items-center justify-center rounded-[15px] border-2 border-[#e6c878]/50 bg-[#e6c878]/10 text-[#e6c878]">
            <IconMedal size={25} />
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="font-mono text-[15px] font-bold tracking-[0.18em] text-[#f3e2a7]">{cert.code}</p>
            <p className="mt-1 text-[10px] font-semibold text-white/50">
              {date}{cert.to_name ? ` · ${cert.to_name}` : ""}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.cls}`}>
            {meta[lang as "uz" | "ru" | "en"] ?? meta.uz}
          </span>
        </div>
      </div>
    </div>
  );
}

export function GiftCertificateSheet({
  open,
  onClose,
  user,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  user: { first_name?: string } | null;
  onToast: (msg: string) => void;
}) {
  const { lang } = useI18n();
  const [amount, setAmount] = useState<number>(CERT_AMOUNTS[1]);
  const [custom, setCustom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [certs, setCerts] = useState<CertificateRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);

  // Live list from the server every time the sheet opens
  useEffect(() => {
    if (!open) return;
    setJustCreated(null);
    void fetchMyCertificates().then(setCerts);
  }, [open]);

  const effectiveAmount = custom
    ? Math.min(MAX_AMOUNT, Math.max(0, parseInt(custom.replace(/\D/g, ""), 10) || 0))
    : amount;
  const amountValid = effectiveAmount >= MIN_AMOUNT && effectiveAmount <= MAX_AMOUNT;

  const create = async () => {
    if (busy || !amountValid) return;
    haptic("medium");
    setBusy(true);
    const res = await createCertificate({
      amount: effectiveAmount,
      to: to.trim() || undefined,
      from: user?.first_name || undefined,
      message: message.trim() || undefined,
    });
    setBusy(false);
    if (res.ok && res.code) {
      haptic("success");
      setJustCreated(res.code);
      onToast(L("Sertifikat yaratildi!", "Сертификат создан!", "Certificate created!"));
      void fetchMyCertificates().then(setCerts);
      setTo(""); setMessage(""); setCustom("");
    } else {
      haptic("error");
      onToast(L("Xatolik — qayta urinib ko'ring", "Ошибка — попробуйте снова", "Error — please try again"));
    }
  };

  const copyCode = (code: string) => {
    haptic("light");
    void navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Sheet open={open} onClose={onClose} title={L("Sovg'a sertifikati", "Подарочный сертификат", "Gift certificate")}>
      <div className="space-y-4 pt-1">
        <p className="text-[12.5px] font-medium text-ink/70">
          {L(
            "Mablag' tanlang — kod yaratiladi. Menejer to'lovdan so'ng uni faollashtiradi va kodni chekoutda ishlatish mumkin bo'ladi.",
            "Выберите сумму — код создаётся сразу. Менеджер активирует его после оплаты, и им можно оплатить заказ в корзине.",
            "Pick an amount — the code is issued instantly. A manager activates it after payment, then it pays for an order at checkout.",
          )}
        </p>

        {/* Amount chips */}
        <div className="flex gap-2">
          {CERT_AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={() => { haptic("light"); setAmount(a); setCustom(""); }}
              className={`press flex-1 rounded-[16px] border px-2 py-3 text-[13px] font-extrabold ${
                !custom && amount === a ? "border-amberdeep bg-amber text-white shadow-sm" : "border-ink/15 bg-card text-ink/70"
              }`}
            >
              {a / 1000}k
            </button>
          ))}
        </div>
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          inputMode="numeric"
          placeholder={L("Yoki o'z summangiz (min 50 000)", "Или своя сумма (мин 50 000)", "Or custom amount (min 50,000)")}
          className="w-full rounded-[16px] border border-ink/15 bg-card px-4 py-3 text-[13px] font-semibold text-ink outline-none focus:border-amberdeep"
        />
        {custom && !amountValid && (
          <p className="text-[11.5px] font-semibold text-[#B3402E]">
            {L("Summa 50 000 dan 5 000 000 gacha", "Сумма от 50 000 до 5 000 000 сум", "Amount must be 50,000–5,000,000 UZS")}
          </p>
        )}

        {/* Recipient + message */}
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={L("Kimga? (ismi)", "Кому? (имя)", "For whom? (name)")}
          className="w-full rounded-[16px] border border-ink/15 bg-card px-4 py-3 text-[13px] font-semibold text-ink outline-none focus:border-amberdeep"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder={L("Tabrik so'zi (ixtiyoriy)", "Пожелание (необязательно)", "A message (optional)")}
          className="w-full resize-none rounded-[16px] border border-ink/15 bg-card px-4 py-3 text-[13px] font-semibold text-ink outline-none focus:border-amberdeep"
        />

        <button
          onClick={create}
          disabled={busy || !amountValid}
          className="btn-shine press h-12 w-full rounded-[18px] bg-gradient-to-r from-[#b08d2f] via-amber to-[#d9b45b] text-[14px] font-extrabold text-pinedeep shadow-soft disabled:opacity-40"
        >
          {busy
            ? "…"
            : L(
                `Sertifikat olish — ${formatPrice(effectiveAmount, lang as never)}`,
                `Оформить за ${formatPrice(effectiveAmount, lang as never)}`,
                `Get certificate — ${formatPrice(effectiveAmount, lang as never)}`,
              )}
        </button>

        {justCreated && (
          <div className="animate-pop flex items-center justify-between rounded-[16px] border border-moss/25 bg-sagetint/70 px-4 py-3">
            <div>
              <p className="text-[11px] font-bold text-pine">{L("Kodingiz:", "Ваш код:", "Your code:")}</p>
              <p className="font-mono text-[15px] font-bold tracking-widest text-ink">{justCreated}</p>
            </div>
            <button onClick={() => copyCode(justCreated)} className="press rounded-full bg-paper p-2.5 text-pine shadow-sm">
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </button>
          </div>
        )}

        {/* My certificates (server) */}
        {certs.length > 0 && (
          <div className="space-y-3 pt-2">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-ink/50">
              {L("Mening sertifikatlarim", "Мои сертификаты", "My certificates")}
            </p>
            {certs.map((c) => (
              <button key={c.code} onClick={() => copyCode(c.code)} className="block w-full text-left">
                <CertCard cert={c} lang={lang} />
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

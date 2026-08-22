/**
 * DELIS — админ-вкладка «Платежи».
 *
 * Задача одна: владелец вставляет ключи Payme/Click и всё начинает работать.
 * Никакого редеплоя, правки кода или доступа к Render не нужно — значения
 * уходят на сервер и применяются сразу. Если ключи уже заданы через
 * переменные окружения, они показаны как источник «ENV», а введённое здесь
 * значение имеет приоритет. Пустое поле = убрать своё значение и вернуться к ENV.
 *
 * Секреты (Payme Key, Click Secret) сервер никогда не отдаёт обратно —
 * показывается только маска «••••1234».
 */

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "./i18n";
import { haptic } from "./kit";
import {
  fetchAdminPayments,
  adminSavePayments,
  adminPaymentsSelfCheck,
  type AdminPaymentsState,
  type AdminPaymentsCheck,
  type PaymentFieldId,
} from "./api";
import { IconCheck, IconClose, IconCopy, IconCreditCard, IconRefresh, IconSparkle } from "./icons";

type Draft = Partial<Record<PaymentFieldId, string>>;

const FIELD_LABELS: Record<PaymentFieldId, { title: string; hint: string; placeholder: string }> = {
  paymeMerchantId: {
    title: "Payme · Merchant ID",
    hint: "Кабинет merchant.payme.uz → настройки кассы.",
    placeholder: "5e730e8e0b852a417aa49ceb",
  },
  paymeKey: {
    title: "Payme · Key",
    hint: "Тот же кабинет, поле «Ключ». Хранится только на сервере.",
    placeholder: "вставьте ключ",
  },
  clickServiceId: {
    title: "Click · Service ID",
    hint: "Только цифры — из кабинета Click.",
    placeholder: "12345",
  },
  clickMerchantId: {
    title: "Click · Merchant ID",
    hint: "Из кабинета Click.",
    placeholder: "67890",
  },
  clickSecret: {
    title: "Click · Secret",
    hint: "Секретный ключ кассы. Хранится только на сервере.",
    placeholder: "вставьте секрет",
  },
};

const SOURCE_BADGE: Record<"admin" | "env" | "none", { label: string; cls: string }> = {
  admin: { label: "из админки", cls: "bg-moss/12 text-moss ring-moss/25" },
  env: { label: "из ENV", cls: "bg-amber/12 text-amberdeep ring-amber/25" },
  none: { label: "не задано", cls: "bg-ink/8 text-ink2 ring-ink/12" },
};

function StatusChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold ring-1 ${
        on ? "bg-moss/12 text-moss ring-moss/25" : "bg-ink/6 text-ink2 ring-ink/12"
      }`}
    >
      {on ? <IconCheck size={11} /> : <IconClose size={11} />} {label}
    </span>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  const copy = async () => {
    haptic("light");
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* старый WebView без Clipboard API — адрес всё равно виден целиком */
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return (
    <div className="rounded-[14px] border border-ink/12 bg-paper px-3 py-2.5">
      <p className="text-[9.5px] font-extrabold uppercase tracking-wider text-ink2">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all text-[11px] font-semibold text-ink">{value}</code>
        <button
          onClick={copy}
          className="press flex shrink-0 items-center gap-1 rounded-full bg-ink/6 px-2.5 py-1 text-[10.5px] font-bold text-ink2"
        >
          {done ? <IconCheck size={11} /> : <IconCopy size={11} />} {done ? "Скопировано" : "Копировать"}
        </button>
      </div>
    </div>
  );
}

export function PaymentsAdminTab({ onToast }: { onToast: (message: string) => void }) {
  const { lang } = useI18n();
  const ru = lang !== "uz";
  const [state, setState] = useState<AdminPaymentsState | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState<AdminPaymentsCheck[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchAdminPayments();
    setState(data);
    setDraft({});
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fieldOf = (id: PaymentFieldId) => state?.fields.find((f) => f.id === id);

  const save = async () => {
    const patch: Draft = {};
    for (const [key, value] of Object.entries(draft)) {
      if (value === undefined) continue;
      patch[key as PaymentFieldId] = value.trim();
    }
    if (!Object.keys(patch).length) return;
    if (patch.clickServiceId && !/^\d+$/.test(patch.clickServiceId)) {
      haptic("error");
      onToast(ru ? "Click Service ID должен содержать только цифры" : "Click Service ID faqat raqamlardan iborat bo'lishi kerak");
      return;
    }
    setSaving(true);
    haptic("medium");
    const res = await adminSavePayments(patch);
    setSaving(false);
    if (!res) {
      onToast(ru ? "Не удалось сохранить — нет связи с API" : "Saqlanmadi — API bilan aloqa yo'q");
      return;
    }
    setState(res);
    setDraft({});
    setChecks(null);
    haptic("success");
    const active = [res.availability.payme && "Payme", res.availability.click && "Click", res.availability.stars && "Telegram Stars"].filter(Boolean).join(", ");
    onToast(active
      ? (ru ? `Сохранено. Уже доступно в checkout: ${active} ✓` : `Saqlandi. Checkoutda mavjud: ${active} ✓`)
      : (ru ? "Сохранено, но для появления метода заполните все поля провайдера" : "Saqlandi, lekin usul chiqishi uchun barcha maydonlarni to'ldiring"));
  };

  const clearField = async (id: PaymentFieldId) => {
    haptic("light");
    setSaving(true);
    const res = await adminSavePayments({ [id]: "" });
    setSaving(false);
    if (res) {
      setState(res);
      setDraft((d) => ({ ...d, [id]: undefined }));
      onToast(ru ? "Значение убрано (вернулись к ENV)" : "Qiymat olib tashlandi (ENV)");
    }
  };

  const runSelfCheck = async () => {
    setChecking(true);
    haptic("medium");
    const res = await adminPaymentsSelfCheck();
    setChecking(false);
    if (!res) {
      onToast(ru ? "Проверка не прошла — нет связи с API" : "Tekshiruv o'tmadi — API yo'q");
      return;
    }
    setChecks(res.checks);
    onToast(res.ok ? (ru ? "Проверка пройдена ✓" : "Tekshiruv o'tdi ✓") : ru ? "Есть замечания — смотрите список" : "Izohlar bor");
  };

  const dirty = Object.values(draft).some((v) => v !== undefined);

  if (loading) {
    return <p className="py-8 text-center text-[12px] font-semibold text-ink2">{ru ? "Загрузка…" : "Yuklanmoqda…"}</p>;
  }

  if (!state) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-[12.5px] font-semibold text-ink2">
          {ru ? "API недоступен — платежи настраиваются на сервере." : "API mavjud emas."}
        </p>
        <button onClick={() => void load()} className="press rounded-[14px] bg-moss px-4 py-2.5 text-[12px] font-bold text-white">
          {ru ? "Повторить" : "Qayta urinish"}
        </button>
      </div>
    );
  }

  return (
    <div className="animate-pop space-y-3">
      <div className="rounded-[20px] border border-ink/18 bg-card p-4">
        <div className="flex items-center gap-2">
          <span className="text-moss"><IconCreditCard size={17} /></span>
          <p className="font-display text-[14px] font-bold text-ink">{ru ? "Что уже работает" : "Nima ishlayapti"}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <StatusChip label="Payme" on={state.availability.payme} />
          <StatusChip label="Click" on={state.availability.click} />
          <StatusChip label="Telegram Stars" on={state.availability.stars} />
          <StatusChip label={ru ? "Наличные" : "Naqd"} on={state.availability.cash} />
        </div>
        <p className="mt-3 text-[11px] leading-snug text-ink2">
          {ru
            ? "Вставьте ключи ниже и нажмите «Сохранить» — способ оплаты появится в оформлении заказа сразу, без обновления приложения. Пустое поле = вернуться к значению из переменных окружения."
            : "Kalitlarni kiriting va «Saqlash» bosing — to'lov usuli darhol paydo bo'ladi."}
        </p>
      </div>

      <div className="space-y-4 rounded-[20px] border border-ink/18 bg-card p-4">
        {(Object.keys(FIELD_LABELS) as PaymentFieldId[]).map((id) => {
          const f = fieldOf(id);
          const meta = FIELD_LABELS[id];
          const badge = SOURCE_BADGE[f?.source ?? "none"];
          const typed = draft[id];
          return (
            <div key={id}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink2">{meta.title}</p>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ring-1 ${badge.cls}`}>{badge.label}</span>
              </div>
              <input
                type={f?.secret ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                value={typed ?? (f?.secret ? "" : f?.value ?? "")}
                placeholder={f?.secret && f.configured ? `сохранён: ${f.value}` : meta.placeholder}
                onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
                className="w-full rounded-[14px] border border-ink/15 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
              />
              <div className="mt-1 flex items-start justify-between gap-2">
                <p className="text-[10px] leading-snug text-ink2/90">{meta.hint}</p>
                {f?.source === "admin" && (
                  <button
                    onClick={() => void clearField(id)}
                    disabled={saving}
                    className="shrink-0 text-[10px] font-bold text-ink2 underline disabled:opacity-40"
                  >
                    {ru ? "убрать" : "olib tashlash"}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div className="flex gap-2">
          <button
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="flex-1 rounded-[16px] bg-moss py-3 text-[12.5px] font-bold text-white transition disabled:opacity-40"
          >
            {saving ? (ru ? "Сохранение…" : "Saqlanmoqda…") : ru ? "Сохранить ключи" : "Kalitlarni saqlash"}
          </button>
          {dirty && (
            <button
              onClick={() => { haptic("light"); setDraft({}); }}
              className="rounded-[16px] border border-ink/18 bg-card px-4 text-[12.5px] font-bold text-ink2"
            >
              {ru ? "Сброс" : "Bekor"}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2.5 rounded-[20px] border border-ink/18 bg-card p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink2">
          {ru ? "Вставьте эти адреса в кабинетах" : "Kabinetlarga shu manzillarni kiriting"}
        </p>
        <CopyRow label="Payme · Merchant API URL" value={state.webhooks.payme} />
        <CopyRow label="Click · PREPARE и COMPLETE" value={state.webhooks.click} />
        {!state.baseUrl && (
          <p className="text-[10.5px] font-semibold text-amberdeep">
            {ru ? "Адрес API не определился — задайте PUBLIC_API_URL на сервере." : "PUBLIC_API_URL ni belgilang."}
          </p>
        )}
      </div>

      <div className="space-y-2.5 rounded-[20px] border border-ink/18 bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink2">{ru ? "Самопроверка" : "O'z-o'zini tekshirish"}</p>
          <button
            onClick={() => void runSelfCheck()}
            disabled={checking}
            className="press flex items-center gap-1.5 rounded-full bg-ink/6 px-3 py-1.5 text-[11px] font-bold text-ink2 disabled:opacity-40"
          >
            {checking ? <IconRefresh size={12} /> : <IconSparkle size={12} />}
            {checking ? (ru ? "Проверяю…" : "Tekshirilmoqda…") : ru ? "Проверить всё" : "Tekshirish"}
          </button>
        </div>
        {checks?.length ? (
          <div className="space-y-1.5">
            {checks.map((c) => (
              <div
                key={c.id}
                className={`rounded-[14px] px-3 py-2 ring-1 ${
                  c.level === "ok"
                    ? "bg-moss/8 ring-moss/20"
                    : c.level === "warn"
                      ? "bg-amber/8 ring-amber/25"
                      : "bg-[#E11D48]/8 ring-[#E11D48]/25"
                }`}
              >
                <p className="text-[11.5px] font-bold text-ink">
                  {c.level === "ok" ? "✓" : c.level === "warn" ? "!" : "×"} {c.title}
                </p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-ink2">{c.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10.5px] leading-snug text-ink2">
            {ru
              ? "Кнопка проверит ключи, адреса webhook, токен бота и получателя уведомлений. Секреты в отчёт не попадают."
              : "Tugma kalitlar, webhook manzillari va bot tokenini tekshiradi."}
          </p>
        )}
      </div>
    </div>
  );
}

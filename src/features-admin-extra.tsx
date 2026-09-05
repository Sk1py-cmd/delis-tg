/* ============================================================
   DELIS Admin — EXTRA tabs (real server data, no localStorage):

   1. QrBatchesAdminTab  — инструкция-шпаргалка, поиск по коду/товару,
      копирование кода, предпросмотр QR для печати (api.qrserver.com),
      авто-инкремент № партии после добавления.

   2. B2bAdminTab        — дедуп minQty на клиенте, живой пример цены
      флагмана на каждой ступени, свой код партнёра, копирование, дата.

   3. CertsAdminTab      — как есть + кнопка копирования кода.
   ============================================================ */

import { useEffect, useState, useMemo } from "react";
import { useI18n } from "./i18n";
import { formatPrice, haptic } from "./kit";
import { IconChart, IconCheck, IconClipboard, IconClock, IconKey, IconTrash } from "./icons";
import {
  fetchAdminQrBatches,
  adminCreateQrBatch,
  adminUpdateQrBatch,
  adminDeleteQrBatch,
  fetchProducts,
  fetchWholesaleTiers,
  adminPutWholesaleTiers,
  fetchAdminB2bCodes,
  adminCreateB2bCode,
  adminUpdateB2bCode,
  adminDeleteB2bCode,
  fetchAdminCertificates,
  adminIssueCertificate,
  adminCertificateAction,
  type QrBatchRow,
  type WholesaleTier,
  type B2bCodeRow,
  type CertificateRow,
} from "./api";
import { PRODUCTS, type Product } from "./data";

type ToastFn = (msg: string) => void;

const card = "rounded-[20px] border border-ink/18 bg-card p-4 shadow-sm";
const inputCls =
  "w-full rounded-[14px] border border-ink/15 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss";
const btnDark = "press rounded-[14px] bg-amber px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-40";
const btnGhost = "press rounded-full border border-ink/15 px-3 py-1.5 text-[11px] font-bold text-ink/70";
const btnDanger = "press rounded-full border border-[#E11D48]/25 px-3 py-1.5 text-[11px] font-bold text-[#E11D48]";

function copyToClipboard(text: string, onToast: ToastFn, okMsg: string) {
  try {
    void navigator.clipboard.writeText(text).then(() => onToast(okMsg)).catch(() => onToast(text));
  } catch {
    onToast(text);
  }
  haptic("light");
}

/* ─────────────── 1 · QR BATCHES ─────────────── */

export function QrBatchesAdminTab({ onToast }: { onToast: ToastFn }) {
  const { lang } = useI18n();
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  const [rows, setRows] = useState<QrBatchRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [code, setCode] = useState("");
  const [productId, setProductId] = useState("");
  const [producedAt, setProducedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [batchNo, setBatchNo] = useState(1);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const refresh = () => void fetchAdminQrBatches().then((r) => {
    if (r === null) setLoadFailed(true);
    else { setLoadFailed(false); setRows(r); }
  });
  useEffect(() => {
    refresh();
    void fetchProducts(lang).then((list) => {
      /* If the server is unreachable (cold start / no session) the select
         would stay empty and the form silently unusable — fall back to the
         bundled catalogue; ids match the seeded DB. */
      const items = list && list.length ? list : PRODUCTS;
      setProducts(items);
      if (items[0]) setProductId((prev) => prev || items[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    if (busy || !productId) return;
    haptic("medium");
    setBusy(true);
    const res = await adminCreateQrBatch({ code: code.trim() || undefined, productId, producedAt, batchNo });
    setBusy(false);
    if (res.ok) {
      haptic("success");
      onToast(L("Kod qo'shildi", "Код добавлен", "Code added") + `: ${res.code}`);
      setCode("");
      setBatchNo((n) => n + 1);
      refresh();
    } else {
      haptic("error");
      /* Surface the REAL reason instead of a bare "Xatolik". */
      const msg =
        res.error === "duplicate_code"
          ? L("Bunday kod bor", "Такой код уже есть", "Code exists")
          : res.status === 403
            ? L(
                "Server rad etdi: bu Telegram akkaunt admin emas (ADMIN_CHAT_ID ni tekshiring)",
                "Сервер отклонил: этот Telegram-аккаунт не админ (проверьте ADMIN_CHAT_ID)",
                "Server rejected: this Telegram account is not the admin (check ADMIN_CHAT_ID)",
              )
            : res.error === "network"
              ? L(
                  "Server javob bermayapti — ulanishni tekshiring (Render uyg'onishi ~soniya oladi)",
                  "Сервер не отвечает — проверьте соединение (Render просыпается ~минуту)",
                  "Server unreachable — check the connection (Render cold start takes ~1 min)",
                )
              : (res.details ? L("Ma'lumot xato — sanani tekshiring", "Неверные данные — проверьте дату", "Invalid data — check the date") : L("Xatolik", "Ошибка", "Error"));
      onToast(msg);
      refresh(); // list may be loaded even if creation failed
    }
  };

  const patchDate = async (row: QrBatchRow, newDate: string, newBatch: number) => {
    const res = await adminUpdateQrBatch(row.code, { producedAt: newDate, batchNo: newBatch });
    if (res.ok) {
      onToast(L("Saqlandi", "Сохранено", "Saved"));
      refresh();
    } else onToast(L("Xatolik", "Ошибка", "Error"));
  };

  const remove = async (row: QrBatchRow) => {
    haptic("medium");
    const res = await adminDeleteQrBatch(row.code);
    if (res.ok) {
      onToast(L("O'chirildi", "Удалено", "Deleted"));
      refresh();
    }
  };

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = ((lang === "ru" ? r.name_ru : lang === "en" ? r.name_en : r.name_uz) || r.name_uz || r.product_id || "").toLowerCase();
      return r.code.toLowerCase().includes(q) || name.toLowerCase().includes(q) || r.product_id.toLowerCase().includes(q);
    });
  }, [rows, search, lang]);

  return (
    <div className="animate-pop space-y-3">
      {/* Шпаргалка */}
      <div className="rounded-[16px] border border-amber/20 bg-amber/[0.06] p-3">
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-amberdeep"><IconClipboard size={15} /> {L("Shpargalka", "Шпаргалка", "Cheat sheet")}</p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] font-medium leading-[1.4] text-ink2">
          <li>{L("Har bir flakonga alohida kod bosiladi — kodni shu yerda ro'yxatga oling.", "На каждый флакон — отдельный код. Зарегистрируйте его здесь.", "Each bottle gets its own code — register it here.")}</li>
          <li>{L("Kod bo'sh qolsa — avto DL-XXXXXX yaratiladi.", "Если поле кода пустое — создастся авто DL-XXXXXX.", "Leave code empty for auto DL-XXXXXX.")}</li>
          <li>{L("Mijoz QR ni skanerlaganda server shu jadval bilan solishtiradi.", "Сканер клиента сверяет QR именно с этой таблицей.", "Customer scanner checks QR against this exact table.")}</li>
          <li>{L("Partiya № avtomatik +1 ga oshadi — tez kiritish uchun.", "№ партии авто +1 после добавления — для быстрого ввода.", "Batch № auto +1 after add for quick entry.")}</li>
        </ul>
      </div>

      {/* Add form */}
      <div className={card + " space-y-2.5"}>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink/60">
          ➕ {L("Yangi kod", "Новый код", "New code")}
        </p>
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className={inputCls}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] font-bold text-ink/60">{L("Ishlab chiqarilgan sana", "Дата производства", "Production date")}</label>
            <input type="date" value={producedAt} onChange={(e) => setProducedAt(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-ink/60">{L("Partiya №", "№ партии", "Batch №")}</label>
            <input type="number" min={1} value={batchNo} onChange={(e) => setBatchNo(Math.max(1, parseInt(e.target.value || "1", 10)))} className={inputCls} />
          </div>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={L("Kod (bo'sh = avtomatik DL-XXXXXX)", "Код (пусто = авто DL-XXXXXX)", "Code (empty = auto DL-XXXXXX)")}
          className={inputCls + " uppercase"}
        />
        <button onClick={() => void add()} disabled={busy || !productId} className={btnDark + " w-full"}>
          {busy ? "…" : L("Ro'yxatga olish", "Зарегистрировать", "Register")}
        </button>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={L("Qidirish: kod yoki mahsulot…", "Поиск: код или товар…", "Search: code or product…")}
        className={inputCls}
      />

      {/* List */}
      {filtered === null ? (
        loadFailed ? (
          <div className="rounded-[16px] border border-amber/30 bg-amber/10 px-3.5 py-2.5 text-[12px] font-semibold text-amberdeep">
            {L(
              "Server javob bermadi yoki bu akkaunt admin emas — kodlar yuklanmagan.",
              "Сервер не ответил или этот аккаунт не админ — список не загружен.",
              "Server unreachable or this account is not the admin — list not loaded.",
            )}
          </div>
        ) : (
          <p className="py-6 text-center text-[12px] text-ink2">…</p>
        )
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-[12px] italic text-ink2">
          {search ? L("Hech narsa topilmadi", "Ничего не найдено", "Nothing found") : L("Hali kodlar yo'q", "Кодов пока нет", "No codes yet")}
        </p>
      ) : (
        filtered.map((r) => (
          <QrBatchCard key={r.code} row={r} lang={lang} onPatch={patchDate} onDelete={remove} onToast={onToast} />
        ))
      )}
    </div>
  );
}

function QrBatchCard({
  row, lang, onPatch, onDelete, onToast,
}: {
  row: QrBatchRow;
  lang: string;
  onPatch: (row: QrBatchRow, date: string, batch: number) => Promise<void>;
  onDelete: (row: QrBatchRow) => Promise<void>;
  onToast: ToastFn;
}) {
  const [date, setDate] = useState(row.produced_at);
  const [batch, setBatch] = useState(row.batch_no);
  const dirty = date !== row.produced_at || batch !== row.batch_no;
  const name = (lang === "ru" ? row.name_ru : lang === "en" ? row.name_en : row.name_uz) || row.name_uz || row.product_id;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(row.code)}`;
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[13px] font-bold text-ink">{name}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <p className="font-mono text-[11px] font-bold text-moss">{row.code}</p>
            <button
              onClick={() => copyToClipboard(row.code, onToast, lang === "ru" ? "Код скопирован ✓" : lang === "en" ? "Code copied ✓" : "Kod nusxalandi ✓")}
              className="press rounded-full bg-moss/10 px-2 py-0.5 text-[10px] font-bold text-moss"
            >
              {lang === "ru" ? "Копировать" : lang === "en" ? "Copy" : "Nusxa"}
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <img src={qrUrl} alt={row.code} className="h-[56px] w-[56px] rounded-[10px] border border-ink/10 bg-white p-1" loading="lazy" />
          <button onClick={() => void onDelete(row)} className={btnDanger}><IconTrash size={13} /></button>
        </div>
      </div>
      <div className="mt-2.5 flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-[10px] font-bold text-ink/55">{lang === "ru" ? "Дата пр-ва" : "Sana"}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + " !py-1.5 text-[11px]"} />
        </div>
        <div className="w-[72px]">
          <label className="mb-1 block text-[10px] font-bold text-ink/55">{lang === "ru" ? "Партия" : "Partiya"}</label>
          <input type="number" min={1} value={batch} onChange={(e) => setBatch(Math.max(1, parseInt(e.target.value || "1", 10)))} className={inputCls + " !py-1.5 text-[11px]"} />
        </div>
        <button
          onClick={() => void onPatch(row, date, batch)}
          disabled={!dirty}
          className="press rounded-[12px] bg-moss px-3 py-2 text-[11px] font-bold text-white disabled:opacity-30"
        >
          <IconCheck size={13} />
        </button>
      </div>
      <p className="mt-1.5 text-[10px] font-medium text-ink/50">{lang === "ru" ? "QR для печати —" : lang === "en" ? "QR for print —" : "Chop etish uchun QR —"} api.qrserver.com</p>
    </div>
  );
}

/* ─────────────── 2 · B2B (wholesale ladder + access codes) ─────────────── */

const FLAGSHIP_PRICE = 128000; // wax — флагман для живого примера

export function B2bAdminTab({ onToast }: { onToast: ToastFn }) {
  const { lang } = useI18n();
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  const [tiers, setTiers] = useState<WholesaleTier[] | null>(null);
  const [codes, setCodes] = useState<B2bCodeRow[] | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newPercent, setNewPercent] = useState("0");
  const [customCode, setCustomCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const refresh = () => {
    void fetchWholesaleTiers().then((rows) => setTiers(rows));
    void fetchAdminB2bCodes().then(setCodes);
  };
  useEffect(refresh, []);

  const saveTiers = async () => {
    if (!tiers || busy) return;
    // дедуп на клиенте — последняя выигрывает
    const byQty = new Map<number, WholesaleTier>();
    for (const t of tiers) {
      if (t.minQty >= 2 && t.percent >= 1 && t.percent <= 70) byQty.set(t.minQty, t);
    }
    const deduped = [...byQty.values()].sort((a, b) => a.minQty - b.minQty);
    if (deduped.length === 0) return;
    haptic("medium");
    setBusy(true);
    const res = await adminPutWholesaleTiers(deduped);
    setBusy(false);
    if (res.ok) {
      setTiers(deduped);
      haptic("success");
      onToast(L("Opt narxlari saqlandi", "Оптовые тарифы сохранены", "Wholesale tiers saved"));
    } else {
      haptic("error");
      onToast(L("Xatolik", "Ошибка", "Error"));
    }
  };

  const addCode = async () => {
    haptic("medium");
    const codeTrim = customCode.trim().toUpperCase();
    const payloadCode = codeTrim || undefined;
    const pct = Math.max(0, Math.min(70, parseInt(newPercent || "0", 10) || 0));
    const res = await adminCreateB2bCode(payloadCode, newLabel.trim() || undefined, pct);
    if (res.ok && res.code) {
      haptic("success");
      onToast(`${L("Kod yaratildi", "Код создан", "Code created")}: ${res.code}`);
      setNewLabel("");
      setNewPercent("0");
      setCustomCode("");
      refresh();
    } else {
      onToast(res.error === "duplicate_code" ? L("Bunday kod bor", "Такой код уже есть", "Code exists") : L("Xatolik", "Ошибка", "Error"));
    }
  };

  const saveCodePercent = async (code: string, value: string) => {
    const pct = Math.max(0, Math.min(70, parseInt(value || "0", 10) || 0));
    setSavingCode(code);
    const res = await adminUpdateB2bCode(code, { percent: pct });
    setSavingCode(null);
    if (res.ok) {
      haptic("success");
      setCodes((prev) => (prev ? prev.map((c) => (c.code === code ? { ...c, percent: pct } : c)) : prev));
      onToast(L("Skidka saqlandi", "Скидка сохранена", "Discount saved"));
    } else {
      haptic("error");
      onToast(L("Xatolik", "Ошибка", "Error"));
    }
  };

  return (
    <div className="animate-pop space-y-4">
      {/* Wholesale ladder */}
      <div className={card + " space-y-2.5"}>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink/60">
          <span className="inline-flex items-center gap-1.5"><IconChart size={14} /> {L("Opt chegirmalar (sondan → %)", "Оптовые скидки (от N шт → %)", "Wholesale discounts (from N pcs → %)")}</span>
        </p>
        <p className="text-[11px] font-medium text-ink2">
          {L(
            "Server narx hisoblashda shu jadvalni ishlatadi — o'zgarish darhol kuchga kiradi. Takroriy minQty — oxirgisi qoladi.",
            "Сервер считает опт по этой таблице — изменения действуют сразу. Дубли minQty — побеждает последний.",
            "Server prices from this table — changes apply instantly. Duplicate minQty — last wins.",
          )}
        </p>
        {tiers === null ? (
          <p className="py-3 text-center text-[12px] text-ink2">…</p>
        ) : (
          <>
            {tiers.map((t, i) => {
              const unit = Math.round((FLAGSHIP_PRICE * (100 - t.percent)) / 100 / 10) * 10;
              return (
                <div key={i} className="flex flex-col gap-1 rounded-[14px] border border-ink/8 bg-paper2/40 p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-ink/60">{L("dan", "от", "from")}</span>
                    <input
                      type="number" min={2} value={t.minQty}
                      onChange={(e) => setTiers((prev) => prev!.map((x, j) => (j === i ? { ...x, minQty: parseInt(e.target.value || "2", 10) } : x)))}
                      className={inputCls + " !w-[76px] !py-1.5 text-center"}
                    />
                    <span className="text-[11px] font-bold text-ink/60">{L("dona →", "шт →", "pcs →")}</span>
                    <input
                      type="number" min={1} max={70} value={t.percent}
                      onChange={(e) => setTiers((prev) => prev!.map((x, j) => (j === i ? { ...x, percent: parseInt(e.target.value || "1", 10) } : x)))}
                      className={inputCls + " !w-[68px] !py-1.5 text-center"}
                    />
                    <span className="text-[11px] font-bold text-ink/60">%</span>
                    <button onClick={() => setTiers((prev) => prev!.filter((_, j) => j !== i))} className={btnDanger}><IconTrash size={13} /></button>
                  </div>
                  <p className="text-[11px] font-semibold text-moss">
                    {L("Misol: flagman", "Пример: флагман", "E.g. flagship")} {formatPrice(FLAGSHIP_PRICE, lang as never)} → <b>{formatPrice(unit, lang as never)}</b> {L("dona", "шт", "pcs")} (−{t.percent}%)
                  </p>
                </div>
              );
            })}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setTiers((prev) => [...(prev ?? []), { minQty: (prev?.[prev.length - 1]?.minQty ?? 2) * 2, percent: 10 }])}
                className={btnGhost}
              >
                + {L("Qadam", "Ступень", "Tier")}
              </button>
              <button onClick={() => void saveTiers()} disabled={busy || !tiers?.length} className={btnDark + " flex-1"}>
                {busy ? "…" : L("Saqlash", "Сохранить", "Save")}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Access codes */}
      <div className={card + " space-y-2.5"}>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink/60">
          <span className="inline-flex items-center gap-1.5"><IconKey size={14} /> {L("B2B kirish kodlari", "Коды доступа в B2B", "B2B access codes")}</span>
        </p>
        {codes === null ? (
          <p className="py-3 text-center text-[12px] text-ink2">…</p>
        ) : codes.length === 0 ? (
          <p className="py-3 text-center text-[12px] italic text-ink2">{L("Kodlar yo'q — birinchisini yarating", "Кодов нет — создайте первый", "No codes — create the first")}</p>
        ) : (
          codes.map((c) => (
            <div key={c.code} className="flex items-center justify-between gap-2 rounded-[14px] border border-ink/12 bg-paper px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-mono text-[12px] font-bold text-ink">{c.code}</p>
                  <button
                    onClick={() => copyToClipboard(c.code, onToast, lang === "ru" ? "Код скопирован ✓" : lang === "en" ? "Code copied ✓" : "Kod nusxalandi ✓")}
                    className="press rounded-full bg-moss/10 px-2 py-0.5 text-[10px] font-bold text-moss"
                  >
                    {lang === "ru" ? "Копировать" : lang === "en" ? "Copy" : "Nusxa"}
                  </button>
                </div>
                {c.label && <p className="truncate text-[11px] font-semibold text-ink/60">{c.label}</p>}
                <p className="text-[10px] font-medium text-ink/45">{new Date(c.created_at).toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU")}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <input
                  key={c.code}
                  type="number"
                  min={0}
                  max={70}
                  defaultValue={c.percent || 0}
                  onBlur={(e) => { if (Number(e.target.value) !== (c.percent || 0)) void saveCodePercent(c.code, e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className={inputCls + " !w-[64px] !py-1 text-center"}
                  disabled={savingCode === c.code}
                  title={L("Shaxsiy chegirma %", "Персональная скидка %", "Personal discount %")}
                />
                <span className="text-[11px] font-bold text-ink/50">%</span>
                <button
                  onClick={() => void adminDeleteB2bCode(c.code).then((r) => { if (r.ok) { onToast(L("O'chirildi", "Удалён", "Deleted")); refresh(); } })}
                  className={btnDanger}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            </div>
          ))
        )}
        <div className="space-y-2">
          <input value={customCode} onChange={(e) => setCustomCode(e.target.value.toUpperCase())} placeholder={L("O'z kodi (bo'sh = avto B2B-XXXXXX)", "Свой код (пусто = авто B2B-XXXXXX)", "Custom code (empty = auto B2B-XXXXXX)")} className={inputCls + " uppercase placeholder:normal-case"} />
          <div className="flex gap-2">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={L("Hamkor nomi (ixtiyoriy)", "Название партнёра (необязательно)", "Partner name (optional)")} className={inputCls + " flex-1"} />
            <input
              type="number" min={0} max={70} value={newPercent}
              onChange={(e) => setNewPercent(e.target.value)}
              className={inputCls + " !w-[64px] text-center"}
              title={L("Shaxsiy chegirma %", "Персональная скидка %", "Personal discount %")}
            />
            <button onClick={() => void addCode()} className={btnDark}>+ {L("Kod", "Код", "Code")}</button>
          </div>
          <p className="text-[10px] font-medium text-ink/45">
            {L(
              "Shaxsiy chegirma % — kod bilan buyurtmada tovar summasiga qo'shimcha chegirma (sifat nazoratida promo bilan birga ishlamaydi).",
              "Персональная скидка % — дополнительная скидка на сумму товаров при заказе с этим кодом (не суммируется с промокодом).",
              "Personal discount % — extra off the goods subtotal on orders with this code (not stacked with a promo).",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 3 · GIFT CERTIFICATES ─────────────── */

const CERT_STATUS_CLS: Record<string, string> = {
  pending: "bg-amber/15 text-amberdeep",
  active: "bg-moss/15 text-pine",
  redeemed: "bg-amber/8 text-ink/50",
  revoked: "bg-[#E11D48]/10 text-[#E11D48]",
};

export function CertsAdminTab({ onToast }: { onToast: ToastFn }) {
  const { lang } = useI18n();
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);
  const [rows, setRows] = useState<CertificateRow[] | null>(null);
  const [amount, setAmount] = useState("200000");
  const [toName, setToName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => void fetchAdminCertificates().then(setRows);
  useEffect(refresh, []);

  const issue = async () => {
    const amt = parseInt(amount.replace(/\D/g, ""), 10) || 0;
    if (busy || amt < 50_000) return;
    haptic("medium");
    setBusy(true);
    const res = await adminIssueCertificate(amt, toName.trim() || undefined);
    setBusy(false);
    if (res.ok && res.code) {
      haptic("success");
      onToast(`${L("Sertifikat faol", "Сертификат активен", "Certificate active")}: ${res.code}`);
      setToName("");
      refresh();
    } else {
      haptic("error");
      onToast(L("Xatolik", "Ошибка", "Error"));
    }
  };

  const act = async (code: string, action: "activate" | "revoke") => {
    haptic("medium");
    const res = await adminCertificateAction(code, action);
    if (res.ok) {
      haptic("success");
      onToast(action === "activate" ? L("Faollashtirildi ✓", "Активирован ✓", "Activated ✓") : L("Bekor qilindi", "Отозван", "Revoked"));
      refresh();
    } else {
      onToast(res.error === "already_redeemed" ? L("Allaqachon ishlatilgan", "Уже погашен", "Already redeemed") : L("Xatolik", "Ошибка", "Error"));
    }
  };

  const pendingCount = rows?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <div className="animate-pop space-y-3">
      <p className="text-[12px] font-medium text-ink2">
        {L(
          "Mijoz sertifikat so'raydi → to'lov kelgach «Faollashtirish» bosing → kod chekoutda bir marta ishlaydi.",
          "Клиент запрашивает сертификат → после получения оплаты жмите «Активировать» → код работает один раз в чекауте.",
          "Customer requests a certificate → after payment press 'Activate' → the code works once at checkout.",
        )}
      </p>

      {/* Manual issue */}
      <div className={card + " space-y-2.5"}>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink/60">
          ➕ {L("Qo'lda chiqarish (darhol faol)", "Выпустить вручную (сразу активен)", "Issue manually (active now)")}
        </p>
        <div className="flex gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="200 000" className={inputCls} />
          <input value={toName} onChange={(e) => setToName(e.target.value)} placeholder={L("Kimga", "Кому", "To")} className={inputCls} />
        </div>
        <button onClick={() => void issue()} disabled={busy} className={btnDark + " w-full"}>
          {busy ? "…" : L("Chiqarish", "Выпустить", "Issue")}
        </button>
      </div>

      {pendingCount > 0 && (
        <div className="rounded-[16px] border border-amber/30 bg-amber/10 px-3.5 py-2.5 text-[12px] font-bold text-amberdeep">
          <span className="inline-flex items-center gap-1.5"><IconClock size={14} /> {L(`${pendingCount} ta so'rov to'lov kutmoqda`, `${pendingCount} заявок ждут активации`, `${pendingCount} requests await activation`)}</span>
        </div>
      )}

      {rows === null ? (
        <p className="py-6 text-center text-[12px] text-ink2">…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-[12px] italic text-ink2">{L("Sertifikatlar yo'q", "Сертификатов нет", "No certificates")}</p>
      ) : (
        rows.map((r) => (
          <div key={r.code} className={card}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-mono text-[13px] font-bold text-ink">{r.code}</p>
                  <button
                    onClick={() => copyToClipboard(r.code, onToast, lang === "ru" ? "Код скопирован ✓" : lang === "en" ? "Code copied ✓" : "Kod nusxalandi ✓")}
                    className="press rounded-full bg-moss/10 px-2 py-0.5 text-[10px] font-bold text-moss"
                  >
                    {lang === "ru" ? "Копировать" : lang === "en" ? "Copy" : "Nusxa"}
                  </button>
                </div>
                <p className="text-[12px] font-bold text-amberdeep">{formatPrice(r.amount, lang as never)}</p>
                <p className="truncate text-[11px] font-medium text-ink/60">
                  {(lang === "ru" ? "кому: " : "") + (r.to_name || "—")}{r.order_id ? ` · ${lang === "ru" ? "заказ" : "buyurtma"} ${r.order_id}` : ""}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${CERT_STATUS_CLS[r.status]}`}>
                {r.status}
              </span>
            </div>
            {(r.status === "pending" || r.status === "active") && (
              <div className="mt-2.5 flex gap-2">
                {r.status === "pending" && (
                  <button onClick={() => void act(r.code, "activate")} className="press flex-1 rounded-[12px] bg-moss py-2 text-[12px] font-bold text-white">
                    <span className="inline-flex items-center gap-1"><IconCheck size={13} /> {L("Faollashtirish", "Активировать", "Activate")}</span>
                  </button>
                )}
                <button onClick={() => void act(r.code, "revoke")} className={btnDanger + " flex-1 !rounded-[12px] !py-2"}>
                  <span className="inline-flex items-center gap-1"><IconTrash size={13} /> {L("Bekor qilish", "Отозвать", "Revoke")}</span>
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

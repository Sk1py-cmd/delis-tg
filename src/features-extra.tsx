/**
 * DELIS — Дополнительные удобства: адресная книга, ежедневная награда, возвраты товаров, свайп-удаление.
 */
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useI18n } from "./i18n";
import { UZBEKISTAN_REGIONS, type Order } from "./data";
import { formatPrice, haptic } from "./kit";
import {
  IconBriefcase,
  IconCheck,
  IconChevron,
  IconClose,
  IconFire,
  IconGift,
  IconHome,
  IconPin,
  IconPlus,
  IconReturn,
  IconStarsOrbit,
} from "./icons";
import { Sheet } from "./chrome";

/* ============================================================
   1. ADDRESS BOOK
   ============================================================ */

export type SavedAddress = {
  id: string;
  label: "home" | "work" | "other";
  customLabel?: string;
  regionId: string;
  district: string;
  street: string;
  apartment?: string;
  phone: string;
  isDefault?: boolean;
};

const LABEL_KEYS = {
  home: "addressHome",
  work: "addressWork",
  other: "addressOther",
} as const;

export function AddressBookSheet({
  open,
  onClose,
  addresses,
  onSave,
  onDelete,
  onSelect,
  selectMode = false,
}: {
  open: boolean;
  onClose: () => void;
  addresses: SavedAddress[];
  onSave: (a: SavedAddress) => void;
  onDelete: (id: string) => void;
  onSelect?: (a: SavedAddress) => void;
  selectMode?: boolean;
}) {
  const { t, lang } = useI18n();
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [creating, setCreating] = useState(false);

  const empty: SavedAddress = {
    id: "",
    label: "home",
    regionId: UZBEKISTAN_REGIONS[0].id,
    district: UZBEKISTAN_REGIONS[0].districts[0],
    street: "",
    apartment: "",
    phone: "+998 ",
    isDefault: addresses.length === 0,
  };

  const form = editing ?? (creating ? empty : null);
  const [draft, setDraft] = useState<SavedAddress>(empty);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (form) setDraft({ ...form, id: form.id || `addr_${Date.now()}` });
  }, [editing, creating]);

  const region = UZBEKISTAN_REGIONS.find((r) => r.id === draft.regionId) || UZBEKISTAN_REGIONS[0];

  const save = () => {
    if (!draft.street.trim() || draft.phone.replace(/\D/g, "").length < 12) {
      setErr(t("errAddress"));
      haptic("light");
      return;
    }
    haptic("success");
    onSave({ ...draft, isDefault: draft.isDefault || addresses.length === 0 });
    setEditing(null);
    setCreating(false);
    setErr("");
  };

  return (
    <Sheet open={open} onClose={onClose} title={selectMode ? t("addressSelect") : t("addressesTitle")}>
      {form ? (
        <div className="space-y-3 pt-1">
          {/* Label chips */}
          <div className="flex gap-2">
            {(["home", "work", "other"] as const).map((l) => (
              <button
                key={l}
                onClick={() => { haptic("light"); setDraft((d) => ({ ...d, label: l })); }}
                className={`press rounded-full px-3.5 py-2 text-[12px] font-bold ${
                  draft.label === l ? "bg-amber text-white" : "border border-ink/15 text-ink/60"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">{l === "home" ? <IconHome size={15} /> : l === "work" ? <IconBriefcase size={15} /> : <IconPin size={15} />} {t(LABEL_KEYS[l])}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-bold text-ink/70">{t("regionSelectLabel")}</label>
              <div className="relative mt-1">
                <select
                  value={draft.regionId}
                  onChange={(e) => {
                    const r = UZBEKISTAN_REGIONS.find((x) => x.id === e.target.value)!;
                    setDraft((d) => ({ ...d, regionId: r.id, district: r.districts[0] }));
                  }}
                  className="w-full appearance-none rounded-[16px] border border-ink/15 bg-paper py-3 pl-3 pr-8 text-[13px] font-semibold text-ink outline-none"
                >
                  {UZBEKISTAN_REGIONS.map((r) => (
                    <option key={r.id} value={r.id}>{r[lang]}</option>
                  ))}
                </select>
                <IconChevron size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-ink/65" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink/70">{t("selectDistrict")}</label>
              <div className="relative mt-1">
                <select
                  value={draft.district}
                  onChange={(e) => setDraft((d) => ({ ...d, district: e.target.value }))}
                  className="w-full appearance-none rounded-[16px] border border-ink/15 bg-paper py-3 pl-3 pr-8 text-[13px] font-semibold text-ink outline-none"
                >
                  {region.districts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <IconChevron size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-ink/65" />
              </div>
            </div>
          </div>

          <input
            value={draft.street}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, street: e.target.value }))}
            placeholder={t("streetAddress")}
            className="w-full rounded-[16px] border border-ink/15 bg-paper px-3.5 py-3 text-[14px] font-semibold text-ink outline-none focus:border-moss"
          />
          <input
            value={draft.apartment || ""}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, apartment: e.target.value }))}
            placeholder={t("apartmentOffice")}
            className="w-full rounded-[16px] border border-ink/15 bg-paper px-3.5 py-3 text-[14px] font-semibold text-ink outline-none focus:border-moss"
          />
          <input
            value={draft.phone}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            placeholder={t("phoneNumber")}
            inputMode="tel"
            className="w-full rounded-[16px] border border-ink/15 bg-paper px-3.5 py-3 text-[14px] font-semibold text-ink outline-none focus:border-moss"
          />

          <label className="flex items-center gap-2.5 text-[13px] font-semibold text-ink/70">
            <input
              type="checkbox"
              checked={!!draft.isDefault}
              onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))}
              className="h-4 w-4 rounded border-ink/20"
            />
            {t("addressMakeDefault")}
          </label>

          {err && <p className="text-[11px] font-bold text-[#B3402E]">{err}</p>}

          <div className="flex gap-2.5 pt-1">
            <button
              onClick={() => { setEditing(null); setCreating(false); setErr(""); }}
              className="press h-12 flex-1 rounded-[18px] bg-paper2 text-[13px] font-bold text-ink"
            >
              {t("backStep")}
            </button>
            <button onClick={save} className="press h-12 flex-1 rounded-[18px] bg-amber text-[13px] font-bold text-white">
              {t("addressAdd")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          {addresses.length === 0 ? (
            <div className="py-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sagetint text-moss">
                <IconPin size={28} />
              </div>
              <p className="mt-4 font-display text-[16px] font-bold text-ink">{t("addressEmpty")}</p>
              <p className="mt-1.5 text-[13px] font-medium text-ink/70">{t("addressEmptySub")}</p>
            </div>
          ) : (
            addresses.map((a) => {
              const reg = UZBEKISTAN_REGIONS.find((r) => r.id === a.regionId);
              return (
                <div key={a.id} className="rounded-[20px] border border-ink/18 bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-moss">{a.label === "home" ? <IconHome size={16} /> : a.label === "work" ? <IconBriefcase size={16} /> : <IconPin size={16} />}</span>
                        <span className="font-display text-[14px] font-bold text-ink">{t(LABEL_KEYS[a.label])}</span>
                        {a.isDefault && (
                          <span className="rounded-full bg-moss/12 px-2 py-0.5 text-[9px] font-extrabold uppercase text-moss">
                            {t("addressDefault")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] font-semibold leading-snug text-ink/70">
                        {reg?.[lang]}, {a.district}, {a.street}
                        {a.apartment ? `, ${a.apartment}` : ""}
                      </p>
                      <p className="mt-1 text-[12px] font-medium text-ink/70">{a.phone}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {selectMode ? (
                      <button
                        onClick={() => { haptic("medium"); onSelect?.(a); onClose(); }}
                        className="press flex-1 rounded-[14px] bg-amber py-2.5 text-[12px] font-bold text-white"
                      >
                        {t("addressUse")}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => { haptic("light"); setEditing(a); }}
                          className="press flex-1 rounded-[14px] bg-paper2 py-2.5 text-[12px] font-bold text-ink"
                        >
                          {t("addressEdit")}
                        </button>
                        <button
                          onClick={() => { haptic("light"); onDelete(a.id); }}
                          className="press rounded-[14px] bg-[#B3402E]/10 px-4 py-2.5 text-[12px] font-bold text-[#B3402E]"
                        >
                          {t("addressDelete")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}

          <button
            onClick={() => { haptic("light"); setCreating(true); }}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-dashed border-ink/20 text-[13px] font-bold text-ink/70 hover:border-ink/40 hover:text-ink"
          >
            <IconPlus size={16} /> {t("addressAdd")}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/* ============================================================
   2. DAILY REWARD
   ============================================================ */

const REWARDS = [10, 15, 20, 25, 30, 40, 50, 75, 100];

export function DailyRewardModal({
  open,
  onClose,
  onClaim,
  alreadyClaimed,
  streak,
}: {
  open: boolean;
  onClose: () => void;
  onClaim: (amount: number) => void;
  alreadyClaimed: boolean;
  streak: number;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"idle" | "opening" | "won">("idle");
  const [won, setWon] = useState(0);

  useEffect(() => {
    if (!open) {
      const tmr = setTimeout(() => setPhase("idle"), 300);
      return () => clearTimeout(tmr);
    }
  }, [open]);

  const claim = () => {
    if (alreadyClaimed || phase !== "idle") return;
    haptic("medium");
    setPhase("opening");
    const amount = REWARDS[Math.floor(Math.random() * REWARDS.length)];
    setTimeout(() => {
      setWon(amount);
      setPhase("won");
      haptic("success");
      onClaim(amount);
    }, 1400);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("dailyTitle")}>
      <div className="pt-2 text-center">
        <p className="text-[13px] font-medium text-ink/75">{t("dailySub")}</p>

        {/* Streak */}
        <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-amber/15 px-4 py-2 text-[12px] font-bold text-amberdeep">
          <IconFire size={16} /> {t("dailyStreak")}: {streak}
        </div>

        {/* Box */}
        <div className="relative mx-auto mt-8 flex h-44 w-44 items-center justify-center">
          {phase === "opening" && (
            <div className="absolute inset-0 animate-ping rounded-full bg-amber/20" />
          )}
          <button
            onClick={claim}
            disabled={alreadyClaimed || phase !== "idle"}
            className={`relative flex h-36 w-36 items-center justify-center rounded-[32px] text-[64px] shadow-lift transition-transform duration-500 ${
              phase === "opening" ? "scale-110 rotate-6" : phase === "won" ? "scale-100" : "press hover:scale-105"
            } ${alreadyClaimed ? "bg-paper2 opacity-60" : "bg-gradient-to-br from-amber to-amberdeep"}`}
          >
            {phase === "won" ? <IconStarsOrbit size={68} /> : alreadyClaimed ? <IconCheck size={58} strokeWidth={2.8} /> : <IconGift size={62} />}
          </button>
        </div>

        {phase === "won" && (
          <div className="animate-pop mt-6">
            <p className="font-display text-[15px] font-bold text-ink">{t("dailyWin")}</p>
            <p className="mt-1 inline-flex items-center gap-1 font-display text-[40px] font-bold text-amber">+{won} <IconStarsOrbit size={34} /></p>
          </div>
        )}

        {alreadyClaimed && phase === "idle" && (
          <p className="mt-6 font-display text-[15px] font-bold text-moss">{t("dailyClaimed")}</p>
        )}

        <button
          onClick={phase === "won" || alreadyClaimed ? onClose : claim}
          disabled={phase === "opening"}
          className="press mt-8 h-13 w-full rounded-[20px] bg-amber text-[14px] font-bold text-white disabled:opacity-50"
        >
          {phase === "won" || alreadyClaimed
            ? t("done")
            : phase === "opening"
              ? "..."
              : t("dailyClaim")}
        </button>
        {(alreadyClaimed || phase === "won") && (
          <p className="mt-3 text-[12px] font-semibold text-ink/65">{t("dailyComeBack")}</p>
        )}
      </div>
    </Sheet>
  );
}

/* ============================================================
   3. SWIPE-TO-DELETE ROW
   ============================================================ */

export function SwipeToDelete({
  children,
  onDelete,
  disabled = false,
}: {
  children: ReactNode;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const dragging = useRef(false);
  const DELETE_W = 88;

  const onStart = (x: number) => {
    if (disabled) return;
    dragging.current = true;
    startX.current = x;
    startOffset.current = offset;
  };
  const onMove = (x: number) => {
    if (!dragging.current) return;
    const dx = x - startX.current;
    const next = Math.min(0, Math.max(-DELETE_W, startOffset.current + dx));
    setOffset(next);
  };
  const onEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (offset < -DELETE_W * 0.45) {
      setOffset(-DELETE_W);
    } else {
      setOffset(0);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[22px]">
      {/* Delete action behind */}
      <div className="absolute inset-y-0 right-0 flex w-[88px] items-center justify-center bg-[#B3402E]">
        <button
          onClick={() => {
            haptic("medium");
            setOffset(0);
            onDelete();
          }}
          className="flex h-full w-full flex-col items-center justify-center gap-1 text-white"
        >
          <IconClose size={20} />
          <span className="text-[10px] font-bold uppercase tracking-wide">Delete</span>
        </button>
      </div>

      {/* Foreground content */}
      <div
        className="relative bg-card transition-transform duration-200 ease-out touch-pan-y"
        style={{ transform: `translateX(${offset}px)`, transitionDuration: dragging.current ? "0ms" : "200ms" }}
        onTouchStart={(e) => onStart(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={onEnd}
        onMouseDown={(e) => onStart(e.clientX)}
        onMouseMove={(e) => { if (dragging.current) onMove(e.clientX); }}
        onMouseUp={onEnd}
        onMouseLeave={onEnd}
      >
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   4. RETURNS
   ============================================================ */

export type ReturnRequest = {
  id: string;
  orderId: string;
  itemId: string;
  itemName: string;
  itemImg: string;
  reason: string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
};

export function ReturnsSheet({
  open,
  onClose,
  orders,
  returns,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  orders: Order[];
  returns: ReturnRequest[];
  onSubmit: (r: Omit<ReturnRequest, "id" | "status" | "createdAt">) => Promise<boolean>;
}) {
  const { t, lang } = useI18n();
  const delivered = orders.filter((o) => o.status === "delivered");
  const [step, setStep] = useState<"list" | "pick-order" | "pick-item" | "form" | "done">("list");
  const [orderId, setOrderId] = useState("");
  const [itemId, setItemId] = useState("");
  const [reason, setReason] = useState("returnsReason1");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  useEffect(() => {
    if (!open) {
      const tmr = setTimeout(() => {
        setStep("list");
        setOrderId("");
        setItemId("");
        setReason("returnsReason1");
        setNote("");
        setSubmitting(false);
        setSubmitError(false);
      }, 300);
      return () => clearTimeout(tmr);
    }
  }, [open]);

  const selectedOrder = delivered.find((o) => o.id === orderId);
  const selectedItem = selectedOrder?.items.find((i) => i.id === itemId);

  const submit = async () => {
    if (!selectedOrder || !selectedItem || submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    const ok = await onSubmit({
      orderId: selectedOrder.id,
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      itemImg: selectedItem.img,
      reason: t(reason as never),
      note: note.trim() || undefined,
    });
    setSubmitting(false);
    if (!ok) {
      setSubmitError(true);
      haptic("error");
      return;
    }
    haptic("success");
    setStep("done");
  };

  const reasons = ["returnsReason1", "returnsReason2", "returnsReason3", "returnsReason4"] as const;
  const statusLabel = { pending: t("returnsPending"), approved: t("returnsApproved"), rejected: t("returnsRejected") };

  return (
    <Sheet open={open} onClose={onClose} title={t("returnsTitle")}>
      {step === "done" ? (
        <div className="animate-pop py-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-moss/12 text-moss">
            <IconCheck size={28} />
          </div>
          <h3 className="mt-4 font-display text-[18px] font-bold text-ink">{t("returnsSuccess")}</h3>
          <p className="mt-2 text-[13px] font-medium text-ink/75">{t("returnsSuccessSub")}</p>
          <button onClick={onClose} className="press mt-7 w-full rounded-[18px] bg-amber py-3.5 text-[14px] font-bold text-white">
            {t("done")}
          </button>
        </div>
      ) : step === "list" ? (
        <div className="space-y-3 pt-1">
          {returns.length === 0 && delivered.length === 0 ? (
            <div className="py-10 text-center">
              <div className="motion-icon-tile mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-sagetint text-pine"><IconReturn size={28} /></div>
              <p className="mt-4 font-display text-[16px] font-bold text-ink">{t("returnsEmpty")}</p>
              <p className="mt-1.5 text-[13px] font-medium text-ink/70">{t("returnsEmptySub")}</p>
            </div>
          ) : (
            <>
              {returns.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-[20px] border border-ink/18 bg-card p-3.5">
                  <div className="h-12 w-12 overflow-hidden rounded-[12px] bg-paper2">
                    <img src={r.itemImg} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[13px] font-bold text-ink">{r.itemName}</p>
                    <p className="text-[11px] font-medium text-ink/70">#{r.orderId} · {t(r.reason as never)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase ${
                    r.status === "pending" ? "bg-amber/15 text-amberdeep" :
                    r.status === "approved" ? "bg-moss/12 text-moss" : "bg-[#B3402E]/10 text-[#B3402E]"
                  }`}>
                    {statusLabel[r.status]}
                  </span>
                </div>
              ))}
            </>
          )}

          {delivered.length > 0 && (
            <button
              onClick={() => { haptic("light"); setStep("pick-order"); }}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-amber text-[14px] font-bold text-white"
            >
              <IconPlus size={16} /> {t("returnsNew")}
            </button>
          )}
        </div>
      ) : step === "pick-order" ? (
        <div className="space-y-2.5 pt-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink/65">{t("returnsSelectOrder")}</p>
          {delivered.map((o) => (
            <button
              key={o.id}
              onClick={() => { haptic("light"); setOrderId(o.id); setStep("pick-item"); }}
              className="press flex w-full items-center justify-between rounded-[18px] border border-ink/18 bg-card p-4 text-left"
            >
              <div>
                <p className="font-display text-[14px] font-bold text-ink">#{o.id}</p>
                <p className="text-[12px] font-medium text-ink/70">{o.date} · {o.count} {t("itemsWord")}</p>
              </div>
              <span className="font-display text-[13px] font-bold text-ink">{formatPrice(o.total, lang)}</span>
            </button>
          ))}
        </div>
      ) : step === "pick-item" ? (
        <div className="space-y-2.5 pt-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink/65">{t("returnsSelectItem")}</p>
          {selectedOrder?.items.map((it) => (
            <button
              key={it.id}
              onClick={() => { haptic("light"); setItemId(it.id); setStep("form"); }}
              className="press flex w-full items-center gap-3 rounded-[18px] border border-ink/18 bg-card p-3.5 text-left"
            >
              <div className="h-12 w-12 overflow-hidden rounded-[12px] bg-paper2">
                <img src={it.img} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[13px] font-bold text-ink">{it.name}</p>
                <p className="text-[11px] font-medium text-ink/70">× {it.qty} · {formatPrice(it.price, lang)}</p>
              </div>
              <IconChevron size={14} className="text-ink/75" />
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          {selectedItem && (
            <div className="flex items-center gap-3 rounded-[18px] bg-paper2 p-3">
              <div className="h-11 w-11 overflow-hidden rounded-[10px]">
                <img src={selectedItem.img} alt="" className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="font-display text-[13px] font-bold text-ink">{selectedItem.name}</p>
                <p className="text-[11px] font-medium text-ink/70">#{orderId}</p>
              </div>
            </div>
          )}

          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink/65">{t("returnsReason")}</p>
          <div className="space-y-2">
            {reasons.map((r) => (
              <button
                key={r}
                onClick={() => { haptic("light"); setReason(r); }}
                className={`press flex w-full items-center gap-3 rounded-[16px] border p-3.5 text-left text-[13px] font-semibold ${
                  reason === r ? "border-ink bg-card ring-1 ring-ink" : "border-ink/18 bg-card/60 text-ink/70"
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${reason === r ? "border-ink bg-amber text-white" : "border-ink/20"}`}>
                  {reason === r && <IconCheck size={11} strokeWidth={2.6} />}
                </span>
                {t(r)}
              </button>
            ))}
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("returnsNote")}
            rows={3}
            className="w-full resize-none rounded-[16px] border border-ink/15 bg-paper px-3.5 py-3 text-[13px] font-semibold text-ink outline-none focus:border-moss"
          />

          {submitError && <p className="text-center text-[12px] font-bold text-[#B3402E]">{lang === "ru" ? "Не удалось создать заявку. Проверьте 14-дневный срок и подключение." : lang === "en" ? "Could not create the request. Check the 14-day window and connection." : "Ariza yaratilmadi. 14 kunlik muddat va internetni tekshiring."}</p>}
          <button onClick={() => void submit()} disabled={submitting} className="press h-13 w-full rounded-[18px] bg-amber text-[14px] font-bold text-white disabled:opacity-50">
            {submitting ? "…" : t("returnsSubmit")}
          </button>
        </div>
      )}
    </Sheet>
  );
}

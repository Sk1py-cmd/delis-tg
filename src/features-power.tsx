/**
 * DELIS — «Сильные» функции: конструктор подарков, сравнение товаров, QR-сканер, напоминание о пополнении запасов.
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { useI18n } from "./i18n";
import type { QrInfo } from "./api";
import {
  PRODUCTS,
  GIFT_BOX_STYLES,
  type Product,
  type GiftBoxStyle,
} from "./data";
import { formatPrice, haptic, sendDataToBot } from "./kit";
import {
  IconBag,
  IconCheck,
  IconGift,
  IconQrScan,
  IconRibbon,
  IconSend,
} from "./icons";
import { Sheet } from "./chrome";

/* ============================================================
   1. LUXURY GIFT BOX BUILDER
   ============================================================ */

export function GiftBuilderSheet({
  open,
  onClose,
  onAddCustomSet,
}: {
  open: boolean;
  onClose: () => void;
  onAddCustomSet: (items: { product: Product; qty: number }[], box: GiftBoxStyle, msg: string) => void;
}) {
  const { t, lang } = useI18n();
  const [selectedBoxId, setSelectedBoxId] = useState<string>(GIFT_BOX_STYLES[0].id);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(["wax", "glass"]);
  const [greetingMsg, setGreetingMsg] = useState("");
  const [senderName, setSenderName] = useState("");
  const [added, setAdded] = useState(false);

  const selectedBox = useMemo(
    () => GIFT_BOX_STYLES.find((b) => b.id === selectedBoxId) || GIFT_BOX_STYLES[0],
    [selectedBoxId],
  );

  const selectedProducts = useMemo(
    () => selectedProductIds.map((id) => PRODUCTS.find((p) => p.id === id)!).filter(Boolean),
    [selectedProductIds],
  );

  const productsTotal = useMemo(
    () => selectedProducts.reduce((sum, p) => sum + p.price, 0),
    [selectedProducts],
  );

  const grandSetTotal = productsTotal + selectedBox.price;

  const toggleProduct = (id: string) => {
    haptic("light");
    if (selectedProductIds.includes(id)) {
      if (selectedProductIds.length <= 1) return; // Keep at least 1
      setSelectedProductIds((prev) => prev.filter((pId) => pId !== id));
    } else {
      if (selectedProductIds.length >= 4) return; // Max 4 in a luxury box
      setSelectedProductIds((prev) => [...prev, id]);
    }
  };

  const handleAddSet = () => {
    haptic("success");
    onAddCustomSet(
      selectedProducts.map((p) => ({ product: p, qty: 1 })),
      selectedBox,
      greetingMsg,
    );
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      onClose();
    }, 1200);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("giftTitle")}>
      <div className="space-y-5 pt-1">
        <p className="text-[12.5px] font-medium leading-relaxed text-ink/75">{t("giftSub")}</p>

        {/* 3D-styled Visual Gift Box Preview */}
        <div
          className="relative overflow-hidden rounded-[26px] p-5 shadow-lift transition-all duration-500"
          style={{
            backgroundColor: selectedBox.boxColor,
            color: selectedBox.id === "porcelain_minimal" ? "#10211a" : "#f4f2eb",
          }}
        >
          {/* Decorative satin ribbon overlay */}
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 w-8 -translate-x-1/2 opacity-85 shadow-md"
            style={{ backgroundColor: selectedBox.ribbonColor }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 opacity-85 shadow-md"
            style={{ backgroundColor: selectedBox.ribbonColor }}
          />
          {/* Golden Ribbon Bow Knot */}
          <div className="motion-icon-tile absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[15px] bg-paper text-amberdeep shadow-lift">
            <IconRibbon size={24} />
          </div>

          <div className="relative z-10 flex items-start justify-between">
            <span className="rounded-full bg-paper/20 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest backdrop-blur-md">
              DELIS Gift Atelier
            </span>
            <span className="font-display text-[13px] font-bold">
              {formatPrice(selectedBox.price, lang)}
            </span>
          </div>

          {/* Selected products thumbnails inside box */}
          <div className="relative z-10 mt-12">
            <div className="flex items-center gap-2 overflow-x-auto py-2">
              {selectedProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-paper/30 bg-paper2/90 shadow-soft"
                >
                  <img src={p.img} alt={p.name} className="h-full w-full object-cover" />
                </div>
              ))}
              {Array.from({ length: Math.max(0, 4 - selectedProducts.length) }).map((_, i) => (
                <div
                  key={i}
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border border-dashed border-paper/40 text-[11px] font-bold text-white/60"
                >
                  +
                </div>
              ))}
            </div>

            {/* Handwritten Greeting Note Preview */}
            {greetingMsg && (
              <div className="mt-3 rounded-[16px] bg-paper p-3 text-[12px] italic text-ink shadow-sm">
                “{greetingMsg}”
                {senderName && <span className="block not-italic mt-1 font-bold text-right text-[11px]">— {senderName}</span>}
              </div>
            )}
          </div>
        </div>

        {/* 1. Choose Box Style */}
        <div>
          <label className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink/65">
            1. {t("giftChooseBox")}
          </label>
          <div className="mt-2 space-y-2">
            {GIFT_BOX_STYLES.map((box) => (
              <button
                key={box.id}
                onClick={() => {
                  haptic("light");
                  setSelectedBoxId(box.id);
                }}
                className={`press flex w-full items-center gap-3.5 rounded-[20px] border p-3.5 text-left transition-all ${
                  selectedBoxId === box.id
                    ? "border-ink bg-card shadow-sm ring-1 ring-ink"
                    : "border-ink/18 bg-card/60"
                }`}
              >
                <div
                  className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] shadow-sm"
                  style={{ backgroundColor: box.boxColor }}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: box.ribbonColor }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-[13.5px] font-bold text-ink truncate">
                      {box.name[lang]}
                    </p>
                    <span className="font-display text-[12px] font-bold text-moss">
                      +{formatPrice(box.price, lang)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] font-medium text-ink/70 leading-tight">
                    {box.desc[lang]}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Choose Items (Select 2 to 4) */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink/65">
              2. {t("giftChooseItems")}
            </label>
            <span className="text-[11px] font-bold text-moss">
              {selectedProductIds.length} / 4
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {PRODUCTS.map((p) => {
              const isSelected = selectedProductIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleProduct(p.id)}
                  className={`press flex items-center gap-2.5 rounded-[18px] border p-2.5 text-left transition-all ${
                    isSelected
                      ? "border-moss bg-sagetint/60 ring-1 ring-moss"
                      : "border-ink/18 bg-card/60"
                  }`}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[10px] bg-paper2">
                    <img src={p.img} alt={p.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[12px] font-bold text-ink">
                      {p.name}
                    </p>
                    <p className="text-[11px] font-semibold text-ink/70">
                      {formatPrice(p.price, lang)}
                    </p>
                  </div>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      isSelected ? "bg-moss text-white" : "border border-ink/20 text-ink/75"
                    }`}
                  >
                    {isSelected ? "✓" : "+"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Greeting Message & Sender */}
        <div className="rounded-[22px] border border-ink/18 bg-card p-4 space-y-2.5">
          <label className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink/65">
            3. {t("giftCardMsg")}
          </label>
          <textarea
            value={greetingMsg}
            onChange={(e) => setGreetingMsg(e.target.value)}
            placeholder={t("giftCardMsgPh")}
            rows={2}
            className="w-full resize-none rounded-[16px] border border-ink/15 bg-paper px-3.5 py-3 text-[13px] font-semibold text-ink outline-none focus:border-moss placeholder:text-ink/75"
          />
          <input
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Kimdan (masalan: Azizbekdan)"
            className="w-full rounded-[16px] border border-ink/15 bg-paper px-3.5 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss placeholder:text-ink/75"
          />
        </div>

        {/* Set Summary & Add to Cart */}
        <div className="rounded-[22px] border border-ink/18 bg-card p-4 space-y-2">
          <div className="flex justify-between text-[12.5px] font-medium text-ink/60">
            <span>{selectedProducts.length} ta mahsulot</span>
            <span>{formatPrice(productsTotal, lang)}</span>
          </div>
          <div className="flex justify-between text-[12.5px] font-medium text-ink/60">
            <span>{t("giftBoxFee")} ({selectedBox.name[lang].split("—")[0]})</span>
            <span>+{formatPrice(selectedBox.price, lang)}</span>
          </div>
          <div className="flex items-baseline justify-between border-t border-ink/18 pt-3">
            <span className="font-display text-[14px] font-bold text-ink">
              {t("cartTotal")}
            </span>
            <span className="font-display text-[22px] font-bold text-ink">
              {formatPrice(grandSetTotal, lang)}
            </span>
          </div>
        </div>

        <button
          onClick={handleAddSet}
          disabled={added}
          className={`press flex h-14 w-full items-center justify-center gap-2.5 rounded-[22px] text-[14.5px] font-bold shadow-lift transition-colors ${
            added ? "bg-moss text-white" : "bg-amber text-white hover:brightness-105"
          }`}
        >
          {added ? <IconCheck size={18} /> : <IconGift size={18} />}
          <span>{added ? t("added") : `${t("giftAddSetToCart")} · ${formatPrice(grandSetTotal, lang)}`}</span>
        </button>
      </div>
    </Sheet>
  );
}

/* ============================================================
   2. PRODUCT COMPARISON MATRIX
   ============================================================ */

export function ProductComparisonSheet({
  open,
  onClose,
  initialProduct,
  onAddToCart,
}: {
  open: boolean;
  onClose: () => void;
  initialProduct?: Product | null;
  onAddToCart: (p: Product) => void;
}) {
  const { t, lang } = useI18n();

  // Compare 2 or 3 selected products
  const [selectedIds, setSelectedIds] = useState<string[]>([
    initialProduct?.id || "wax",
    initialProduct?.id === "glass" ? "kitchen" : "glass",
  ]);

  const comparedProducts = useMemo(
    () => selectedIds.map((id) => PRODUCTS.find((p) => p.id === id)!).filter(Boolean),
    [selectedIds],
  );

  const toggleCompareId = (id: string) => {
    haptic("light");
    if (selectedIds.includes(id)) {
      if (selectedIds.length <= 2) return; // Keep at least 2 for comparison
      setSelectedIds((prev) => prev.filter((pId) => pId !== id));
    } else {
      if (selectedIds.length >= 3) {
        setSelectedIds([selectedIds[1], id]); // Replace oldest
      } else {
        setSelectedIds((prev) => [...prev, id]);
      }
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("compareTitle")}>
      <div className="space-y-4 pt-1">
        <p className="text-[12.5px] font-medium text-ink/70">{t("compareSub")}</p>

        {/* Product selector strip */}
        <div>
          <label className="text-[11px] font-bold text-ink/70">
            Taqqoslanuvchi mahsulotlar (2-3 ta)
          </label>
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
            {PRODUCTS.map((p) => {
              const active = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleCompareId(p.id)}
                  className={`press flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[11.5px] font-bold transition-all ${
                    active
                      ? "border-ink bg-amber text-white shadow-sm"
                      : "border-ink/15 bg-card text-ink/60"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                  {active && <IconCheck size={11} strokeWidth={2.8} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Side-by-side comparison table */}
        <div className="overflow-x-auto rounded-[24px] border border-ink/18 bg-card shadow-sm">
          <div className="grid min-w-[340px]" style={{ gridTemplateColumns: `100px repeat(${comparedProducts.length}, 1fr)` }}>
            {/* Header: Product images & titles */}
            <div className="border-b border-ink/18 p-3 text-[11px] font-bold uppercase tracking-wider text-ink/65">
              Mahsulot
            </div>
            {comparedProducts.map((p) => (
              <div key={p.id} className="border-b border-l border-ink/18 p-3 text-center">
                <div className="mx-auto h-16 w-16 overflow-hidden rounded-[14px] bg-paper2">
                  <img src={p.img} alt={p.name} className="h-full w-full object-cover" />
                </div>
                <p className="mt-2 font-display text-[13px] font-bold text-ink truncate">{p.name}</p>
                <p className="font-display text-[13px] font-bold text-amber">{formatPrice(p.price, lang)}</p>
                <button
                  onClick={() => {
                    haptic("success");
                    onAddToCart(p);
                  }}
                  className="press mt-2 w-full rounded-full bg-amber py-1.5 text-[11px] font-bold text-white shadow-sm"
                >
                  + {t("navCart")}
                </button>
              </div>
            ))}

            {/* Row 1: pH Level */}
            <div className="border-b border-ink/6 bg-paper2/40 p-3 text-[11.5px] font-bold text-ink/60">
              {t("comparePh")}
            </div>
            {comparedProducts.map((p) => (
              <div key={p.id} className="border-b border-l border-ink/6 bg-paper2/20 p-3 text-center font-display text-[12px] font-bold text-ink">
                {p.compare?.ph || p.spec[lang]}
              </div>
            ))}

            {/* Row 2: Surfaces */}
            <div className="border-b border-ink/6 p-3 text-[11.5px] font-bold text-ink/60">
              {t("compareSurfaces")}
            </div>
            {comparedProducts.map((p) => (
              <div key={p.id} className="border-b border-l border-ink/6 p-3 text-center text-[11.5px] font-medium text-ink2 leading-tight">
                {p.compare?.surfaces[lang] || p.desc[lang]}
              </div>
            ))}

            {/* Row 3: Scent profile */}
            <div className="border-b border-ink/6 bg-paper2/40 p-3 text-[11.5px] font-bold text-ink/60">
              {t("compareScent")}
            </div>
            {comparedProducts.map((p) => (
              <div key={p.id} className="border-b border-l border-ink/6 bg-paper2/20 p-3 text-center text-[11.5px] font-medium text-ink2 leading-tight">
                {p.compare?.scent[lang] || "Tabiiy efir moyi"}
              </div>
            ))}

            {/* Row 4: Volume & Concentration */}
            <div className="border-b border-ink/6 p-3 text-[11.5px] font-bold text-ink/60">
              {t("compareConcentration")}
            </div>
            {comparedProducts.map((p) => (
              <div key={p.id} className="border-b border-l border-ink/6 p-3 text-center text-[12px] font-semibold text-ink">
                {p.volume} · {p.compare?.concentration || p.spec[lang]}
              </div>
            ))}

            {/* Row 5: Safety & Certification */}
            <div className="p-3 text-[11.5px] font-bold text-ink/60">
              {t("compareSafety")}
            </div>
            {comparedProducts.map((p) => (
              <div key={p.id} className="border-l border-ink/6 p-3 text-center text-[11.5px] font-semibold text-moss leading-tight">
                ✓ {p.compare?.safety[lang] || "100% xavfsiz"}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/* ============================================================
   3. GENUINE AUTHENTICITY QR SCANNER (native camera + server registry)
   ============================================================ */

/** lib.dom of this TS version ships no BarcodeDetector types — declare loosely. */
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => {
  detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

/**
 * In-app camera scanner (fallback for desktop Telegram / plain browsers where
 * Telegram's native showScanQrPopup doesn't exist). Streams the rear camera
 * via getUserMedia and decodes frames with the native BarcodeDetector when
 * available, otherwise with jsQR (pure JS, works in Safari/Firefox).
 */
export function CameraQrScanner({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  const { lang } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<{ kind: "denied" | "nocam" | "other"; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let busy = false;

    const stop = () => {
      cancelled = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError({ kind: "nocam", name: "no-getUserMedia" });
        return;
      }
      // First try the rear camera; some webviews fail any facingMode
      // constraint (OverconstrainedError) — retry with a plain request.
      let lastErr: unknown = null;
      for (const c of [
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        { video: true, audio: false },
      ] as MediaStreamConstraints[]) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(c);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          stream = null;
        }
      }
      if (!stream) {
        const name = (lastErr as DOMException | null)?.name || "unknown";
        if (!cancelled) {
          setError({
            kind:
              name === "NotAllowedError" || name === "SecurityError"
                ? "denied"
                : name === "NotFoundError" || name === "OverconstrainedError" || name === "no-getUserMedia"
                  ? "nocam"
                  : "other",
            name,
          });
        }
        return;
      }
      if (cancelled) { stop(); return; }
      const video = videoRef.current;
      if (!video) { stop(); return; }
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play().catch(() => undefined);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      let detector: InstanceType<BarcodeDetectorCtor> | null = null;
      if (Detector) {
        try { detector = new Detector({ formats: ["qr_code"] }); } catch { detector = null; }
      }
      // Decode fallback for browsers without BarcodeDetector
      const jsQR = detector ? null : (await import("jsqr")).default;
      if (cancelled) { stop(); return; }

      timer = window.setInterval(() => {
        if (cancelled || busy || !ctx || !video) return;
        if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        busy = true;
        void (async () => {
          try {
            let text: string | null = null;
            if (detector) {
              const codes = await detector.detect(canvas);
              text = codes?.[0]?.rawValue || null;
            } else if (jsQR) {
              const img = ctx.getImageData(0, 0, w, h);
              const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
              text = hit?.data || null;
            }
            if (text && !cancelled) {
              stop();
              onCode(text);
            }
          } catch {
            /* transient decode error — keep scanning */
          } finally {
            busy = false;
          }
        })();
      }, 250);
    })();

    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div className="relative mx-auto h-[220px] w-full overflow-hidden rounded-[26px] bg-graphite shadow-lift">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
        {/* scan frame overlay */}
        <div className="pointer-events-none absolute inset-8 rounded-[18px] border-2 border-dashed border-paper/40" />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-amber/60" />
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-graphite/95 px-6 text-center">
            <IconQrScan size={36} className="text-amber" />
            <p className="text-[11.5px] font-semibold leading-snug text-white/85">
              {error.kind === "denied"
                ? lang === "ru"
                  ? "Нет доступа к камере — разрешите в настройках браузера или введите код вручную"
                  : lang === "en"
                    ? "Camera access denied — allow it in browser settings or enter the code manually"
                    : "Kamera ruxsati yo'q — brauzer sozlamalarida ruxsat bering yoki kodni qo'lda kiriting"
                : error.kind === "nocam"
                  ? lang === "ru"
                    ? "Камера не найдена на этом устройстве — введите код вручную"
                    : lang === "en"
                      ? "No camera found on this device — enter the code manually"
                      : "Bu qurilmada kamera topilmadi — kodni qo'lda kiriting"
                  : lang === "ru"
                    ? "Камера не запустилась — введите код вручную"
                    : lang === "en"
                      ? "Camera failed to start — enter the code manually"
                      : "Kamera ishga tushmadi — kodni qo'lda kiriting"}
            </p>
            {/* Raw DOMException name — priceless for support diagnostics */}
            <p className="font-mono text-[9px] text-white/40">{error.name}</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10.5px] font-semibold text-ink/55">
          {lang === "ru"
            ? "Наведите камеру на QR-код на флаконе…"
            : lang === "en"
              ? "Point the camera at the bottle QR code…"
              : "Kamerani flakondagi QR-kodga qarating…"}
        </p>
        <button
          onClick={() => { haptic("light"); onClose(); }}
          className="press shrink-0 rounded-full border border-ink/15 px-3 py-1.5 text-[10.5px] font-bold text-ink/70"
        >
          {lang === "ru" ? "Отмена" : lang === "en" ? "Cancel" : "Bekor qilish"}
        </button>
      </div>
    </div>
  );
}

export function QrScannerSheet({
  open,
  onClose,
  onOpenProduct,
}: {
  open: boolean;
  onClose: () => void;
  onOpenProduct: (p: Product) => void;
}) {
  const { t, lang } = useI18n();
  const [result, setResult] = useState<QrInfo | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [cameraHint, setCameraHint] = useState<string | null>(null);
  const [cameraLive, setCameraLive] = useState(false);

  /* Camera stream must never outlive the sheet */
  useEffect(() => {
    if (!open) setCameraLive(false);
  }, [open]);

  /** Scanner works ONLY against the server registry — a code that the admin
      has not added to qr_batches can never validate as authentic. */
  const verify = async (raw: string) => {
    // QR may contain a plain batch code or a full URL — extract the code-ish tail
    const code = (raw.trim().split(/[\s?#=\/]/).filter(Boolean).pop() || "").toUpperCase();
    if (!code || checking) return;
    haptic("medium");
    setChecking(true);
    setNotFound(false);
    setResult(null);
    try {
      const { fetchQrInfo } = await import("./api");
      const info = await fetchQrInfo(code);
      if (info?.valid) {
        setResult(info);
        haptic("success");
      } else {
        setNotFound(true);
        haptic("light");
      }
    } catch {
      setNotFound(true);
    } finally {
      setChecking(false);
    }
  };

  const checkCode = () => void verify(codeInput);

  const openCamera = async () => {
    haptic("light");
    setCameraHint(null);
    const { scanQrNative, hasNativeQrScanner } = await import("./api");
    if (!hasNativeQrScanner()) {
      /* Desktop Telegram / plain browser have no native QR popup —
         fall back to the in-app camera scanner via getUserMedia. */
      if (typeof navigator.mediaDevices?.getUserMedia === "function") {
        setCameraLive(true);
      } else {
        setCameraHint(
          lang === "uz"
            ? "Kamera bu qurilmada ishlamaydi — kodni qo'lda kiriting"
            : lang === "ru"
              ? "Камера недоступна на этом устройстве — введите код вручную"
              : "Camera unavailable on this device — enter the code manually",
        );
      }
      return;
    }
    const text = await scanQrNative(
      lang === "uz" ? "Flakon ustidagi QR-kodni ko'rsating" : lang === "ru" ? "Наведите камеру на QR-код на флаконе" : "Point the camera at the bottle QR code",
    );
    if (!text) {
      setCameraHint(
        lang === "uz"
          ? "Kamera skaneri bu Telegram versiyasida ishlamaydi — kodni qo'lda kiriting"
          : lang === "ru"
            ? "Сканер камеры недоступен в этой версии Telegram — введите код вручную"
            : "Camera scanner unavailable in this Telegram build — enter the code manually",
      );
      return;
    }
    void verify(text);
  };

  const resultProduct = result ? PRODUCTS.find((x) => x.id === result.productId) : undefined;
  const producedLabel = result
    ? new Date(result.producedAt).toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <Sheet open={open} onClose={onClose} title={t("scannerTitle")}>
      <div className="space-y-4 pt-1">
        <p className="text-[12.5px] font-medium text-ink/70">{t("scannerSub")}</p>

        {/* Camera scan: Telegram's native QR popup, or the getUserMedia
            in-app scanner when the native popup doesn't exist */}
        {cameraLive ? (
          <CameraQrScanner
            onCode={(text) => {
              setCameraLive(false);
              haptic("success");
              void verify(text);
            }}
            onClose={() => setCameraLive(false)}
          />
        ) : (
          <button
            onClick={openCamera}
            className="press relative mx-auto flex h-[170px] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[26px] bg-graphite shadow-lift"
          >
            <div className="noise-layer" />
            <IconQrScan size={44} className="text-amber" />
            <p className="text-[12px] font-bold uppercase tracking-widest text-white/70">
              {lang === "uz" ? "Kamera bilan skanerlash" : lang === "ru" ? "Сканировать камерой" : "Scan with camera"}
            </p>
            <div className="pointer-events-none absolute inset-6 rounded-[18px] border-2 border-dashed border-paper/30" />
          </button>
        )}
        {cameraHint && (
          <p className="rounded-[14px] border border-amber/30 bg-amber/10 px-3.5 py-2.5 text-[11.5px] font-semibold text-amberdeep">
            {cameraHint}
          </p>
        )}

        {/* Manual batch-code entry (fallback / desktop) */}
        <div className="flex gap-2">
          <input
            value={codeInput}
            onChange={(e) => { setCodeInput(e.target.value); setNotFound(false); setResult(null); }}
            onKeyDown={(e) => e.key === "Enter" && checkCode()}
            placeholder={lang === "uz" ? "Kodni kiriting (masalan DL-K7M2QP)" : lang === "ru" ? "Введите код с флакона (например DL-K7M2QP)" : "Enter the bottle code (e.g. DL-K7M2QP)"}
            className="min-w-0 flex-1 rounded-[16px] border border-ink/15 bg-card px-3.5 py-3 text-[12.5px] font-semibold uppercase text-ink outline-none placeholder:normal-case placeholder:text-ink/55 focus:border-moss"
          />
          <button
            onClick={checkCode}
            disabled={checking || !codeInput.trim()}
            className="press shrink-0 rounded-[16px] bg-amber px-4 text-[12px] font-bold text-white disabled:opacity-40"
          >
            {checking ? "…" : lang === "uz" ? "Tekshirish" : lang === "ru" ? "Проверить" : "Check"}
          </button>
        </div>

        {notFound && (
          <div className="animate-pop rounded-[18px] border border-[#E11D48]/25 bg-[#E11D48]/8 px-3.5 py-3 text-[12px] font-bold text-[#E11D48]">
            {lang === "uz" ? "Kod bazada topilmadi — mahsulot qalbaki bo'lishi mumkin. Ehtiyot bo'ling!" : lang === "ru" ? "Код не найден в базе — возможно, подделка. Будьте осторожны!" : "Code not found in our registry — possibly counterfeit. Be careful!"}
          </div>
        )}

        {/* Verified — data straight from the server registry */}
        {result && (
          <div className="animate-pop space-y-3 rounded-[24px] border border-moss/25 bg-sagetint/70 p-4.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-moss text-[13px] text-white">
                  ✓
                </span>
                <p className="font-display text-[14px] font-bold text-pine">
                  {t("scannerStatusVerified")}
                </p>
              </div>
              <span className="rounded-full bg-paper px-2.5 py-1 font-mono text-[10.5px] font-bold text-ink">
                {result.code}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11.5px]">
              <div className="rounded-[14px] bg-card/80 p-2.5">
                <p className="text-[10px] font-bold uppercase text-ink/65">{t("scannerBatch")}</p>
                <p className="font-display font-bold text-ink">{result.productName}</p>
                {result.volume && <p className="text-[10px] font-semibold text-ink/60">{result.volume}</p>}
              </div>
              <div className="rounded-[14px] bg-card/80 p-2.5">
                <p className="text-[10px] font-bold uppercase text-ink/65">{t("scannerDate")}</p>
                <p className="font-display font-bold text-ink">{producedLabel}</p>
                <p className="text-[10px] font-semibold text-ink/60">
                  {lang === "uz" ? "Partiya" : lang === "ru" ? "Партия" : "Batch"} №{result.batchNo}
                </p>
              </div>
            </div>

            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-pine">
              <IconCheck size={13} className="text-moss" strokeWidth={2.4} />
              {t("scannerCertIso")}
            </p>

            {resultProduct && (
              <button
                onClick={() => {
                  haptic("light");
                  onClose();
                  onOpenProduct(resultProduct);
                }}
                className="press flex h-11 w-full items-center justify-center gap-2 rounded-[16px] bg-amber text-[13px] font-bold text-white shadow-sm"
              >
                <IconBag size={15} />
                <span>{lang === "uz" ? "Mahsulotni ochish" : lang === "ru" ? "Открыть товар" : "Open product"}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ============================================================
   4. SMART RESTOCK REMINDER
   ============================================================ */

export function RestockReminderSheet({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
}) {
  const { t, lang } = useI18n();
  const [freqIdx, setFreqIdx] = useState(1);
  const [saved, setSaved] = useState(false);

  if (!product) return null;

  const frequencies = [
    { label: "Har 3 haftada (faol foydalanish)", days: 21 },
    { label: "Har 1.5 oyda (standart parvarish)", days: 45 },
    { label: "Har 3 oyda (mavsumiy)", days: 90 },
  ];

  const estimatedDate = new Date(Date.now() + frequencies[freqIdx].days * 86400000).toLocaleDateString(
    lang === "en" ? "en-GB" : "ru-RU",
    { day: "numeric", month: "long", year: "numeric" },
  );

  const handleSaveReminder = () => {
    haptic("success");
    sendDataToBot({
      type: "restock_reminder",
      product_id: product.id,
      product_name: product.name,
      remind_in_days: frequencies[freqIdx].days,
      target_date: estimatedDate,
    });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1500);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("reminderTitle")}>
      <div className="space-y-4 pt-1">
        <p className="text-[12.5px] font-medium text-ink/70">{t("reminderSub")}</p>

        {/* Target Product Summary */}
        <div className="flex items-center gap-3 rounded-[20px] border border-ink/18 bg-card p-3.5 shadow-sm">
          <div className="h-14 w-14 overflow-hidden rounded-[14px] bg-paper2">
            <img src={product.img} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[14px] font-bold text-ink">{product.name}</p>
            <p className="text-[11.5px] font-medium text-ink/70">{product.volume} · {formatPrice(product.price, lang)}</p>
          </div>
        </div>

        {/* Frequency selector */}
        <div>
          <label className="text-[11px] font-bold text-ink/70">{t("reminderFrequency")}</label>
          <div className="mt-2 space-y-2">
            {frequencies.map((f, i) => (
              <button
                key={i}
                onClick={() => {
                  haptic("light");
                  setFreqIdx(i);
                }}
                className={`press flex w-full items-center justify-between rounded-[16px] border p-3.5 text-left text-[12.5px] font-semibold ${
                  freqIdx === i
                    ? "border-ink bg-card shadow-sm ring-1 ring-ink"
                    : "border-ink/18 bg-card/60 text-ink/70"
                }`}
              >
                <span>{f.label}</span>
                {freqIdx === i && <IconCheck size={16} className="text-moss" />}
              </button>
            ))}
          </div>
        </div>

        {/* Estimated Date banner */}
        <div className="rounded-[20px] border border-moss/20 bg-sagetint/70 p-4 text-center">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-pine">
            Kutilayotgan eslatma sanasi
          </p>
          <p className="mt-1 font-display text-[18px] font-bold text-ink">{estimatedDate}</p>
          <p className="mt-1 text-[11px] font-medium text-pine/70">
            Telegram botimiz sizga buyurtmani 1 bosishda yangilash havolasini yuboradi.
          </p>
        </div>

        <button
          onClick={handleSaveReminder}
          disabled={saved}
          className={`press flex h-13 w-full items-center justify-center gap-2 rounded-[20px] text-[14px] font-bold shadow-lift transition-colors ${
            saved ? "bg-moss text-white" : "bg-amber text-white hover:bg-pine"
          }`}
        >
          {saved ? <IconCheck size={17} /> : <IconSend size={16} />}
          <span>{saved ? t("reminderSaved") : t("reminderSetBtn")}</span>
        </button>
      </div>
    </Sheet>
  );
}

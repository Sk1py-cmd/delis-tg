/**
 * DELIS — Отзывы о товарах: просмотр, добавление, подсказка оставить отзыв.
 */
import { useState } from "react";
import { useI18n } from "./i18n";
import { type Product } from "./data";
import { postReview } from "./api";
import { haptic, type TgUser } from "./kit";
import { IconCheck, IconSparkle, IconStar } from "./icons";
import { Sheet } from "./chrome";

export type UserReview = {
  id: string;
  productId: string;
  rating: number;
  text: string;
  author: string;
  date: string;
  photo?: string; // reserved for a future object-storage review attachment
};

/** Review composer — opens after delivery or from a product page. */
export function ReviewSheet({
  open,
  onClose,
  product,
  user,
  onSubmit,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  user: TgUser | null;
  onSubmit: (review: UserReview, stars: number) => void;
  onToast: (msg: string) => void;
}) {
  const { t, lang } = useI18n();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  if (!product) return null;

  const reset = () => {
    setRating(5);
    setText("");
    setSent(false);
    setSending(false);
    setSubmitError(false);
  };

  const submit = async () => {
    if (text.trim().length < 4) {
      haptic("light");
      return;
    }
    setSending(true);
    setSubmitError(false);
    const result = await postReview(product.id, rating, text.trim());
    setSending(false);
    if (!result) {
      haptic("error");
      setSubmitError(true);
      return;
    }
    haptic("success");
    const review: UserReview = {
      id: String(result.reviewId),
      productId: product.id,
      rating,
      text: text.trim(),
      author: user?.first_name || "Mijoz",
      date: new Date().toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    };
    onSubmit(review, result.stars);
    setSent(true);
    onToast(t("reviewThanks"));
  };

  const labels = [t("rate1"), t("rate2"), t("rate3"), t("rate4"), t("rate5")];

  return (
    <Sheet
      open={open}
      onClose={() => {
        onClose();
        window.setTimeout(reset, 400);
      }}
      title={t("writeReview")}
    >
      {sent ? (
        <div className="animate-pop py-8 text-center">
          <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-moss/12 text-moss">
            <IconCheck size={30} />
          </div>
          <p className="mt-5 font-display text-[17px] font-bold text-ink">{t("reviewThanks")}</p>
          <p className="mt-2 text-[13px] font-medium text-ink/70">{t("reviewModeration")}</p>
          <button
            onClick={() => {
              onClose();
              window.setTimeout(reset, 400);
            }}
            className="press mt-7 w-full rounded-[20px] bg-amber py-4 text-[14px] font-bold text-white"
          >
            {t("done")}
          </button>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          {/* Product */}
          <div className="flex items-center gap-3 rounded-[20px] border border-ink/18 bg-card p-3">
            <img src={product.img} alt={product.name} className="h-14 w-14 rounded-[14px] object-cover" />
            <div className="min-w-0">
              <p className="font-display text-[14px] font-bold text-ink">{product.name}</p>
              <p className="truncate text-[12px] font-medium text-ink/70">{product.desc[lang]}</p>
            </div>
          </div>

          {/* Star rating */}
          <div className="rounded-[20px] border border-ink/18 bg-card p-4 text-center">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink/65">
              {t("yourRating")}
            </p>
            <div className="mt-3 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    haptic("light");
                    setRating(n);
                  }}
                  className="press p-1 transition-transform"
                  style={{ transform: rating === n ? "scale(1.18)" : "scale(1)" }}
                  aria-label={`${n}`}
                >
                  <IconStar
                    size={30}
                    className={n <= rating ? "text-amber" : "text-ink/15"}
                    strokeWidth={n <= rating ? 0 : 1.6}
                  />
                </button>
              ))}
            </div>
            <p className="mt-2 text-[13px] font-bold text-amberdeep">{labels[rating - 1]}</p>
          </div>

          {/* Text */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("reviewPlaceholder")}
            rows={4}
            maxLength={400}
            className="w-full resize-none rounded-[18px] border border-ink/15 bg-card px-4 py-3.5 text-[14px] font-medium text-ink outline-none transition-colors placeholder:text-ink/75 focus:border-moss"
          />
          <p className="-mt-2 text-right text-[11px] font-semibold text-ink/60">{text.length}/400</p>

          {submitError && (
            <p className="text-center text-[12px] font-bold text-[#B3402E]">
              {lang === "ru" ? "Отзыв не сохранён. Оставить отзыв можно один раз после доставленного заказа." : lang === "en" ? "Review not saved. Reviews require a delivered purchase and can be submitted once." : "Izoh saqlanmadi. Izoh faqat yetkazilgan xariddan keyin bir marta qoldiriladi."}
            </p>
          )}

          <button
            onClick={() => void submit()}
            disabled={text.trim().length < 4 || sending}
            className="press flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-amber text-[15px] font-bold text-white shadow-lift disabled:opacity-40"
          >
            <IconSparkle size={17} />
            {sending ? "…" : t("submitReview")}
          </button>
          <p className="text-center text-[11px] font-medium text-ink/65">{t("reviewBonus")}</p>
        </div>
      )}
    </Sheet>
  );
}

/** Prompt banner shown on a delivered order — invites the customer to review. */
export function ReviewPrompt({
  product,
  onWrite,
}: {
  product: Product;
  onWrite: (p: Product) => void;
}) {
  const { t } = useI18n();
  return (
    <button
      onClick={() => {
        haptic("medium");
        onWrite(product);
      }}
      className="press flex w-full items-center gap-3.5 rounded-[20px] border border-amber/25 bg-amber/[0.07] p-4 text-left"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber text-white">
        <IconStar size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-ink">{t("rateProductCta")}</span>
        <span className="mt-0.5 block truncate text-[12px] font-medium text-ink/75">
          {product.name} · {t("reviewBonus")}
        </span>
      </span>
      <span className="flex gap-0.5 text-amber">
        {[1, 2, 3, 4, 5].map((n) => (
          <IconStar key={n} size={12} />
        ))}
      </span>
    </button>
  );
}

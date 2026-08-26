/**
 * DELIS — Умный квиз: подбор товара по ответам пользователя.
 */
import { useState } from "react";
import type { L10n } from "./i18n";
import { useI18n } from "./i18n";
import { haptic } from "./kit";
import { PRODUCTS } from "./data";
import { IconBag, IconCheck } from "./icons";
import { Sheet } from "./chrome";

type Question = {
  id: string;
  question: L10n;
  options: {
    id: string;
    label: L10n;
    value: string;
  }[];
};

const QUESTIONS: Question[] = [
  {
    id: "q1",
    question: {
      uz: "Nimani tartibga keltirmoqchisiz?",
      ru: "Что хотите привести в порядок?",
      en: "What do you want to clean up?",
    },
    options: [
      { id: "home", label: { uz: "Uy", ru: "Дом", en: "Home" }, value: "home" },
      { id: "car", label: { uz: "Avtomobil", ru: "Автомобиль", en: "Car" }, value: "car" },
      { id: "both", label: { uz: "Hammasi", ru: "Всё вместе", en: "Everything" }, value: "both" },
    ],
  },
  {
    id: "q2",
    question: {
      uz: "Siz uchun nima muhimroq?",
      ru: "Что для вас важнее?",
      en: "What matters most to you?",
    },
    options: [
      { id: "clean", label: { uz: "Chuqur tozalash", ru: "Глубокая чистка", en: "Deep cleaning" }, value: "clean" },
      { id: "shine", label: { uz: "Ko'zgu yaltirashi", ru: "Зеркальный блеск", en: "Mirror shine" }, value: "shine" },
      { id: "gentle", label: { uz: "Muloyim g'amxo'rlik", ru: "Бережная забота", en: "Gentle care" }, value: "gentle" },
    ],
  },
  {
    id: "q3",
    question: {
      uz: "Sizda qancha vaqt bor?",
      ru: "Сколько у вас времени?",
      en: "How much time do you have?",
    },
    options: [
      { id: "fast", label: { uz: "5 daqiqa", ru: "5 минут", en: "5 minutes" }, value: "fast" },
      { id: "medium", label: { uz: "Yarim soat", ru: "Полчаса", en: "30 minutes" }, value: "medium" },
      { id: "slow", label: { uz: "Shoshilmayman", ru: "Никуда не спешу", en: "No rush" }, value: "slow" },
    ],
  },
];

// Product bundles based on answers
const BUNDLES: Record<string, string[]> = {
  "home-clean": ["glass", "kitchen", "floor"],
  "home-shine": ["glass", "floor"],
  "home-gentle": ["cloud", "floor"],
  "car-clean": ["shampoo", "interior"],
  "car-shine": ["wax", "shampoo"],
  "car-gentle": ["shampoo"],
  "both-clean": ["glass", "shampoo"],
  "both-shine": ["wax", "glass"],
  "both-gentle": ["cloud", "shampoo"],
};

export function SmartQuiz({ onAdd }: { onAdd: (product: any, qty?: number) => void }) {
  const { t, lang } = useI18n();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);

  const handleAnswer = (value: string) => {
    haptic("light");
    const newAnswers = [...answers, value];
    setAnswers(newAnswers);

    if (currentStep < QUESTIONS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setShowResult(true);
    }
  };

  const handleRestart = () => {
    haptic("light");
    setCurrentStep(0);
    setAnswers([]);
    setShowResult(false);
  };

  const handleBuyBundle = () => {
    haptic("success");
    getBundleProducts().forEach((product) => onAdd(product, 1));
  };

  const getBundleProducts = () => {
    const key = `${answers[0]}-${answers[1]}`;
    const productIds = BUNDLES[key] || BUNDLES["home-clean"];
    const resolved = productIds
      .map((id) => PRODUCTS.find((p) => p.id === id))
      .filter((p): p is any => Boolean(p));
    return resolved.length ? resolved : PRODUCTS.slice(0, 3);
  };

  const bundleProducts = getBundleProducts();
  const totalRetail = bundleProducts.reduce((sum, p) => sum + p.price, 0);
  const discountedPrice = Math.round(totalRetail * 0.9);

  if (showResult) {
    return (
      <Sheet open={true} onClose={handleRestart} title={lang === "uz" ? "Sizning ideal to'plamingiz" : lang === "ru" ? "Ваш идеальный комплект" : "Your perfect bundle"}>
        <div className="space-y-5">
          <div className="rounded-[24px] bg-gradient-to-br from-amber/20 to-amber/10 p-6 text-center">
            <p className="text-[13px] font-medium text-ink/70 mb-2">
              {lang === "uz" ? "10% chegirma" : lang === "ru" ? "Скидка 10%" : "10% discount"}
            </p>
            <p className="font-display text-[28px] font-bold text-amber">
              {formatPrice(discountedPrice, lang)}
            </p>
            <p className="mt-1 text-[12px] text-ink/70 line-through">
              {formatPrice(totalRetail, lang)}
            </p>
          </div>

          <div className="space-y-3">
            {bundleProducts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-[16px] bg-card p-3">
                <img src={p.img} alt={p.name} className="h-12 w-12 rounded-[12px] object-cover" />
                <div className="flex-1">
                  <p className="text-[13px] font-bold text-ink">{p.name}</p>
                  <p className="text-[11px] text-ink/70">{p.volume}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleBuyBundle}
            className="press flex w-full items-center justify-center gap-2 rounded-[20px] bg-amber px-5 py-3.5 text-[14px] font-bold text-white"
          >
            <IconBag size={16} />
            {lang === "uz" ? "To'plamni sotib olish" : lang === "ru" ? "Купить комплект" : "Buy bundle"}
          </button>

          <button
            onClick={handleRestart}
            className="press w-full rounded-[20px] bg-paper2 px-5 py-3 text-[13px] font-bold text-ink"
          >
            {lang === "uz" ? "Qayta boshlash" : lang === "ru" ? "Пройти заново" : "Retake quiz"}
          </button>
        </div>
      </Sheet>
    );
  }

  const question = QUESTIONS[currentStep];

  return (
    <Sheet open={true} onClose={handleRestart} title={t("quizTitle")}>
      <div className="space-y-5">
        {/* Progress */}
        <div className="flex gap-2">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= currentStep ? "bg-amber" : "bg-amber/10"
              }`}
            />
          ))}
        </div>

        {/* Question */}
        <div className="text-center">
          <p className="text-[12px] text-ink/70 mb-2">
            {lang === "uz" ? "Savol" : lang === "ru" ? "Вопрос" : "Question"} {currentStep + 1} / {QUESTIONS.length}
          </p>
          <h2 className="font-display text-[20px] font-bold text-ink">
            {question.question[lang]}
          </h2>
        </div>

        {/* Options */}
        <div className="space-y-2.5">
          {question.options.map((option) => (
            <button
              key={option.id}
              onClick={() => handleAnswer(option.value)}
              className="press flex w-full items-center justify-between rounded-[20px] bg-card px-5 py-4 text-[14px] font-bold text-ink hover:bg-amber/10"
            >
              <span>{option.label[lang]}</span>
              <IconCheck size={18} className="text-ink/75" />
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function formatPrice(n: number, lang: string): string {
  const formatted = n.toLocaleString(lang === "en" ? "en-US" : "ru-RU");
  const suffix = lang === "uz" ? " so'm" : lang === "ru" ? " сум" : " UZS";
  return `${formatted}${suffix}`;
}

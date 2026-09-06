/**
 * DELIS — Контент, который админ может менять прямо из интерфейса (тексты «Почему мы» и др.): локальная загрузка/сохранение + синхронизация с сервером.
 */
import { useEffect, useMemo, useState } from "react";
import type { L10n } from "./i18n";
import { useI18n } from "./i18n";
import { adminSaveManagedContent, fetchManagedContent } from "./api";
import { haptic } from "./kit";
import { IconArrow, IconCamera, IconCheck, IconFactory, IconGrid, IconPlus, IconSend, IconSparkle, IconTrash } from "./icons";

export type WhySlideConfig = {
  id: string;
  image: string;
  badge: L10n;
  title: L10n;
  text: L10n;
  stat: string;
  statLabel: L10n;
  active: boolean;
};

export type TipConfig = {
  id: string;
  kind: "video" | "article";
  image: string;          // data-URL / https — загружается из админки
  mins: number;           // длительность/время чтения
  title: L10n;
  steps: L10n[];          // шаги/советы (раскрываются на главной)
};

export type ManagedContent = {
  splash: {
    brand: string;
    slogan: L10n;
    steps: L10n[];
    accent: string;
    background: string;
    image: string;
  };
  why: {
    kicker: L10n;
    title: L10n;
    intro: L10n;
    slides: WhySlideConfig[];
  };
  wholesale: {
    enabled: boolean;
    kicker: L10n;
    title: L10n;
    lead: L10n;
    audiences: L10n[];
    cta: L10n;
  };
  /* «Советы / Журнал о чистоте и уходе» — демо удалены, контент добавляется
     из админки (фото + заголовки uz/ru/en + шаги). */
  tips: TipConfig[];
  updatedAt: number;
};

const local = (uz: string, ru: string, en: string): L10n => ({ uz, ru, en });

export const DEFAULT_MANAGED_CONTENT: ManagedContent = {
  splash: {
    brand: "DELIS",
    slogan: local("Har bir tomchida mukammallik", "Совершенство в каждой капле", "Perfection in every drop"),
    steps: [
      local("Uy uchun mehmondo'st tozalik", "Домашний уют и чистота", "Cozy purity for home"),
      local("Avto estetikasi va chuqur yaltiroq", "Эстетика авто и глубокий блеск", "Automotive aesthetics and gloss"),
      local("Laboratoriya nazorati va sifat", "Лабораторный контроль и качество", "Lab control and quality"),
      local("Barchasi tayyor — xush kelibsiz", "Все готово — добро пожаловать", "All set — welcome"),
    ],
    accent: "#638872",
    background: "#c3c88c",
    image: "images/prod-glass.jpg",
  },
  why: {
    kicker: local("O'zbekistonda yaratilgan", "Создано в Узбекистане", "Created in Uzbekistan"),
    title: local("Nega DELIS", "Почему DELIS", "Why DELIS"),
    intro: local(
      "Uy va avtomobil uchun zamonaviy parvarish: sifat, ishonch va aniq natija.",
      "Современный уход для дома и автомобиля: качество, доверие и понятный результат.",
      "Modern care for home and car: quality, trust and visible results.",
    ),
    slides: [
      {
        id: "home",
        image: "images/cat-home.jpg",
        badge: local("Uy", "Дом", "Home"),
        title: local("Uy uchun poklik", "Чистота для дома", "Purity for home"),
        text: local("Mehmondo'st tozalik va oilaviy xavfsizlik.", "Уютная чистота и безопасность семьи.", "Cozy clean and family safety."),
        stat: "8",
        statLabel: local("mahsulot turi", "видов товаров", "product types"),
        active: true,
      },
      {
        id: "car",
        image: "images/cat-car.jpg",
        badge: local("Avto", "Авто", "Car"),
        title: local("Avto estetikasi", "Эстетика авто", "Car aesthetics"),
        text: local("Chuqur yaltiroq va professional himoya.", "Глубокий блеск и профессиональная защита.", "Deep gloss and professional protection."),
        stat: "2",
        statLabel: local("yo'nalish", "направления", "care lines"),
        active: true,
      },
      {
        id: "quality",
        image: "images/factory.jpg",
        badge: local("Sifat", "Качество", "Quality"),
        title: local("Nazorat va ishonch", "Контроль и доверие", "Control and trust"),
        text: local("Har bir partiya uchun sifat nazorati.", "Контроль качества каждой партии.", "Quality control for every batch."),
        stat: "100%",
        statLabel: local("sifat nazorati", "контроль качества", "quality control"),
        active: true,
      },
      {
        id: "formula",
        image: "images/prod-wax.jpg",
        badge: local("Formula", "Формула", "Formula"),
        title: local("O'z formulalarimiz", "Собственные формулы", "In-house formulas"),
        text: local("Aniq maqsad uchun yaratilgan mahsulotlar.", "Продукты, созданные под конкретную задачу.", "Products made for a precise purpose."),
        stat: "1",
        statLabel: local("DELIS standarti", "стандарт DELIS", "DELIS standard"),
        active: true,
      },
    ],
  },
  wholesale: {
    enabled: true,
    kicker: local("B2B hamkorlik", "B2B сотрудничество", "B2B partnership"),
    title: local("Biznes uchun DELIS", "DELIS для бизнеса", "DELIS for business"),
    lead: local("Do‘konlar, avtoyuvish va klining uchun qulay ulgurji shartlar.", "Удобные оптовые условия для магазинов, автомоек и клининга.", "Convenient wholesale terms for stores, car washes and cleaning teams."),
    audiences: [local("Do‘konlar", "Магазины", "Stores"), local("Avtoyuvish", "Автомойки", "Car washes"), local("Klining", "Клининг", "Cleaning teams")],
    cta: local("Hamkor bo‘lish", "Стать партнёром", "Become a partner"),
  },
  tips: [],
  updatedAt: Date.now(),
};

const STORAGE_KEY = "delis_managed_content_v1";
const EVENT_NAME = "delis-content-updated";

const asL10n = (v: unknown): L10n => {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  return {
    uz: typeof o.uz === "string" ? o.uz : "",
    ru: typeof o.ru === "string" ? o.ru : "",
    en: typeof o.en === "string" ? o.en : "",
  };
};

/** Советы добавляет админ — по умолчанию их нет (демо удалены). */
function coerceTips(raw: unknown): TipConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((item, i) => {
    const o = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    return {
      id: typeof o.id === "string" && o.id ? o.id : `tip-${Date.now().toString(36)}-${i}`,
      kind: o.kind === "video" ? "video" : "article",
      image: typeof o.image === "string" ? o.image : "",
      mins: Number.isFinite(Number(o.mins)) && Number(o.mins) > 0 ? Math.min(99, Math.round(Number(o.mins))) : 3,
      title: asL10n(o.title),
      steps: Array.isArray(o.steps) ? o.steps.slice(0, 10).map(asL10n) : [],
    };
  });
}

function normalize(input?: Partial<ManagedContent> | null): ManagedContent {
  if (!input) return DEFAULT_MANAGED_CONTENT;
  return {
    splash: {
      ...DEFAULT_MANAGED_CONTENT.splash,
      ...(input.splash || {}),
      steps: input.splash?.steps?.length ? input.splash.steps : DEFAULT_MANAGED_CONTENT.splash.steps,
    },
    why: {
      ...DEFAULT_MANAGED_CONTENT.why,
      ...(input.why || {}),
      slides: input.why?.slides?.length ? input.why.slides : DEFAULT_MANAGED_CONTENT.why.slides,
    },
    wholesale: {
      ...DEFAULT_MANAGED_CONTENT.wholesale,
      ...(input.wholesale || {}),
      audiences: input.wholesale?.audiences?.length ? input.wholesale.audiences : DEFAULT_MANAGED_CONTENT.wholesale.audiences,
    },
    tips: coerceTips(input?.tips),
    updatedAt: input.updatedAt || Date.now(),
  };
}

export function loadManagedContent(): ManagedContent {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
  } catch {
    return DEFAULT_MANAGED_CONTENT;
  }
}

function publish(content: ManagedContent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
  } catch {
    // Large image uploads can exhaust localStorage; server save still runs.
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: content }));
}

export async function saveManagedContent(content: ManagedContent) {
  const next = { ...content, updatedAt: Date.now() };
  publish(next);
  await adminSaveManagedContent(next);
  return next;
}

export function useManagedContent() {
  const [content, setContent] = useState<ManagedContent>(loadManagedContent);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      setContent(normalize((event as CustomEvent<ManagedContent>).detail));
    };
    window.addEventListener(EVENT_NAME, onUpdate);
    void fetchManagedContent<ManagedContent>().then((remote) => {
      if (remote) {
        const next = normalize(remote);
        publish(next);
        setContent(next);
      }
    });
    return () => window.removeEventListener(EVENT_NAME, onUpdate);
  }, []);

  return content;
}

function LocalInputs({ value, onChange }: { value: L10n; onChange: (next: L10n) => void }) {
  return (
    <div className="grid gap-2">
      {(["uz", "ru", "en"] as const).map((code) => (
        <label key={code} className="flex items-center gap-2">
          <span className="w-7 text-[9px] font-extrabold uppercase text-ink/60">{code}</span>
          <input
            value={value[code]}
            onChange={(e) => onChange({ ...value, [code]: e.target.value })}
            className="min-w-0 flex-1 rounded-[13px] border border-ink/15 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
          />
        </label>
      ))}
    </div>
  );
}

export function ContentManagementTab({ onToast }: { onToast: (message: string) => void }) {
  const { lang } = useI18n();
  const [draft, setDraft] = useState<ManagedContent>(loadManagedContent);
  const [section, setSection] = useState<"splash" | "why" | "tips" | "wholesale" | "channel">("splash");
  const [saving, setSaving] = useState(false);
  const [channelTitle, setChannelTitle] = useState("");
  const [channelText, setChannelText] = useState("");
  const [posting, setPosting] = useState(false);
  const [postStatus, setPostStatus] = useState<string | null>(null);

  const activeSlides = useMemo(() => draft.why.slides.filter((s) => s.active).length, [draft.why.slides]);

  const setSlide = (index: number, patch: Partial<WhySlideConfig>) => {
    setDraft((prev) => ({
      ...prev,
      why: {
        ...prev.why,
        slides: prev.why.slides.map((slide, i) => i === index ? { ...slide, ...patch } : slide),
      },
    }));
  };

  const moveSlide = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= draft.why.slides.length) return;
    const slides = [...draft.why.slides];
    [slides[index], slides[target]] = [slides[target], slides[index]];
    setDraft({ ...draft, why: { ...draft.why, slides } });
  };

  const uploadImage = (index: number, file?: File) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      onToast(lang === "ru" ? "Фото должно быть меньше 2 MB" : "Foto 2 MB dan kichik bo'lishi kerak");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSlide(index, { image: String(reader.result || "") });
    reader.readAsDataURL(file);
  };

  const uploadSplashImage = (file?: File) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      onToast(lang === "ru" ? "Фото должно быть меньше 2 MB" : "Foto 2 MB dan kichik bo'lishi kerak");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDraft((prev) => ({ ...prev, splash: { ...prev.splash, image: String(reader.result || "") } }));
    reader.readAsDataURL(file);
  };

  /* ── Советы / Журнал: добавление и правка из админки ── */
  const setTip = (index: number, patch: Partial<TipConfig>) => {
    setDraft((prev) => ({ ...prev, tips: prev.tips.map((tip, i) => (i === index ? { ...tip, ...patch } : tip)) }));
  };
  const moveTip = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= draft.tips.length) return;
    const tips = [...draft.tips];
    [tips[index], tips[target]] = [tips[target], tips[index]];
    setDraft({ ...draft, tips });
  };
  const addTip = () => {
    setDraft((prev) => ({
      ...prev,
      tips: [
        ...prev.tips,
        { id: `tip-${Date.now().toString(36)}`, kind: "article", image: "", mins: 3, title: { uz: "", ru: "", en: "" }, steps: [] },
      ],
    }));
  };
  const uploadTipImage = (index: number, file?: File) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      onToast(lang === "ru" ? "Фото должно быть меньше 2 MB" : "Foto 2 MB dan kichik bo'lishi kerak");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setTip(index, { image: String(reader.result || "") });
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    haptic("medium");
    await saveManagedContent(draft);
    setSaving(false);
    haptic("success");
    onToast(lang === "ru" ? "Контент сохранён ✓" : "Kontent saqlandi ✓");
  };

  return (
    <div className="space-y-3 animate-pop">
      <div className="flex rounded-[16px] bg-paper2 p-1">
        <button onClick={() => setSection("splash")} className={`flex-1 rounded-[12px] py-2 text-[12px] font-bold ${section === "splash" ? "bg-card text-ink shadow-sm" : "text-ink2"}`}>
          <span className="inline-flex items-center gap-1"><IconSparkle size={13} /> {lang === "ru" ? "Заставка" : "Zastavka"}</span>
        </button>
        <button onClick={() => setSection("why")} className={`flex-1 rounded-[12px] py-2 text-[12px] font-bold ${section === "why" ? "bg-card text-ink shadow-sm" : "text-ink2"}`}>
          <span className="inline-flex items-center gap-1"><IconGrid size={13} /> Why ({activeSlides})</span>
        </button>
        <button onClick={() => setSection("tips")} className={`flex-1 rounded-[12px] py-2 text-[12px] font-bold ${section === "tips" ? "bg-card text-ink shadow-sm" : "text-ink2"}`}>
          <span className="inline-flex items-center gap-1"><IconCamera size={13} /> {lang === "ru" ? "Советы" : lang === "en" ? "Tips" : "Maslahat"} ({draft.tips.length})</span>
        </button>
        <button onClick={() => setSection("wholesale")} className={`flex-1 rounded-[12px] py-2 text-[12px] font-bold ${section === "wholesale" ? "bg-card text-ink shadow-sm" : "text-ink2"}`}>
          <span className="inline-flex items-center gap-1"><IconFactory size={13} /> B2B</span>
        </button>
        <button onClick={() => setSection("channel")} className={`flex-1 rounded-[12px] py-2 text-[12px] font-bold ${section === "channel" ? "bg-card text-ink shadow-sm" : "text-ink2"}`}>
          <span className="inline-flex items-center gap-1"><IconSend size={13} /> Telegram</span>
        </button>
      </div>

      {section === "channel" ? (
        <div className="space-y-3 rounded-[20px] border border-ink/18 bg-card p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink2">
            {lang === "ru" ? "📢 Публикация новости в Telegram-канал" : lang === "en" ? "📢 Publish a news post to the Telegram channel" : "📢 Yangilikni Telegram-kanalga yuborish"}
          </p>
          <input
            value={channelTitle}
            onChange={(e) => setChannelTitle(e.target.value)}
            placeholder={lang === "ru" ? "Заголовок" : lang === "en" ? "Title" : "Sarlavha"}
            className="w-full rounded-[12px] border border-ink/15 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
          />
          <textarea
            value={channelText}
            onChange={(e) => setChannelText(e.target.value)}
            placeholder={lang === "ru" ? "Текст новости..." : lang === "en" ? "News text..." : "Yangilik matni..."}
            rows={4}
            className="w-full resize-none rounded-[12px] border border-ink/15 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
          />
          {postStatus && (
            <p className={`text-[11px] font-bold ${postStatus.startsWith("✓") || postStatus.startsWith("✅") ? "text-moss" : "text-[#B3402E]"}`}>{postStatus}</p>
          )}
          <button
            onClick={async () => {
              if (!channelTitle.trim() && !channelText.trim()) {
                setPostStatus(lang === "ru" ? "Введите заголовок или текст" : "Sarlavha yoki matn kiriting");
                return;
              }
              haptic("medium");
              setPosting(true);
              setPostStatus(null);
              const { adminChannelPost } = await import("./api");
              const res = await adminChannelPost({ title: channelTitle.trim(), text: channelText.trim() });
              setPosting(false);
              if (res?.ok) {
                setPostStatus(lang === "ru" ? `✅ Опубликовано в ${res.channel || "канал"}` : lang === "en" ? `✅ Published to ${res.channel || "channel"}` : `✅ ${res.channel || "Kanalga"} chop etildi`);
                setChannelTitle("");
                setChannelText("");
                haptic("success");
              } else {
                setPostStatus(lang === "ru" ? `Ошибка: ${res?.error || "server"}` : lang === "en" ? `Error: ${res?.error || "server"}` : `Xato: ${res?.error || "server"}`);
                haptic("error");
              }
            }}
            className="press flex h-10 w-full items-center justify-center gap-2 rounded-[13px] bg-[#2AABEE] text-[13px] font-extrabold text-white"
          >
            {posting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" /> : <IconSend size={15} />}
            {posting
              ? (lang === "ru" ? "Отправка..." : lang === "en" ? "Sending..." : "Yuborilmoqda...")
              : (lang === "ru" ? "Опубликовать в Telegram" : lang === "en" ? "Publish to Telegram" : "Telegramga chop etish")}
          </button>
          <p className="text-[11px] font-semibold text-ink2">
            {lang === "ru" ? "Требуется TELEGRAM_NEWS_CHANNEL и бот с правами администратора канала." : lang === "en" ? "Requires TELEGRAM_NEWS_CHANNEL and the bot as a channel admin." : "TELEGRAM_NEWS_CHANNEL va kanal admin huquqiga ega bot kerak."}
          </p>
        </div>
      ) : section === "tips" ? (
        <div className="space-y-3">
          <p className="text-[11px] leading-snug text-ink2">
            {lang === "ru"
              ? "Блок «Советы — Журнал о чистоте и уходе» на главной и экран «Журнал ухода». Демо-картинки удалены — добавьте свои: фото, заголовок (uz/ru/en) и шаги. Пусто — блок скрыт."
              : lang === "en"
                ? "The home “Tips” block and the Care journal screen. Demo images were removed — add your own: photo, title (uz/ru/en) and steps. Empty — the block is hidden."
                : "Bosh sahifadagi «Maslahatlar» bloki va «Parvarish jurnali». Demo rasmlar o‘chirilgan — o‘zingiznikini qo‘shing: foto, sarlavha (uz/ru/en) va qadamlar. Bo‘sh — blok yashirinadi."}
          </p>

          {draft.tips.map((tip, i) => (
            <div key={tip.id} className="space-y-3 rounded-[20px] border border-ink/18 bg-card p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber font-display text-[11px] font-extrabold text-white">{i + 1}</span>
                <div className="flex gap-1.5">
                  <button onClick={() => moveTip(i, -1)} className="press rounded-[10px] bg-paper2 px-2 py-1 text-[11px] font-bold text-ink2">↑</button>
                  <button onClick={() => moveTip(i, 1)} className="press rounded-[10px] bg-paper2 px-2 py-1 text-[11px] font-bold text-ink2">↓</button>
                </div>
                <div className="flex-1" />
                <button
                  onClick={() => setDraft((prev) => ({ ...prev, tips: prev.tips.filter((_, j) => j !== i) }))}
                  className="press flex items-center gap-1 rounded-[10px] bg-[#B3402E]/10 px-2.5 py-1.5 text-[11px] font-bold text-[#B3402E]"
                >
                  <IconTrash size={12} /> {lang === "ru" ? "Удалить" : lang === "en" ? "Delete" : "O‘chirish"}
                </button>
              </div>

              <div className="flex items-start gap-3">
                <button
                  onClick={() => {}}
                  className="relative h-[74px] w-[74px] shrink-0 overflow-hidden rounded-[16px] border border-dashed border-ink/25 bg-paper2"
                >
                  {tip.image ? (
                    <img src={tip.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[9px] font-bold text-ink2">
                      {lang === "ru" ? "Фото" : "Foto"}
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(e) => uploadTipImage(i, e.target.files?.[0])}
                  />
                </button>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex gap-2">
                    <label className="flex flex-1 items-center justify-between rounded-[13px] bg-paper2/60 p-2.5 text-[11px] font-bold text-ink">
                      {lang === "ru" ? "Видео" : "Video"}
                      <input type="radio" checked={tip.kind === "video"} onChange={() => setTip(i, { kind: "video" })} />
                    </label>
                    <label className="flex flex-1 items-center justify-between rounded-[13px] bg-paper2/60 p-2.5 text-[11px] font-bold text-ink">
                      {lang === "ru" ? "Статья" : "Maqola"}
                      <input type="radio" checked={tip.kind === "article"} onChange={() => setTip(i, { kind: "article" })} />
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={tip.mins}
                      onChange={(e) => setTip(i, { mins: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })}
                      className="w-14 rounded-[13px] border border-ink/15 bg-paper px-2 text-center text-[12px] font-bold text-ink outline-none focus:border-moss"
                      title={lang === "ru" ? "Минут" : "Min"}
                    />
                  </div>
                  <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-ink2">
                    {lang === "ru" ? "Заголовок" : lang === "en" ? "Title" : "Sarlavha"}
                  </p>
                  <LocalInputs value={tip.title} onChange={(title) => setTip(i, { title })} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink2">
                  {lang === "ru" ? "Шаги (раскрываются на главной)" : lang === "en" ? "Steps (expand on the home screen)" : "Qadamlar (bosh sahifada ochiladi)"}
                </p>
                {tip.steps.map((step, j) => (
                  <div key={j} className="flex items-start gap-2">
                    <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber font-display text-[10px] font-bold text-white">{j + 1}</span>
                    <div className="min-w-0 flex-1"><LocalInputs value={step} onChange={(next) => setTip(i, { steps: tip.steps.map((s, k) => (k === j ? next : s)) })} /></div>
                    <button
                      onClick={() => setTip(i, { steps: tip.steps.filter((_, k) => k !== j) })}
                      className="press mt-1 rounded-[10px] bg-paper2 p-1.5 text-ink2"
                    >
                      <IconTrash size={12} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setTip(i, { steps: [...tip.steps, { uz: "", ru: "", en: "" }] })}
                  className="press flex h-9 w-full items-center justify-center gap-1.5 rounded-[13px] border border-dashed border-moss/40 bg-sagetint/30 text-[11px] font-bold text-pine"
                >
                  <IconPlus size={12} /> {lang === "ru" ? "Добавить шаг" : lang === "en" ? "Add step" : "Qadam qo‘shish"}
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={addTip}
            disabled={draft.tips.length >= 12}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-moss/40 bg-sagetint/30 text-[13px] font-bold text-pine disabled:opacity-40"
          >
            <IconPlus size={14} /> {lang === "ru" ? "Добавить совет" : lang === "en" ? "Add tip" : "Maslahat qo‘shish"}
          </button>
        </div>
      ) : section === "wholesale" ? (
        <div className="space-y-4 rounded-[20px] border border-ink/18 bg-card p-4">
          <label className="flex items-center justify-between rounded-[14px] bg-paper2/60 p-3 text-[12px] font-bold text-ink">
            {lang === "ru" ? "Показывать оптовый блок" : lang === "en" ? "Show wholesale block" : "Ulgurji blokni ko‘rsatish"}
            <input type="checkbox" checked={draft.wholesale.enabled} onChange={(e) => setDraft({ ...draft, wholesale: { ...draft.wholesale, enabled: e.target.checked } })} />
          </label>
          <div><p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink2">Kicker</p><LocalInputs value={draft.wholesale.kicker} onChange={(kicker) => setDraft({ ...draft, wholesale: { ...draft.wholesale, kicker } })} /></div>
          <div><p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink2">Title</p><LocalInputs value={draft.wholesale.title} onChange={(title) => setDraft({ ...draft, wholesale: { ...draft.wholesale, title } })} /></div>
          <div><p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink2">Description</p><LocalInputs value={draft.wholesale.lead} onChange={(lead) => setDraft({ ...draft, wholesale: { ...draft.wholesale, lead } })} /></div>
          <div><p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink2">Button</p><LocalInputs value={draft.wholesale.cta} onChange={(cta) => setDraft({ ...draft, wholesale: { ...draft.wholesale, cta } })} /></div>
          <div className="space-y-2"><p className="text-[10px] font-extrabold uppercase tracking-wider text-ink2">{lang === "ru" ? "Для кого" : lang === "en" ? "Audience" : "Kimlar uchun"}</p>{draft.wholesale.audiences.map((audience, i) => <LocalInputs key={i} value={audience} onChange={(next) => { const audiences = [...draft.wholesale.audiences]; audiences[i] = next; setDraft({ ...draft, wholesale: { ...draft.wholesale, audiences } }); }} />)}</div>
        </div>
      ) : section === "splash" ? (
        <div className="space-y-4 rounded-[20px] border border-ink/18 bg-card p-4">
          <div>
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink2">{lang === "ru" ? "Фото флакона на заставке" : lang === "en" ? "Splash bottle image" : "Zastavkadagi flakon rasmi"}</p>
            <img src={draft.splash.image} alt="" className="h-36 w-full rounded-[16px] bg-paper2 object-cover object-center" />
            <label className="mt-2 flex cursor-pointer items-center justify-center rounded-[13px] border border-dashed border-moss/35 bg-sagetint/40 py-2.5 text-[11px] font-bold text-pine">
              <IconCamera size={15} className="mr-1.5" /> {lang === "ru" ? "Загрузить другое фото" : lang === "en" ? "Upload another image" : "Boshqa rasm yuklash"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadSplashImage(e.target.files?.[0])} />
            </label>
            <p className="mt-1.5 text-[10px] font-medium text-ink2">JPG, PNG yoki WebP · {lang === "ru" ? "до 2 MB" : "2 MB gacha"}</p>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink2">Brand</p>
            <input value={draft.splash.brand} onChange={(e) => setDraft({ ...draft, splash: { ...draft.splash, brand: e.target.value } })} className="w-full rounded-[14px] border border-ink/15 bg-paper px-3 py-2.5 font-display text-[14px] font-bold tracking-widest text-ink outline-none" />
          </div>
          <div>
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink2">Slogan</p>
            <LocalInputs value={draft.splash.slogan} onChange={(slogan) => setDraft({ ...draft, splash: { ...draft.splash, slogan } })} />
          </div>
          <div>
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-ink2">Loading texts</p>
            <div className="space-y-3">
              {draft.splash.steps.map((step, i) => (
                <div key={i} className="rounded-[14px] bg-paper2/60 p-2.5">
                  <span className="mb-2 block text-[9px] font-bold uppercase text-ink/60">0{i + 1}</span>
                  <LocalInputs value={step} onChange={(next) => {
                    const steps = [...draft.splash.steps];
                    steps[i] = next;
                    setDraft({ ...draft, splash: { ...draft.splash, steps } });
                  }} />
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-bold text-ink2">Accent<input type="color" value={draft.splash.accent} onChange={(e) => setDraft({ ...draft, splash: { ...draft.splash, accent: e.target.value } })} className="mt-1 h-10 w-full rounded-[10px] bg-paper" /></label>
            <label className="text-[10px] font-bold text-ink2">Background<input type="color" value={draft.splash.background} onChange={(e) => setDraft({ ...draft, splash: { ...draft.splash, background: e.target.value } })} className="mt-1 h-10 w-full rounded-[10px] bg-paper" /></label>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-[20px] border border-ink/18 bg-card p-4 space-y-3">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink2">Section heading</p>
            <LocalInputs value={draft.why.kicker} onChange={(kicker) => setDraft({ ...draft, why: { ...draft.why, kicker } })} />
            <LocalInputs value={draft.why.title} onChange={(title) => setDraft({ ...draft, why: { ...draft.why, title } })} />
            <LocalInputs value={draft.why.intro} onChange={(intro) => setDraft({ ...draft, why: { ...draft.why, intro } })} />
          </div>

          {draft.why.slides.map((slide, i) => (
            <div key={slide.id} className="rounded-[20px] border border-ink/18 bg-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <img src={slide.image} alt="" className="h-16 w-16 rounded-[14px] bg-paper2 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[13px] font-bold text-ink">{slide.title[lang]}</p>
                  <p className="text-[11px] text-ink2">#{i + 1} · {slide.stat} · {slide.active ? "active" : "hidden"}</p>
                </div>
                <button onClick={() => setSlide(i, { active: !slide.active })} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${slide.active ? "bg-sagetint text-pine" : "bg-amber/8 text-ink2"}`}>
                  {slide.active ? "ON" : "OFF"}
                </button>
              </div>

              <label className="flex cursor-pointer items-center justify-center rounded-[13px] border border-dashed border-moss/35 bg-sagetint/40 py-2 text-[11px] font-bold text-pine">
                <IconCamera size={15} className="mr-1.5" /> {lang === "ru" ? "Сменить фото" : "Foto almashtirish"}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadImage(i, e.target.files?.[0])} />
              </label>
              <LocalInputs value={slide.badge} onChange={(badge) => setSlide(i, { badge })} />
              <LocalInputs value={slide.title} onChange={(title) => setSlide(i, { title })} />
              <LocalInputs value={slide.text} onChange={(text) => setSlide(i, { text })} />
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <input value={slide.stat} onChange={(e) => setSlide(i, { stat: e.target.value })} placeholder="100%" className="rounded-[13px] border border-ink/15 bg-paper px-3 py-2.5 text-[13px] font-bold text-ink outline-none" />
                <LocalInputs value={slide.statLabel} onChange={(statLabel) => setSlide(i, { statLabel })} />
              </div>
              <div className="flex gap-2">
                <button disabled={i === 0} onClick={() => moveSlide(i, -1)} className="press grid flex-1 place-items-center rounded-[12px] bg-paper2 py-2 text-ink disabled:opacity-30"><IconArrow size={14} className="-rotate-90" /></button>
                <button disabled={i === draft.why.slides.length - 1} onClick={() => moveSlide(i, 1)} className="press grid flex-1 place-items-center rounded-[12px] bg-paper2 py-2 text-ink disabled:opacity-30"><IconArrow size={14} className="rotate-90" /></button>
                <button
                  disabled={draft.why.slides.length <= 1}
                  onClick={() => setDraft({ ...draft, why: { ...draft.why, slides: draft.why.slides.filter((_, idx) => idx !== i) } })}
                  className="press flex h-9 w-11 items-center justify-center rounded-[12px] bg-[#B3402E]/10 text-[#B3402E] disabled:opacity-30"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={() => {
              const id = `why-${Date.now()}`;
              setDraft({
                ...draft,
                why: {
                  ...draft.why,
                  slides: [...draft.why.slides, {
                    id,
                    image: "images/cat-home.jpg",
                    badge: local("Yangi", "Новый", "New"),
                    title: local("Yangi slayd", "Новый слайд", "New slide"),
                    text: local("Tavsif", "Описание", "Description"),
                    stat: "+",
                    statLabel: local("fakt", "факт", "fact"),
                    active: true,
                  }],
                },
              });
            }}
            className="press flex h-11 w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-moss/35 bg-sagetint/40 text-[12px] font-bold text-pine"
          >
            <IconPlus size={14} /> {lang === "ru" ? "Добавить слайд" : "Slayd qo'shish"}
          </button>
        </div>
      )}

      <button onClick={save} disabled={saving} className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-amber text-[14px] font-bold text-white shadow-soft disabled:opacity-50">
        <IconCheck size={15} /> {saving ? "..." : lang === "ru" ? "Сохранить и опубликовать" : "Saqlash va joylash"}
      </button>
      <button onClick={() => setDraft(DEFAULT_MANAGED_CONTENT)} className="press w-full rounded-[15px] bg-paper2 py-2.5 text-[12px] font-bold text-ink2">
        {lang === "ru" ? "Вернуть стандартный контент" : "Standart kontentni qaytarish"}
      </button>
    </div>
  );
}
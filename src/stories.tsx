/**
 * DELIS — Истории (stories) на главной странице + инструменты админа для их добавления и редактирования.
 */
import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { L10n } from "./i18n";
import { useI18n } from "./i18n";
import { haptic, compressImageFile } from "./kit";
import { IconCheck, IconClose, IconPlus, IconStore, IconSymbol, IconTrash, IconUser } from "./icons";
import { createStory, deleteMyStory, fetchStories } from "./api";

/** Instagram-style: a story is visible for 24 hours, then it expires. */
const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const isFresh = (s: Story) => s.createdAt >= Date.now() - STORY_TTL_MS;

export type StoryAuthor = {
  name: string;
  nickname?: string;
  tgId?: number | string;
  phone?: string;
  role: "admin" | "customer";
};

export type Story = {
  id: string;
  title: L10n;
  desc: L10n;
  image?: string;
  mediaKind?: "image" | "video";
  emoji: string;
  gradient: string;
  productId?: string;
  promoCode?: string;
  author?: StoryAuthor;
  createdAt: number;
};

// Stories managed by the admin in /admin → Stories. Seeded once from the
// built-in defaults; afterwards persisted to localStorage and editable from
// the admin panel. Older seeds (now archived) used 1–2 day timestamps, so the
// admin could see them disappear before noticing they had to be refreshed.
const ADMIN_STORIES_KEY = "delis_admin_stories_v1";
export const ADMIN_STORIES_SEED: Story[] = [
  {
    id: "factory",
    title: { uz: "Bizning zavod", ru: "Наш завод", en: "Our factory" },
    desc: { uz: "Namangandagi ishlab chiqarish jarayoni", ru: "Процесс в Намангане", en: "Crafted in Namangan" },
    image: "images/factory.jpg",
    emoji: "🏭",
    gradient: "linear-gradient(135deg, #0a2a1b 0%, #16402e 100%)",
    productId: "wax",
    author: { name: "DELIS", role: "admin", nickname: "delis_official" },
    createdAt: Date.now() - 2 * 60 * 60 * 1000,
  },
  {
    id: "home_care",
    title: { uz: "Uy parvarishi", ru: "Уход за домом", en: "Home care" },
    desc: { uz: "Mehmondo'st tozalik sirlari", ru: "Секреты уютной чистоты", en: "Secrets of cozy clean" },
    image: "images/cat-home.jpg",
    emoji: "🏠",
    gradient: "linear-gradient(135deg, #1a3a2a 0%, #2d5a3f 100%)",
    productId: "glass",
    author: { name: "DELIS", role: "admin", nickname: "delis_official" },
    createdAt: Date.now() - 60 * 60 * 1000,
  },
  {
    id: "car_care",
    title: { uz: "Avto estetikasi", ru: "Эстетика авто", en: "Car aesthetics" },
    desc: { uz: "Chuqur yaltiroq va himoya", ru: "Глубокий блеск и защита", en: "Deep gloss & protection" },
    image: "images/cat-car.jpg",
    emoji: "✨",
    gradient: "linear-gradient(135deg, #1a1f1b 0%, #2d3a2a 100%)",
    productId: "wax",
    author: { name: "DELIS", role: "admin", nickname: "delis_official" },
    createdAt: Date.now() - 30 * 60 * 1000,
  },
  {
    id: "promo",
    title: { uz: "Maxfiy kod", ru: "Секретный код", en: "Secret code" },
    desc: { uz: "DELIS20 — 20% chegirma", ru: "DELIS20 — скидка 20%", en: "DELIS20 — 20% off" },
    image: "images/prod-glass.jpg",
    emoji: "🎁",
    gradient: "linear-gradient(135deg, #8a5a1a 0%, #e0a63c 100%)",
    promoCode: "DELIS20",
    author: { name: "DELIS", role: "admin", nickname: "delis_official" },
    createdAt: Date.now() - 5 * 60 * 1000,
  },
];

/* Backward-compat: keep exporting ADMIN_STORIES for any imports we missed. */
export const ADMIN_STORIES: Story[] = ADMIN_STORIES_SEED;

/** Load admin-managed stories from localStorage, seeding once on first run. */
export function loadAdminStories(): Story[] {
  try {
    const raw = localStorage.getItem(ADMIN_STORIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  saveAdminStories(ADMIN_STORIES_SEED);
  return ADMIN_STORIES_SEED;
}

export function saveAdminStories(list: Story[]) {
  try {
    localStorage.setItem(ADMIN_STORIES_KEY, JSON.stringify(list));
  } catch {}
}

export function loadCustomStories(): Story[] {
  try {
    const raw = localStorage.getItem("delis_custom_stories");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomStories(list: Story[]) {
  try {
    localStorage.setItem("delis_custom_stories", JSON.stringify(list.slice(0, 50)));
  } catch {}
}

export function getAllStoriesForAdmin(): { all: Story[]; customers: Story[] } {
  const custom = loadCustomStories();
  return { all: [...custom, ...ADMIN_STORIES], customers: custom };
}

function StoryRing({ story, isSeen }: { story: Story; isSeen: boolean }) {
  const isAdmin = story.author?.role === "admin";
  return (
    <div className="relative">
      <div
        className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full p-[2.5px]"
        style={{
          background: isSeen
            ? "#2a2a2a"
            : isAdmin
              ? "conic-gradient(from 0deg, #e0a63c, #3f6b52, #e0a63c)"
              : "conic-gradient(from 0deg, #4a8c5f, #e0a63c, #4a8c5f)",
        }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-full bg-[#0a0a0a] p-[2px]">
          <div className="relative h-full w-full overflow-hidden rounded-full bg-black">
            {story.image ? (
              story.mediaKind === "video" ? (
                <video src={story.image} className="h-full w-full object-cover" muted playsInline />
              ) : (
                <img src={story.image} alt="" className="h-full w-full object-cover" />
              )
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[22px]" style={{ background: story.gradient }}>
                <IconSymbol symbol={story.emoji} size={23} />
              </div>
            )}
          </div>
        </div>
        {isAdmin && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber text-[10px] font-bold ring-2 ring-black">
            <IconCheck size={11} strokeWidth={2.8} />
          </span>
        )}
        {story.author?.role === "customer" && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#2a2a2a] text-[10px] ring-2 ring-black">
            <IconUser size={11} />
          </span>
        )}
      </div>
    </div>
  );
}

export function StoriesBar({
  tgUser,
  onBuy,
  onOpenChange,
}: {
  tgUser?: { first_name?: string; username?: string; id?: number; phone?: string; phone_number?: string } | null;
  onBuy?: (productId: string) => void;
  /** Fired when the full-screen viewer opens/closes — the app hides its
      bottom navigation while a story is on screen (Telegram/IG behavior). */
  onOpenChange?: (open: boolean) => void;
}) {
  const { lang } = useI18n();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [customStories, setCustomStories] = useState<Story[]>(() => loadCustomStories());
  const [remoteStories, setRemoteStories] = useState<Story[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notify the app shell about viewer visibility (hides BottomNav etc.)
  useEffect(() => {
    onOpenChange?.(activeIndex !== null);
  }, [activeIndex, onOpenChange]);
  // Safety: never leave the nav hidden if the bar unmounts mid-story
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);

  useEffect(() => {
    void fetchStories().then((rows) => {
      if (!rows) return;
      setRemoteStories(rows.map((row) => ({
        id: row.id,
        title: { uz: row.title, ru: row.title, en: row.title },
        desc: { uz: row.description, ru: row.description, en: row.description },
        image: row.media,
        mediaKind: row.media_kind,
        emoji: row.media_kind === "video" ? "🎬" : "📸",
        gradient: "linear-gradient(135deg, #101d3d, #1f6fff)",
        author: {
          name: row.first_name || "Customer",
          nickname: row.username,
          tgId: row.tg_id,
          phone: row.phone,
          role: row.role,
        },
        createdAt: Date.parse(row.created_at) || Date.now(),
      })));
    });
  }, []);

  // Prune expired local customer stories on mount (24h TTL).
  useEffect(() => {
    const expired = customStories.filter((s) => !isFresh(s));
    if (expired.length > 0) {
      const next = customStories.filter(isFresh);
      setCustomStories(next);
      saveCustomStories(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allStories = useMemo(
    () => [...loadAdminStories(), ...remoteStories, ...customStories].filter(isFresh),
    [customStories, remoteStories],
  );

  const handleDeleteStory = (id: string) => {
    haptic("medium");
    setCustomStories((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveCustomStories(next);
      return next;
    });
    setRemoteStories((prev) => prev.filter((s) => s.id !== id));
    void deleteMyStory(id).catch(() => {});
  };

  const handleAddStory = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith("video");
    const maxBytes = isVideo ? 100_000_000 : 20_000_000;
    if (file.size > maxBytes) return;
    try {
      // Photos are compressed client-side (good quality 1600px, q0.85) so the
      // upload stays light and the app never lags on big phone-camera shots.
      // Videos are kept as-is to preserve quality.
      const img = isVideo
        ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("read_failed"));
            reader.onload = () => resolve(String(reader.result || ""));
            reader.readAsDataURL(file);
          })
        : await compressImageFile(file, 1600, 0.85);
      const newStory: Story = {
        id: `custom-${Date.now()}`,
        title: {
          uz: `${tgUser?.first_name || "Mijoz"} storysi`,
          ru: `История ${tgUser?.first_name || "клиента"}`,
          en: `${tgUser?.first_name || "Customer"}'s story`,
        },
        desc: {
          uz: "Mening DELIS tajribam",
          ru: "Мой опыт с DELIS",
          en: "My DELIS experience",
        },
        image: img,
        mediaKind: isVideo ? "video" : "image",
        emoji: isVideo ? "🎬" : "📸",
        gradient: "linear-gradient(135deg, #2d5a3f 0%, #4a8c5f 100%)",
        author: {
          name: tgUser?.first_name || "Customer",
          nickname: tgUser?.username,
          tgId: tgUser?.id,
          phone: tgUser?.phone_number || tgUser?.phone,
          role: "customer",
        },
        createdAt: Date.now(),
      };
      const next = [newStory, ...customStories];
      setCustomStories(next);
      saveCustomStories(next);
      haptic("success");
      void createStory({
        title: newStory.title[lang],
        description: newStory.desc[lang],
        media: img,
        mediaKind: newStory.mediaKind || "image",
      phone: newStory.author?.phone,
      });
    } catch {
      /* ignore read/compress errors */
    } finally {
      e.target.value = "";
    }
  };

  return (
    <>
      <div className="relative">
        <div className="no-scrollbar flex gap-3.5 overflow-x-auto px-4 py-3 min-[390px]:px-5">
          {/* Add story */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex shrink-0 flex-col items-center gap-1.5"
          >
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-dashed border-white/20 bg-white/[0.04]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black">
                <IconPlus size={20} />
              </div>
            </div>
            <span className="flex h-7 w-[76px] items-start justify-center text-center text-[11px] font-semibold leading-[1.25] text-white/60">
              {lang === "uz" ? "Qo'shish" : lang === "ru" ? "Добавить" : "Add"}
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleAddStory} />

          {allStories.map((story, idx) => (
            <button
              key={story.id}
              onClick={() => {
                haptic("light");
                setActiveIndex(idx);
              }}
              className="flex shrink-0 flex-col items-center gap-1.5"
            >
              <StoryRing story={story} isSeen={false} />
              <span className="line-clamp-2 h-7 w-[76px] text-center text-[11px] font-semibold leading-[1.25] tracking-wide text-white/70">
                {story.title[lang]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeIndex !== null && (
        <StoryViewer
          stories={allStories}
          startIndex={activeIndex}
          currentUserId={tgUser?.id}
          onClose={() => setActiveIndex(null)}
          onBuy={onBuy}
          onDeleteStory={handleDeleteStory}
        />
      )}
    </>
  );
}

function StoryViewer({
  stories,
  startIndex,
  currentUserId,
  onClose,
  onBuy,
  onDeleteStory,
}: {
  stories: Story[];
  startIndex: number;
  currentUserId?: number | string;
  onClose: () => void;
  onBuy?: (productId: string) => void;
  onDeleteStory?: (id: string) => void;
}) {
  const { lang } = useI18n();
  const [index, setIndex] = useState(startIndex);
  const story = stories[index];
  const [dragY, setDragY] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 of the current story
  const accRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef<number | null>(null);

  const STORY_MS = 6000;
  const isVideo = story.mediaKind === "video";

  const goNext = () => {
    if (index < stories.length - 1) {
      haptic("light");
      setIndex(index + 1);
    } else {
      onClose();
    }
  };
  const goPrev = () => {
    if (index > 0) {
      haptic("light");
      setIndex(index - 1);
    }
  };
  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  /* Auto-advance (Instagram-style): 6s per story, pause while holding
     the screen; videos play until the user navigates (own controls). */
  useEffect(() => {
    accRef.current = 0;
    setProgress(0);
  }, [index]);
  useEffect(() => {
    if (isVideo) return;
    const iv = window.setInterval(() => {
      if (paused) return;
      accRef.current += 100;
      const p = Math.min(1, accRef.current / STORY_MS);
      setProgress(p);
      if (p >= 1) {
        window.clearInterval(iv);
        goNextRef.current();
      }
    }, 100);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, isVideo]);

  const onTouchStart = (e: React.TouchEvent) => {
    setPaused(true);
    startYRef.current = e.touches[0].clientY;
    startXRef.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).tagName === "VIDEO") return; // let timeline scrub
    if (startYRef.current === null) return;
    const dy = e.touches[0].clientY - startYRef.current;
    const dx = e.touches[0].clientX - (startXRef.current ?? 0);
    // If mostly vertical drag down, move the whole sheet
    if (dy > 0 && Math.abs(dy) > Math.abs(dx)) {
      setDragY(dy);
    }
  };
  const onTouchEnd = () => {
    setPaused(false);
    if (dragY > 110) {
      haptic("light");
      onClose();
    } else {
      setDragY(0);
    }
    startYRef.current = null;
    startXRef.current = null;
  };

  const author = story.author;
  const isAdmin = author?.role === "admin";

  // Format date nicely
  const dateStr = new Date(story.createdAt).toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Render via a portal at document.body: the app column (max-w-[430px],
  // shadows, animations) creates its own stacking/containing context, so a
  // plain `fixed z-[95]` viewer could end up UNDER the bottom navigation
  // (z-40 sits in the root context). The portal escapes that completely.
  return createPortal(
    <div className="fixed inset-0 z-[120] flex justify-center bg-black">
      <div
        className="relative flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[#0a0a0a] will-change-transform"
        style={{ transform: `translateY(${dragY}px)`, opacity: dragY > 0 ? 1 - dragY / 400 : 1 }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Background (images/emoji only — videos live in the middle area
            so their controls are never covered by invisible nav buttons) */}
        <div className="absolute inset-0">
          {story.image && !isVideo ? (
            <img src={story.image} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : !story.image ? (
            <div className="flex h-full w-full items-center justify-center" style={{ background: story.gradient }}>
              <span className="text-white/30"><IconSymbol symbol={story.emoji} size={120} /></span>
            </div>
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/60" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent" />
        </div>

        {/* Top bar: progress + header (own layer, above the nav zone) */}
        <div className="relative z-30 p-3 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
          {/* Progress bars — current one fills in real time */}
          <div className="mb-3 flex gap-1">
            {stories.map((_, i) => (
              <div key={i} className="h-[2px] flex-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full bg-white"
                  style={{ width: i < index ? "100%" : i === index ? (isVideo ? "100%" : `${progress * 100}%`) : "0%" }}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative h-9 w-9 overflow-hidden rounded-full bg-white/15 ring-1 ring-white/20">
                {story.image ? (
                  <img src={story.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center" style={{ background: story.gradient }}>
                    <IconSymbol symbol={story.emoji} size={18} />
                  </div>
                )}
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[14px] font-bold leading-tight text-white">
                  {author?.name || "DELIS"}
                  {isAdmin && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber text-black"><IconCheck size={9} strokeWidth={2.8} /></span>}
                </p>
                <p className="text-[11px] font-medium leading-tight text-white/60">
                  {author?.nickname ? `@${author.nickname}` : isAdmin ? "Rasmiy · Official" : "Mijoz · Customer"} · {dateStr}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Owner can delete their own story (Instagram-style) */}
              {author?.role === "customer" && Number(author?.tgId) === Number(currentUserId) && (
                <button
                  onClick={() => {
                    haptic("medium");
                    onDeleteStory?.(story.id);
                    onClose();
                  }}
                  aria-label="Delete story"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[#ff6b6b] backdrop-blur-md"
                >
                  <IconTrash size={15} />
                </button>
              )}
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md"
              >
                <IconClose size={15} />
              </button>
            </div>
          </div>

          {/* If customer story — show contact info small for admin reference */}
          {author?.role === "customer" && (
            <div className="mt-3 rounded-[12px] bg-white/10 px-3 py-2 text-[11px] font-medium text-white/70 backdrop-blur-md">
              ID: {author.tgId || "—"} · {author.phone || "tel yo'q"} · {author.nickname ? `@${author.nickname}` : "nick yo'q"}
            </div>
          )}
        </div>

        {/* Middle zone — the ONLY tap area: nothing is placed above it,
            so bottom buttons can never be shadowed by invisible zones.
            For videos the area holds the player itself (full controls). */}
        <div className="relative z-10 flex min-h-0 flex-1">
          {isVideo ? (
            <video src={story.image} controls autoPlay playsInline className="h-full w-full bg-black object-contain" />
          ) : (
            <>
              <button aria-label="prev" onClick={goPrev} className="h-full w-[35%]" />
              <button aria-label="next" onClick={goNext} className="h-full flex-1" />
            </>
          )}
        </div>

        {/* Bottom content (own layer — always fully tappable) */}
        <div className="relative z-30 p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
          <div className="flex items-end gap-3">
            <span className="text-white"><IconSymbol symbol={story.emoji} size={34} /></span>
            <div>
              <h3 className="font-display text-[20px] font-bold leading-tight text-white">{story.title[lang]}</h3>
              <p className="mt-1 max-w-[280px] text-[14px] font-medium leading-snug text-white/70">{story.desc[lang]}</p>
            </div>
          </div>

          {story.productId && (
            <button
              onClick={() => {
                haptic("success");
                onBuy?.(story.productId!);
                onClose();
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-[18px] bg-amber py-3.5 text-[15px] font-bold text-white shadow-lift"
            >
              <IconStore size={18} /> {lang === "uz" ? "Sotib olish" : lang === "ru" ? "Купить" : "Shop now"}
            </button>
          )}

          {story.promoCode && (
            <div className="mt-4 rounded-[16px] border border-white/15 bg-white/10 p-3.5 text-center backdrop-blur-md">
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">Promo code</p>
              <p className="mt-1 font-display text-[20px] font-bold tracking-wide text-amber">{story.promoCode}</p>
            </div>
          )}

          <p className="mt-4 text-center text-[11px] font-medium text-white/40">
            {lang === "uz" ? "Chap / o'ng bosing — o'tish · Ushlab turing — pauza · Pastga — yopish" : lang === "ru" ? "Тап влево/вправо — листание · Удержание — пауза · Вниз — закрыть" : "Tap left/right to navigate · Hold to pause · Swipe down to close"}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

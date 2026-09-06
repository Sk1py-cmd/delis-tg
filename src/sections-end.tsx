/**
 * DELIS — Нижние секции главной страницы: оптовая продажа, новости и футер.
 */
import { useState } from "react";
import { useI18n } from "./i18n";
import { CONFIG } from "./config";
import { useSiteSettings, phoneHref, mailHref, tgHref } from "./site-settings";
import { NEWS } from "./data";
import { haptic, Reveal } from "./kit";
import {
  IconBank,
  IconCheck,
  IconChevron,
  IconClock,
  IconInstagram,
  IconMail,
  IconPhone,
  IconPin,
  IconPlay,
  IconSend,
  IconSparkle,
  IconTelegram,
  IconYoutube,
} from "./icons";
import { SectionHead } from "./chrome";
import { LangPill } from "./sections-home";
import { useManagedContent } from "./content-config";
import { BrandLockup } from "./brand";

/* ---------------- 7 · Wholesale ---------------- */

export function Wholesale({ onPartner, onBankDetails }: { onPartner: () => void; onBankDetails?: () => void }) {
  const { t, lang } = useI18n();
  const content = useManagedContent();
  const bullets = ["wsB1", "wsB2", "wsB3"] as const;
  const wholesale = content.wholesale;
  const audiences = wholesale.audiences.map((audience) => audience[lang]);
  if (!wholesale.enabled) return null;
  return (
    <section className="px-4 pt-12 min-[390px]:px-5">
      <Reveal>
        <div className="relative overflow-hidden rounded-[32px] bg-[#30253e] p-5 min-[390px]:p-7 text-white shadow-soft">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#94c7b4]/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 bottom-0 h-40 w-40 rounded-full bg-[#638872]/25 blur-3xl" />
          <p className="relative text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#c3c88c]">{wholesale.kicker[lang]}</p>
          <h2 className="relative mt-3 font-display text-[24px] font-bold leading-tight tracking-tight text-white">
            {wholesale.title[lang]}
          </h2>
          <p className="relative mt-2.5 max-w-[300px] text-[14px] font-medium leading-relaxed text-white/70">
            {wholesale.lead[lang]}
          </p>
          <div className="relative mt-5 flex flex-wrap gap-2">
            {audiences.map((audience) => (
              <span key={audience} className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white/90 backdrop-blur-sm">
                {audience}
              </span>
            ))}
          </div>
          <ul className="relative mt-6 space-y-2.5">
            {bullets.map((b, i) => (
              <Reveal key={b} delay={i * 90}>
                <li className="flex items-center gap-2.5 text-[14px] font-semibold text-white/90">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#c3c88c]/20 text-[#c3c88c]">
                    <IconCheck size={11} strokeWidth={2.4} />
                  </span>
                  {t(b)}
                </li>
              </Reveal>
            ))}
          </ul>
          <Reveal delay={200}>
            <button
              onClick={onPartner}
              className="press mt-7 w-full rounded-[18px] bg-[#638872] py-4 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(99,136,114,0.3)] hover:brightness-105"
            >
              {wholesale.cta[lang]}
            </button>
            {onBankDetails && (
              <button
                onClick={onBankDetails}
                className="press mt-3 w-full rounded-[18px] border border-white/20 py-3.5 text-[13px] font-bold text-white/85 hover:bg-white/10"
              >
                <span className="inline-flex items-center gap-1.5"><IconBank size={16} /> {t("bankDetails")}</span>
              </button>
            )}
            <p className="mt-3 text-center text-[11px] font-semibold text-white/50">{t("wsNote")}</p>
          </Reveal>
        </div>
      </Reveal>
    </section>
  );
}

/* ---------------- 8 · News & Tips ---------------- */

export function News() {
  const { t, lang } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section className="pt-12">
      <div className="px-4 min-[390px]:px-5">
        <SectionHead title={t("newsTitle")} sub={t("newsSub")} />
      </div>
      <div className="mt-6 space-y-3 px-4 min-[390px]:px-5">
        {NEWS.map((n, i) => {
          const open = openId === n.id;
          return (
            <Reveal key={n.id} delay={i * 70}>
              <div className="overflow-hidden rounded-[24px] border border-ink/18 bg-card shadow-sm">
                <button
                  onClick={() => { haptic("light"); setOpenId(open ? null : n.id); }}
                  className="flex w-full items-center gap-3.5 p-3.5 text-left"
                >
                  <img src={n.cover} alt="" className="h-[74px] w-[74px] shrink-0 rounded-[18px] object-cover" />
                  <div className="min-w-0 flex-1">
                    <span className="rounded-full bg-sagetint px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-pine">
                      {n.tag?.[lang] ?? ""}
                    </span>
                    <h3 className="mt-1.5 text-[14px] font-bold leading-snug text-ink">{n.title[lang]}</h3>
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-ink/60">
                      <IconPlay size={10} />
                      {t("tipSteps")} · {n.steps?.length ?? 0}
                    </p>
                  </div>
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper2 text-ink transition-transform duration-400 ${
                      open ? "rotate-90" : ""
                    }`}
                  >
                    <IconChevron size={14} />
                  </span>
                </button>
                <div
                  className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
                >
                  <div className="min-h-0">
                    <div className="border-t border-ink/15 px-4 py-4">
                      <ol className="space-y-3.5">
                        {n.steps?.map((st, j) => (
                          <li key={j} className="flex gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber font-display text-[11px] font-bold text-white">
                              {j + 1}
                            </span>
                            <p className="pt-0.5 text-[13px] font-medium leading-relaxed text-ink2">{st[lang]}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- 9 · Footer ---------------- */

export function Footer({
  onNavigate,
}: {
  onNavigate?: (screen: "faq" | "about" | "blog" | "production" | "careers" | "delivery" | "returns") => void;
}) {
  const { t } = useI18n();
  const site = useSiteSettings();
  const contacts = [
    { icon: IconPhone, label: site.supportPhone, href: phoneHref(site.supportPhone) },
    ...(site.supportPhone2 ? [{ icon: IconPhone, label: site.supportPhone2, href: phoneHref(site.supportPhone2) }] : []),
    /* Часы работы поддержки — редактируются из админки (вкладка «Сайт»). */
    { icon: IconClock, label: `${t("footerSupportHours")}: ${site.supportHours}`, href: "" },
    { icon: IconSend, label: CONFIG.BOT_LINK.replace("https://", ""), href: CONFIG.BOT_LINK },
    ...(site.supportEmail ? [{ icon: IconMail, label: site.supportEmail, href: mailHref(site.supportEmail) }] : []),
    { icon: IconPin, label: t("address"), href: "" },
  ];
  const support = ["linkFaq", "linkDelivery", "linkReturns"] as const;
  const company = ["linkAbout", "linkProduction", "linkCareers"] as const;
  const socials = [
    { icon: IconTelegram, href: site.telegram || tgHref(site.supportTg), label: "Telegram" },
    ...(site.instagram ? [{ icon: IconInstagram, href: site.instagram, label: "Instagram" }] : []),
    ...(site.youtube ? [{ icon: IconYoutube, href: site.youtube, label: "YouTube" }] : []),
  ];

  return (
    <footer className="relative mt-16 overflow-hidden border-t border-ink/6 bg-paper text-ink">
      <div className="noise-layer" />
      <div className="relative px-4 pb-10 pt-12 min-[390px]:px-5">
        <Reveal>
          <BrandLockup className="h-auto w-[280px] max-w-[78vw] dark:invert" />
          <p className="mt-3 text-[14px] font-semibold text-ink/70">{t("footerTag")}</p>
        </Reveal>

        {/* Subscribe to the news channel — shown when the admin set a Telegram link */}
        {site.telegram && (
          <Reveal>
            <a
              href={site.telegram}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => haptic("medium")}
              className="press mt-6 flex items-center gap-3 rounded-[18px] border border-[#2AABEE]/30 bg-[#2AABEE]/[0.07] p-3.5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2AABEE] text-white shadow-sm">
                <IconSend size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[14px] font-black text-ink">{t("footerSubscribe")}</span>
                <span className="block text-[11px] font-semibold text-ink/65">{t("footerSubscribeSub")}</span>
              </span>
              <IconChevron size={16} className="shrink-0 text-[#2AABEE]" />
            </a>
          </Reveal>
        )}

        <div className="mt-11">
          <Reveal>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-ink/45">
              {t("footerContacts")}
            </p>
          </Reveal>
          <div className="mt-4 space-y-2.5">
            {contacts.map((c, i) => (
              <Reveal key={c.label} delay={i * 70}>
                {c.href ? (
                  <a href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="press group flex items-center gap-3.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/12 bg-amber/5 text-amber transition-colors group-hover:bg-amber group-hover:text-white">
                      <c.icon size={17} />
                    </span>
                    <span className="text-[14px] font-semibold text-ink/90">{c.label}</span>
                  </a>
                ) : (
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/12 bg-amber/5 text-amber">
                      <c.icon size={17} />
                    </span>
                    <span className="text-[14px] font-semibold text-ink/90">{c.label}</span>
                  </div>
                )}
              </Reveal>
            ))}
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-8">
          <div>
            <Reveal>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-ink/45">
                {t("footerSupport")}
              </p>
            </Reveal>
            <ul className="mt-4 space-y-2.5">
              {support.map((s) => (
                <li key={s}>
                  <button
                    onClick={() => {
                      haptic("light");
                      if (s === "linkFaq") onNavigate?.("faq");
                      else if (s === "linkDelivery") onNavigate?.("delivery");
                      else if (s === "linkReturns") onNavigate?.("returns");
                    }}
                    className="text-[14px] font-semibold text-ink/75 transition-colors hover:text-amber"
                  >
                    {t(s)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Reveal delay={80}>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-ink/45">
                {t("footerCompany")}
              </p>
            </Reveal>
            <ul className="mt-4 space-y-2.5">
              {company.map((s) => (
                <li key={s}>
                  <button
                    onClick={() => {
                      haptic("light");
                      onNavigate?.(
                        s === "linkAbout" ? "about" : s === "linkProduction" ? "production" : "careers"
                      );
                    }}
                    className="text-[14px] font-semibold text-ink/75 transition-colors hover:text-amber"
                  >
                    {t(s)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex items-center gap-3">
          {socials.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              aria-label={s.label}
              className="press flex h-11 w-11 items-center justify-center rounded-full border border-ink/12 bg-amber/5 text-ink/80 transition-colors hover:bg-amber hover:text-white"
            >
              <s.icon size={18} />
            </a>
          ))}
          <span className="ml-2">
            <LangPill />
          </span>
        </div>

        <div className="mt-10 border-t border-ink/10 pt-6">
          <p className="text-[11px] font-medium text-ink/45">{t("rights")}</p>
          <p className="mt-2 flex items-center gap-2 text-[12px] font-bold text-ink/70">
            {t("madeIn")} <span aria-hidden>🇺🇿</span>
            <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-ink/40">
              <IconSparkle size={10} className="text-amber/70" />
              Telegram Mini App
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}

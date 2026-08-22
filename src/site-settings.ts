/**
 * DELIS — контакты и соцсети, редактируемые из админки (вкладка «Сайт»).
 *
 * Приоритет: значения с сервера (админка) → localStorage → CONFIG (src/config.ts).
 * Конфиг остаётся источником дефолтов и «юридических» полей, а контакты
 * можно менять без релиза — после сохранения футер и кнопки связи
 * обновляются у всех клиентов сразу (и у оффлайн-версии — при след. входе).
 */

import { useEffect, useState } from "react";
import { CONFIG } from "./config";
import { fetchSiteSettings, adminSaveSiteSettings } from "./api";

export type SiteSettings = {
  supportPhone: string;
  supportPhone2: string;
  supportEmail: string;
  supportTg: string;    // @username (или полная t.me-ссылка)
  telegram: string;     // канал (пусто = скрыт)
  instagram: string;    // пусто = скрыт
  youtube: string;      // пусто = скрыт
};

const STORAGE_KEY = "delis.siteSettings";
const EVENT_NAME = "delis:site-settings";

function defaults(): SiteSettings {
  return {
    supportPhone: CONFIG.SUPPORT_PHONE,
    supportPhone2: CONFIG.SUPPORT_PHONE_2,
    supportEmail: CONFIG.SUPPORT_EMAIL,
    supportTg: CONFIG.SUPPORT_TG,
    telegram: CONFIG.SOCIALS.telegram,
    instagram: CONFIG.SOCIALS.instagram,
    youtube: CONFIG.SOCIALS.youtube,
  };
}

function normalize(raw: unknown): SiteSettings {
  const d = defaults();
  if (typeof raw !== "object" || raw === null) return d;
  const r = raw as Record<string, unknown>;
  const pick = (k: keyof SiteSettings) => (typeof r[k] === "string" ? (r[k] as string) : d[k]);
  return {
    supportPhone: pick("supportPhone"),
    supportPhone2: pick("supportPhone2"),
    supportEmail: pick("supportEmail"),
    supportTg: pick("supportTg"),
    telegram: pick("telegram"),
    instagram: pick("instagram"),
    youtube: pick("youtube"),
  };
}

export function loadSiteSettings(): SiteSettings {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
  } catch {
    return defaults();
  }
}

function publish(settings: SiteSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* localStorage переполнен — сервер всё равно сохранит */ }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: settings }));
}

export async function saveSiteSettings(settings: SiteSettings) {
  publish(settings);
  await adminSaveSiteSettings(settings);
  return settings;
}

/** Подтянуть актуальные настройки с сервера (при старте и после правок). */
export async function syncSiteSettings() {
  const remote = await fetchSiteSettings();
  if (remote) publish(normalize(remote));
}

export function useSiteSettings(): SiteSettings {
  const [settings, setSettings] = useState<SiteSettings>(loadSiteSettings);
  useEffect(() => {
    const onUpdate = (e: Event) => setSettings(normalize((e as CustomEvent<SiteSettings>).detail));
    window.addEventListener(EVENT_NAME, onUpdate);
    void syncSiteSettings();
    return () => window.removeEventListener(EVENT_NAME, onUpdate);
  }, []);
  return settings;
}

/* Производные значения (единая логика ссылок). */
export const phoneHref = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;
export const mailHref = (e: string) => `mailto:${e}`;
/** @user или t.me/user → https://t.me/user */
export const tgHref = (h: string) =>
  h.startsWith("http") ? h : `https://t.me/${h.replace(/^@/, "")}`;

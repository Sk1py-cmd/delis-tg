/**
 * DELIS — админ-вкладка «Сайт»: контакты и соцсети без релиза.
 * Сохраняет в content_settings (key "site_settings") на сервере.
 */

import { useState } from "react";
import { useI18n } from "./i18n";
import { haptic } from "./kit";
import { useSiteSettings, saveSiteSettings, type SiteSettings } from "./site-settings";

function Field({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ink2">{label}</p>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[14px] border border-ink/15 bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-moss"
      />
      {hint && <p className="mt-1 text-[10px] leading-snug text-ink2/90">{hint}</p>}
    </div>
  );
}

export function SiteSettingsTab({ onToast }: { onToast: (message: string) => void }) {
  const { lang } = useI18n();
  const current = useSiteSettings();
  const [draft, setDraft] = useState<SiteSettings>(current);
  const [saving, setSaving] = useState(false);
  const ru = lang === "ru";

  const save = async () => {
    setSaving(true);
    haptic("medium");
    await saveSiteSettings(draft);
    setSaving(false);
    haptic("success");
    onToast(ru ? "Контакты сайта сохранены ✓" : "Kontaktlar saqlandi ✓");
  };

  const reset = () => {
    haptic("light");
    setDraft(current);
    onToast(ru ? "Изменения отменены" : "O'zgarishlar bekor qilindi");
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(current);

  return (
    <div className="space-y-3 animate-pop">
      <p className="text-[11px] leading-snug text-ink2">
        {ru
          ? "Эти контакты показываются в футере и кнопках связи. Пустое поле соцсети — иконка скрыта."
          : "Bu kontaktlar futterda va aloqa tugmalarida ko'rsatiladi. Bo'sh ijtimoiy tarmoq — belgi yashirinadi."}
      </p>

      <div className="space-y-4 rounded-[20px] border border-ink/18 bg-card p-4">
        <Field
          label={ru ? "Телефон поддержки" : "Qo'llab-quvvatlash telefoni"}
          value={draft.supportPhone}
          placeholder="+998 88 044-66-55"
          onChange={(v) => setDraft({ ...draft, supportPhone: v })}
        />
        <Field
          label={ru ? "Телефон 2 (необязательно)" : "Telefon 2 (ixtiyoriy)"}
          hint={ru ? "Пусто — второй номер не показывается." : "Bo'sh — ikkinchi raqam ko'rsatilmaydi."}
          value={draft.supportPhone2}
          placeholder="+998 94 331-64-64"
          onChange={(v) => setDraft({ ...draft, supportPhone2: v })}
        />
        <Field
          label="Email"
          value={draft.supportEmail}
          placeholder="hello@delis.uz"
          onChange={(v) => setDraft({ ...draft, supportEmail: v })}
        />
        <Field
          label={ru ? "Telegram менеджера" : "Menejerning Telegrami"}
          hint={ru ? "@username или https://t.me/... — куда клиенты пишут в поддержку." : "@username yoki https://t.me/... — mijozlar yozadigan manzil."}
          value={draft.supportTg}
          placeholder="@delis_care"
          onChange={(v) => setDraft({ ...draft, supportTg: v })}
        />
      </div>

      <div className="space-y-4 rounded-[20px] border border-ink/18 bg-card p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink2">
          {ru ? "Соцсети (пусто = скрыто)" : "Ijtimoiy tarmoqlar (bo'sh = yashirin)"}
        </p>
        <Field
          label={ru ? "Telegram-канал" : "Telegram-kanal"}
          hint={ru ? "Например https://t.me/delis_uz. Пусто — показываем ссылку на бота." : "Masalan https://t.me/delis_uz. Bo'sh — bot havolasi ko'rsatiladi."}
          value={draft.telegram}
          placeholder="https://t.me/…"
          onChange={(v) => setDraft({ ...draft, telegram: v })}
        />
        <Field
          label="Instagram"
          value={draft.instagram}
          placeholder="https://instagram.com/…"
          onChange={(v) => setDraft({ ...draft, instagram: v })}
        />
        <Field
          label="YouTube"
          value={draft.youtube}
          placeholder="https://youtube.com/@…"
          onChange={(v) => setDraft({ ...draft, youtube: v })}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="flex-1 rounded-[16px] bg-moss py-3 text-[13px] font-bold text-white transition disabled:opacity-40"
        >
          {saving ? (ru ? "Сохранение…" : "Saqlanmoqda…") : ru ? "Сохранить" : "Saqlash"}
        </button>
        {dirty && (
          <button
            onClick={reset}
            className="rounded-[16px] border border-ink/18 bg-card px-4 text-[13px] font-bold text-ink2"
          >
            {ru ? "Сброс" : "Bekor"}
          </button>
        )}
      </div>
    </div>
  );
}

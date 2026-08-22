/**
 * DELIS — центральный конфиг приложения.
 *
 * Меняйте значения здесь — не ищите их по коду.
 */

export const CONFIG = {
  /** Юридическое имя продавца (в счетах/чеках; «DELIS» — бренд).
   *  Перед live-запуском владелец обязан подтвердить форму MChJ/YTT и реквизиты
   *  по PRODUCTION_OWNER_ACTIONS.md. */
  COMPANY_NAME: "\"DELIS GROUP\" MChJ",
  COMPANY_NAME_SHORT: "\"DELIS GROUP\" MChJ",

  /** Реквизиты для фискального чека и B2B-счёта.
   *  Они не считаются юридически подтверждёнными до подписи владельца. */
  REQUISITES: {
    inn: "313151138",
    mfo: "01125",
    account: "2020 8000 2074 9608 3001",
    bank: "Xalq banki, To'raqo'rg'on filiali",
    address: "Namangan viloyati, To'raqo'rg'on tumani, Yuqori Mo'g'ultoy MFY, Alisher Navoiy ko'chasi, 5-uy",
    director: "Xonkeldiyev Murodjon Mirzaxmadovich",
  },

  /** Порог бесплатной доставки (сум). Дублируется на сервере (FREE_SHIPPING_THRESHOLD). */
  FREE_SHIPPING_THRESHOLD: 150_000,

  /** КОНТАКТЫ поддержки.
   *  Телефон — реальный (от заказчика). TG-менеджер/почта — ⚠️ заглушки, заменить. */
  SUPPORT_PHONE: "+998 88 044-66-55",
  SUPPORT_PHONE_LINK: "tel:+998880446655",
  /** Второй номер поддержки (показывается в футере и в боте /support). */
  SUPPORT_PHONE_2: "+998 94 331-64-64",
  SUPPORT_PHONE_2_LINK: "tel:+998943316464",
  SUPPORT_TG: "@Sk1py",
  SUPPORT_TG_LINK: "https://t.me/Sk1py",
  SUPPORT_EMAIL: "hello@delis.uz",
  /** Бот — реальный (создан в @BotFather заказчиком). */
  BOT_LINK: "https://t.me/delisgroup_bot",
  BOT_USERNAME: "delisgroup_bot",

  /** Соцсети. Пустая строка = скрыто в футере. Заказчику: добавьте ссылки,
   *  когда заведёте страницы — или прямо из админки (вкладка «Сайт»). */
  SOCIALS: {
    telegram: "https://t.me/delisgroup_bot",
    instagram: "", // пока нет — скрыто
    youtube: "",   // пока нет — скрыто
  },

  /** Payme/Click merchant IDs and all secrets are configured only on the
   * backend at runtime. The API returns a hosted payment URL after it has
   * atomically created the order, so frontend rebuilds are not required. */

  /** 1 ⭐ программы лояльности = 100 сум. */
  STARS_VALUE_SOUM: 100,
};

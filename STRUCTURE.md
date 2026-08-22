# DELIS — карта проекта (что, где и зачем)

Проект — **Telegram Mini App** интернет-магазина бытовой химии и авто-ухода
с бэкендом, админ-панелью, ботом и онлайн-оплатой.

```
React + Vite (фронтенд, собирается в ОДИН index.html)
        │  /v1/...
        ▼
Fastify + SQLite (бэкенд)  ←→  Telegram Bot (уведомления)
        │
        ▼
  Supabase (бэкапы БД + картинки)
```

---

## 1. Быстрый старт понимания кода — 4 главных файла

Прочитайте их в таком порядке — и картина сложится:

| Файл | Что делает |
|---|---|
| `src/config.ts` | **Публичные настройки** интерфейса: реквизиты и контакты. Платежи настраиваются server-side. |
| `src/data.ts` | **Данные**: товары, категории, промокоды, доставка + localStorage. База для всех экранов. |
| `src/api.ts` | **Мост к серверу**: запросы `/v1/...`, Telegram-авторизация и безопасная обработка ошибок сети. |
| `src/App.tsx` | **Дирижёр**: собирает экраны, держит состояние (пользователь, корзина, язык), роутинг. |

---

## 2. Фронтенд — что лежит где

### Вход и инфраструктура
| Файл | Назначение |
|---|---|
| `src/main.tsx` | Точка входа — монтирует React в `#root`. |
| `src/App.tsx` | Корневой компонент, состояние и переключение экранов. |
| `src/i18n.tsx` | Переводы на **uz / ru / en** (React Context + `useI18n()`). |
| `src/config.ts` | Публичные настройки интерфейса (реквизиты, контакты). |
| `src/api.ts` | HTTP-клиент к бэкенду (`/v1/...`). |
| `src/kit.tsx` | Утилиты: Telegram (initData, вибрация, оплата), формат цен, анимации. |
| `src/icons.tsx` | Единая система **Phosphor Duotone** + фирменные Graphite Digital glyphs для Loyalty/Stars. Старые emoji-идентификаторы переводятся через `IconSymbol`. |
| `src/index.css` | Глобальные стили (Tailwind v4), micro-interactions и motion-система `.motion-surface` / `.motion-icon-tile`. |
| `src/utils/cn.ts` | Хелпер склейки CSS-классов. |

Иконки не рисуются заново внутри компонентов: используйте экспорт из
`src/icons.tsx`. Интерактивная анимация уже назначается по семантике иконки
(`bag`, `bell`, `qr`, `sparkle` и т.д.). Постоянные Graphite-анимации отключаются
через системный `prefers-reduced-motion`.

### Экраны
| Файл | Экран |
|---|---|
| `src/screen-catalog.tsx` | Каталог: сетка, фильтры, сортировка. |
| `src/screen-product.tsx` | Карточка товара. |
| `src/screen-extras.tsx` | Лоадер, FAQ, «О нас», hero-слайдер и т.п. |
| `src/thank-you.tsx` | «Спасибо за заказ». |

### Секции главной страницы (по порядку от верха к низу)
| Файл | Что содержит |
|---|---|
| `src/sections-home.tsx` | Приветствие, hero, инструменты, акция дня, бегущая строка. |
| `src/sections-mid.tsx` | Витрина, «Почему мы», акции. |
| `src/sections-end.tsx` | Опт, новости, футер. |

### «Каркас» интерфейса
| Файл | Назначение |
|---|---|
| `src/chrome.tsx` | Верхняя панель, нижняя навигация, тосты, заголовки. |
| `src/overlays.tsx` | Выдвижные панели: корзина, заказы, профиль, лояльность. |
| `src/checkout-modal.tsx` | **Поток заказа**: корзина → доставка → оплата → успех. |

### Отдельные функции (панели / оверлеи)
| Файл | Назначение |
|---|---|
| `src/features-admin.tsx` | Админ-панель (главная точка входа админа). |
| `src/features-admin-extra.tsx` | Доп. вкладки админки (QR-партии, B2B, сертификаты). |
| `src/features-hub.tsx` | Лояльность, бейджи, уведомления на главной. |
| `src/features-sales.tsx` | Калькулятор, квиз, подписки, B2B. |
| `src/features-power.tsx` | Конструктор подарков, сравнение, QR-сканер. |
| `src/features-smart2.tsx` | Отслеживание заказа, рекомендации. |
| `src/features-extra.tsx` | Адресная книга, возвраты, ежедневная награда. |
| `src/features-service.tsx` | Заказ в 1 клик, счёт, чат с менеджером. |
| `src/features-finish.tsx` | Онбординг-подсказки, экспорт, реквизиты. |
| `src/features-improvements.tsx` | Оптовые бейджи, брошенная корзина, XLSX-экспорт, акции. |
| `src/features-convenience.tsx` | CSV-экспорт, PDF-счёт, журнал операций, аудит. |
| `src/features-legal-waitlist.tsx` | Документы, лист ожидания, рефералка, оплата. |
| `src/features-bundles.tsx` | Наборы товаров. |
| `src/features-help.tsx` | Перевод статусов, уведомления в боте. |

### Остальные панели и блоки
`bundles.tsx`, `gift-certificate.tsx`, `group-order.tsx`, `manager-chat.tsx`,
`loyalty-card.tsx`, `quiz.tsx`, `recently-viewed.tsx`, `reviews.tsx`,
`saved-cards.tsx`, `stars-shop.tsx`, `wheel.tsx`, `stories.tsx`,
`global-search.tsx`, `admin-push.tsx`.

### Админка и контент
| Файл | Назначение |
|---|---|
| `src/site-settings.ts` | Настройки сайта (телефоны и т.п.), локально + сервер. |
| `src/site-settings-tab.tsx` | Вкладка админки «Сайт». |
| `src/content-config.tsx` | Редактируемый контент (тексты), синхронизация с сервером. |
| `src/loyalty-card.tsx` | Graphite Digital карта, QR, миссии и transaction stream. |
| `src/loyalty-admin.tsx` | Сканер карты, поиск клиента, ручные операции и правила loyalty. |

---

## 3. Бэкенд (`server/`)

| Файл | Назначение |
|---|---|
| `server/src/index.ts` | **Fastify API**: эндпоинты `/v1/...`, runtime payment URLs и статическая раздача frontend. |
| `server/src/bot.ts` | **Telegram-бот**: уведомления о заказах, /support. |
| `server/src/auth.ts` | Проверка Telegram `initData` (авторизация). |
| `server/src/db.ts` | SQLite-база: подключение, checkpoint. |
| `server/src/pricing.ts` | Расчёт цен (опт, промо). |
| `server/src/seed.ts` | Начальные данные (сид). |
| `server/src/seed-runner.ts` | Запуск сида при старте. |
| `server/src/supabase-store.ts` | Supabase: бэкапы БД + загрузка картинок. |

---

## 4. Как устроен «вес» проекта

| Часть | Размер | Комментарий |
|---|---|---|
| Сборка (bundle) | **1,66 МБ** (gzip **445 КБ**) | JS/CSS встроены в один `index.html` через `vite-plugin-singlefile`. |
| `src/` | ~1,5 МБ | Код фронтенда, включая Graphite Digital loyalty UI. |
| `public/` | ~2,3 МБ | Изображения, квадратные PWA-иконки, service worker и manifest. |
| `server/src/` | ~480 КБ | Fastify API, бот, SQLite-миграции и 156 тестов. |

**Совет по оптимизации:** картинки в `public/` — почти половина проекта.
Перевод в WebP/AVIF и ужатие дадут самый заметный выигрыш в скорости.

---

## 5. Правило «что куда класть»

- **Публичные настройки** (телефоны, реквизиты) → `src/config.ts`; **Payme/Click** → только server environment.
- **Переводы** → только в `src/i18n.tsx` (ничего не хардкодить в тексте).
- **Данные товаров/доставки** → `src/data.ts` (на сервере — `server/src/seed.ts`).
- **Запросы к серверу** → только через `src/api.ts`.
- **Новая панель/функция** → новый файл `src/features-*.tsx`, подключить в `App.tsx`.
- **Новая секция главной** → в `src/sections-*.tsx`.
- **Переиспользуемый компонент/утилита** → `src/kit.tsx` или отдельный файл.

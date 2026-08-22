# 🔍 DELIS — Архивный аудит проекта (от А до Я)

> Этот снимок описывает состояние на дату ниже, до последующих исправлений.
> Актуальные команды и настройки: `DELIS_LAUNCH_GUIDE.md`,
> `PAYMENTS_SETUP.md`, `DEPLOY_CHECKLIST.md`.

**Дата:** 2026-08-11
**Статус кода:** исходный код + правки цвета (тёмно-зелёный акцент)

---

## 1. ✅ ЧТО РАБОТАЕТ

| Компонент | Статус | Детали |
|---|---|---|
| Фронтенд dev-сервер (`:5173`) | ✅ | HTTP 200, приложение открывается |
| Бэкенд API (`:3001`) | ✅ | `/health` → `{ok:true}` |
| Связка фронт→бэкенд | ✅ | vite-прокси `/v1/...` работает (same-origin) |
| Сборка (`npm run build`) | ✅ | `dist/index.html` 1.17 МБ (gzip 326 КБ) |
| Typecheck фронт (`tsc`) | ✅ | 0 ошибок |
| Typecheck бэкенд (`tsc`) | ✅ | 0 ошибок |
| Тесты фронтенда | ✅ | **15 passed** |
| Тесты бэкенда | ✅ | **94 passed** |
| БД (SQLite) | ✅ | 23 таблицы, 8 товаров, 4 промо-кода |
| Изображения товаров | ✅ | все файлы на месте |
| Промокоды | ✅ | DELIS15, WELCOME10, FREESHIP, UZB2026 валидны |
| Публичные API | ✅ | products, content, stories, site-settings, delivery-config, wholesale-tiers, promo/validate, product/:id |
| Админ-панель (dev-режим) | ✅ | работает через dev-токен |

### Проверенные публичные эндпоинты
```
GET /health              → 200
GET /v1/products         → 200 (8 товаров)
GET /v1/content          → 200
GET /v1/stories          → 200
GET /v1/site-settings    → 200
GET /v1/delivery-config  → 200
GET /v1/wholesale-tiers  → 200
GET /v1/products/:id     → 200
GET /v1/promo/validate   → 200 (все 4 кода)
```

### Проверенные админ-эндпоинты (через dev-токен)
```
POST /v1/admin/site-settings → 200
POST /v1/admin/content       → 200
GET  /v1/admin/orders        → 200
GET  /v1/admin/stats         → 200
```

---

## 2. ⚠️ ЧТО НЕ РАБОТАЕТ / ОТКЛЮЧЕНО (требует настройки)

Всё перечисленное ниже — **заложено в коде**, но **выключено**, пока не заданы секреты в `.env`:

| Функция | Что нужно | Что без этого |
|---|---|---|
| **Telegram-бот** | `TG_BOT_TOKEN` (@BotFather) | `⚠️ TG_BOT_TOKEN not set — bot skipped` |
| **Онлайн-оплата Payme** | `PAYME_MERCHANT_ID`, `PAYME_KEY` | оплата отключена |
| **Онлайн-оплата Click** | `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET` | оплата отключена |
| **Бэкапы БД в облако** | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | бэкапы отключены |
| **Авторизация / заказы** | `initData` от Telegram WebApp | без Telegram доступна витрина, защищённые запросы возвращают 401 |
| **Бот-фичи** (брошенная корзина, «вернитесь через N дней», день рождения, уведомления о заказе) | `TG_BOT_TOKEN` | не срабатывают без бота |

> ⚠️ **Заказы и `/v1/me/*` возвращают 401 без Telegram-initData** — это нормально и ожидаемо.
> В обычном браузере без Telegram оформить реальный заказ нельзя (только demo-витрина и корзина).

---

## 3. 🚀 ЧТО НУЖНО ДЛЯ ЗАПУСКА

### Локальная разработка (dev)
```bash
# 1. Фронтенд (корень проекта)
npm install
npm run dev          # → http://localhost:5173

# 2. Бэкенд (server/)
cd server
npm install          # better-sqlite3 — компилируется (см. примечание)
cp .env.example .env # заполнить ADMIN_CHAT_ID минимум
npm run seed         # первый раз — наполнить БД
npm run dev          # → http://localhost:3001
```

**Нужные файлы `.env`:**
- `server/.env` — `ADMIN_CHAT_ID` обязателен (ID админа от @userinfobot)
- корневой `.env` — `VITE_API_URL=/` (для локальной связки через прокси)

> ⚠️ **Важно для песочницы:** файлы `.env` и папка `node_modules/` **не сохраняются
> между сессиями** (gitignored). После каждого перезапуска надо заново создавать `.env`
> и ставить зависимости. Без `server/.env` админка не работает (403).

### Продакшен (Docker / Render)
```bash
# Docker
cp .env.example .env   # заполнить TG_BOT_TOKEN, ADMIN_CHAT_ID, APP_URL
docker compose up -d --build   # → http://localhost:3001
```
Требует: `TG_BOT_TOKEN`, `ADMIN_CHAT_ID`, `APP_URL`, опционально Payme/Click/Supabase.

---

## 4. 📋 Структура проекта

```
delis-tg/
├── src/            # Фронтенд (React + Vite + Tailwind v4)
│   ├── App.tsx     # Корневой компонент, состояние, роутинг
│   ├── config.ts   # Все настройки (реквизиты, телефоны, оплата)
│   ├── data.ts     # Данные + localStorage (база для экранов)
│   ├── api.ts      # HTTP-клиент к бэкенду /v1/...
│   ├── i18n.tsx    # Переводы uz/ru/en
│   ├── screen-*.tsx    # Экраны (каталог, товар, extras)
│   ├── sections-*.tsx  # Секции главной
│   ├── features-*.tsx  # Отдельные фичи (админка, продажи, бандлы...)
│   └── index.css   # Глобальные стили + тема (светлая/тёмная)
├── server/         # Бэкенд (Fastify + SQLite + grammY)
│   └── src/
│       ├── index.ts      # Весь API (98 КБ)
│       ├── bot.ts        # Telegram-бот (52 КБ)
│       ├── db.ts         # Схема БД
│       ├── auth.ts       # Проверка initData (HMAC)
│       ├── pricing.ts    # Тарифы/опт
│       └── *.test.ts     # Тесты
├── public/images/  # Картинки товаров
├── Dockerfile, docker-compose.yml, render.yaml  # Деплой
├── *.md           # Документация
```

---

## 5. 🎨 Текущие правки (не закоммичены)

| Файл | Правка |
|---|---|
| `src/index.css` + 29 файлов | Золотой акцент → **тёмно-зелёный Pine** (светлый `#0b6b44`, тёмный `#16a06a`) |
| `PREVIEW_CHANGES_GUIDE.md` | Путеводитель по фичам (новый) |
| `server/package.json` + lock | better-sqlite3 поднят до `^11.10.0` |

---

## 6. 🔧 Находки / замечания

1. **`server/.env` теряется между сессиями** песочницы → без него админка даёт 403. Нужно пересоздавать (я уже воссоздал — сейчас работает).
2. **better-sqlite3** — в песочнице CDN для prebuilt-бинарников заблокирован, поэтому компилируется вручную из системных заголовков (`npm_config_nodedir=/usr/local`). Для реального сервера/CI эта проблема не актуальна.
3. **PWA-manifest** объявляет иконки `192x192`/`512x512`, но использует `hero.jpg` (реально 1024×1536) — несоответствие размеров. Не критично для Telegram Mini App.
4. **Демо-данные**: 8 товаров используют 4 уникальных изображения (wax/glass/floor/shampoo переиспользуются). Для продакшена заменить на реальные фото.
5. **Небольшое расхождение контактов**: `src/config.ts` → `SUPPORT_TG=@delis_care`, а `server/.env` → `SUPPORT_MANAGER_TG=@delisgroup_bot`. Стоит синхронизировать.
6. **`server/package.json`** уже показывает `better-sqlite3 ^11.10.0` (было `^11.0.0`) — это изменение от установки, незакоммичено.

---

## 7. ✅ Итоговая оценка

**Проект в отличном состоянии:**
- Всё собирается, тесты зелёные (15+94), typecheck чистый
- API и фронтенд работают, связка настроена
- Админка работает (dev)
- Для **полного продакшена** не хватает только: `TG_BOT_TOKEN`, ключей оплаты Payme/Click и Supabase — без них приложение работает в демо-режиме

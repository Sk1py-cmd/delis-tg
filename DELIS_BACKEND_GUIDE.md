# DELIS — Backend Guide

Этот документ описывает **текущую реализацию**, а не проект будущей архитектуры.

## 1. Архитектура

```text
Telegram Mini App (React/Vite)
        │ Authorization: Telegram <initData>
        │ /v1/*
        ▼
Fastify 5 + SQLite (better-sqlite3)
        ├── grammY bot, long polling
        ├── Payme / Click webhooks
        ├── Telegram Stars invoices
        ├── static dist/ in Docker/Render
        └── Supabase Storage backup + product images
```

Production использует один процесс и один origin. Отдельный PostgreSQL/Redis в
проекте не используется.

## 2. Главные файлы

| Файл | Назначение |
|---|---|
| `server/src/index.ts` | Fastify, схемы Zod, API, оплата и static hosting |
| `server/src/db.ts` | SQLite, таблицы и идемпотентные миграции |
| `server/src/auth.ts` | проверка Telegram Mini App HMAC |
| `server/src/pricing.ts` | чистый серверный расчёт заказа |
| `server/src/loyalty.ts` | ledger и уровни DELIS Stars |
| `server/src/bot.ts` | grammY-команды, уведомления, отчёты, геолокация |
| `server/src/supabase-store.ts` | backup SQLite и загрузка изображений |
| `server/src/seed-runner.ts` | seed только пустого каталога |

## 3. Авторизация

Фронтенд отправляет исходную строку `window.Telegram.WebApp.initData`:

```http
Authorization: Telegram query_id=...&user=...&auth_date=...&hash=...
```

`verifyInitData()` строит Telegram data-check-string и проверяет HMAC-SHA256 с
`TG_BOT_TOKEN`. `initDataUnsafe` не используется как источник доверия.

Пользовательские маршруты получают `tg_id` только из проверенной подписи.
Админские маршруты дополнительно требуют совпадение с `ADMIN_CHAT_ID`.

`DELIS_DEV_ADMIN_TOKEN`/`X-Delis-Dev-Admin` — только локальный preview shortcut.
Его нельзя задавать в production.

## 4. Основные группы API

### Public

- `GET /health`
- `GET /v1/products`, `GET /v1/products/:id`
- `GET /v1/promos`, `GET /v1/promo/validate`
- `GET /v1/content`, `/v1/site-settings`, `/v1/delivery-config`
- `GET /v1/stories`, `/v1/products/:id/reviews`
- `GET /v1/qr/:code`, `/v1/wholesale-tiers`

### Authenticated customer

- `/v1/me`, `/v1/me/orders`, `/v1/me/loyalty`
- favorites, addresses, subscriptions, waitlist
- daily reward, birthday and referral
- stories/reviews
- `POST /v1/orders`
- order status/repeat/tracking
- certificates and Stars rewards

### Admin

Все маршруты `/v1/admin/*` проверяют Telegram HMAC и `ADMIN_CHAT_ID`:

- products, stock and images;
- orders, payment/status flow, CSV;
- promos, QR batches, B2B codes, certificates;
- stories moderation and waitlist notifications;
- content, contacts, delivery tariffs;
- analytics, stats and JSON backup.

### Payment providers

- `POST /v1/webhooks/payme`
- `POST /v1/webhooks/click`
- `POST /v1/payments/stars`

## 5. Создание заказа

Клиентские `subtotal`, `discount`, `deliveryFee`, `total` и item price не являются
доверенными. Сервер:

1. валидирует тело через Zod;
2. читает товары, цены, тарифы, промокод и сертификат из SQLite;
3. рассчитывает оптовую цену и доставку;
4. в одной SQLite transaction создаёт заказ, списывает stock и погашает
   single-use coupon/certificate;
5. возвращает серверные суммы и runtime `payment_url` для Payme/Click;
6. только после этого клиент показывает успех и очищает корзину.

Если сеть недоступна, заказ локально не создаётся: форма и корзина сохраняются
для повторной попытки.

## 6. Оплата

Payme/Click merchant IDs и secrets читаются только из server environment.
Платёжная ссылка строится после создания заказа и не встраивается в JS bundle.
Webhooks проверяют подпись/Basic auth, точную сумму и состояние заказа.

Telegram Stars получает сумму заказа из БД и создаёт XTR invoice через Bot API.
`fulfillOrder()` защищён флагом `stars_awarded`, поэтому cashback/referral
начисляются ровно один раз.

Полная настройка: `PAYMENTS_SETUP.md`.

## 7. SQLite и backup

По умолчанию: `server/data/delis.db`, WAL + foreign keys. Docker Compose монтирует
`server/data` как volume.

При наличии `SUPABASE_URL` и `SUPABASE_SERVICE_KEY` сервер:

1. восстанавливает `delis-data/delis.db` до открытия базы;
2. делает WAL checkpoint;
3. загружает копию каждые 30 секунд;
4. хранит загруженные product images в публичном `delis-images` bucket.

На ephemeral hosting запуск без Supabase приводит к потере данных при редеплое.

## 8. Telegram-бот

Бот запускается в том же процессе через long polling. Реализованы команды меню,
заказы, поддержка, рефералы, трекинг и courier live location. Также работают:

- уведомления администратора и клиента;
- abandoned cart и reorder reminders;
- ежедневный отчёт;
- JSON backup в Telegram;
- предупреждение о зависших заказах.

Если `TG_BOT_TOKEN` пуст, API продолжает работать, а бот корректно пропускается.

## 9. Тестирование

```bash
cd server
npm ci
npm run typecheck
npm test       # 123 integration/unit tests
npm run build
npm audit      # 0 vulnerabilities
```

Тесты используют in-memory SQLite, подписанный test initData и отключённые
сетевые уведомления. Покрыты деньги/stock, webhooks, ownership/IDOR, QR, B2B,
сертификаты, контент, stories, addresses, backup, waitlist и tracking.

## 10. Production

Рекомендуемый путь — `Dockerfile`/`render.yaml`. Fastify слушает `0.0.0.0`,
доверяет reverse proxy и ограничивает запросы по реальному IP. `APP_URL` должен
точно совпадать с frontend origin для CORS и Telegram-кнопок.

Список переменных и шагов: `.env.example`, `DELIS_LAUNCH_GUIDE.md` и
`DEPLOY_CHECKLIST.md`. Полная loyalty-схема, QR и миссии: `LOYALTY_SETUP.md`.

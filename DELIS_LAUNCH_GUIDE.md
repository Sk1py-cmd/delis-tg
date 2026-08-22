# 🚀 DELIS — локальный запуск и деплой

Проект состоит из React/Vite Mini App, Fastify API, SQLite и Telegram-бота grammY.
В production рекомендуемый вариант — один Docker-образ: Fastify раздаёт и API,
и собранный фронтенд на одном домене.

## 1. Проверка проекта

Требуется Node.js 20.19+ (или Node.js 22.12+).

```bash
npm ci
npm run typecheck
npm test
npm run build

cd server
npm ci
npm run typecheck
npm test
npm run build
```

## 2. Локальная разработка

### Терминал 1 — API и бот

```bash
cp server/.env.example server/.env
# заполните минимум TG_BOT_TOKEN, ADMIN_CHAT_ID и APP_URL
cd server
npm ci
npm run seed
npm run dev
```

API: `http://localhost:3001`, healthcheck: `GET /health`.
База создаётся в `server/data/delis.db`. Демонстрационные промокоды по умолчанию
создаются выключенными; для локальной демонстрации можно временно задать
`ENABLE_SEEDED_PROMOS=true`, но production-акции включайте только из админки.

### Терминал 2 — фронтенд

```bash
cp .env.example .env
# для локальной разработки оставьте VITE_API_URL=/
npm ci
npm run dev
```

Vite работает на `http://localhost:5173` и проксирует `/v1/*` в локальный API.
Без отдельного `VITE_API_URL` используется same-origin, а не production-сервер.

В обычном браузере приложение автоматически получает подписанную 30-дневную
гостевую сессию: cash/Payme/Click-заказы, избранное, адреса, возвраты и support-
чат сохраняются за владельцем сессии. Telegram Stars и нативные Telegram-функции
требуют подписанный `initData`. Для локальной проверки админки можно задать
одинаковые `VITE_DEV_ADMIN_TOKEN` и `DELIS_DEV_ADMIN_TOKEN`; в production эти
переменные запрещены.

## 3. Telegram BotFather

```text
/newbot        → создать бота
/newapp        → указать публичный HTTPS URL Mini App
/setmenubutton → тот же HTTPS URL
/setdomain     → домен приложения для платежей
/setuserpic    → загрузить public/brand/delis-bot-avatar.png
```

Бот работает через long polling. Webhook-эндпоинта бота в проекте нет и
дополнительно настраивать Telegram webhook не нужно.

## 4. Docker / VPS

```bash
cp .env.example .env
# заполните TG_BOT_TOKEN, ADMIN_CHAT_ID, APP_URL;
# Payme/Click и Supabase — при необходимости
docker compose up -d --build
curl http://localhost:3001/health
```

`VITE_API_URL=/` означает same-origin: `/v1/*` и сайт обслуживает один Fastify.
Для HTTPS поставьте nginx/Caddy перед портом 3001 и передавайте `Host` и
`X-Forwarded-For`.

## 5. Render

`render.yaml` создаёт один Docker web service. В Render → Environment добавьте:

- `TG_BOT_TOKEN`, `ADMIN_CHAT_ID`, `APP_URL`;
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` для сохранности SQLite;
- Payme/Click-переменные из `PAYMENTS_SETUP.md`;
- при необходимости `COURIER_CHAT_IDS` и контакты поддержки.

Render Free имеет холодный старт и непостоянную файловую систему. Без Supabase
данные SQLite могут пропасть при редеплое.

## 6. Отдельный статический фронтенд

Если фронтенд размещён отдельно от API:

```env
VITE_API_URL=https://api.example.com
VITE_BASE_PATH=/
```

`APP_URL` на сервере должен точно совпадать с origin фронтенда для CORS.

## 7. GitHub Pages

В репозитории есть `.github/workflows/deploy-pages.yml`: workflow проверяет оба
пакета, собирает Vite с `/delis-tg/` и публикует `dist`.

В GitHub откройте **Settings → Pages → Build and deployment → Source** и выберите
**GitHub Actions**. Публикация исходного корня ветки (`Deploy from a branch`) для
Vite-приложения не подходит.

GitHub Pages использует Render API через заданный в workflow `VITE_API_URL`.
Cloudflare Workers preview использует same-origin proxy из `worker.js`:
`/v1/*` и `/health` пересылаются в Render API, остальные запросы обслуживаются
из `ASSETS`. При смене backend-домена обновите `API_ORIGIN` в worker.

## 8. Оплата

Payme/Click настраиваются только server-side. Сервер создаёт заказ и возвращает
`payment_url`; клиент не генерирует платёжные ссылки самостоятельно. Подробности
и webhook URL — в `PAYMENTS_SETUP.md`.

## 9. Экономика Reward Center

В админке откройте **Лояльность → Награды**. До production-запуска:

1. внесите фактическую себестоимость каждого активного товара;
2. укажите среднюю стоимость courier/BTS и комиссию эквайринга;
3. задайте целевую маржу;
4. проверьте, что `Cost coverage = 100%` и нет предупреждения о марже;
5. при аномалии используйте emergency pause — она останавливает новую выдачу,
   но не отменяет уже выданные клиентам купоны.

Стоимость награды, минимальная корзина, benefit cap, TTL и подарок меняются без
деплоя. ROI-блок показывает выдачу/погашение, связанную выручку, средний чек,
потенциальные обязательства и расчётную маржу. Profit Guard не применяет Stars-
купон, если расчётная маржа заказа ниже цели; пока точный COGS не заполнен,
используется видимый и редактируемый fallback-процент себестоимости.

Перед live-запуском администратор должен открыть `GET /v1/admin/readiness` с
Telegram-авторизацией и получить `ready: true`. Действия, требующие владельца
кабинетов и физических устройств, перечислены в `PRODUCTION_OWNER_ACTIONS.md`.

## 10. Что проверить перед запуском

- `/health` и `/v1/products` отвечают;
- бот отвечает на `/start` и открывает правильный `APP_URL`;
- заказ без сети не показывает ложный успех и не очищает корзину;
- cash-заказ приходит администратору;
- Payme/Click/Stars проходят sandbox-тест;
- смена статусов уведомляет клиента;
- Supabase восстанавливает БД после тестового рестарта;
- камера QR и live location проверены внутри Telegram;
- адаптив проверен на нескольких телефонах.

# Деплой DELIS на VPS через Docker

Фронтенд, Fastify API и Telegram-бот собираются в один образ и работают на одном
порту `3001`.

## 1. Подготовка

Нужны VPS с Docker, HTTPS-домен, токен @BotFather и Telegram ID администратора.

```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/Sk1py-cmd/delis-tg.git
cd delis-tg
cp .env.example .env
nano .env
```

Минимально заполните:

```env
TG_BOT_TOKEN=
ADMIN_CHAT_ID=
APP_URL=https://app.delis.uz
VITE_API_URL=/
```

## 2. Запуск

```bash
docker compose up -d --build
curl http://localhost:3001/health
docker compose logs -f delis
```

Бот использует long polling. Telegram webhook устанавливать не нужно.

## 3. HTTPS через nginx

```nginx
server {
  listen 80;
  server_name app.delis.uz;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

После этого выпустите сертификат через certbot или используйте Caddy.

## 4. Основные переменные

| Переменная | Назначение |
|---|---|
| `TG_BOT_TOKEN` | Токен Telegram-бота |
| `BROWSER_SESSION_SECRET` | Отдельный HMAC-секрет гостевых сессий (`openssl rand -hex 32`) |
| `TG_INIT_DATA_MAX_AGE_SECONDS` | Максимальный возраст Telegram initData, по умолчанию 86400 |
| `ADMIN_CHAT_ID` | ID администратора и получателя заказов |
| `APP_URL` | Точный публичный HTTPS origin Mini App |
| `BOT_USERNAME` | Username бота без `@` |
| `PORT` | Внешний порт Compose, по умолчанию 3001 |
| `TZ` | `Asia/Tashkent` |
| `REPORT_HOUR`, `BACKUP_HOUR` | Часы отчёта и резервной копии |
| `COURIER_CHAT_IDS` | Telegram ID курьеров через запятую |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Хранение SQLite и изображений |
| `PAYME_MERCHANT_ID`, `PAYME_KEY` | Payme |
| `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET` | Click |
| `VITE_API_URL` | `/` для единого Docker-домена |
| `ENABLE_SEEDED_PROMOS` | В production оставьте `false`; акции включаются владельцем в админке |

Compose передаёт все перечисленные runtime-переменные в контейнер. Платёжные
ссылки формирует сервер; редактировать `src/config.ts` и пересобирать фронтенд
после смены merchant ID не требуется.

## 5. Хранение данных

На VPS SQLite лежит в `server/data/delis.db` и монтируется как volume.
На Render/другом ephemeral hosting настройте Supabase Storage: сервер скачивает
БД при старте и загружает checkpoint каждые 30 секунд. Используйте только
`service_role` в `SUPABASE_SERVICE_KEY`; никогда не помещайте ключ во фронтенд.

Дополнительно бот отправляет администратору ежедневный JSON backup.

## 6. Обновление

```bash
git pull
docker compose up -d --build
curl http://localhost:3001/health
```

Полная инструкция: `DELIS_LAUNCH_GUIDE.md`. Платежи: `PAYMENTS_SETUP.md`.
Карта, QR, миссии и правила DELIS Stars: `LOYALTY_SETUP.md`.

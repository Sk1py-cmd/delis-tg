# 🚀 DELIS — production checklist

> Автоматически проверено: frontend typecheck/build, 20 frontend tests,
> backend typecheck/build и 156 backend tests. Всего 176. Оба `npm audit` — 0 уязвимостей.

## 1. Код и CI

- [ ] Изменения смержены в `main`
- [ ] GitHub Actions зелёный
- [ ] GitHub Pages Source = **GitHub Actions**, а не публикация корня ветки
- [x] `npm run typecheck && npm test && npm run build` проходит локально
- [x] `cd server && npm run typecheck && npm test && npm run build` проходит

## 2. Render / VPS

- [x] изолированный branch-backend подготовлен в `render.preview.yaml` без production bot/database
- [x] preview service `https://delis-tg-arena-preview.onrender.com` создан по `RENDER_PREVIEW_SETUP.md`; `/health` отвечает JSON, каталог возвращает 8 товаров
- [ ] `TG_BOT_TOKEN`
- [ ] `BROWSER_SESSION_SECRET` — рекомендуется отдельный случайный 32-byte secret; без него используется `TG_BOT_TOKEN`
- [ ] `ADMIN_CHAT_ID`
- [ ] точный `APP_URL` без завершающего `/`
- [ ] `BOT_USERNAME`
- [ ] `TZ=Asia/Tashkent`
- [ ] `COURIER_CHAT_IDS` при наличии отдельных курьеров
- [ ] `STAFF_TG_USER_IDS` — обязателен при групповом `ADMIN_CHAT_ID`
      (кто из сотрудников может отвечать в support / менять статусы / рассылать)
- [ ] `TG_MONEY_INIT_DATA_MAX_AGE_SECONDS` — окно сессии для checkout
      (по умолчанию 900 с); `BACKUP_UPLOAD_SECONDS` — периодичность бэкапа
      в Supabase (по умолчанию 300 с)
- [ ] `SUPPORT_PHONE`, `SUPPORT_PHONE_2`, `SUPPORT_MANAGER_TG`
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` на ephemeral hosting
- [ ] `SEED_ON_START=true` безопасно: новые записи создаются только в пустом каталоге, а media-upgrade меняет лишь известные старые default-пути
- [ ] `DELIS_DEV_ADMIN_TOKEN` отсутствует в production

Проверка:

```bash
curl https://<домен>/health
curl 'https://<домен>/v1/products?lang=ru'
```

## 3. Payme / Click / Stars

- [x] `/v1/payment-methods` публикует только readiness-флаги и не раскрывает merchant credentials
- [x] ненастроенный online-метод скрывается в UI и отклоняется сервером до создания заказа
- [ ] `PAYME_MERCHANT_ID`, `PAYME_KEY`
- [ ] `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET`
- [ ] Payme webhook: `https://<домен>/v1/webhooks/payme`
- [ ] Click PREPARE и COMPLETE: `https://<домен>/v1/webhooks/click`
- [ ] BotFather Payments/Stars и домен Mini App настроены
- [ ] `POST /v1/orders` возвращает `payment_url` для Payme/Click
- [ ] Sandbox webhook переводит заказ в `paid`
- [ ] Повторный webhook не начисляет cashback повторно

## 4. BotFather и Telegram

- [ ] `/start` показывает кнопку Mini App
- [ ] `/setmenubutton` ведёт на точный `APP_URL`
- [ ] `/setdomain` настроен
- [x] сервер хранит delivery-state Telegram-уведомления, повторяет неудачные отправки каждую минуту и один раз напоминает о заказе через 30 минут
- [ ] Заказ приходит администратору на реальном production-боте
- [ ] Статусы new → preparing → shipped → delivered уведомляют клиента на реальном production-боте
- [ ] `/track DL-XXXX` открывает правильный заказ
- [ ] Курьерская live location отображается владельцу заказа
- [ ] QR scanner проверен на реальном устройстве внутри Telegram

## 5. Данные и бизнес-сценарии

- [x] статусы заказов сервером ограничены цепочкой `new → preparing → shipped → delivered`; обратные/пропущенные переходы отклоняются
- [x] повторные `delivered`/`paid` идемпотентны; отменённый заказ нельзя пометить оплаченным
- [x] Cash-заказ создаётся только после ответа API; live preview smoke `DL-4423` сохранился в owner-scoped «Buyurtmalar» после перезагрузки страницы
- [ ] При обрыве сети корзина сохраняется и ложный успех не показывается
- [ ] Недостаточный остаток возвращает `409 insufficient_stock`
- [ ] Отмена возвращает на склад только ранее списанный товар
- [ ] Промокод и сертификат нельзя использовать дважды
- [ ] Админка редактирует контент, контакты и тарифы доставки
- [ ] Stories проходят pending → approved/rejected
- [ ] Адреса и подписки изолированы по владельцу
- [ ] Утренний отчёт и ночной backup приходят администратору
- [x] локальный API restart сохраняет browser order и owner-сессию при стабильном `BROWSER_SESSION_SECRET`
- [ ] production БД восстанавливается после тестового рестарта/редеплоя

## 6. Loyalty / DELIS Stars

- [ ] Клиентская карта выдаёт непрозрачный номер `DLX-...`, QR не содержит Telegram ID
- [ ] Админка → Лояльность сканирует QR в Telegram и обычном браузере
- [ ] Ручное earn/spend требует причину и появляется в transaction stream
- [ ] Bronze/Silver/Gold и cashback совпадают с настройками Rules
- [ ] После траты баланс может понизить уровень (выбранное правило current balance)
- [ ] Миссия выдаёт reward ровно один раз
- [ ] Birthday reward выдаётся только в дату рождения и один раз в год
- [ ] Тестовый истёкший earn-лот списывается FIFO и попадает в историю
- [ ] Бот присылает предупреждение до сгорания Stars
- [x] Reward Center ограничивает liability: minimum basket, benefit caps, retail-only и single-use
- [x] Админ может без деплоя менять стоимость, корзину, cap, TTL, подарок и аварийно приостанавливать новую выдачу
- [x] Reward ROI показывает issued/redeemed/expired, связанную выручку, AOV, liability и расчётную маржу
- [x] Profit Guard блокирует Stars-купон ниже target margin и использует fallback COGS для незаполненных товаров
- [ ] В админке заполнены реальные себестоимости всех товаров и доставки

## 7. PWA и интерфейс

- [x] `/manifest.json` отдаёт JSON, не SPA HTML (локальный runtime)
- [x] Worker содержит hostname-isolated routing: arena-preview проксирует `/v1/*` и `/health` в отдельный Render preview, production hostname сохраняет production fallback
- [x] оригинальный owner-uploaded JPG сохранён byte-for-byte; интерфейс и иконки используют его прозрачные pixel crops без белых плашек
- [x] иконки 192×192 и 512×512 открываются (локальный runtime)
- [ ] установленная PWA стартует с правильного корня
- [ ] узбекский, русский и английский просмотрены вручную
- [x] compact CSS для Telegram WebView 320–359 px, short landscape, safe areas и coarse-pointer touch targets добавлен
- [x] у всех восьми товаров уникальный brand cover; gallery начинается с cover
- [ ] iPhone SE, современный iPhone, Android и планшет проверены на реальных устройствах

Подробности: `DELIS_LAUNCH_GUIDE.md`, `PAYMENTS_SETUP.md`, `RELEASE_SMOKE_REPORT.md`.

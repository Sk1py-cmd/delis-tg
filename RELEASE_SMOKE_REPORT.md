# DELIS — release smoke report

> Исторический smoke от 17 августа. Актуальный code-hardening и внешний release
> gate: `LAUNCH_HARDENING_REPORT.md` и `PRODUCTION_OWNER_ACTIONS.md`.

Дата проверки: **17 августа 2026**
Ветка: `arena/019ffb0a-delis-tg`  
PR: [#11](https://github.com/Sk1py-cmd/delis-tg/pull/11)

## Автоматизированная часть

- [x] Frontend TypeScript typecheck
- [x] Frontend tests: 18
- [x] Frontend production build
- [x] Frontend `npm audit`: 0 vulnerabilities
- [x] Backend TypeScript typecheck
- [x] Backend tests: 137
- [x] Всего regression tests: 155
- [x] Backend production build
- [x] Backend `npm audit`: 0 vulnerabilities
- [x] Payment readiness endpoint не раскрывает credentials; UI скрывает, а API отклоняет ненастроенные online-методы до создания заказа
- [x] Payme URL, Basic auth, amount validation, transaction lifecycle и idempotency покрыты integration tests
- [x] Click PREPARE/COMPLETE, signature, amount validation и idempotency покрыты integration tests
- [x] Telegram initData HMAC, owner isolation и admin authorization покрыты integration tests
- [x] Браузерный checkout использует подписанную 30-дневную guest-сессию; tamper rejection, cash order ownership и запрет browser Stars покрыты integration tests
- [x] Order lifecycle forward-only; cancellation restock и однократные paid/delivered Stars защищены integration tests
- [x] Admin Telegram notification имеет persistent delivery-state, минутный retry и одноразовый 30-minute stuck alert; admin UI показывает sent/pending
- [x] Product authenticity QR: valid / fake / revoked / deleted покрыты integration tests
- [x] Loyalty QR: opaque code, admin lookup и rotate/revoke покрыты integration tests
- [x] Reward Center: pause, admin config, caps, minimum basket, gift SKU, wholesale conflict и ROI analytics покрыты integration tests
- [x] Profit Guard отклоняет Stars-купон ниже target margin; при неизвестной себестоимости используется настраиваемый fallback COGS
- [x] Локально `/health`, frontend, API proxy, payment readiness, manifest, service worker, brand assets и PWA icons отвечают 200
- [x] После реального перезапуска локального API browser order сохранился и остался доступен владельцу при стабильном `BROWSER_SESSION_SECRET`
- [x] Каталог возвращает 8 товаров на uz / ru / en; официальный source JPG совпадает с served copy по SHA-256
- [x] Wrangler production dry-run читает 29 assets и успешно собирает Worker
- [x] Cloudflare branch preview обнаружен; Worker same-origin proxy направляет `/v1/*` и `/health` в Render API, static assets обслуживаются через `ASSETS`
- [x] Изолированный Render preview `https://delis-tg-arena-preview.onrender.com` развёрнут на Free без production bot token/Supabase; `/health` отвечает, каталог возвращает 8 товаров
- [x] Начальный preview readiness: `payme:false`, `click:false`, `cash:true`, `stars:false`; sandbox Payme/Click credentials ещё не добавлены, поэтому реальные provider checks остаются открытыми
- [x] Через live branch-preview создан безопасный browser cash-заказ `DL-4423`: сервер вернул итог 68 000 сум, заказ появился в «Buyurtmalar» и остался доступен владельцу после полной перезагрузки страницы
- [x] Checkout показал только готовый cash-метод и явно скрыл Payme/Click/Stars; зависший online-заказ при отсутствующих credentials не создавался
- [x] Worker routing разделён по hostname: arena-preview использует отдельный Render API, production hostname сохраняет production Render fallback
- [x] Rolling-deploy safety: новый frontend сохраняет новые covers при legacy media paths и ставит Reward Center на паузу, если API ещё не поддерживает minimum/cap/TTL contract

## Обязательная проверка на реальных устройствах

Эти пункты нельзя честно закрыть из sandbox без физического телефона и кабинетов провайдеров.

### Telegram Mini App — iPhone

- [ ] Открыть production Mini App внутри Telegram
- [ ] Проверить safe-area сверху и снизу
- [ ] Пройти Home → Product swipe → Cart → Checkout
- [ ] Переключить uz / ru / en и dark theme
- [ ] Включить Reduce Motion в iOS и повторить основной сценарий
- [ ] Отсканировать loyalty QR встроенной камерой Telegram
- [ ] Отсканировать QR подлинности товара

### Telegram Mini App — Android

- [ ] Повторить основной сценарий на ширине 320–430 px
- [ ] Проверить системную кнопку Back и Telegram BackButton
- [ ] Проверить клавиатуру в checkout и отсутствие перекрытия CTA
- [ ] Проверить haptic feedback и QR scanner
- [ ] Проверить потерю/возврат сети с сохранением корзины

### Платежи и уведомления

- [ ] Создать Payme sandbox-заказ и дождаться webhook `paid`
- [ ] Повторить тот же Payme webhook: cashback не должен начислиться повторно
- [ ] Создать Click sandbox-заказ, пройти PREPARE → COMPLETE
- [ ] Повторить Click COMPLETE: операция остаётся идемпотентной
- [ ] Создать Telegram Stars invoice через реального бота
- [ ] Проверить cash-заказ и уведомление администратора
- [ ] Провести заказ new → preparing → shipped → delivered и проверить сообщения клиенту

### Reward Center

- [ ] В админке заполнить реальные себестоимости восьми товаров
- [ ] Указать среднюю стоимость courier/BTS и комиссию эквайринга
- [ ] Сохранить и убедиться, что Cost coverage = 100%
- [ ] Выдать и применить тестовую награду; проверить linked revenue и benefit
- [ ] Нажать emergency pause: каталог клиента должен стать пустым, уже выданный купон остаётся валидным
- [ ] Снова включить Reward Center

## Release gate

Merge в `main` разрешать только после закрытия реальных device/provider пунктов и отдельной команды владельца.

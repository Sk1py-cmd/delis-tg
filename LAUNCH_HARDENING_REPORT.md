# DELIS — launch hardening report

Дата: **19 августа 2026**

## Выполнено в коде

- Telegram `initData`: HMAC, constant-time hash compare, обязательный свежий
  `auth_date`, защита от payload из будущего.
- В `/v1/me` добавлен server-authoritative `isAdmin`; локальный PIN больше не
  открывает админку без подтверждённого `ADMIN_CHAT_ID`.
- Добавлены security headers и отдельные лимиты создания сессий/заказов.
- Order rate limit работает по подписанной пользовательской сессии, а не по
  общему IP мобильного оператора.
- Возвраты перенесены из localStorage в SQLite: ownership, delivered-only,
  14-дневное окно, duplicate lock, admin approve/reject и Telegram-уведомление.
- Support chat перенесён в SQLite: сообщение идёт администратору Telegram;
  ответ менеджера через Telegram Reply возвращается в Mini App.
- Админская рассылка теперь реально отправляется через Telegram и сохраняет
  audit result; ложный локальный success удалён.
- Колесо ежедневной награды использует `/v1/me/daily/claim`; результат и
  ограничение один раз в день контролируются SQLite.
- Отзыв разрешён только после доставленного заказа, сохраняется сервером и
  атомарно начисляет один бонус +50 DELIS Stars.
- Избранное, адреса, отзывы и возвраты синхронизированы с API; адреса получили
  owner-scoped update.
- Неработающие групповой заказ, gift-box pricing, client-only restock reminder
  и one-click order скрыты из launch UI вместо демонстрации ложного успеха.
- Production seed создаёт демонстрационные промокоды выключенными.
- Добавлен authenticated gate `GET /v1/admin/readiness`.
- Docker получает dedicated browser secret и Telegram TTL, содержит healthcheck,
  `NODE_ENV=production` и удаляет dev dependencies из runtime image.
- Render/Vercel/Cloudflare routing приведён к production API; добавлен текущий
  isolated preview hostname.
- GitHub Actions теперь проверяет pull request; Pages deploy на PR не запускается.
- Юридические тексты больше не обещают неподключённые Uzum/карты и фиксированные
  сроки, расходящиеся с тарифами.
- Добавлены стандартный `README.md` и owner-only release gate.

## Автоматическая проверка

- Frontend: typecheck, **20 tests**, production build.
- Backend: typecheck, **156 tests**, production build.
- Всего: **176 tests**.
- Frontend/backend production dependency audit: **0 vulnerabilities**.
- Дополнительные integration tests покрывают security headers, admin identity,
  address ownership/update, persistent support chat, return lifecycle,
  readiness endpoint and broadcast failure honesty.

## Что намеренно не считается выполненным кодом

Merchant/live credentials, юридическая подпись, реальные себестоимости,
BotFather, provider sandbox/live проверки, Supabase restore drill и тесты на
физических iPhone/Android выполняются владельцем по
`PRODUCTION_OWNER_ACTIONS.md`.

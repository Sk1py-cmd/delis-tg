# DELIS — статус деплоя и что нужно владельцу

**Дата:** 2026-09-06
**Состояние:** PR #14 открыт, CI зелёный, конфликтов нет — **ждёт мержа** (решение за владельцем).

---

## 1. Что уже готово (в PR #14)

| Блок | Статус |
|---|---|
| Аудит безопасности — весь бэклог L2–L7 + residual'ы M2/M3 | ✅ закрыт, 242 теста |
| CI: тесты гоняются на каждый PR (не только после мержа) | ✅ |
| Блок поддержки: имя менеджера, username, часы — из админки | ✅ |
| Часы работы с переводами uz/ru/en | ✅ |
| Чужой `@Sk1py` убран из всех дефолтов → `@delisgroup_bot` | ✅ |
| Превью в этой сессии работает (фронт + API + админка) | ✅ |

## 2. Топология продакшена

```
GitHub Pages  https://sk1py-cmd.github.io/delis-tg/   — статический фронтенд
                     │  API-запросы /v1/...
                     ▼
Render (Docker)  https://delis-tg-admin.onrender.com  — Fastify API + бот + SQLite
                     │  бэкап каждые 5 мин
                     ▼
               Supabase Storage (опционально)
```

- **Pages** собирается workflow'ом `deploy-pages.yml` при каждом push в `main`.
  Последний деплой — PR #13 (19 ч назад). После мержа PR #14 пересоберётся сам.
- **Render**: `render.yaml`, сервис `delis-tg-admin`, `autoDeploy: true` —
  после мержа Render сам пересоберёт Docker-образ из `main`.
  ⚠️ Из песочницы внешние URL не проверить (egress закрыт) — проверьте
  `https://delis-tg-admin.onrender.com/health` из браузера.

## 3. Что произойдёт после мержа (автоматически)

1. CI ещё раз прогоняет тесты на `main`.
2. Pages публикует новый фронт (в т.ч. блок поддержки с переводами).
3. Render пересобирает образ: новый API (поля `managerName`/`supportHours*`,
   безопасность), бот `/support` с редактируемыми контактами.

Проверка после деплоя (2 минуты):

```bash
curl https://delis-tg-admin.onrender.com/health          # {"ok":true,...}
curl https://delis-tg-admin.onrender.com/v1/site-settings # текущие контакты
# в Telegram: /support у бота — имя/часы/телефоны из админки
```

## 4. Что нужно владельцу

### 4.1 Один раз в Render → Environment (если ещё не сделано)

- [ ] `TG_BOT_TOKEN` (от @BotFather)
- [ ] `ADMIN_CHAT_ID` (свой ID от @userinfobot; **личный чат**, не группа)
- [ ] `BROWSER_SESSION_SECRET` — `openssl rand -hex 32`
- [ ] `APP_URL` = точный HTTPS origin фронтенда без `/` в конце
- [ ] `PUBLIC_API_URL` = `https://delis-tg-admin.onrender.com` (для вебхуков в админке)
- [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (иначе бэкап только локальный)
- [ ] Если `ADMIN_CHAT_ID` — группа: **обязательно** `STAFF_TG_USER_IDS`
      (user-id сотрудников через запятую; без этого readiness будет `fail`)
- [ ] Опционально: `COURIER_CHAT_IDS`, `PAYME_*`, `CLICK_*`
- [ ] Убедиться, что `DELIS_DEV_ADMIN_TOKEN` в проде **не задан**

### 4.2 После мержа — в админке приложения

- [ ] Вкладка **«Сайт»**: username менеджера (по умолчанию `@delisgroup_bot` —
      замените на реального менеджера), имя менеджера, часы + переводы
      (uz/ru/en), телефоны, email
- [ ] Вкладка «Лояльность → Награды»: себестоимость товаров
      (readiness требует Cost coverage = 100%)
- [ ] Промокоды: включить только одобренные

### 4.3 BotFather (один раз)

- [ ] Web App URL (`/newapp`) → production `APP_URL`
- [ ] `/setdomain` → тот же домен
- [ ] `/setmenubutton` → тот же URL
- [ ] Аватар бота — `public/brand/delis-bot-avatar.png`

### 4.4 Финальный гейт перед live-платежами

```text
GET /v1/admin/readiness   →   ready: true
```

…и один контрольный заказ каждым способом оплаты. Полный чек-лист —
`PRODUCTION_OWNER_ACTIONS.md` (юрданные, Payme/Click sandbox, устройства).

## 5. Известные остатки (не блокируют деплой)

| Пункт | Где |
|---|---|
| `trustProxy` allowlist — задокументирован как инвариант связки Render+worker | аудит H2 |
| PWA-иконки 192/512 в манифесте используют hero.jpg | старый аудит, некритично |
| Реальные фото товаров (сейчас 8 товаров на 4 фото) | владелец |

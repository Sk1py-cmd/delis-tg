# 💳 DELIS — подключение Payme, Click и Telegram Stars

Все платёжные параметры задаются **только на сервере**: во фронтенде нет ни
merchant ID, ни ключей, и пересборка после смены реквизитов не нужна.
После атомарного создания заказа API возвращает клиенту готовый `payment_url`.

Вставить ключи можно **двумя равноправными способами** — что удобнее:

| Способ | Где | Когда применяется |
| --- | --- | --- |
| **Админка бота → вкладка «Платежи»** | прямо в Mini App, с телефона | сразу, без редеплоя |
| **Render → Environment** | dashboard хостинга | после перезапуска сервиса |

Если значение задано в обоих местах, **побеждает введённое в админке**.
Пустое поле в админке = «убрать своё значение», сервер снова берёт ENV.
Секреты (Payme Key, Click Secret) никогда не отдаются обратно: в админке видна
только маска вида `••••1234`.

## Самый простой способ: вкладка «Платежи» в админке

1. Откройте бота → админ-панель → вкладка **«Платежи»**.
2. Вверху видно, что уже работает: Payme / Click / Telegram Stars / наличные.
3. Вставьте выданные кабинетом значения:
   - Payme: **Merchant ID** и **Key**;
   - Click: **Service ID** (только цифры), **Merchant ID**, **Secret**.
4. Нажмите **«Сохранить ключи»** — после заполнения всех полей провайдера способ
   оплаты появляется в checkout автоматически, без деплоя и перезагрузки. Даже
   уже открытый checkout обновится сразу в этой вкладке или максимум за 5 секунд
   в другой вкладке.
5. Скопируйте готовые webhook-адреса из блока «Вставьте эти адреса в кабинетах»
   и вставьте их в кабинет Payme (Merchant API URL) и Click (PREPARE и COMPLETE).
6. Нажмите **«Проверить всё»** — самопроверка скажет, чего не хватает: ключей,
   https-адреса, токена бота или получателя уведомлений. Секреты в отчёт не попадают.

Проверить статус можно и без админки — публичный эндпоинт отдаёт только флаги:

```text
GET /v1/payment-methods → {"payme":true,"click":true,"cash":true,"stars":true}
```

## Альтернатива: подключить через Render

Код и frontend менять не потребуется. Когда кабинет провайдера выдаст реквизиты:

1. Откройте [Render Dashboard](https://dashboard.render.com) и выберите нужный сервис.
2. Перейдите в **Environment**.
3. Нажмите **Add from .env**.
4. Вставьте только блок того провайдера, который уже готов. Сначала замените текст внутри `<...>` реальными значениями из кабинета — угловые скобки буквально не вставлять.

Payme:

```env
PAYME_MERCHANT_ID=<Merchant ID из кабинета Payme>
PAYME_KEY=<Key из кабинета Payme>
```

Click:

```env
CLICK_SERVICE_ID=<Service ID из кабинета Click>
CLICK_MERCHANT_ID=<Merchant ID из кабинета Click>
CLICK_SECRET=<Secret из кабинета Click>
```

5. Нажмите **Add variables**, затем **Save Changes** и дождитесь статуса **Live**. Render сам перезапустит API.
6. Откройте проверочный адрес нужного сервиса:

```text
Preview:    https://delis-tg-arena-preview.onrender.com/v1/payment-methods
Production: https://delis-tg-admin.onrender.com/v1/payment-methods
```

Production-адрес используйте только после деплоя этой версии backend. Готовый ответ для обоих провайдеров:

```json
{"payme":true,"click":true,"cash":true,"stars":false}
```

Можно подключать по одному: отсутствующий провайдер останется `false` и будет скрыт в checkout. Если флаг остался `false`, значит хотя бы одна обязательная переменная этого провайдера пустая.

### Куда добавлять

- Для безопасного теста используйте сервис `delis-tg-arena-preview` и **только sandbox/test-реквизиты**.
- Для реальных платежей позже используйте production-сервис и live-реквизиты, но только после production-деплоя этой версии backend.
- Не добавляйте live-реквизиты в preview и никогда не отправляйте секреты в чат, GitHub или frontend.

### Готовые webhook-адреса

Sandbox / preview:

```text
Payme:          https://delis-tg-arena-preview.onrender.com/v1/webhooks/payme
Click PREPARE:  https://delis-tg-arena-preview.onrender.com/v1/webhooks/click
Click COMPLETE: https://delis-tg-arena-preview.onrender.com/v1/webhooks/click
```

Production после merge и production-деплоя:

```text
Payme:          https://delis-tg-admin.onrender.com/v1/webhooks/payme
Click PREPARE:  https://delis-tg-admin.onrender.com/v1/webhooks/click
Click COMPLETE: https://delis-tg-admin.onrender.com/v1/webhooks/click
```

После добавления переменных способы оплаты появятся автоматически. Пересборка frontend, изменение `worker.js` и новый commit не нужны. Чтобы временно отключить провайдера, удалите его переменные в Render и снова нажмите **Save Changes** — незапущенный метод исчезнет из checkout.

## 0. Что где хранится

| Значение | ENV | Админка |
| --- | --- | --- |
| Payme Merchant ID | `PAYME_MERCHANT_ID` | «Payme · Merchant ID» |
| Payme Key | `PAYME_KEY` (или `PAYME_SECRET`) | «Payme · Key» |
| Click Service ID | `CLICK_SERVICE_ID` | «Click · Service ID» |
| Click Merchant ID | `CLICK_MERCHANT_ID` | «Click · Merchant ID» |
| Click Secret | `CLICK_SECRET` | «Click · Secret» |
| Токен бота (нужен для Stars) | `TG_BOT_TOKEN` | только ENV |

Значения из админки лежат в таблице `content_settings` (ключ `payment_config`)
и попадают в бэкапы Supabase вместе с остальной базой.

## 1. Базовые переменные

```env
TG_BOT_TOKEN=          # токен от @BotFather; нужен также для Telegram Stars
ADMIN_CHAT_ID=         # Telegram ID менеджера
APP_URL=https://app.delis.uz
```

## 2. Payme

В кабинете [merchant.payme.uz](https://merchant.payme.uz) откройте настройки кассы:

```env
PAYME_MERCHANT_ID=     # Merchant ID кассы
PAYME_KEY=             # Key / ключ кассы
```

Merchant API URL:

```text
https://<ВАШ-ДОМЕН>/v1/webhooks/payme
```

Сервер проверяет `Authorization: Basic base64("Paycom:" + PAYME_KEY)`, сумму
заказа и состояние транзакции. Методы `CheckPerformTransaction`,
`CreateTransaction`, `PerformTransaction`, `CancelTransaction` и
`CheckTransaction` обрабатываются идемпотентно.

## 3. Click

В кабинете Click возьмите:

```env
CLICK_SERVICE_ID=
CLICK_MERCHANT_ID=
CLICK_SECRET=
```

Оба URL в кабинете одинаковые:

```text
PREPARE:  https://<ВАШ-ДОМЕН>/v1/webhooks/click
COMPLETE: https://<ВАШ-ДОМЕН>/v1/webhooks/click
```

Сервер различает этапы по `action`, проверяет MD5 `sign_string`, ID сервиса,
сумму и состояние заказа.

## 4. Telegram Stars ⭐

Дополнительный provider token не требуется — используется `TG_BOT_TOKEN`.
Внутренняя конвертация сейчас: **1 ⭐ = 1 000 сум**
(`STAR_PRICE_UZS` в `server/src/index.ts`). Итоговая сумма всегда читается из БД.

В @BotFather для домена Mini App должны быть корректно настроены Payments/Stars.

## 5. Docker Compose / Render

`docker-compose.yml` уже передаёт все пять переменных Payme/Click в контейнер.
В Render добавьте те же значения в **Environment** — они считываются во время
работы сервера, а не во время сборки.

После изменения переменных перезапустите сервис. Пересобирать фронтенд не нужно.

## 6. Сквозная проверка

1. Создайте отдельный тестовый заказ Payme и Click.
2. Убедитесь, что `POST /v1/orders` вернул непустой `payment_url`.
3. Проведите sandbox-платёж.
4. Проверьте, что webhook вернул успешный ответ и `payment_status` стал `paid`.
5. Убедитесь, что повторный webhook не начисляет Stars второй раз.
6. Проверьте уведомления клиента и администратора в Telegram.

> Сервер принимает оплату только на точную сумму заказа из базы. Значения цены,
> скидки и total, присланные клиентом, игнорируются и пересчитываются сервером.

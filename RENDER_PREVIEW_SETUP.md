# Isolated Render preview for the DELIS arena branch

Use this service to test browser checkout, Payme and Click without changing `main`, the production database, or the production Telegram bot.

## Safety guarantees

- Branch: `arena/01a0191c-delis-tg`
- Separate Render service and ephemeral SQLite database
- `DELIS_DISABLE_NOTIFY=1`
- No `TG_BOT_TOKEN`, `ADMIN_CHAT_ID`, Supabase URL, or production bot configuration
- Only provider sandbox/test merchant values

## Create the service

In Render Dashboard:

1. Choose **New → Blueprint** and select `Sk1py-cmd/delis-tg`.
2. Select branch `arena/01a0191c-delis-tg`.
3. Use `render.preview.yaml` as the Blueprint file. If the UI only accepts the default file, create a **New Web Service** instead with:
   - Runtime: Docker
   - Branch: `arena/01a0191c-delis-tg`
   - Dockerfile: `./Dockerfile`
   - Health check: `/health`
   - Plan: Free
4. Set the environment variables listed in `render.preview.yaml` inside Render. Do not send their values in chat.
5. Generate a preview-only browser session secret locally or in a password manager:

   ```bash
   openssl rand -hex 32
   ```

6. Deploy and wait until `/health` returns JSON with `"ok": true`.

## Deployed Arena service

The isolated service was created on 17 August 2026:

```text
https://delis-tg-arena-preview.onrender.com
```

It runs the `arena/01a0191c-delis-tg` branch on Render Free with `/health` monitoring. The production bot, production database and production Supabase variables are not installed.

## Expected checks

```bash
curl 'https://delis-tg-arena-preview.onrender.com/health'
curl 'https://delis-tg-arena-preview.onrender.com/v1/products?lang=ru'
curl 'https://delis-tg-arena-preview.onrender.com/v1/payment-methods'
```

The initial live checks returned healthy JSON, 8 Russian catalog products and:

```json
{"payme":false,"click":false,"cash":true,"stars":false}
```

Payme and Click remain intentionally unavailable until their sandbox variables are added in Render. A copy-paste, provider-by-provider Render guide is in [`PAYMENTS_SETUP.md`](PAYMENTS_SETUP.md#самый-простой-способ-подключить-позже-через-render). Expected payment readiness when all sandbox variables are valid:

```json
{"payme":true,"click":true,"cash":true,"stars":false}
```

`stars` must remain `false` in this isolated preview because no Telegram bot token is installed.

After the service is healthy, share only its public `https://...onrender.com` URL. The branch Cloudflare Worker can then be pointed to that API without exposing credentials.

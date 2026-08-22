# DELIS Telegram Mini App

Production-oriented store for DELIS home and car care products.

## Stack

- React 19 + Vite 8 + Tailwind CSS 4
- Fastify 5 + SQLite (`better-sqlite3`)
- grammY Telegram bot
- Payme, Click, cash and Telegram Stars checkout
- Optional Supabase Storage backup and product media

The recommended production topology is one Docker service: Fastify serves both
`/v1/*` and the compiled frontend, while the bot runs by long polling in the
same process.

## Local development

Requires Node.js 20.19+ or 22.12+.

```bash
npm ci
cp server/.env.example server/.env
cd server
npm ci
npm run seed
npm run dev
```

In a second terminal:

```bash
npm run dev
```

- App: <http://localhost:5173>
- API: <http://localhost:3001>
- Health: <http://localhost:3001/health>

A normal browser receives a signed guest identity, so cash/Payme/Click orders,
favorites, addresses, returns and support chat persist across reloads. Telegram
Stars and Telegram-native features require a real Mini App session.

## Verification

```bash
npm run typecheck && npm test && npm run build
cd server
npm run typecheck && npm test && npm run build
npm audit --omit=dev
```

Current automated suite: 20 frontend tests and 156 backend tests.

## Production

```bash
cp .env.example .env
# Fill all required secrets and owner-approved business values.
docker compose up -d --build
curl http://localhost:3001/health
```

Production demo promos are disabled by default. Enable or create promotions only
from the authenticated admin panel after reviewing their economics.

The authenticated owner can inspect the machine-readable release gate:

```text
GET /v1/admin/readiness
```

Code cannot provide merchant credentials, legal approval or physical-device
checks. Complete every item in [`PRODUCTION_OWNER_ACTIONS.md`](PRODUCTION_OWNER_ACTIONS.md)
before accepting live payments.

## Documentation

- [`DELIS_LAUNCH_GUIDE.md`](DELIS_LAUNCH_GUIDE.md) — local run and deployment
- [`PAYMENTS_SETUP.md`](PAYMENTS_SETUP.md) — Payme, Click and Telegram Stars
- [`LOYALTY_SETUP.md`](LOYALTY_SETUP.md) — DELIS Stars
- [`DEPLOY_CHECKLIST.md`](DEPLOY_CHECKLIST.md) — full release checklist
- [`STRUCTURE.md`](STRUCTURE.md) — source map

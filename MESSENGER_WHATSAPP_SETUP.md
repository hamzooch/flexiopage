# Messenger + WhatsApp Bot — Setup

The bot module (`flexiopage-backend/src/modules/messenger-bot`) powers an AI
assistant (Claude) on **Facebook Messenger** and **WhatsApp**, sharing one
brain (catalog grounding, COD order creation, darija/ar/fr). This guide covers
getting it live.

---

## 1. Environment variables (backend `.env`)

```bash
# Anthropic (the brain) — REQUIRED
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL_PRIMARY=claude-haiku-4-5-20251001
CLAUDE_MODEL_FALLBACK=claude-sonnet-4-5

# Encrypts page/WhatsApp tokens at rest — REQUIRED, must stay constant.
# Generate: openssl rand -hex 32
TOKEN_ENCRYPTION_KEY=...

# Meta app (shared by Messenger + WhatsApp)
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...                 # used to verify webhook signatures
MESSENGER_VERIFY_TOKEN=flexiopage_bot_verify_2026   # any string, reused as the WhatsApp verify token
FACEBOOK_REDIRECT_URI=https://flexiopage.com/dashboard/apps/messenger-bot
FACEBOOK_GRAPH_VERSION=v19.0

# Public API base — used to build the data-deletion status URL.
API_PUBLIC_URL=https://api.flexiopage.com

# Optional: enables BullMQ (durable queue) instead of in-process processing.
# REDIS_URL=redis://redis:6379
```

> Without `REDIS_URL`, messages are processed **in-process** (fine for low/medium
> volume). Without `ANTHROPIC_API_KEY`, the bot can't reply.

In production these are passed to the container by `docker-compose.prod.yml`
(already wired) — just fill them in the server `.env`.

---

## 2. Meta app

1. <https://developers.facebook.com> → create a **Business** app.
2. Add the products you need: **Messenger** and/or **WhatsApp**.
3. **Settings → Basic**: copy **App ID** → `FACEBOOK_APP_ID`, **App Secret** →
   `FACEBOOK_APP_SECRET`.
4. Fill the review URLs (already live once deployed):
   - Privacy policy: `https://flexiopage.com/privacy-policy`
   - Terms of service: `https://flexiopage.com/terms-of-service`
   - Data deletion instructions: `https://flexiopage.com/data-deletion`
   - Data deletion callback: `https://api.flexiopage.com/api/messenger-bot/data-deletion`

For local testing, expose the backend with a tunnel:
```bash
ngrok http 5050        # or: cloudflared tunnel --url http://localhost:5050
```
Use the public tunnel URL in place of `https://api.flexiopage.com` below.

---

## 3. Messenger

1. Meta app → **Messenger → Settings**.
2. **Webhooks** → callback URL `https://api.flexiopage.com/webhook/messenger`,
   verify token = `MESSENGER_VERIFY_TOKEN`, subscribe to **`messages`** and
   **`messaging_postbacks`**.
3. In FlexioPage: **Dashboard → Applications → Messenger Bot → Connecter
   Facebook** → authorize → pick the Page. The page is auto-subscribed and its
   token stored encrypted.
4. Configure language/country/persona/shipping, then **test live**.

> In Development mode, only app admins/testers can message the bot. Submit for
> review (`pages_messaging`) to go public.

---

## 4. WhatsApp

1. Meta app → **WhatsApp → API Setup**: note the **Phone number ID**, generate
   an **access token**, and add a recipient test number.
2. **WhatsApp → Configuration → Webhook**: callback URL
   `https://api.flexiopage.com/webhook/whatsapp`, verify token =
   `MESSENGER_VERIFY_TOKEN`, subscribe to **`messages`**.
3. In FlexioPage: **Dashboard → Applications → WhatsApp Bot → Connecter** →
   paste the **Phone number ID** + **access token** (validated server-side,
   stored encrypted).
4. Configure + test live.

> The temporary token expires in 24h — for production, generate a **permanent
> token** (System User in Business Settings) and reconnect.

---

## 5. Local end-to-end test (no Meta needed)

```bash
cd flexiopage-backend
npm run seed:test-store      # once
npm run seed:messenger-bot   # creates a test BotConfig + syncs indexes
npm run test:messenger-bot   # exercises the shared brain (darija + order)
```
Requires a valid `ANTHROPIC_API_KEY` for the conversation turns. The send step
is skipped in test (`MESSENGER_DRY_RUN`).

---

## 6. How it works (architecture)

- **One brain, two channels.** `claude.service`, `catalog.service`,
  `orderCreation.service`, prompts, tools and the worker are channel-agnostic.
- `BotConfig.channel` (`messenger` | `whatsapp`) — **one bot per store per
  channel**. Tokens stored encrypted (AES-256-GCM).
- Webhooks (`/webhook/messenger`, `/webhook/whatsapp`) verify the
  `X-Hub-Signature-256` over the raw body, persist the inbound message, then
  enqueue. The worker loads the config, runs Claude with tools, and replies via
  the matching channel API.
- **Order creation** reuses `orderService.createOrder` (COD) — no duplication.
- Idempotent, audited (`BotUsage`), and rate-limited per plan.

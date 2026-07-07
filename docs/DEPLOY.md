# Deploying Dukaan AI to Render

This guide walks you through deploying **Dukaan AI** (Express dashboard + Telegram
bot, booted together from `npm start`) to [Render](https://render.com) on the free
tier. It also covers the honest limitations of that free tier and the path to a
real always-on production setup.

---

## 1. Prerequisites

- A **GitHub account** — https://github.com
- A **Render account** (free) — https://render.com (sign up with your GitHub account
  for the smoothest experience)

> You must complete the account sign-up, login, and GitHub authorization steps
> yourself in the browser — those cannot be automated.

You'll also want these secrets ready (see [step 4](#4-set-environment-variables)):

- `TELEGRAM_BOT_TOKEN` from [@BotFather](https://t.me/BotFather) (`/newbot`)
- `GEMINI_API_KEY` from https://aistudio.google.com/apikey (optional — the bot falls
  back to a rule-based mode without it)

---

## 2. Push the project to GitHub

The repo isn't on GitHub yet. From the project root:

```bash
git init
git add .
git commit -m "Dukaan AI: initial commit for deploy"
```

Create an empty repository on GitHub (via the website, or the `gh` CLI):

```bash
# Option A — GitHub CLI (creates the repo and pushes in one step)
gh repo create dukaan-ai --public --source=. --remote=origin --push

# Option B — manual: create an empty repo on github.com, then:
git remote add origin https://github.com/<your-username>/dukaan-ai.git
git branch -M main
git push -u origin main
```

> **Secrets are safe.** `.env` is listed in `.gitignore`, so your tokens are **not**
> committed or pushed. Only `.env.example` (with blank values) goes to GitHub.

---

## 3. Deploy on Render

You have two equivalent options.

### Option A — Blueprint (recommended, uses `render.yaml`)

1. In the Render dashboard, click **New +** → **Blueprint**.
2. Connect your GitHub account and select the `dukaan-ai` repo.
3. Render reads `render.yaml` and proposes one **web** service (`dukaan-ai`, Node,
   free plan) with build `npm install` and start `npm start`.
4. Click **Apply**.

### Option B — Web Service (manual)

1. Click **New +** → **Web Service** and connect the `dukaan-ai` repo.
2. Render auto-detects Node. Confirm the settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/`
   - **Instance Type:** Free
3. Click **Create Web Service**.

Once live, your app is at `https://<app-name>.onrender.com` (the dashboard is at `/`).

---

## 4. Set environment variables

In the Render dashboard, open the service → **Environment** and add the variables
below. (With the Blueprint, these are declared as `sync: false`, so Render prompts
you for their values on first deploy — nothing sensitive is stored in the repo.)

| Variable | Required? | Notes |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | **Yes** (for the bot) | From @BotFather. Without it the dashboard runs but the bot is off. |
| `GEMINI_API_KEY` | Recommended | Enables AI features (photo OCR, voice, NL queries). Without it the bot uses a rule-based fallback. |
| `GEMINI_MODEL` | Optional | Defaults to `gemini-2.0-flash` if unset. |
| `STORE_NAME` | Optional | Display name on the dashboard. |
| `TELEGRAM_OWNER_IDS` | Optional | Comma-separated Telegram IDs to lock the bot to specific owners. |
| `ADMIN_TOKEN` | Optional | Requires an `x-admin-token` header to hit `POST /api/seed`. |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` / `WHATSAPP_VERIFY_TOKEN` | Optional | Only for the (post-hackathon) WhatsApp channel. |

> Do **not** set `PORT` — Render injects it automatically and the app already binds
> to `process.env.PORT`.

After saving, Render redeploys automatically.

---

## 5. Free-tier limitations (read this before relying on it)

The free tier is great for demos, but it is **not** a durable, always-on service.
Two things you must know:

### The service sleeps — but webhook mode keeps the bot reachable

Free web services **sleep after ~15 minutes of inactivity** and take **~50 seconds
to wake** on the next incoming HTTP request.

**Good news:** this app **auto-enables webhook mode in production.** When `RENDER_EXTERNAL_URL`
is present (Render injects it automatically), the bot registers a Telegram webhook instead of
long-polling — so an incoming message **wakes the sleeping service** and is delivered after the
~50s cold start (Telegram retries, so messages aren't lost). No configuration needed.

The remaining trade-off is only the **cold-start delay** on the first message after idle. For a
snappy 24/7 bot with no cold starts, use Render's paid **Starter** instance or a keep-warm pinger.

### Data is ephemeral — it resets on redeploy

The JSON store (`data/store.json`) lives on the container's **ephemeral disk**. Every
redeploy or restart wipes it back to defaults. **Inventory and sales are not durably
persisted** on the free tier.

---

## 6. Upgrade path to production

Concrete steps to make this production-grade:

1. **Keep it always-on.**
   - Best: move to Render's paid **Starter** instance (no sleeping).
   - Workaround: a cron/uptime pinger (e.g. UptimeRobot, or a scheduled job) that
     hits `https://<app>.onrender.com/` every few minutes to keep the free instance
     awake. This is a hack, not a real fix, and can burn your free monthly hours.

2. **Webhook mode — already built in. ✅**
   The bot automatically switches from long-polling to webhooks when a public URL is
   available (`RENDER_EXTERNAL_URL` on Render, or set `PUBLIC_URL` on other hosts). It mounts
   a `/webhook/telegram` route (grammy's `webhookCallback`) and calls `setWebhook` for you, so
   each incoming message wakes the service on demand. Optionally set `TELEGRAM_WEBHOOK_SECRET`
   to have Telegram sign its webhook POSTs. Locally (no public URL) it falls back to polling.

3. **Move persistence to a managed database.**
   Replace the JSON file with a managed DB such as **Render Postgres** or
   **Supabase**. The code already isolates all storage behind `src/store.js`, so this
   is a contained change to that one module.

---

## 7. Docker alternative

A `Dockerfile` (and `.dockerignore`) are included, so you can deploy the exact same
container anywhere instead of using Render's native Node builder:

- **Render:** create the service with **Environment → Docker** (Render builds from
  the `Dockerfile`).
- **Railway / Fly.io / any container host:** point it at the repo; it builds and runs
  the image directly.

Build and run locally to sanity-check:

```bash
docker build -t dukaan-ai .
docker run -p 3000:3000 --env-file .env dukaan-ai
```

Then open http://localhost:3000.

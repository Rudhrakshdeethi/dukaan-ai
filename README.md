<div align="center">

# 🛒 Dukaan AI

### The chat-first Business OS for India's local shops

Run your entire shop from a chat — record sales by text or voice, snap a supplier bill to update stock,
get AI restock forecasts, and ask anything about your business. No app to learn, no English required.

**Built for TakeOver'26** · NIAT / NxtWave flagship hackathon · Theme: *Accelerate business growth through AI*

</div>

---

## 📖 Table of contents
- [The problem](#-the-problem)
- [What we're building](#-what-were-building)
- [Feature tour](#-feature-tour)
- [Command reference](#-command-reference)
- [Live dashboard](#-live-dashboard)
- [How it works (architecture)](#-how-it-works-architecture)
- [Quick start](#-quick-start-100-free-5-minutes)
- [Bill OCR — tested across languages](#-bill-ocr--tested-across-languages--conditions)
- [Reliability & production hardening](#-reliability--production-hardening)
- [What about WhatsApp?](#-what-about-whatsapp)
- [Project structure](#-project-structure)
- [Roadmap](#-roadmap)

---

## 🔴 The problem

India has **~60 million small shops** — kirana stores, pharmacies, salons, vegetable vendors. Almost all
of them run on a **paper notebook, a calculator, and WhatsApp**. They don't use software because it's:

- **Too complex** — POS/ERP tools assume training, staff, and setup they don't have.
- **English-only** — most owners are more comfortable in Hindi, Telugu, Tamil, or Hinglish.
- **Expensive & overkill** — they need to track stock and sales, not run SAP.

Result: no idea what's selling, surprise stock-outs, money lost to bad record-keeping.

## 🟢 What we're building

**Dukaan AI turns the chat app the owner already uses into their whole back-office.** They just *talk to it*:

> **Owner:** "becha 3 maggi 2 milk"
> **Dukaan AI:** *Sale recorded — Maggi ×3, Milk ×2. Total ₹98. ⚠️ Low stock: Milk (1)*

> **Owner:** _(sends a photo of a handwritten supplier bill)_
> **Dukaan AI:** *I read this bill — please confirm before I add to stock: …*

Behind the chat, a **live web dashboard** shows revenue, inventory, top sellers, low-stock alerts, and an
**AI restock forecast** — the real-time control panel the shop never had.

The guiding principle: **the AI proposes, the owner confirms.** Nothing touches inventory without a
one-tap confirmation, so it's trustworthy with real stock and money.

---

## ✨ Feature tour

| Capability | What the owner does | What happens |
|---|---|---|
| 🧾 **Record sales** | "sold 3 maggi 2 milk" (or Hinglish, or a 🎤 voice note) | Sale logged, stock decremented, bill total shown |
| 📷 **Bill-to-stock OCR** | Sends a photo of a supplier bill | AI reads items → **asks to confirm** → adds to stock |
| ✅ **Confirm-before-save** | Reviews the read-back, replies "yes" | Only then is stock written; unclear lines flagged `⚠️ check` |
| 📉 **Low-stock alerts** | _(automatic)_ | Warns after any action when items dip below reorder level |
| 🔮 **AI restock forecast** | "insights" | Predicts which items run out and when, at today's sell-through |
| 💬 **Ask anything** | "how much did I earn today?" | Natural-language answer from live data (in the owner's language) |
| ✏️ **Manage catalog** | "price maggi 16", "reorder milk 10", "remove maggi" | Instant edits, no menus |
| ↩️ **Undo mistakes** | "undo" | Reverses the last sale or restock |
| 🛍️ **Customer orders** | Customer sends "menu" then "order 2 milk 1 bread" | Owner gets an accept/reject request; on accept, stock deducts & customer is notified |
| 📊 **Live dashboard** | Opens the web console | Real-time revenue, inventory, charts, restock plan, **pending orders** |
| 🌏 **Any language** | Hindi / Telugu / Tamil / English / Hinglish | Item names auto-normalize to clean English |

---

## ⌨️ Command reference

Everything is natural language, but these shortcuts always work:

| Command | Does |
|---|---|
| `sold 3 maggi 2 milk` | Record a sale |
| `add 10 bread at 40` | Add stock (also: send a bill photo) |
| `stock` or `/stock` | Show inventory + today's summary |
| `insights` or `/insights` | AI restock forecast & plan |
| `price maggi 16` | Set an item's price |
| `reorder milk 10` | Set the low-stock alert level |
| `remove maggi` | Delete an item from the catalog |
| `undo` | Reverse the last sale/restock |
| `how much did I earn today?` | Ask any question about the business |
| `/reset` | Reset to demo data (clean slate for a demo) |

**Customer-facing** (anyone messaging the shop):

| Command | Does |
|---|---|
| `menu` / `catalog` | Browse in-stock items and prices |
| `order 2 milk 1 bread` | Place an order → owner gets an accept/reject request |

**Owner order management:** `orders` (list pending) · `accept <id>` (fulfill → deducts stock, notifies customer) · `reject <id>`.

---

## 📊 Live dashboard

Open **http://localhost:3000** — a real-time SaaS-style console:

- **KPIs:** revenue today, orders, total stock value, low-stock alerts
- **Inventory table** with search, per-item stock value, and In-stock / Low badges
- **Top sellers** bar chart
- **Low stock** panel + **AI Restock plan** (predicted days-of-stock left)
- **Recent activity** feed
- Sidebar shows **live channel + AI status**

Updates every 3 seconds — send a message to the bot and watch it change live.

---

## 🏗 How it works (architecture)

```
 Telegram ─┐                                            ┌─▶  store.js   (JSON inventory / sales)
           ├─▶  channel adapter  ─▶  brain.js  ─────────┤
 WhatsApp ─┘   (telegram.js /       (all bot logic:     └─▶  ai.js  ─▶  Gemini
                whatsapp.js)         sales, stock,            (OCR · voice · intent · Q&A,
                                     confirm-flow,             with model-fallback + retry)
                                     insights, edits)
                                          │
                                          └─▶  Express (server.js)  ─▶  /api/state  ─▶  live dashboard
```

- **`brain.js` is channel-agnostic** — it knows nothing about Telegram or WhatsApp. Swapping the adapter
  is all it takes to change channel. This is what makes the project genuinely "WhatsApp-ready."
- **`ai.js`** wraps Gemini with graceful degradation: if there's no API key it falls back to a rule-based
  parser, so the bot never hard-fails.
- **`store.js`** is a tiny atomic JSON store (zero native deps) — swap for Postgres/Supabase later.

---

## 🚀 Quick start (100% free, ~5 minutes)

**Prerequisites:** Node.js 18+ (works on 24).

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

Fill in `.env`:

1. **Telegram bot token** — open [@BotFather](https://t.me/BotFather) → `/newbot` → paste the token into `TELEGRAM_BOT_TOKEN`. *(free, instant)*
2. **Gemini API key** — get one free at <https://aistudio.google.com/apikey> → put it in `GEMINI_API_KEY`. *(enables photo OCR, voice & smart answers)*

```bash
npm start
```

- Dashboard → **http://localhost:3000**
- Open your bot in Telegram, send `/start`, and try the commands above.

> **No keys?** It still runs. Without `GEMINI_API_KEY` the bot works in rule-based mode (text sales/stock);
> without `TELEGRAM_BOT_TOKEN` the dashboard runs standalone.

---

## 🌏 Bill OCR — tested across languages & conditions

We ran **16 bills** through the OCR pipeline (harness: `node test/ocr-test.mjs`; samples in `test/assets/`).
Full honest write-up: [`test/OCR-FINDINGS.md`](test/OCR-FINDINGS.md).

| Bill type | Language / condition | Result |
|---|---|---|
| Kirana, pharmacy, grocery | Hindi · Telugu · Tamil · English (clean) | ✅ 27/27 items |
| Various | Blurry / dark / faded / noisy / low-res | ✅ read correctly |
| Doctor's prescription | Cursive English handwriting | ✅ 5/5 names |
| Order slips | Handwritten Hindi & Tamil | ✅ correct |
| Tilted bill | Extreme 9° skew | ⚠️ rows can misalign |
| Marathi list | Native Devanagari numerals (३ ४५) + blur | ⚠️ digits can misread |

**Honest takeaway:** item names in *any* script and Latin/Arabic numerals are rock-solid even when
degraded. The genuine failure modes — heavy skew and native-script digits on blurry photos — are exactly
what **confirm-before-save** catches. OCR is a strong *assist*, never a blind *autopilot*.

---

## 🛡️ Reliability & production hardening

- **Confirm-before-save** on every bill; unclear/missing values render `⚠️ check`; null quantities are never auto-saved.
- **Gemini model-fallback chain** (`2.5-flash → 2.5-flash-lite → flash-latest`) — free-tier quota is
  per-model per-day, so on a `429` we transparently fall back and keep running.
- **Retry-with-backoff** on transient `5xx` errors.
- **Atomic JSON writes** (temp file + rename) so a crash can't corrupt data.
- **NaN/qty guards** — a sale or restock with an unreadable quantity is skipped, not written as garbage.
- **Confirmation TTL** — abandoned pending confirmations expire after 15 min.
- **Opt-in access control** (default open for demos):
  - `TELEGRAM_OWNER_IDS=id1,id2` → bot only responds to the shop owner.
  - `ADMIN_TOKEN=…` → protects the data-reset endpoint.
- **Graceful degradation** — no API key ⇒ rule-based mode; it never hard-fails on stage.

---

## 💬 What about WhatsApp?

Same product, one file swapped. We **demo on Telegram** because it's free and instant; WhatsApp Cloud API
needs Meta **business verification** (days), so it can't be demoed inside a 24h hackathon.
`src/channels/whatsapp.js` already contains the complete adapter + webhook — after verification:

1. developers.facebook.com → new app → add **WhatsApp** product.
2. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN` in `.env`.
3. Point the Meta webhook to `https://<your-host>/webhook/whatsapp`.
4. `brain.js` runs unchanged. Free tier: 1,000 conversations/month.

---

## ☁️ Deploy

Deploy-ready for **Render** (or any container host) — see the step-by-step guide in
[`docs/DEPLOY.md`](docs/DEPLOY.md). Includes `render.yaml` (Blueprint), a `Dockerfile`, and honest
notes on the free tier: the service **sleeps after ~15 min idle** (a polling bot goes offline until
woken by an HTTP hit) and the JSON store is **ephemeral** (resets on redeploy). The guide covers the
upgrade path to always-on + webhooks + a managed DB.

## 📁 Project structure

```
src/
  server.js              Express: dashboard API + boots the bot
  brain.js               channel-agnostic bot logic (sales, stock, confirm-flow, insights, edits, undo)
  ai.js                  Gemini calls + model-fallback + rule-based fallbacks
  store.js               atomic JSON store (inventory, sales, restocks, insights)
  channels/
    telegram.js          Telegram adapter (the demo channel)
    whatsapp.js          WhatsApp adapter (ready, needs Meta verification)
public/                  live dashboard (HTML + Chart.js)
test/
  ocr-test.mjs           OCR accuracy harness
  OCR-FINDINGS.md        honest cross-language OCR test report
  assets/                sample bills + dashboard screenshots
docs/
  ROADMAP.md             product PRD & roadmap
  DEPLOY.md              Render / container deployment guide
DEMO.md                  3-minute stage demo script
render.yaml · Dockerfile · .dockerignore   deployment config
.env.example             configuration template
```

---

## 🗺 Roadmap

Full PRD in [`docs/ROADMAP.md`](docs/ROADMAP.md). In brief:

- **Now (shipped):** AI restock insights, catalog edits + undo, multi-language OCR, production hardening.
- **Next:** per-shop multi-tenancy + owner auth, customer-ordering flow, public deploy + daily summary push.
- **Later:** GST reports/export, staff accounts, supplier reordering, payments, WhatsApp in production.

---

<div align="center">

**Dukaan AI** — built for **TakeOver'26**, NIAT's flagship hackathon.
Helping local shops digitize, one chat at a time.

</div>

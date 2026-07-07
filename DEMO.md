# 🎬 Dukaan AI — 3-Minute Stage Demo Script

Goal: show a judge that a real shopkeeper could run their whole store from chat — in any language — in under 3 minutes.

## Before you go on stage
1. `npm start` (bot + dashboard boot; console should say **AI: ON (Gemini)**).
2. Open the **dashboard** on the projector: http://localhost:3000
3. Open the **bot chat** on your phone: `@dukaan_ai_niat_takeover26_bot`
4. In the bot, send `/reset` → clean demo inventory. Click **Reset demo data** on the dashboard too.
5. Have 2–3 **bill photos** ready in your camera roll (see `test/assets/` — a Hindi, a Telugu, and a handwritten one make the best story).

## The run

**0:00 — The problem (say it, don't build it)**
> "Meet Ramesh. He runs a kirana store on a notebook and WhatsApp. No software — too complex, wrong language, no time. Here's his entire back-office, in chat."

**0:20 — Record a sale by voice/text** *(point at the dashboard)*
- Send: `sold 3 maggi 2 milk`
- 👉 Bot replies with the bill; **dashboard revenue + top-sellers update live.**

**0:40 — Speak his language (the differentiator)**
- Send (Hinglish): `bhai aaj kitna becha aur kya sabse zyada bika?`
- 👉 Bot answers in Hinglish. "No English required."

**1:05 — Snap a supplier bill (the wow)**
- Send a **photo of a Hindi/Telugu handwritten bill**.
- 👉 Bot: "Reading the bill…" then lists items it extracted.

**1:30 — The trust moment (confirm-before-save)**
> "Notice it doesn't blindly save. AI can misread a messy 7 as a 1 — so it shows what it read, flags anything it's unsure of with ⚠️, and waits for a yes. That's the difference between a toy and something a shop owner can trust with their stock."
- Reply: `yes` → 👉 **stock updates on the dashboard.**

**1:55 — It watches the business (AI insight)**
- Send: `insights`
- 👉 Bot returns an **AI restock plan**: "Maggi — 4 left · ~0.2 days", "Milk — 1 left · ~0.5 days".
- Point at the matching **Restock plan** card on the dashboard.
> "It doesn't just record the past — it forecasts. Based on today's sell-through it tells Ramesh
> exactly what to reorder and when, before he runs out. That's the Analytics theme, done for a
> shopkeeper who'd never open a spreadsheet."

**2:15 — Close on reach**
> "It's on Telegram today because it's instant and free. The bot logic is channel-agnostic — the same code runs on **WhatsApp** (adapter's already written). A shopkeeper needs zero new apps, zero training, zero English. That's how you actually digitize India's 60 million small shops."

**2:40 — One line on tech**
> "Node, a channel adapter, and Gemini for vision + voice + language. Verified reading bills in **Hindi, Telugu, Tamil, English and handwriting — 27 out of 27 line items correct.**"

## Bonus beat — customer ordering (the second persona)
If you have 30 more seconds, show the demand side:
- _(as a customer)_ send `menu` → the bot lists in-stock items + prices.
- send `order 3 maggi 2 eggs` → "Order #… placed — the shop will confirm shortly."
- 👉 the **Pending orders** card lights up on the dashboard.
- _(as the owner)_ send `accept <id>` → stock deducts, it becomes a sale, and the customer is notified.
> "Same bot, two sides of the shop — the owner runs the back office, customers order from the front.
> No app, no website. Just chat."

## If Wi-Fi dies (backup plan)
- The bot degrades to rule-based mode automatically — text sales/stock still work with **no internet/AI**.
- Keep this repo's `test/assets/` screenshots + a screen-recording of a full run as a fallback.

## Judge Q&A — quick answers
- **"Does OCR really handle bad handwriting?"** → "Vision LLMs read neat handwriting well and messy poorly — so we never trust it blindly. Confirm-before-save + ⚠️ flags turn that limitation into a reliability feature."
- **"Why not WhatsApp live?"** → "WhatsApp Cloud API needs Meta business verification (days). Same code, one adapter — here's the file. Telegram let us ship in 24h."
- **"What's the business model?"** → "Freemium: free for one shop, paid tiers for multi-outlet, staff accounts, GST reports, supplier ordering."

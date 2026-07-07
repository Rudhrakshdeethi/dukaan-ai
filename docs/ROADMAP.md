# Dukaan AI — Product Roadmap & PRD

*Chat-first Business OS for India's local shops · TakeOver'26 (NIAT / NxtWave) · Theme: "Accelerate business growth through AI"*

---

## 1. Vision & Mission

Every small shopkeeper in India already runs their business on chat and a notebook. **Dukaan AI turns that same chat into a full back-office** — record sales by text or voice, add stock by photographing a supplier bill, get low-stock alerts and AI insights, and ask questions in plain Hinglish — with a live web dashboard on the side. Our mission is to digitize India's ~60 million small shops with **zero new app, zero training, and zero English required**.

---

## 2. Problem

India's ~60M kirana and local shops run on paper, notebooks and WhatsApp — and stay that way because existing software doesn't fit them.

- **Chaos, not records.** Sales in a notebook and WhatsApp threads mean no reliable inventory, no daily numbers, and frequent "sold out" surprises.
- **Existing POS/ERP software doesn't fit.** It's complex, English-only, and expensive — a non-starter for a one-person shop with no time to learn a new app.
- **The tools ignore how owners actually work.** Owners live in chat and speak Hinglish; asking them to switch to a form-based dashboard is the reason adoption fails.

---

## 3. Target Users / Personas

| Persona | Who | Needs |
|---|---|---|
| **Ramesh — kirana owner** *(primary)* | Runs a neighbourhood grocery on a notebook + WhatsApp; comfortable in Hindi/Hinglish, not English or software. | Log sales fast, know today's revenue and stock, never run out of fast-movers — without learning an app. |
| **The customer** *(secondary)* | Buys from Ramesh; today calls or walks in. | (Future) place an order over chat, see availability. |
| **Shop staff / helper** *(secondary)* | Helps Ramesh at the counter. | (Future) log sales under their own login, with the owner keeping oversight. |

---

## 4. What We've Built (v1 — shipped)

All features below are live in the codebase (`src/brain.js`, `src/ai.js`, `src/store.js`) and demoed on Telegram (WhatsApp adapter ready, pending Meta verification).

| Capability | Detail |
|---|---|
| **Chat sales** | `sold 3 maggi 2 milk` records the sale, decrements stock, returns a bill total; unknown/out-of-stock lines are flagged, never silently dropped. |
| **Text + voice, Hinglish** | Gemini intent-parsing understands mixed Hindi/English (`becha do milk`); voice notes are transcribed then run through the same logic. |
| **Bill OCR + confirm-before-save** | Photo of a supplier bill → Gemini vision extracts line items → owner must reply `yes` before anything is written. Low-confidence / missing values render as `⚠️ check`; null-quantity lines are never auto-saved. |
| **Low-stock alerts** | Automatic nudge after every action when items fall to/below their reorder level (default 5). |
| **AI insights / forecast** | `insights` predicts stock-outs from today's sell-through (days-left estimate) and lists items below reorder level with a restock tip. |
| **Quick edits** | Deterministic commands run before AI for reliability: `price maggi 16`, `remove maggi`, `reorder milk 10`, and `undo` (reverses the last sale or restock). |
| **Natural-language queries** | `how much did I earn today?` answered from live store data; falls back to deterministic today's-numbers if AI is unavailable. |
| **Live dashboard** | `http://localhost:3000` shows revenue, orders, inventory, top sellers and recent sales in real time via `/api/state`. |
| **Model-fallback reliability** | Chain `gemini-2.5-flash → 2.5-flash-lite → flash-latest` (free-tier quota is per-model/day) with retry-with-backoff on 5xx, and rule-based degradation when no API key is present — the bot never hard-fails. |

**Verified:** OCR read **27/27 line items correctly** across 6 clean bills (Hindi, Telugu, Tamil, English, handwritten, thermal).

---

## 5. Success Metrics

| Category | Metric | Why it matters |
|---|---|---|
| **Activation** | Time-to-first-sale-logged (target: < 2 min from `/start`) | Proves the "zero learning curve" promise. |
| **Activation** | % of new shops that log ≥ 1 sale on day 1 | Onboarding health. |
| **Retention** | Daily / weekly active shops (DAS / WAS) | Core stickiness of a daily-use tool. |
| **Retention** | Week-4 shop retention | Whether it becomes the shop's habit, not a novelty. |
| **Engagement** | % of sales logged via the bot (vs. off-system) | How much of the real business we actually capture. |
| **Engagement** | Bills OCR'd per shop / week; confirm-accept rate | Adoption of the vision feature and trust in it. |
| **Engagement** | Voice + Hinglish message share | Validates the regional-language bet. |
| **Business outcome** | Stock-outs prevented (low-stock alert → restock within N days) | The tangible "grew my business" story. |
| **Business outcome** | Restock lead-time reduction on fast-movers | Insights turning into action. |

---

## 6. Roadmap

| Horizon | Item | Rationale |
|---|---|---|
| **NOW** *(shipped / shipping)* | AI insights & stock-out forecast | Turns raw data into a restock decision the owner can act on. |
| **NOW** | Undo + quick edits (price / remove / reorder) | Trust: any mistake is one message to fix. |
| **NOW** | Docs (README, DEMO, OCR-FINDINGS) & this roadmap | Judge-ready and contributor-ready. |
| **NEXT** | Per-shop multi-tenancy + owner auth | Top production gap — today the store is single-tenant/global; each shop needs isolated data and a login. |
| **NEXT** | Customer ordering flow | Opens a second side of the marketplace-of-one: customers order over chat. |
| **NEXT** | Deploy (hosted) + daily summary push | Always-on bot + a proactive end-of-day revenue/stock recap. |
| **LATER** | GST reports / export | Compliance and accountant hand-off for growing shops. |
| **LATER** | Staff accounts | Helpers log sales under their own login with owner oversight. |
| **LATER** | Supplier reordering | Close the loop: low-stock alert → one-tap reorder to the supplier. |
| **LATER** | Payments | Collect and reconcile payments in the same chat. |
| **LATER** | WhatsApp production | Adapter is written; ship after Meta business verification for reach. |

---

## 7. Known Limitations & Risks

| Risk | Detail (from `test/OCR-FINDINGS.md`) | Mitigation |
|---|---|---|
| **Single-tenant / no auth** *(top production gap)* | The store is one global dataset with no per-shop isolation or owner login — fine for a demo, blocking for real deployment. | Multi-tenancy + owner auth is the #1 NEXT item; JSON store designed to swap for Supabase/Postgres. |
| **Heavy skew (> ~8°) → row misalignment** | On a tilted bill, quantity/price can attach to the wrong item. | Prompt enforces row-integrity; **confirm-before-save** surfaces every result for human review before writing to stock. |
| **Native Indic digits on degraded images misread** | Devanagari/Telugu/Tamil numerals on blurry/faded images can misread (e.g. 45→85, 280→250), sometimes over-confidently. | Prompt flags native-numeral + degraded regions as lower confidence; unclear values render as `⚠️ check`; null quantities are never auto-saved. |
| **Free-tier quota limits** | Gemini free tier is per-model, per-day (~20 req/day/model on the demo key). | Model-fallback chain + retry-with-backoff; rule-based degradation keeps text sales/stock working with no key. |
| **In-memory pending state** | Confirmation state is in-memory per conversation — lost on restart. | Acceptable for demo; move to persistent store alongside multi-tenancy. |

**Design principle:** OCR is a strong *assist*, not a blind *autopilot* — the AI proposes, the owner confirms. That is what makes it trustworthy with real inventory.

---

## 8. Non-Goals

We are deliberately **not** building:

- **A full accounting / ERP suite** — no ledgers, payroll, or tax filing; we hand off via GST export, not replace an accountant.
- **A consumer marketplace / discovery platform** — this is the shop's back-office, not an aggregator competing with delivery apps.
- **A general-purpose chatbot** — every AI capability maps to a concrete shop action (sale, stock, insight, query); no open-ended conversation.
- **A new app to install or learn** — we meet owners inside chat they already use; a native mobile app is explicitly out of scope.

# OCR Stress-Test Findings

Honest results from running the bill-OCR pipeline (`test/ocr-test.mjs` + degraded/scribbled
variants) against 16 bills spanning languages, business types, image quality and handwriting.
Sample images in `test/assets/`.

## Summary

| Category | Result |
|---|---|
| Clean printed bills (Hindi/Telugu/Tamil/English, table & thermal) | ✅ 27/27 line items correct |
| Blurry / dark / faded / noisy / low-res printed bills | ✅ read correctly (4/4 each) |
| Cursive English doctor's prescription (Azithral, Amoxyclav, Dolo…) | ✅ 5/5 names correct |
| Handwritten Hindi & Tamil order slips | ✅ items + Arabic numerals correct |
| **Extreme 9° skew** (tilted bill) | ⚠️ row misalignment — values shift between rows |
| **Native Devanagari numerals (३ ४५ २८०) on blurry image** | ⚠️ digits misread (45→85, 280→250) |

## What works reliably
- **Item names in any script** — Devanagari, Telugu, Tamil, and messy Latin cursive all read
  and normalize to clean English. This is rock-solid.
- **Arabic/Latin numerals** — correct even when blurry, dark, faded, noisy or low-resolution.
- **Printed bills** — near-perfect regardless of visual degradation short of illegibility.

## Known failure modes (and mitigations)
1. **Heavy skew (>~8°) causes row misalignment** — quantity/price can attach to the wrong item.
   *Mitigation:* prompt enforces row-integrity; **confirm-before-save** surfaces the result for
   human review before anything is written to stock.
2. **Native Indic digits on degraded images get misread, sometimes with over-confidence.**
   *Mitigation:* prompt flags native-numeral + degraded regions as lower confidence; unclear
   values render as `⚠️ check` in the confirmation; null quantities are never auto-saved.

## Production hardening added as a result
- **Model fallback chain** (`gemini-2.5-flash → 2.5-flash-lite → flash-latest`): free-tier quota
  is **per-model per-day** (this key = 20 req/day/model), so on a 429 we transparently fall back
  to the next model. Combines quotas and keeps the demo alive under bursts.
- **Retry-with-backoff** on 5xx.
- **Confirm-before-save** always on for photos; unclear/missing values flagged; null-qty lines
  are skipped on commit with a prompt to re-enter them.

## Takeaway for the pitch
OCR is a strong *assist*, not a blind *autopilot* — the product is explicitly designed so the AI
proposes and the shop owner confirms. That's what makes it trustworthy with real inventory, and
it's an honest, defensible answer to "what if the AI misreads?"

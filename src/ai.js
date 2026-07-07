// AI layer: Gemini (free tier) for intent parsing, bill OCR and NL queries.
// Every function degrades gracefully to a rule-based fallback when GEMINI_API_KEY
// is absent or the API errors — so the demo NEVER hard-fails on stage.
const KEY = process.env.GEMINI_API_KEY;
// Free-tier daily quota is PER MODEL, so we keep a fallback chain: when one model's
// daily cap (or a burst limit) is hit, we transparently fall back to the next. This
// combines several models' free quotas and keeps the demo alive.
const MODELS = [
  ...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []),
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
].filter((m, i, a) => a.indexOf(m) === i);

const urlFor = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

export const aiEnabled = () => Boolean(KEY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gemini(parts, { json = true } = {}) {
  if (!KEY) throw new Error('no-key');
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: json ? { responseMimeType: 'application/json' } : {},
  });

  let lastErr;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(urlFor(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body,
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        return json ? JSON.parse(text) : text;
      }
      lastErr = new Error(`gemini ${model} ${res.status}`);
      if (res.status === 429) break; // daily/burst cap for this model → try next model
      if (res.status < 500) throw lastErr; // client error → don't retry
      await sleep(1000 * 2 ** attempt); // 5xx → brief backoff, then retry same model
    }
  }
  throw lastErr; // every model exhausted
}

// ---- Intent parsing ----------------------------------------------------

const INTENT_PROMPT = `You are the parser for a small Indian shop's assistant.
The owner types short messages, often in Hinglish / mixed languages (e.g. "becha 3 maggi",
"sold do milk", "add 10 bread at 40"). Convert the message into JSON:
{
  "action": "sale" | "restock" | "report" | "query" | "unknown",
  "items": [ { "name": "<english item name, Title Case>", "qty": <int>, "price": <number or null> } ],
  "question": "<the question text, only when action=query>"
}
Rules:
- "sold / becha / bik gaya / -N" => action "sale".
- "add / added / restock / bought / aaya / naya stock" => action "restock".
- "stock / inventory / kitna bacha / report / sales / today" with no items => "report".
- A natural question about the business ("how much did I earn today?") => "query".
- Map Hindi number words (do=2, teen=3, char=4, paanch=5) to digits.
- If unsure, use "unknown". Output ONLY the JSON.`;

const NUM_WORDS = { ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, che: 6, saat: 7, aath: 8 };

// Rule-based fallback parser — crude but keeps the bot usable offline.
function fallbackParse(text) {
  const t = text.toLowerCase().trim();
  if (/^(stock|inventory|report|sales|today|kitna)\b/.test(t) && !/\d/.test(t))
    return { action: 'report', items: [] };
  if (/[?]|how much|kitna|kitni|total/.test(t) && !/\badd|sold|becha/.test(t))
    return { action: 'query', items: [], question: text };

  let action = 'unknown';
  if (/\b(add|added|restock|bought|aaya|naya)\b/.test(t)) action = 'restock';
  else if (/\b(sold|sale|becha|bik|bech)\b/.test(t)) action = 'sale';

  // Pull "<qty> <name>" or "<name> <qty>" pairs, plus optional "at <price>".
  const items = [];
  const priceMatch = t.match(/(?:at|@|rs|₹)\s*(\d+)/);
  const price = priceMatch ? Number(priceMatch[1]) : null;
  const cleaned = t
    .replace(/(?:at|@|rs|₹)\s*\d+/g, ' ') // drop the price phrase so its number isn't read as a qty
    .replace(/\b(add|added|restock|bought|sold|sale|becha|bik|bech|aaya|naya|stock|at|rs|@)\b/g, ' ')
    .replace(/₹/g, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const qty = NUM_WORDS[tokens[i]] ?? (/^\d+$/.test(tokens[i]) ? Number(tokens[i]) : null);
    if (qty != null) {
      const name = tokens[i + 1] && !/^\d+$/.test(tokens[i + 1]) ? tokens[i + 1] : tokens[i - 1];
      if (name && !/^\d+$/.test(name))
        items.push({ name: name[0].toUpperCase() + name.slice(1), qty, price });
    }
  }
  if (items.length && action === 'unknown') action = 'sale';
  return { action, items, question: text };
}

export async function parseIntent(text) {
  try {
    const out = await gemini([{ text: `${INTENT_PROMPT}\n\nMessage: "${text}"` }]);
    if (!out.items) out.items = [];
    return { ...out, _via: 'ai' };
  } catch {
    return { ...fallbackParse(text), _via: 'fallback' };
  }
}

// ---- Bill OCR (photo) --------------------------------------------------

const OCR_PROMPT = `This is a photo of a supplier bill / stock list from an Indian shop.
It may be printed or handwritten, in mixed languages, messy, blurry, dark, faded,
noisy, tilted or low-resolution.
Extract line items as JSON:
{ "items": [ { "name": "<item, Title Case English>", "qty": <int or null>, "price": <number or null>,
              "confidence": "high" | "medium" | "low" } ] }

CRITICAL RULES — accuracy over completeness:
1. ROW INTEGRITY: read strictly row by row. An item's quantity and price belong to the
   SAME horizontal line as its name. If the image is tilted or skewed, mentally straighten
   it first and re-check alignment. NEVER borrow a value from an adjacent row.
2. NO GUESSING: if a quantity or price is missing, cut off, or you are not confident you
   read the digits correctly, set that value to null. Do not invent plausible numbers.
3. CONFIDENCE HONESTY: any item with a null qty/price, or read from a blurry/skewed/faded/
   low-light region, MUST be "medium" or "low" — never "high". Reserve "high" only for
   values you can read cleanly and unambiguously.
4. NATIVE-SCRIPT DIGITS: numbers written in Devanagari (०१२३४५६७८९), Telugu, Tamil or other
   Indic numerals are easy to misread when the image is blurry or faded — if you see native
   digits in a degraded region, set that value's confidence to "medium" or "low".
5. If the whole image is unreadable, return { "items": [] }.

Output ONLY the JSON.`;

export async function ocrBill(base64, mime = 'image/jpeg') {
  try {
    const out = await gemini([
      { text: OCR_PROMPT },
      { inline_data: { mime_type: mime, data: base64 } },
    ]);
    return { items: out.items || [], _via: 'ai' };
  } catch (e) {
    return { items: [], error: e.message === 'no-key' ? 'no-key' : 'ocr-failed', _via: 'fallback' };
  }
}

// ---- Voice transcription ----------------------------------------------

export async function transcribeAudio(base64, mime = 'audio/ogg') {
  try {
    const text = await gemini(
      [
        { text: 'Transcribe this shopkeeper voice note verbatim (keep Hinglish as spoken).' },
        { inline_data: { mime_type: mime, data: base64 } },
      ],
      { json: false }
    );
    return text.trim();
  } catch {
    return null;
  }
}

// ---- Natural-language business query ----------------------------------

export async function answerQuery(question, context) {
  try {
    const text = await gemini(
      [
        {
          text: `You are a shop assistant. Answer the owner's question in ONE short line
using ONLY this JSON data. Use ₹ for money. Be concrete.

DATA: ${JSON.stringify(context)}

Question: ${question}`,
        },
      ],
      { json: false }
    );
    return text.trim();
  } catch {
    // Fallback: answer the most common question (today's numbers) deterministically.
    return `Today: ${context.today.orders} orders, ₹${context.today.revenue} revenue.`;
  }
}

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { ocrBill } from '../src/ai.js';

const CASES = [
  { f: 'b1.jpg', label: 'Hindi kirana (Devanagari, printed table)', expect: 5 },
  { f: 'b2.jpg', label: 'Pharmacy (English, bordered)', expect: 5 },
  { f: 'b3.jpg', label: 'Telugu vegetables (Telugu script)', expect: 4 },
  { f: 'b4.jpg', label: 'Hinglish handwritten (cursive, rotated)', expect: 5 },
  { f: 'b5.jpg', label: 'Tamil store (Tamil script)', expect: 4 },
  { f: 'b6.jpg', label: 'Snacks thermal receipt (monospace)', expect: 4 },
];

for (const c of CASES) {
  const b64 = readFileSync(new URL('../' + c.f, import.meta.url)).toString('base64');
  const t0 = Date.now();
  const out = await ocrBill(b64, 'image/jpeg');
  const ms = Date.now() - t0;
  const n = out.items.length;
  const ok = n === c.expect ? '✅' : '⚠️ ';
  console.log(`\n${ok} ${c.label}  —  read ${n}/${c.expect} items  (${ms}ms, via ${out._via})`);
  for (const it of out.items) {
    const conf = it.confidence ? ` [${it.confidence}]` : '';
    console.log(`     • ${it.name} ×${it.qty} @ ₹${it.price ?? '?'}${conf}`);
  }
  if (out.error) console.log('     error:', out.error);
}

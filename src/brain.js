// Channel-agnostic bot brain. Telegram and WhatsApp adapters both call these
// functions — no Telegram/WhatsApp specifics leak in here. THIS is what makes the
// project "WhatsApp-ready": swap the adapter, keep the brain.
import * as store from './store.js';
import { parseIntent, ocrBill, transcribeAudio, answerQuery, aiEnabled } from './ai.js';

// Proactive sender hook — lets the brain push messages to a chat WITHOUT knowing
// about Telegram/WhatsApp. The adapter registers fn(chatId, text); all uses are guarded.
let sender = null;
export function setSender(fn) {
  sender = fn;
}

// The shop owner's chat id (first entry of the allowlist), used to route order notices.
const ownerId = () =>
  (process.env.TELEGRAM_OWNER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0] || null;

// Per-conversation pending confirmation (human-in-the-loop). In-memory is fine for a demo.
const pending = new Map();
const PENDING_TTL = 15 * 60 * 1000; // drop abandoned confirmations after 15 min

function setPending(sessionId, payload) {
  pending.set(sessionId, { ...payload, _ts: Date.now() });
}
function sweepPending() {
  const now = Date.now();
  for (const [k, v] of pending) if (now - (v._ts || 0) > PENDING_TTL) pending.delete(k);
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const rupee = (n) => `₹${Number(n).toFixed(0)}`;

// A line needs review if a value is missing, or the model wasn't fully confident.
const needsReview = (i) =>
  i.qty == null || i.price == null || i.confidence === 'low' || i.confidence === 'medium';

const listItems = (items) =>
  items
    .map((i) => {
      const qty = i.qty == null ? '×?' : `×${i.qty}`;
      const price = i.price == null ? ' @ ₹?' : ` @ ${rupee(i.price)}`;
      return `• ${i.name} ${qty}${price}${needsReview(i) ? '  ⚠️ check' : ''}`;
    })
    .join('\n');

function lowStockNudge() {
  const low = store.getLowStock();
  if (!low.length) return '';
  return `\n\n⚠️ Low stock: ${low.map((i) => `${i.name} (${i.qty})`).join(', ')}`;
}

export const welcome = () =>
  `*Dukaan AI* — run your shop from chat.\n\n` +
  `*Record a sale*\n"sold 3 maggi 2 milk"  ·  or a voice note in Hindi/English\n\n` +
  `*Add stock*\n"add 10 bread at 40"  ·  or send a photo of a supplier bill\n\n` +
  `*Check & ask*\n"stock" for inventory  ·  "insights" for a restock plan  ·  "how much did I earn today?"\n\n` +
  `*Manage*\n"price maggi 16"  ·  "reorder milk 10"  ·  "remove maggi"  ·  "undo"\n\n` +
  `*Customers*\nSend "menu" to browse, then "order 2 milk" — you'll get a request to accept or reject.\n\n` +
  `_${aiEnabled() ? 'AI assistant is active.' : 'Running in basic mode — set GEMINI_API_KEY for photo, voice & smart answers.'}_`;

// Reset to demo inventory — handy for a clean run on stage.
export function resetDemo(reply) {
  store.seedDemo();
  return reply(`Demo data reset.\n\n${reportText()}`);
}

export function report(reply) {
  return reply(reportText());
}

export function insightsText() {
  const ins = store.getInsights(startOfToday());
  let out = '*Insights & restock plan*\n\n';
  if (ins.predicted.length) {
    out += "Running out soon (at today's pace):\n";
    out += ins.predicted
      .map((p) => `• ${p.name} — ${p.qty} left · ~${p.daysLeft.toFixed(1)} day(s)`)
      .join('\n');
    out += '\n\n';
  }
  if (ins.lowNow.length) {
    out += 'Below reorder level:\n';
    out += ins.lowNow.map((l) => `• ${l.name} (${l.qty} left)`).join('\n');
    out += '\n\n';
  }
  if (!ins.predicted.length && !ins.lowNow.length)
    out += 'All stock looks healthy — no restocks needed right now. ✅';
  else out += '_Tip: reply e.g. "add 20 milk at 28" to restock._';
  return out.trim();
}

export function insightsReply(reply) {
  return reply(insightsText());
}

// Deterministic command router — returns reply TEXT if handled, else null.
// Runs before the AI so store management is reliable and never falls through.
function matchQuickCommand(t) {
  const s = t.toLowerCase().trim();
  let m;

  if (/^\/?undo\b/.test(s)) {
    const undone = store.undoLast();
    if (!undone) return 'Nothing to undo.';
    return `Undone (${undone.type === 'sale' ? 'sale reversed' : 'restock reversed'}):\n${listItems(undone.items)}`;
  }
  if (/^\/?(insights?|forecast)\b/.test(s)) return insightsText();

  if ((m = s.match(/^price\s+(.+?)\s+₹?(\d+)$/))) {
    const it = store.setPrice(m[1], Number(m[2]));
    return it ? `Price updated — ${it.name} is now ${rupee(it.price)}.` : `"${m[1]}" isn't in your catalog.`;
  }
  if ((m = s.match(/^(?:remove|delete)\s+(.+)$/))) {
    const it = store.removeItem(m[1]);
    return it ? `Removed ${it.name} from your catalog.` : `"${m[1]}" isn't in your catalog.`;
  }
  if ((m = s.match(/^reorder\s+(.+?)\s+(\d+)$/))) {
    const it = store.setReorder(m[1], Number(m[2]));
    return it ? `Reorder alert for ${it.name} set at ${m[2]}.` : `"${m[1]}" isn't in your catalog.`;
  }
  return null;
}

function reportText() {
  const inv = store.getInventory();
  const today = store.summary(startOfToday());
  const lines = inv.map(
    (i) => `${i.qty <= (i.lowStock ?? 5) ? '⚠️' : '•'} ${i.name} — ${i.qty} ${i.unit}`
  );
  let out = `*Inventory*\n${lines.join('\n') || 'No items yet.'}\n\n`;
  out += `*Today* — ${today.orders} ${today.orders === 1 ? 'order' : 'orders'}, ${rupee(today.revenue)}`;
  if (today.top.length) out += `\n*Top sellers* — ${today.top.map((t) => `${t.name} (${t.qty})`).join(', ')}`;
  return out;
}

// ---- Customer ordering flow --------------------------------------------

// Extract "<qty> <name>" pairs from an order string, e.g. "2 milk 1 bread"
// → [{ name: 'milk', qty: 2 }, { name: 'bread', qty: 1 }]. Integers only.
function parseOrderItems(str) {
  const tokens = str.toLowerCase().split(/\s+/).filter(Boolean);
  const items = [];
  for (let i = 0; i < tokens.length; i++) {
    if (/^\d+$/.test(tokens[i]) && tokens[i + 1] && !/^\d+$/.test(tokens[i + 1])) {
      items.push({ name: tokens[i + 1], qty: Number(tokens[i]) });
      i++; // consume the name token too
    }
  }
  return items;
}

const orderLine = (o) =>
  `#${o.id} · ${o.customerName} · ${o.items.map((i) => `${i.name} ×${i.qty}`).join(', ') || '—'} · ${rupee(o.total)}`;

// Router for the customer-ordering flow. Returns true if it handled the message.
async function handleOrders(sessionId, text, reply, meta) {
  const t = text.trim();
  const s = t.toLowerCase();
  let m;

  // Customer: browse the menu (in-stock items only).
  if (s === 'menu' || s === 'catalog') {
    const inStock = store.getInventory().filter((i) => i.qty > 0);
    const lines = inStock.map((i) => `• ${i.name} — ${rupee(i.price)} (${i.qty} left)`).join('\n');
    await reply(
      `*Menu*\n${lines || 'Nothing in stock right now.'}\n\nOrder like: "order 2 milk 1 bread"`
    );
    return true;
  }

  // Customer: place an order.
  if (/^order\b/i.test(s)) {
    const items = parseOrderItems(t.slice(t.toLowerCase().indexOf('order') + 5));
    if (!items.length) {
      await reply('To order, send e.g. "order 2 milk 1 bread". Type "menu" to see what\'s available.');
      return true;
    }
    const order = store.createOrder({
      customerId: sessionId,
      customerName: meta.name || 'Customer',
      items,
    });
    let msg =
      `*Order #${order.id} placed* — the shop will confirm shortly:\n` +
      `${listItems(order.items)}\nTotal: ${rupee(order.total)}`;
    if (order.unavailable.length) msg += `\nNot available: ${order.unavailable.join(', ')}`;
    await reply(msg);

    // Notify the owner (if configured and not ordering from their own chat).
    if (ownerId() && sender && ownerId() !== sessionId) {
      sender(
        ownerId(),
        `*New order #${order.id}* from ${order.customerName}:\n` +
          `${listItems(order.items)}\nTotal: ${rupee(order.total)}\n` +
          `Reply "accept ${order.id}" or "reject ${order.id}".`
      );
    }
    return true;
  }

  // Owner: list pending orders.
  if (s === 'orders') {
    const pendingOrders = store.listOrders('pending');
    if (!pendingOrders.length) {
      await reply('No pending orders.');
      return true;
    }
    await reply(`*Pending orders*\n${pendingOrders.map(orderLine).join('\n')}`);
    return true;
  }

  // Owner: accept an order → deduct stock, confirm to the customer.
  if ((m = s.match(/^accept\s+(\S+)$/))) {
    const result = store.acceptOrder(m[1]);
    if (!result) {
      await reply(`Order #${m[1]} not found or already handled.`);
      return true;
    }
    const { order, sold, missing } = result;
    let msg = `*Order #${order.id} confirmed* — stock updated:\n${listItems(sold)}`;
    if (missing.length)
      msg += `\n\n⚠️ Couldn't fulfil: ${missing.map((x) => `${x.name} (${x.reason})`).join(', ')}`;
    await reply(msg + lowStockNudge());

    if (sender && order.customerId !== sessionId) {
      let note = `*Your order #${order.id} is confirmed!*\n${listItems(sold)}\nTotal: ${rupee(sold.reduce((a, i) => a + i.qty * i.price, 0))}`;
      if (missing.length)
        note += `\nSome items were unavailable: ${missing.map((x) => x.name).join(', ')}`;
      sender(order.customerId, note);
    }
    return true;
  }

  // Owner: reject an order.
  if ((m = s.match(/^reject\s+(\S+)$/))) {
    const order = store.rejectOrder(m[1]);
    if (!order) {
      await reply(`Order #${m[1]} not found or already handled.`);
      return true;
    }
    await reply(`Order #${order.id} rejected.`);
    if (sender && order.customerId !== sessionId)
      sender(order.customerId, `Sorry, order #${order.id} could not be fulfilled.`);
    return true;
  }

  return false;
}

// ---- Core handlers (called by channel adapters) ------------------------

export async function onText(sessionId, text, reply, meta = {}) {
  const t = text.trim();
  sweepPending();

  // 1) Resolve any pending confirmation first.
  if (pending.has(sessionId)) {
    if (/^(y|yes|haan|ha|ok|confirm|sahi|correct)\b/i.test(t)) {
      const p = pending.get(sessionId);
      pending.delete(sessionId);
      return commit(p, reply);
    }
    if (/^(n|no|nahi|cancel|galat|wrong)\b/i.test(t)) {
      pending.delete(sessionId);
      return reply('Cancelled — nothing saved. Re-send the correct details when ready.');
    }
    // Anything else: treat as a correction — re-parse and re-confirm.
    pending.delete(sessionId);
  }

  // 2) Customer-ordering flow (menu / order / accept / reject) — runs after the
  //    pending-confirmation gate so a "yes"/"no" reply still wins.
  if (await handleOrders(sessionId, t, reply, meta)) return;

  // 3) Deterministic quick-commands (no AI needed) — reliable store management.
  const quick = matchQuickCommand(t);
  if (quick != null) return reply(quick);

  const intent = await parseIntent(t);

  if (intent.action === 'report') return reply(reportText());

  if (intent.action === 'query') {
    const context = {
      today: store.summary(startOfToday()),
      allTime: store.summary(),
      inventory: store.getInventory().map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
      lowStock: store.getLowStock().map((i) => i.name),
    };
    return reply('💬 ' + (await answerQuery(intent.question || t, context)));
  }

  if (intent.action === 'restock') {
    if (!intent.items.length) return reply("Couldn't read any items. Try: \"add 10 bread at 40\".");
    // Text restock is usually clear → confirm lightly.
    return confirmOrCommit(sessionId, { type: 'restock', items: intent.items }, reply);
  }

  if (intent.action === 'sale') {
    if (!intent.items.length) return reply("Couldn't read the sale. Try: \"sold 3 maggi\".");
    const { sold, missing } = store.recordSale(intent.items);
    let msg = sold.length
      ? `*Sale recorded*\n${listItems(sold)}\n\nTotal: ${rupee(sold.reduce((s, i) => s + i.qty * i.price, 0))}`
      : '';
    if (missing.length)
      msg += `${msg ? '\n\n' : ''}⚠️ Not recorded: ${missing.map((m) => `${m.name} (${m.reason})`).join(', ')}`;
    return reply(msg + lowStockNudge());
  }

  return reply('Sorry, I didn\'t catch that. Try "sold 2 milk", "add 10 bread at 40", "stock", or send a bill photo.');
}

export async function onPhoto(sessionId, base64, mime, reply) {
  await reply('Reading the bill…');
  const { items, error } = await ocrBill(base64, mime);
  if (error === 'no-key')
    return reply('Bill photos need the AI engine (GEMINI_API_KEY). For now, type items like "add 10 maggi at 14".');
  if (!items.length)
    return reply("I couldn't read that bill — it may be too blurry or dark. Try a clearer, straight-on photo, or type the items in.");

  const review = items.filter(needsReview).length;
  // ALWAYS confirm a bill before saving — this is the reliability feature, not a bug.
  setPending(sessionId, { type: 'restock', items });
  return reply(
    `*Bill read* — please confirm before I add to stock:\n\n${listItems(items)}\n\n` +
      (review
        ? `⚠️ ${review} line(s) need a check (marked *⚠️ check*). Please verify those numbers.\n\n`
        : '') +
      `Reply *yes* to add, *no* to cancel, or re-type any line to fix it.`
  );
}

export async function onVoice(sessionId, base64, mime, reply) {
  const text = await transcribeAudio(base64, mime);
  if (!text) return reply('🎤 Voice needs GEMINI_API_KEY. Please type the message instead.');
  await reply(`🎤 Heard: "${text}"`);
  return onText(sessionId, text, reply);
}

// ---- Confirmation helpers ----------------------------------------------

function confirmOrCommit(sessionId, payload, reply) {
  setPending(sessionId, payload);
  return reply(
    `*Add to stock*\n${listItems(payload.items)}\n\nReply *yes* to confirm, or re-type to fix.`
  );
}

function commit(payload, reply) {
  if (payload.type === 'restock') {
    // Never save a line whose quantity we couldn't read — ask the owner to re-type it.
    const ready = payload.items.filter((i) => Number.isFinite(i.qty) && i.qty > 0);
    const skipped = payload.items.filter((i) => !Number.isFinite(i.qty) || i.qty <= 0);
    const applied = ready.length ? store.restock(ready, { source: 'bot' }) : [];
    let msg = applied.length ? `*Stock updated*\n${listItems(applied)}` : 'Nothing saved.';
    if (skipped.length)
      msg += `\n\nSkipped (no clear quantity): ${skipped
        .map((i) => i.name)
        .join(', ')}\nRe-send like: "add 10 ${skipped[0].name} at 40".`;
    return reply(msg + lowStockNudge());
  }
  if (payload.type === 'sale') {
    const { sold } = store.recordSale(payload.items);
    return reply(`*Sale recorded*\n${listItems(sold)}${lowStockNudge()}`);
  }
}

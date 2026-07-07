// Tiny JSON-backed store — zero native deps, works anywhere (great for a 24h demo).
// Swap for Supabase/Postgres later; the function surface below is all the app uses.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DATA_FILE = join(DATA_DIR, 'store.json');

const empty = () => ({ items: {}, sales: [], restocks: [], orders: [] });

function load() {
  if (!existsSync(DATA_FILE)) return empty();
  try {
    return { ...empty(), ...JSON.parse(readFileSync(DATA_FILE, 'utf8')) };
  } catch {
    return empty();
  }
}

let db = load();

function persist() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  // Atomic write: write a temp file then rename over the target, so a crash
  // mid-write can never leave a half-written (corrupt) data file.
  const tmp = DATA_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DATA_FILE);
}

const key = (name) => String(name).trim().toLowerCase();
let counter = Date.now();
const id = () => `${counter++}`;

// ---- Reads -------------------------------------------------------------

export function getInventory() {
  return Object.values(db.items).sort((a, b) => a.name.localeCompare(b.name));
}

export function getItem(name) {
  return db.items[key(name)] || null;
}

export function getLowStock() {
  return getInventory().filter((i) => i.qty <= (i.lowStock ?? 5));
}

export function getSalesSince(ts) {
  return db.sales.filter((s) => s.ts >= ts);
}

export function summary(sinceTs) {
  const sales = sinceTs ? getSalesSince(sinceTs) : db.sales;
  const revenue = sales.reduce((sum, s) => sum + s.total, 0);
  const unitsByItem = {};
  for (const s of sales)
    for (const li of s.items)
      unitsByItem[li.name] = (unitsByItem[li.name] || 0) + li.qty;
  const top = Object.entries(unitsByItem)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);
  return { orders: sales.length, revenue, top };
}

export function raw() {
  return db;
}

// ---- Writes ------------------------------------------------------------

// Add/receive stock (e.g. a supplier bill). Creates items that don't exist yet.
export function restock(items, { source = 'manual' } = {}) {
  const applied = [];
  for (const it of items) {
    if (!Number.isFinite(it.qty) || it.qty <= 0) continue; // never add an unreadable quantity
    const k = key(it.name);
    const existing = db.items[k];
    if (existing) {
      existing.qty += it.qty;
      if (it.price != null) existing.price = it.price;
    } else {
      db.items[k] = {
        key: k,
        name: it.name.trim(),
        qty: it.qty,
        price: it.price ?? 0,
        unit: it.unit || 'pcs',
        lowStock: 5,
      };
    }
    applied.push({ name: db.items[k].name, qty: it.qty, price: db.items[k].price });
  }
  db.restocks.push({ id: id(), ts: Date.now(), source, items: applied });
  persist();
  return applied;
}

// Record a sale. Returns { sold, missing } so the bot can flag unknown/low items.
export function recordSale(items) {
  const sold = [];
  const missing = [];
  for (const it of items) {
    if (!Number.isFinite(it.qty) || it.qty <= 0) {
      missing.push({ name: it.name, reason: 'unclear quantity' });
      continue;
    }
    const item = db.items[key(it.name)];
    if (!item) {
      missing.push({ name: it.name, reason: 'not in inventory' });
      continue;
    }
    const qty = Math.min(it.qty, item.qty); // never go negative
    if (qty <= 0) {
      missing.push({ name: item.name, reason: 'out of stock' });
      continue;
    }
    item.qty -= qty;
    sold.push({ key: item.key, name: item.name, qty, price: item.price });
  }
  if (sold.length) {
    const total = sold.reduce((s, li) => s + li.qty * li.price, 0);
    db.sales.push({ id: id(), ts: Date.now(), items: sold, total });
  }
  persist();
  return { sold, missing };
}

// ---- Customer orders ---------------------------------------------------

// Place an order (does NOT deduct stock — the owner accepts it first).
// Unknown / out-of-stock items are collected in `unavailable` so we can flag them.
export function createOrder({ customerId, customerName, items }) {
  const lines = [];
  const unavailable = [];
  for (const it of items) {
    const item = db.items[key(it.name)];
    if (item && Number.isFinite(it.qty) && it.qty > 0) {
      lines.push({ key: item.key, name: item.name, qty: it.qty, price: item.price });
    } else {
      unavailable.push(it.name);
    }
  }
  const total = lines.reduce((s, li) => s + li.qty * li.price, 0);
  const order = {
    id: id(),
    ts: Date.now(),
    customerId,
    customerName,
    items: lines,
    unavailable,
    total,
    status: 'pending',
  };
  db.orders.push(order);
  persist();
  return order;
}

export function listOrders(status) {
  const all = status ? db.orders.filter((o) => o.status === status) : db.orders;
  return [...all].sort((a, b) => b.ts - a.ts);
}

export function getOrder(orderId) {
  return db.orders.find((o) => String(o.id) === String(orderId)) || null;
}

// Owner accepts a pending order → deduct stock via recordSale.
export function acceptOrder(orderId) {
  const order = db.orders.find((o) => String(o.id) === String(orderId) && o.status === 'pending');
  if (!order) return null;
  const { sold, missing } = recordSale(order.items);
  order.status = 'accepted';
  order.sold = sold;
  persist();
  return { order, sold, missing };
}

export function rejectOrder(orderId) {
  const order = db.orders.find((o) => String(o.id) === String(orderId) && o.status === 'pending');
  if (!order) return null;
  order.status = 'rejected';
  persist();
  return order;
}

// ---- Catalog edits -----------------------------------------------------

export function setPrice(name, price) {
  const it = db.items[key(name)];
  if (!it) return null;
  it.price = price;
  persist();
  return it;
}

export function setReorder(name, level) {
  const it = db.items[key(name)];
  if (!it) return null;
  it.lowStock = level;
  persist();
  return it;
}

export function removeItem(name) {
  const it = db.items[key(name)];
  if (!it) return null;
  delete db.items[key(name)];
  persist();
  return it;
}

// Reverse the most recent sale or restock (whichever happened last).
export function undoLast() {
  const lastSale = db.sales[db.sales.length - 1];
  const lastRestock = db.restocks.filter((r) => r.source !== 'seed').slice(-1)[0];
  const sTs = lastSale?.ts ?? -1;
  const rTs = lastRestock?.ts ?? -1;
  if (sTs < 0 && rTs < 0) return null;

  if (sTs >= rTs) {
    for (const li of lastSale.items) {
      const it = db.items[li.key];
      if (it) it.qty += li.qty; // put the stock back
    }
    db.sales.pop();
    persist();
    return { type: 'sale', items: lastSale.items };
  }
  for (const li of lastRestock.items) {
    const it = db.items[key(li.name)];
    if (it) it.qty = Math.max(0, it.qty - li.qty); // remove the added stock
  }
  db.restocks = db.restocks.filter((r) => r.id !== lastRestock.id);
  persist();
  return { type: 'restock', items: lastRestock.items };
}

// ---- Insights: predict stock-outs from today's sell-through ------------

export function getInsights(sinceTs) {
  const inv = getInventory();
  const sales = sinceTs ? getSalesSince(sinceTs) : db.sales;
  const soldByKey = {};
  for (const s of sales) for (const li of s.items) soldByKey[li.key] = (soldByKey[li.key] || 0) + li.qty;

  const predicted = inv
    .map((i) => {
      const perDay = soldByKey[i.key] || 0;
      const daysLeft = perDay > 0 ? i.qty / perDay : null;
      return { name: i.name, qty: i.qty, perDay, daysLeft };
    })
    .filter((x) => x.daysLeft != null && x.daysLeft <= 3)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const lowNow = getLowStock().map((i) => ({ name: i.name, qty: i.qty }));
  return { predicted, lowNow };
}

export function seedDemo() {
  db = empty();
  restock(
    [
      { name: 'Maggi', qty: 24, price: 14 },
      { name: 'Milk', qty: 3, price: 28 }, // intentionally low, to demo alerts
      { name: 'Bread', qty: 10, price: 40 },
      { name: 'Eggs', qty: 30, price: 7 },
      { name: 'Sugar 1kg', qty: 8, price: 45 },
    ],
    { source: 'seed' }
  );
  return getInventory();
}

// First run with no data → seed so the demo/dashboard isn't empty.
if (getInventory().length === 0) seedDemo();

import 'dotenv/config';
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';
import { startTelegram } from './channels/telegram.js';
import { whatsappWebhook, whatsappConfigured } from './channels/whatsapp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Dashboard data — polled by the web UI every few seconds.
app.get('/api/state', (_req, res) => {
  const inventory = store.getInventory();
  const inventoryValue = inventory.reduce((sum, i) => sum + i.qty * i.price, 0);
  const bot = process.env.TELEGRAM_BOT_TOKEN ? '@dukaan_ai_niat_takeover26_bot' : null;
  res.json({
    storeName: process.env.STORE_NAME || 'Sri Lakshmi Kirana',
    inventory,
    inventoryValue,
    lowStock: store.getLowStock(),
    today: store.summary(startOfToday()),
    allTime: store.summary(),
    insights: store.getInsights(startOfToday()),
    recentSales: store.raw().sales.slice(-8).reverse(),
    orders: store.listOrders('pending'),
    ai: Boolean(process.env.GEMINI_API_KEY),
    channel: { telegram: bot },
    generatedAt: Date.now(),
  });
});

// Reset to demo data (handy right before a live demo).
// Set ADMIN_TOKEN to require an x-admin-token header (protects against public wipes).
app.post('/api/seed', (req, res) => {
  if (!allowWrite(req, res)) return;
  res.json({ inventory: store.seedDemo() });
});

// Optional write guard: if ADMIN_TOKEN is set, mutating endpoints require the
// x-admin-token header. Unset (default) = open, convenient for demos.
function allowWrite(req, res) {
  const token = process.env.ADMIN_TOKEN;
  if (token && req.get('x-admin-token') !== token) {
    res.status(403).json({ error: 'forbidden' });
    return false;
  }
  return true;
}

// Create a pending order straight from the dashboard (owner logging a
// walk-in / phone order). Items are validated against live inventory in the store.
app.post('/api/orders', (req, res) => {
  if (!allowWrite(req, res)) return;
  const { customerName, items } = req.body || {};
  const clean = Array.isArray(items)
    ? items
        .map((i) => ({ name: String(i && i.name || '').trim(), qty: Number(i && i.qty) }))
        .filter((i) => i.name && Number.isFinite(i.qty) && i.qty > 0)
    : [];
  if (!clean.length) return res.status(400).json({ error: 'add at least one item with a quantity' });
  const order = store.createOrder({
    customerId: 'dashboard',
    customerName: (customerName && String(customerName).trim()) || 'Walk-in',
    items: clean,
  });
  if (!order.items.length) return res.status(400).json({ error: 'none of those items are in the catalog' });
  res.json({ order });
});

// Accept a pending order → deducts stock and records the sale (shows in analytics).
app.post('/api/orders/:id/accept', (req, res) => {
  if (!allowWrite(req, res)) return;
  const result = store.acceptOrder(req.params.id);
  if (!result) return res.status(404).json({ error: 'order not found or already handled' });
  res.json(result);
});

// Reject a pending order (no stock change).
app.post('/api/orders/:id/reject', (req, res) => {
  if (!allowWrite(req, res)) return;
  const order = store.rejectOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'order not found or already handled' });
  res.json({ order });
});

// Mount WhatsApp webhook (inert until Meta credentials are set).
app.use('/webhook/whatsapp', whatsappWebhook());

// Public URL for webhook mode. Render provides RENDER_EXTERNAL_URL automatically;
// set PUBLIC_URL yourself on other hosts. When present, the bot runs on webhooks
// (which also wake a sleeping free-tier host); otherwise it long-polls locally.
const publicUrl = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || null;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`📊 Dashboard:  http://localhost:${PORT}`);
  console.log(`🤖 AI:         ${process.env.GEMINI_API_KEY ? 'ON (Gemini)' : 'OFF (rule-based fallback)'}`);
  console.log(`💬 WhatsApp:   ${whatsappConfigured() ? 'configured' : 'stub (Telegram is the demo channel)'}`);

  if (process.env.TELEGRAM_BOT_TOKEN) {
    console.log(`🔌 Bot mode:   ${publicUrl ? 'webhook (' + publicUrl + ')' : 'polling (local)'}`);
    startTelegram(process.env.TELEGRAM_BOT_TOKEN, {
      app,
      webhookUrl: publicUrl || null,
      secret: webhookSecret,
    });
  } else {
    console.log('⚠️  No TELEGRAM_BOT_TOKEN — dashboard runs, but the bot is off. See README.');
  }
});

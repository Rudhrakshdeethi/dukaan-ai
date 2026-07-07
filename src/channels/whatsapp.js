// WhatsApp adapter (STUB) — proves the brain is channel-agnostic.
//
// Why it's a stub for the hackathon: WhatsApp Cloud API requires a Meta Business
// account + phone-number verification (takes days), so it can't be *demoed* in 24h.
// But the logic below is complete — after verification, set the env vars and mount
// `whatsappWebhook` on the Express server. The SAME brain.js runs, unchanged.
//
// Setup after the event:
//   1. developers.facebook.com → create app → add "WhatsApp" product.
//   2. Get WHATSAPP_TOKEN + WHATSAPP_PHONE_ID, set WHATSAPP_VERIFY_TOKEN to any secret.
//   3. Point the webhook to  https://<your-host>/webhook/whatsapp
//   4. Free tier: 1,000 conversations/month.
import express from 'express';
import * as brain from '../brain.js';

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN || 'takeover26';
const GRAPH = 'https://graph.facebook.com/v21.0';

async function sendText(to, body) {
  await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, text: { body } }),
  });
}

async function fetchMediaBase64(mediaId) {
  const meta = await (await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  const buf = Buffer.from(await (await fetch(meta.url, { headers: { Authorization: `Bearer ${TOKEN}` } })).arrayBuffer());
  return { base64: buf.toString('base64'), mime: meta.mime_type };
}

export function whatsappWebhook() {
  const router = express.Router();

  // Meta webhook verification handshake.
  router.get('/', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY) return res.send(req.query['hub.challenge']);
    res.sendStatus(403);
  });

  router.post('/', async (req, res) => {
    res.sendStatus(200); // ack immediately
    try {
      const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!msg) return;
      const from = msg.from;
      const reply = (text) => sendText(from, text);

      if (msg.type === 'text') return await brain.onText(from, msg.text.body, reply);
      if (msg.type === 'image') {
        const { base64, mime } = await fetchMediaBase64(msg.image.id);
        return await brain.onPhoto(from, base64, mime, reply);
      }
      if (msg.type === 'audio') {
        const { base64, mime } = await fetchMediaBase64(msg.audio.id);
        return await brain.onVoice(from, base64, mime, reply);
      }
    } catch (e) {
      console.error('WhatsApp webhook error:', e.message);
    }
  });

  return router;
}

export const whatsappConfigured = () => Boolean(TOKEN && PHONE_ID);

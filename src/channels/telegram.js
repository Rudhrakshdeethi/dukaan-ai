// Telegram adapter — thin glue between grammy and the channel-agnostic brain.
// This is the ONLY file that knows about Telegram.
//
// Two run modes:
//   • Polling  (local/dev) — we long-poll Telegram ourselves via bot.start().
//   • Webhook  (production) — Telegram POSTs updates to us; each update wakes a
//     sleeping host (e.g. Render free tier), so the bot stays responsive. Enabled
//     automatically when a public URL is available (opts.webhookUrl).
import { Bot, webhookCallback } from 'grammy';
import * as brain from '../brain.js';

export function startTelegram(token, { app = null, webhookUrl = null, secret = null } = {}) {
  const bot = new Bot(token);

  const reply = (ctx) => (text) => ctx.reply(text, { parse_mode: 'Markdown' }).catch(() => ctx.reply(text));

  // Optional owner allowlist. Set TELEGRAM_OWNER_IDS=id1,id2 to make the bot private
  // (each shop should only be controlled by its owner). Unset = open, for demos.
  const owners = (process.env.TELEGRAM_OWNER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  bot.use((ctx, next) => {
    if (!owners.length || owners.includes(String(ctx.chat?.id))) return next();
    // Private mode: still let non-owners browse the menu and place orders, so
    // customers can reach the shop even when the console is locked to the owner.
    if (/^(menu|catalog|order)\b/i.test(ctx.message?.text || '')) return next();
    return ctx.reply('This Dukaan AI assistant is private to its shop owner.');
  });

  // Let the brain push messages (order notifications) back to any chat.
  brain.setSender((chatId, text) =>
    bot.api
      .sendMessage(chatId, text, { parse_mode: 'Markdown' })
      .catch(() => bot.api.sendMessage(chatId, text))
  );

  bot.command('start', (ctx) => ctx.reply(brain.welcome(), { parse_mode: 'Markdown' }));
  bot.command('help', (ctx) => ctx.reply(brain.welcome(), { parse_mode: 'Markdown' }));
  bot.command('stock', (ctx) => brain.report(reply(ctx)));
  bot.command('insights', (ctx) => brain.insightsReply(reply(ctx)));
  bot.command('reset', (ctx) => brain.resetDemo(reply(ctx)));

  bot.on('message:photo', async (ctx) => {
    try {
      const photo = ctx.message.photo.at(-1); // highest resolution
      const file = await ctx.api.getFile(photo.file_id);
      const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      await brain.onPhoto(String(ctx.chat.id), buf.toString('base64'), 'image/jpeg', reply(ctx));
    } catch (e) {
      ctx.reply('⚠️ Could not fetch that image. Please try again.');
    }
  });

  bot.on('message:voice', async (ctx) => {
    try {
      const file = await ctx.api.getFile(ctx.message.voice.file_id);
      const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      await brain.onVoice(String(ctx.chat.id), buf.toString('base64'), 'audio/ogg', reply(ctx));
    } catch {
      ctx.reply('⚠️ Could not fetch that voice note.');
    }
  });

  bot.on('message:text', (ctx) =>
    brain.onText(String(ctx.chat.id), ctx.message.text, reply(ctx), { name: ctx.from?.first_name })
  );

  bot.catch((err) => console.error('Telegram error:', err.message));

  if (app && webhookUrl) {
    // Production: receive updates over HTTPS instead of polling.
    const path = '/webhook/telegram';
    app.use(path, secret ? webhookCallback(bot, 'express', { secretToken: secret }) : webhookCallback(bot, 'express'));
    bot.api
      .setWebhook(`${webhookUrl}${path}`, { drop_pending_updates: true, ...(secret ? { secret_token: secret } : {}) })
      .then(() => console.log(`🤖 Telegram bot live via webhook → ${webhookUrl}${path}`))
      .catch((e) => console.error('setWebhook failed:', e.message));
  } else {
    // Local/dev: long-poll. Clear any stale webhook first so polling can start.
    bot.api.deleteWebhook().catch(() => {});
    bot.start({ onStart: (me) => console.log(`🤖 Telegram bot @${me.username} is live (polling).`) });
  }
  return bot;
}

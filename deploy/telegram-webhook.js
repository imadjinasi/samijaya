'use strict';
const crypto = require('node:crypto');

const operation = process.argv[2];
if (!['inspect','set'].includes(operation)) throw new Error('usage: telegram-webhook.js inspect|set');
const token = process.env.TELEGRAM_BOT_TOKEN;
const key = process.env.TELEGRAM_WEBHOOK_KEY_NEXT || process.env.TELEGRAM_WEBHOOK_KEY;
if (!token || (operation === 'set' && (!key || !process.env.TELEGRAM_SECRET))) {
  throw new Error('required Telegram configuration missing');
}
const base = 'https://api.telegram.org/bot' + token + '/';
async function call(method, body) {
  const response = await fetch(base + method, {
    method: body ? 'POST' : 'GET',
    headers: body ? {'Content-Type':'application/json'} : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error('Telegram API operation failed');
  return result.result;
}
function same(a,b) {
  const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
  return x.length===y.length && crypto.timingSafeEqual(x,y);
}
(async () => {
  if (operation === 'set') {
    const url = new URL('https://samijaya.online/telegram/webhook');
    url.searchParams.set('tg_key', key);
    await call('setWebhook', {url:url.toString(),secret_token:process.env.TELEGRAM_SECRET,
      allowed_updates:['message','callback_query']});
    console.log('Telegram setWebhook accepted');
  }
  const info = await call('getWebhookInfo');
  let matches = false;
  try {
    const url = new URL(info.url);
    matches = url.origin === 'https://samijaya.online' && url.pathname === '/telegram/webhook' &&
      same(url.searchParams.get('tg_key'), key);
  } catch (_) {}
  console.log('Telegram webhook target matches Samijaya:', matches);
  console.log('Telegram pending update count:', Number(info.pending_update_count||0));
  if (!matches) process.exitCode = 2;
})().catch(error => {console.error(error.message);process.exitCode=1;});

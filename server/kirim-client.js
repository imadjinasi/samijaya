'use strict';
// WhatsApp lewat Kirim (SQ Hub): token client credentials Keycloak, lalu POST /internal/kirim/messages
// tanpa `device` (nomor diambil dari kartu Samijaya di Kirim). Panduan: SQ-Hub
// docs/kirim/panduan-api-gateway-aplikasi-luar.md.
const crypto = require('node:crypto');

const TOKEN_MARGIN_MS = 30000;
let tokenCache = { value: '', expiresAt: 0 };

function config() {
  const base = String(process.env.KIRIM_BASE_URL || '').trim().replace(/\/+$/, '');
  const tokenUrl = String(process.env.KEYCLOAK_TOKEN_URL || '').trim();
  const clientId = String(process.env.KIRIM_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.KIRIM_CLIENT_SECRET || '').trim();
  if (!/^https?:\/\//i.test(base) || !/^https?:\/\//i.test(tokenUrl) || !clientId || !clientSecret) throw new Error('KIRIM_NOT_CONFIGURED');
  return { base, tokenUrl, clientId, clientSecret };
}

function configured() {
  try { config(); return true; } catch (_) { return false; }
}

function resetTokenCache() { tokenCache = { value: '', expiresAt: 0 }; }

async function token(fetchImpl, force) {
  const { tokenUrl, clientId, clientSecret } = config();
  if (!force && tokenCache.value && tokenCache.expiresAt > Date.now()) return tokenCache.value;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });
  const response = await fetchImpl(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(), signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('KIRIM_TOKEN_HTTP_' + response.status);
  const data = await response.json();
  if (!data || typeof data.access_token !== 'string' || !data.access_token) throw new Error('KIRIM_TOKEN_INVALID');
  const ttl = Math.max(0, Number(data.expires_in || 0) * 1000 - TOKEN_MARGIN_MS);
  tokenCache = { value: data.access_token, expiresAt: Date.now() + ttl };
  return tokenCache.value;
}

// `phone` sudah dinormalkan ke 62xxxxxxxxxx oleh notification-queue. `jenis` 'kode' untuk OTP (prioritas
// tertinggi, tanpa jam kirim dan opt-out, kedaluwarsa 10 menit), 'notifikasi' untuk pesan pesanan.
async function sendMessage(phone, message, options = {}, fetchImpl = fetch) {
  const { base } = config();
  const jenis = options.jenis === 'kode' ? 'kode' : 'notifikasi';
  const idempotencyKey = String(options.idempotencyKey || crypto.randomUUID());
  const payload = { jenis, to: '+' + String(phone), text: String(message) };
  if (options.ref) payload.ref = String(options.ref).slice(0, 200);
  const post = async (bearer) => fetchImpl(base + '/internal/kirim/messages', { method: 'POST', headers: {
    'Authorization': 'Bearer ' + bearer, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey
  }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12000) });
  let response = await post(await token(fetchImpl, false));
  if (response.status === 401) response = await post(await token(fetchImpl, true));
  if (response.status !== 202) {
    let code = '';
    try { const data = await response.json(); code = data && data.error && data.error.code ? String(data.error.code) : ''; } catch (_) {}
    throw new Error('KIRIM_HTTP_' + response.status + (code ? '_' + code.toUpperCase() : ''));
  }
  const accepted = await response.json();
  return { id: accepted && accepted.id ? String(accepted.id) : '', status: accepted && accepted.status ? String(accepted.status) : 'antre' };
}

module.exports = { sendMessage, configured, resetTokenCache };

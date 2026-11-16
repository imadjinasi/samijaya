'use strict';
// WhatsApp lewat Kirim (SQ Hub): kunci API dari kartu "Aplikasi luar" di Kirim, lalu
// POST /internal/kirim/messages tanpa `device` (nomor terikat pada kunci). Dokumentasi:
// https://kirim.sabilulquran.or.id/dokumentasi-api
const crypto = require('node:crypto');

function config() {
  const base = String(process.env.KIRIM_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = String(process.env.KIRIM_API_KEY || '').trim();
  if (!/^https?:\/\//i.test(base) || !/^krm_[A-Za-z0-9_-]{8,}$/.test(apiKey)) throw new Error('KIRIM_NOT_CONFIGURED');
  return { base, apiKey };
}

function configured() {
  try { config(); return true; } catch (_) { return false; }
}

// `phone` sudah dinormalkan ke 62xxxxxxxxxx oleh notification-queue. `jenis` 'kode' untuk OTP (prioritas
// tertinggi, tanpa jam kirim dan opt-out, kedaluwarsa 10 menit), 'notifikasi' untuk pesan pesanan.
async function sendMessage(phone, message, options = {}, fetchImpl = fetch) {
  const { base, apiKey } = config();
  const jenis = options.jenis === 'kode' ? 'kode' : 'notifikasi';
  const idempotencyKey = String(options.idempotencyKey || crypto.randomUUID());
  const payload = { jenis, to: '+' + String(phone), text: String(message) };
  if (options.ref) payload.ref = String(options.ref).slice(0, 200);
  const response = await fetchImpl(base + '/internal/kirim/messages', { method: 'POST', headers: {
    'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey
  }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12000) });
  if (response.status !== 202) {
    let code = '';
    try { const data = await response.json(); code = data && data.error && data.error.code ? String(data.error.code) : ''; } catch (_) {}
    throw new Error('KIRIM_HTTP_' + response.status + (code ? '_' + code.toUpperCase() : ''));
  }
  const accepted = await response.json();
  return { id: accepted && accepted.id ? String(accepted.id) : '', status: accepted && accepted.status ? String(accepted.status) : 'antre' };
}

// Status pesan untuk pemeriksaan manual (audit-cli) atau uji: GET /internal/kirim/messages/:id.
async function messageStatus(id, fetchImpl = fetch) {
  const { base, apiKey } = config();
  const response = await fetchImpl(base + '/internal/kirim/messages/' + encodeURIComponent(String(id)), {
    headers: { 'Authorization': 'Bearer ' + apiKey }, signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error('KIRIM_HTTP_' + response.status);
  return response.json();
}

module.exports = { sendMessage, messageStatus, configured };

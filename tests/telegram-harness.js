const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const sent = [];
const apiCalls = [];
const cacheRemovals = [];
let sheets = {};
let lockMode = 'ok';
let forceUpdateFalse = false;

const context = {
  console,
  JSON,
  Date,
  Math,
  Number,
  String,
  Object,
  Array,
  RegExp,
  encodeURIComponent,
  Logger: { log() {} },
  Utilities: {
    formatDate(value, zone, format) {
      const d = new Date(value);
      if (format === 'yyyy-MM-dd') return '2026-07-21';
      if (format === 'dd-MM-yy HH:mm') return '21-07-26 18:20';
      return '2026-07-21 18:20:00';
    },
  },
  CacheService: { getScriptCache: () => ({ remove: key => cacheRemovals.push(key) }) },
  readAll(name) { return (sheets[name] || []).map(row => ({ ...row })); },
  updateRowById(name, idColumn, idValue, patch) {
    if (forceUpdateFalse) return false;
    const row = (sheets[name] || []).find(item => String(item[idColumn]) === String(idValue));
    if (!row) return false;
    Object.assign(row, patch);
    return true;
  },
  withLock(fn) {
    if (lockMode === 'busy') return { ok: false, code: 'SIBUK_COBA_LAGI', error: 'Sistem sedang sibuk, coba lagi' };
    return fn();
  },
  clearSettingsCache() {},
  cacheInvalidateSetting(key) { cacheRemovals.push('setting_' + key); return true; },
  invalidateCatalogAfterMutation() { cacheRemovals.push('catalog_cache'); return { ok: true }; },
  clearApplicationDataCaches() { cacheRemovals.push('catalog_cache'); return { ok: true }; },
  sheetParseId(value, pattern, maxLength) {
    const text = String(value == null ? '' : value).trim();
    return text && text.length <= maxLength && pattern.test(text) ? text : null;
  },
  nowJkt: () => '2026-07-21 18:20:00',
  log() {},
  getSetting(key) {
    const row = (sheets.Settings || []).find(item => item.key === key);
    return row ? row.value : '';
  },
  isOrderCommittedRow(order) {
    const status = String((order || {}).commit_status || '').trim().toUpperCase();
    return status === '' || status === 'COMMITTED';
  },
  sha256: value => value === 'secret' ? 'hash' : 'bad',
  UrlFetchApp: { fetch() { throw new Error('Network must not be called'); } },
};
vm.createContext(context);
for (const file of ['backend/Promo.gs', 'backend/Telegram.gs']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

context.tgSend = (chatId, text, opts) => {
  sent.push({ chatId: String(chatId), text, opts });
  return { ok: true };
};
context.tgApi = (method, payload) => {
  apiCalls.push({ method, payload });
  return { ok: true };
};

function reset() {
  sent.length = 0;
  apiCalls.length = 0;
  cacheRemovals.length = 0;
  sheets = {};
  lockMode = 'ok';
  forceUpdateFalse = false;
  context.isAdmin = () => true;
}

function command(text) {
  context.handleAdminCommand('1001', text);
  return sent.map(item => item.text).join('\n');
}

// Parser: case, suffix, exact login, missing/extra args, unknown.
assert.strictEqual(context.tgParseCommand('/HELP@Samijayaweb_bot').command, '/help');
assert.strictEqual(context.tgParseCommand('/promo@Samijayaweb_bot list').args[0], 'list');
assert.strictEqual(context.tgParseCommand('/loginfoo').command, '/loginfoo');
reset(); command('/HELP'); assert.match(sent[0].text, /LIHAT DATA/);
reset(); command('/pending extra'); assert.match(sent[0].text, /Format: \/pending/);
reset(); command('/tidakada'); assert.match(sent[0].text, /tidak dikenal/);

// Escaping and chunking.
assert.strictEqual(context.tgEscapeHtml('<A&B>"'), '&lt;A&amp;B&gt;&quot;');
const chunks = context.tgChunkHtml(Array.from({ length: 500 }, (_, i) => `baris-${i} aman`).join('\n'), 200);
assert(chunks.length > 1);
assert(chunks.every(chunk => chunk.length <= 200 && chunk.length > 0));

// Authorization and login exact/atomic outcomes.
reset();
context.isAdmin = () => false;
context.handleTelegramWebhook({ message: { chat: { id: 9 }, text: '/help' } });
assert.match(sent[0].text, /bukan admin/);
reset();
sheets.Settings = [{ key: 'ADMIN_PASSWORD_HASH', value: 'hash' }, { key: 'ADMIN_CHAT_IDS', value: '' }];
context.handleTelegramWebhook({ message: { chat: { id: 9 }, text: '/loginfoo secret' } });
assert(!sheets.Settings[1].value);
context.handleTelegramWebhook({ message: { chat: { id: 9 }, text: '/login' } });
assert.match(sent.at(-1).text, /Gunakan/);
context.handleTelegramWebhook({ message: { chat: { id: 9 }, text: '/login secret' } });
assert.strictEqual(sheets.Settings[1].value, '9');
reset();
sheets.Settings = [{ key: 'ADMIN_PASSWORD_HASH', value: 'hash' }, { key: 'ADMIN_CHAT_IDS', value: '' }];
lockMode = 'busy';
context.handleTelegramWebhook({ message: { chat: { id: 9 }, text: '/login secret' } });
assert.match(sent.at(-1).text, /Login gagal/);
assert.strictEqual(sheets.Settings[1].value, '');

// Store writes: success, idempotent, busy, target missing, update false.
reset(); sheets.Settings = [{ key: 'TOKO_BUKA', value: '1' }]; command('/tutuptoko'); assert.strictEqual(sheets.Settings[0].value, '0'); assert.deepStrictEqual(cacheRemovals, ['setting_TOKO_BUKA', 'catalog_cache']);
reset(); sheets.Settings = [{ key: 'TOKO_BUKA', value: '0' }]; command('/tutuptoko'); assert.match(sent[0].text, /sudah/); assert.strictEqual(cacheRemovals.length, 0);
reset(); sheets.Settings = [{ key: 'TOKO_BUKA', value: '1' }]; lockMode = 'busy'; command('/tutuptoko'); assert.match(sent[0].text, /sibuk/); assert.strictEqual(sheets.Settings[0].value, '1');
reset(); sheets.Settings = []; command('/bukatoko'); assert.match(sent[0].text, /tidak ditemukan/);
reset(); sheets.Settings = [{ key: 'TOKO_BUKA', value: '0' }]; forceUpdateFalse = true; command('/bukatoko'); assert.match(sent[0].text, /gagal diperbarui/); assert.strictEqual(cacheRemovals.length, 0);

// Slot, product, and review write paths re-read inside lock and never claim false success.
reset(); sheets.DeliverySlots = [{ slot_id: 'S1', status: 'aktif' }]; command('/tutupslot S1'); assert.strictEqual(sheets.DeliverySlots[0].status, 'nonaktif'); assert.deepStrictEqual(cacheRemovals, ['catalog_cache']);
sent.length = 0; command('/tutupslot S1'); assert.match(sent[0].text, /sudah ditutup/);
reset(); sheets.DeliverySlots = []; command('/bukaslot HILANG'); assert.match(sent[0].text, /tidak ditemukan/);
reset(); sheets.Products = [{ product_id: 'P1', nama: '<Kopi>', tersedia: '1' }]; forceUpdateFalse = true; command('/produk P1 off'); assert.match(sent[0].text, /gagal diperbarui/); assert.strictEqual(cacheRemovals.length, 0);
reset(); sheets.Products = [{ product_id: 'P1', nama: '<Kopi>', tersedia: '1' }]; command('/produk P1 off'); assert.strictEqual(sheets.Products[0].tersedia, '0'); assert.match(sent[0].text, /&lt;Kopi&gt;/); assert.deepStrictEqual(cacheRemovals, ['catalog_cache']);
reset(); sheets.Reviews = [{ review_id: 'R1', status: 'aktif' }]; command('/ulasan hide R1'); assert.strictEqual(sheets.Reviews[0].status, 'hidden');
sent.length = 0; command('/ulasan hide R1'); assert.match(sent[0].text, /sudah disembunyikan/);
reset(); sheets.Reviews = []; command('/ulasan show HILANG'); assert.match(sent[0].text, /tidak ditemukan/);

// Status and health.
reset();
sheets.Settings = [{ key: 'TOKO_BUKA', value: '1' }];
sheets.DeliverySlots = [{ slot_id: 'S2', jam_mulai: '12:00', jam_selesai: '13:00', status: 'nonaktif' }, { slot_id: 'S1', jam_mulai: '07:00', jam_selesai: '08:00', status: 'ya' }];
assert.match(command('/status'), /S1[\s\S]*AKTIF/);
for (const name of ['Orders', 'Products', 'PromoCodes', 'PromoUsage']) sheets[name] = [];
assert.match(command('/health'), /PromoUsage: OK/);

// Promo list/stats/toggle, case-insensitive, duplicate/not-found, cancelled exclusion.
reset(); sheets.PromoCodes = []; assert.match(command('/promo list'), /Belum ada/);
reset();
sheets.PromoCodes = [{ promo_id: 'P1', kode: 'test10', nama: '<Promo>', aktif: 'aktif', mulai_at: '2026-07-01', berakhir_at: '2026-08-31', limit_total: 100, limit_harian: 20, limit_per_member: 3 }];
sheets.PromoUsage = [
  { promo_id: 'P1', status: 'DIGUNAKAN', used_date: '2026-07-21', used_at: '2026-07-21 18:20:00', member_id: 'M1', promo_diskon_total: 10000 },
  { promo_id: 'P1', status: 'DIGUNAKAN', used_date: '2026-07-20', used_at: '2026-07-20 10:00:00', member_id: 'M1', promo_diskon_total: 5000 },
  { promo_id: 'P1', status: 'DIBATALKAN', used_date: '2026-07-21', used_at: '2026-07-21 19:00:00', member_id: 'M2', promo_diskon_total: 99999 },
];
assert.match(command('/promo stats TeSt10'), /Dipakai: 2[\s\S]*Dibatalkan: 1[\s\S]*Member unik: 1[\s\S]*15\.000/);
sent.length = 0; command('/promo off TEST10'); assert.strictEqual(sheets.PromoCodes[0].aktif, 'nonaktif'); assert.strictEqual(cacheRemovals.length, 0);
sent.length = 0; command('/promo off test10'); assert.match(sent[0].text, /sudah nonaktif/);
sent.length = 0; command('/promo on missing'); assert.match(sent[0].text, /tidak ditemukan/);
sheets.PromoCodes.push({ ...sheets.PromoCodes[0], promo_id: 'P2' });
sent.length = 0; command('/promo on test10'); assert.match(sent[0].text, /duplikat/);

// Long promo list produces only safe non-empty chunks.
reset();
sheets.PromoCodes = Array.from({ length: 150 }, (_, i) => ({ promo_id: `P${i}`, kode: `K${i}`, nama: `Promo ${i}`, aktif: i % 2 ? 'aktif' : 'nonaktif' }));
command('/promo list'); assert(sent.length > 1); assert(sent.every(item => item.text && item.text.length <= 3850));

// Order keyboards and malformed/unknown/non-admin callbacks.
reset();
sheets.PickupLocations = []; sheets.MessageTemplates = [];
for (const [status, expected] of [['MENUNGGU', 'PROSES'], ['DIPROSES', 'SIAP'], ['SIAP', 'SELESAI_ASK']]) {
  const keyboard = context.tgBuildOrderKeyboard({ order_id: 'O1', status, metode_kirim: 'AMBIL', total: 1 });
  assert(JSON.stringify(keyboard).includes(expected));
}
assert(!JSON.stringify(context.tgBuildOrderKeyboard({ order_id: 'O1', status: 'SELESAI', metode_kirim: 'AMBIL', total: 1 })).includes('callback_data'));
// /order attaches fallback actions to the last message chunk.
sheets.Orders = [{ order_id: 'O1', status: 'MENUNGGU', metode_kirim: 'AMBIL', total: 10000, subtotal: 10000, timeline_json: '[]', nama: '<Admin Test>' }];
sheets.OrderItems = []; sheets.OrderItemAddons = [];
sent.length = 0; command('/order o1');
assert(JSON.stringify(sent.at(-1).opts).includes('st:PROSES:O1'));
assert.match(sent.at(-1).text, /&lt;Admin Test&gt;/);
context.handleTelegramWebhook({ callback_query: { id: 'C1', from: { id: 1001 }, data: 'st:PROSES', message: { message_id: 1, chat: { id: 1001 }, text: '' } } });
assert.match(apiCalls.at(-1).payload.text, /Format aksi/);
context.handleTelegramWebhook({ callback_query: { id: 'C2', from: { id: 1001 }, data: 'st:ANEH:O1', message: { message_id: 1, chat: { id: 1001 }, text: '' } } });
assert.match(apiCalls.at(-1).payload.text, /tidak dikenal/);
// A second/stale click preserves order validation and gets an honest answer.
sheets.Orders = [{ order_id: 'O1', status: 'DIPROSES', metode_kirim: 'AMBIL', timeline_json: '[]' }];
context.orderUpdateStatus = () => ({ ok: false, code: 'TRANSISI_TIDAK_VALID', error: 'Transisi tidak valid' });
context.handleTelegramWebhook({ callback_query: { id: 'C2B', from: { id: 1001 }, data: 'st:PROSES:O1', message: { message_id: 1, chat: { id: 1001 }, text: '' } } });
assert.match(apiCalls.at(-1).payload.text, /Status order sudah berubah/);
context.isAdmin = () => false;
context.handleTelegramWebhook({ callback_query: { id: 'C3', from: { id: 77 }, data: 'st:PROSES:O1', message: { message_id: 1, chat: { id: 77 }, text: '' } } });
assert.match(apiCalls.at(-1).payload.text, /Bukan admin/);

console.log('telegram-harness: all assertions passed');

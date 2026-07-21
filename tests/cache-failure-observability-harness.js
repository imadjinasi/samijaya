const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const removed = [];
const properties = new Map();
let writes = [];
let cacheThrows = false;
let uuidSequence = 0;
const context = {
  console, JSON, Date, Math, Number, String, Object, Array, RegExp, isFinite,
  Utilities: {
    getUuid: () => `${String(++uuidSequence).padStart(8, '0')}-1234-4123-8123-123456789abc`,
    formatDate: () => '2026-07-22 10:00:00',
    computeDigest: () => [1, 2, 3], DigestAlgorithm: { SHA_256: 'sha' }
  },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: key => properties.get(key) || '',
    setProperty: (key, value) => { properties.set(key, String(value)); }
  }) },
  CacheService: { getScriptCache: () => ({
    remove: key => { if (cacheThrows) throw new Error('cache down'); removed.push(key); },
    get: () => null, put() {}, removeAll(keys) { keys.forEach(key => removed.push(key)); }
  }) },
  Logger: { log() {} },
  ContentService: { createTextOutput: value => ({ setMimeType: () => value }), MimeType: { JSON: 'json' } },
  readAll: name => name === 'Settings' ? [{ key: 'TOKO_BUKA' }, { key: 'ADMIN_CHAT_IDS' }] : []
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('backend/Util.gs', 'utf8'), context, { filename: 'backend/Util.gs' });
context.readAll = name => name === 'Settings' ? [{ key: 'TOKO_BUKA' }, { key: 'ADMIN_CHAT_IDS' }] : [];
context.appendRowObj = (sheet, row) => { writes.push({ sheet, row }); return row; };

assert.strictEqual(context.cacheInvalidateSetting('TOKO_BUKA'), true);
assert(removed.includes('setting_TOKO_BUKA'), 'targeted Settings invalidation missing');
const rev1 = context.invalidateCatalogAfterMutation('testWriter').revision;
assert(/^\d+-[a-f0-9]{12}$/.test(rev1), 'opaque catalog revision expected');
assert(removed.includes('catalog_cache'), 'catalog invalidation missing');
assert.strictEqual(context.catalogGetRevision(), rev1);

const beforeFailureRevision = context.catalogGetRevision();
cacheThrows = true;
assert.doesNotThrow(() => context.invalidateCatalogAfterMutation('committedWriter'), 'invalidation failure must not cancel commit');
assert.notStrictEqual(context.catalogGetRevision(), beforeFailureRevision, 'revision should still advance when cache removal fails');
cacheThrows = false;

removed.length = 0;
context.clearApplicationDataCaches();
assert(removed.includes('catalog_cache'));
assert(removed.includes('setting_TOKO_BUKA'));
assert(!removed.some(key => /^tg_upd_|^tg_login_|session|cart|campaign/i.test(key)), '/clearcache touched protected state');

writes = [];
assert.strictEqual(context.safeLog('ERROR', 'TEST_EVENT', '', {
  operation: 'test', stage: 'write', correlation_id: 'c_1234567890abcdef', retryable: true,
  token: 'secret', no_hp: '628123456789', error_code: 'FAIL'
}), true);
const serialized = JSON.stringify(writes);
assert(!serialized.includes('secret') && !serialized.includes('628123456789'), 'secret/PII leaked to structured log');
assert(serialized.includes('correlation_id') && serialized.includes('retryable'), 'structured fields missing');
context.appendRowObj = () => { throw new Error('Logs unavailable'); };
assert.doesNotThrow(() => context.safeLog('ERROR', 'LOG_FAIL', '', { operation: 'test' }));
assert.strictEqual(context.safeLog('ERROR', 'LOG_FAIL', '', {}), false, 'logger must report fail-safe write failure');

assert(context.isValidServerCorrelationId('c_1234567890abcdef'));
assert(!context.isValidServerCorrelationId('client supplied raw value'));
assert(context.isValidOperationalCorrelationId('12345678-1234-4123-8123-123456789abc'));

const telegramSource = fs.readFileSync('backend/Telegram.gs', 'utf8');
for (const operation of ['telegramCloseStore', 'telegramOpenStore', 'telegramSlotStatus', 'telegramProductAvailability']) {
  assert(telegramSource.includes(`invalidateCatalogAfterMutation('${operation}')`), `catalog writer ${operation} missing invalidation`);
}
assert(telegramSource.includes("cacheInvalidateSetting('TOKO_BUKA'"), 'targeted setting invalidation missing');
assert(telegramSource.includes('clearApplicationDataCaches()'), '/clearcache not routed through data-cache registry');

const tgContext = {
  console, JSON, Date, Math, Number, String, Object, Array, RegExp, encodeURIComponent,
  createServerCorrelationId: () => 'c_1234567890abcdef', isValidServerCorrelationId: context.isValidServerCorrelationId,
  safeLog() {}, getSetting: () => 'token',
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 503, getContentText: () => '{"ok":false}' }) }
};
vm.createContext(tgContext);
const tgApiSource = telegramSource.slice(telegramSource.indexOf('function tgApi('), telegramSource.indexOf('// ============================================================', telegramSource.indexOf('function tgApi(')));
vm.runInContext(tgApiSource, tgContext);
let tgResult = tgContext.tgApi('sendMessage', {});
assert.strictEqual(tgResult.code, 'TELEGRAM_HTTP_ERROR');
assert.strictEqual(tgResult.retryable, true);
tgContext.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200, getContentText: () => '<html>' });
tgResult = tgContext.tgApi('sendMessage', {});
assert.strictEqual(tgResult.code, 'TELEGRAM_INVALID_RESPONSE');
tgContext.UrlFetchApp.fetch = () => { throw new Error('network'); };
tgResult = tgContext.tgApi('sendMessage', {});
assert.strictEqual(tgResult.code, 'TELEGRAM_NETWORK_ERROR');
tgResult = tgContext.tgApi('sendMessage', {}, { deadline_ms: Date.now() - 1 });
assert.strictEqual(tgResult.code, 'TELEGRAM_BUDGET_EXHAUSTED');

const orderSource = fs.readFileSync('backend/Order.gs', 'utf8');
assert(orderSource.includes('Notifikasi best-effort') || orderSource.includes('notification'), 'post-commit notification contract missing');
assert(telegramSource.includes('!res.data.unchanged'), 'notification replay guard regression');

console.log('cache-failure-observability-harness: all assertions passed');

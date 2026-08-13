const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');

let sheets = {};
let properties = {};
let cacheData = new Map();
let cacheUnavailable = false;
let logs = [];
let sent = [];
let apiCalls = [];
let handlerCalls = 0;
let handlerResult = { ok: true };
let handlerThrows = false;
let forceUpdateFalse = false;
let digestQueue = [];
let hashCalls = 0;
let fetchHandler = null;
let fetchRequests = [];
let otpAdminNotifications = 0;
let projectTriggers = [];

const scriptProperties = {
  getProperty(key) { return properties[key] || ''; },
  setProperty(key, value) { properties[key] = String(value); return this; },
  deleteProperty(key) { delete properties[key]; return this; },
};
const cache = {
  get(key) { if (cacheUnavailable) throw new Error('cache unavailable'); return cacheData.get(key) || null; },
  put(key, value, ttl) {
    if (cacheUnavailable) throw new Error('cache unavailable');
    assert(ttl <= 21600, 'Cache TTL exceeds Apps Script maximum');
    cacheData.set(key, String(value));
  },
  remove(key) { if (cacheUnavailable) throw new Error('cache unavailable'); cacheData.delete(key); },
  removeAll(keys) { keys.forEach(key => cacheData.delete(key)); },
};

const context = {
  console, JSON, Date, Math, Number, String, Object, Array, RegExp,
  encodeURIComponent, isNaN, parseInt,
  PropertiesService: { getScriptProperties: () => scriptProperties },
  CacheService: { getScriptCache: () => { if (cacheUnavailable) throw new Error('cache unavailable'); return cache; } },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  ScriptApp: {
    getProjectTriggers: () => projectTriggers,
    newTrigger(handler) {
      return {
        timeBased() { return this; }, everyMinutes(minutes) { this.minutes = minutes; return this; },
        create() { projectTriggers.push({ getHandlerFunction: () => handler, minutes: this.minutes }); return this; },
      };
    },
  },
  HtmlService: { createHtmlOutput: text => ({ kind: 'html', text }) },
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput: text => ({ kind: 'json', text, setMimeType() { return this; } }),
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    getUuid: () => '00000000-0000-4000-8000-000000000001',
    computeDigest(algorithm, value) {
      if (digestQueue.length) return digestQueue.shift();
      return Array.from(crypto.createHash('sha256').update(String(value)).digest()).map(byte => byte > 127 ? byte - 256 : byte);
    },
    formatDate: () => '2026-07-21 18:20:00',
  },
  SpreadsheetApp: { openById() { throw new Error('production spreadsheet access forbidden'); } },
  UrlFetchApp: { fetch(url, options) {
    fetchRequests.push({ url, options });
    if (fetchHandler) return fetchHandler(url, options);
    throw new Error('production network access forbidden');
  } },
  Logger: { log(value) { logs.push(String(value)); } },
};
vm.createContext(context);
for (const file of ['backend/Util.gs', 'backend/Lock.gs', 'backend/Auth.gs', 'backend/Router.gs', 'backend/Telegram.gs']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}
const realSendOtpToAdminTelegram = context.sendOtpToAdminTelegram;

context.readAll = name => (sheets[name] || []).map(row => ({ ...row }));
context.appendRowObj = (name, row) => {
  if (name === 'Logs') logs.push(JSON.stringify(row));
  else (sheets[name] || (sheets[name] = [])).push({ ...row });
  return row;
};
context.updateRowById = (name, idColumn, idValue, patch) => {
  if (forceUpdateFalse) return false;
  const row = (sheets[name] || []).find(item => String(item[idColumn]) === String(idValue));
  if (!row) return false;
  Object.assign(row, patch);
  return true;
};
context.getSetting = key => {
  const defaults = {
    OTP_MAX_PER_DAY: '5', OTP_RESEND_COOLDOWN_MINUTES: '2', OTP_VALID_MINUTES: '30',
    SESSION_VALID_DAYS: '7', ADMIN_PASSWORD_HASH: 'hash-secret', TELEGRAM_SECRET: 'header-secret',
  };
  const row = (sheets.Settings || []).find(item => item.key === key);
  return row ? String(row.value || '') : (defaults[key] || '');
};
context.genId = prefix => prefix + '_test';
context.uuid = () => 'session-token-sentinel';
context.nowJkt = () => '2026-07-21 18:20:00';
context.sendOtpToAdminTelegram = () => { otpAdminNotifications++; return { ok: true }; };
context.tgSend = (chatId, text, opts) => { sent.push({ chatId: String(chatId), text, opts }); return { ok: true }; };
context.tgApi = (method, payload) => { apiCalls.push({ method, payload }); return { ok: true }; };
context.handleTelegramWebhook = update => {
  handlerCalls++;
  if (handlerThrows) throw new Error('handler sentinel');
  return handlerResult;
};

function reset() {
  sheets = {};
  properties = {};
  cacheData = new Map();
  cacheUnavailable = false;
  logs = [];
  sent = [];
  apiCalls = [];
  handlerCalls = 0;
  handlerResult = { ok: true };
  handlerThrows = false;
  forceUpdateFalse = false;
  digestQueue = [];
  hashCalls = 0;
  fetchHandler = null;
  fetchRequests = [];
  otpAdminNotifications = 0;
  projectTriggers = [];
}
function post(body, key) {
  return context.doPost({ parameter: key === undefined ? {} : { tg_key: key }, postData: { contents: body } });
}
function update(id = 1) {
  return JSON.stringify({ update_id: id, message: { chat: { id: 999 }, text: '/help' } });
}
function signedBytes(value) {
  return [value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255]
    .map(byte => byte > 127 ? byte - 256 : byte);
}
function activeSession(overrides = {}) {
  return {
    token: 'tok-row', no_hp: '628123456789', member_id: '', otp: "'123456",
    otp_expires_at: '2099-01-01T00:00:00.000Z', otp_used: 0,
    session_expires_at: '', created_at: '2026-07-20T00:00:00.000Z',
    otp_failed_attempts: 0, otp_locked_at: '', otp_plain: "'123456", ...overrides,
  };
}
function activeMember(overrides = {}) {
  return { member_id: 'MBR_test', no_hp: '628123456789', nama: 'Test', status: 'aktif', ...overrides };
}

// Webhook capability, frontend compatibility, malformed input, and dedup.
reset(); properties.TELEGRAM_WEBHOOK_KEY = 'current-sentinel';
assert.strictEqual(post(update(), 'current-sentinel').text, 'ok'); assert.strictEqual(handlerCalls, 1);
assert.strictEqual(cacheData.get('tg_upd_1'), 'DONE');
post(update(), 'current-sentinel'); assert.strictEqual(handlerCalls, 1, 'DONE update must be skipped');
reset(); properties.TELEGRAM_WEBHOOK_KEY_NEXT = 'next-sentinel';
post(update(), 'next-sentinel'); assert.strictEqual(handlerCalls, 1);
for (const supplied of [undefined, '', 'wrong-sentinel']) {
  reset(); properties.TELEGRAM_WEBHOOK_KEY = 'current-sentinel';
  assert.strictEqual(post(update(), supplied).text, 'ok'); assert.strictEqual(handlerCalls, 0);
}
reset(); assert.strictEqual(post(update(), 'wrong-sentinel').text, 'ok'); assert.strictEqual(handlerCalls, 0);
reset(); properties.TELEGRAM_WEBHOOK_KEY = 'current-sentinel'; handlerResult = { ok: false, code: 'TG_HANDLER_FAILED' };
post(update(), 'current-sentinel'); assert(!cacheData.has('tg_upd_1'));
reset(); properties.TELEGRAM_WEBHOOK_KEY = 'current-sentinel'; handlerThrows = true;
assert.strictEqual(post(update(), 'current-sentinel').text, 'ok'); assert(!cacheData.has('tg_upd_1'));
reset(); properties.TELEGRAM_WEBHOOK_KEY = 'current-sentinel'; cacheUnavailable = true;
post(update(), 'current-sentinel'); assert.strictEqual(handlerCalls, 1);
reset(); const ping = post(JSON.stringify({ action: 'ping', payload: {} })); assert.strictEqual(JSON.parse(ping.text).ok, true);
assert.strictEqual(post('{bad', 'key').text, 'ok');
assert.strictEqual(JSON.parse(post('{bad').text).code, 'BAD_REQUEST');
reset(); properties.TELEGRAM_WEBHOOK_KEY = 'current-sentinel';
post(update(), undefined); assert.strictEqual(handlerCalls, 0, 'spoof must not reach Telegram handler');

// setWebhook selection and rotation never return/log keys.
reset(); properties.TELEGRAM_WEBHOOK_KEY = 'current-sentinel'; properties.TELEGRAM_WEBHOOK_KEY_NEXT = 'next-sentinel';
context.setWebhook(); assert(apiCalls[0].payload.url.includes(encodeURIComponent('next-sentinel')));
assert(!logs.join('\n').includes('next-sentinel'));
context.finalizeWebhookKeyRotation(); assert.strictEqual(properties.TELEGRAM_WEBHOOK_KEY, 'next-sentinel');
assert(!('TELEGRAM_WEBHOOK_KEY_NEXT' in properties));
reset(); properties.TELEGRAM_WEBHOOK_KEY = 'current-sentinel'; context.setWebhook();
assert(apiCalls[0].payload.url.includes(encodeURIComponent('current-sentinel')));
assert(!logs.join('\n').includes('current-sentinel')); assert(!logs.join('\n').includes('header-secret'));

// OTP generator: leading zero, rejection, and bounded failure.
reset(); digestQueue = [signedBytes(42)]; assert.strictEqual(context.generateOtp(), '000042');
reset(); digestQueue = [signedBytes(4294967295), signedBytes(1000001)]; assert.strictEqual(context.generateOtp(), '000001');
reset(); digestQueue = Array.from({ length: 20 }, () => signedBytes(4294967295));
assert.throws(() => context.generateOtp(), /OTP_GENERATION_FAILED/);
assert(!/Math\.random/.test(context.generateOtp.toString()));

// OTP verification and persistent lockout.
reset(); sheets.Sessions = [activeSession()]; sheets.Members = [activeMember()]; sheets.MemberAddresses = [];
for (let attempt = 1; attempt <= 4; attempt++) {
  const result = context.authVerifyOtp({ no_hp: '08123456789', otp: '000000' });
  assert.strictEqual(result.code, 'OTP_INVALID'); assert.strictEqual(sheets.Sessions[0].otp_failed_attempts, attempt);
}
let fifth = context.authVerifyOtp({ no_hp: '08123456789', otp: '000000' });
assert.strictEqual(fifth.code, 'OTP_LOCKED'); assert(sheets.Sessions[0].otp_locked_at);
assert.strictEqual(context.authVerifyOtp({ no_hp: '08123456789', otp: '123456' }).code, 'OTP_LOCKED');
// New request after locked row creates a fresh row (old created_at also clears cooldown).
sheets.Sessions[0].created_at = '2020-01-01T00:00:00.000Z'; digestQueue = [signedBytes(654321)];
assert.strictEqual(context.authRequestOtp({ no_hp: '08123456789', nama: 'Test' }).ok, true);
assert.strictEqual(sheets.Sessions.at(-1).otp_failed_attempts, 0); assert.strictEqual(sheets.Sessions.at(-1).otp_locked_at, '');
reset(); sheets.Sessions = [activeSession()]; sheets.Members = [activeMember()]; sheets.MemberAddresses = [];
let good = context.authVerifyOtp({ no_hp: '08123456789', otp: '123456' }); assert.strictEqual(good.ok, true);
assert.strictEqual(good.data.token, 'session-token-sentinel');
assert(sheets.Sessions[0].token.startsWith('sha256$'), 'new bearer token must be hashed at rest');
assert(!sheets.Sessions[0].token.includes(good.data.token), 'raw bearer token must not remain in Sessions');
assert.strictEqual(sheets.Sessions[0].otp_plain, '', 'plaintext OTP must be cleared after successful verification');
assert(context.requireSession(good.data.token), 'hashed session must accept the raw browser token');
assert.strictEqual(context.authVerifyOtp({ no_hp: '08123456789', otp: '123456' }).code, 'OTP_INVALID');
reset(); sheets.Sessions = [activeSession({ otp_expires_at: '2020-01-01T00:00:00.000Z' })];
assert.strictEqual(context.authVerifyOtp({ no_hp: '08123456789', otp: '123456' }).code, 'OTP_INVALID');
reset(); sheets.Sessions = [activeSession()]; sheets.Members = [activeMember()]; sheets.MemberAddresses = []; forceUpdateFalse = true;
assert.strictEqual(context.authVerifyOtp({ no_hp: '08123456789', otp: '000000' }).code, 'INTERNAL');

// Session status hardening and token-free anomaly log.
reset(); sheets.Sessions = [activeSession({ token: 'token-sensitive', member_id: 'MBR_test', otp_used: 1, session_expires_at: '2099-01-01T00:00:00.000Z' })];
sheets.Members = [activeMember()]; assert(context.requireSession('token-sensitive'));
sheets.Members = [activeMember({ status: 'nonaktif' })]; assert.strictEqual(context.requireSession('token-sensitive'), null);
sheets.Members = [activeMember({ status: '' })]; assert.strictEqual(context.requireSession('token-sensitive'), null);
sheets.Members = []; assert.strictEqual(context.requireSession('token-sensitive'), null);
assert(!logs.join('\n').includes('token-sensitive'));
assert.strictEqual(context.requireSession('missing-token'), null);

// New OTP rows are hashed, resend rotates the OTP, and the global window is enforced.
reset(); digestQueue = [signedBytes(654321)];
assert.strictEqual(context.authRequestOtp({ no_hp: '08123456789', nama: 'Test' }).ok, true);
assert(sheets.Sessions[0].token.startsWith('otp_'), 'pending OTP row must not be a bearer session');
assert(sheets.Sessions[0].otp.startsWith('sha256$'), 'OTP must be hashed at rest');
assert(!sheets.Sessions[0].otp.includes('654321'));
assert.strictEqual(sheets.Sessions[0].otp_plain, "'654321", 'active OTP must be visible as text for private-sheet troubleshooting');
properties.OTP_GLOBAL_RATE_STATE = JSON.stringify({ window_start: Date.now(), count: 40 });
assert.strictEqual(context.authRequestOtp({ no_hp: '08111111111', nama: 'Other' }).code, 'OTP_GLOBAL_LIMIT');
properties.OTP_GLOBAL_RATE_STATE = '{broken';
assert.strictEqual(context.authRequestOtp({ no_hp: '08222222222', nama: 'Other' }).code, 'OTP_RATE_LIMIT_UNAVAILABLE');

// JalurPesan sends JSON with a bearer device key and never logs secrets.
reset(); properties.JALURPESAN_BASE_URL = 'https://jalurpesan.example/'; properties.JALURPESAN_DEVICE_KEY = 'jalurpesan-device-key-sensitive';
sheets.MessageTemplates = [{ kode: 'OTP', isi: 'Halo {NAMA}, OTP {OTP}' }];
fetchHandler = () => ({ getResponseCode: () => 200, getContentText: () => '{bad-but-irrelevant' });
let jalurPesan = context.sendOtpViaJalurPesan('628123456789', 'Name Sensitive', '123456');
assert.strictEqual(jalurPesan.ok, true);
assert.strictEqual(fetchRequests[0].url, 'https://jalurpesan.example/api/v1/messages');
assert.strictEqual(fetchRequests[0].options.headers.Authorization, 'Bearer jalurpesan-device-key-sensitive');
assert.strictEqual(fetchRequests[0].options.contentType, 'application/json');
assert.deepStrictEqual(JSON.parse(fetchRequests[0].options.payload), { to: '628123456789', message: 'Halo Name Sensitive, OTP 123456' });
for (const secret of ['jalurpesan-device-key-sensitive', '628123456789', 'Name Sensitive', '123456']) assert(!logs.join('\n').includes(secret));
reset(); assert.strictEqual(context.sendOtpViaJalurPesan('628123456789', 'Test', '123456').code, 'JALURPESAN_NOT_CONFIGURED');
reset(); properties.JALURPESAN_BASE_URL = 'https://jalurpesan.example'; properties.JALURPESAN_DEVICE_KEY = 'token'; fetchHandler = () => ({ getResponseCode: () => 429, getContentText: () => '{}' });
assert.strictEqual(context.sendOtpViaJalurPesan('628123456789', 'Test', '123456').code, 'JALURPESAN_HTTP_ERROR');
assert.strictEqual(context.sendOtpViaJalurPesan('628123456789', 'Test', '123456').http_status, 429);
reset(); properties.JALURPESAN_TEST_PHONE = '08123456789'; properties.JALURPESAN_BASE_URL = 'https://jalurpesan.example'; properties.JALURPESAN_DEVICE_KEY = 'token';
fetchHandler = () => ({ getResponseCode: () => 200, getContentText: () => '{}' });
assert.strictEqual(context.testJalurPesanSend().ok, true);
digestQueue = [signedBytes(222222)];
assert.strictEqual(context.authRequestOtp({ no_hp: '08123456789', nama: 'Fallback' }).ok, true);
assert.strictEqual(otpAdminNotifications, 1, 'Telegram admin fallback must remain active when JalurPesan rejects delivery');

// Midtrans demo account remains local/static and must not consume JalurPesan or Telegram delivery.
reset(); sheets.Settings = [
  { key: 'DEMO_PHONE', value: '08111111111' },
  { key: 'DEMO_OTP', value: '112233' },
];
let demoRequest = context.authRequestOtp({ no_hp: '08111111111', nama: 'Midtrans Reviewer' });
assert.strictEqual(demoRequest.ok, true);
assert(demoRequest.data.message.includes('112233'));
assert.strictEqual(fetchRequests.length, 0);
assert.strictEqual(otpAdminNotifications, 0);

// OTP notification may carry secrets to admins, but must never copy them into logs.
reset();
context.fillTemplate = () => 'wa otp-sensitive'; context.waLink = () => 'https://example.test/otp-sensitive';
context.tgSendToAdmins = () => ({ ok: true });
realSendOtpToAdminTelegram('628500000000', 'name-sensitive', 'otp-sensitive', false);
for (const sentinel of ['628500000000', 'name-sensitive', 'otp-sensitive']) assert(!logs.join('\n').includes(sentinel));

// Login limiter. Restore real handler after Router tests replaced it.
vm.runInContext(fs.readFileSync('backend/Telegram.gs', 'utf8'), context, { filename: 'backend/Telegram.gs' });
context.tgSend = (chatId, text, opts) => { sent.push({ chatId: String(chatId), text, opts }); return { ok: true }; };
context.tgApi = (method, payload) => { apiCalls.push({ method, payload }); return { ok: true }; };
context.sha256 = value => { hashCalls++; return value === 'secret' ? 'hash-secret' : 'hash-' + value; };
context.isAdmin = () => false;
reset(); sheets.Settings = [{ key: 'ADMIN_CHAT_IDS', value: '' }];
for (let i = 1; i <= 5; i++) context.handleTelegramWebhook({ message: { chat: { id: 77 }, text: '/login wrong-password' } });
const hashesAfterFive = hashCalls;
context.handleTelegramWebhook({ message: { chat: { id: 77 }, text: '/login secret' } });
assert.strictEqual(hashCalls, hashesAfterFive + 1, 'sixth attempt may only hash chat ID for cache key, not password');
assert(!sheets.Settings[0].value);
cacheData.clear(); context.handleTelegramWebhook({ message: { chat: { id: 77 }, text: '/login secret' } });
assert.strictEqual(sheets.Settings[0].value, '77');
assert(!cacheData.has('tg_login_' + context.sha256('77').slice(0, 40)), 'successful login must reset limiter');
assert(!logs.join('\n').includes('wrong-password')); assert(!logs.join('\n').includes('77'));
reset(); sheets.Settings = [{ key: 'ADMIN_CHAT_IDS', value: '' }];
const expiredKey = 'tg_login_' + context.sha256('99').slice(0, 40);
cacheData.set(expiredKey, JSON.stringify({ count: 5, started_at_ms: Date.now() - 900001 }));
context.handleTelegramWebhook({ message: { chat: { id: 99 }, text: '/login secret' } });
assert.strictEqual(sheets.Settings[0].value, '99', 'expired window must allow login');
reset(); sheets.Settings = [{ key: 'ADMIN_CHAT_IDS', value: '' }]; cacheUnavailable = true;
context.handleTelegramWebhook({ message: { chat: { id: 88 }, text: '/login secret' } });
assert.strictEqual(sheets.Settings[0].value, '88');

// Redaction allowlist rejects arbitrary sensitive metadata and circular input.
reset();
const circular = { otp: 'otp-sensitive', password: 'password-sensitive', token: 'token-sensitive',
  capability: 'cap-sensitive', phone: '628500000000', email: 'person@example.test',
  address: 'address-sensitive', coordinates: '-6.1,108.1', payload: 'telegram-payload-sensitive' };
circular.self = circular;
context.safeLog('ERROR', 'SECURITY_TEST', '', circular);
const output = logs.join('\n');
for (const sentinel of ['otp-sensitive', 'password-sensitive', 'token-sensitive', 'cap-sensitive',
  '628500000000', 'person@example.test', 'address-sensitive', '-6.1,108.1', 'telegram-payload-sensitive']) {
  assert(!output.includes(sentinel), `sensitive sentinel leaked: ${sentinel}`);
}

console.log('security-harness: all assertions passed');

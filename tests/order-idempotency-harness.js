const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

let sheets;
let settings;
let notifications;
let alerts;
let insideLock;
let writes;

const member = { member_id: 'MBR_1', nama: 'Aman', no_hp: '081234567890', total_poin: 10000, status: 'aktif' };
const context = {
  console, JSON, Date, Math, Number, String, Object, Array, RegExp,
  isNaN, isFinite, parseInt, encodeURIComponent,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    computeDigest(_algorithm, value) {
      const crypto = require('crypto');
      return Array.from(crypto.createHash('sha256').update(String(value)).digest()).map(v => v > 127 ? v - 256 : v);
    },
    formatDate(value, _zone, format) {
      const d = new Date(value);
      const y = d.getUTCFullYear(); const m = String(d.getUTCMonth() + 1).padStart(2, '0'); const day = String(d.getUTCDate()).padStart(2, '0');
      if (format === 'yyyy-MM-dd') return `${y}-${m}-${day}`;
      if (format === 'yyMMdd') return `${String(y).slice(-2)}${m}${day}`;
      if (format === 'HH') return '10';
      return `${y}-${m}-${day} 10:00:00`;
    },
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() { insideLock = false; } }) },
  UrlFetchApp: { fetch() { throw new Error('production network access forbidden'); } },
  PropertiesService: { getScriptProperties: () => ({ getProperty() { throw new Error('production property access forbidden'); } }) },
};
vm.createContext(context);
for (const file of ['backend/Util.gs', 'backend/Lock.gs', 'backend/Promo.gs', 'backend/Order.gs']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}
const realAppendRowsObj = context.appendRowsObj;

context.requireSession = () => ({ ...sheets.Members[0] });
context.readAll = name => (sheets[name] || []).map(row => ({ ...row }));
context.appendRowsObj = (name, rows) => {
  writes.push({ name, count: rows.length });
  if (!sheets[name]) sheets[name] = [];
  rows.forEach(row => sheets[name].push({ ...row }));
  return { first_row: sheets[name].length - rows.length + 2, written: rows.length };
};
context.updateRowById = (name, idColumn, idValue, patch) => {
  const row = (sheets[name] || []).find(item => String(item[idColumn]) === String(idValue));
  if (!row) return false;
  Object.assign(row, patch);
  return true;
};
context.getSetting = key => settings[key] || '';
context.nowJkt = () => '2026-07-22 10:00:00';
context.safeLog = () => {};
context.tgEscapeHtml = value => String(value);
context.tgSendToAdmins = text => { assert.strictEqual(insideLock, false, 'admin alert must be outside lock'); alerts.push(text); };
context._notifyAdminNewOrder = (order, items) => {
  assert.strictEqual(insideLock, false, 'Telegram notification must be outside lock');
  notifications.push({ order, items });
};
const realWithLock = context.withLock;
context.withLock = fn => {
  insideLock = true;
  const result = realWithLock(fn);
  insideLock = false;
  return result;
};

function reset() {
  sheets = {
    Members: [{ ...member }], Orders: [], OrderItems: [], OrderItemAddons: [], PointHistory: [], PromoUsage: [], PromoCodes: [],
    Products: [{ product_id: 'P1', nama: 'Kopi', harga: 20000, kategori_id: 'C1', status: 'aktif', tersedia: 1 }],
    ProductVariants: [], ProductAddons: [{ addon_id: 'A1', product_id: 'P1', nama_addon: 'Extra', harga: 2000, aktif: true }],
    PickupLocations: [{ lokasi_id: 'L1', nama: 'Toko', alamat: 'Toko', latitude: -6.7, longitude: 108.5, jam_buka: '07:00', jam_tutup: '20:00', status: 'aktif' }],
    Holidays: [], DeliverySlots: [{ slot_id: 'S1', jam_mulai: '10:00', jam_selesai: '11:00', kuota: 1, status: 'aktif' }], MemberAddresses: [],
  };
  settings = { TOKO_BUKA: '1', POINT_MIN_REDEEM: '0', POINT_RATE_RP: '1000', ONGKIR_FAKTOR_KOREKSI: '1', ONGKIR_RADIUS_MAX_KM: '15', ONGKIR_PER_KM: '1000', MIN_ORDER_DELIVERY: '0' };
  notifications = []; alerts = []; writes = []; insideLock = false; context.ORDER_TEST_FAIL_STAGE = '';
}

function uuid(n) { return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`; }
function pickupPayload(id = uuid(1)) {
  return { client_request_id: id, metode_kirim: 'AMBIL', lokasi_pickup_id: 'L1', jam_pilih: '10:00', tgl_antar: '2099-01-01', metode_bayar: 'COD', pakai_poin: false, items: [{ product_id: 'P1', qty: 1, addon_ids: ['A1'] }], catatan_customer: '' };
}

// Invalid key, new commit, deterministic children and replay without writes/notification.
reset();
assert.strictEqual(context.orderCreateOrder({ ...pickupPayload(), client_request_id: 'bad' }, 't').code, 'BAD_REQUEST');
let first = context.orderCreateOrder(pickupPayload(), 't');
assert.strictEqual(first.ok, true);
assert.strictEqual(sheets.Orders.length, 1);
assert.strictEqual(sheets.Orders[0].commit_status, 'COMMITTED');
assert.match(sheets.OrderItemAddons[0].id, /^OIA_[0-9a-f]{24}$/);
assert.strictEqual(notifications.length, 1);
const writesAfterFirst = writes.length;
let replay = context.orderCreateOrder(pickupPayload(), 't');
assert.strictEqual(replay.ok, true); assert.strictEqual(replay.data.idempotent_replay, true);
assert.strictEqual(writes.length, writesAfterFirst); assert.strictEqual(notifications.length, 1);
let conflictPayload = pickupPayload(); conflictPayload.items[0].qty = 2;
assert.strictEqual(context.orderCreateOrder(conflictPayload, 't').code, 'ORDER_IDEMPOTENCY_CONFLICT');

// Duplicate add-on rejected before charging/writing.
reset(); const duplicate = pickupPayload(); duplicate.items[0].addon_ids = ['A1', 'A1'];
assert.strictEqual(context.orderCreateOrder(duplicate, 't').code, 'DUPLICATE_ADDON'); assert.strictEqual(sheets.Orders.length, 0);

// Every injected stage leaves a non-visible parent and same-key retry recovers exactly once.
for (const stage of ['PARENT_CREATED','ITEMS_WRITTEN','ADDONS_WRITTEN','PROMO_WRITTEN','MEMBER_UPDATED','COMMITTED']) {
  reset(); context.ORDER_TEST_FAIL_STAGE = stage;
  const failed = context.orderCreateOrder(pickupPayload(), 't');
  assert.strictEqual(failed.ok, false, stage);
  assert.strictEqual(sheets.Orders.length, 1, stage);
  assert.strictEqual(context.isOrderCommittedRow(sheets.Orders[0]), false, stage);
  context.ORDER_TEST_FAIL_STAGE = '';
  const recovered = context.orderCreateOrder(pickupPayload(), 't');
  assert.strictEqual(recovered.ok, true, stage);
  assert.strictEqual(sheets.OrderItems.length, 1, stage);
  assert.strictEqual(sheets.OrderItemAddons.length, 1, stage);
}

// Point event and balance exactly once; conflict is not overwritten.
reset(); const pointPayload = pickupPayload(); pointPayload.pakai_poin = true;
first = context.orderCreateOrder(pointPayload, 't'); assert.strictEqual(first.ok, true);
assert.strictEqual(sheets.PointHistory.length, 1); assert.strictEqual(sheets.Members[0].total_poin, 0);
replay = context.orderCreateOrder(pointPayload, 't'); assert.strictEqual(replay.ok, true); assert.strictEqual(sheets.PointHistory.length, 1);
reset(); context.ORDER_TEST_FAIL_STAGE = 'PROMO_WRITTEN'; context.orderCreateOrder(pointPayload, 't');
sheets.Members[0].total_poin = 777; context.ORDER_TEST_FAIL_STAGE = '';
assert.strictEqual(context.orderCreateOrder(pointPayload, 't').code, 'ORDER_RECOVERY_REQUIRED'); assert.strictEqual(sheets.Members[0].total_poin, 777);

// Conflicting deterministic child becomes recovery required.
reset(); context.ORDER_TEST_FAIL_STAGE = 'PARENT_CREATED'; context.orderCreateOrder(pickupPayload(), 't'); context.ORDER_TEST_FAIL_STAGE = '';
sheets.OrderItems.push({ order_item_ref: sheets.Orders[0].order_id + '_0', order_id: sheets.Orders[0].order_id, product_id: 'OTHER' });
assert.strictEqual(context.orderCreateOrder(pickupPayload(), 't').code, 'ORDER_RECOVERY_REQUIRED');

// Lookup is member scoped and read-only.
reset(); first = context.orderCreateOrder(pickupPayload(), 't'); const beforeLookupWrites = writes.length;
assert.strictEqual(context.orderGetByRequestId({ client_request_id: uuid(1) }, 't').ok, true);
context.requireSession = () => ({ member_id: 'MBR_OTHER', nama: 'Other', no_hp: '0800000000', total_poin: 0, status: 'aktif' });
assert.strictEqual(context.orderGetByRequestId({ client_request_id: uuid(1) }, 't').code, 'ORDER_NOT_FOUND');
assert.strictEqual(writes.length, beforeLookupWrites);
context.requireSession = () => ({ ...sheets.Members[0] });

// Stored address authority, ownership, ad-hoc coordinate range.
reset(); sheets.MemberAddresses.push({ address_id: 'ADDR1', member_id: 'MBR_1', label: 'Rumah', detail: 'Pagar hitam', alamat_snapshot: 'Jalan Aman', latitude: -6.71, longitude: 108.51, status: 'aktif' });
function deliveryPayload(id, addressId) { return { client_request_id: id, metode_kirim: 'DIANTAR', address_id: addressId || '', alamat_snapshot: 'CLIENT', lat: -1, lng: 1, slot_id: 'S1', tgl_antar: '2099-01-01', metode_bayar: 'COD', pakai_poin: false, items: [{ product_id: 'P1', qty: 1 }] }; }
first = context.orderCreateOrder(deliveryPayload(uuid(2), 'ADDR1'), 't'); assert.strictEqual(first.ok, true);
assert.strictEqual(sheets.Orders[0].lat, -6.71); assert.match(sheets.Orders[0].alamat_snapshot, /Jalan Aman/);
reset(); sheets.MemberAddresses.push({ address_id: 'ADDR2', member_id: 'OTHER', alamat_snapshot: 'X', latitude: -6.7, longitude: 108.5, status: 'aktif' });
assert.strictEqual(context.orderCreateOrder(deliveryPayload(uuid(3), 'ADDR2'), 't').code, 'ADDRESS_NOT_FOUND');
reset(); const badCoordinate = deliveryPayload(uuid(4), ''); badCoordinate.lat = 91; badCoordinate.lng = 0;
assert.strictEqual(context.orderCreateOrder(badCoordinate, 't').code, 'BAD_REQUEST');

// Partial reserves slot but is filtered from normal reader.
reset(); context.ORDER_TEST_FAIL_STAGE = 'PARENT_CREATED'; const partialDelivery = deliveryPayload(uuid(5), ''); partialDelivery.lat = -6.71; partialDelivery.lng = 108.51; context.orderCreateOrder(partialDelivery, 't'); context.ORDER_TEST_FAIL_STAGE = '';
assert.strictEqual(context.orderGetMyOrders({}, 't').data.orders.length, 0);
const availability = context.orderGetSlotAvailability({ tanggal: '2099-01-01' });
assert.strictEqual(availability.data[0].sisa, 0);

// Telegram failure never changes committed response.
reset(); context._notifyAdminNewOrder = () => { assert.strictEqual(insideLock, false); throw new Error('telegram down'); };
first = context.orderCreateOrder(pickupPayload(), 't'); assert.strictEqual(first.ok, true); assert.strictEqual(sheets.Orders[0].commit_status, 'COMMITTED');

// Two different keys serialize slot-last and shared balance safely.
reset(); let d1 = deliveryPayload(uuid(20), ''); d1.lat = -6.71; d1.lng = 108.51; let d2 = deliveryPayload(uuid(21), ''); d2.lat = -6.71; d2.lng = 108.51;
assert.strictEqual(context.orderCreateOrder(d1, 't').ok, true);
assert.strictEqual(context.orderCreateOrder(d2, 't').code, 'SLOT_PENUH');
reset(); const p1 = pickupPayload(uuid(22)); p1.pakai_poin = true; const p2 = pickupPayload(uuid(23)); p2.pakai_poin = true;
assert.strictEqual(context.orderCreateOrder(p1, 't').ok, true); assert.strictEqual(context.orderCreateOrder(p2, 't').ok, true);
assert.strictEqual(sheets.Members[0].total_poin, 0); assert.strictEqual(sheets.PointHistory.length, 1);

// Promo usage ensure is deterministic, exactly once, and rejects conflicts.
reset(); const expectedUsage = { usage_id:'PRU_ORDER_O1', promo_id:'PROMO1', promo_code:'ONE', order_id:'O1', member_id:'MBR_1', status:'DIGUNAKAN', promo_diskon_total:1000 };
assert.strictEqual(context._promoEnsureUsage(expectedUsage).ok, true); assert.strictEqual(context._promoEnsureUsage(expectedUsage).ok, true);
assert.strictEqual(sheets.PromoUsage.length, 1);
assert.strictEqual(context._promoEnsureUsage({ ...expectedUsage, promo_diskon_total:2000 }).ok, false);

// Header helper reads header-only and batch append uses one setValues call.
{
  let headerReads = 0; let dataRangeReads = 0; let setValuesCalls = 0; let lastRow = 1;
  const fakeSheet = {
    getLastColumn: () => 2, getLastRow: () => lastRow,
    getDataRange() { dataRangeReads++; throw new Error('full-sheet read forbidden'); },
    getRange(row, col, rowCount) {
      if (row === 1) return { getValues() { headerReads++; return [['id','value']]; } };
      return { getNumRows: () => rowCount, setValues(matrix) { setValuesCalls++; lastRow += matrix.length; } };
    },
  };
  context.getSheet = () => fakeSheet; context._sheetHeadersExecutionCache = {};
  assert.deepStrictEqual(Array.from(context.getSheetHeaders('Test')), ['id','value']);
  assert.deepStrictEqual(Array.from(context.getSheetHeaders('Test')), ['id','value']);
  assert.strictEqual(headerReads, 1); assert.strictEqual(dataRangeReads, 0);
  assert.strictEqual(realAppendRowsObj('Test', [{id:'1',value:'a'},{id:'2',value:'b'}]).written, 2);
  assert.strictEqual(setValuesCalls, 1); assert.strictEqual(realAppendRowsObj('Test', []).written, 0);
}

// Frontend pending TTL and secure UUID fallback, evaluated without booting the UI.
{
  const appSource = fs.readFileSync('docs/app.js','utf8');
  const start = appSource.indexOf("var ORDER_PENDING_KEY"); const end = appSource.indexOf('function campaignTokenFingerprint');
  const storage = new Map();
  const frontend = { JSON, Date, Math, Uint8Array, Array, String, window: { crypto: { getRandomValues(bytes) { for (let i=0;i<bytes.length;i++) bytes[i]=i+1; } } }, session: { member: { member_id: 'MBR_1' } }, localStorage: { getItem:k=>storage.get(k)||null, setItem:(k,v)=>storage.set(k,String(v)), removeItem:k=>storage.delete(k) } };
  vm.createContext(frontend); vm.runInContext(appSource.slice(start,end), frontend);
  assert.match(frontend.createClientRequestId(), /^[0-9a-f-]{36}$/);
  frontend.savePendingOrderAttempt({ client_request_id: uuid(9), member_id:'MBR_1', created_at:Date.now(), status:'UNKNOWN' });
  assert.strictEqual(frontend.loadPendingOrderAttempt().status, 'UNKNOWN');
  frontend.savePendingOrderAttempt({ client_request_id: uuid(9), member_id:'MBR_1', created_at:Date.now()-73*60*60*1000, status:'UNKNOWN' });
  assert.strictEqual(frontend.loadPendingOrderAttempt(), null);
  assert.match(appSource, /getOrderByRequestId/); assert.match(appSource, /Hasil pesanan belum diketahui/);
}

console.log('order-idempotency-harness: all assertions passed');

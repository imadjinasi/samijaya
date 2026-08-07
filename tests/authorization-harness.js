const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

let sheets = {};
let updates = [];
const context = { console, Date, JSON, Math, Number, String, Object, Array, RegExp, isNaN };
vm.createContext(context);
for (const file of ['backend/Address.gs', 'backend/Point.gs', 'backend/Review.gs', 'backend/Order.gs']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

context.requireSession = token => token === 'token-a' ? { member_id: 'MBR_A', total_poin: 11, status: 'aktif' } : null;
context.readAll = name => (sheets[name] || []).map(row => ({ ...row }));
context.withLock = fn => fn();
context.sheetParseId = value => /^ADR_[A-Za-z0-9_-]+$/.test(String(value || '')) ? String(value) : null;
context.sheetParseDecimal = value => Number(value);
context.updateRowById = (name, key, id, patch) => { updates.push({ name, key, id, patch }); return true; };
context.nowJkt = () => '2026-08-07 10:00:00';
context.isOrderCommittedRow = () => true;
context._orderSeenTimestampString = value => String(value || '');
context.transactionNormalizeOrderId = value => /^SJ\d+$/.test(String(value || '')) ? String(value) : null;
context.transactionStrictInteger = value => Number.isInteger(Number(value)) ? Number(value) : null;
context.transactionSafeText = value => String(value || '');

sheets.MemberAddresses = [
  { address_id: 'ADR_A', member_id: 'MBR_A', status: 'aktif' },
  { address_id: 'ADR_B', member_id: 'MBR_B', status: 'aktif' },
];
assert.strictEqual(context.addressUpdate({ address_id: 'ADR_B', label: 'Target' }, 'token-a').code, 'NOT_FOUND');
assert.strictEqual(context.addressDelete({ address_id: 'ADR_B' }, 'token-a').code, 'NOT_FOUND');
assert.strictEqual(updates.length, 0, 'cross-account address must not be mutated');

sheets.PointHistory = [
  { id: 'PA', member_id: 'MBR_A', jumlah: 1, created_at: '2026-08-07' },
  { id: 'PB', member_id: 'MBR_B', jumlah: 999, created_at: '2026-08-07' },
];
const points = context.pointGetMyPoints({}, 'token-a');
assert.deepStrictEqual(Array.from(points.data.riwayat, row => row.id), ['PA']);

sheets.Orders = [
  { order_id: 'SJ1', member_id: 'MBR_A', status: 'MENUNGGU', created_at: '2026-08-07', timeline_json: '[]' },
  { order_id: 'SJ2', member_id: 'MBR_B', status: 'MENUNGGU', created_at: '2026-08-07', timeline_json: '[]' },
];
sheets.OrderItems = [
  { order_id: 'SJ1', nama_snapshot: 'A' },
  { order_id: 'SJ2', nama_snapshot: 'B-secret' },
];
sheets.OrderItemAddons = [];
sheets.Reviews = [];
const orders = context.orderGetMyOrders({}, 'token-a');
assert.deepStrictEqual(Array.from(orders.data.orders, row => row.order_id), ['SJ1']);
assert(!JSON.stringify(orders).includes('B-secret'));

sheets.Reviews = [{ review_id: 'REV_B', order_id: 'SJ2', member_id: 'MBR_B', status: 'aktif' }];
assert.strictEqual(context.reviewDeleteMine({ review_id: 'REV_B' }, 'token-a').code, 'NOT_FOUND');
assert.strictEqual(context.reviewSubmit({ order_id: 'SJ2', rating: 5, ulasan: '' }, 'token-a').code, 'ORDER_NOT_FOUND');

assert.strictEqual(context.pointGetMyPoints({}, 'bad-token').code, 'UNAUTHORIZED');
assert.strictEqual(context.orderGetMyOrders({}, 'bad-token').code, 'UNAUTHORIZED');
console.log('authorization-harness: all assertions passed');


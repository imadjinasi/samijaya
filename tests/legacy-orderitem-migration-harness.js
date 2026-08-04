const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

class Sheet {
  constructor(name, values) { this.name=name; this.values=values; this.dataReads=0; this.writes=[]; }
  getDataRange() { this.dataReads++; return { getValues:()=>this.values.map(row=>row.slice()) }; }
  getRange(row, col) {
    return { setValue:value => { this.values[row-1][col-1]=value; this.writes.push({row,col,value}); } };
  }
}

const products = new Sheet('Products', [
  ['product_id','nama'],
  ['P1','Latte'],
  ['P2','Nama Ganda'],
  ['P3','Nama Ganda']
]);
const orderItems = new Sheet('OrderItems', [
  ['order_id','product_id','nama_snapshot','harga_snapshot','qty','subtotal'],
  ['O1','OLD-1',' Latte ',10000,1,10000],
  ['O2','OLD-2','Tidak Ada',10000,1,10000],
  ['O3','OLD-3','Nama Ganda',10000,1,10000],
  ['O4','P1','Latte',10000,1,10000]
]);

let insideLock = false;
const context = {
  console, JSON, String, Object, Array, Error,
  getSheet:name => name === 'Products' ? products : orderItems,
  sheetPrepareValue:value => String(value),
  withLock:fn => { assert.strictEqual(insideLock,false); insideLock=true; try { return fn(); } finally { insideLock=false; } },
  Logger:{ log(){} }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('backend/_migrateLegacyOrderItems.gs','utf8'), context, { filename:'backend/_migrateLegacyOrderItems.gs' });

let report = context.auditLegacyOrderItemProductMappingReadOnly();
assert.deepStrictEqual(
  {valid:report.valid_rows,orphan:report.orphan_rows,mappable:report.mappable_rows,unmatched:report.unmatched_rows,ambiguous:report.ambiguous_rows},
  {valid:1,orphan:3,mappable:1,unmatched:1,ambiguous:1}
);
assert.strictEqual(products.dataReads,1);
assert.strictEqual(orderItems.dataReads,1);
assert.strictEqual(orderItems.writes.length,0, 'read-only audit wrote OrderItems');

report = context.migrateLegacyOrderItemProductIdsByExactName();
assert.strictEqual(report.updated_rows,1);
assert.strictEqual(report.ok,false, 'unmatched/ambiguous rows must remain visible as unresolved');
assert.strictEqual(orderItems.values[1][1],'P1');
assert.strictEqual(orderItems.values[2][1],'OLD-2');
assert.strictEqual(orderItems.values[3][1],'OLD-3');
assert.strictEqual(orderItems.writes.length,1);

report = context.migrateLegacyOrderItemProductIdsByExactName();
assert.strictEqual(report.updated_rows,0, 'migration must be idempotent');
assert.strictEqual(orderItems.writes.length,1);
assert.strictEqual(products.dataReads,3, 'Products must be read once per invocation');
assert.strictEqual(orderItems.dataReads,3, 'OrderItems must be read once per invocation');

console.log('legacy-orderitem-migration-harness: all assertions passed');

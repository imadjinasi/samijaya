const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');

const RealDate = Date;
const TEST_NOW_ISO = '2026-07-22T03:00:00.000Z';
const TEST_NOW_MS = new RealDate(TEST_NOW_ISO).getTime();
class FixedDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [TEST_NOW_MS])); }
  static now() { return TEST_NOW_MS; }
}
function testTimestampDaysAgo(days) {
  return new RealDate(TEST_NOW_MS - days * 86400000).toISOString().slice(0, 10) + ' 10:00:00';
}

let sheets;
let insideLock = false;
const context = {
  console, JSON, Date: FixedDate, Math, Number, String, Object, Array, RegExp, isNaN, isFinite, parseInt,
  Utilities: { formatDate(value, _zone, format) {
    const d = new RealDate(value); const y = d.getUTCFullYear(); const m = String(d.getUTCMonth()+1).padStart(2,'0'); const day = String(d.getUTCDate()).padStart(2,'0');
    if (format === 'yyyy-MM-dd') return `${y}-${m}-${day}`;
    return `${y}-${m}-${day}T10:00:00+07:00`;
  } },
};
vm.createContext(context);
for (const file of ['backend/Util.gs','backend/Point.gs','backend/Promo.gs','backend/Review.gs','backend/Order.gs']) vm.runInContext(fs.readFileSync(file,'utf8'), context, { filename:file });

context.sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
context.nowJkt = () => '2026-07-22 10:00:00';
context.safeLog = () => {};
context.log = () => {};
context.getSetting = key => key === 'POINT_RATE_RP' ? '1000' : '';
context.isAdmin = id => String(id) === 'ADMIN';
context.requireSession = () => ({ ...sheets.Members[0] });
context.readAll = name => (sheets[name] || []).map(row => ({ ...row }));
context.appendRowsObj = (name, rows) => { if (!sheets[name]) sheets[name]=[]; rows.forEach(row => sheets[name].push({...row})); return { written:rows.length }; };
context.appendRowObj = (name, row) => { context.appendRowsObj(name,[row]); return row; };
context.updateRowById = (name, idCol, id, patch) => { const row=(sheets[name]||[]).find(r=>String(r[idCol])===String(id)); if(!row)return false; Object.assign(row,patch); return true; };
context.withLock = fn => { assert.strictEqual(insideLock,false,'nested lock'); insideLock=true; try{return fn();} finally{insideLock=false;} };
context._promoRefundUsageByOrder = (orderId, at) => {
  const rows=sheets.PromoUsage.filter(r=>String(r.order_id)===String(orderId));
  if(rows.length>1)return {ok:false,code:'PROMO_USAGE_DUPLICATE'};
  if(!rows.length)return {ok:true,absent:true};
  if(rows[0].status==='DIBATALKAN')return {ok:true,existing:true};
  if(rows[0].status!=='DIGUNAKAN')return {ok:false,code:'PROMO_USAGE_STATUS_CONFLICT'};
  rows[0].status='DIBATALKAN'; rows[0].cancelled_at=at; return {ok:true};
};

function reset(status='MENUNGGU', method='AMBIL') {
  sheets={
    Members:[{member_id:'M1',nama:'A',status:'aktif',total_poin:100,total_belanja:0}],
    Orders:[{order_id:'O1',member_id:'M1',status,metode_kirim:method,total:20000,poin_dipakai:25,poin_earn_final:20,commit_status:'COMMITTED',updated_at:testTimestampDaysAgo(1),status_updated_at:testTimestampDaysAgo(1),timeline_json:'[]',promo_id:''}],
    PointHistory:[],PromoUsage:[],Reviews:[]
  };
  context.ORDER_STATUS_TEST_FAIL_STAGE=''; context.REVIEW_TEST_FAIL_STAGE='';
}

// State machine, actor, method, replay, partial order, and exactly-once total_belanja.
reset(); assert.strictEqual(context.orderUpdateStatus('O1','DIPROSES','NO').code,'UNAUTHORIZED_ACTOR');
assert.strictEqual(context.orderUpdateStatus('O1','SIAP','ADMIN').code,'TRANSISI_TIDAK_VALID');
assert.strictEqual(context.orderUpdateStatus('O1','DIPROSES','ADMIN').ok,true);
assert.strictEqual(context.orderUpdateStatus('O1','DIPROSES','ADMIN').data.unchanged,true);
reset('SIAP','AMBIL'); assert.strictEqual(context.orderUpdateStatus('O1','DIANTAR','ADMIN').code,'TRANSISI_METODE_TIDAK_VALID');
reset('SIAP','DIANTAR'); assert.strictEqual(context.orderUpdateStatus('O1','DIANTAR','ADMIN').ok,true); assert.strictEqual(context.orderUpdateStatus('O1','SELESAI','ADMIN').ok,true);
assert.strictEqual(sheets.Members[0].total_belanja,20000); assert.strictEqual(context.orderUpdateStatus('O1','SELESAI','ADMIN').data.unchanged,true); assert.strictEqual(sheets.Members[0].total_belanja,20000);
reset(); sheets.Orders[0].commit_status='CREATING'; assert.strictEqual(context.orderUpdateStatus('O1','DIPROSES','ADMIN').code,'ORDER_NOT_FOUND');

// Cancellation refunds redeem and cancels promo exactly once; terminal replay is harmless.
reset('DIPROSES'); sheets.Orders[0].promo_id='P1'; sheets.PromoUsage=[{usage_id:'U1',order_id:'O1',status:'DIGUNAKAN'}];
let result=context.orderUpdateStatus('O1','BATAL','ADMIN','=formula reason'); assert.strictEqual(result.ok,true);
assert.strictEqual(sheets.Members[0].total_poin,125); assert.strictEqual(sheets.PointHistory.length,1); assert.strictEqual(sheets.PointHistory[0].id,'PTH_ORDER_REFUND_O1');
assert.strictEqual(sheets.PromoUsage[0].status,'DIBATALKAN'); assert.strictEqual(sheets.Orders[0].cancel_reason,"'=formula reason");
assert.strictEqual(context.orderUpdateStatus('O1','BATAL','ADMIN').data.unchanged,true); assert.strictEqual(sheets.Members[0].total_poin,125); assert.strictEqual(sheets.PointHistory.length,1);
reset('DIPROSES'); sheets.PointHistory.push({id:'OLD',order_id:'O1',tipe:'KOREKSI'}); assert.strictEqual(context.orderUpdateStatus('O1','BATAL','ADMIN').code,'ORDER_TRANSACTION_RECOVERY_REQUIRED');

// Status failpoints leave auditable recovery and retry completes from snapshot.
for (const stage of ['SNAPSHOT_WRITTEN','TOTAL_BELANJA','ORDER_UPDATED']) {
  reset('SIAP'); context.ORDER_STATUS_TEST_FAIL_STAGE=stage; result=context.orderUpdateStatus('O1','SELESAI','ADMIN'); assert.strictEqual(result.ok,false,stage);
  assert.strictEqual(sheets.Orders[0].transaction_status,'RECOVERY_REQUIRED',stage); context.ORDER_STATUS_TEST_FAIL_STAGE='';
  assert.strictEqual(context.orderUpdateStatus('O1','SELESAI','ADMIN').ok,true,stage); assert.strictEqual(sheets.Members[0].total_belanja,20000,stage);
}
for (const stage of ['REFUND_REDEEM','PROMO_CANCEL','ORDER_UPDATED']) {
  reset('DIPROSES'); if(stage==='PROMO_CANCEL'){sheets.Orders[0].promo_id='P1';sheets.PromoUsage=[{usage_id:'U1',order_id:'O1',status:'DIGUNAKAN'}];}
  context.ORDER_STATUS_TEST_FAIL_STAGE=stage; result=context.orderUpdateStatus('O1','BATAL','ADMIN'); assert.strictEqual(result.ok,false,stage); context.ORDER_STATUS_TEST_FAIL_STAGE='';
  assert.strictEqual(context.orderUpdateStatus('O1','BATAL','ADMIN').ok,true,stage); assert.strictEqual(sheets.Members[0].total_poin,125,stage); assert.strictEqual(sheets.PointHistory.length,1,stage);
}

// Review ownership/status/input, canonical upsert, formula safety, reward exactly once.
reset('SELESAI'); result=context.reviewSubmit({order_id:'O1',rating:5,ulasan:'=SUM(1,2)'},'t'); assert.strictEqual(result.ok,true); assert.strictEqual(result.data.poin_ditambah,20);
assert.strictEqual(sheets.Reviews[0].review_id,'REV_ORDER_O1'); assert.strictEqual(sheets.Reviews[0].ulasan,"'=SUM(1,2)"); assert.strictEqual(sheets.PointHistory[0].event_code,'ORDER_REWARD_RELEASED_BY_REVIEW'); assert.strictEqual(sheets.Members[0].total_poin,120);
result=context.reviewSubmit({order_id:'O1',rating:5,ulasan:'=SUM(1,2)'},'t'); assert.strictEqual(result.data.idempotent_replay,true); assert.strictEqual(sheets.PointHistory.length,1); assert.strictEqual(sheets.Members[0].total_poin,120);
result=context.reviewSubmit({order_id:'O1',rating:4,ulasan:'baru'},'t'); assert.strictEqual(result.data.updated,true); assert.strictEqual(sheets.PointHistory.length,1); assert.strictEqual(sheets.Reviews.length,1);
assert.strictEqual(context.reviewDeleteMine({order_id:'O1'},'t').ok,true); assert.strictEqual(sheets.Members[0].total_poin,120); assert.strictEqual(sheets.PointHistory.length,1);
reset('DIPROSES'); assert.strictEqual(context.reviewSubmit({order_id:'O1',rating:5,ulasan:''},'t').code,'BAD_REQUEST');
reset('SELESAI'); sheets.Orders[0].member_id='OTHER'; assert.strictEqual(context.reviewSubmit({order_id:'O1',rating:5,ulasan:''},'t').code,'ORDER_NOT_FOUND');
reset('SELESAI'); for(const rating of ['5x',1.5,0,6]) assert.strictEqual(context.reviewSubmit({order_id:'O1',rating,ulasan:''},'t').code,'REVIEW_RATING_INVALID');
assert.strictEqual(context.reviewSubmit({order_id:'bad',rating:5,ulasan:''},'t').code,'BAD_REQUEST');

// Review partial failure is recoverable; conflicting balance fails closed.
reset('SELESAI'); context.REVIEW_TEST_FAIL_STAGE='REVIEW_WRITTEN'; assert.strictEqual(context.reviewSubmit({order_id:'O1',rating:5,ulasan:'x'},'t').code,'REVIEW_RECOVERY_REQUIRED');
context.REVIEW_TEST_FAIL_STAGE=''; assert.strictEqual(context.reviewSubmit({order_id:'O1',rating:5,ulasan:'x'},'t').ok,true); assert.strictEqual(sheets.PointHistory.length,1);
reset('SELESAI'); sheets.PointHistory=[{id:'PTH_ORDER_REWARD_O1',member_id:'M1',order_id:'O1',tipe:'TAMBAH',jumlah:20,saldo_sebelum:50,saldo_akhir:70,event_code:'ORDER_REWARD_RELEASED_BY_REVIEW'}];
assert.strictEqual(context.reviewSubmit({order_id:'O1',rating:5,ulasan:'x'},'t').code,'REVIEW_REWARD_RECOVERY_REQUIRED'); assert.strictEqual(sheets.Members[0].total_poin,100);
reset('SELESAI'); sheets.PointHistory=[{id:'LEGACY',member_id:'M1',order_id:'O1',tipe:'TAMBAH',jumlah:20,saldo_akhir:120}];
assert.strictEqual(context.reviewSubmit({order_id:'O1',rating:5,ulasan:'legacy'},'t').ok,true); assert.strictEqual(sheets.PointHistory.length,1); assert.strictEqual(sheets.Members[0].total_poin,100);

// Readers reject partial/mismatched reviews.
reset('SELESAI'); sheets.Reviews=[{review_id:'R1',order_id:'O1',member_id:'OTHER',rating:5,ulasan:'bad',status:'aktif'}]; assert.strictEqual(context.reviewGetPublic().data.total_ulasan,0);
sheets.Reviews[0].member_id='M1'; assert.strictEqual(context.reviewGetPublic().data.total_ulasan,1); sheets.Orders[0].commit_status='CREATING'; assert.strictEqual(context.reviewGetPublic().data.total_ulasan,0);

// Static guards: frontend no longer delete-then-submit; reports require SELESAI; notifications gate unchanged replay.
const app=fs.readFileSync('docs/app.js','utf8'); const submitBlock=app.slice(app.indexOf('async function submitReview'),app.indexOf('async function deleteReview'));
assert(!submitBlock.includes("api('deleteMyReview'"));
const telegram=fs.readFileSync('backend/Telegram.gs','utf8'); assert(telegram.includes("String(orders[i].status) === 'SELESAI'")); assert(telegram.includes('!res.data.unchanged'));

console.log('transaction-hardening-harness: all assertions passed');

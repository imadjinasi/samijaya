const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

let propertyWrites=0, cacheCalls=0, networkCalls=0, telegramCalls=0;
const properties={SPREADSHEET_ID:'spreadsheet-secret-sentinel',TELEGRAM_WEBHOOK_KEY:'webhook-secret-sentinel'};
const context={console,JSON,Date,Math,Number,String,Boolean,Object,Array,RegExp,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||'',setProperty(){propertyWrites++;},deleteProperty(){propertyWrites++;}})},
  CacheService:{getScriptCache:()=>{cacheCalls++;return{get(){},put(){cacheCalls++;},remove(){cacheCalls++;}}}},
  UrlFetchApp:{fetch(){networkCalls++;throw Error('network forbidden');}}, tgSend(){telegramCalls++;},
  Utilities:{getUuid:()=> '12345678-1234-4123-8123-123456789012'}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('backend/Schema.gs','utf8'),context);
vm.runInContext(fs.readFileSync('backend/Phase8DReadinessAudit.gs','utf8'),context);

// Finding status is driven by evidence count before an explicit non-zero status.
assert.strictEqual(context.phase8DFinding('POINT_LEGACY_AMBIGUOUS','WARNING',0,[],'act','UNVERIFIED').status,'VERIFIED');
assert.strictEqual(context.phase8DFinding('POINT_LEGACY_AMBIGUOUS','WARNING',1,['MEM_LEG'],'act','UNVERIFIED').status,'UNVERIFIED');
assert.strictEqual(context.phase8DFinding('ORDINARY_CONFLICT','ERROR',0,[],'act').status,'VERIFIED');
assert.strictEqual(context.phase8DFinding('ORDINARY_CONFLICT','ERROR',1,['SJ260722001'],'act').status,'CONFLICT');

// Full schema complete/incomplete and Banners absence.
const headers={};
for(const group of context.PHASE8D_LAUNCH_SCHEMA_GROUPS) for(const [sheet,list] of Object.entries(group.sheets)) headers[sheet]=Array.from(new Set([...(headers[sheet]||[]),...list]));
context.getSheetHeaders=name=>{if(!headers[name])throw Error('missing '+name);return headers[name].slice();};
let schema=context.auditPhase8DLaunchSchemaReadOnly();
assert.strictEqual(schema.ok,true); assert.strictEqual(schema.banners_required,false);
assert(!context.PHASE8D_LAUNCH_SCHEMA_GROUPS.some(g=>Object.prototype.hasOwnProperty.call(g.sheets,'Banners')));
headers.Orders=headers.Orders.filter(x=>x!=='commit_status'); schema=context.auditPhase8DLaunchSchemaReadOnly();
assert.strictEqual(schema.ok,false); assert(schema.groups.some(g=>g.status==='REQUIRED'));
headers.Orders.push('commit_status');

const base={
  Members:[{member_id:'MEM_A',total_poin:99,total_belanja:999},{member_id:'MEM_LEG',total_poin:5,total_belanja:20}],
  Orders:[
    {order_id:'SJ260722001',member_id:'MEM_A',status:'SELESAI',subtotal:100,poin_dipakai:10,poin_earn_final:20,commit_status:'COMMITTED',transaction_status:'APPLIED',promo_code:'P1'},
    {order_id:'SJ260722002',member_id:'MEM_A',status:'MENUNGGU',subtotal:50,commit_status:'CREATING'},
    {order_id:'SJ260722003',member_id:'MEM_A',status:'MENUNGGU',subtotal:50,commit_status:'RECOVERY_REQUIRED',transaction_status:'RECOVERY_REQUIRED'},
    {order_id:'SJ260722004',member_id:'MEM_LEG',status:'SELESAI',subtotal:20,commit_status:''},
    {order_id:'SJ260722005',member_id:'MEM_A',status:'MENUNGGU',subtotal:1,poin_dipakai:3,commit_status:'COMMITTED'}
  ],
  OrderItems:[{order_id:'SJ260722001',order_item_ref:'SJ260722001_0'},{order_id:'SJ999999999',order_item_ref:'orphan'}],
  OrderItemAddons:[{id:'ADD_orphan',order_id:'SJ260722001',order_item_ref:'missing_ref'}],
  PointHistory:[
    {id:'PTH_ORDER_REDEEM_SJ260722001',member_id:'MEM_A',order_id:'SJ260722001',jumlah:-5,event_code:'ORDER_REDEEMED',saldo_akhir:90},
    {id:'PTH_ORDER_REDEEM_SJ260722001',member_id:'MEM_A',order_id:'SJ260722001',jumlah:-5,event_code:'ORDER_REDEEMED',saldo_akhir:90},
    {id:'PTH_ORDER_REDEEM_SJ260722005',member_id:'WRONG',order_id:'SJ260722005',jumlah:-1,event_code:'ORDER_REDEEMED',saldo_akhir:89},
    {id:'PTH_LEGACY',member_id:'MEM_LEG',order_id:'SJ260722004',jumlah:5,event_code:'',saldo_akhir:5}
  ],
  PromoUsage:[{usage_id:'PU_1',order_id:'SJ260722001',member_id:'WRONG',promo_code:'P1'},{usage_id:'PU_2',order_id:'SJ260722001',member_id:'MEM_A',promo_code:'P1'}],
  Reviews:[{review_id:'REV_ORDER_SJ260722001',order_id:'SJ260722001',member_id:'WRONG'},{review_id:'REV_DUP',order_id:'SJ260722001',member_id:'MEM_A'}],
  Sessions:[{token:'secret-session-token',otp_failed_attempts:1,otp_locked_at:'2026-07-22',otp_used:0}],
  Settings:[],Products:[],Categories:[],PickupLocations:[],DeliverySlots:[],Holidays:[],ProductVariants:[],ProductAddons:[],PromoCodes:[],MessageTemplates:[],Campaigns:[],Logs:[]
};
context.readAll=name=>JSON.parse(JSON.stringify(base[name]||[]));
context.schemaFindDuplicatePrimaryIds=name=>name==='Orders'?['SJ260722001']:[];

let findings=context.auditPhase8DOrdersReadOnly();
assert(findings.find(x=>x.code==='ORDER_CHILD_ORPHAN').count>=2);
assert(findings.find(x=>x.code==='ORDER_CREATING').count===1);
assert(findings.find(x=>x.code==='ORDER_RECOVERY_REQUIRED').count===1);
findings=context.auditPhase8DLedgerReadOnly();
assert(findings.find(x=>x.code==='POINT_EVENT_DUPLICATE').count>0);
assert(findings.find(x=>x.code==='POINT_EVENT_CONFLICT').count>0);
assert(findings.find(x=>x.code==='POINT_BALANCE_MISMATCH').count>0);
assert(findings.find(x=>x.code==='POINT_LEGACY_AMBIGUOUS').status==='UNVERIFIED');
findings=context.auditPhase8DPromoReviewsReadOnly();
assert(findings.find(x=>x.code==='PROMO_USAGE_MISMATCH').count>0);
assert(findings.find(x=>x.code==='REVIEW_DUPLICATE').count>0);
assert(findings.find(x=>x.code==='REVIEW_RELATION_MISMATCH').count>0);
assert(findings.find(x=>x.code==='REVIEW_REWARD_MISMATCH').count>0);
const financial=context.auditPhase8DFinancialReadOnly();
assert(financial.findings.find(x=>x.code==='MEMBER_SPEND_MISMATCH').count===1);
assert(financial.findings.find(x=>x.code==='MEMBER_SPEND_LEGACY_UNVERIFIED').status==='UNVERIFIED');
assert.strictEqual(financial.metrics.committed_completed_revenue,120);

// Safe references, redaction-by-construction and sample limit.
assert.match(context.phase8DSafeReference('secret-session-token'),/^REF-/);
const limited=context.phase8DFinding('TEST','ERROR',20,Array.from({length:20},(_,i)=>'unsafe personal '+i),'act');
assert.strictEqual(limited.samples.length,10); assert.strictEqual(limited.sample_limited,true);
assert(!JSON.stringify(context.auditPhase8DSessionsReadOnly()).includes('secret-session-token'));
assert.match(context.phase8DSafeReference('AUDIT_1720000000000'),/^(AUDIT_|REF-)/);

// Optional catalog revision is warning and no value is exposed.
const propertyResult=context.auditPhase8DPropertiesReadOnly();
assert.strictEqual(propertyResult.CATALOG_CACHE_REVISION.status,'missing');
assert.strictEqual(propertyResult.CATALOG_CACHE_REVISION.severity,'WARNING');
assert(!JSON.stringify(propertyResult).includes('secret-sentinel')); // values never exposed

// Static and dynamic read-only guarantees.
const source=fs.readFileSync('backend/Phase8DReadinessAudit.gs','utf8');
assert.doesNotMatch(source,/\b(?:appendRowObj|appendRowsObj|updateRowById|setProperty|deleteProperty|clearApplicationDataCaches|invalidateCatalogAfterMutation|tgSend|UrlFetchApp)\s*\(/);
assert.strictEqual(propertyWrites,0); assert.strictEqual(cacheCalls,0); assert.strictEqual(networkCalls,0); assert.strictEqual(telegramCalls,0);

// Section isolation, summary severity/action, and bounded logs.
context.auditPhase8DOrdersReadOnly=()=>{throw Error('isolated failure');};
context.getSheet=()=>({getLastRow:()=>302,getLastColumn:()=>5,getRange:(r,c,n)=>({getValues:()=>r===1?[['timestamp','tipe','ref_id','pesan','detail_json']]:Array.from({length:n},()=>['','ERROR','SJ260722001','RECOVERY_REQUIRED',''])})});
const logFinding=context.auditPhase8DRecentLogsReadOnly()[0];
assert.strictEqual(logFinding.rows_examined,250); assert.strictEqual(logFinding.window_limited,true); assert.strictEqual(logFinding.status,'UNVERIFIED');
const report=context.auditPhase8DReadinessReadOnly();
assert.strictEqual(report.sections.orders.status,'UNVERIFIED');
assert.strictEqual(report.sections.orders.findings[0].status,'UNVERIFIED');
assert.strictEqual(report.ok,false);
const allFindings=Object.values(report.sections).flatMap(s=>s.findings||[]).filter(x=>x&&x.code);
assert(allFindings.every(x=>x.recommended_action||x.code==='LAUNCH_SCHEMA'));

console.log('phase8d-readiness-harness: all assertions passed');

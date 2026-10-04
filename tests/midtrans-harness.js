'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const order={order_id:'TEST_123',member_id:'M1',nama:'Tes',no_hp:'0800000000',total:'27000',
  metode_bayar:'MIDTRANS',status:'MENUNGGU',commit_status:'COMMITTED',
  commit_snapshot_json:JSON.stringify({order:{order_id:'TEST_123'},notification_items:[]})};
let payment=null,notices=0,snapBody=null,snapHeaders=null;
const queued=[];
function query(sql,args=[]) {
  if(sql.includes('FROM samijaya."Orders" WHERE')) return {rows:[order]};
  if(sql.includes('SELECT * FROM samijaya.midtrans_payments')) return {rows:payment?[{...payment}]:[]};
  if(sql.includes('INSERT INTO samijaya.midtrans_payments')) {
    payment={order_id:args[0],gateway_order_id:args[1],amount:args[2],state:'INITIATING',expires_at:args[3],updated_at:new Date()};
    return {rows:[]};
  }
  if(sql.includes('SET snap_token=')) {payment.snap_token=args[1];payment.redirect_url=args[2];payment.state='PENDING';return {rows:[]};}
  if(sql.includes('SET state=$2')) {payment.state=args[1];if(args[1]==='PAID') payment.paid_at=new Date();return {rows:[]};}
  if(sql.includes('SET notified_at=now()')) {payment.notified_at=new Date();return {rows:[]};}
  throw new Error('Unexpected query: '+sql.slice(0,70));
}
const moduleBox={exports:{}};
const sandbox={module:moduleBox,exports:moduleBox.exports,Buffer,Date,Intl,Number,String,JSON,Error,
  AbortSignal,setImmediate:fn=>queued.push(fn),
  process:{env:{MIDTRANS_MODE:'sandbox',MIDTRANS_SANDBOX_SERVER_KEY:'test-only-key',MIDTRANS_SANDBOX_CLIENT_KEY:'test-client-key'}},
  require:name=>name==='node:crypto'?crypto:name==='./compat'?{query,context:()=>({requireSession:token=>token==='valid'?{member_id:'M1'}:null,
    _notifyAdminNewOrder:()=>{notices++;return {ok:true};}})}:name==='./notification-queue'?{enqueuePaid:()=>1}:null,
  fetch:async(_url,options)=>{snapBody=JSON.parse(options.body);snapHeaders=options.headers;return {ok:true,json:async()=>({token:'test-token',redirect_url:'https://app.sandbox.midtrans.com/snap/v2/vtweb/test'})};}
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','server','midtrans.js'),'utf8'),sandbox,{filename:'midtrans.js'});
const midtrans=moduleBox.exports;
function notification(amount='27000.00',status='settlement',code='200') {
  const body={order_id:'SJ-TEST_123',status_code:code,gross_amount:amount,transaction_status:status,fraud_status:'accept'};
  body.signature_key=crypto.createHash('sha512').update(body.order_id+body.status_code+body.gross_amount+'test-only-key').digest('hex');
  return body;
}
(async()=>{
  assert.equal((await midtrans.customerPayment('TEST_123','invalid')).code,'UNAUTHORIZED');
  const pending=await midtrans.ensurePayment('TEST_123');
  assert.equal(pending.status,'PENDING');
  assert.equal(pending.snap_token,'test-token');
  assert.equal(pending.client_key,'test-client-key');
  assert.equal(pending.snap_js_url,'https://app.sandbox.midtrans.com/snap/snap.js');
  assert.equal(snapBody.transaction_details.gross_amount,27000);
  assert.equal(snapBody.expiry.duration,30);
  assert.equal(snapHeaders['X-Override-Notification'],'https://samijaya.online/midtrans/notification');
  assert.equal(midtrans.webhook({...notification(),signature_key:'bad'}).status,403);
  assert.equal(midtrans.webhook(notification('28000.00')).status,503);
  assert.equal(payment.state,'PENDING');
  assert.equal(midtrans.webhook(notification()).status,200);
  assert.equal(payment.state,'PAID');
  while(queued.length) queued.shift()();
  assert.equal(notices,1);
  assert.equal(midtrans.webhook(notification()).status,200);
  while(queued.length) queued.shift()();
  assert.equal(notices,1);
  assert.equal(midtrans.webhook(notification('27000.00','expire','407')).status,200);
  assert.equal(payment.state,'PAID');
  assert.equal(midtrans.webhook(notification('27000.00','partial_refund')).status,200);
  assert.equal(payment.state,'PARTIAL_REFUND');
  assert.equal(midtrans.webhook(notification('27000.00','refund')).status,200);
  assert.equal(payment.state,'REFUNDED');
  assert.equal(midtrans.webhook(notification()).status,200);
  assert.equal(payment.state,'REFUNDED');
  console.log('midtrans-harness: all assertions passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

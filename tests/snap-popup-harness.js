'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('docs/app.js','utf8');
function extract(name) {
  let start=source.indexOf('function '+name+'(');
  if(start<0) throw new Error('Missing '+name);
  if(source.slice(start-6,start)==='async ') start-=6;
  let depth=0,quote='',escape=false;
  for(let i=source.indexOf('{',start);i<source.length;i++) {
    const c=source[i];
    if(quote) {if(escape) escape=false;else if(c==='\\') escape=true;else if(c===quote) quote='';continue;}
    if(c==='"'||c==="'"||c==='`') {quote=c;continue;}
    if(c==='{') depth++;
    if(c==='}'&&--depth===0) return source.slice(start,i+1);
  }
  throw new Error('Unterminated '+name);
}
let opened=null,redirected=null,toast='',ordersOpened=0,successClosed=0,serverState='PENDING';
const badge={textContent:''};
const success={classList:{contains:()=>false}};
const context={Promise,Error,URL,String,Array,setTimeout:fn=>fn(),document:{getElementById:id=>id==='success-payment-status'?badge:id==='success-screen'?success:null},window:{
  snap:{pay:(token,callbacks)=>{opened={token,callbacks};}},
  location:{assign:url=>{redirected=url;}}
},_snapOpening:false,_snapScriptPromise:null,_paymentPollRun:0,
  api:async()=>({ok:true,data:{payment:{status:serverState}}}),
  showToast:value=>{toast=value;},showMyOrders:()=>{ordersOpened++;},closeSuccessScreen:()=>{successClosed++;}};
vm.createContext(context);
for(const name of ['redirectToMidtrans','loadSnapScript','checkPaymentAfterSnap','presentPayment']) vm.runInContext(extract(name),context);
(async()=>{
  const payment={status:'PENDING',snap_token:'test-snap-token',client_key:'test-client-key',
    snap_js_url:'https://app.midtrans.com/snap/snap.js',redirect_url:'https://app.midtrans.com/snap/v2/vtweb/test'};
  await context.presentPayment(payment,'TEST_ORDER');
  assert.equal(opened.token,'test-snap-token');
  assert.equal(redirected,null);
  opened.callbacks.onPending();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ordersOpened,0,'Snap callback alone must not mark an order paid');
  assert.match(toast,/sedang diperiksa/);
  serverState='PAID';
  opened.callbacks.onSuccess();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ordersOpened,1);
  assert.equal(successClosed,1,'Paid order must dismiss the waiting screen');
  assert.equal(badge.textContent,'✓ Pembayaran diterima');
  await context.presentPayment({...payment,client_key:''},'TEST_ORDER');
  assert.equal(redirected,payment.redirect_url,'Unavailable Snap must fall back to same-tab redirect');
  console.log('snap-popup-harness: all assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

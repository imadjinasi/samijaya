'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('docs/app.js','utf8');
function extract(name) {
  let start=source.indexOf('function '+name+'(');
  if(start<0)throw new Error('Missing '+name);
  if(source.slice(start-6,start)==='async ')start-=6;
  let depth=0,quote='',escape=false;
  for(let i=source.indexOf('{',start);i<source.length;i++){
    const c=source[i];
    if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;
    if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('Unterminated '+name);
}
const elements=new Map();let renders=0,refresh;
function element(id){
  if(!elements.has(id)){
    let html='';
    const item={value:'',hidden:false,scrollTop:0,style:{},classList:{add(){},remove(){},contains(){return false;}},
      get innerHTML(){return html;},set innerHTML(value){html=value;if(id==='checkout-screen')renders++;}};
    elements.set(id,item);
  }
  return elements.get(id);
}
const catalog={payment_mode:'MIDTRANS',settings:{},holidays:[],products:[],pickupLocations:[],deliverySlots:[]};
const context={Date,Number,String,Array,Promise,setTimeout,document:{getElementById:element,querySelector:()=>null,body:{style:{}}},
  session:{member:{member_id:'TEST',nama:'Test',no_hp:''}},catalog,cart:[{nama:'Kopi',harga:10000,qty:1}],
  checkoutState:{},promoState:{input_code:'',status:'idle'},_checkoutRendered:false,_checkoutMemberId:'',
  _checkoutCatalogReady:false,_checkoutCatalogRequest:0,_checkoutTriedSubmit:false,_pendingPromoConsumed:false,_pendingPromoFromUrl:'',
  _submitting:false,setPageTitle(){},resetPromoState(){},updatePromoUI(){},updateCheckoutSummary(){},
  getCartTotal:()=>10000,getCartCount:()=>1,formatRupiah:n=>'Rp'+n,escHtml:s=>String(s),
  requestCatalogRefresh:()=>new Promise(resolve=>{refresh=()=>resolve({ok:true});})};
vm.createContext(context);
for(const name of ['resetCheckoutState','isDateHoliday','suggestedCheckoutDate','refreshCheckoutDateChoice',
  'checkoutItemsHtml','updateCheckoutItems','renderCheckoutScreen','setCheckoutCatalogStatus',
  'updateCheckoutValidation','refreshCheckoutCatalog','openCheckoutScreen'])vm.runInContext(extract(name),context);
(async()=>{
  await context.openCheckoutScreen();
  assert.equal(renders,1,'checkout should render before catalog refresh resolves');
  assert.match(element('checkout-screen').innerHTML,/co-method-card/);
  assert.match(element('checkout-screen').innerHTML,/Promo, poin, atau catatan/);
  assert.ok(context.checkoutState.tgl_antar,'suggested date should be filled');
  assert.equal(context._checkoutCatalogReady,false);
  refresh();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(context._checkoutCatalogReady,true);
  context.checkoutState.metode_kirim='AMBIL';
  element('co-catatan').value='Tanpa sedotan';
  await context.openCheckoutScreen();
  assert.equal(renders,1,'returning from cart should preserve the form');
  assert.equal(context.checkoutState.metode_kirim,'AMBIL');
  assert.equal(element('co-catatan').value,'Tanpa sedotan');
  context.requestCatalogRefresh=async()=>{throw new Error('offline');};
  await context.refreshCheckoutCatalog();
  assert.equal(context._checkoutCatalogReady,false,'checkout must block payment when catalog check fails');
  assert.equal(element('btn-create-order').disabled,true);
  assert.match(element('co-catalog-status').innerHTML,/Coba lagi/);
  console.log('checkout-direct-harness: all assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { context, query } = require('./compat');
const admin = require('./admin');
const midtrans = require('./midtrans');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 3100);
const DOCS = path.resolve(__dirname,'..','docs');
const MUTATIONS = new Set(['requestOtp','verifyOtp','updateProfile','createOrder','orderMarkSeen',
  'addAddress','updateAddress','deleteAddress','addressSetDefault','submitReview','deleteMyReview']);
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.png':'image/png','.ico':'image/x-icon',
  '.webmanifest':'application/manifest+json'};

function send(res,status,body,type='application/json; charset=utf-8') {
  res.writeHead(status,{'Content-Type':type,'Content-Length':Buffer.byteLength(body),
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
    'X-Frame-Options':'DENY','Cache-Control':'no-store'});
  res.end(body);
}
function json(res,status,value) { send(res,status,JSON.stringify(value)); }
async function readBody(req, max=65536) {
  const chunks=[]; let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if(size>max) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function transaction(fn, lock=false) {
  query('BEGIN');
  try {
    if(lock) query('SELECT pg_advisory_xact_lock($1)',[310021]);
    const result=fn();
    if (result && result.parsed && result.parsed.ok === false) query('ROLLBACK');
    else query('COMMIT');
    return result;
  } catch (error) {
    try { query('ROLLBACK'); } catch (_) {}
    throw error;
  }
}
function compareSecret(a,b) {
  const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));
  return left.length===right.length && crypto.timingSafeEqual(left,right);
}
function runGAS(body, parameters={}) {
  const ctx=context();
  const result=ctx.doPost({postData:{contents:body},parameter:parameters});
  let parsed;
  try { parsed=JSON.parse(String(result.body)); } catch (_) {parsed=null;}
  return {body:String(result.body),type:result.type||'application/json',parsed};
}
async function handleApi(req,res,params,telegram=false) {
  let body;
  try { body=await readBody(req,telegram?262144:65536); }
  catch (_) { return json(res,413,{ok:false,error:'Request terlalu besar',code:'BAD_REQUEST'}); }
  let parsed;
  try {parsed=JSON.parse(body);} catch (_) {return json(res,400,{ok:false,error:'Invalid JSON',code:'BAD_REQUEST'});}
  if (telegram) {
    const secret=process.env.TELEGRAM_SECRET;
    if (secret && !compareSecret(req.headers['x-telegram-bot-api-secret-token'],secret)) return send(res,403,'Forbidden','text/plain');
    if (!parsed || parsed.update_id===undefined) return send(res,400,'Bad Request','text/plain');
  } else if (!parsed || typeof parsed.action!=='string') {
    return json(res,400,{ok:false,error:'Action required',code:'BAD_REQUEST'});
  }
  const action=telegram?'telegram':parsed.action;
  if (!telegram && action==='getPayment') {
    try { return json(res,200,await midtrans.customerPayment(parsed.payload && parsed.payload.order_id,parsed.token)); }
    catch (_) { return json(res,503,{ok:false,code:'PAYMENT_UNAVAILABLE',error:'Pembayaran belum tersedia. Coba lagi sebentar.'}); }
  }
  if (!telegram && action==='createOrder' && process.env.MIDTRANS_MODE) {
    if (!midtrans.available()) return json(res,503,{ok:false,code:'PAYMENT_UNAVAILABLE',error:'Pembayaran belum siap.'});
    parsed.payload=parsed.payload && typeof parsed.payload==='object' && !Array.isArray(parsed.payload) ? parsed.payload : {};
    parsed.payload.metode_bayar='MIDTRANS';
    body=JSON.stringify(parsed);
  }
  if (!telegram && action==='createOrder' && !midtrans.available() && parsed.payload && parsed.payload.metode_bayar==='MIDTRANS') {
    return json(res,503,{ok:false,code:'PAYMENT_UNAVAILABLE',error:'Pembayaran belum tersedia.'});
  }
  if (!telegram && ['requestOtp','verifyOtp','getMe','updateProfile','getMyOrders','createOrder','getOrderByRequestId','getMyPoints','addAddress','updateAddress','deleteAddress','addressSetDefault','submitReview','getMyReviewable','deleteMyReview','orderMarkSeen'].includes(action) && !process.env.AUTH_HASH_PEPPER) {
    return json(res,503,{ok:false,error:'Konfigurasi autentikasi belum siap',code:'CONFIG_MISSING'});
  }
  try {
    const result=transaction(()=>runGAS(body,telegram?{tg_key:params.get('tg_key')||''}:{}),telegram||MUTATIONS.has(action));
    if (!telegram && result.parsed && result.parsed.ok && action==='getCatalog') {
      result.parsed.data.payment_mode=midtrans.available()?'MIDTRANS':'LEGACY';
      result.body=JSON.stringify(result.parsed);
    }
    if (!telegram && result.parsed && result.parsed.ok && (action==='createOrder'||action==='getOrderByRequestId') && midtrans.available() && result.parsed.data.metode_bayar==='MIDTRANS') {
      result.parsed.data.payment=await midtrans.ensurePayment(result.parsed.data.order_id);
      result.body=JSON.stringify(result.parsed);
    }
    if (!telegram && result.parsed && result.parsed.ok && action==='getMyOrders' && midtrans.available()) {
      const orders=result.parsed.data && result.parsed.data.orders;
      if (Array.isArray(orders)) {
        const ids=orders.filter(o=>o.metode_bayar==='MIDTRANS').map(o=>o.order_id);
        if (ids.length) {
          const states=query('SELECT order_id,state FROM samijaya.midtrans_payments WHERE order_id=ANY($1::text[])',[ids]).rows;
          const byId=new Map(states.map(row=>[row.order_id,row.state]));
          orders.forEach(order=>{if(order.metode_bayar==='MIDTRANS') order.payment_status=byId.get(order.order_id)||'BELUM_DIMULAI';});
          result.body=JSON.stringify(result.parsed);
        }
      }
    }
    send(res,200,result.body,result.type);
  } catch (_) {
    json(res,503,{ok:false,error:'Layanan sementara tidak tersedia',code:'INTERNAL'});
  }
}
function serveStatic(req,res,pathname) {
  let relative;
  try { relative=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1)); }
  catch (_) { return send(res,400,'Bad Request','text/plain'); }
  const target=path.resolve(DOCS,relative);
  if (!target.startsWith(DOCS+path.sep)) return send(res,404,'Not Found','text/plain');
  let stat;
  try {stat=fs.statSync(target);} catch (_) {return send(res,404,'Not Found','text/plain');}
  if(!stat.isFile()) return send(res,404,'Not Found','text/plain');
  const content=fs.readFileSync(target);
  res.writeHead(200,{'Content-Type':MIME[path.extname(target)]||'application/octet-stream',
    'Content-Length':content.length,'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY',
    ...(path.extname(target)==='.html'?{'Cache-Control':'no-store'}:{})});
  if(req.method==='HEAD') res.end(); else res.end(content);
}
const server=http.createServer(async (req,res)=>{
  let url;
  try {url=new URL(req.url,'http://localhost');} catch (_) {return send(res,400,'Bad Request','text/plain');}
  const pathname=url.pathname;
  if (String(req.headers.host||'').toLowerCase()==='www.samijaya.online') {
    res.writeHead(301,{'Location':'https://samijaya.online'+pathname+url.search,
      'Cache-Control':'public, max-age=3600','Content-Length':'0'});
    return res.end();
  }
  if(pathname==='/_health') return json(res,200,{ok:true,service:'samijaya'});
  if(pathname==='/_ready') {
    try {
      const n=query('SELECT count(*)::int AS n FROM samijaya.import_manifest').rows[0].n;
      return json(res,n===21?200:503,{ok:n===21,database:true,business_sheets:n});
    } catch (_) {return json(res,503,{ok:false,database:false});}
  }
  if(req.method==='POST' && pathname==='/api') return handleApi(req,res,url.searchParams,false);
  if(req.method==='POST' && pathname==='/midtrans/notification') {
    let body;
    try { body=JSON.parse(await readBody(req,32768)); }
    catch (_) { return json(res,400,{ok:false}); }
    const result=midtrans.webhook(body);
    return json(res,result.status,result.body);
  }
  if(req.method==='POST' && pathname==='/telegram/webhook') return handleApi(req,res,url.searchParams,true);
  if(pathname==='/admin'||pathname.startsWith('/admin/')) return admin.handle(req,res,url);
  if(req.method==='GET'||req.method==='HEAD') return serveStatic(req,res,pathname);
  return send(res,405,'Method Not Allowed','text/plain');
});
server.listen(PORT,HOST,()=>console.log(`Samijaya listening on ${HOST}:${PORT}`));
if (midtrans.available()) setInterval(()=>midtrans.reconcile().catch(()=>{}),300000).unref();

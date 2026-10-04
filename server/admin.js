'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { context, query, columns, tableName, qi, invalidateForAdmin } = require('./compat');
const media = require('./media');

const loginAttempts = new Map();
const TABLES = {
  Orders: null, OrderItems: null, OrderItemAddons: null,
  Products: ['nama','harga','foto_file_id','kategori_id','deskripsi','badge_promo','tersedia','urutan','status'],
  Categories: ['nama','urutan','status'],
  ProductVariants: ['product_id','nama_axis','nama_varian','harga','urutan','aktif'],
  ProductAddons: ['product_id','nama_addon','harga','urutan','aktif'],
  PickupLocations: ['nama','alamat','latitude','longitude','jam_buka','jam_tutup','status'],
  DeliverySlots: ['jam_mulai','jam_selesai','kuota','status'],
  Holidays: ['tanggal','keterangan'],
  PromoCodes: '*', Campaigns: '*', MessageTemplates: ['isi','keterangan'],
  Members: ['nama','email','tgl_lahir','jenis_kelamin','status'],
  MemberAddresses: ['label','detail','alamat_snapshot','latitude','longitude','status'], Reviews: ['status'],
  Settings: ['value','keterangan'], Logs: null, PointHistory: null, PromoUsage: null
};
const ID_FIELDS = {Products:'product_id',Categories:'kategori_id',ProductVariants:'variant_id',
  ProductAddons:'addon_id',PickupLocations:'lokasi_id',DeliverySlots:'slot_id',
  Holidays:'tanggal',PromoCodes:'promo_id',Campaigns:'campaign_id',MessageTemplates:'kode'};
const ID_PREFIX = {Products:'prd',Categories:'cat',ProductVariants:'var',ProductAddons:'addon',
  PickupLocations:'loc',DeliverySlots:'slot',PromoCodes:'promo',Campaigns:'camp'};
const SETTINGS_SECRET = /TOKEN|SECRET|PASSWORD|KEY|CHAT_IDS|PEPPER|DEVICE|SPREADSHEET|^DEMO_OTP$/i;
const html=fs.readFileSync(path.join(__dirname,'admin.html'));
const clientScript=fs.readFileSync(path.join(__dirname,'admin-client.js'));
const stylesheet=fs.readFileSync(path.join(__dirname,'admin.css'));

function reply(res,status,value,headers={}) {
  const body=JSON.stringify(value);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',...headers});
  res.end(body);
}
function error(res,status,code) {return reply(res,status,{ok:false,code});}
function constantEqual(a,b) {
  const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
  return x.length===y.length && crypto.timingSafeEqual(x,y);
}
function cookie(req) {
  const pair=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('samijaya_admin='));
  return pair?pair.slice('samijaya_admin='.length):'';
}
function signedSession() {
  const payload=Buffer.from(JSON.stringify({exp:Date.now()+8*3600000,nonce:crypto.randomBytes(12).toString('hex'),
    hash:crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD_HASH||'').digest('hex').slice(0,16)})).toString('base64url');
  const sig=crypto.createHmac('sha256',process.env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
  return payload+'.'+sig;
}
function authenticated(req) {
  if(!process.env.ADMIN_SESSION_SECRET || !process.env.ADMIN_PASSWORD_HASH) return false;
  const [payload,sig]=cookie(req).split('.');
  if(!payload||!sig) return false;
  const expected=crypto.createHmac('sha256',process.env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
  if(!constantEqual(sig,expected)) return false;
  try {
    const value=JSON.parse(Buffer.from(payload,'base64url'));
    const hash=crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD_HASH).digest('hex').slice(0,16);
    return value.exp>Date.now() && value.hash===hash;
  } catch (_) {return false;}
}
function sameOrigin(req) {
  const origin=req.headers.origin;
  const host=String(req.headers.host||'').toLowerCase();
  const local='http://127.0.0.1:'+String(process.env.PORT||3100);
  return origin==='https://samijaya.online' && host==='samijaya.online' ||
    origin===local && host==='127.0.0.1:'+String(process.env.PORT||3100);
}
function nowJkt() {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
function audit(event,table,reference) {
  const n=Number(query('SELECT COALESCE(max(source_row),1)+1 AS n FROM samijaya."Logs"').rows[0].n);
  query('INSERT INTO samijaya."Logs" (source_row,"timestamp","tipe","ref_id","pesan","detail_json") VALUES ($1,$2,$3,$4,$5,$6)',
    [n,nowJkt(),'ACTIVITY',String(reference||'').slice(0,60),event,JSON.stringify({operation:'admin',table:String(table||'').slice(0,40)})]);
}
function withTransaction(fn) {
  query('BEGIN');
  try {
    query('SELECT pg_advisory_xact_lock($1)',[310021]);
    const result=fn();
    if(result && result.ok===false) query('ROLLBACK'); else query('COMMIT');
    return result;
  } catch(e) {try{query('ROLLBACK');}catch(_){} throw e;}
}
function tableList(table, search, statusFilter) {
  if(!Object.hasOwn(TABLES,table)) throw new Error('TABLE_NOT_ALLOWED');
  const rows=query(`SELECT * FROM ${tableName(table)} ORDER BY source_row DESC LIMIT 1000`).rows;
  if(table==='Orders' && process.env.MIDTRANS_MODE) attachPaymentStates(rows);
  let filtered=table==='Settings'?rows.filter(r=>!SETTINGS_SECRET.test(r.key)):rows;
  if(table==='Orders' && statusFilter) filtered=filtered.filter(r=>r.status===statusFilter);
  if(table==='Logs') filtered=filtered.map(({source_row,timestamp,tipe,ref_id,pesan})=>({source_row,timestamp,tipe,ref_id,pesan}));
  const term=String(search||'').toLowerCase().slice(0,80);
  if(term) filtered=filtered.filter(r=>Object.values(r).some(v=>String(v||'').toLowerCase().includes(term)));
  return {ok:true,data:{table,rows:filtered.slice(0,200),editable:TABLES[table]!==null,
    insertable:!!ID_FIELDS[table],write_fields:permittedFields(table),columns:columns(table)}};
}
function attachPaymentStates(rows) {
  const ids=rows.filter(r=>r.metode_bayar==='MIDTRANS').map(r=>r.order_id);
  if (!ids.length) return;
  const states=query('SELECT order_id,state FROM samijaya.midtrans_payments WHERE order_id=ANY($1::text[])',[ids]).rows;
  const byId=new Map(states.map(r=>[r.order_id,r.state]));
  rows.forEach(r=>{if(r.metode_bayar==='MIDTRANS')r.payment_status=byId.get(r.order_id)||'BELUM_DIMULAI';});
}
function dashboard() {
  const today=nowJkt().slice(0,10);
  const rows=query('SELECT "order_id","nama","total","status","created_at","metode_kirim","metode_bayar" FROM samijaya."Orders" ORDER BY source_row DESC').rows;
  if(process.env.MIDTRANS_MODE) attachPaymentStates(rows);
  const valid=rows.filter(r=>['MENUNGGU','DIPROSES','SIAP','DIANTAR','SELESAI','BATAL'].includes(r.status));
  const todays=valid.filter(r=>String(r.created_at).startsWith(today));
  const revenue=todays.filter(r=>r.status==='SELESAI').reduce((sum,r)=>sum+(Number(r.total)||0),0);
  const active=valid.filter(r=>['MENUNGGU','DIPROSES','SIAP','DIANTAR'].includes(r.status) && (r.metode_bayar!=='MIDTRANS'||['PAID','PARTIAL_REFUND'].includes(r.payment_status))).length;
  const awaitingPayment=valid.filter(r=>r.metode_bayar==='MIDTRANS'&&r.status==='MENUNGGU'&&!['PAID','PARTIAL_REFUND','REFUNDED','EXPIRED'].includes(r.payment_status)).length;
  const members=Number(query('SELECT count(*)::int AS n FROM samijaya."Members"').rows[0].n);
  const products=Number(query(`SELECT count(*)::int AS n FROM samijaya."Products" WHERE lower("status")='aktif'`).rows[0].n);
  return {ok:true,data:{today_orders:todays.length,today_revenue:revenue,active_orders:active,awaiting_payment:awaitingPayment,
    members,active_products:products,recent_orders:rows.slice(0,20)}};
}
function orderDetails(orderId) {
  const order=query('SELECT * FROM samijaya."Orders" WHERE "order_id"=$1',[orderId]).rows[0];
  if(!order) return {ok:false,code:'ORDER_NOT_FOUND'};
  const items=query('SELECT * FROM samijaya."OrderItems" WHERE "order_id"=$1 ORDER BY source_row',[orderId]).rows;
  const addons=query('SELECT * FROM samijaya."OrderItemAddons" WHERE "order_id"=$1 ORDER BY source_row',[orderId]).rows;
  const payment=order.metode_bayar==='MIDTRANS'
    ? query('SELECT state,amount,paid_at,expires_at,refund_reference,refund_note,refund_recorded_at,last_error FROM samijaya.midtrans_payments WHERE order_id=$1',[orderId]).rows[0]||{state:'BELUM_DIMULAI'}
    : null;
  return {ok:true,data:{order,items,addons,payment}};
}
function permittedFields(table) {
  const allowed=TABLES[table];
  if(allowed==='*') {
    const id=ID_FIELDS[table];
    return columns(table).filter(k=>k!==id && !['source_row','created_at','updated_at'].includes(k) &&
      !(table==='Campaigns'&&k==='gambar_url'));
  }
  return (allowed||[]).filter(k=>k!==ID_FIELDS[table]);
}
function save(table, sourceRow, input) {
  if(!Object.hasOwn(TABLES,table)||TABLES[table]===null||!input||typeof input!=='object'||Array.isArray(input)) return {ok:false,code:'BAD_REQUEST'};
  if(table==='Products' && Object.hasOwn(input,'foto_file_id') && input.foto_file_id &&
    !/^[0-9a-f-]{36}\.(?:png|jpg|webp)$/.test(String(input.foto_file_id))) return {ok:false,code:'PHOTO_INVALID'};
  if(table==='Campaigns' && Object.hasOwn(input,'gambar_file_id') && input.gambar_file_id &&
    !/^[0-9a-f-]{36}\.(?:png|jpg|webp)$/.test(String(input.gambar_file_id))) return {ok:false,code:'PHOTO_INVALID'};
  if(table==='Reviews' && !['aktif','hidden','dihapus'].includes(String(input.status||''))) return {ok:false,code:'STATUS_INVALID'};
  let settingKey='';
  const result=withTransaction(()=>{
    const headers=columns(table), editable=permittedFields(table);
    const allowed=Object.fromEntries(Object.entries(input).filter(([k])=>editable.includes(k) && headers.includes(k)));
    if(!Object.keys(allowed).length) return {ok:false,code:'NO_FIELDS'};
    if(table==='Settings') {
      const row=query('SELECT * FROM samijaya."Settings" WHERE source_row=$1',[sourceRow]).rows[0];
      if(!row||SETTINGS_SECRET.test(row.key)) return {ok:false,code:'SETTING_PROTECTED'};
      settingKey=row.key;
    }
    let rowNumber=Number(sourceRow);
    if(rowNumber) {
      if(!Number.isSafeInteger(rowNumber)||rowNumber<2) return {ok:false,code:'BAD_REQUEST'};
      const old=query(`SELECT * FROM ${tableName(table)} WHERE source_row=$1`,[rowNumber]).rows[0];
      if(!old) return {ok:false,code:'ROW_NOT_FOUND'};
      const keys=Object.keys(allowed);
      query(`UPDATE ${tableName(table)} SET ${keys.map((k,i)=>`${qi(k)}=$${i+2}`).join(',')} WHERE source_row=$1`,
        [rowNumber,...keys.map(k=>String(allowed[k]??''))]);
    } else {
      if(!ID_FIELDS[table]||['Reviews','Settings'].includes(table)) return {ok:false,code:'INSERT_NOT_ALLOWED'};
      rowNumber=Number(query(`SELECT COALESCE(max(source_row),1)+1 AS n FROM ${tableName(table)}`).rows[0].n);
      const idField=ID_FIELDS[table];
      let id=String(input[idField]||'').trim();
      if(!id && ID_PREFIX[table]) id=ID_PREFIX[table]+'-'+Date.now().toString(36)+'-'+crypto.randomBytes(3).toString('hex');
      if(!id) return {ok:false,code:'ID_REQUIRED'};
      if(id.length>100||!/^[A-Za-z0-9_-]+$/.test(id)) return {ok:false,code:'ID_INVALID'};
      const keys=[idField,...Object.keys(allowed)];
      query(`INSERT INTO ${tableName(table)} (source_row,${keys.map(qi).join(',')}) VALUES ($1,${keys.map((_,i)=>'$'+(i+2)).join(',')})`,
        [rowNumber,id,...Object.keys(allowed).map(k=>String(allowed[k]??''))]);
    }
    audit('ADMIN_SAVE',table,rowNumber);
    return {ok:true,data:{source_row:rowNumber}};
  });
  if(result.ok) invalidateForAdmin(table,settingKey);
  return result;
}
function status(orderId,newStatus,reason) {
  return withTransaction(()=>{
    const ctx=context();
    const prior=ctx.isAdmin;
    ctx.isAdmin=id=>id==='web-admin'||prior(id);
    const result=ctx.orderUpdateStatus(orderId,newStatus,'web-admin',reason);
    if(result.ok) audit('ADMIN_ORDER_STATUS','Orders',orderId);
    return result;
  });
}
function refundCancel(orderId,reference,reason) {
  orderId=String(orderId||'').trim();
  reference=String(reference||'').trim();
  reason=String(reason||'').trim();
  if(!/^[A-Za-z0-9_.~-]{1,45}$/.test(orderId)||reference.length<5||reference.length>120||reason.length<5||reason.length>300) return {ok:false,code:'REFUND_DETAILS_REQUIRED'};
  return withTransaction(()=>{
    const payment=query('SELECT state FROM samijaya.midtrans_payments WHERE order_id=$1 FOR UPDATE',[orderId]).rows[0];
    const order=query('SELECT "metode_bayar","status" FROM samijaya."Orders" WHERE "order_id"=$1',[orderId]).rows[0];
    if(!payment||!order||order.metode_bayar!=='MIDTRANS'||order.status==='SELESAI'||order.status==='BATAL'||!['PAID','PARTIAL_REFUND'].includes(payment.state)) return {ok:false,code:'REFUND_NOT_ALLOWED'};
    query(`UPDATE samijaya.midtrans_payments SET state='REFUNDED',refund_reference=$2,refund_note=$3,
      refund_recorded_at=now(),refund_recorded_by='web-admin',updated_at=now() WHERE order_id=$1`,[orderId,reference,reason]);
    const ctx=context(),prior=ctx.isAdmin;
    ctx.isAdmin=id=>id==='web-admin'||prior(id);
    const result=ctx.orderUpdateStatus(orderId,'BATAL','web-admin',reason);
    if(result.ok) audit('ADMIN_MANUAL_REFUND_AND_CANCEL','Orders',orderId);
    return result;
  });
}
async function readJson(req) {
  let total=0; const chunks=[];
  for await (const c of req) {total+=c.length;if(total>131072) throw new Error('BODY_TOO_LARGE');chunks.push(c);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function readImage(req) {
  let total=0;const chunks=[];
  for await(const chunk of req) {
    total+=chunk.length;
    if(total>media.MAX_BYTES) throw new Error('IMAGE_SIZE_INVALID');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function handle(req,res,url) {
  if(req.method==='GET' && url.pathname==='/admin') {
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':html.length,
      'Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; img-src 'self' blob: data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; base-uri 'none'; frame-ancestors 'none'"});
    return res.end(html);
  }
  if(req.method==='GET' && url.pathname==='/admin/app.js') {
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Content-Length':clientScript.length,'Cache-Control':'no-store'});
    return res.end(clientScript);
  }
  if(req.method==='GET' && url.pathname==='/admin/style.css') {
    res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Content-Length':stylesheet.length,'Cache-Control':'no-store'});
    return res.end(stylesheet);
  }
  if(req.method==='POST' && url.pathname==='/admin/media') {
    if(!sameOrigin(req)) return error(res,403,'ORIGIN_REJECTED');
    if(!authenticated(req)) return error(res,401,'UNAUTHORIZED');
    try {return reply(res,200,{ok:true,data:{filename:media.saveImage(await readImage(req),req.headers['content-type'])}});}
    catch(e) {
      if(e.message==='IMAGE_SIZE_INVALID') return error(res,413,'IMAGE_SIZE_INVALID');
      if(e.message==='IMAGE_TYPE_INVALID') return error(res,400,'IMAGE_TYPE_INVALID');
      return error(res,503,'MEDIA_UNAVAILABLE');
    }
  }
  if(req.method!=='POST'||url.pathname!=='/admin/api') return error(res,404,'NOT_FOUND');
  if(!sameOrigin(req)) return error(res,403,'ORIGIN_REJECTED');
  let request;
  try {request=await readJson(req);} catch (_) {return error(res,400,'BAD_REQUEST');}
  const op=String(request.op||'');
  if(op==='login') {
    const key=String(req.headers['cf-connecting-ip']||req.socket.remoteAddress||'unknown').slice(0,80);
    const now=Date.now(),record=loginAttempts.get(key)||{count:0,until:now+900000};
    if(record.until<now) {record.count=0;record.until=now+900000;}
    if(record.count>=5) return error(res,429,'RATE_LIMITED');
    const hash=crypto.createHash('sha256').update(String(request.password||'')).digest('hex');
    if(!process.env.ADMIN_PASSWORD_HASH||!process.env.ADMIN_SESSION_SECRET||!constantEqual(hash,process.env.ADMIN_PASSWORD_HASH)) {
      record.count++;loginAttempts.set(key,record);return error(res,401,'LOGIN_FAILED');
    }
    loginAttempts.delete(key);
    try {withTransaction(()=>{audit('ADMIN_LOGIN','Admin','login');return {ok:true};});} catch (_) {}
    return reply(res,200,{ok:true},{'Set-Cookie':`samijaya_admin=${signedSession()}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=28800`});
  }
  if(!authenticated(req)) return error(res,401,'UNAUTHORIZED');
  if(op==='logout') return reply(res,200,{ok:true},{'Set-Cookie':'samijaya_admin=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0'});
  if(op==='session') return reply(res,200,{ok:true});
  try {
    if(op==='dashboard') return reply(res,200,dashboard());
    if(op==='table') return reply(res,200,tableList(String(request.table||''),request.search,
      String(request.status||'').slice(0,20)));
    if(op==='order') return reply(res,200,orderDetails(String(request.order_id||'')));
    if(op==='save') return reply(res,200,save(String(request.table||''),request.source_row,request.values));
    if(op==='status') return reply(res,200,status(String(request.order_id||''),String(request.status||''),String(request.reason||'')));
    if(op==='refundCancel') return reply(res,200,refundCancel(request.order_id,request.reference,request.reason));
    return error(res,400,'UNKNOWN_OPERATION');
  } catch (_) {return error(res,503,'ADMIN_OPERATION_FAILED');}
}
module.exports={handle};

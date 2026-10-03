'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { context, query, columns, tableName, qi, invalidateForAdmin } = require('./compat');

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
  Members: null, MemberAddresses: null, Reviews: ['status'],
  Settings: ['value','keterangan'], Logs: null, PointHistory: null, PromoUsage: null
};
const ID_FIELDS = {Products:'product_id',Categories:'kategori_id',ProductVariants:'variant_id',
  ProductAddons:'addon_id',PickupLocations:'lokasi_id',DeliverySlots:'slot_id',
  Holidays:'tanggal',PromoCodes:'promo_id',Campaigns:'campaign_id',MessageTemplates:'kode'};
const ID_PREFIX = {Products:'prd',Categories:'cat',ProductVariants:'var',ProductAddons:'addon',
  PickupLocations:'loc',DeliverySlots:'slot',PromoCodes:'promo',Campaigns:'camp'};
const SETTINGS_SECRET = /TOKEN|SECRET|PASSWORD|KEY|CHAT_IDS|PEPPER|DEVICE|SPREADSHEET/i;
const html=fs.readFileSync(path.join(__dirname,'admin.html'));
const clientScript=fs.readFileSync(path.join(__dirname,'admin-client.js'));

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
function tableList(table, search) {
  if(!Object.hasOwn(TABLES,table)) throw new Error('TABLE_NOT_ALLOWED');
  const rows=query(`SELECT * FROM ${tableName(table)} ORDER BY source_row DESC LIMIT 1000`).rows;
  let filtered=table==='Settings'?rows.filter(r=>!SETTINGS_SECRET.test(r.key)):rows;
  if(table==='Logs') filtered=filtered.map(({source_row,timestamp,tipe,ref_id,pesan})=>({source_row,timestamp,tipe,ref_id,pesan}));
  const term=String(search||'').toLowerCase().slice(0,80);
  if(term) filtered=filtered.filter(r=>Object.values(r).some(v=>String(v||'').toLowerCase().includes(term)));
  return {ok:true,data:{table,rows:filtered.slice(0,200),editable:TABLES[table]!==null,
    insertable:!!ID_FIELDS[table],write_fields:permittedFields(table),columns:columns(table)}};
}
function dashboard() {
  const today=nowJkt().slice(0,10);
  const rows=query('SELECT "order_id","nama","total","status","created_at","metode_kirim" FROM samijaya."Orders" ORDER BY source_row DESC').rows;
  const valid=rows.filter(r=>['MENUNGGU','DIPROSES','SIAP','DIANTAR','SELESAI','BATAL'].includes(r.status));
  const todays=valid.filter(r=>String(r.created_at).startsWith(today));
  const revenue=todays.filter(r=>r.status==='SELESAI').reduce((sum,r)=>sum+(Number(r.total)||0),0);
  const active=valid.filter(r=>['MENUNGGU','DIPROSES','SIAP','DIANTAR'].includes(r.status)).length;
  const members=Number(query('SELECT count(*)::int AS n FROM samijaya."Members"').rows[0].n);
  const products=Number(query(`SELECT count(*)::int AS n FROM samijaya."Products" WHERE lower("status")='aktif'`).rows[0].n);
  return {ok:true,data:{today_orders:todays.length,today_revenue:revenue,active_orders:active,
    members,active_products:products,recent_orders:rows.slice(0,20)}};
}
function orderDetails(orderId) {
  const order=query('SELECT * FROM samijaya."Orders" WHERE "order_id"=$1',[orderId]).rows[0];
  if(!order) return {ok:false,code:'ORDER_NOT_FOUND'};
  const items=query('SELECT * FROM samijaya."OrderItems" WHERE "order_id"=$1 ORDER BY source_row',[orderId]).rows;
  const addons=query('SELECT * FROM samijaya."OrderItemAddons" WHERE "order_id"=$1 ORDER BY source_row',[orderId]).rows;
  return {ok:true,data:{order,items,addons}};
}
function permittedFields(table) {
  const allowed=TABLES[table];
  if(allowed==='*') {
    const id=ID_FIELDS[table];
    return columns(table).filter(k=>k!==id && !['created_at','updated_at'].includes(k));
  }
  return allowed||[];
}
function save(table, sourceRow, input) {
  if(!Object.hasOwn(TABLES,table)||TABLES[table]===null||!input||typeof input!=='object'||Array.isArray(input)) return {ok:false,code:'BAD_REQUEST'};
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
async function readJson(req) {
  let total=0; const chunks=[];
  for await (const c of req) {total+=c.length;if(total>131072) throw new Error('BODY_TOO_LARGE');chunks.push(c);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function handle(req,res,url) {
  if(req.method==='GET' && url.pathname==='/admin') {
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':html.length,
      'Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'"});
    return res.end(html);
  }
  if(req.method==='GET' && url.pathname==='/admin/app.js') {
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Content-Length':clientScript.length,'Cache-Control':'no-store'});
    return res.end(clientScript);
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
    if(op==='table') return reply(res,200,tableList(String(request.table||''),request.search));
    if(op==='order') return reply(res,200,orderDetails(String(request.order_id||'')));
    if(op==='save') return reply(res,200,save(String(request.table||''),request.source_row,request.values));
    if(op==='status') return reply(res,200,status(String(request.order_id||''),String(request.status||''),String(request.reason||'')));
    return error(res,400,'UNKNOWN_OPERATION');
  } catch (_) {return error(res,503,'ADMIN_OPERATION_FAILED');}
}
module.exports={handle};

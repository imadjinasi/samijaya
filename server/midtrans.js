'use strict';
const crypto = require('node:crypto');
const { context, query } = require('./compat');

const MODE = String(process.env.MIDTRANS_MODE || '').toLowerCase();
const ENABLED = MODE === 'sandbox' || MODE === 'production';
const SERVER_KEY = MODE === 'production' ? process.env.MIDTRANS_PRODUCTION_SERVER_KEY : process.env.MIDTRANS_SANDBOX_SERVER_KEY;
const SNAP_URL = MODE === 'production' ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
const API_URL = MODE === 'production' ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
const PAYMENT_MINUTES = 30;

function available() { return ENABLED && !!SERVER_KEY; }
function assertAvailable() { if (!available()) throw new Error('MIDTRANS_NOT_CONFIGURED'); }
function safeOrderId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9_.~-]{1,45}$/.test(id)) throw new Error('ORDER_ID_INVALID');
  return id;
}
function gatewayId(orderId) { return 'SJ-' + safeOrderId(orderId); }
function basicAuth() { return 'Basic ' + Buffer.from(SERVER_KEY + ':').toString('base64'); }
async function midtransRequest(url, options = {}) {
  assertAvailable();
  const response = await fetch(url, { ...options, headers: {
    Accept: 'application/json', Authorization: basicAuth(),
    ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers||{})
  }, signal: AbortSignal.timeout(12000) });
  let body;
  try { body = await response.json(); } catch (_) { body = {}; }
  if (!response.ok) { const error = new Error('MIDTRANS_HTTP_' + response.status); error.httpStatus = response.status; throw error; }
  return body;
}
function orderRow(orderId) {
  return query('SELECT "order_id","member_id","nama","no_hp","total","metode_bayar","status","commit_status","commit_snapshot_json" FROM samijaya."Orders" WHERE "order_id"=$1', [safeOrderId(orderId)]).rows[0];
}
function paymentRow(orderId) {
  return query('SELECT * FROM samijaya.midtrans_payments WHERE order_id=$1', [safeOrderId(orderId)]).rows[0];
}
function publicPayment(row) {
  if (!row) return {status:'BELUM_DIMULAI'};
  return {status:row.state, redirect_url:row.state==='PENDING' ? row.redirect_url : null,
    expires_at:row.expires_at, paid_at:row.paid_at};
}
function jakartaStart(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} +0700`;
}
async function ensurePayment(orderId) {
  assertAvailable();
  const order=orderRow(orderId);
  if (!order || order.metode_bayar!=='MIDTRANS' || String(order.commit_status).toUpperCase()!=='COMMITTED') throw new Error('ORDER_NOT_PAYABLE');
  const amount=Number(order.total);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('PAYMENT_AMOUNT_INVALID');
  if (order.status==='BATAL') return {status:'BATAL'};
  let row=paymentRow(orderId);
  if (row && (row.state==='PAID' || row.state==='PARTIAL_REFUND' || row.state==='PENDING' || row.state==='EXPIRED' || row.state==='REFUNDED')) return publicPayment(row);
  if (row && row.state==='INITIATING' && Date.now()-new Date(row.updated_at).getTime()<30000) return {status:'MENYIAPKAN'};
  const started=new Date(), expires=new Date(started.getTime()+PAYMENT_MINUTES*60000);
  if (!row) {
    query(`INSERT INTO samijaya.midtrans_payments (order_id,gateway_order_id,amount,state,expires_at)
      VALUES ($1,$2,$3,'INITIATING',$4) ON CONFLICT (order_id) DO NOTHING`,[orderId,gatewayId(orderId),amount,expires]);
  } else {
    query(`UPDATE samijaya.midtrans_payments SET state='INITIATING',updated_at=now(),expires_at=$2,last_error=NULL
      WHERE order_id=$1 AND state IN ('INIT_FAILED','INITIATING')`,[orderId,expires]);
  }
  row=paymentRow(orderId);
  if (row.state==='PAID' || row.state==='PENDING') return publicPayment(row);
  try {
    const body={transaction_details:{order_id:gatewayId(orderId),gross_amount:amount},
      customer_details:{first_name:String(order.nama||'Pelanggan').slice(0,50),phone:String(order.no_hp||'')},
      callbacks:{finish:'https://samijaya.online/?payment='+encodeURIComponent(orderId)},
      expiry:{start_time:jakartaStart(started),duration:PAYMENT_MINUTES,unit:'minutes'},
      page_expiry:{duration:PAYMENT_MINUTES,unit:'minutes'}};
    const result=await midtransRequest(SNAP_URL+'/snap/v1/transactions',{method:'POST',
      headers:{'X-Override-Notification':'https://samijaya.online/midtrans/notification'},body:JSON.stringify(body)});
    if (!result.token || !result.redirect_url || !String(result.redirect_url).startsWith(SNAP_URL+'/')) throw new Error('MIDTRANS_RESPONSE_INVALID');
    query(`UPDATE samijaya.midtrans_payments SET snap_token=$2,redirect_url=$3,
      state=CASE WHEN state='PAID' THEN state ELSE 'PENDING' END,updated_at=now(),last_error=NULL WHERE order_id=$1`,
      [orderId,result.token,result.redirect_url]);
    return publicPayment(paymentRow(orderId));
  } catch (error) {
    query(`UPDATE samijaya.midtrans_payments SET state='INIT_FAILED',updated_at=now(),last_error=$2
      WHERE order_id=$1 AND state='INITIATING'`,[orderId,String(error.message).slice(0,80)]);
    return {status:'GAGAL_MENYIAPKAN'};
  }
}
function classify(status,fraud,statusCode) {
  if (String(statusCode)==='200' && (status==='settlement' || (status==='capture' && (fraud==='accept'||!fraud)))) return 'PAID';
  if (['expire','cancel','deny','failure'].includes(status)) return 'EXPIRED';
  if (status==='refund') return 'REFUNDED';
  if (status==='partial_refund') return 'PARTIAL_REFUND';
  return 'PENDING';
}
function notifyPaid(orderId) {
  const order=orderRow(orderId);
  if (!order) return;
  if (order.status==='BATAL') {
    const ctx=context();
    const result=ctx.tgSendToAdmins('⚠️ Pembayaran diterima untuk pesanan yang sudah batal: '+orderId+'. Periksa transaksi dan pengembalian dana di Midtrans.');
    if (result && result.some(item=>item && item.ok)) query('UPDATE samijaya.midtrans_payments SET notified_at=now() WHERE order_id=$1 AND notified_at IS NULL',[orderId]);
    return;
  }
  let snapshot;
  try { snapshot=JSON.parse(order.commit_snapshot_json||''); } catch (_) { return; }
  const ctx=context();
  const result=ctx._notifyAdminNewOrder(snapshot.order,snapshot.notification_items);
  if (result && result.ok) query('UPDATE samijaya.midtrans_payments SET notified_at=now() WHERE order_id=$1 AND notified_at IS NULL',[orderId]);
}
function cancelExpired(orderId) {
  const order=orderRow(orderId);
  if (!order || order.status!=='MENUNGGU') return;
  query('BEGIN');
  try {
    const ctx=context(), prior=ctx.isAdmin;
    ctx.isAdmin=id=>id==='midtrans-expiry'||prior(id);
    const result=ctx.orderUpdateStatus(orderId,'BATAL','midtrans-expiry','Pembayaran Midtrans kedaluwarsa');
    if (result.ok) query('COMMIT'); else query('ROLLBACK');
  } catch (error) { query('ROLLBACK'); throw error; }
}
function applyStatus(gatewayOrderId, amount, transactionStatus, fraudStatus, statusCode) {
  if (!gatewayOrderId.startsWith('SJ-')) throw new Error('GATEWAY_ORDER_INVALID');
  const orderId=safeOrderId(gatewayOrderId.slice(3));
  const row=paymentRow(orderId);
  if (!row || row.gateway_order_id!==gatewayOrderId || Number(row.amount)!==Number(amount)) throw new Error('PAYMENT_MISMATCH');
  const target=classify(transactionStatus,fraudStatus,statusCode);
  if (target==='PENDING') return publicPayment(row);
  if (['PAID','PARTIAL_REFUND','REFUNDED'].includes(row.state) && target==='EXPIRED') return publicPayment(row);
  if (row.state==='REFUNDED' && target!=='REFUNDED') return publicPayment(row);
  if (row.state==='PARTIAL_REFUND' && target==='PAID') return publicPayment(row);
  query(`UPDATE samijaya.midtrans_payments SET state=$2,paid_at=CASE WHEN $2='PAID' THEN COALESCE(paid_at,now()) ELSE paid_at END,
    updated_at=now() WHERE order_id=$1`,[orderId,target]);
  if (target==='PAID' && !row.notified_at) setImmediate(()=>{ try { notifyPaid(orderId); } catch (_) {} });
  if (target==='EXPIRED') cancelExpired(orderId);
  return publicPayment(paymentRow(orderId));
}
async function refreshStatus(orderId) {
  const row=paymentRow(orderId);
  if (!row || !['PENDING','INITIATING'].includes(row.state)) return publicPayment(row);
  try {
    const status=await midtransRequest(API_URL+'/v2/'+encodeURIComponent(row.gateway_order_id)+'/status');
    return applyStatus(status.order_id, status.gross_amount, status.transaction_status, status.fraud_status, status.status_code);
  } catch (_) { return publicPayment(row); }
}
async function customerPayment(orderId,token) {
  assertAvailable();
  const member=context().requireSession(token);
  if (!member) return {ok:false,code:'UNAUTHORIZED'};
  const order=orderRow(orderId);
  if (!order || String(order.member_id)!==String(member.member_id)) return {ok:false,code:'ORDER_NOT_FOUND'};
  if (order.metode_bayar!=='MIDTRANS') return {ok:false,code:'PAYMENT_NOT_MIDTRANS'};
  const current=await refreshStatus(orderId);
  return {ok:true,data:{order_id:orderId,payment:['BELUM_DIMULAI','INIT_FAILED','INITIATING'].includes(current.status)
    ? await ensurePayment(orderId) : current}};
}
function validSignature(body) {
  const fields=['order_id','status_code','gross_amount','signature_key'];
  if (fields.some(k=>typeof body[k]!=='string')) return false;
  const expected=crypto.createHash('sha512').update(body.order_id+body.status_code+body.gross_amount+SERVER_KEY).digest('hex');
  const a=Buffer.from(expected),b=Buffer.from(body.signature_key);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
function webhook(body) {
  if (!available()) return {status:503,body:{ok:false}};
  if (!body || !validSignature(body)) return {status:403,body:{ok:false}};
  try {
    applyStatus(body.order_id,body.gross_amount,body.transaction_status,body.fraud_status,body.status_code);
    return {status:200,body:{ok:true}};
  } catch (_) { return {status:503,body:{ok:false}}; }
}
async function reconcile() {
  if (!available()) return;
  const orphans=query(`SELECT o."order_id",o."total",o."created_at" FROM samijaya."Orders" o
    LEFT JOIN samijaya.midtrans_payments p ON p.order_id=o."order_id"
    WHERE o."metode_bayar"='MIDTRANS' AND o."status"='MENUNGGU' AND o."commit_status"='COMMITTED'
      AND p.order_id IS NULL ORDER BY o.source_row LIMIT 20`).rows;
  for (const order of orphans) {
    const createdAt=Date.parse(String(order.created_at||'').replace(' ','T')+'+07:00');
    if (!Number.isFinite(createdAt)) continue;
    if (Date.now()-createdAt>PAYMENT_MINUTES*60000+5*60000) {
      query(`INSERT INTO samijaya.midtrans_payments(order_id,gateway_order_id,amount,state,expires_at)
        VALUES($1,$2,$3,'EXPIRED',to_timestamp($4/1000.0)) ON CONFLICT(order_id) DO NOTHING`,
        [order.order_id,gatewayId(order.order_id),Number(order.total),createdAt+PAYMENT_MINUTES*60000]);
      try { cancelExpired(order.order_id); } catch (_) {}
    } else try { await ensurePayment(order.order_id); } catch (_) {}
  }
  const rows=query(`SELECT order_id FROM samijaya.midtrans_payments WHERE state='PENDING' AND updated_at<now()-interval '2 minutes' ORDER BY updated_at LIMIT 20`).rows;
  for (const row of rows) await refreshStatus(row.order_id);
  const overdue=query(`SELECT order_id,gateway_order_id,expires_at FROM samijaya.midtrans_payments
    WHERE state='PENDING' AND expires_at<now() ORDER BY expires_at LIMIT 20`).rows;
  for (const row of overdue) {
    try {
      const status=await midtransRequest(API_URL+'/v2/'+encodeURIComponent(row.gateway_order_id)+'/expire',{method:'POST'});
      if (status.transaction_status==='expire') applyStatus(status.order_id,status.gross_amount,'expire',status.fraud_status,status.status_code);
      else await refreshStatus(row.order_id);
    } catch (error) {
      if (error.httpStatus===404 && Date.now()>new Date(row.expires_at).getTime()+5*60000) {
        try {
          const status=await midtransRequest(API_URL+'/v2/'+encodeURIComponent(row.gateway_order_id)+'/status');
          applyStatus(status.order_id,status.gross_amount,status.transaction_status,status.fraud_status,status.status_code);
        } catch (statusError) {
          if (statusError.httpStatus===404) {
            query(`UPDATE samijaya.midtrans_payments SET state='EXPIRED',updated_at=now() WHERE order_id=$1 AND state='PENDING'`,[row.order_id]);
            try { cancelExpired(row.order_id); } catch (_) {}
          }
        }
      } else await refreshStatus(row.order_id);
    }
  }
  const unnotified=query(`SELECT order_id FROM samijaya.midtrans_payments WHERE state='PAID' AND notified_at IS NULL ORDER BY paid_at LIMIT 20`).rows;
  for (const row of unnotified) try { notifyPaid(row.order_id); } catch (_) {}
  const expired=query(`SELECT p.order_id FROM samijaya.midtrans_payments p JOIN samijaya."Orders" o ON o."order_id"=p.order_id
    WHERE p.state='EXPIRED' AND o."status"='MENUNGGU' ORDER BY p.updated_at LIMIT 20`).rows;
  for (const row of expired) try { cancelExpired(row.order_id); } catch (_) {}
  const abandoned=query(`SELECT order_id FROM samijaya.midtrans_payments WHERE state='INIT_FAILED' AND expires_at<now() LIMIT 20`).rows;
  for (const row of abandoned) {
    query(`UPDATE samijaya.midtrans_payments SET state='EXPIRED',updated_at=now() WHERE order_id=$1 AND state='INIT_FAILED'`,[row.order_id]);
    try { cancelExpired(row.order_id); } catch (_) {}
  }
}
module.exports={available,ensurePayment,customerPayment,webhook,reconcile,paymentRow,publicPayment};

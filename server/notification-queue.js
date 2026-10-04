'use strict';

const STATUS_TEMPLATE = {
  DIPROSES: 'ORDER_DIPROSES',
  SIAP: 'ORDER_SIAP',
  DIANTAR: 'ORDER_DIANTAR',
  SELESAI: 'ORDER_SELESAI',
  BATAL: 'ORDER_BATAL'
};

function normalizePhone(value) {
  let phone=String(value||'').replace(/\D/g,'');
  if(phone.startsWith('0')) phone='62'+phone.slice(1);
  if(phone.startsWith('8')) phone='62'+phone;
  return /^62[0-9]{8,13}$/.test(phone)?phone:'';
}

function fill(template,data) {
  return String(template||'').replace(/\{([A-Z_]+)\}/g,(_,key)=>String(data[key]??''));
}

function pickupName(query,order) {
  if(order.metode_kirim==='DIANTAR') return String(order.alamat_snapshot||'-');
  const row=query('SELECT "nama" FROM samijaya."PickupLocations" WHERE "lokasi_id"=$1 LIMIT 1',[order.lokasi_pickup_id]).rows[0];
  return row?String(row.nama||'-'):'-';
}

function templateText(query,code) {
  const row=query('SELECT "isi" FROM samijaya."MessageTemplates" WHERE "kode"=$1 LIMIT 1',[code]).rows[0];
  return row?String(row.isi||''):'';
}

function resolvedCode(query,base,method,recipient) {
  let code=base;
  const specific=base+'_'+String(method||'').toUpperCase();
  if(templateText(query,specific)) code=specific;
  if(recipient) {
    const recipientCode=code+'_PENERIMA';
    if(templateText(query,recipientCode)) code=recipientCode;
  }
  return code;
}

function enqueueOne(query,order,baseCode,recipient,point) {
  const phone=normalizePhone(recipient.phone);
  if(!phone) return false;
  const code=resolvedCode(query,baseCode,order.metode_kirim,recipient.secondary);
  const template=templateText(query,code);
  if(!template) return false;
  const message=fill(template,{
    NAMA:recipient.name||'Pelanggan',NAMA_PEMESAN:order.nama||'',ORDER_ID:order.order_id,
    TOTAL:Number(order.total||0).toLocaleString('id-ID'),CABANG:pickupName(query,order),POINT:Number(point||0)
  });
  query(`INSERT INTO samijaya.notification_outbox(order_id,template_code,recipient_phone,message)
    VALUES($1,$2,$3,$4) ON CONFLICT(order_id,template_code,recipient_phone) DO NOTHING`,
    [order.order_id,code,phone,message]);
  return true;
}

function enqueueStatus(query,orderId,status,point=0) {
  const base=STATUS_TEMPLATE[String(status||'').toUpperCase()];
  if(!base) return 0;
  const order=query('SELECT * FROM samijaya."Orders" WHERE "order_id"=$1 LIMIT 1',[String(orderId)]).rows[0];
  if(!order) return 0;
  let count=enqueueOne(query,order,base,{name:order.nama,phone:order.no_hp,secondary:false},point)?1:0;
  const secondPhone=normalizePhone(order.no_hp_penerima);
  if(secondPhone && secondPhone!==normalizePhone(order.no_hp)) {
    count+=enqueueOne(query,order,base,{name:order.nama_penerima,phone:secondPhone,secondary:true},point)?1:0;
  }
  return count;
}

function enqueuePaid(query,orderId) {
  const order=query('SELECT * FROM samijaya."Orders" WHERE "order_id"=$1 LIMIT 1',[String(orderId)]).rows[0];
  return order&&enqueueOne(query,order,'ORDER_DITERIMA',{name:order.nama,phone:order.no_hp,secondary:false},0)?1:0;
}

async function sendMessage(phone,message,fetchImpl=fetch) {
  const base=String(process.env.JALURPESAN_BASE_URL||'').trim().replace(/\/+$/,'');
  const key=String(process.env.JALURPESAN_DEVICE_KEY||'').trim();
  if(!/^https:\/\//i.test(base)||!key) throw new Error('JALURPESAN_NOT_CONFIGURED');
  const response=await fetchImpl(base+'/api/v1/messages',{method:'POST',headers:{
    'Authorization':'Bearer '+key,'Content-Type':'application/json'
  },body:JSON.stringify({to:normalizePhone(phone),message:String(message)}),signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error('JALURPESAN_HTTP_'+response.status);
  return true;
}

async function drain(query,fetchImpl=fetch) {
  query("UPDATE samijaya.notification_outbox SET state='FAILED',next_attempt_at=now(),last_error='WORKER_INTERRUPTED' WHERE state='SENDING' AND next_attempt_at<now()-interval '5 minutes'");
  const rows=query(`SELECT id,recipient_phone,message,attempts FROM samijaya.notification_outbox
    WHERE state IN ('PENDING','FAILED') AND next_attempt_at<=now() ORDER BY id LIMIT 20`).rows;
  for(const row of rows) {
    const claimed=query(`UPDATE samijaya.notification_outbox SET state='SENDING',attempts=attempts+1,next_attempt_at=now()
      WHERE id=$1 AND state IN ('PENDING','FAILED') RETURNING id`,[row.id]).rowCount;
    if(!claimed) continue;
    try {
      await sendMessage(row.recipient_phone,row.message,fetchImpl);
      query("UPDATE samijaya.notification_outbox SET state='SENT',sent_at=now(),last_error=NULL WHERE id=$1",[row.id]);
    } catch(error) {
      const attempts=Number(row.attempts||0)+1;
      const delay=Math.min(60,Math.pow(2,Math.min(attempts,5)));
      query(`UPDATE samijaya.notification_outbox SET state='FAILED',next_attempt_at=now()+($2||' minutes')::interval,
        last_error=$3 WHERE id=$1`,[row.id,String(delay),String(error.message||'SEND_FAILED').slice(0,80)]);
    }
  }
  return rows.length;
}

module.exports={normalizePhone,fill,enqueueStatus,enqueuePaid,sendMessage,drain};

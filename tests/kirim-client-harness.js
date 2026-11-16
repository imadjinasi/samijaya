'use strict';
// WhatsApp lewat Kirim: kunci API `krm_…` di header Authorization, POST /internal/kirim/messages tanpa
// `device`, kode galat Kirim diteruskan, dan pemilihan penyedia lewat WHATSAPP_PROVIDER.
const assert=require('node:assert');
const kirim=require('../server/kirim-client');
const queue=require('../server/notification-queue');

const ENV=['WHATSAPP_PROVIDER','KIRIM_BASE_URL','KIRIM_API_KEY','JALURPESAN_BASE_URL','JALURPESAN_DEVICE_KEY'];
const prior=Object.fromEntries(ENV.map(name=>[name,process.env[name]]));
function restore() {for(const name of ENV){if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];}}
function configureKirim() {
  process.env.WHATSAPP_PROVIDER='kirim';
  process.env.KIRIM_BASE_URL='http://127.0.0.1:3302/';
  process.env.KIRIM_API_KEY='krm_TestKeyOnly00000000000000000000';
}
function json(status,body) {return {ok:status<400,status,json:async()=>body};}

(async()=>{
  // 1. Tidak dikonfigurasi (kunci kosong atau bukan krm_) → galat jelas, tidak ada permintaan.
  configureKirim(); process.env.KIRIM_API_KEY='bukan-kunci';
  assert.strictEqual(kirim.configured(),false);
  await assert.rejects(()=>kirim.sendMessage('6285179902504','Tes',{jenis:'kode'},async()=>{throw new Error('should not fetch');}),/KIRIM_NOT_CONFIGURED/);

  // 2. Satu permintaan: Bearer kunci, Idempotency-Key, body tanpa device, jenis kode untuk OTP.
  configureKirim();
  const calls=[];
  const fetchOk=async(url,options)=>{calls.push({url,options});return json(202,{id:'11111111-1111-4111-8111-111111111111',status:'antre'});};
  const first=await kirim.sendMessage('6285179902504','Kode masuk admin Samijaya: 123456',{jenis:'kode',ref:'samijaya:admin-otp:abc'},fetchOk);
  assert.deepStrictEqual(first,{id:'11111111-1111-4111-8111-111111111111',status:'antre'});
  assert.strictEqual(calls.length,1);
  assert.strictEqual(calls[0].url,'http://127.0.0.1:3302/internal/kirim/messages');
  assert.strictEqual(calls[0].options.method,'POST');
  assert.strictEqual(calls[0].options.headers.Authorization,'Bearer krm_TestKeyOnly00000000000000000000');
  assert.match(calls[0].options.headers['Idempotency-Key'],/^[0-9a-f-]{36}$/);
  const sent=JSON.parse(calls[0].options.body);
  assert.deepStrictEqual(sent,{jenis:'kode',to:'+6285179902504',text:'Kode masuk admin Samijaya: 123456',ref:'samijaya:admin-otp:abc'});
  assert.ok(!('device' in sent),'device must not be sent; the key is bound to its number');

  // 3. Kunci idempotensi yang diberikan dipakai apa adanya; jenis notifikasi untuk pesanan.
  await kirim.sendMessage('6285179902504','Pesanan diproses',{jenis:'notifikasi',idempotencyKey:'samijaya:outbox:7'},fetchOk);
  assert.strictEqual(calls[1].options.headers['Idempotency-Key'],'samijaya:outbox:7');
  assert.strictEqual(JSON.parse(calls[1].options.body).jenis,'notifikasi');

  // 4. Penolakan Kirim membawa kodenya (kunci dicabut, kartu belum tersambung).
  await assert.rejects(()=>kirim.sendMessage('6285179902504','Tes',{},async()=>json(401,{error:{code:'unauthenticated',message:'…'}})),/KIRIM_HTTP_401_UNAUTHENTICATED/);
  await assert.rejects(()=>kirim.sendMessage('6285179902504','Tes',{},async()=>json(422,{error:{code:'device_not_connected',message:'…'}})),/KIRIM_HTTP_422_DEVICE_NOT_CONNECTED/);

  // 5. Status pesan.
  const status=await kirim.messageStatus('11111111-1111-4111-8111-111111111111',async(url,options)=>{
    assert.strictEqual(url,'http://127.0.0.1:3302/internal/kirim/messages/11111111-1111-4111-8111-111111111111');
    assert.strictEqual(options.headers.Authorization,'Bearer krm_TestKeyOnly00000000000000000000');
    return json(200,{id:'11111111-1111-4111-8111-111111111111',status:'terkirim',error_code:null});
  });
  assert.strictEqual(status.status,'terkirim');

  // 6. Pemilihan penyedia di notification-queue: kirim memakai nomor ternormalisasi; jalurpesan tetap jalan.
  configureKirim();
  const queued=[];
  await queue.sendMessage('0851-7990-2504','Halo',{jenis:'kode'},async(url,options)=>{queued.push({url,options});return json(202,{id:'x',status:'antre'});});
  assert.strictEqual(queued[0].url,'http://127.0.0.1:3302/internal/kirim/messages');
  assert.strictEqual(JSON.parse(queued[0].options.body).to,'+6285179902504');
  await assert.rejects(()=>queue.sendMessage('123','Halo',{},async()=>{throw new Error('should not fetch');}),/KIRIM_INVALID_NUMBER/);

  process.env.WHATSAPP_PROVIDER='jalurpesan';
  process.env.JALURPESAN_BASE_URL='https://jalurpesan.example';process.env.JALURPESAN_DEVICE_KEY='secret';
  let legacy;
  await queue.sendMessage('085179902504','Tes',async(url,options)=>{legacy={url,options};return {ok:true,status:200};});
  assert.strictEqual(legacy.url,'https://jalurpesan.example/api/v1/messages');
  assert.strictEqual(legacy.options.headers.Authorization,'Bearer secret');

  process.env.WHATSAPP_PROVIDER='fonnte';
  await assert.rejects(()=>queue.sendMessage('085179902504','Tes',{},async()=>json(202,{})),/WHATSAPP_PROVIDER_INVALID/);

  restore();
  console.log('kirim client harness passed');
})().catch(error=>{restore();console.error(error);process.exitCode=1;});

'use strict';
// WhatsApp lewat Kirim: token client credentials, POST /internal/kirim/messages tanpa `device`,
// token dipakai ulang, 401 memperbarui token sekali, dan pemilihan penyedia lewat WHATSAPP_PROVIDER.
const assert=require('node:assert');
const kirim=require('../server/kirim-client');
const queue=require('../server/notification-queue');

const ENV=['WHATSAPP_PROVIDER','KIRIM_BASE_URL','KEYCLOAK_TOKEN_URL','KIRIM_CLIENT_ID','KIRIM_CLIENT_SECRET','JALURPESAN_BASE_URL','JALURPESAN_DEVICE_KEY'];
const prior=Object.fromEntries(ENV.map(name=>[name,process.env[name]]));
function restore() {for(const name of ENV){if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];}}
function configureKirim() {
  process.env.WHATSAPP_PROVIDER='kirim';
  process.env.KIRIM_BASE_URL='http://127.0.0.1:3302/';
  process.env.KEYCLOAK_TOKEN_URL='https://login.example/realms/sq-staff/protocol/openid-connect/token';
  process.env.KIRIM_CLIENT_ID='samijaya';
  process.env.KIRIM_CLIENT_SECRET='test-secret';
  kirim.resetTokenCache();
}
function json(status,body) {return {ok:status<400,status,json:async()=>body};}

(async()=>{
  // 1. Tidak dikonfigurasi → galat jelas, tidak ada permintaan.
  configureKirim(); delete process.env.KIRIM_CLIENT_SECRET; kirim.resetTokenCache();
  assert.strictEqual(kirim.configured(),false);
  await assert.rejects(()=>kirim.sendMessage('6285179902504','Tes',{jenis:'kode'},async()=>{throw new Error('should not fetch');}),/KIRIM_NOT_CONFIGURED/);

  // 2. Token lalu pesan: body tanpa device, Idempotency-Key, Bearer token, jenis kode untuk OTP.
  configureKirim();
  const calls=[];
  const fetchOk=async(url,options)=>{
    calls.push({url,options});
    if(url.includes('/protocol/openid-connect/token')) return json(200,{access_token:'tok-1',expires_in:300});
    return json(202,{id:'11111111-1111-4111-8111-111111111111',status:'antre'});
  };
  const first=await kirim.sendMessage('6285179902504','Kode masuk admin Samijaya: 123456',{jenis:'kode',ref:'samijaya:admin-otp:abc'},fetchOk);
  assert.deepStrictEqual(first,{id:'11111111-1111-4111-8111-111111111111',status:'antre'});
  assert.strictEqual(calls.length,2);
  assert.strictEqual(calls[0].url,'https://login.example/realms/sq-staff/protocol/openid-connect/token');
  const tokenBody=new URLSearchParams(calls[0].options.body);
  assert.strictEqual(tokenBody.get('grant_type'),'client_credentials');
  assert.strictEqual(tokenBody.get('client_id'),'samijaya');
  assert.strictEqual(tokenBody.get('client_secret'),'test-secret');
  assert.strictEqual(calls[1].url,'http://127.0.0.1:3302/internal/kirim/messages');
  assert.strictEqual(calls[1].options.method,'POST');
  assert.strictEqual(calls[1].options.headers.Authorization,'Bearer tok-1');
  assert.match(calls[1].options.headers['Idempotency-Key'],/^[0-9a-f-]{36}$/);
  const sent=JSON.parse(calls[1].options.body);
  assert.deepStrictEqual(sent,{jenis:'kode',to:'+6285179902504',text:'Kode masuk admin Samijaya: 123456',ref:'samijaya:admin-otp:abc'});
  assert.ok(!('device' in sent),'device must not be sent; the card number is used');

  // 3. Token dipakai ulang selama belum kedaluwarsa; kunci idempotensi yang diberikan dipakai apa adanya.
  await kirim.sendMessage('6285179902504','Pesanan diproses',{jenis:'notifikasi',idempotencyKey:'samijaya:outbox:7'},fetchOk);
  assert.strictEqual(calls.length,3);
  assert.strictEqual(calls[2].options.headers['Idempotency-Key'],'samijaya:outbox:7');
  assert.strictEqual(JSON.parse(calls[2].options.body).jenis,'notifikasi');

  // 4. 401 dari Kirim → token baru sekali, lalu ulang; 401 kedua → galat.
  let tokens=0;
  const fetch401=async(url)=>{
    if(url.includes('/token')) {tokens++;return json(200,{access_token:'tok-'+tokens,expires_in:300});}
    return json(401,{error:{code:'unauthenticated',message:'Token tidak sah.'}});
  };
  await assert.rejects(()=>kirim.sendMessage('6285179902504','Tes',{},fetch401),/KIRIM_HTTP_401_UNAUTHENTICATED/);
  assert.strictEqual(tokens,1,'one refresh after a 401, then give up');

  // 5. Penolakan Kirim membawa kodenya (mis. kartu belum tersambung).
  kirim.resetTokenCache();
  const fetch422=async(url)=>url.includes('/token')?json(200,{access_token:'tok-x',expires_in:300}):json(422,{error:{code:'device_not_connected',message:'…'}});
  await assert.rejects(()=>kirim.sendMessage('6285179902504','Tes',{},fetch422),/KIRIM_HTTP_422_DEVICE_NOT_CONNECTED/);

  // 6. Token gagal → tidak ada pesan dikirim.
  kirim.resetTokenCache();
  let messagePosts=0;
  const fetchTokenFail=async(url)=>{if(url.includes('/token'))return json(503,{});messagePosts++;return json(202,{});};
  await assert.rejects(()=>kirim.sendMessage('6285179902504','Tes',{},fetchTokenFail),/KIRIM_TOKEN_HTTP_503/);
  assert.strictEqual(messagePosts,0);

  // 7. Pemilihan penyedia di notification-queue: kirim memakai nomor ternormalisasi; jalurpesan tetap jalan.
  configureKirim();
  const queued=[];
  await queue.sendMessage('0851-7990-2504','Halo',{jenis:'kode'},async(url,options)=>{queued.push({url,options});
    return url.includes('/token')?json(200,{access_token:'tok-q',expires_in:300}):json(202,{id:'x',status:'antre'});});
  assert.strictEqual(queued[1].url,'http://127.0.0.1:3302/internal/kirim/messages');
  assert.strictEqual(JSON.parse(queued[1].options.body).to,'+6285179902504');
  await assert.rejects(()=>queue.sendMessage('123','Halo',{},async()=>{throw new Error('should not fetch');}),/KIRIM_INVALID_NUMBER/);

  process.env.WHATSAPP_PROVIDER='jalurpesan';
  process.env.JALURPESAN_BASE_URL='https://jalurpesan.example';process.env.JALURPESAN_DEVICE_KEY='secret';
  let legacy;
  await queue.sendMessage('085179902504','Tes',async(url,options)=>{legacy={url,options};return {ok:true,status:200};});
  assert.strictEqual(legacy.url,'https://jalurpesan.example/api/v1/messages');
  assert.strictEqual(legacy.options.headers.Authorization,'Bearer secret');

  process.env.WHATSAPP_PROVIDER='fonnte';
  await assert.rejects(()=>queue.sendMessage('085179902504','Tes',{},async()=>json(202,{})),/WHATSAPP_PROVIDER_INVALID/);

  restore(); kirim.resetTokenCache();
  console.log('kirim client harness passed');
})().catch(error=>{restore();console.error(error);process.exitCode=1;});

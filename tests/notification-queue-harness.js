'use strict';
const assert=require('node:assert');
const queue=require('../server/notification-queue');

assert.strictEqual(queue.normalizePhone('0851-7990-2504'),'6285179902504');
assert.strictEqual(queue.normalizePhone('6285179912504'),'6285179912504');
assert.strictEqual(queue.normalizePhone('123'),'');
assert.strictEqual(queue.fill('Halo {NAMA}, {ORDER_ID}',{NAMA:'Ayu',ORDER_ID:'SJ1'}),'Halo Ayu, SJ1');

const writes=[];
function query(sql,params=[]) {
  if(sql.includes('FROM samijaya."Orders"')) return {rows:[{order_id:'SJ1',nama:'Ayu',no_hp:'085179902504',
    nama_penerima:'Budi',no_hp_penerima:'085179912504',metode_kirim:'DIANTAR',alamat_snapshot:'Bogor',total:'35000'}]};
  if(sql.includes('FROM samijaya."MessageTemplates"')) {
    const templates={ORDER_DIPROSES:'Halo {NAMA}, {ORDER_ID} diproses.',ORDER_DIPROSES_PENERIMA:'Halo {NAMA}, pesanan {NAMA_PEMESAN} diproses.'};
    return {rows:templates[params[0]]?[{isi:templates[params[0]]}]:[]};
  }
  if(sql.includes('FROM samijaya."PickupLocations"')) return {rows:[]};
  if(sql.includes('INSERT INTO samijaya.notification_outbox')) {writes.push(params);return {rowCount:1,rows:[]};}
  throw new Error('Unexpected SQL: '+sql);
}
assert.strictEqual(queue.enqueueStatus(query,'SJ1','DIPROSES'),2);
assert.deepStrictEqual(writes.map(x=>[x[1],x[2],x[3]]),[
  ['ORDER_DIPROSES','6285179902504','Halo Ayu, SJ1 diproses.'],
  ['ORDER_DIPROSES_PENERIMA','6285179912504','Halo Budi, pesanan Ayu diproses.']
]);

(async()=>{
  const priorBase=process.env.JALURPESAN_BASE_URL,priorKey=process.env.JALURPESAN_DEVICE_KEY;
  process.env.JALURPESAN_BASE_URL='https://jalurpesan.example';process.env.JALURPESAN_DEVICE_KEY='secret';
  let request;
  await queue.sendMessage('085179902504','Tes',async(url,options)=>{request={url,options};return {ok:true,status:200};});
  assert.strictEqual(request.url,'https://jalurpesan.example/api/v1/messages');
  assert.deepStrictEqual(JSON.parse(request.options.body),{to:'6285179902504',message:'Tes'});
  if(priorBase===undefined)delete process.env.JALURPESAN_BASE_URL;else process.env.JALURPESAN_BASE_URL=priorBase;
  if(priorKey===undefined)delete process.env.JALURPESAN_DEVICE_KEY;else process.env.JALURPESAN_DEVICE_KEY=priorKey;
  console.log('notification queue harness passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const ROOT=process.env.SAMIJAYA_MEDIA_ROOT||'/srv/samijaya/media/images';
const NAME=/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
const TYPES={jpg:'image/jpeg',png:'image/png',webp:'image/webp'};
const MAX_BYTES=4*1024*1024;

function imageType(bytes) {
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) return 'png';
  if(bytes.length>=3&&bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex'))) return 'jpg';
  if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP') return 'webp';
  return null;
}
function saveImage(bytes,contentType) {
  if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>MAX_BYTES) throw new Error('IMAGE_SIZE_INVALID');
  const ext=imageType(bytes);
  if(!ext||TYPES[ext]!==String(contentType||'').split(';')[0].toLowerCase()) throw new Error('IMAGE_TYPE_INVALID');
  fs.mkdirSync(ROOT,{recursive:true,mode:0o750});
  const name=crypto.randomUUID()+'.'+ext;
  fs.writeFileSync(path.join(ROOT,name),bytes,{flag:'wx',mode:0o640});
  return name;
}
function serve(req,res,name) {
  if(!NAME.test(name)) {res.writeHead(404);return res.end();}
  const file=path.join(ROOT,name);
  let stat;
  try {stat=fs.statSync(file);} catch (_) {res.writeHead(404);return res.end();}
  if(!stat.isFile()) {res.writeHead(404);return res.end();}
  const ext=name.slice(name.lastIndexOf('.')+1);
  res.writeHead(200,{'Content-Type':TYPES[ext],'Content-Length':stat.size,
    'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}
module.exports={saveImage,serve,MAX_BYTES};

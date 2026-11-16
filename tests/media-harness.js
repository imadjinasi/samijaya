'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'samijaya-media-'));
process.env.SAMIJAYA_MEDIA_ROOT=root;
const media=require('../server/media');
try {
  const tinyPng=Buffer.from('89504e470d0a1a0a0000000049454e44ae426082','hex');
  const name=media.saveImage(tinyPng,'image/png');
  assert.match(name,/^[0-9a-f-]{36}\.png$/);
  assert.deepEqual(fs.readFileSync(path.join(root,name)),tinyPng);
  assert.throws(()=>media.saveImage(Buffer.from('<script>alert(1)</script>'),'image/png'),/IMAGE_TYPE_INVALID/);
  assert.throws(()=>media.saveImage(tinyPng,'image/jpeg'),/IMAGE_TYPE_INVALID/);
  assert.throws(()=>media.saveImage(Buffer.alloc(media.MAX_BYTES+1),'image/png'),/IMAGE_SIZE_INVALID/);
  let status=0;
  media.serve({method:'GET'},{writeHead:n=>{status=n;},end:()=>{}},'../../prod.env');
  assert.equal(status,404);
  console.log('media-harness: all assertions passed');
} finally {fs.rmSync(root,{recursive:true,force:true});}

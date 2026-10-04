'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const filename='12345678-1234-1234-1234-123456789abc.webp';
const tables={Categories:[],Products:[
  {product_id:'LOCAL',nama:'Lokal',status:'aktif',foto_file_id:filename},
  {product_id:'OLD',nama:'Lama',status:'aktif',foto_file_id:'1AKkj1loCREoT3JAg5o3VHqfDzqfp7V6k'}
],PickupLocations:[],DeliverySlots:[],Holidays:[],Settings:[]};
const context={Date,JSON,String,Number,Math,
  cacheReadBestEffort:()=>({value:null}),cacheWriteBestEffort:()=>{},cacheInvalidateKey:()=>{},
  catalogGetRevision:()=>'',readAll:name=>tables[name]||[],variantsGroupByProduct:()=>({}),addonsGroupByProduct:()=>({}),
  campaignsReadActive:()=>[],safeLog:()=>{},Utilities:{formatDate:()=>''}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('backend/Catalog.gs','utf8'),context);
const products=context.catalogGetCatalog().data.products;
assert.equal(products[0].foto_url,'/media/images/'+filename);
assert.equal(products[1].foto_url,'','Old Drive IDs must never trigger Google image requests');
console.log('native-catalog-photo-harness: all assertions passed');

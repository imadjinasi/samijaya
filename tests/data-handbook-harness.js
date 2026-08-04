const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

let businessDataReads = 0;
class Range {
  constructor(sheet,row,col,rows,cols){Object.assign(this,{sheet,row,col,rows,cols});}
  getValues(){return Array.from({length:this.rows},(_,r)=>Array.from({length:this.cols},(_,c)=>this.sheet.values[this.row-1+r]?.[this.col-1+c]??''));}
  setValues(matrix){for(let r=0;r<matrix.length;r++)for(let c=0;c<matrix[r].length;c++){if(!this.sheet.values[this.row-1+r])this.sheet.values[this.row-1+r]=[];this.sheet.values[this.row-1+r][this.col-1+c]=matrix[r][c];}return this;}
  getNotes(){return Array.from({length:this.rows},(_,r)=>Array.from({length:this.cols},(_,c)=>this.sheet.notes[this.row-1+r]?.[this.col-1+c]??''));}
  setNotes(matrix){for(let r=0;r<matrix.length;r++)for(let c=0;c<matrix[r].length;c++){if(!this.sheet.notes[this.row-1+r])this.sheet.notes[this.row-1+r]=[];this.sheet.notes[this.row-1+r][this.col-1+c]=matrix[r][c];}return this;}
  setWrap(){return this;} setBackgrounds(){return this;} createFilter(){this.sheet.filter={};return this;}
}
class Sheet {
  constructor(name,headers=[]){this.name=name;this.values=headers.length?[headers.slice()]:[];this.notes=[headers.map(()=> '')];this.filter=null;}
  getLastColumn(){return Math.max(0,...this.values.map(r=>r.length));}
  getLastRow(){return this.values.length;}
  getRange(r,c,rows=1,cols=1){return new Range(this,r,c,rows,cols);}
  getDataRange(){if(this.name!=='Handbook')businessDataReads++;return new Range(this,1,1,Math.max(this.getLastRow(),1),Math.max(this.getLastColumn(),1));}
  setFrozenRows(n){this.frozen=n;} setColumnWidth(){} getFilter(){return this.filter;}
}
class Spreadsheet {
  constructor(){this.sheets={};}
  getSheetByName(n){return this.sheets[n]||null;}
  insertSheet(n){return this.sheets[n]=new Sheet(n);}
}

const context={console,JSON,Date,Math,Number,String,Boolean,Object,Array,RegExp,
  sheetPrepareValue(value){if(typeof value==='string'&&value[0]!=="'"&&/^\s*[=+\-@]/.test(value))return "'"+value;return value;},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-sheet'})},
  SpreadsheetApp:{openById:()=>context.ss}, Logger:{log(){} }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('backend/DataHandbook.gs','utf8'),context);

// Registry, Setup coverage, modes, sensitive fields, PromoCodes A-AR, and no Banners.
const rows=context.dataHandbookBuildRows_();
assert.strictEqual(context.DATA_HANDBOOK_BUSINESS_SHEETS.length,21);
assert.strictEqual(rows.length,250);
assert.strictEqual(rows.filter(r=>r.sheet_name==='PromoCodes').length,44);
assert.deepStrictEqual(Array.from(rows.filter(r=>r.sheet_name==='PromoCodes').map(r=>r.column_name)),Array.from(context.DATA_HANDBOOK_BUSINESS_SHEETS.find(s=>s.name==='PromoCodes').headers));
assert.strictEqual(rows.find(r=>r.sheet_name==='PromoCodes'&&r.column_name==='diskon_produk_kelipatan').default_value,'false');
assert(rows.find(r=>r.sheet_name==='PromoCodes'&&r.column_name==='required_addon_ids').related_to.includes('ProductAddons.addon_id'));
for(const mode of ['MANUAL','SYSTEM','MIXED','DO_NOT_EDIT']) assert(rows.some(r=>r.input_mode===mode));
assert(rows.find(r=>r.sheet_name==='Sessions'&&r.column_name==='token').sensitive);
assert(rows.some(r=>r.sheet_name==='Campaigns'));
assert(!rows.some(r=>r.sheet_name==='Banners'||r.sheet_name==='Handbook'));
const setupSource=fs.readFileSync('backend/Setup.gs','utf8');
for(const spec of context.DATA_HANDBOOK_BUSINESS_SHEETS) for(const h of spec.headers) assert(setupSource.includes(`'${h}'`),`${spec.name}.${h} absent from Setup source`);
assert(setupSource.includes('setupDataHandbookForNewInstall_(ss)'));

// First migration creates Handbook and notes without reading business rows.
context.ss=new Spreadsheet();
for(const spec of context.DATA_HANDBOOK_BUSINESS_SHEETS)context.ss.sheets[spec.name]=new Sheet(spec.name,Array.from(spec.headers));
let result=context.dataHandbookSync_(context.ss,true);
assert.strictEqual(result.created,true); assert.strictEqual(result.inserted,250); assert.strictEqual(context.ss.sheets.Handbook.getLastRow(),251);
assert.strictEqual(businessDataReads,0);
assert(context.ss.sheets.PromoCodes.notes[0][0].includes('[Samijaya Handbook]'));
let cleanAudit=context.auditDataHandbookCoverageReadOnly();
assert.strictEqual(cleanAudit.ok,true);
assert.strictEqual(cleanAudit.custom_row.length,0);

// Managed descriptions/notes update; custom row/note survive; rerun has no duplicate.
const handbook=context.ss.sheets.Handbook;
handbook.values[1][10]='deskripsi lama';
handbook.values.push(['CustomSheet','Tujuan','custom_column',1,'MANUAL',false,'teks','','','','Custom','BEBAS_SEBELUM_DIPAKAI',false,'','']);
context.ss.sheets.Products.notes[0][1]='Catatan operator';
context.ss.sheets.Products.notes[0][2]='[Samijaya Handbook]\nVersi lama';
result=context.dataHandbookSync_(context.ss,true);
assert.strictEqual(result.inserted,0); assert.strictEqual(result.updated,250); assert.strictEqual(result.custom_rows,1);
assert(result.note_conflicts.includes('Products.nama'));
assert.strictEqual(context.ss.sheets.Products.notes[0][1],'Catatan operator');
assert(context.ss.sheets.Products.notes[0][2].includes('Lihat sheet Handbook'));
assert.notStrictEqual(handbook.values[1][10],'deskripsi lama');
assert.strictEqual(handbook.values.filter(r=>r[0]==='CustomSheet').length,1);
assert.strictEqual(businessDataReads,0);

// Duplicate managed key is a conflict and neither duplicate is silently selected.
const first=handbook.values.find(r=>r[0]==='Settings'&&r[2]==='key');
handbook.values.push(first.slice());
const before=handbook.values.filter(r=>r[0]==='Settings'&&r[2]==='key').map(r=>r[10]);
result=context.dataHandbookSync_(context.ss,false);
assert(result.row_conflicts.includes('Settings.key'));
assert.deepStrictEqual(handbook.values.filter(r=>r[0]==='Settings'&&r[2]==='key').map(r=>r[10]),before);

// Coverage categories: duplicate, custom, unknown/stale, missing header/note, invalid mode/sensitive.
handbook.values.find(r=>r[0]==='Sessions'&&r[2]==='token')[12]=false;
handbook.values.find(r=>r[0]==='Products'&&r[2]==='harga')[4]='INVALID';
handbook.values.push(['Products','Tujuan','old_column',99,'MANUAL',false,'teks','','','','','BEBAS_SEBELUM_DIPAKAI',false,'','']);
context.ss.sheets.MemberAddresses.values[0]=context.ss.sheets.MemberAddresses.values[0].filter(h=>h!=='alamat_snapshot');
context.ss.sheets.Products.values[0].push('future_column');
const audit=context.auditDataHandbookCoverageReadOnly();
assert(audit.missing_business_header.includes('MemberAddresses.alamat_snapshot'));
assert(audit.unregistered_business_header.includes('Products.future_column'));
assert(audit.duplicate_handbook_key.includes('Settings.key'));
assert(audit.stale_unknown_handbook_row.includes('Products.old_column'));
assert(audit.custom_row.includes('CustomSheet.custom_column'));
assert(audit.custom_header_note_conflict.includes('Products.nama'));
assert(audit.invalid_input_mode.includes('Products.harga'));
assert(audit.missing_sensitive_classification.includes('Sessions.token'));
assert.strictEqual(audit.ok,false);

// Formula-safe path is applied to every managed field and no production value/secret is copied.
let prepareCalls=0; context.sheetPrepareValue=value=>{prepareCalls++;return value;};
context.dataHandbookPrepareMatrix_([rows[0]]);
assert.strictEqual(prepareCalls,context.DATA_HANDBOOK_HEADERS.length);
const serialized=JSON.stringify(rows);
for(const secret of ['TELEGRAM_BOT_TOKEN_VALUE','raw-session-token','production-member-name'])assert(!serialized.includes(secret));
const migrationSource=fs.readFileSync('backend/DataHandbook.gs','utf8');
assert(!/readAll\s*\(/.test(migrationSource));

console.log('data-handbook-harness: all assertions passed');

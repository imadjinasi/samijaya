'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { query, fetchSync } = require('./sync-bridge');

const tableCache = new Map();
const cache = new Map();
const properties = new Map();
const SCRIPTS = ['Schema.gs','Util.gs','Lock.gs','Auth.gs','Address.gs','Catalog.gs',
  'Order.gs','Point.gs','Promo.gs','Review.gs','Variants.gs','Addons.gs',
  'Campaigns.gs','Telegram.gs','Router.gs','Phase8DReadinessAudit.gs'];
const source = SCRIPTS.map(name => fs.readFileSync(path.join(__dirname, '..', 'backend', name), 'utf8')).join('\n');

function qi(s) { return '"' + String(s).replaceAll('"', '""') + '"'; }
function tableName(name) { return 'samijaya.' + qi(name); }
function columns(name) {
  if (!tableCache.has(name)) {
    const rows = query(`SELECT column_name FROM information_schema.columns WHERE table_schema='samijaya' AND table_name=$1 AND column_name<>'source_row' ORDER BY ordinal_position`, [name]).rows;
    if (!rows.length) throw new Error('UNKNOWN_SHEET');
    tableCache.set(name, rows.map(r => r.column_name));
  }
  return tableCache.get(name);
}
function cell(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

class Range {
  constructor(sheet, row, col, rows = 1, cols = 1) {
    this.sheet = sheet; this.row = row; this.col = col; this.rows = rows; this.cols = cols;
  }
  getNumRows() { return this.rows; }
  createTextFinder(text) {
    const range=this;
    let entire=false;
    return {
      matchEntireCell(value) {entire=!!value;return this;},
      findAll() {
        const needle=String(text);
        const matrix=range.getValues();
        const found=[];
        matrix.forEach((row,ri)=>row.forEach(value=>{
          const hit=entire?String(value??'')===needle:String(value??'').includes(needle);
          if(hit) found.push({getRow:()=>range.row+ri});
        }));
        return found;
      },
      findNext() {return this.findAll()[0]||null;}
    };
  }
  getValues() {
    const headers = columns(this.sheet.name);
    const first = Math.max(2, this.row), last = this.row + this.rows - 1;
    const existing = first <= last ? query(`SELECT * FROM ${tableName(this.sheet.name)} WHERE source_row BETWEEN $1 AND $2`, [first,last]).rows : [];
    const byRow = new Map(existing.map(r => [r.source_row, r]));
    return Array.from({length:this.rows}, (_, ri) => {
      const number = this.row + ri;
      const record = byRow.get(number);
      const all = number === 1 ? headers : headers.map(h => record ? record[h] : '');
      return all.slice(this.col - 1, this.col - 1 + this.cols);
    });
  }
  getValue() { return this.getValues()[0][0]; }
  setValue(value) { return this.setValues([[value]]); }
  setValues(matrix) {
    if (!Array.isArray(matrix) || matrix.length !== this.rows || matrix.some(r => !Array.isArray(r) || r.length !== this.cols)) throw new Error('RANGE_SHAPE');
    const headers = columns(this.sheet.name);
    if (this.row < 2 || this.col < 1 || this.col + this.cols - 1 > headers.length) throw new Error('RANGE_WRITE_INVALID');
    for (let ri = 0; ri < this.rows; ri++) {
      const rowNumber = this.row + ri;
      const old = query(`SELECT * FROM ${tableName(this.sheet.name)} WHERE source_row=$1`, [rowNumber]).rows[0] || {};
      const values = headers.map((h, ci) => ci >= this.col - 1 && ci < this.col - 1 + this.cols
        ? cell(matrix[ri][ci - (this.col - 1)]) : cell(old[h]));
      const names = ['source_row', ...headers].map(qi).join(',');
      const slots = values.map((_, i) => '$' + (i + 2)).join(',');
      const update = headers.map(h => `${qi(h)}=EXCLUDED.${qi(h)}`).join(',');
      query(`INSERT INTO ${tableName(this.sheet.name)} (${names}) VALUES ($1,${slots}) ON CONFLICT (source_row) DO UPDATE SET ${update}`, [rowNumber, ...values]);
    }
    return this;
  }
}
class Sheet {
  constructor(name) { this.name = name; columns(name); }
  getLastColumn() { return columns(this.name).length; }
  getLastRow() { return Number(query(`SELECT COALESCE(max(source_row),1) AS n FROM ${tableName(this.name)}`).rows[0].n); }
  getRange(row, col, rows = 1, cols = 1) { return new Range(this, row, col, rows, cols); }
  getDataRange() { return this.getRange(1,1,this.getLastRow(),this.getLastColumn()); }
  appendRow(values) { this.getRange(this.getLastRow()+1,1,1,values.length).setValues([values]); }
}
const SpreadsheetApp = { openById() { return { getSheetByName(name) {
  try { return new Sheet(name); } catch (e) { if (e.message === 'UNKNOWN_SHEET') return null; throw e; }
}};}};

function formatDate(value, _timezone, pattern) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Jakarta',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',weekday:'short'})
    .formatToParts(date).map(p => [p.type,p.value]));
  const Y=parts.year, M=parts.month, D=parts.day, H=parts.hour, m=parts.minute, s=parts.second;
  const patterns = {
    'yyyy-MM-dd':`${Y}-${M}-${D}`, 'yyyy-MM-dd HH:mm:ss':`${Y}-${M}-${D} ${H}:${m}:${s}`,
    'yyMMdd':`${Y.slice(-2)}${M}${D}`, 'HH':H, 'HH:mm':`${H}:${m}`, 'EEE':parts.weekday.toUpperCase(),
    'dd-MM-yy HH:mm':`${D}-${M}-${Y.slice(-2)} ${H}:${m}`,
    "yyyy-MM-dd'T'HH:mm:ssXXX":`${Y}-${M}-${D}T${H}:${m}:${s}+07:00`
  };
  if (!(pattern in patterns)) throw new Error('DATE_PATTERN_UNSUPPORTED');
  return patterns[pattern];
}
const Utilities = {
  DigestAlgorithm:{SHA_256:'SHA_256'}, Charset:{UTF_8:'UTF_8'},
  computeDigest(_algorithm, value) { return [...crypto.createHash('sha256').update(String(value),'utf8').digest()].map(b => b > 127 ? b - 256 : b); },
  getUuid:()=>crypto.randomUUID(), formatDate,
  sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms); }
};
const CacheService = { getScriptCache() { return {
  get(key) { const entry=cache.get(key); if (!entry || entry.until < Date.now()) {cache.delete(key);return null;} return entry.value; },
  put(key,value,ttl) { cache.set(key,{value:String(value),until:Date.now()+Number(ttl)*1000}); },
  remove(key) { cache.delete(key); }
};}};
const PropertiesService = { getScriptProperties() { return {
  getProperty(key) { if (key === 'SPREADSHEET_ID') return 'postgres'; return process.env[key] || properties.get(key) || null; },
  setProperty(key,value) { if (key === 'AUTH_HASH_PEPPER') throw new Error('AUTH_HASH_PEPPER_MISSING'); properties.set(key,String(value)); },
  deleteProperty(key) { properties.delete(key); }
};}};
const LockService = { getScriptLock() { return { tryLock() {
  query('SELECT pg_advisory_xact_lock($1)', [310021]); return true;
}, waitLock() { query('SELECT pg_advisory_xact_lock($1)', [310021]); }, releaseLock() {} };}};
const UrlFetchApp = { fetch(url, options) {
  const response = fetchSync(url,options); return { getResponseCode:()=>response.status, getContentText:()=>response.body };
}};
const ContentService = { MimeType:{JSON:'application/json'}, createTextOutput(body) { return {body, setMimeType(type) {this.type=type;return this;}};}};
const HtmlService = { createHtmlOutput(body) { return {body,type:'text/html'}; }};
const Logger = { log() {} };

function context() {
  const ctx = vm.createContext({console:{log(){}},SpreadsheetApp,Utilities,CacheService,
    PropertiesService,LockService,UrlFetchApp,ContentService,HtmlService,Logger,
    Date,JSON,Math,String,Number,Boolean,Array,Object,RegExp,parseInt,parseFloat,
    isNaN,isFinite,encodeURIComponent,decodeURIComponent,Set,Map});
  vm.runInContext(source,ctx,{filename:'samijaya-gas.js',timeout:1000});
  const readSetting = ctx.getSetting;
  const secretKeys = new Set(['TELEGRAM_BOT_TOKEN','TELEGRAM_SECRET','ADMIN_PASSWORD_HASH','ADMIN_CHAT_IDS']);
  ctx.getSetting = key => key === 'DEMO_OTP' ? (process.env.DEMO_OTP || readSetting(key)) :
    secretKeys.has(key) ? (process.env[key] || null) : readSetting(key);
  ctx.paymentGateStatus = orderId => {
    const row=query('SELECT state FROM samijaya.midtrans_payments WHERE order_id=$1',[String(orderId)]).rows[0];
    return row ? row.state : 'UNPAID';
  };
  return ctx;
}
function invalidateForAdmin(table, settingKey) {
  if (table === 'Settings' && settingKey) cache.delete('setting_' + settingKey);
  if (['Settings','Products','Categories','ProductVariants','ProductAddons',
    'PickupLocations','DeliverySlots','Holidays','PromoCodes','Campaigns'].includes(table)) {
    cache.delete('catalog_cache');
    properties.set('CATALOG_CACHE_REVISION', Date.now().toString(36) + '-' + crypto.randomBytes(5).toString('hex'));
  }
}
module.exports = { context, query, columns, tableName, qi, invalidateForAdmin };

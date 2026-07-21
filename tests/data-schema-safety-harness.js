const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {
  console, JSON, Date, Math, Number, String, Boolean, Object, Array, RegExp,
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test' }) },
  SpreadsheetApp: { openById: () => { throw new Error('production access forbidden'); } },
  Utilities: {
    getUuid: () => 'uuid',
    formatDate: () => '2026-07-22 10:00:00',
    computeDigest: () => [], DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' }
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, removeAll() {} }) },
  ContentService: { createTextOutput: () => ({ setMimeType() { return this; } }), MimeType: { JSON: 'JSON' } }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('backend/Schema.gs', 'utf8'), context);
vm.runInContext(fs.readFileSync('backend/Util.gs', 'utf8'), context);

// Legacy Banners is absent from every contract/runtime surface; Campaigns remains wired.
const schemaSource = fs.readFileSync('backend/Schema.gs', 'utf8');
const setupSource = fs.readFileSync('backend/Setup.gs', 'utf8');
const catalogSource = fs.readFileSync('backend/Catalog.gs', 'utf8');
const contractSource = fs.readFileSync('CONTRACT.md', 'utf8');
const backendRuntimeSource = fs.readdirSync('backend')
  .filter(name => name.endsWith('.gs') && name !== 'Schema.gs' && name !== 'Setup.gs')
  .map(name => fs.readFileSync('backend/' + name, 'utf8'))
  .join('\n');
assert.strictEqual(context.schemaGet('Banners'), null);
assert.ok(context.schemaGet('Campaigns'));
assert.doesNotMatch(setupSource, /['"]Banners['"]/);
assert.match(setupSource, /['"]Campaigns['"]/);
assert.doesNotMatch(catalogSource, /readAll\s*\(\s*['"]Banners['"]\s*\)/);
assert.match(catalogSource, /campaigns\s*:\s*campaignsReadActive\s*\(\s*\)/);
assert.doesNotMatch(contractSource, /\bbanners?\b/i);
assert.match(contractSource, /\bCampaigns\b/);
assert.doesNotMatch(backendRuntimeSource, /\bBanners\b/);

// The read-only schema audit iterates the registry and succeeds without Banners.
const originalGetSheetHeaders = context.getSheetHeaders;
const originalSchemaFindDuplicatePrimaryIds = context.schemaFindDuplicatePrimaryIds;
context.getSheetHeaders = sheetName => ['id_' + sheetName];
context.schemaFindDuplicatePrimaryIds = () => [];
const auditReport = context.auditPhase8BSchemaReadOnly();
assert.strictEqual(auditReport.ok, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(auditReport.sheets, 'Banners'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(auditReport.sheets, 'Campaigns'), true);
context.getSheetHeaders = originalGetSheetHeaders;
context.schemaFindDuplicatePrimaryIds = originalSchemaFindDuplicatePrimaryIds;

// Formula-like strings are literal, including leading whitespace; existing apostrophe is stable.
for (const prefix of ['=', '+', '-', '@']) {
  assert.strictEqual(context.sheetPrepareValue(prefix + 'SUM(A1:A2)'), "'" + prefix + 'SUM(A1:A2)');
  assert.strictEqual(context.sheetPrepareValue('  ' + prefix + 'cmd'), "'  " + prefix + 'cmd');
}
assert.strictEqual(context.sheetPrepareValue('teks biasa'), 'teks biasa');
assert.strictEqual(context.sheetPrepareValue("'=legacy"), "'=legacy");
assert.strictEqual(context.sheetPrepareValue(context.sheetPrepareValue('=once')), "'=once");
assert.strictEqual(context.sheetPrepareValue(context.sheetLiteral('@literal')), "'@literal");

// Typed values remain typed. JSON stays valid. Formula requires an explicit trusted marker.
const date = new Date('2026-07-22T00:00:00Z');
assert.strictEqual(context.sheetPrepareValue(42), 42);
assert.strictEqual(context.sheetPrepareValue(false), false);
assert.strictEqual(context.sheetPrepareValue(date), date);
const json = context.sheetPrepareValue(context.sheetJson({ note: '=literal inside json', count: 2 }));
assert.deepStrictEqual(JSON.parse(json), { note: '=literal inside json', count: 2 });
assert.strictEqual(context.sheetPrepareValue(context.sheetTrustedFormula('=SUM(A1:A2)')), '=SUM(A1:A2)');
assert.strictEqual(context.sheetPrepareValue('=SUM(A1:A2)'), "'=SUM(A1:A2)");
assert.throws(() => context.sheetPrepareValue(Infinity), /SHEET_NUMBER_NOT_FINITE/);

// Header contract: order independent, additive optional allowed, missing/duplicate rejected.
assert.deepStrictEqual(Array.from(context.schemaValidateHeaders('Settings', ['value','key','future'])), ['value','key','future']);
assert.throws(() => context.schemaValidateHeaders('Settings', ['key']), /SCHEMA_MISSING_REQUIRED_HEADER/);
function headerSheet(headers) {
  return { getLastColumn: () => headers.length, getRange: () => ({ getValues: () => [headers.slice()] }) };
}
context.getSheet = () => headerSheet(['key','value','value']); context._sheetHeadersExecutionCache = {};
assert.throws(() => context.getSheetHeaders('Settings'), /Header duplikat/);

// Single/batch write uses the safe boundary once and preserves value types.
let written;
const writeSheet = {
  getLastColumn: () => 3, getLastRow: () => 1,
  getRange(row, col, rows) {
    if (row === 1) return { getValues: () => [['key','value','keterangan']] };
    return { getNumRows: () => rows, setValues: matrix => { written = matrix; } };
  }
};
context.getSheet = () => writeSheet; context._sheetHeadersExecutionCache = {};
context.appendRowsObj('Settings', [{ key:'A', value:'=x', keterangan:'ok' }, { key:'B', value:0, keterangan:false }]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(written)), [['A',"'=x",'ok'],['B',0,false]]);
context.appendRowObj('Settings', { key:'C', value:'@x', keterangan:'one' });
assert.strictEqual(written[0][1], "'@x");

// Duplicate primary ID fails closed; exactly one match updates exactly one row.
function updateFixture(matchCount) {
  let updateMatrix = null;
  const matches = Array.from({ length: matchCount }, (_, i) => ({ getRow: () => i + 2 }));
  return {
    sheet: {
      getLastColumn: () => 3, getLastRow: () => Math.max(2, matchCount + 1),
      getRange(row, col, rows, columns) {
        if (row === 1) return { getValues: () => [['key','value','keterangan']] };
        if (col === 1 && row === 2 && columns === 1) return { createTextFinder: () => ({ matchEntireCell() { return this; }, findAll: () => matches }) };
        return { getValues: () => [['A','old','note']], setValues: value => { updateMatrix = value; } };
      }
    },
    updated: () => updateMatrix
  };
}
let fixture = updateFixture(2); context.getSheet = () => fixture.sheet; context._sheetHeadersExecutionCache = {};
assert.throws(() => context.updateRowById('Settings','key','A',{value:'new'}), /DATA_DUPLICATE_PRIMARY_ID/);
fixture = updateFixture(1); context.getSheet = () => fixture.sheet; context._sheetHeadersExecutionCache = {};
assert.strictEqual(context.updateRowById('Settings','key','A',{value:'=new'}), true);
assert.strictEqual(fixture.updated()[0][1], "'=new");

// Canonical parsers distinguish empty/zero and reject ambiguous or malformed values.
assert.strictEqual(context.sheetParseInteger('0', { min:0 }), 0);
assert.strictEqual(context.sheetParseInteger('', { min:0 }), null);
assert.strictEqual(context.sheetParseInteger('12x', {}), null);
assert.strictEqual(context.sheetParseInteger('1.2', {}), null);
assert.strictEqual(context.sheetParseDecimal('-6.71', { min:-90, max:90 }), -6.71);
assert.strictEqual(context.sheetParseDecimal('1e3', {}), null);
assert.strictEqual(context.sheetParseBoolean('true', {}), true);
assert.strictEqual(context.sheetParseBoolean('yes', {}), null);
assert.strictEqual(context.sheetParseEnum(' selesai ', ['SELESAI','BATAL'], { uppercase:true }), 'SELESAI');
assert.strictEqual(context.sheetParseEnum('other', ['SELESAI'], { uppercase:true }), null);
assert.strictEqual(context.sheetParseId('ADR_ab-1', /^ADR_[A-Za-z0-9_-]+$/, 20), 'ADR_ab-1');
assert.strictEqual(context.sheetParseId('=bad', undefined, 20), null);
assert.strictEqual(context.sheetParseDate('2024-02-29', {}), '2024-02-29');
assert.strictEqual(context.sheetParseDate('2023-02-29', {}), null);
assert.strictEqual(context.sheetParseDate('2026-01-01 24:00:00', {}), null);

// Direct production write paths must use the centralized helpers.
const addressSource = fs.readFileSync('backend/Address.gs','utf8');
const promoSource = fs.readFileSync('backend/Promo.gs','utf8');
assert.doesNotMatch(addressSource, /\.setValue\s*\(/);
assert.doesNotMatch(promoSource, /\.appendRow\s*\(/);
assert.doesNotMatch(promoSource, /\.setValues\s*\(/);

console.log('data-schema-safety-harness: all assertions passed');

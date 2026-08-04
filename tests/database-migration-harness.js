const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

class Range {
  constructor(sheet, row, col, rows, cols) {
    this.sheet = sheet; this.row = row; this.col = col; this.rows = rows; this.cols = cols;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const source = this.sheet.values[this.row - 1 + r] || [];
      out.push(source.slice(this.col - 1, this.col - 1 + this.cols));
    }
    return out;
  }
  setValues(matrix) {
    this.sheet.writes++;
    for (let r = 0; r < matrix.length; r++) {
      const rowIndex = this.row - 1 + r;
      if (!this.sheet.values[rowIndex]) this.sheet.values[rowIndex] = [];
      for (let c = 0; c < matrix[r].length; c++) {
        this.sheet.values[rowIndex][this.col - 1 + c] = matrix[r][c];
      }
    }
    return this;
  }
}

class Sheet {
  constructor(name, values) { this.name = name; this.values = values || []; this.writes = 0; this.frozen = 0; }
  getLastColumn() { return this.values.length ? Math.max(0, ...this.values.map(row => row.length)) : 0; }
  getRange(row, col, rows = 1, cols = 1) { return new Range(this, row, col, rows, cols); }
  getFrozenRows() { return this.frozen; }
  setFrozenRows(value) { if (this.frozen !== value) this.writes++; this.frozen = value; }
}

class Spreadsheet {
  constructor(sheets) { this.sheets = sheets || {}; }
  getSheetByName(name) { return this.sheets[name] || null; }
  insertSheet(name) {
    if (this.sheets[name]) throw new Error('duplicate sheet');
    return (this.sheets[name] = new Sheet(name));
  }
}

const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync('backend/DatabaseMigration.gs', 'utf8'), context, { filename: 'backend/DatabaseMigration.gs' });

const defs = [
  ['Settings', ['key', 'value', 'keterangan'], [['OTP_VALID_MINUTES', '30', 'Masa berlaku OTP']]],
  ['Orders', ['order_id', 'status', 'commit_status'], null],
  ['NewSheet', ['id', 'nama'], [['ROW-1', 'Seed']]]
];
const ss = new Spreadsheet({
  Settings: new Sheet('Settings', [['key', 'value'], ['OTP_VALID_MINUTES', '30']]),
  Orders: new Sheet('Orders', [['order_id', 'status', 'custom_operator_column'], ['SJ1', 'MENUNGGU', 'keep']])
});

let report = context.databaseMigrateSchema_(ss, defs);
assert.deepStrictEqual(Array.from(report.created_sheets), ['NewSheet']);
assert.deepStrictEqual(Array.from(report.added_columns), ['Settings.keterangan', 'Orders.commit_status']);
assert.deepStrictEqual(Array.from(report.preserved_unknown_columns), ['Orders.custom_operator_column']);
assert.strictEqual(report.seeded_rows, 1, 'defaults only seed a new/empty sheet');
assert.deepStrictEqual(ss.sheets.Settings.values[1].slice(0, 2), ['OTP_VALID_MINUTES', '30'], 'existing setting was overwritten');
assert.strictEqual(ss.sheets.Orders.values[1][2], 'keep', 'custom column data was overwritten');
assert.deepStrictEqual(ss.sheets.NewSheet.values, [['id', 'nama'], ['ROW-1', 'Seed']]);

const writesAfterFirstRun = Object.values(ss.sheets).reduce((sum, sheet) => sum + sheet.writes, 0);
report = context.databaseMigrateSchema_(ss, defs);
const writesAfterSecondRun = Object.values(ss.sheets).reduce((sum, sheet) => sum + sheet.writes, 0);
assert.strictEqual(writesAfterSecondRun, writesAfterFirstRun, 'second run must not write again');
assert.strictEqual(report.added_columns.length, 0);
assert.strictEqual(report.created_sheets.length, 0);
assert.strictEqual(report.seeded_rows, 0);

const invalid = new Spreadsheet({ Bad: new Sheet('Bad', [['id', 'id']]) });
assert.throws(
  () => context.databaseMigrateSchema_(invalid, [['Bad', ['id'], null], ['Later', ['id'], null]]),
  /DATABASE_EXISTING_DUPLICATE_HEADER:Bad:id/
);
assert.strictEqual(invalid.getSheetByName('Later'), null, 'preflight failure must happen before any write');

assert.throws(
  () => context.databaseMigrateSchema_(new Spreadsheet(), [['Dup', ['id', 'id'], null]]),
  /DATABASE_SCHEMA_DUPLICATE_HEADER:Dup:id/
);
assert.throws(
  () => context.databaseMigrateSchema_(new Spreadsheet(), [['BadSeed', ['id', 'nama'], [['ONLY-ID']]]]),
  /DATABASE_SCHEMA_DEFAULT_WIDTH:BadSeed:2/
);

const source = fs.readFileSync('backend/DatabaseMigration.gs', 'utf8');
assert(source.includes('function migrateDatabase()'));
assert(!source.includes('1UFjNbX3uNP1cY6bGjsj7h2_NnJvn5w24iHAXm1f3qJY'), 'hard-coded production spreadsheet id leaked into migration');
assert(source.includes('dataHandbookSync_(ss, true)'), 'Handbook is not synchronized by the single runner');

// The canonical Setup definitions are fully consumable by the one runner and
// include every field previously spread across structural migration files.
vm.runInContext(fs.readFileSync('backend/Setup.gs', 'utf8'), context, { filename: 'backend/Setup.gs' });
const fullInstall = new Spreadsheet();
const fullReport = context.databaseMigrateSchema_(fullInstall, context.SHEET_DEFS);
assert.strictEqual(fullReport.created_sheets.length, context.SHEET_DEFS.length);
for (const [sheetName, requiredHeaders] of Object.entries({
  Sessions: ['otp_failed_attempts', 'otp_locked_at'],
  Orders: ['client_request_id', 'transaction_status', 'cancel_reason'],
  PromoCodes: ['diskon_produk_kelipatan', 'required_addon_ids', 'diskon_addon_kelipatan'],
  OrderItems: ['variant_id', 'order_item_ref'],
  PointHistory: ['event_code', 'event_snapshot_json'],
  Reviews: ['request_fingerprint', 'updated_at']
})) {
  const headers = fullInstall.sheets[sheetName].values[0];
  for (const header of requiredHeaders) assert(headers.includes(header), `${sheetName}.${header} missing`);
}

console.log('database-migration-harness: all assertions passed');

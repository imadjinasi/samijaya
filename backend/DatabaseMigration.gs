/**
 * DatabaseMigration.gs
 *
 * Satu entry point untuk seluruh perubahan STRUKTUR Spreadsheet Samijaya.
 * Jalankan migrateDatabase() setelah membuat backup workbook.
 *
 * Batas aman:
 * - membuat sheet yang belum ada;
 * - menginisialisasi sheet kosong;
 * - menambahkan header yang belum ada di kolom paling kanan;
 * - tidak menghapus, memindahkan, atau menimpa header/data existing;
 * - mempertahankan kolom tambahan milik operator;
 * - aman dijalankan ulang (idempotent).
 *
 * Backfill atau koreksi ROW lama sengaja tidak dijalankan di sini. Migration
 * data seperti legacy OrderItems tetap membutuhkan audit dan approval khusus.
 */
var DATABASE_MIGRATION_VERSION = '2026-08-07.1';

function migrateDatabase() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID belum diset');
  if (!SHEET_DEFS || !SHEET_DEFS.length) throw new Error('SHEET_DEFS tidak tersedia');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('DATABASE_MIGRATION_BUSY');

  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var report = databaseMigrateSchema_(ss, SHEET_DEFS);

    // Handbook memakai spreadsheet handle yang sama sehingga struktur dan
    // dokumentasi selalu sinkron dalam satu eksekusi operator.
    if (typeof dataHandbookSync_ === 'function') {
      report.handbook = dataHandbookSync_(ss, true);
    }

    Logger.log(JSON.stringify(report));
    return report;
  } finally {
    lock.releaseLock();
  }
}

/** Internal agar dapat diuji tanpa membuka Spreadsheet produksi. */
function databaseMigrateSchema_(ss, sheetDefs) {
  databaseValidateDefinitions_(sheetDefs);
  var plan = databaseBuildSchemaPlan_(ss, sheetDefs);
  var report = {
    version: DATABASE_MIGRATION_VERSION,
    created_sheets: [],
    initialized_sheets: [],
    added_columns: [],
    unchanged_sheets: [],
    preserved_unknown_columns: [],
    seeded_rows: 0,
    handbook: null
  };

  // Seluruh workbook sudah dipreflight sebelum write pertama dilakukan.
  for (var i = 0; i < plan.length; i++) {
    var item = plan[i];
    var sheet = item.sheet;
    var changed = false;

    if (item.create) {
      sheet = ss.insertSheet(item.name);
      sheet.getRange(1, 1, 1, item.expected_headers.length).setValues([item.expected_headers]);
      report.created_sheets.push(item.name);
      changed = true;
    } else if (item.initialize) {
      sheet.getRange(1, 1, 1, item.expected_headers.length).setValues([item.expected_headers]);
      report.initialized_sheets.push(item.name);
      changed = true;
    } else if (item.missing_headers.length) {
      sheet.getRange(1, item.existing_headers.length + 1, 1, item.missing_headers.length)
        .setValues([item.missing_headers]);
      for (var h = 0; h < item.missing_headers.length; h++) {
        report.added_columns.push(item.name + '.' + item.missing_headers[h]);
      }
      changed = true;
    } else {
      report.unchanged_sheets.push(item.name);
    }

    if ((item.create || item.initialize) && item.defaults && item.defaults.length) {
      sheet.getRange(2, 1, item.defaults.length, item.expected_headers.length)
        .setValues(item.defaults);
      report.seeded_rows += item.defaults.length;
    }

    if (item.unknown_headers.length) {
      for (var u = 0; u < item.unknown_headers.length; u++) {
        report.preserved_unknown_columns.push(item.name + '.' + item.unknown_headers[u]);
      }
    }

    var frozenRows = typeof sheet.getFrozenRows === 'function' ? sheet.getFrozenRows() : 0;
    if (changed || frozenRows < 1) sheet.setFrozenRows(1);
  }

  return report;
}

/** Preflight read-only: duplicate/blank headers abort sebelum ada perubahan. */
function databaseBuildSchemaPlan_(ss, sheetDefs) {
  var plan = [];
  for (var i = 0; i < sheetDefs.length; i++) {
    var definition = sheetDefs[i];
    var name = definition[0];
    var expected = definition[1].slice();
    var defaults = definition[2] || null;
    var sheet = ss.getSheetByName(name);
    var existing = [];

    if (sheet && sheet.getLastColumn() > 0) {
      existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
        .map(function(value) { return String(value == null ? '' : value).trim(); });
      databaseValidateExistingHeaders_(name, existing);
    }

    var missing = [];
    var unknown = [];
    for (var e = 0; e < expected.length; e++) {
      if (existing.indexOf(expected[e]) === -1) missing.push(expected[e]);
    }
    for (var a = 0; a < existing.length; a++) {
      if (existing[a] && expected.indexOf(existing[a]) === -1) unknown.push(existing[a]);
    }

    plan.push({
      name: name,
      sheet: sheet,
      create: !sheet,
      initialize: !!sheet && existing.length === 0,
      expected_headers: expected,
      existing_headers: existing,
      missing_headers: missing,
      unknown_headers: unknown,
      defaults: defaults
    });
  }
  return plan;
}

function databaseValidateDefinitions_(sheetDefs) {
  var sheetNames = {};
  for (var i = 0; i < sheetDefs.length; i++) {
    var definition = sheetDefs[i];
    var name = String(definition && definition[0] || '').trim();
    var headers = definition && definition[1];
    if (!name || !headers || !headers.length) throw new Error('DATABASE_SCHEMA_DEFINITION_INVALID:' + name);
    if (sheetNames[name]) throw new Error('DATABASE_SCHEMA_DUPLICATE_SHEET:' + name);
    sheetNames[name] = true;

    var seen = {};
    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h] == null ? '' : headers[h]).trim();
      if (!header) throw new Error('DATABASE_SCHEMA_BLANK_HEADER:' + name + ':' + (h + 1));
      if (seen[header]) throw new Error('DATABASE_SCHEMA_DUPLICATE_HEADER:' + name + ':' + header);
      seen[header] = true;
    }

    var defaults = definition[2] || [];
    for (var r = 0; r < defaults.length; r++) {
      if (!defaults[r] || defaults[r].length !== headers.length) {
        throw new Error('DATABASE_SCHEMA_DEFAULT_WIDTH:' + name + ':' + (r + 2));
      }
    }
  }
}

function databaseValidateExistingHeaders_(sheetName, headers) {
  var seen = {};
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    if (!header) throw new Error('DATABASE_EXISTING_BLANK_HEADER:' + sheetName + ':' + (i + 1));
    if (seen[header]) throw new Error('DATABASE_EXISTING_DUPLICATE_HEADER:' + sheetName + ':' + header);
    seen[header] = true;
  }
}

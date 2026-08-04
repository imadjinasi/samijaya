/**
 * Util.gs — Samijaya MVP
 *
 * Helper generik yang dipakai semua modul .gs lain.
 * Tidak ada dependency eksternal.
 */

// ============================================================
// Module-scope cache untuk Spreadsheet instance
// ============================================================
var _ss = null;
var _sheetHeadersExecutionCache = {};

// ============================================================
// 1. getSS()
// ============================================================
/**
 * Buka spreadsheet dari Script Property SPREADSHEET_ID.
 * Instance di-cache di variabel _ss supaya tidak buka berulang
 * dalam satu eksekusi.
 *
 * @return {SpreadsheetApp.Spreadsheet}
 */
function getSS() {
  if (_ss) return _ss;

  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!ssId) {
    throw new Error('Script Property SPREADSHEET_ID belum di-set. Buka Project Settings → Script Properties → tambahkan SPREADSHEET_ID.');
  }

  _ss = SpreadsheetApp.openById(ssId);
  return _ss;
}

// ============================================================
// 2. getSheet(name)
// ============================================================
/**
 * Ambil Sheet object berdasarkan nama.
 * Throw error kalau sheet tidak ditemukan.
 *
 * @param  {string} name — nama sheet
 * @return {SpreadsheetApp.Sheet}
 */
function getSheet(name) {
  var sheet = getSS().getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet "' + name + '" tidak ditemukan di spreadsheet.');
  }
  return sheet;
}

// ============================================================
// 3. readAll(sheetName)
// ============================================================
/**
 * Baca seluruh isi sheet sekali dengan getDataRange().getValues().
 * Baris pertama = header → jadi key object.
 * Return array of object. Sheet kosong / hanya header → [].
 *
 * @param  {string} sheetName
 * @return {Object[]}
 */
function readAll(sheetName) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();

  // Sheet kosong total (tidak ada baris sama sekali)
  if (data.length === 0) return [];

  var headers = data[0];

  // Hanya header, tidak ada baris data
  if (data.length === 1) return [];

  var stringFields = ['no_hp', 'otp', 'value', 'nama_snapshot', 'catatan_customer', 'catatan_admin', 'alamat_snapshot', 'chat_id', 'lat', 'lng', 'nama_penerima', 'no_hp_penerima', 'variant_id', 'variant_nama_snapshot', 'nama_axis_snapshot', 'nama_varian', 'nama_axis', 'nama_addon', 'nama_addon_snapshot', 'order_item_ref', 'addon_id', 'promo_id', 'promo_code', 'kode', 'usage_id', 'hari_berlaku', 'jam_mulai', 'jam_berakhir', 'metode_kirim', 'required_product_ids', 'required_kategori_ids', 'required_addon_ids', 'required_match_mode', 'whitelist_member_ids', 'diskon_subtotal_tipe', 'diskon_produk_ids', 'diskon_produk_tipe', 'diskon_addon_ids', 'diskon_addon_tipe', 'diskon_ongkir_tipe', 'used_date', 'promo_snapshot_json'];

  var result = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var key = headers[j];
      var val = data[i][j];
      if (stringFields.indexOf(key) !== -1) {
        val = val == null ? '' : String(val);
      }
      row[key] = val;
    }
    result.push(row);
  }
  return result;
}

// ============================================================
// 4. appendRowObj(sheetName, obj)
// ============================================================
/**
 * Ambil header dari baris pertama sheet, susun array nilai
 * sesuai urutan header (kolom yang tidak ada di obj → '').
 * Append pakai sheet.appendRow().
 *
 * @param  {string} sheetName
 * @param  {Object} obj
 * @return {Object} obj yang di-append
 */
function appendRowObj(sheetName, obj) {
  appendRowsObj(sheetName, [obj]);
  return obj;
}

/** Baca dan validasi header saja; cache hanya hidup selama satu execution. */
function getSheetHeaders(sheetName) {
  var sheet = getSheet(sheetName);
  var lastColumn = sheet.getLastColumn();
  var cached = _sheetHeadersExecutionCache[sheetName];
  if (cached && cached.lastColumn === lastColumn) return cached.headers.slice();
  if (lastColumn <= 0) throw new Error('Header sheet "' + sheetName + '" kosong.');
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var seen = {};
  for (var i = 0; i < headers.length; i++) {
    var header = String(headers[i] == null ? '' : headers[i]).trim();
    if (!header) throw new Error('Header kosong pada sheet "' + sheetName + '".');
    if (seen[header]) throw new Error('Header duplikat "' + header + '" pada sheet "' + sheetName + '".');
    seen[header] = true;
    headers[i] = header;
  }
  if (typeof schemaValidateHeaders === 'function') schemaValidateHeaders(sheetName, headers);
  _sheetHeadersExecutionCache[sheetName] = { lastColumn: lastColumn, headers: headers.slice() };
  return headers;
}

var _SHEET_VALUE_MARKER = '__samijaya_sheet_value__';

function sheetLiteral(value) { return { __samijaya_sheet_value__: 'LITERAL', value: String(value == null ? '' : value) }; }
function sheetJson(value) { return { __samijaya_sheet_value__: 'JSON', value: JSON.stringify(value) }; }
function sheetSerializedJson(value) {
  var text = String(value == null ? '' : value);
  JSON.parse(text);
  return { __samijaya_sheet_value__: 'JSON', value: text };
}
function sheetTrustedFormula(formula) {
  var value = String(formula == null ? '' : formula);
  if (value.charAt(0) !== '=') throw new Error('TRUSTED_FORMULA_INVALID');
  return { __samijaya_sheet_value__: 'FORMULA', value: value };
}

function sheetFormulaSafeLiteral(value) {
  var text = String(value == null ? '' : value);
  if (text.charAt(0) === "'") return text;
  return /^\s*[=+\-@]/.test(text) ? "'" + text : text;
}

function sheetPrepareValue(value) {
  if (value && typeof value === 'object' && value[_SHEET_VALUE_MARKER]) {
    if (value[_SHEET_VALUE_MARKER] === 'FORMULA') return String(value.value);
    if (value[_SHEET_VALUE_MARKER] === 'JSON') {
      JSON.parse(String(value.value));
      return sheetFormulaSafeLiteral(String(value.value));
    }
    if (value[_SHEET_VALUE_MARKER] === 'LITERAL') return sheetFormulaSafeLiteral(value.value);
    throw new Error('SHEET_VALUE_MARKER_INVALID');
  }
  if (typeof value === 'string') return sheetFormulaSafeLiteral(value);
  if (typeof value === 'number') {
    if (!isFinite(value)) throw new Error('SHEET_NUMBER_NOT_FINITE');
    return value;
  }
  if (typeof value === 'boolean' || value instanceof Date || value === null || value === undefined) return value == null ? '' : value;
  throw new Error('SHEET_VALUE_TYPE_INVALID');
}

function sheetPrepareFieldValue(sheetName, header, value) {
  var spec = typeof schemaGet === 'function' ? schemaGet(sheetName) : null;
  if (spec && spec.json && spec.json.indexOf(header) !== -1 && value !== '' && value !== null && value !== undefined &&
      !(value && typeof value === 'object' && value[_SHEET_VALUE_MARKER])) {
    return sheetPrepareValue(sheetSerializedJson(value));
  }
  return sheetPrepareValue(value);
}

/** Append banyak object dengan satu setValues(). */
function appendRowsObj(sheetName, objects) {
  if (!Array.isArray(objects)) throw new Error('objects harus berupa array.');
  if (objects.length === 0) return { first_row: 0, written: 0 };
  var sheet = getSheet(sheetName);
  var headers = getSheetHeaders(sheetName);
  var matrix = [];
  for (var i = 0; i < objects.length; i++) {
    var obj = objects[i];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Row object tidak valid.');
    var row = [];
    for (var h = 0; h < headers.length; h++) {
      row.push(Object.prototype.hasOwnProperty.call(obj, headers[h]) ? sheetPrepareFieldValue(sheetName, headers[h], obj[headers[h]]) : '');
    }
    matrix.push(row);
  }
  var firstRow = sheet.getLastRow() + 1;
  var range = sheet.getRange(firstRow, 1, matrix.length, headers.length);
  if (range.getNumRows && range.getNumRows() !== objects.length) throw new Error('Jumlah row target tidak sesuai.');
  range.setValues(matrix);
  return { first_row: firstRow, written: objects.length };
}

/** Legacy row tanpa commit_status tetap dianggap committed. */
function isOrderCommittedRow(order) {
  var status = String((order || {}).commit_status || '').trim().toUpperCase();
  return status === '' || status === 'COMMITTED';
}

/** Nilai teks transaksi yang aman ditulis ke Google Sheets sebagai literal. */
function transactionSafeText(value, maxLength) {
  var text = String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (text.length > maxLength) return null;
  if (text.charAt(0) !== "'" && /^\s*[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

function sheetParseInteger(value, options) {
  options = options || {};
  if (value === '' || value === null || value === undefined) return options.allowEmpty ? null : null;
  if (typeof value === 'string' && !/^-?(?:0|[1-9]\d*)$/.test(value.trim())) return null;
  var parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || !isFinite(parsed)) return null;
  if (options.min !== undefined && parsed < options.min) return null;
  if (options.max !== undefined && parsed > options.max) return null;
  return parsed;
}

function sheetParseDecimal(value, options) {
  options = options || {};
  if (value === '' || value === null || value === undefined) return options.allowEmpty ? null : null;
  if (typeof value === 'string' && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim())) return null;
  var parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!isFinite(parsed)) return null;
  if (options.min !== undefined && parsed < options.min) return null;
  if (options.max !== undefined && parsed > options.max) return null;
  return parsed;
}

function sheetParseBoolean(value, options) {
  options = options || {};
  if (value === '' || value === null || value === undefined) return options.allowEmpty ? null : null;
  if (value === true || value === false) return value;
  var text = String(value).trim().toLowerCase();
  if (text === 'true' || text === '1' || (options.activeAliases && (text === 'aktif' || text === 'ya'))) return true;
  if (text === 'false' || text === '0' || (options.activeAliases && (text === 'nonaktif' || text === 'tidak'))) return false;
  return null;
}

function sheetParseEnum(value, allowed, options) {
  options = options || {};
  if (value === '' || value === null || value === undefined) return options.allowEmpty ? '' : null;
  var text = String(value).trim();
  if (options.uppercase) text = text.toUpperCase();
  if (options.lowercase) text = text.toLowerCase();
  return allowed.indexOf(text) === -1 ? null : text;
}

function sheetParseId(value, pattern, maxLength) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  var text = String(value).trim();
  if (!text || text.length > (maxLength || 80) || !(pattern || /^[A-Za-z0-9_-]+$/).test(text)) return null;
  return text;
}

function sheetParseDate(value, options) {
  options = options || {};
  if (value === '' || value === null || value === undefined) return options.allowEmpty ? null : null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  var text = String(value).trim();
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  var y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  var probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  if (match[4] && (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6] || 0) > 59)) return null;
  return text;
}

function transactionNormalizeOrderId(value) {
  var id = String(value == null ? '' : value).trim().toUpperCase();
  return /^SJ\d{9}$/.test(id) || /^O[A-Z0-9_-]{1,48}$/.test(id) ? id : '';
}

function transactionStrictInteger(value, min, max) {
  return sheetParseInteger(value, { min: min, max: max });
}

function schemaFindDuplicatePrimaryIds(sheetName) {
  var spec = typeof schemaGet === 'function' ? schemaGet(sheetName) : null;
  if (!spec || !spec.primary_id || !spec.unique) return [];
  var rows = readAll(sheetName), seen = {}, duplicates = [];
  for (var i = 0; i < rows.length; i++) {
    var id = String(rows[i][spec.primary_id] == null ? '' : rows[i][spec.primary_id]).trim();
    if (!id) continue;
    if (seen[id] && duplicates.indexOf(id) === -1) duplicates.push(id);
    seen[id] = true;
  }
  return duplicates;
}

// ============================================================
// 5. updateRowById(sheetName, idColumnName, idValue, patchObj)
// ============================================================
/**
 * Cari baris di mana kolom idColumnName == idValue.
 * Update kolom-kolom yang ada di patchObj, biarkan kolom lain.
 * Gunakan setValues() satu baris sekaligus.
 *
 * @param  {string} sheetName
 * @param  {string} idColumnName  — nama kolom ID
 * @param  {*}      idValue       — nilai yang dicari
 * @param  {Object} patchObj      — kolom-kolom yang di-update
 * @return {boolean} true jika ketemu & diupdate, false jika tidak ketemu
 */
function updateRowById(sheetName, idColumnName, idValue, patchObj) {
  var sheet = getSheet(sheetName);
  var headers = getSheetHeaders(sheetName);

  // Cari index kolom ID
  var idColIdx = -1;
  for (var h = 0; h < headers.length; h++) {
    if (headers[h] === idColumnName) {
      idColIdx = h;
      break;
    }
  }
  if (idColIdx === -1) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;
  var idRange = sheet.getRange(2, idColIdx + 1, lastRow - 1, 1);
  var finder = idRange.createTextFinder(String(idValue)).matchEntireCell(true);
  var matches = typeof finder.findAll === 'function' ? finder.findAll() : (function() { var one = finder.findNext(); return one ? [one] : []; })();
  if (!matches || matches.length === 0) return false;
  if (matches.length > 1) throw new Error('DATA_DUPLICATE_PRIMARY_ID:' + sheetName + ':' + idColumnName);
  var rowNumber = matches[0].getRow();
  var rowRange = sheet.getRange(rowNumber, 1, 1, headers.length);
  var updatedRow = rowRange.getValues()[0];
  for (var j = 0; j < headers.length; j++) {
    if (Object.prototype.hasOwnProperty.call(patchObj, headers[j])) updatedRow[j] = sheetPrepareFieldValue(sheetName, headers[j], patchObj[headers[j]]);
  }
  rowRange.setValues([updatedRow]);
  return true;
}

// ============================================================
// 6. getSetting(key)
// ============================================================
/**
 * Baca setting dari sheet Settings.
 * Caching via CacheService.getScriptCache(), prefix "setting_", TTL 300s.
 * Return value sebagai string, atau null jika key tidak ada.
 *
 * @param  {string} key
 * @return {string|null}
 */
var _SETTING_CACHE_PREFIX = 'setting_';
var _SETTING_CACHE_TTL = 300; // 5 menit
var _SETTING_NULL_SENTINEL = '__NULL__';

function getSetting(key) {
  var cacheKey = _SETTING_CACHE_PREFIX + key;

  // Cek cache dulu; kegagalan cache harus jatuh kembali ke source sheet.
  var cacheRead = cacheReadBestEffort(cacheKey, {
    operation: 'getSetting', event_code: 'SETTING_CACHE_READ_FAILED'
  });
  var cached = cacheRead.value;
  if (cached !== null) {
    return cached === _SETTING_NULL_SENTINEL ? null : cached;
  }

  // Cache miss → baca sheet
  var rows = readAll('Settings');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i]['key'] === key) {
      var value = String(rows[i]['value']);
      cacheWriteBestEffort(cacheKey, value, _SETTING_CACHE_TTL, {
        operation: 'getSetting', event_code: 'SETTING_CACHE_WRITE_FAILED'
      });
      return value;
    }
  }

  // Key tidak ada di sheet → cache sentinel supaya tidak baca sheet terus
  cacheWriteBestEffort(cacheKey, _SETTING_NULL_SENTINEL, _SETTING_CACHE_TTL, {
    operation: 'getSetting', event_code: 'SETTING_CACHE_WRITE_FAILED'
  });
  return null;
}

// ============================================================
// 7. clearSettingsCache()
// ============================================================
/**
 * Hapus semua cache setting.
 * Baca semua key di sheet Settings, remove satu-satu dari cache.
 */
function clearSettingsCache() {
  var rows = readAll('Settings');
  var keys = [];
  for (var i = 0; i < rows.length; i++) keys.push(String(rows[i].key || ''));
  return cacheInvalidateSettings(keys, { operation: 'clearSettingsCache' });
}

// Cache data aplikasi. Security/dedup/rate-limit state sengaja tidak terdaftar.
var _APP_CACHE_REGISTRY = {
  catalog: { key: 'catalog_cache', ttl: 300 },
  setting: { prefix: 'setting_', ttl: 300 }
};
var _CATALOG_REVISION_PROPERTY = 'CATALOG_CACHE_REVISION';

function cacheReadBestEffort(cacheKey, metadata) {
  try {
    return { ok: true, value: CacheService.getScriptCache().get(String(cacheKey)) };
  } catch (_) {
    try {
      safeLog('ERROR', metadata && metadata.event_code || 'CACHE_READ_FAILED', '', {
        operation: metadata && metadata.operation || 'cacheReadBestEffort',
        stage: 'cache_read', error_code: 'CACHE_UNAVAILABLE', retryable: true
      });
    } catch (_) {}
    return { ok: false, value: null };
  }
}

function cacheWriteBestEffort(cacheKey, value, ttlSeconds, metadata) {
  try {
    CacheService.getScriptCache().put(String(cacheKey), String(value), Number(ttlSeconds));
    return true;
  } catch (_) {
    try {
      safeLog('ERROR', metadata && metadata.event_code || 'CACHE_WRITE_FAILED', '', {
        operation: metadata && metadata.operation || 'cacheWriteBestEffort',
        stage: 'cache_write', error_code: 'CACHE_UNAVAILABLE', retryable: true
      });
    } catch (_) {}
    return false;
  }
}

function cacheInvalidateKey(cacheKey, metadata) {
  try {
    CacheService.getScriptCache().remove(String(cacheKey));
    return true;
  } catch (_) {
    safeLog('ERROR', 'CACHE_INVALIDATION_FAILED', '', {
      operation: metadata && metadata.operation || 'cacheInvalidateKey',
      stage: 'remove', error_code: 'CACHE_UNAVAILABLE', retryable: true
    });
    return false;
  }
}

function cacheInvalidateSetting(key, metadata) {
  var normalized = String(key == null ? '' : key).trim();
  if (!normalized) return false;
  return cacheInvalidateKey(_APP_CACHE_REGISTRY.setting.prefix + normalized, metadata || { operation: 'cacheInvalidateSetting' });
}

function cacheInvalidateSettings(keys, metadata) {
  var ok = true;
  var seen = {};
  for (var i = 0; i < (keys || []).length; i++) {
    var key = String(keys[i] || '').trim();
    if (!key || seen[key]) continue;
    seen[key] = true;
    if (!cacheInvalidateSetting(key, metadata)) ok = false;
  }
  return ok;
}

function catalogGetRevision() {
  try {
    var value = String(PropertiesService.getScriptProperties().getProperty(_CATALOG_REVISION_PROPERTY) || '');
    return /^[A-Za-z0-9._-]{1,80}$/.test(value) ? value : 'legacy';
  } catch (_) {
    return 'legacy';
  }
}

function catalogAdvanceRevision(operation) {
  var revision = String(Date.now()) + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 12);
  try {
    PropertiesService.getScriptProperties().setProperty(_CATALOG_REVISION_PROPERTY, revision);
    return revision;
  } catch (_) {
    safeLog('ERROR', 'CATALOG_REVISION_UPDATE_FAILED', '', {
      operation: operation || 'catalogAdvanceRevision', stage: 'property_write',
      error_code: 'REVISION_WRITE_FAILED', retryable: true
    });
    return '';
  }
}

/** Dipanggil hanya setelah mutation sumber katalog berhasil commit. */
function invalidateCatalogAfterMutation(operation) {
  var cacheOk = cacheInvalidateKey(_APP_CACHE_REGISTRY.catalog.key, { operation: operation || 'catalogMutation' });
  var revision = catalogAdvanceRevision(operation || 'catalogMutation');
  return { ok: cacheOk && !!revision, cache_invalidated: cacheOk, revision: revision };
}

/** Scope /clearcache: hanya cache data aplikasi, tidak menyentuh state keamanan/browser. */
function clearApplicationDataCaches() {
  var settingsOk = true;
  try { settingsOk = clearSettingsCache(); } catch (_) {
    settingsOk = false;
    safeLog('ERROR', 'CACHE_INVALIDATION_FAILED', '', { operation: 'clearApplicationDataCaches', stage: 'settings', error_code: 'CACHE_CLEAR_FAILED', retryable: true });
  }
  var catalogOk = cacheInvalidateKey(_APP_CACHE_REGISTRY.catalog.key, { operation: 'clearApplicationDataCaches' });
  // Manual cache clear also changes the opaque revision so browsers discover it on refresh.
  var revision = catalogAdvanceRevision('clearApplicationDataCaches');
  return { ok: settingsOk && catalogOk && !!revision, settings: settingsOk, catalog: catalogOk, revision: revision };
}

// ============================================================
// 8. log(tipe, refId, pesan, detail)
// ============================================================
/**
 * Tulis baris ke sheet Logs.
 * Header: timestamp | tipe | ref_id | pesan | detail_json
 *
 * @param {string}      tipe   — NOTIF/ACTIVITY/ERROR
 * @param {string}      refId  — referensi ID
 * @param {string}      pesan  — pesan log
 * @param {Object|null} detail — object detail atau null
 */
function log(tipe, refId, pesan, detail) {
  // Compatibility shim: production callers do not get to persist arbitrary detail.
  return safeLog(tipe, pesan || 'LEGACY_LOG', refId, { operation: 'legacyLog', stage: 'compat' });
}

/**
 * Tulis log operasional dengan metadata allowlist. Helper ini sengaja tidak
 * menerima/menyalin payload arbitrer agar secret dan PII tidak ikut tersimpan.
 */
function safeLog(tipe, eventCode, refId, metadata) {
  var allowedKeys = {
    function: true, operation: true,
    stage: true,
    code: true, error_code: true,
    method: true,
    http_status: true,
    telegram_error_code: true,
    correlation_id: true,
    entity_ref: true,
    retryable: true,
    count: true,
    chunk: true,
    total: true,
    order_id: true
  };
  var safeMeta = {};
  try {
    if (metadata && typeof metadata === 'object') {
      for (var key in allowedKeys) {
        if (!allowedKeys.hasOwnProperty(key) || !metadata.hasOwnProperty(key)) continue;
        var value = metadata[key];
        if (value === null || value === undefined) continue;
        if (typeof value === 'number' || typeof value === 'boolean') {
          safeMeta[key] = value;
        } else {
          safeMeta[key] = operationalRedact(value).substring(0, 120);
        }
      }
    }
  } catch (_) {
    safeMeta = { code: 'REDACTION_FAILED' };
  }

  var event = String(eventCode || 'UNKNOWN_EVENT').replace(/[^A-Z0-9_\-]/gi, '_').substring(0, 80);
  var safeRef = '';
  var candidateRef = String(refId || '');
  if (/^SJ\d{9}$/.test(candidateRef)) safeRef = candidateRef;
  else safeRef = event;

  var detailJson = '';
  try { detailJson = Object.keys(safeMeta).length ? JSON.stringify(safeMeta) : ''; }
  catch (_) { detailJson = '{"error_code":"LOG_SERIALIZATION_FAILED"}'; }
  try {
    appendRowObj('Logs', {
      timestamp: nowJkt(), tipe: operationalSeverity(tipe), ref_id: safeRef,
      pesan: event, detail_json: detailJson
    });
    return true;
  } catch (_) {
    // Deliberately no recursive logger call.
    return false;
  }
}

function operationalSeverity(value) {
  var severity = String(value || 'ERROR').trim().toUpperCase();
  if (severity === 'NOTIF' || severity === 'ACTIVITY' || severity === 'ERROR') return severity;
  if (severity === 'DEBUG' || severity === 'INFO') return 'ACTIVITY';
  return 'ERROR';
}

function operationalRedact(value) {
  var text = String(value == null ? '' : value);
  text = text.replace(/https:\/\/api\.telegram\.org\/bot[^\/\s]+/gi, 'https://api.telegram.org/bot[REDACTED]');
  text = text.replace(/\b\d{6}\b/g, '[REDACTED]');
  text = text.replace(/\b(?:62|0)8\d{7,12}\b/g, '[REDACTED]');
  text = text.replace(/(token|otp|password|secret|capability|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
  return text;
}

function createServerCorrelationId() {
  try { return 'c_' + Utilities.getUuid().replace(/-/g, '').toLowerCase().substring(0, 24); }
  catch (_) { return 'c_' + String(Date.now()) + '_' + String(Math.random()).substring(2, 10); }
}

function isValidServerCorrelationId(value) { return /^c_[a-z0-9]{16,40}$/.test(String(value || '')); }
function isValidOperationalCorrelationId(value) {
  return isValidServerCorrelationId(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(String(value || ''));
}
function correlationReference(value) {
  var text = String(value || '');
  return text.length >= 8 ? text.substring(text.length - 8).toUpperCase() : '';
}

function attachErrorCorrelation(result, correlationId) {
  if (!result || result.ok !== false || !isValidOperationalCorrelationId(correlationId)) return result;
  result.correlation_id = correlationId;
  if (result.code === 'INTERNAL' || /RECOVERY_REQUIRED/.test(String(result.code || ''))) result.reference_code = correlationReference(correlationId);
  return result;
}

// ============================================================
// 9. jsonResponse(obj)
// ============================================================
/**
 * Buat JSON response untuk ContentService.
 *
 * @param  {Object} obj
 * @return {ContentService.TextOutput}
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 10. sha256(str)
// ============================================================
/**
 * SHA-256 hex lowercase.
 * Logika identik dengan hashPassword() di Setup.gs.
 *
 * @param  {string} str
 * @return {string} hex digest lowercase
 */
function sha256(str) {
  var rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    str,
    Utilities.Charset.UTF_8
  );

  var hex = '';
  for (var i = 0; i < rawHash.length; i++) {
    var byte = rawHash[i];
    if (byte < 0) byte += 256;
    var h = byte.toString(16);
    if (h.length === 1) h = '0' + h;
    hex += h;
  }

  return hex;
}

// ============================================================
// 11. uuid()
// ============================================================
/**
 * Generate UUID v4 via Utilities.getUuid().
 *
 * @return {string}
 */
function uuid() {
  return Utilities.getUuid();
}

// ============================================================
// 12. genId(prefix)
// ============================================================
/**
 * Generate ID dengan format: prefix + "_" + timestamp base36 + 2 char random.
 * Contoh: "MBR_l4x2k1p_ab"
 *
 * @param  {string} prefix
 * @return {string}
 */
function genId(prefix) {
  var ts = Date.now().toString(36);
  var rand = Math.random().toString(36).slice(2, 4);
  return prefix + '_' + ts + '_' + rand;
}

// ============================================================
// TEST
// ============================================================
/**
 * Fungsi test untuk memverifikasi Util.gs berjalan benar.
 * Jalankan dari Apps Script editor.
 */
function testUtil() {
  // 1. Test getSetting
  var otpMinutes = getSetting('OTP_VALID_MINUTES');
  Logger.log('getSetting("OTP_VALID_MINUTES") = ' + otpMinutes);

  // 2. Test log
  log('ACTIVITY', 'test_util', 'Test Util.gs dijalankan', { waktu: new Date().toISOString() });
  Logger.log('log() berhasil — cek sheet Logs.');

  // 3. Test genId (harus beda)
  var id1 = genId('TST');
  var id2 = genId('TST');
  Logger.log('genId #1: ' + id1);
  Logger.log('genId #2: ' + id2);
  Logger.log('ID berbeda: ' + (id1 !== id2));
}

// ============================================================
// 13. nowJkt()
// ============================================================
/**
 * Return timestamp saat ini dalam zona waktu Asia/Jakarta.
 * Format: yyyy-MM-dd HH:mm:ss
 *
 * @return {string}
 */
function nowJkt() {
  return Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
}

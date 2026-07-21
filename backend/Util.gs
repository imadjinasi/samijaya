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

  var stringFields = ['no_hp', 'otp', 'value', 'nama_snapshot', 'catatan_customer', 'catatan_admin', 'alamat_snapshot', 'chat_id', 'lat', 'lng', 'nama_penerima', 'no_hp_penerima', 'variant_id', 'variant_nama_snapshot', 'nama_axis_snapshot', 'nama_varian', 'nama_axis', 'nama_addon', 'nama_addon_snapshot', 'order_item_ref', 'addon_id', 'promo_id', 'promo_code', 'kode', 'usage_id', 'hari_berlaku', 'jam_mulai', 'jam_berakhir', 'metode_kirim', 'required_product_ids', 'required_kategori_ids', 'required_match_mode', 'whitelist_member_ids', 'diskon_subtotal_tipe', 'diskon_produk_ids', 'diskon_produk_tipe', 'diskon_ongkir_tipe', 'used_date', 'promo_snapshot_json'];

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
  _sheetHeadersExecutionCache[sheetName] = { lastColumn: lastColumn, headers: headers.slice() };
  return headers;
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
      row.push(Object.prototype.hasOwnProperty.call(obj, headers[h]) ? obj[headers[h]] : '');
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
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

function transactionNormalizeOrderId(value) {
  var id = String(value == null ? '' : value).trim().toUpperCase();
  return /^SJ\d{9}$/.test(id) || /^O[A-Z0-9_-]{1,48}$/.test(id) ? id : '';
}

function transactionStrictInteger(value, min, max) {
  if (typeof value === 'string' && !/^-?\d+$/.test(value.trim())) return null;
  var number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return null;
  return number;
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
  var match = idRange.createTextFinder(String(idValue)).matchEntireCell(true).findNext();
  if (!match) return false;
  var rowNumber = match.getRow();
  var rowRange = sheet.getRange(rowNumber, 1, 1, headers.length);
  var updatedRow = rowRange.getValues()[0];
  for (var j = 0; j < headers.length; j++) {
    if (Object.prototype.hasOwnProperty.call(patchObj, headers[j])) updatedRow[j] = patchObj[headers[j]];
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
  var cache = CacheService.getScriptCache();
  var cacheKey = _SETTING_CACHE_PREFIX + key;

  // Cek cache dulu
  var cached = cache.get(cacheKey);
  if (cached !== null) {
    return cached === _SETTING_NULL_SENTINEL ? null : cached;
  }

  // Cache miss → baca sheet
  var rows = readAll('Settings');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i]['key'] === key) {
      var value = String(rows[i]['value']);
      cache.put(cacheKey, value, _SETTING_CACHE_TTL);
      return value;
    }
  }

  // Key tidak ada di sheet → cache sentinel supaya tidak baca sheet terus
  cache.put(cacheKey, _SETTING_NULL_SENTINEL, _SETTING_CACHE_TTL);
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
  var cache = CacheService.getScriptCache();
  var rows = readAll('Settings');

  var cacheKeys = [];
  for (var i = 0; i < rows.length; i++) {
    cacheKeys.push(_SETTING_CACHE_PREFIX + rows[i]['key']);
  }

  if (cacheKeys.length > 0) {
    cache.removeAll(cacheKeys);
  }
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
  appendRowObj('Logs', {
    timestamp: nowJkt(),
    tipe:        tipe,
    ref_id:      refId,
    pesan:       pesan,
    detail_json: detail ? JSON.stringify(detail) : ''
  });
}

/**
 * Tulis log operasional dengan metadata allowlist. Helper ini sengaja tidak
 * menerima/menyalin payload arbitrer agar secret dan PII tidak ikut tersimpan.
 */
function safeLog(tipe, eventCode, refId, metadata) {
  var allowedKeys = {
    function: true,
    stage: true,
    code: true,
    method: true,
    http_status: true,
    telegram_error_code: true,
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
          safeMeta[key] = String(value).substring(0, 120);
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

  appendRowObj('Logs', {
    timestamp: nowJkt(),
    tipe: String(tipe || 'ERROR').substring(0, 20),
    ref_id: safeRef,
    pesan: event,
    detail_json: Object.keys(safeMeta).length ? JSON.stringify(safeMeta) : ''
  });
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

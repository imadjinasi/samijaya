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

  var result = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
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
  var sheet = getSheet(sheetName);
  var headers = sheet.getDataRange().getValues()[0];

  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var key = headers[i];
    row.push(obj.hasOwnProperty(key) ? obj[key] : '');
  }

  sheet.appendRow(row);
  return obj;
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
  var data = sheet.getDataRange().getValues();

  if (data.length === 0) return false;

  var headers = data[0];

  // Cari index kolom ID
  var idColIdx = -1;
  for (var h = 0; h < headers.length; h++) {
    if (headers[h] === idColumnName) {
      idColIdx = h;
      break;
    }
  }
  if (idColIdx === -1) return false;

  // Cari baris dengan idValue
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idColIdx]) === String(idValue)) {
      // Patch kolom yang ada di patchObj
      var updatedRow = data[i].slice(); // copy
      for (var j = 0; j < headers.length; j++) {
        if (patchObj.hasOwnProperty(headers[j])) {
          updatedRow[j] = patchObj[headers[j]];
        }
      }
      // Update satu baris sekaligus (baris i+1 karena 1-indexed di sheet)
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([updatedRow]);
      return true;
    }
  }

  return false;
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
    timestamp: Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss"),
    tipe:        tipe,
    ref_id:      refId,
    pesan:       pesan,
    detail_json: detail ? JSON.stringify(detail) : ''
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

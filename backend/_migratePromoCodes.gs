/**
 * Migration Fase 7.11-A: PromoCodes, PromoUsage, dan snapshot promo Orders.
 * Idempotent: aman dijalankan lebih dari satu kali dan tidak menimpa data lama.
 */
function migratePromoCodes_7_11_A() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') ||
    '1UFjNbX3uNP1cY6bGjsj7h2_NnJvn5w24iHAXm1f3qJY';
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var migrationLog = [];

  var promoHeaders = [
    'promo_id', 'kode', 'nama', 'deskripsi', 'catatan_customer', 'aktif',
    'mulai_at', 'berakhir_at', 'hari_berlaku', 'jam_mulai', 'jam_berakhir',
    'min_subtotal', 'max_subtotal', 'metode_kirim', 'required_product_ids',
    'required_kategori_ids', 'required_match_mode', 'member_baru_only',
    'whitelist_member_ids', 'bisa_dengan_poin', 'limit_total',
    'limit_per_member', 'limit_harian', 'diskon_subtotal_tipe',
    'diskon_subtotal_nilai', 'diskon_subtotal_max', 'diskon_produk_ids',
    'diskon_produk_tipe', 'diskon_produk_nilai', 'diskon_produk_max',
    'diskon_ongkir_tipe', 'diskon_ongkir_nilai', 'diskon_ongkir_max',
    'bonus_poin', 'multiplier_poin', 'created_at', 'updated_at'
  ];
  var usageHeaders = [
    'usage_id', 'promo_id', 'promo_code', 'order_id', 'member_id', 'status',
    'used_at', 'used_date', 'cancelled_at', 'promo_diskon_subtotal',
    'promo_diskon_produk', 'promo_diskon_ongkir', 'promo_diskon_total',
    'promo_bonus_poin', 'promo_multiplier_poin'
  ];
  var orderColumns = [
    'promo_id', 'promo_code', 'promo_nama', 'ongkir_sebelum_promo',
    'promo_diskon_subtotal', 'promo_diskon_produk', 'promo_diskon_ongkir',
    'promo_diskon_total', 'promo_bonus_poin', 'promo_multiplier_poin',
    'poin_earn_dasar', 'poin_earn_final', 'promo_snapshot_json'
  ];

  _migratePromoCreateSheet(ss, 'PromoCodes', promoHeaders, migrationLog);
  _migratePromoCreateSheet(ss, 'PromoUsage', usageHeaders, migrationLog);

  var orders = ss.getSheetByName('Orders');
  if (!orders || orders.getLastColumn() === 0) {
    migrationLog.push('Sheet Orders tidak ditemukan atau tidak memiliki header - ABORT kolom Orders.');
  } else {
    var lastColumn = orders.getLastColumn();
    var currentHeaders = orders.getRange(1, 1, 1, lastColumn).getValues()[0];
    for (var i = 0; i < orderColumns.length; i++) {
      if (currentHeaders.indexOf(orderColumns[i]) === -1) {
        lastColumn++;
        orders.getRange(1, lastColumn).setValue(orderColumns[i]);
        currentHeaders.push(orderColumns[i]);
        migrationLog.push('Kolom Orders.' + orderColumns[i] + ' ditambahkan.');
      } else {
        migrationLog.push('Kolom Orders.' + orderColumns[i] + ' sudah ada - skip.');
      }
    }
  }

  Logger.log(migrationLog.join('\n'));
  return migrationLog;
}

function _migratePromoCreateSheet(ss, sheetName, headers, migrationLog) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    migrationLog.push('Sheet ' + sheetName + ' dibuat dengan ' + headers.length + ' kolom.');
    return;
  }

  var lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    migrationLog.push('Header sheet ' + sheetName + ' dibuat.');
    return;
  }

  var currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (currentHeaders.indexOf(headers[i]) === -1) {
      lastColumn++;
      sheet.getRange(1, lastColumn).setValue(headers[i]);
      currentHeaders.push(headers[i]);
      migrationLog.push('Kolom ' + sheetName + '.' + headers[i] + ' ditambahkan.');
    }
  }
  migrationLog.push('Sheet ' + sheetName + ' sudah ada - header diverifikasi.');
}

/**
 * Migration: Add new Add-on and Multiplier columns to PromoCodes.
 * Idempotent: aman dijalankan lebih dari satu kali dan tidak menimpa data lama.
 */
function migratePromoAddons() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') ||
    '1UFjNbX3uNP1cY6bGjsj7h2_NnJvn5w24iHAXm1f3qJY';
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var migrationLog = [];

  var addonHeaders = [
    'diskon_produk_kelipatan',
    'required_addon_ids',
    'diskon_addon_ids',
    'diskon_addon_tipe',
    'diskon_addon_nilai',
    'diskon_addon_max',
    'diskon_addon_kelipatan'
  ];

  var sheet = ss.getSheetByName('PromoCodes');
  if (!sheet) {
    migrationLog.push('Sheet PromoCodes tidak ditemukan. Migration abort.');
  } else {
    var lastColumn = sheet.getLastColumn();
    if (lastColumn > 0) {
      var currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
      for (var i = 0; i < addonHeaders.length; i++) {
        if (currentHeaders.indexOf(addonHeaders[i]) === -1) {
          lastColumn++;
          sheet.getRange(1, lastColumn).setValue(addonHeaders[i]);
          currentHeaders.push(addonHeaders[i]);
          migrationLog.push('Kolom PromoCodes.' + addonHeaders[i] + ' ditambahkan.');
        } else {
          migrationLog.push('Kolom PromoCodes.' + addonHeaders[i] + ' sudah ada - skip.');
        }
      }
    }
  }

  Logger.log(migrationLog.join('\n'));
  return migrationLog;
}

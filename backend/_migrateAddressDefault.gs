/**
 * Migration Fix-D2a: tambah kolom is_default di MemberAddresses.
 * Jalankan sekali dari editor GAS. Setelah sukses, file boleh dihapus.
 * Idempotent.
 */
function migrateAddressDefault() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID); // konstanta existing
  var sheet = ss.getSheetByName('MemberAddresses');
  if (!sheet) return ['✗ Sheet MemberAddresses tidak ditemukan'];
  
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var log = [];
  
  if (headers.indexOf('is_default') === -1) {
    lastCol++;
    sheet.getRange(1, lastCol).setValue('is_default');
    log.push('✓ Kolom is_default ditambah di MemberAddresses (kolom ke-' + lastCol + ').');
    
    // Set semua existing address is_default = 0 (kosong dianggap 0)
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var range = sheet.getRange(2, lastCol, lastRow - 1, 1);
      var vals = [];
      for (var i = 0; i < lastRow - 1; i++) vals.push([0]);
      range.setValues(vals);
      log.push('✓ ' + (lastRow - 1) + ' alamat existing di-set is_default=0.');
    }
  } else {
    log.push('⚠ Kolom is_default sudah ada — skip.');
  }
  
  Logger.log(log.join('\n'));
  return log;
}

/**
 * Migration untuk Fase 7.8 Sistem Varian.
 * Jalankan sekali dari editor GAS. Setelah sukses, file ini boleh dihapus.
 * 
 * Yang dilakukan:
 * 1. Bikin sheet ProductVariants baru dengan header.
 * 2. Tambah 3 kolom baru di sheet OrderItems (di paling kanan): variant_id, variant_nama_snapshot, nama_axis_snapshot.
 * 
 * Aman untuk dijalankan >1 kali (idempotent — cek dulu sebelum tambah).
 */
function migrateVariants_7_8_A() {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!ssId) {
    var errLog = ['✗ SPREADSHEET_ID tidak ditemukan di Script Properties — ABORT.'];
    Logger.log(errLog.join('\n'));
    return errLog;
  }
  var ss = SpreadsheetApp.openById(ssId);
  var log = [];
  
  // === 1. Bikin sheet ProductVariants kalau belum ada ===
  var pv = ss.getSheetByName('ProductVariants');
  if (!pv) {
    pv = ss.insertSheet('ProductVariants');
    var headers = [
      'variant_id',
      'product_id',
      'nama_axis',
      'nama_varian',
      'harga',
      'urutan',
      'aktif',
      'created_at',
      'updated_at'
    ];
    pv.getRange(1, 1, 1, headers.length).setValues([headers]);
    pv.setFrozenRows(1);
    log.push('✓ Sheet ProductVariants dibuat dengan ' + headers.length + ' kolom.');
  } else {
    log.push('⚠ Sheet ProductVariants sudah ada — skip.');
  }
  
  // === 2. Tambah kolom baru di OrderItems ===
  var oi = ss.getSheetByName('OrderItems');
  if (!oi) {
    log.push('✗ Sheet OrderItems tidak ditemukan — ABORT.');
    Logger.log(log.join('\n'));
    return log;
  }
  
  var newCols = ['variant_id', 'variant_nama_snapshot', 'nama_axis_snapshot'];
  var lastCol = oi.getLastColumn();
  
  // Jika sheet kosong, lastCol = 0, kembalikan saja. Idealnya ada header minimal 1.
  if (lastCol === 0) {
    log.push('✗ Sheet OrderItems kosong (tidak ada header) — ABORT.');
    Logger.log(log.join('\n'));
    return log;
  }
  
  var currentHeaders = oi.getRange(1, 1, 1, lastCol).getValues()[0];
  
  newCols.forEach(function(colName) {
    if (currentHeaders.indexOf(colName) === -1) {
      lastCol++;
      oi.getRange(1, lastCol).setValue(colName);
      log.push('✓ Kolom "' + colName + '" ditambah di OrderItems (kolom ke-' + lastCol + ').');
    } else {
      log.push('⚠ Kolom "' + colName + '" sudah ada di OrderItems — skip.');
    }
  });
  
  Logger.log(log.join('\n'));
  return log;
}

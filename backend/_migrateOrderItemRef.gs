/**
 * Tambah kolom order_item_ref ke OrderItems dan backfill data lama.
 *
 * Format ref harus sama dengan orderCreateOrder: order_id + '_' + index,
 * dengan index zero-based berdasarkan urutan item dalam order di sheet.
 * Aman dijalankan lebih dari sekali: ref yang sudah ada tidak ditimpa.
 */
function migrateOrderItemRef() {
  var spreadsheetId = '1UFjNbX3uNP1cY6bGjsj7h2_NnJvn5w24iHAXm1f3qJY';
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var log = [];
  var sheet = ss.getSheetByName('OrderItems');

  if (!sheet) {
    log.push('Sheet OrderItems tidak ditemukan - ABORT.');
    Logger.log(log.join('\n'));
    return log;
  }

  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    log.push('Sheet OrderItems tidak memiliki header - ABORT.');
    Logger.log(log.join('\n'));
    return log;
  }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var orderIdCol = headers.indexOf('order_id');
  if (orderIdCol === -1) {
    log.push('Kolom order_id tidak ditemukan di OrderItems - ABORT.');
    Logger.log(log.join('\n'));
    return log;
  }

  var refCol = headers.indexOf('order_item_ref');
  if (refCol === -1) {
    lastCol++;
    sheet.getRange(1, lastCol).setValue('order_item_ref');
    refCol = lastCol - 1;
    log.push('Kolom order_item_ref ditambahkan di kolom ke-' + lastCol + '.');
  } else {
    log.push('Kolom order_item_ref sudah ada - skip penambahan kolom.');
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    log.push('Tidak ada baris OrderItems untuk di-backfill.');
    log.push('Total backfill: 0 baris.');
    Logger.log(log.join('\n'));
    return log;
  }

  var rowCount = lastRow - 1;
  var values = sheet.getRange(2, 1, rowCount, lastCol).getValues();
  var counters = {};
  var refValues = [];
  var backfilled = 0;

  for (var i = 0; i < values.length; i++) {
    var orderId = String(values[i][orderIdCol] || '');
    var counterKey = '$' + orderId;
    var itemIndex = counters.hasOwnProperty(counterKey) ? counters[counterKey] : 0;
    var existingRef = String(values[i][refCol] || '');

    if (!existingRef && orderId) {
      existingRef = orderId + '_' + itemIndex;
      backfilled++;
    }

    refValues.push([existingRef]);
    counters[counterKey] = itemIndex + 1;
  }

  sheet.getRange(2, refCol + 1, rowCount, 1).setValues(refValues);
  log.push('Total backfill: ' + backfilled + ' baris.');
  Logger.log(log.join('\n'));
  return log;
}

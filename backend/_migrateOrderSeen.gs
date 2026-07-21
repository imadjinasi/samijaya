/**
 * Tambah timestamp update status Orders dan timestamp terakhir melihat order Members.
 * Idempotent: kolom/nilai yang sudah ada tidak ditimpa.
 */
function migrateOrderSeen() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') ||
    '1UFjNbX3uNP1cY6bGjsj7h2_NnJvn5w24iHAXm1f3qJY';
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var migrationLog = [];
  var migrationNow = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');

  var ordersResult = _migrateOrderSeenOrders(ss, migrationNow, migrationLog);
  var membersResult = _migrateOrderSeenMembers(ss, migrationNow, migrationLog);

  migrationLog.push('Total backfill Orders: ' + ordersResult + ' baris.');
  migrationLog.push('Total backfill Members: ' + membersResult + ' baris.');
  Logger.log(migrationLog.join('\n'));
  return migrationLog;
}

function _migrateOrderSeenOrders(ss, migrationNow, migrationLog) {
  var sheet = ss.getSheetByName('Orders');
  if (!sheet) {
    migrationLog.push('Sheet Orders tidak ditemukan - skip.');
    return 0;
  }

  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    migrationLog.push('Sheet Orders tidak memiliki header - skip.');
    return 0;
  }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var statusUpdatedCol = headers.indexOf('status_updated_at');
  if (statusUpdatedCol === -1) {
    lastCol++;
    sheet.getRange(1, lastCol).setValue('status_updated_at');
    statusUpdatedCol = lastCol - 1;
    headers.push('status_updated_at');
    migrationLog.push('Kolom Orders.status_updated_at ditambahkan.');
  } else {
    migrationLog.push('Kolom Orders.status_updated_at sudah ada.');
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var updatedAtCol = headers.indexOf('updated_at');
  var createdAtCol = headers.indexOf('created_at');
  var output = [];
  var count = 0;

  for (var i = 0; i < values.length; i++) {
    var current = values[i][statusUpdatedCol];
    if (!current) {
      current = (updatedAtCol !== -1 && values[i][updatedAtCol]) ||
        (createdAtCol !== -1 && values[i][createdAtCol]) || migrationNow;
      count++;
    }
    output.push([current]);
  }

  sheet.getRange(2, statusUpdatedCol + 1, output.length, 1).setValues(output);
  return count;
}

function _migrateOrderSeenMembers(ss, migrationNow, migrationLog) {
  var sheet = ss.getSheetByName('Members');
  if (!sheet) {
    migrationLog.push('Sheet Members tidak ditemukan - skip.');
    return 0;
  }

  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    migrationLog.push('Sheet Members tidak memiliki header - skip.');
    return 0;
  }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var lastSeenCol = headers.indexOf('last_seen_orders_at');
  if (lastSeenCol === -1) {
    lastCol++;
    sheet.getRange(1, lastCol).setValue('last_seen_orders_at');
    lastSeenCol = lastCol - 1;
    migrationLog.push('Kolom Members.last_seen_orders_at ditambahkan.');
  } else {
    migrationLog.push('Kolom Members.last_seen_orders_at sudah ada.');
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var output = [];
  var count = 0;
  for (var i = 0; i < values.length; i++) {
    var current = values[i][lastSeenCol];
    if (!current) {
      current = migrationNow;
      count++;
    }
    output.push([current]);
  }

  sheet.getRange(2, lastSeenCol + 1, output.length, 1).setValues(output);
  return count;
}

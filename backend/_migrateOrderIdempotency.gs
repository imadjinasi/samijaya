/** Migration manual Fase 8-A2. Additive, idempotent, tanpa backfill. */
function migrateOrderIdempotency_8_A2() {
  var officialFallbackId = '1UFjNbX3uNP1cY6bGjsj7h2_NnJvn5w24iHAXm1f3qJY';
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || officialFallbackId;
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName('Orders');
  var migrationLog = [];
  if (!sheet || sheet.getLastColumn() <= 0) {
    migrationLog.push('Orders tidak ditemukan atau tidak memiliki header - ABORT.');
    Logger.log(migrationLog.join('\n'));
    return migrationLog;
  }
  var lastColumn = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var requiredBase = ['order_id', 'member_id', 'status', 'created_at'];
  for (var r = 0; r < requiredBase.length; r++) {
    if (headers.indexOf(requiredBase[r]) === -1) {
      migrationLog.push('Header dasar Orders tidak lengkap - ABORT.');
      Logger.log(migrationLog.join('\n'));
      return migrationLog;
    }
  }
  var additions = ['client_request_id', 'request_fingerprint', 'commit_status', 'commit_stage', 'commit_error_code', 'commit_snapshot_json', 'committed_at'];
  for (var i = 0; i < additions.length; i++) {
    if (headers.indexOf(additions[i]) !== -1) {
      migrationLog.push(additions[i] + ': sudah ada.');
      continue;
    }
    lastColumn++;
    sheet.getRange(1, lastColumn).setValue(additions[i]);
    headers.push(additions[i]);
    migrationLog.push(additions[i] + ': ditambahkan.');
  }
  Logger.log(migrationLog.join('\n'));
  return migrationLog;
}

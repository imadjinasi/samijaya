/**
 * Migration manual Fase 8-A1: menambah counter kegagalan dan lock timestamp OTP.
 * Additive dan idempotent; tidak membaca atau mengubah row Sessions existing.
 */
function migrateSessionsSecurity_8_A1() {
  var fallbackSpreadsheetId = '1UFjNbX3uNP1cY6bGjsj7h2_NnJvn5w24iHAXm1f3qJY';
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || fallbackSpreadsheetId;
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName('Sessions');
  var migrationLog = [];
  if (!sheet || sheet.getLastColumn() === 0) {
    migrationLog.push('Sessions tidak ditemukan atau tidak memiliki header - ABORT.');
    Logger.log(migrationLog.join('\n'));
    return migrationLog;
  }

  var lastColumn = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return String(value).trim();
  });
  var required = ['token', 'no_hp', 'member_id', 'otp', 'otp_expires_at', 'otp_used', 'session_expires_at', 'created_at'];
  for (var i = 0; i < required.length; i++) {
    if (headers.indexOf(required[i]) === -1) {
      migrationLog.push('Header dasar Sessions tidak lengkap - ABORT.');
      Logger.log(migrationLog.join('\n'));
      return migrationLog;
    }
  }

  var additions = ['otp_failed_attempts', 'otp_locked_at'];
  for (var a = 0; a < additions.length; a++) {
    if (headers.indexOf(additions[a]) !== -1) {
      migrationLog.push(additions[a] + ': sudah ada.');
      continue;
    }
    lastColumn++;
    sheet.getRange(1, lastColumn).setValue(additions[a]);
    headers.push(additions[a]);
    migrationLog.push(additions[a] + ': ditambahkan.');
  }
  Logger.log(migrationLog.join('\n'));
  return migrationLog;
}

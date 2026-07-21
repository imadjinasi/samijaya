/** Migration additive/idempotent Fase 8-A3. Jalankan manual sebelum deploy kode. */
function migrateTransactionHardening_8_A3() {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!ssId) throw new Error('SPREADSHEET_ID belum diset');
  var ss = SpreadsheetApp.openById(ssId);
  var specs = [
    { sheet: 'Orders', base: ['order_id','member_id','status','commit_status'], add: [
      'transaction_status','transaction_stage','transaction_error_code','transaction_snapshot_json',
      'cancelled_at','cancelled_by','cancel_reason'
    ] },
    { sheet: 'PointHistory', base: ['id','member_id','order_id','tipe','jumlah','saldo_akhir'], add: [
      'event_code','saldo_sebelum','event_status','event_snapshot_json'
    ] },
    { sheet: 'Reviews', base: ['review_id','order_id','member_id','rating','ulasan','status','created_at'], add: [
      'request_fingerprint','updated_at'
    ] }
  ];
  var result = [];
  for (var i = 0; i < specs.length; i++) {
    var spec = specs[i];
    var sheet = ss.getSheetByName(spec.sheet);
    if (!sheet) throw new Error('Sheet ' + spec.sheet + ' tidak ditemukan');
    var lastColumn = sheet.getLastColumn();
    var headers = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String) : [];
    for (var b = 0; b < spec.base.length; b++) if (headers.indexOf(spec.base[b]) === -1) throw new Error('Schema dasar ' + spec.sheet + ' tidak valid: ' + spec.base[b]);
    for (var a = 0; a < spec.add.length; a++) {
      if (headers.indexOf(spec.add[a]) !== -1) continue;
      sheet.getRange(1, headers.length + 1).setValue(spec.add[a]);
      headers.push(spec.add[a]);
      result.push(spec.sheet + '.' + spec.add[a]);
    }
  }
  Logger.log(JSON.stringify({ added: result }));
  return { added: result };
}

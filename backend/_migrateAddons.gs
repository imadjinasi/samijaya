/**
 * Migration Fase 7.8-D1: bikin sheet ProductAddons & OrderItemAddons.
 * Jalankan sekali dari editor GAS. Idempotent. Hapus setelah sukses.
 */
function migrateAddons() {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '1UFjNbX3uNP1cY6bGjsj7h2_NnJvn5w24iHAXm1f3qJY';
  var ss = SpreadsheetApp.openById(ssId);
  var log = [];
  
  // === Sheet ProductAddons ===
  var pa = ss.getSheetByName('ProductAddons');
  if (!pa) {
    pa = ss.insertSheet('ProductAddons');
    var h1 = ['addon_id','product_id','nama_addon','harga','urutan','aktif','created_at','updated_at'];
    pa.getRange(1,1,1,h1.length).setValues([h1]);
    pa.setFrozenRows(1);
    log.push('✓ Sheet ProductAddons dibuat (' + h1.length + ' kolom).');
  } else {
    log.push('⚠ Sheet ProductAddons sudah ada — skip.');
  }
  
  // === Sheet OrderItemAddons ===
  var oia = ss.getSheetByName('OrderItemAddons');
  if (!oia) {
    oia = ss.insertSheet('OrderItemAddons');
    var h2 = ['id','order_id','order_item_ref','addon_id','nama_addon_snapshot','harga_snapshot','created_at'];
    oia.getRange(1,1,1,h2.length).setValues([h2]);
    oia.setFrozenRows(1);
    log.push('✓ Sheet OrderItemAddons dibuat (' + h2.length + ' kolom).');
  } else {
    log.push('⚠ Sheet OrderItemAddons sudah ada — skip.');
  }
  
  Logger.log(log.join('\n'));
  return log;
}

/** Idempotent: membuat Campaigns bila belum ada dan tidak menimpa data. */
function migrateCampaigns() {
  var headers = ['campaign_id', 'judul', 'deskripsi', 'gambar_file_id', 'gambar_url',
    'link_url', 'kode_promo', 'tanggal_mulai', 'tanggal_selesai', 'urutan', 'status'];
  var sheet = getSS().getSheetByName('Campaigns');
  if (!sheet) {
    sheet = getSS().insertSheet('Campaigns');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    Logger.log('Sheet Campaigns dibuat.');
    return;
  }
  var existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(existing[i] || '').trim() !== headers[i]) {
      throw new Error('Header Campaigns tidak sesuai; data tidak diubah. Harus: ' + headers.join(' | '));
    }
  }
  Logger.log('Sheet Campaigns sudah ada dan header sesuai.');
}

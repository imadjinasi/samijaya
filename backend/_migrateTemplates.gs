/**
 * Migration Fix-B1: insert/update template WA per-metode & penerima ke sheet MessageTemplates.
 * Jalankan sekali dari editor GAS. Setelah sukses, file boleh dihapus.
 * Idempotent: kalau kode sudah ada, UPDATE teksnya; kalau belum, INSERT row baru.
 */
function migrateTemplates_FixB1() {
  var templates = [
    ['ORDER_DIPROSES', 'Halo Kak {NAMA}, pesanan {ORDER_ID} sedang kami siapkan ya. Mohon ditunggu sebentar 🙏'],
    ['ORDER_SIAP', 'Halo Kak {NAMA}, pesanan {ORDER_ID} sudah siap ya!'],
    ['ORDER_SIAP_AMBIL', 'Halo Kak {NAMA}, pesanan {ORDER_ID} sudah siap! Silakan diambil di {CABANG} ya ☕'],
    ['ORDER_SIAP_DIANTAR', 'Halo Kak {NAMA}, pesanan {ORDER_ID} sudah siap dan segera kami antar ke lokasi Anda ya 🛵'],
    ['ORDER_SIAP_OJOL', 'Halo Kak {NAMA}, pesanan {ORDER_ID} sudah siap! Kami sedang menyiapkan ojol untuk pengantaran ya 📱'],
    ['ORDER_SELESAI', 'Halo Kak {NAMA}, pesanan {ORDER_ID} sudah selesai. Anda mendapat {POINT} poin. Terima kasih sudah ngopi di Samijaya 🙏'],
    ['ORDER_BATAL', 'Halo Kak {NAMA}, mohon maaf pesanan {ORDER_ID} dibatalkan. Kalau ada pertanyaan, silakan balas pesan ini ya 🙏'],
    ['ORDER_DIPROSES_PENERIMA', 'Halo Kak {NAMA}, ada pesanan atas nama {NAMA_PEMESAN} ({ORDER_ID}) yang sedang kami siapkan untuk diantar ke Anda ya 🙏'],
    ['ORDER_SIAP_DIANTAR_PENERIMA', 'Halo Kak {NAMA}, ada pesanan atas nama {NAMA_PEMESAN} ({ORDER_ID}) yang sudah siap dan segera kami antar ke Anda ya 🛵'],
    ['ORDER_SIAP_OJOL_PENERIMA', 'Halo Kak {NAMA}, ada pesanan atas nama {NAMA_PEMESAN} ({ORDER_ID}) yang sudah siap! Sedang kami siapkan ojol untuk diantar ke Anda ya 📱'],
    ['ORDER_SELESAI_PENERIMA', 'Halo Kak {NAMA}, pesanan atas nama {NAMA_PEMESAN} ({ORDER_ID}) sudah selesai. Terima kasih ya 🙏'],
    ['ORDER_BATAL_PENERIMA', 'Halo Kak {NAMA}, mohon maaf pesanan atas nama {NAMA_PEMESAN} ({ORDER_ID}) dibatalkan 🙏']
  ];
  
  var ss = getSS();
  var sheet = ss.getSheetByName('MessageTemplates');
  if (!sheet) return ['✗ Sheet MessageTemplates tidak ditemukan'];
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var kodeCol = headers.indexOf('kode');
  var teksCol = headers.indexOf('isi');
  
  if (kodeCol === -1 || teksCol === -1) {
    return ['✗ Kolom kode/isi tidak ditemukan. Header: ' + headers.join(', ')];
  }
  
  var log = [];
  // Build index kode existing
  var existingRows = {};
  for (var r = 1; r < data.length; r++) {
    existingRows[String(data[r][kodeCol])] = r + 1; // row number (1-based)
  }
  
  templates.forEach(function(t) {
    var kode = t[0], teks = t[1];
    if (existingRows[kode]) {
      // UPDATE teks
      sheet.getRange(existingRows[kode], teksCol + 1).setValue(teks);
      log.push('✓ UPDATE: ' + kode);
    } else {
      // INSERT row baru
      var newRow = [];
      for (var c = 0; c < headers.length; c++) {
        if (c === kodeCol) newRow.push(kode);
        else if (c === teksCol) newRow.push(teks);
        else newRow.push(''); // kolom lain kosong (keterangan dll)
      }
      sheet.appendRow(newRow);
      log.push('✓ INSERT: ' + kode);
    }
  });
  
  Logger.log(log.join('\n'));
  return log;
}

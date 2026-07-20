/**
 * _TestReceiver.gs
 * 
 * File sementara untuk test validasi penerima order (nama_penerima & no_hp_penerima).
 * Pilih salah satu fungsi test di bawah lalu jalankan via Run (▶).
 */

function _createTestPayload() {
  // Buat payload dummy supaya lolos validasi order (diantar).
  var d = new Date();
  d.setDate(d.getDate() + 2); // pesanan H+2 agar selalu valid walau dipesan setelah jam 18:00
  var tglStr = Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd');
  
  return {
    metode_kirim: 'DIANTAR',
    alamat_snapshot: 'Jl. Test Validation 99',
    lat: -6.7, // Asumsi sekitar cirebon / sesuai coverage
    lng: 108.5,
    slot_id: 'SLT_seed01',
    tgl_antar: tglStr,
    metode_bayar: 'COD',
    pakai_poin: false,
    items: [{ product_id: 'PRD_seed01', qty: 1 }]
  };
}

function _getTestToken() {
  // Mengambil token sesi aktif pertama untuk keperluan test.
  // Pastikan Anda sudah login (ada sesi aktif) di sheet Sessions.
  var sessions = readAll('Sessions');
  for (var i = 0; i < sessions.length; i++) {
    if (new Date(sessions[i].session_expires_at) > new Date()) {
      return sessions[i].token;
    }
  }
  return 'NO_VALID_SESSION_FOUND'; 
}

function testReceiverA_valid() {
  var payload = _createTestPayload();
  payload.nama_penerima = 'Budi Santoso';
  payload.no_hp_penerima = '+62 812-3456-7890'; // harus sukses jadi valid
  
  var res = orderCreateOrder(payload, _getTestToken());
  Logger.log('Result A (Valid): ' + JSON.stringify(res, null, 2));
  return res;
}

function testReceiverB_fallback() {
  var payload = _createTestPayload();
  // Sengaja kosong untuk test fallback = data member
  payload.nama_penerima = '';
  payload.no_hp_penerima = null;
  
  var res = orderCreateOrder(payload, _getTestToken());
  Logger.log('Result B (Fallback): ' + JSON.stringify(res, null, 2));
  return res;
}

function testReceiverC_invalidPhone() {
  var payload = _createTestPayload();
  payload.nama_penerima = 'Budi Santoso';
  payload.no_hp_penerima = 'abc123';
  
  var res = orderCreateOrder(payload, _getTestToken());
  Logger.log('Result C (Invalid Phone): ' + JSON.stringify(res, null, 2));
  return res;
}

function testReceiverD_invalidName() {
  var payload = _createTestPayload();
  payload.nama_penerima = 'A'; // Panjang minimal 2 karakter (gagal)
  payload.no_hp_penerima = '081234567890';
  
  var res = orderCreateOrder(payload, _getTestToken());
  Logger.log('Result D (Invalid Name): ' + JSON.stringify(res, null, 2));
  return res;
}

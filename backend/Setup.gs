/**
 * Setup.gs — Samijaya MVP
 *
 * Dua fungsi:
 *   1. setupDatabase()  — buat 15 sheet + header + data default
 *   2. hashPassword(str) — SHA-256 hex string
 *
 * Jalankan hashPassword('passwordku') dari editor,
 * salin hasil Logger ke Settings ADMIN_PASSWORD_HASH.
 */

// ============================================================
// DEFINISI SHEET: [nama, [header], [[data default]] | null ]
// ============================================================
var SHEET_DEFS = [
  // --- 1. Settings ---
  ['Settings',
    ['key', 'value', 'keterangan'],
    [
      ['OTP_VALID_MINUTES',           '30',   'Masa berlaku OTP (menit)'],
      ['OTP_RESEND_COOLDOWN_MINUTES', '2',    'Cooldown kirim ulang OTP (menit)'],
      ['OTP_MAX_PER_DAY',             '5',    'Maks OTP per hari per no_hp'],
      ['SESSION_VALID_DAYS',          '7',    'Masa berlaku sesi (hari)'],
      ['POINT_RATE_RP',               '1000', 'Setiap sekian rupiah dapat 1 poin'],
      ['POINT_MIN_REDEEM',            '0',    'Min poin untuk redeem'],
      ['ONGKIR_PER_KM',              '1000', 'Ongkir per km (Rp)'],
      ['ONGKIR_FAKTOR_KOREKSI',      '1.3',  'Faktor koreksi jarak'],
      ['ONGKIR_RADIUS_MAX_KM',       '15',   'Radius maks delivery (km)'],
      ['MIN_ORDER_DELIVERY',          '0',    'Min order untuk delivery'],
      ['QRIS_FILE_ID',                '',     'File ID QRIS di Drive'],
      ['REKENING_BANK',               '',     'Nama bank'],
      ['REKENING_NOMOR',              '',     'Nomor rekening'],
      ['REKENING_NAMA',               '',     'Nama pemilik rekening'],
      ['TELEGRAM_BOT_TOKEN',          '',     'Token bot Telegram'],
      ['TELEGRAM_SECRET',             '',     'Secret webhook Telegram'],
      ['ADMIN_PASSWORD_HASH',         '',     'Hash SHA-256 password admin'],
      ['ADMIN_CHAT_IDS',              '',     'CSV chat_id admin Telegram'],
      ['TOKO_BUKA',                   '1',    '1=buka, 0=tutup'],
      ['NOMOR_WA_TOKO',               '',     'Nomor WhatsApp toko']
    ]
  ],

  // --- 2. Members ---
  ['Members',
    ['member_id', 'nama', 'no_hp', 'tgl_lahir', 'email', 'total_poin', 'total_belanja', 'created_at', 'status', 'last_seen_orders_at'],
    null
  ],

  // --- 3. MemberAddresses ---
  ['MemberAddresses',
    ['address_id', 'member_id', 'label', 'detail', 'latitude', 'longitude', 'created_at', 'status', 'is_default'],
    null
  ],

  // --- 4. Products ---
  ['Products',
    ['product_id', 'nama', 'harga', 'foto_file_id', 'kategori_id', 'deskripsi', 'badge_promo', 'tersedia', 'urutan', 'status'],
    [
      ['PRD_seed01', 'Americano',         18000, '', 'CAT_seed01', 'Kopi hitam klasik',           '', 1, 1, 'aktif'],
      ['PRD_seed02', 'Caffe Latte',       22000, '', 'CAT_seed01', 'Espresso dengan susu segar',  '', 1, 2, 'aktif'],
      ['PRD_seed03', 'Matcha Latte',      25000, '', 'CAT_seed02', 'Green tea latte premium',     '', 1, 3, 'aktif'],
      ['PRD_seed04', 'Thai Tea',          20000, '', 'CAT_seed02', 'Teh Thailand manis',          '', 1, 4, 'aktif'],
      ['PRD_seed05', 'Pisang Goreng Keju',15000, '', 'CAT_seed03', 'Pisang goreng crispy + keju', '', 1, 5, 'aktif']
    ]
  ],

  // --- 5. Categories ---
  ['Categories',
    ['kategori_id', 'nama', 'urutan', 'status'],
    [
      ['CAT_seed01', 'Coffee',     1, 'aktif'],
      ['CAT_seed02', 'Non Coffee', 2, 'aktif'],
      ['CAT_seed03', 'Snack',      3, 'aktif']
    ]
  ],

  // --- 6. PickupLocations ---
  ['PickupLocations',
    ['lokasi_id', 'nama', 'alamat', 'latitude', 'longitude', 'jam_buka', 'jam_tutup', 'status'],
    [
      ['LOC_seed01', 'Kaliwadas',  'Kaliwadas, Cirebon',  0, 0, '07:00', '20:00', 'aktif'],
      ['LOC_seed02', 'Karyamulya', 'Karyamulya, Cirebon', 0, 0, '08:00', '16:00', 'aktif']
    ]
  ],

  // --- 7. DeliverySlots ---
  ['DeliverySlots',
    ['slot_id', 'jam_mulai', 'jam_selesai', 'kuota', 'status'],
    [
      ['SLT_seed01', '07:00', '07:30', 5, 'aktif'],
      ['SLT_seed02', '12:30', '13:00', 5, 'aktif'],
      ['SLT_seed03', '16:00', '17:00', 5, 'aktif']
    ]
  ],

  // --- 8. Holidays ---
  ['Holidays',
    ['tanggal', 'keterangan'],
    null
  ],

  // --- 9. Orders ---
  ['Orders',
    ['order_id', 'member_id', 'nama', 'no_hp', 'tgl_antar', 'metode_kirim',
     'lokasi_pickup_id', 'address_id', 'alamat_snapshot', 'lat', 'lng',
     'jarak_km', 'ongkir', 'slot_id', 'subtotal', 'poin_dipakai', 'total',
     'metode_bayar', 'status', 'catatan_customer', 'catatan_admin',
     'created_at', 'updated_at', 'timeline_json', 'nama_penerima', 'no_hp_penerima',
     'status_updated_at', 'promo_id', 'promo_code', 'promo_nama',
     'ongkir_sebelum_promo', 'promo_diskon_subtotal', 'promo_diskon_produk',
     'promo_diskon_ongkir', 'promo_diskon_total', 'promo_bonus_poin',
     'promo_multiplier_poin', 'poin_earn_dasar', 'poin_earn_final',
     'promo_snapshot_json', 'client_request_id', 'request_fingerprint',
     'commit_status', 'commit_stage', 'commit_error_code', 'commit_snapshot_json',
     'committed_at'],
    null
  ],

  // --- 10. OrderItems ---
  ['OrderItems',
    ['order_id', 'product_id', 'nama_snapshot', 'harga_snapshot', 'qty', 'subtotal',
     'variant_id', 'variant_nama_snapshot', 'nama_axis_snapshot', 'order_item_ref'],
    null
  ],

  // --- 11. PointHistory ---
  ['PointHistory',
    ['id', 'member_id', 'order_id', 'tipe', 'jumlah', 'saldo_akhir', 'keterangan', 'created_at'],
    null
  ],

  // --- 12. Sessions ---
  ['Sessions',
    ['token', 'no_hp', 'member_id', 'otp', 'otp_expires_at', 'otp_used', 'session_expires_at', 'created_at',
     'otp_failed_attempts', 'otp_locked_at'],
    null
  ],

  // --- 13. MessageTemplates ---
  ['MessageTemplates',
    ['kode', 'isi', 'keterangan'],
    [
      ['OTP',                         'Halo {NAMA}, kode OTP Samijaya Anda: {OTP}. Berlaku 30 menit.', 'Template OTP'],
      ['ORDER_DITERIMA',              'Halo {NAMA}, pesanan {ORDER_ID} berhasil dibuat. Total: Rp{TOTAL}. Terima kasih!', 'Order diterima'],
      ['ORDER_DIPROSES',              'Halo Kak {NAMA}, pesanan {ORDER_ID} sedang kami siapkan ya. Mohon ditunggu sebentar 🙏', 'Order diproses'],
      ['ORDER_SIAP',                  'Halo Kak {NAMA}, pesanan {ORDER_ID} sudah siap ya!', 'Order siap (fallback)'],
      ['ORDER_SIAP_AMBIL',            'Halo Kak {NAMA}, pesanan {ORDER_ID} sudah siap! Silakan diambil di {CABANG} ya ☕', 'Order siap diambil'],
      ['ORDER_SIAP_DIANTAR',          'Halo Kak {NAMA}, pesanan {ORDER_ID} sudah siap dan segera kami antar ke lokasi Anda ya 🛵', 'Order siap diantar kurir'],
      ['ORDER_SIAP_OJOL',             'Halo Kak {NAMA}, pesanan {ORDER_ID} sudah siap! Kami sedang menyiapkan ojol untuk pengantaran ya 📱', 'Order siap diantar ojol'],
      ['ORDER_SELESAI',               'Halo Kak {NAMA}, pesanan {ORDER_ID} sudah selesai. Anda mendapat {POINT} poin. Terima kasih sudah ngopi di Samijaya 🙏', 'Order selesai'],
      ['ORDER_BATAL',                 'Halo Kak {NAMA}, mohon maaf pesanan {ORDER_ID} dibatalkan. Kalau ada pertanyaan, silakan balas pesan ini ya 🙏', 'Order dibatalkan'],
      ['ORDER_DIPROSES_PENERIMA',     'Halo Kak {NAMA}, ada pesanan atas nama {NAMA_PEMESAN} ({ORDER_ID}) yang sedang kami siapkan untuk diantar ke Anda ya 🙏', 'Order diproses (penerima)'],
      ['ORDER_SIAP_DIANTAR_PENERIMA', 'Halo Kak {NAMA}, ada pesanan atas nama {NAMA_PEMESAN} ({ORDER_ID}) yang sudah siap dan segera kami antar ke Anda ya 🛵', 'Order siap diantar kurir (penerima)'],
      ['ORDER_SIAP_OJOL_PENERIMA',    'Halo Kak {NAMA}, ada pesanan atas nama {NAMA_PEMESAN} ({ORDER_ID}) yang sudah siap! Sedang kami siapkan ojol untuk diantar ke Anda ya 📱', 'Order siap diantar ojol (penerima)'],
      ['ORDER_SELESAI_PENERIMA',      'Halo Kak {NAMA}, pesanan atas nama {NAMA_PEMESAN} ({ORDER_ID}) sudah selesai. Terima kasih ya 🙏', 'Order selesai (penerima)'],
      ['ORDER_BATAL_PENERIMA',        'Halo Kak {NAMA}, mohon maaf pesanan atas nama {NAMA_PEMESAN} ({ORDER_ID}) dibatalkan 🙏', 'Order dibatalkan (penerima)']
    ]
  ],

  // --- 14. Banners ---
  ['Banners',
    ['banner_id', 'judul', 'foto_file_id', 'link', 'urutan', 'status'],
    null
  ],

  // --- Campaigns ---
  ['Campaigns',
    ['campaign_id', 'judul', 'deskripsi', 'gambar_file_id', 'gambar_url', 'link_url',
     'kode_promo', 'tanggal_mulai', 'tanggal_selesai', 'urutan', 'status'],
    null
  ],

  // --- 15. Logs ---
  ['Logs',
    ['timestamp', 'tipe', 'ref_id', 'pesan', 'detail_json'],
    null
  ],

  // --- 16. ProductAddons ---
  ['ProductAddons',
    ['addon_id', 'product_id', 'nama_addon', 'harga', 'urutan', 'aktif', 'created_at', 'updated_at'],
    null
  ],

  // --- 17. OrderItemAddons ---
  ['OrderItemAddons',
    ['id', 'order_id', 'order_item_ref', 'addon_id', 'nama_addon_snapshot', 'harga_snapshot', 'created_at'],
    null
  ],

  // --- 18. PromoCodes ---
  ['PromoCodes',
    ['promo_id', 'kode', 'nama', 'deskripsi', 'catatan_customer', 'aktif',
     'mulai_at', 'berakhir_at', 'hari_berlaku', 'jam_mulai', 'jam_berakhir',
     'min_subtotal', 'max_subtotal', 'metode_kirim', 'required_product_ids',
     'required_kategori_ids', 'required_match_mode', 'member_baru_only',
     'whitelist_member_ids', 'bisa_dengan_poin', 'limit_total',
     'limit_per_member', 'limit_harian', 'diskon_subtotal_tipe',
     'diskon_subtotal_nilai', 'diskon_subtotal_max', 'diskon_produk_ids',
     'diskon_produk_tipe', 'diskon_produk_nilai', 'diskon_produk_max',
     'diskon_ongkir_tipe', 'diskon_ongkir_nilai', 'diskon_ongkir_max',
     'bonus_poin', 'multiplier_poin', 'created_at', 'updated_at'],
    null
  ],

  // --- 19. PromoUsage ---
  ['PromoUsage',
    ['usage_id', 'promo_id', 'promo_code', 'order_id', 'member_id', 'status',
     'used_at', 'used_date', 'cancelled_at', 'promo_diskon_subtotal',
     'promo_diskon_produk', 'promo_diskon_ongkir', 'promo_diskon_total',
     'promo_bonus_poin', 'promo_multiplier_poin'],
    null
  ]
];

// ============================================================
// 1. setupDatabase()
// ============================================================
function setupDatabase() {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!ssId) {
    throw new Error('Set Script Property SPREADSHEET_ID dulu');
  }

  var ss = SpreadsheetApp.openById(ssId);
  var created = 0;
  var existed = 0;

  for (var i = 0; i < SHEET_DEFS.length; i++) {
    var name    = SHEET_DEFS[i][0];
    var header  = SHEET_DEFS[i][1];
    var defaults = SHEET_DEFS[i][2]; // null jika tidak ada data default

    var sheet = ss.getSheetByName(name);

    if (sheet === null) {
      // --- Sheet belum ada: buat baru ---
      sheet = ss.insertSheet(name);

      // Tulis header di baris pertama
      sheet.getRange(1, 1, 1, header.length).setValues([header]);

      // Tulis data default (jika ada)
      if (defaults !== null && defaults.length > 0) {
        sheet.getRange(2, 1, defaults.length, header.length).setValues(defaults);
      }

      Logger.log('✅ Sheet "' + name + '" dibuat dengan ' +
                  (defaults ? defaults.length : 0) + ' baris data default.');
      created++;

    } else {
      // --- Sheet sudah ada: cek header ---
      var data = sheet.getDataRange().getValues();
      var existingHeader = data.length > 0 ? data[0] : [];

      // Bandingkan header
      var headerMatch = (existingHeader.length === header.length);
      if (headerMatch) {
        for (var h = 0; h < header.length; h++) {
          if (String(existingHeader[h]).trim() !== String(header[h]).trim()) {
            headerMatch = false;
            break;
          }
        }
      }

      if (!headerMatch) {
        Logger.log('⚠️ Sheet "' + name + '" sudah ada tapi HEADER BERBEDA. ' +
                    'Data TIDAK ditimpa. Periksa manual. ' +
                    'Seharusnya: [' + header.join(', ') + '] — ' +
                    'Ditemukan: [' + existingHeader.join(', ') + ']');
      } else {
        Logger.log('ℹ️ Sheet "' + name + '" sudah ada, header sesuai. Tidak ada perubahan.');
      }

      existed++;
    }
  }

  Logger.log('========================================');
  Logger.log('Selesai! Sheet dibuat: ' + created + ', sudah ada: ' + existed +
             ', total: ' + (created + existed) + '/' + SHEET_DEFS.length + '.');
}

// ============================================================
// 2. hashPassword(str)
//
// Pemakaian:
//   Jalankan hashPassword('passwordku') dari editor,
//   salin hasil Logger ke Settings ADMIN_PASSWORD_HASH.
// ============================================================
function hashPassword(str) {
  var rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    str,
    Utilities.Charset.UTF_8
  );

  var hex = '';
  for (var i = 0; i < rawHash.length; i++) {
    var byte = rawHash[i];
    if (byte < 0) byte += 256;
    var h = byte.toString(16);
    if (h.length === 1) h = '0' + h;
    hex += h;
  }

  return hex;
}

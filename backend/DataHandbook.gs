/**
 * DataHandbook.gs - dokumentasi operasional schema Spreadsheet Samijaya.
 *
 * Registry ini hanya mendeskripsikan 21 sheet bisnis. Sheet Handbook adalah
 * artefak dokumentasi dan sengaja tidak mendokumentasikan dirinya sendiri.
 */
var DATA_HANDBOOK_VERSION = '8-D';
var DATA_HANDBOOK_NOTE_MARKER = '[Samijaya Handbook]';
var DATA_HANDBOOK_HEADERS = [
  'sheet_name','sheet_purpose','column_name','column_position','input_mode',
  'required','data_type','allowed_values','default_value','example','description',
  'edit_policy','sensitive','related_to','operational_notes'
];
var DATA_HANDBOOK_INPUT_MODES = ['MANUAL','SYSTEM','MIXED','FORMULA','DO_NOT_EDIT'];

var DATA_HANDBOOK_BUSINESS_SHEETS = [
  { name:'Settings', purpose:'Konfigurasi aplikasi dan integrasi. Kolom value dapat berisi rahasia.', headers:['key','value','keterangan'] },
  { name:'Members', purpose:'Profil member dan saldo/ringkasan transaksi yang dipelihara sistem.', headers:['member_id','nama','no_hp','tgl_lahir','email','jenis_kelamin','total_poin','total_belanja','created_at','status','last_seen_orders_at'] },
  { name:'Sessions', purpose:'OTP dan sesi login. Seluruh isi bersifat sistem dan sensitif.', headers:['token','no_hp','member_id','otp','otp_expires_at','otp_used','session_expires_at','created_at','otp_failed_attempts','otp_locked_at'] },
  { name:'MemberAddresses', purpose:'Alamat tersimpan milik member yang dikelola melalui frontend.', headers:['address_id','member_id','label','detail','alamat_snapshot','latitude','longitude','created_at','status','is_default'] },
  { name:'Products', purpose:'Katalog produk yang ditampilkan kepada pelanggan.', headers:['product_id','nama','harga','foto_file_id','kategori_id','deskripsi','badge_promo','tersedia','urutan','status'] },
  { name:'Categories', purpose:'Kelompok dan urutan kategori katalog.', headers:['kategori_id','nama','urutan','status'] },
  { name:'ProductVariants', purpose:'Pilihan varian satu dimensi dan tambahan harga per produk.', headers:['variant_id','product_id','nama_axis','nama_varian','harga','urutan','aktif','created_at','updated_at'] },
  { name:'ProductAddons', purpose:'Pilihan add-on dan tambahan harga per produk.', headers:['addon_id','product_id','nama_addon','harga','urutan','aktif','created_at','updated_at'] },
  { name:'PickupLocations', purpose:'Cabang/titik ambil dan titik asal perhitungan pengiriman.', headers:['lokasi_id','nama','alamat','latitude','longitude','jam_buka','jam_tutup','status'] },
  { name:'DeliverySlots', purpose:'Jadwal, kuota, dan status slot pengantaran.', headers:['slot_id','jam_mulai','jam_selesai','kuota','status'] },
  { name:'Holidays', purpose:'Tanggal yang tidak menerima jadwal pengantaran.', headers:['tanggal','keterangan'] },
  { name:'Orders', purpose:'Transaksi induk, snapshot harga, promo, idempotency, dan recovery.', headers:['order_id','member_id','nama','no_hp','tgl_antar','metode_kirim','lokasi_pickup_id','address_id','alamat_snapshot','lat','lng','jarak_km','ongkir','slot_id','subtotal','poin_dipakai','total','metode_bayar','status','catatan_customer','catatan_admin','created_at','updated_at','timeline_json','nama_penerima','no_hp_penerima','status_updated_at','promo_id','promo_code','promo_nama','ongkir_sebelum_promo','promo_diskon_subtotal','promo_diskon_produk','promo_diskon_ongkir','promo_diskon_total','promo_bonus_poin','promo_multiplier_poin','poin_earn_dasar','poin_earn_final','promo_snapshot_json','client_request_id','request_fingerprint','commit_status','commit_stage','commit_error_code','commit_snapshot_json','committed_at','transaction_status','transaction_stage','transaction_error_code','transaction_snapshot_json','cancelled_at','cancelled_by','cancel_reason'] },
  { name:'OrderItems', purpose:'Snapshot item dan varian pada tiap order.', headers:['order_id','product_id','nama_snapshot','harga_snapshot','qty','subtotal','variant_id','variant_nama_snapshot','nama_axis_snapshot','order_item_ref'] },
  { name:'OrderItemAddons', purpose:'Snapshot add-on pada tiap item order.', headers:['id','order_id','order_item_ref','addon_id','nama_addon_snapshot','harga_snapshot','created_at'] },
  { name:'PointHistory', purpose:'Ledger perubahan poin yang immutable dan direkonsiliasi sistem.', headers:['id','member_id','order_id','tipe','jumlah','saldo_akhir','keterangan','created_at','event_code','saldo_sebelum','event_status','event_snapshot_json'] },
  { name:'Reviews', purpose:'Ulasan order dan state moderasinya.', headers:['review_id','order_id','member_id','rating','ulasan','status','created_at','request_fingerprint','updated_at'] },
  { name:'PromoCodes', purpose:'Aturan eligibility, limit, diskon, dan reward kode promo.', headers:['promo_id','kode','nama','deskripsi','catatan_customer','aktif','mulai_at','berakhir_at','hari_berlaku','jam_mulai','jam_berakhir','min_subtotal','max_subtotal','metode_kirim','required_product_ids','required_kategori_ids','required_match_mode','member_baru_only','whitelist_member_ids','bisa_dengan_poin','limit_total','limit_per_member','limit_harian','diskon_subtotal_tipe','diskon_subtotal_nilai','diskon_subtotal_max','diskon_produk_ids','diskon_produk_tipe','diskon_produk_nilai','diskon_produk_max','diskon_ongkir_tipe','diskon_ongkir_nilai','diskon_ongkir_max','bonus_poin','multiplier_poin','created_at','updated_at'] },
  { name:'PromoUsage', purpose:'Pemakaian promo per order untuk limit dan pembatalan.', headers:['usage_id','promo_id','promo_code','order_id','member_id','status','used_at','used_date','cancelled_at','promo_diskon_subtotal','promo_diskon_produk','promo_diskon_ongkir','promo_diskon_total','promo_bonus_poin','promo_multiplier_poin'] },
  { name:'MessageTemplates', purpose:'Template pesan operasional beserta placeholder yang diizinkan.', headers:['kode','isi','keterangan'] },
  { name:'Campaigns', purpose:'Konten popup campaign yang ditampilkan pada katalog.', headers:['campaign_id','judul','deskripsi','gambar_file_id','gambar_url','link_url','kode_promo','tanggal_mulai','tanggal_selesai','urutan','status'] },
  { name:'Logs', purpose:'Audit dan observability terstruktur; bukan tempat menyimpan data rahasia.', headers:['timestamp','tipe','ref_id','pesan','detail_json'] }
];

var DATA_HANDBOOK_MANUAL_SHEETS = {
  Products:true, Categories:true, ProductVariants:true, ProductAddons:true,
  PickupLocations:true, DeliverySlots:true, Holidays:true, PromoCodes:true,
  MessageTemplates:true, Campaigns:true
};
var DATA_HANDBOOK_SYSTEM_SHEETS = {
  Members:true, Sessions:true, MemberAddresses:true, Orders:true, OrderItems:true,
  OrderItemAddons:true, PointHistory:true, PromoUsage:true, Logs:true
};
var DATA_HANDBOOK_OPTIONAL_COLUMNS = {
  Settings:['keterangan'], Members:['tgl_lahir','email','jenis_kelamin','last_seen_orders_at'], Sessions:['otp_failed_attempts','otp_locked_at'],
  MemberAddresses:['alamat_snapshot'], Products:['foto_file_id','deskripsi','badge_promo','urutan'], Categories:['urutan'],
  ProductVariants:['created_at','updated_at'], ProductAddons:['created_at','updated_at'], PickupLocations:['jam_buka','jam_tutup'],
  Holidays:['keterangan'], Orders:['lokasi_pickup_id','address_id','alamat_snapshot','lat','lng','jarak_km','ongkir','slot_id','catatan_customer','catatan_admin','timeline_json','nama_penerima','no_hp_penerima','status_updated_at','promo_id','promo_code','promo_nama','ongkir_sebelum_promo','promo_diskon_subtotal','promo_diskon_produk','promo_diskon_ongkir','promo_diskon_total','promo_bonus_poin','promo_multiplier_poin','poin_earn_dasar','poin_earn_final','promo_snapshot_json','client_request_id','request_fingerprint','commit_status','commit_stage','commit_error_code','commit_snapshot_json','committed_at','transaction_status','transaction_stage','transaction_error_code','transaction_snapshot_json','cancelled_at','cancelled_by','cancel_reason'],
  OrderItems:['variant_id','variant_nama_snapshot','nama_axis_snapshot','order_item_ref'], OrderItemAddons:['created_at'],
  PointHistory:['event_code','saldo_sebelum','event_status','event_snapshot_json'], Reviews:['request_fingerprint','updated_at'],
  PromoCodes:['deskripsi','catatan_customer','mulai_at','berakhir_at','hari_berlaku','jam_mulai','jam_berakhir','max_subtotal','required_product_ids','required_kategori_ids','required_match_mode','member_baru_only','whitelist_member_ids','bisa_dengan_poin','diskon_subtotal_tipe','diskon_subtotal_nilai','diskon_subtotal_max','diskon_produk_ids','diskon_produk_tipe','diskon_produk_nilai','diskon_produk_max','diskon_ongkir_tipe','diskon_ongkir_nilai','diskon_ongkir_max','bonus_poin','multiplier_poin','created_at','updated_at'],
  PromoUsage:['used_date','cancelled_at','promo_diskon_subtotal','promo_diskon_produk','promo_diskon_ongkir','promo_diskon_total','promo_bonus_poin','promo_multiplier_poin'],
  MessageTemplates:['keterangan'], Campaigns:['deskripsi','gambar_file_id','gambar_url','link_url','kode_promo','tanggal_mulai','tanggal_selesai','urutan']
};
var DATA_HANDBOOK_COLUMN_DESCRIPTIONS = {
  product_id:'ID unik produk; gunakan ID yang sama pada varian, add-on, item, dan syarat promo.', kategori_id:'ID kategori yang menghubungkan produk dengan Categories.',
  variant_id:'ID unik varian; jangan gunakan ulang untuk varian lain.', addon_id:'ID unik add-on; jangan gunakan ulang untuk add-on lain.',
  nama:'Nama yang ditampilkan kepada operator atau pelanggan.', harga:'Nilai rupiah. Pada Products merupakan harga dasar; pada varian/add-on merupakan tambahan harga.',
  foto_file_id:'Google Drive file ID gambar, bukan URL berbagi lengkap.', deskripsi:'Teks penjelasan yang aman ditampilkan sesuai konteks sheet.',
  badge_promo:'Label pendek pada kartu produk; kosong berarti tanpa badge.', tersedia:'Menentukan produk dapat dipesan; gunakan Telegram untuk perubahan cepat.',
  urutan:'Angka urutan tampil; angka lebih kecil tampil lebih dahulu.', status:'Status aktif/nonaktif atau status domain sesuai daftar nilai.',
  nama_axis:'Nama dimensi varian yang konsisten untuk satu produk, misalnya Ukuran.', nama_varian:'Nama pilihan varian yang dilihat pelanggan.',
  nama_addon:'Nama pilihan add-on yang dilihat pelanggan.', aktif:'Menentukan record dapat digunakan oleh reader aplikasi.',
  lokasi_id:'ID unik lokasi pickup.', alamat:'Alamat teks lokasi pickup.', latitude:'Koordinat lintang desimal.', longitude:'Koordinat bujur desimal.',
  jam_buka:'Jam mulai operasi lokasi dalam WIB.', jam_tutup:'Jam selesai operasi lokasi dalam WIB.', slot_id:'ID unik slot pengantaran.',
  jam_mulai:'Awal waktu slot dalam WIB.', jam_selesai:'Akhir waktu slot dalam WIB.', kuota:'Maksimum order untuk slot dan tanggal yang sama.',
  tanggal:'Tanggal libur dalam format YYYY-MM-DD.', keterangan:'Catatan singkat untuk membantu operator memahami record.',
  kode:'Kode unik yang digunakan aplikasi.', isi:'Isi template pesan. Gunakan hanya placeholder yang didukung.',
  campaign_id:'ID unik campaign; jangan diubah agar status sudah-dilihat tetap stabil.', judul:'Judul campaign yang ditampilkan.',
  gambar_file_id:'Google Drive file ID yang diprioritaskan sebagai gambar campaign.', gambar_url:'URL gambar fallback bila gambar_file_id kosong.',
  link_url:'URL tujuan opsional saat campaign diklik.', kode_promo:'Kode promo opsional yang dapat disalin pelanggan.',
  tanggal_mulai:'Tanggal mulai tampil yang inklusif dalam WIB.', tanggal_selesai:'Tanggal terakhir tampil yang inklusif dalam WIB.'
};
var DATA_HANDBOOK_SENSITIVE = {
  'Settings.value':true,
  'Members.nama':true,'Members.no_hp':true,'Members.tgl_lahir':true,'Members.email':true,
  'Sessions.token':true,'Sessions.no_hp':true,'Sessions.otp':true,
  'MemberAddresses.detail':true,'MemberAddresses.alamat_snapshot':true,'MemberAddresses.latitude':true,'MemberAddresses.longitude':true,
  'Orders.nama':true,'Orders.no_hp':true,'Orders.alamat_snapshot':true,'Orders.lat':true,'Orders.lng':true,
  'Orders.catatan_customer':true,'Orders.catatan_admin':true,'Orders.nama_penerima':true,'Orders.no_hp_penerima':true,
  'Orders.commit_snapshot_json':true,'Orders.transaction_snapshot_json':true,
  'Reviews.ulasan':true,'Logs.detail_json':true
};

var DATA_HANDBOOK_PROMO_META = {
  promo_id:['MANUAL',true,'id','ID unik, tanpa spasi.','', 'PRM_WELCOME10','Identitas promo. Jangan diubah setelah pernah digunakan.','HATI_HATI_SETELAH_DIPAKAI','PromoUsage.promo_id','Perubahan konfigurasi berlaku untuk validasi checkout berikutnya; order committed menyimpan snapshot.'],
  kode:['MANUAL',true,'kode','Huruf/angka/_/-. Unik tanpa membedakan besar-kecil.','', 'WELCOME10','Kode yang diketik pelanggan; sistem melakukan trim dan uppercase.','HATI_HATI_SETELAH_DIPAKAI','Orders.promo_code','Mengganti kode hanya memengaruhi checkout/validasi berikutnya.'],
  nama:['MANUAL',true,'teks','Teks singkat.','', 'Diskon Member Baru','Nama promo untuk tampilan dan snapshot order.','BEBAS_SEBELUM_DIPAKAI','','Order lama tidak berubah karena menyimpan snapshot.'],
  deskripsi:['MANUAL',false,'teks','Teks bebas.','', 'Potongan untuk pembelian pertama','Penjelasan internal promo.','BEBAS_SEBELUM_DIPAKAI','','Kosong diperbolehkan.'],
  catatan_customer:['MANUAL',false,'teks','Teks aman untuk pelanggan.','', 'Berlaku sampai akhir bulan','Pesan singkat yang dikirim dalam hasil validasi promo.','BEBAS_SEBELUM_DIPAKAI','','Kosong berarti tidak ada catatan tambahan.'],
  aktif:['MIXED',true,'boolean/status','aktif | nonaktif | true | false | 1 | 0 | ya | tidak','nonaktif','aktif','Menentukan apakah promo dapat dipakai. Gunakan nilai canonical aktif/nonaktif.','GUNAKAN_TELEGRAM','','Perubahan langsung memengaruhi validasi checkout baru atau validasi ulang yang belum committed.'],
  mulai_at:['MANUAL',false,'tanggal/waktu','YYYY-MM-DD atau YYYY-MM-DD HH:mm[:ss] (WIB).','tanpa batas awal','2026-08-01 00:00','Awal periode promo, inklusif.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.berakhir_at','Kosong berarti tidak ada batas awal.'],
  berakhir_at:['MANUAL',false,'tanggal/waktu','YYYY-MM-DD atau YYYY-MM-DD HH:mm[:ss] (WIB).','tanpa batas akhir','2026-08-31 23:59','Akhir periode promo, inklusif.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.mulai_at','Kosong berarti tidak ada batas akhir; tidak boleh lebih awal dari mulai_at.'],
  hari_berlaku:['MANUAL',false,'csv enum','SEN, SEL, RAB, KAM, JUM, SAB, MIN','semua hari','SEN,SEL,RAB','Daftar hari WIB dipisahkan koma.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.jam_mulai','Kosong berarti semua hari; elemen di-trim dan duplikat diabaikan. Rentang jam lintas tengah malam memakai hari saat rentang dimulai.'],
  jam_mulai:['MANUAL',false,'waktu','H:mm atau HH:mm','sepanjang hari','08:00','Awal jam berlaku, inklusif.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.jam_berakhir','Harus terisi berpasangan dengan jam_berakhir; kosong keduanya berarti sepanjang hari.'],
  jam_berakhir:['MANUAL',false,'waktu','H:mm atau HH:mm','sepanjang hari','17:00','Akhir jam berlaku, inklusif; boleh lebih kecil untuk rentang melewati tengah malam.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.jam_mulai','Harus terisi berpasangan dengan jam_mulai.'],
  min_subtotal:['MANUAL',true,'angka desimal >= 0','Angka tanpa exponent.','0','50000','Subtotal item minimum sebelum diskon.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.max_subtotal','Kosong dibaca efektif 0; nilai 0 berarti tanpa minimum.'],
  max_subtotal:['MANUAL',false,'angka desimal >= 0','Angka tanpa exponent.','0','250000','Subtotal item maksimum yang masih eligible.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.min_subtotal','Kosong atau 0 berarti tanpa maksimum; bila positif tidak boleh di bawah minimum.'],
  metode_kirim:['MANUAL',true,'csv enum','AMBIL, DIANTAR, OJOL','semua metode','AMBIL,DIANTAR','Metode kirim yang diperbolehkan, dipisahkan koma.','HATI_HATI_SETELAH_DIPAKAI','','Kosong berarti semua metode; elemen di-trim dan dibandingkan uppercase.'],
  required_product_ids:['MANUAL',false,'csv id','ID Products dipisahkan koma.','tanpa syarat produk','PRD_A,PRD_B','Produk yang harus ada dalam order sesuai match mode.','HATI_HATI_SETELAH_DIPAKAI','Products.product_id','Kosong berarti tidak ada syarat produk; duplikat diabaikan.'],
  required_kategori_ids:['MANUAL',false,'csv id','ID Categories dipisahkan koma.','tanpa syarat kategori','CAT_COFFEE','Kategori yang harus ada dalam order sesuai match mode.','HATI_HATI_SETELAH_DIPAKAI','Categories.kategori_id','Kosong berarti tidak ada syarat kategori; daftar produk dan kategori dihitung bersama.'],
  required_match_mode:['MANUAL',false,'enum','ANY | ALL','ANY','ANY','ANY cukup satu target cocok; ALL mewajibkan semua ID produk dan kategori cocok.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.required_product_ids','Kosong efektif ANY.'],
  member_baru_only:['MANUAL',false,'boolean','true | false | 1 | 0 | aktif | nonaktif | ya | tidak','false','true','Jika aktif, member tidak boleh pernah memiliki order committed SELESAI.','HATI_HATI_SETELAH_DIPAKAI','Orders.status','Kosong efektif false.'],
  whitelist_member_ids:['MANUAL',false,'csv id','ID Members dipisahkan koma.','semua member','MEM_A,MEM_B','Membatasi promo pada member tertentu.','HATI_HATI_SETELAH_DIPAKAI','Members.member_id','Kosong berarti semua member; elemen di-trim dan duplikat diabaikan.'],
  bisa_dengan_poin:['MANUAL',false,'boolean','true | false | 1 | 0 | aktif | nonaktif | ya | tidak','false','true','Mengizinkan redeem poin bersama promo.','HATI_HATI_SETELAH_DIPAKAI','Orders.poin_dipakai','Kosong efektif false; false menolak checkout yang meminta penggunaan poin.'],
  limit_total:['MANUAL',true,'integer >= 0','Bilangan bulat.','0','100','Batas seluruh pemakaian berstatus DIGUNAKAN.','HATI_HATI_SETELAH_DIPAKAI','PromoUsage.status','Kosong atau 0 berarti tanpa limit.'],
  limit_per_member:['MANUAL',true,'integer >= 0','Bilangan bulat.','0','1','Batas pemakaian per member.','HATI_HATI_SETELAH_DIPAKAI','PromoUsage.member_id','Kosong atau 0 berarti tanpa limit.'],
  limit_harian:['MANUAL',true,'integer >= 0','Bilangan bulat.','0','20','Batas pemakaian per tanggal WIB.','HATI_HATI_SETELAH_DIPAKAI','PromoUsage.used_date','Kosong atau 0 berarti tanpa limit.'],
  diskon_subtotal_tipe:['MANUAL',false,'enum','PERSEN | NOMINAL','tidak aktif','PERSEN','Jenis potongan terhadap seluruh subtotal item.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.diskon_subtotal_nilai','Dilarang diaktifkan bersamaan dengan kelompok diskon_produk_*.'],
  diskon_subtotal_nilai:['MANUAL',false,'angka > 0','PERSEN maksimal 100; NOMINAL rupiah.','tidak aktif','10','Besar diskon subtotal.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.diskon_subtotal_tipe','Wajib positif bila kelompok diskon subtotal diisi.'],
  diskon_subtotal_max:['MANUAL',false,'angka >= 0','Nominal rupiah.','0','25000','Cap nominal untuk diskon subtotal bertipe PERSEN.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.diskon_subtotal_tipe','Kosong atau 0 berarti tanpa cap; cap hanya diterapkan pada PERSEN.'],
  diskon_produk_ids:['MANUAL',false,'csv id','ID Products dipisahkan koma.','tidak aktif','PRD_A,PRD_B','Produk yang subtotalnya menjadi dasar diskon produk.','HATI_HATI_SETELAH_DIPAKAI','Products.product_id','Wajib berisi minimal satu ID jika kelompok diskon produk aktif; dilarang bersama diskon subtotal.'],
  diskon_produk_tipe:['MANUAL',false,'enum','PERSEN | NOMINAL','tidak aktif','NOMINAL','Jenis diskon untuk subtotal produk target.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.diskon_produk_ids','Dilarang diaktifkan bersamaan dengan kelompok diskon_subtotal_*.'],
  diskon_produk_nilai:['MANUAL',false,'angka > 0','PERSEN maksimal 100; NOMINAL rupiah.','tidak aktif','10000','Besar diskon produk target.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.diskon_produk_tipe','Wajib positif bila kelompok diskon produk diisi.'],
  diskon_produk_max:['MANUAL',false,'angka >= 0','Nominal rupiah.','0','20000','Cap nominal untuk diskon produk bertipe PERSEN.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.diskon_produk_tipe','Kosong atau 0 berarti tanpa cap; cap hanya diterapkan pada PERSEN.'],
  diskon_ongkir_tipe:['MANUAL',false,'enum','GRATIS | PERSEN | NOMINAL','tidak aktif','GRATIS','Jenis diskon terhadap ongkir normal.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.diskon_ongkir_nilai','Boleh digabung dengan satu diskon harga. Diskon tidak pernah melebihi ongkir.'],
  diskon_ongkir_nilai:['MANUAL',false,'angka > 0','PERSEN maksimal 100; NOMINAL rupiah.','tidak aktif','50','Besar diskon ongkir.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.diskon_ongkir_tipe','Tidak diperlukan untuk GRATIS; wajib positif untuk PERSEN/NOMINAL.'],
  diskon_ongkir_max:['MANUAL',false,'angka >= 0','Nominal rupiah.','0','15000','Cap nominal untuk diskon ongkir bertipe PERSEN.','HATI_HATI_SETELAH_DIPAKAI','PromoCodes.diskon_ongkir_tipe','Kosong atau 0 berarti tanpa cap; diskon tetap dibatasi sebesar ongkir.'],
  bonus_poin:['MANUAL',false,'integer >= 0','Bilangan bulat.','0','10','Poin tetap yang ditambahkan setelah multiplier.','HATI_HATI_SETELAH_DIPAKAI','Orders.promo_bonus_poin','Kosong efektif 0; bonus tidak ikut dikalikan.'],
  multiplier_poin:['MANUAL',false,'angka > 0','Angka desimal positif.','1','2','Pengali poin dasar sebelum bonus ditambahkan.','HATI_HATI_SETELAH_DIPAKAI','Orders.promo_multiplier_poin','Kosong efektif 1. Poin final=floor(poin dasar x multiplier)+bonus.'],
  created_at:['MANUAL',false,'timestamp','YYYY-MM-DD HH:mm:ss (WIB).','kosong','2026-08-01 09:00:00','Waktu pencatatan konfigurasi promo.','HATI_HATI_SETELAH_DIPAKAI','','Tidak dipakai untuk menentukan periode berlaku.'],
  updated_at:['MIXED',false,'timestamp','YYYY-MM-DD HH:mm:ss (WIB).','kosong','2026-08-02 10:00:00','Waktu perubahan konfigurasi; Telegram memperbarui saat status promo berubah.','JANGAN_EDIT_MANUAL','','Metadata audit, bukan periode berlaku.']
};

function dataHandbookSheetMap_() {
  var result = {};
  for (var i=0;i<DATA_HANDBOOK_BUSINESS_SHEETS.length;i++) result[DATA_HANDBOOK_BUSINESS_SHEETS[i].name]=DATA_HANDBOOK_BUSINESS_SHEETS[i];
  return result;
}

function dataHandbookColumnMeta_(sheetName, columnName) {
  if (sheetName === 'PromoCodes' && DATA_HANDBOOK_PROMO_META[columnName]) return DATA_HANDBOOK_PROMO_META[columnName];
  var key = sheetName + '.' + columnName;
  var mode = DATA_HANDBOOK_MANUAL_SHEETS[sheetName] ? 'MANUAL' : (DATA_HANDBOOK_SYSTEM_SHEETS[sheetName] ? 'DO_NOT_EDIT' : 'MIXED');
  var policy = mode === 'MANUAL' ? 'BEBAS_SEBELUM_DIPAKAI' : 'JANGAN_EDIT_MANUAL';
  if (sheetName==='Members' || sheetName==='MemberAddresses' || sheetName==='Reviews') { mode='SYSTEM'; policy='GUNAKAN_FRONTEND'; }
  if (sheetName === 'Settings') { mode = columnName === 'key' ? 'DO_NOT_EDIT' : (columnName === 'value' ? 'MIXED' : 'MANUAL'); policy = columnName === 'key' ? 'GUNAKAN_MIGRATION' : (columnName === 'value' ? 'HATI_HATI_SETELAH_DIPAKAI' : 'BEBAS_SEBELUM_DIPAKAI'); }
  if ((sheetName === 'Products' && columnName === 'tersedia') || (sheetName === 'DeliverySlots' && columnName === 'status') || (sheetName === 'Reviews' && columnName === 'status')) { mode='MIXED'; policy='GUNAKAN_TELEGRAM'; }
  var optional=DATA_HANDBOOK_OPTIONAL_COLUMNS[sheetName]||[];
  var required=optional.indexOf(columnName)===-1;
  var type = /(^|_)json$/.test(columnName) ? 'json' : (/(_at|timestamp)$/.test(columnName) ? 'timestamp WIB' : (/^(tanggal|tgl_)/.test(columnName) ? 'tanggal' : (/^(harga|subtotal|total|ongkir|jumlah|saldo|kuota|urutan|rating|lat|lng|latitude|longitude|jarak|poin)/.test(columnName) ? 'angka' : 'teks')));
  var allowed = '';
  if (/^(aktif|tersedia|is_default|otp_used)$/.test(columnName)) allowed='true | false | 1 | 0; alias aktif/nonaktif atau ya/tidak hanya pada reader yang mendukung';
  if (columnName === 'status') allowed = sheetName === 'Orders' ? 'MENUNGGU | DIPROSES | SIAP | DIANTAR | SELESAI | BATAL' : (sheetName === 'Reviews' ? 'aktif | hidden | dihapus' : 'aktif | nonaktif');
  if (columnName === 'metode_kirim') allowed='AMBIL | DIANTAR | OJOL';
  if (columnName === 'metode_bayar') allowed='COD | TRANSFER | QRIS';
  if (sheetName === 'PointHistory' && columnName === 'tipe') allowed='TAMBAH | PAKAI | KOREKSI';
  if (sheetName === 'PromoUsage' && columnName === 'status') allowed='DIGUNAKAN | DIBATALKAN';
  var description=DATA_HANDBOOK_COLUMN_DESCRIPTIONS[columnName] || ('Data '+columnName.replace(/_/g,' ')+' untuk '+sheetName+'.');
  if (mode === 'DO_NOT_EDIT') description += ' Nilai dibuat atau dipelihara sistem.';
  else if (mode === 'SYSTEM') description += ' Nilai berasal dari alur frontend/sistem.';
  var related = '';
  if (/_id$/.test(columnName)) related='ID terkait; cocokkan dengan sheet sumber sebelum digunakan.';
  var notes = mode === 'DO_NOT_EDIT' ? 'Perubahan manual dapat merusak relasi, idempotency, ledger, session, refund, atau audit. Gunakan runbook rekonsiliasi.' : (mode==='SYSTEM' ? 'Gunakan frontend atau jalur sistem yang tersedia; jangan membetulkan record langsung di sheet.' : 'Perubahan manual terlihat setelah cache kedaluwarsa atau admin menjalankan /clearcache bila data masuk katalog.');
  return [mode,required,type,allowed,'','',description,policy,related,notes];
}

function dataHandbookBuildRows_() {
  var rows=[];
  for (var s=0;s<DATA_HANDBOOK_BUSINESS_SHEETS.length;s++) {
    var spec=DATA_HANDBOOK_BUSINESS_SHEETS[s];
    for (var c=0;c<spec.headers.length;c++) {
      var column=spec.headers[c], meta=dataHandbookColumnMeta_(spec.name,column);
      rows.push({sheet_name:spec.name,sheet_purpose:spec.purpose,column_name:column,column_position:c+1,input_mode:meta[0],required:meta[1]===true,data_type:meta[2],allowed_values:meta[3],default_value:meta[4],example:meta[5],description:meta[6],edit_policy:meta[7],sensitive:DATA_HANDBOOK_SENSITIVE[spec.name+'.'+column]===true,related_to:meta[8],operational_notes:meta[9]});
    }
  }
  return rows;
}

function dataHandbookValidateHeader_(sheet) {
  if (!sheet || sheet.getLastColumn() !== DATA_HANDBOOK_HEADERS.length) throw new Error('HANDBOOK_HEADER_INVALID');
  var actual=sheet.getRange(1,1,1,DATA_HANDBOOK_HEADERS.length).getValues()[0];
  for (var i=0;i<DATA_HANDBOOK_HEADERS.length;i++) if (String(actual[i]).trim() !== DATA_HANDBOOK_HEADERS[i]) throw new Error('HANDBOOK_HEADER_INVALID:'+DATA_HANDBOOK_HEADERS[i]);
  return actual;
}

function dataHandbookPrepareMatrix_(rows) {
  var matrix=[];
  for (var r=0;r<rows.length;r++) {
    var output=[];
    for (var h=0;h<DATA_HANDBOOK_HEADERS.length;h++) output.push(sheetPrepareValue(rows[r][DATA_HANDBOOK_HEADERS[h]]));
    matrix.push(output);
  }
  return matrix;
}

function dataHandbookHeaderNote_(row) {
  var values=row.allowed_values ? '\nNilai: '+row.allowed_values : '';
  var text=DATA_HANDBOOK_NOTE_MARKER+'\nMode: '+row.input_mode+'\nTipe: '+row.data_type+'\nWajib: '+(row.required?'Ya':'Tidak')+values+'\nPenjelasan: '+row.description+'\nLihat sheet Handbook untuk detail.';
  return text.length>700 ? text.substring(0,697)+'...' : text;
}

function dataHandbookApplyLayout_(sheet, rowCount) {
  sheet.setFrozenRows(1);
  sheet.getRange(1,1,Math.max(rowCount+1,1),DATA_HANDBOOK_HEADERS.length).setWrap(true);
  var widths=[130,260,180,90,110,75,130,220,140,160,320,190,85,200,320];
  for (var i=0;i<widths.length;i++) sheet.setColumnWidth(i+1,widths[i]);
  var filter=sheet.getFilter(), filterRows=Math.max(rowCount+1,2);
  if (filter && filter.getRange && filter.getRange().getNumRows()!==filterRows) { filter.remove(); filter=null; }
  if (!filter) sheet.getRange(1,1,filterRows,DATA_HANDBOOK_HEADERS.length).createFilter();
  var colors={MANUAL:'#e8f5e9',SYSTEM:'#e3f2fd',MIXED:'#fff8e1',FORMULA:'#f3e5f5',DO_NOT_EDIT:'#f5f5f5'};
  if (rowCount>0) {
    var modes=sheet.getRange(2,5,rowCount,1).getValues(), backgrounds=[];
    for (var r=0;r<modes.length;r++) backgrounds.push([colors[String(modes[r][0])]||'#ffffff']);
    sheet.getRange(2,5,rowCount,1).setBackgrounds(backgrounds);
  }
}

function dataHandbookSync_(ss, installNotes) {
  var report={created:false,inserted:0,updated:0,custom_rows:0,row_conflicts:[],note_conflicts:[],notes_written:0};
  var rows=dataHandbookBuildRows_();
  if (rows.length!==243) throw new Error('HANDBOOK_MANAGED_ROW_COUNT_INVALID:'+rows.length);
  var sheet=ss.getSheetByName('Handbook');
  if (!sheet) { sheet=ss.insertSheet('Handbook'); sheet.getRange(1,1,1,DATA_HANDBOOK_HEADERS.length).setValues([DATA_HANDBOOK_HEADERS]); report.created=true; }
  dataHandbookValidateHeader_(sheet);
  var data=sheet.getDataRange().getValues(), byKey={}, managed={};
  for (var m=0;m<rows.length;m++) managed[rows[m].sheet_name+'\u0000'+rows[m].column_name]=rows[m];
  for (var r=1;r<data.length;r++) {
    var key=String(data[r][0]).trim()+'\u0000'+String(data[r][2]).trim();
    if (!byKey[key]) byKey[key]=[];
    byKey[key].push(r+1);
    if (!managed[key]) report.custom_rows++;
  }
  var append=[];
  for (var i=0;i<rows.length;i++) {
    var managedKey=rows[i].sheet_name+'\u0000'+rows[i].column_name, matches=byKey[managedKey]||[];
    if (matches.length>1) { report.row_conflicts.push(rows[i].sheet_name+'.'+rows[i].column_name); continue; }
    var matrix=dataHandbookPrepareMatrix_([rows[i]]);
    if (matches.length===1) { sheet.getRange(matches[0],1,1,DATA_HANDBOOK_HEADERS.length).setValues(matrix); report.updated++; }
    else { append.push(matrix[0]); report.inserted++; }
  }
  if (append.length) sheet.getRange(sheet.getLastRow()+1,1,append.length,DATA_HANDBOOK_HEADERS.length).setValues(append);
  dataHandbookApplyLayout_(sheet, Math.max(sheet.getLastRow()-1,0));
  if (installNotes) {
    var rowMap={}; for (var j=0;j<rows.length;j++) rowMap[rows[j].sheet_name+'\u0000'+rows[j].column_name]=rows[j];
    for (var b=0;b<DATA_HANDBOOK_BUSINESS_SHEETS.length;b++) {
      var business=DATA_HANDBOOK_BUSINESS_SHEETS[b], target=ss.getSheetByName(business.name);
      if (!target || target.getLastColumn()===0) continue;
      var range=target.getRange(1,1,1,target.getLastColumn()), actual=range.getValues()[0], notes=range.getNotes()[0], changed=false;
      for (var c=0;c<actual.length;c++) {
        var definition=rowMap[business.name+'\u0000'+String(actual[c]).trim()];
        if (!definition) continue;
        var old=String(notes[c]||'');
        if (!old || old.indexOf(DATA_HANDBOOK_NOTE_MARKER)!==-1) { notes[c]=dataHandbookHeaderNote_(definition); changed=true; report.notes_written++; }
        else report.note_conflicts.push(business.name+'.'+String(actual[c]).trim());
      }
      if (changed) range.setNotes([notes]);
    }
  }
  return report;
}

/** Migration manual, additive, idempotent, dan tidak membaca row data bisnis. */
function migrateDataHandbook_8_D() {
  var ssId=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!ssId) throw new Error('SPREADSHEET_ID belum diset');
  var report=dataHandbookSync_(SpreadsheetApp.openById(ssId),true);
  Logger.log(JSON.stringify(report));
  return report;
}

/** Dipanggil hanya oleh setupDatabase() manual untuk instalasi baru. */
function setupDataHandbookForNewInstall_(ss) { return dataHandbookSync_(ss,true); }

/** Audit header dan dokumentasi saja; tidak membaca row data dari 21 sheet bisnis. */
function auditDataHandbookCoverageReadOnly() {
  var ssId=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!ssId) throw new Error('SPREADSHEET_ID belum diset');
  var ss=SpreadsheetApp.openById(ssId), expected=dataHandbookBuildRows_(), expectedMap={}, sheetMap=dataHandbookSheetMap_();
  var report={ok:true,summary:{business_sheets:21,managed_rows:expected.length},missing_business_header:[],missing_handbook_row:[],duplicate_handbook_key:[],stale_unknown_handbook_row:[],custom_row:[],custom_header_note_conflict:[],invalid_input_mode:[],missing_sensitive_classification:[]};
  for (var i=0;i<expected.length;i++) expectedMap[expected[i].sheet_name+'\u0000'+expected[i].column_name]=expected[i];
  for (var s=0;s<DATA_HANDBOOK_BUSINESS_SHEETS.length;s++) {
    var spec=DATA_HANDBOOK_BUSINESS_SHEETS[s], business=ss.getSheetByName(spec.name);
    if (!business) { for (var mh=0;mh<spec.headers.length;mh++) report.missing_business_header.push(spec.name+'.'+spec.headers[mh]); continue; }
    var last=business.getLastColumn(), actual=last?business.getRange(1,1,1,last).getValues()[0].map(function(v){return String(v).trim();}):[];
    var notes=last?business.getRange(1,1,1,last).getNotes()[0]:[];
    for (var eh=0;eh<spec.headers.length;eh++) if (actual.indexOf(spec.headers[eh])===-1) report.missing_business_header.push(spec.name+'.'+spec.headers[eh]);
    for (var ah=0;ah<actual.length;ah++) if (expectedMap[spec.name+'\u0000'+actual[ah]] && notes[ah] && String(notes[ah]).indexOf(DATA_HANDBOOK_NOTE_MARKER)===-1) report.custom_header_note_conflict.push(spec.name+'.'+actual[ah]);
  }
  var handbook=ss.getSheetByName('Handbook');
  if (!handbook) { for (var e=0;e<expected.length;e++) report.missing_handbook_row.push(expected[e].sheet_name+'.'+expected[e].column_name); }
  else {
    dataHandbookValidateHeader_(handbook);
    var data=handbook.getDataRange().getValues(), seen={};
    for (var r=1;r<data.length;r++) {
      var sheetName=String(data[r][0]).trim(), columnName=String(data[r][2]).trim(), key=sheetName+'\u0000'+columnName, label=sheetName+'.'+columnName;
      if (!seen[key]) seen[key]=0; seen[key]++;
      if (!expectedMap[key]) { if (sheetMap[sheetName]) report.stale_unknown_handbook_row.push(label); else report.custom_row.push(label); continue; }
      if (DATA_HANDBOOK_INPUT_MODES.indexOf(String(data[r][4]).trim())===-1) report.invalid_input_mode.push(label);
      if (DATA_HANDBOOK_SENSITIVE[key.replace('\u0000','.')] && data[r][12]!==true) report.missing_sensitive_classification.push(label);
    }
    for (var key in seen) if (seen[key]>1) report.duplicate_handbook_key.push(key.replace('\u0000','.'));
    for (var expectedKey in expectedMap) if (!seen[expectedKey]) report.missing_handbook_row.push(expectedKey.replace('\u0000','.'));
  }
  report.ok=report.missing_business_header.length===0 && report.missing_handbook_row.length===0 && report.duplicate_handbook_key.length===0 && report.stale_unknown_handbook_row.length===0 && report.custom_header_note_conflict.length===0 && report.invalid_input_mode.length===0 && report.missing_sensitive_classification.length===0;
  Logger.log(JSON.stringify(report));
  return report;
}

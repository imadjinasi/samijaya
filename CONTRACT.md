# CONTRACT — Samijaya MVP

## 1. Aturan Umum
- Database: Google Spreadsheet, ID dibaca dari Script Properties `SPREADSHEET_ID`.
- Semua response API: `{ok:true, data:...}` atau `{ok:false, error:"pesan", code:"KODE"}`. (Error codes baru: `NAMA_PENERIMA_TIDAK_VALID`, `NO_HP_PENERIMA_TIDAK_VALID`, `VARIANT_REQUIRED`, `VARIANT_NOT_FOUND`, `VARIANT_INACTIVE`, `VARIANT_MISMATCH`, `ADDON_NOT_FOUND`, `ADDON_INACTIVE`, `ADDON_MISMATCH`).
- Request FE→BE: HTTP POST, `Content-Type: text/plain`, body JSON string `{action, payload, token?}`.
- Status order (enum, dilarang menambah): `MENUNGGU, DIPROSES, SIAP, DIANTAR, SELESAI, BATAL`.
- `order_id`: `SJ` + YYMMDD + 3 digit urut harian (contoh `SJ260717001`), digenerate DI DALAM lock.
- Tanggal: `YYYY-MM-DD`. Waktu: `HH:mm`. Timezone: Asia/Jakarta.
- Foto: simpan `FILE_ID` Google Drive; URL tampil = `https://drive.google.com/thumbnail?id=<FILE_ID>&sz=w400`.
- ID lain (member_id, address_id, product_id, dst): prefix + timestamp base36.

## 2. Sheet — header persis, dilarang menambah/mengubah kolom

### 1. Settings
`key | value | keterangan`

Key wajib (nilai default dalam kurung):
- `OTP_VALID_MINUTES` (30)
- `OTP_RESEND_COOLDOWN_MINUTES` (2)
- `OTP_MAX_PER_DAY` (5)
- `SESSION_VALID_DAYS` (7)
- `POINT_RATE_RP` (1000)
- `POINT_MIN_REDEEM` (0)
- `ONGKIR_PER_KM` (1000)
- `ONGKIR_FAKTOR_KOREKSI` (1.3)
- `ONGKIR_RADIUS_MAX_KM` (15)
- `MIN_ORDER_DELIVERY` (0)
- `QRIS_FILE_ID` (kosong, diisi admin)
- `REKENING_BANK` (kosong)
- `REKENING_NOMOR` (kosong)
- `REKENING_NAMA` (kosong)
- `TELEGRAM_BOT_TOKEN` (kosong)
- `TELEGRAM_SECRET` (kosong — akan digenerate di Fase 5)
- `ADMIN_PASSWORD_HASH` (kosong — hasil hashPassword)
- `ADMIN_CHAT_IDS` (kosong — csv chat_id)
- `TOKO_BUKA` (1)
- `NOMOR_WA_TOKO` (kosong)

### 2. Members
`member_id | nama | no_hp | tgl_lahir | email | jenis_kelamin | total_poin | total_belanja | created_at | status | last_seen_orders_at`

### 3. MemberAddresses
`address_id | member_id | label | detail | alamat_snapshot | latitude | longitude | created_at | status | is_default`
- `is_default`: boolean 0/1; hanya 1 default per member; alamat pertama yang ditambahkan auto-default.

### 4. Products
`product_id | nama | harga | foto_file_id | kategori_id | deskripsi | badge_promo | tersedia | urutan | status`

### 5. Categories
`kategori_id | nama | urutan | status`

### 6. PickupLocations
`lokasi_id | nama | alamat | latitude | longitude | jam_buka | jam_tutup | status`

### 7. DeliverySlots
`slot_id | jam_mulai | jam_selesai | kuota | status`

### 8. Holidays
`tanggal | keterangan`

### 9. Orders
`order_id | member_id | nama | no_hp | tgl_antar | metode_kirim | lokasi_pickup_id | address_id | alamat_snapshot | lat | lng | jarak_km | ongkir | slot_id | subtotal | poin_dipakai | total | metode_bayar | status | catatan_customer | catatan_admin | created_at | updated_at | timeline_json | nama_penerima | no_hp_penerima | status_updated_at | promo_id | promo_code | promo_nama | ongkir_sebelum_promo | promo_diskon_subtotal | promo_diskon_produk | promo_diskon_ongkir | promo_diskon_total | promo_bonus_poin | promo_multiplier_poin | poin_earn_dasar | poin_earn_final | promo_snapshot_json | client_request_id | request_fingerprint | commit_status | commit_stage | commit_error_code | commit_snapshot_json | committed_at | transaction_status | transaction_stage | transaction_error_code | transaction_snapshot_json | cancelled_at | cancelled_by | cancel_reason`

- `metode_kirim`: `AMBIL | DIANTAR | OJOL`
- `metode_bayar`: `COD | TRANSFER`
- `nama_penerima`: string; nama orang yang akan menerima pesanan. Kalau customer tidak specify, server isi dengan snapshot nama pemesan.
- `no_hp_penerima`: string; nomor HP penerima. Aturan validasi: hanya digit setelah trim, panjang 10-14, awalan 08/628/62 dgn digit ke-3 = 8. Kalau customer tidak specify, server isi dengan snapshot no_hp pemesan.
- `subtotal`: subtotal item sebelum promo dan tanpa ongkir.
- `ongkir_sebelum_promo`: ongkir setelah aturan gratis <=5 km, sebelum promo.
- `ongkir`: ongkir final setelah promo.
- `promo_diskon_*`: nominal diskon aktual yang tersnapshot saat checkout.
- `poin_earn_dasar` dan `poin_earn_final`: hak poin yang baru diberikan saat review valid disubmit.
- `promo_snapshot_json`: snapshot konfigurasi dan hasil kalkulasi promo agar order lama tidak berubah ketika PromoCodes diedit.
- `client_request_id`: UUID checkout, unik bersama `member_id`.
- `request_fingerprint`: SHA-256 intent request canonical.
- `commit_status`: state teknis `CREATING | COMMITTED | RECOVERY_REQUIRED`; kosong pada order legacy dianggap committed.
- `commit_stage`, `commit_error_code`, `commit_snapshot_json`, `committed_at`: metadata recovery, terpisah dari status bisnis.

### 10. OrderItems
`order_id | product_id | nama_snapshot | harga_snapshot | qty | subtotal`

### Sheet ProductVariants (BARU — Fase 7.8)
Menyimpan varian per produk. Produk bisa punya 0 varian (produk tanpa varian) atau 1-6 varian (produk bervarian, 1-axis).

Kolom:
- `variant_id` (string, unique) — ID varian, format `var-{timestamp}-{rand}`.
- `product_id` (string) — FK ke Products.product_id.
- `nama_axis` (string) — Nama dimensi bebas, misal "Ukuran", "Level Manis". Sama untuk semua varian dalam 1 produk.
- `nama_varian` (string) — Nama varian, misal "350ml", "500ml".
- `harga` (number) — Harga varian.
- `urutan` (number) — Urutan tampil di popup varian (1, 2, 3...).
- `aktif` (boolean) — TRUE/FALSE. Varian aktif = tampil di menu customer.
- `created_at`, `updated_at` — Timestamp WIB "yyyy-MM-dd HH:mm:ss".

### Perubahan Sheet OrderItems (Fase 7.8)
Tambahan 3 kolom snapshot varian:
- `variant_id` (string) — ID varian yang dipilih customer. Kosong untuk produk tanpa varian.
- `variant_nama_snapshot` (string) — Snapshot nama varian saat order dibuat (misal "500ml").
- `nama_axis_snapshot` (string) — Snapshot nama axis saat order dibuat (misal "Ukuran").

### Perilaku sheet Products vs ProductVariants
- Untuk produk TANPA varian: kolom `harga` di Products dipakai apa adanya.
- Untuk produk DENGAN varian: kolom `harga` di Products dipakai sebagai "harga dasar" (untuk display kartu produk).
- Kolom `harga` di ProductVariants bermakna SELISIH/tambahan dari harga dasar produk. Bisa 0 (tidak menambah) atau positif (menambah).
- Harga final item = Products.harga (dasar) + ProductVariants.harga (selisih).
- Sistem detect produk bervarian dengan query ProductVariants.

### Sheet ProductAddons (BARU — Fase 7.8-D)
Add-on opsional per produk (multiple-select, toggle). Customer bisa pilih 0+ add-on.
- addon_id (string, unique) — format addon-{timestamp}-{rand}.
- product_id (string) — FK ke Products. Add-on nempel ke 1 produk (per-produk, bukan global).
- nama_addon (string) — misal "Extra Shot".
- harga (number) — tambahan flat, ditambahkan ke harga item. Misal 8000.
- urutan (number) — urutan tampil di modal.
- aktif (boolean/string) — aktif = tampil. Konvensi nilai aktif: 'true'/'1'/'ya' (konsisten dgn ProductVariants).
- created_at, updated_at — WIB.
Maks 8 add-on aktif per produk (soft limit UI).

### Sheet OrderItemAddons (BARU — Fase 7.8-D)
Snapshot add-on yang dipilih customer per item order.
- id (string) — unique.
- order_id (string) — FK ke Orders.
- order_item_ref (string) — referensi ke item mana dalam order (kombinasi order_id + product_id + variant_id + index, ditentukan backend).
- addon_id (string) — FK ke ProductAddons (referensi, bisa non-aktif nanti).
- nama_addon_snapshot (string) — snapshot nama saat order.
- harga_snapshot (number) — snapshot harga saat order.
- created_at — WIB.

### Harga item final (update Fase 7.8-D)
Harga 1 item = Products.harga (dasar) + ProductVariants.harga (selisih varian, 0 kalau tanpa varian) + Σ ProductAddons.harga (semua add-on terpilih).

### 11. PointHistory
`id | member_id | order_id | tipe | jumlah | saldo_akhir | keterangan | created_at | event_code | saldo_sebelum | event_status | event_snapshot_json`
- `tipe`: `TAMBAH | PAKAI | KOREKSI`

### 12. Sessions
`token | no_hp | member_id | otp | otp_expires_at | otp_used | session_expires_at | created_at | otp_failed_attempts | otp_locked_at`

- `otp_failed_attempts`: jumlah kegagalan verifikasi untuk row OTP tersebut; default `0`.
- `otp_locked_at`: timestamp WIB saat OTP dikunci setelah lima kegagalan; kosong bila belum dikunci.
- Error `OTP_LOCKED`: OTP tidak dapat digunakan dan pengguna harus meminta OTP baru.

### 13. MessageTemplates
`kode | isi | keterangan`
- Kode wajib: `OTP, ORDER_DITERIMA, ORDER_DIPROSES, ORDER_SIAP, ORDER_DIANTAR, ORDER_SELESAI, ORDER_BATAL`
- Placeholder yang boleh dipakai: `{NAMA} {ORDER_ID} {OTP} {POINT} {TOTAL} {CABANG}`

### 15. Logs
`timestamp | tipe | ref_id | pesan | detail_json`
- `tipe`: `NOTIF | ACTIVITY | ERROR`

### Campaigns
`campaign_id | judul | deskripsi | gambar_file_id | gambar_url | link_url | kode_promo | tanggal_mulai | tanggal_selesai | urutan | status`

- `campaign_id`: ID unik campaign; wajib agar state "sudah dilihat" stabil.
- `judul`, `deskripsi`: teks konteks opsional.
- `gambar_file_id`: Google Drive file ID; diprioritaskan dan dirender sebagai URL `lh3` lebar 800.
- `gambar_url`: fallback URL gambar jika `gambar_file_id` kosong.
- `link_url`: link opsional dari gambar, dibuka di tab baru.
- `kode_promo`: kode opsional yang dapat disalin.
- `tanggal_mulai`, `tanggal_selesai`: batas tanggal inklusif dalam WIB. Kosong atau gagal diparse berarti sisi tersebut tidak membatasi.
- `urutan`: angka urutan antrean popup, ascending.
- `status`: hanya `aktif` (case-insensitive setelah trim) yang dibawa ke katalog.
- Campaign aktif bila status aktif dan hari ini tidak sebelum tanggal mulai valid serta tidak setelah tanggal selesai valid.

### 16. Reviews
`review_id | order_id | member_id | rating | ulasan | status | created_at | request_fingerprint | updated_at`
- `status`: `aktif` / `hidden` / `dihapus`
- `rating`: 1-5 (integer)
- `ulasan`: teks bebas, opsional

### 17. PromoCodes
`promo_id | kode | nama | deskripsi | catatan_customer | aktif | mulai_at | berakhir_at | hari_berlaku | jam_mulai | jam_berakhir | min_subtotal | max_subtotal | metode_kirim | required_product_ids | required_kategori_ids | required_match_mode | member_baru_only | whitelist_member_ids | bisa_dengan_poin | limit_total | limit_per_member | limit_harian | diskon_subtotal_tipe | diskon_subtotal_nilai | diskon_subtotal_max | diskon_produk_ids | diskon_produk_tipe | diskon_produk_nilai | diskon_produk_max | diskon_ongkir_tipe | diskon_ongkir_nilai | diskon_ongkir_max | bonus_poin | multiplier_poin | created_at | updated_at`

- `kode`: unik case-insensitive; backend menormalisasi trim + uppercase.
- `aktif`: menerima `aktif`, `true`, `1`, atau `ya` (case-insensitive).
- Daftar hari, metode, product ID, kategori ID, dan member ID memakai comma-separated string; setiap elemen di-trim.
- `required_match_mode`: `ANY` atau `ALL`.
- Limit kosong/0 berarti tanpa limit.
- Diskon subtotal dan diskon produk tidak boleh aktif bersamaan. Konfigurasi konflik ditolak.
- Tipe diskon harga: `PERSEN | NOMINAL`; tipe diskon ongkir: `GRATIS | PERSEN | NOMINAL`.
- Cap persen kosong/0 berarti tanpa cap.
- Satu kode boleh menggabungkan satu diskon harga, diskon ongkir, bonus poin, dan multiplier poin.

### 18. PromoUsage
`usage_id | promo_id | promo_code | order_id | member_id | status | used_at | used_date | cancelled_at | promo_diskon_subtotal | promo_diskon_produk | promo_diskon_ongkir | promo_diskon_total | promo_bonus_poin | promo_multiplier_poin`

- `status`: `DIGUNAKAN | DIBATALKAN`.
- Hanya row `DIGUNAKAN` yang dihitung untuk limit total, per member, dan harian.
- Ketika order batal, row di-soft-delete menjadi `DIBATALKAN`; row tidak dihapus.

## 3. Daftar Action API (lengkap — dilarang menambah tanpa izin)

- `ping` — health check
- `requestOtp` — kirim OTP via Telegram admin
- `verifyOtp` — verifikasi OTP, buat sesi
- `getMe` — data member + poin + alamat
- `getCatalog` — kategori, produk, lokasi, slot, holidays, settings publik, dan `campaigns` aktif terurut. Penambahan `campaigns` bersifat backward compatible.
- `getSlotAvailability` — kuota slot per tanggal
- `createOrder` — buat order (kritis, dalam lock)
- `getOrderByRequestId` — lookup read-only hasil checkout berdasarkan `client_request_id` milik session
- `validatePromo` — validasi kode dan return breakdown preview server-side; tidak mereservasi limit
- `getMyOrders` — riwayat order member
- `orderMarkSeen` — tandai update status order member sebagai sudah dilihat
- `getMyPoints` — riwayat poin member
- `addAddress` — tambah alamat baru member
- `addressSetDefault` — set 1 alamat jadi default (payload: `{address_id}`, enforce 1 default per member)

### 3B. Idempotency Order (Fase 8-A2)

- `createOrder` wajib membawa `client_request_id` berupa UUID lowercase; uniqueness berlaku pada `member_id + client_request_id`.
- Key sama dan fingerprint intent sama mengembalikan order committed existing; payload berbeda ditolak dengan `ORDER_IDEMPOTENCY_CONFLICT`.
- State teknis order adalah `CREATING | COMMITTED | RECOVERY_REQUIRED`, terpisah dari status bisnis. Order legacy dengan state kosong dianggap committed.
- Hanya order committed/legacy yang tampil sebagai order normal; unresolved order tetap menjadi reservation slot/resource.
- `getOrderByRequestId` membutuhkan session, member-scoped, read-only, dan dapat mengembalikan `ORDER_NOT_FOUND`, `ORDER_STILL_PROCESSING`, atau `ORDER_RECOVERY_REQUIRED`.
- Parent order disimpan lebih dahulu dengan recovery snapshot; item, add-on, promo usage, dan redeem point order baru memakai identifier deterministik.

Plus jalur webhook Telegram melalui capability query `tg_key` yang dicocokkan dengan
Script Property `TELEGRAM_WEBHOOK_KEY` atau `TELEGRAM_WEBHOOK_KEY_NEXT` selama rotasi.
`TELEGRAM_SECRET` tetap boleh dikirim sebagai header resmi Telegram, tetapi header
tersebut tidak dianggap terverifikasi oleh GAS.

## 3A. Aturan PromoCodes (Fase 7.11-A)
- Maksimal satu kode per order; tidak ada stacking kode.
- Frontend hanya mengirim `promo_code` dan `pakai_poin`; nilai harga/diskon/total dihitung ulang backend.
- Urutan: subtotal item -> diskon produk ATAU subtotal -> ongkir normal -> diskon ongkir -> redeem poin -> total.
- Diskon ongkir maksimal sebesar ongkir normal dan tidak dapat membuat ongkir negatif.
- `member_baru_only` berarti member belum pernah memiliki order berstatus `SELESAI`.
- Kondisi hari/jam dan limit harian memakai timezone `Asia/Jakarta`.
- Jika `bisa_dengan_poin` false dan order meminta redeem poin, promo ditolak.
- Cek limit dan append PromoUsage pada createOrder dilakukan dalam `withLock()` yang sama.
- Poin earn: `floor(poin_earn_dasar * multiplier_poin) + bonus_poin`; bonus tidak ikut dikalikan.

## 4. Aturan Poin & Ulasan (F.1)
- Poin diberikan SAAT ULASAN DISUBMIT, bukan saat status SELESAI.
- Deadline review: 7 hari dari waktu status jadi SELESAI.
- Kalau lewat deadline → poin HANGUS (tidak diberikan sama sekali).
- Review pertama yang sah melepaskan tepat satu reward sebesar snapshot `Orders.poin_earn_final`; bonus dan multiplier promo tidak dihitung ulang.
- Edit adalah upsert terhadap review kanonik order dan tidak memberikan reward lagi.
- Mengedit, menyembunyikan, atau menghapus review tidak menarik reward yang sudah diberikan; ledger immutable.

## 4A. Hardening transaksi Fase 8-A3

### State machine

- Hanya admin Telegram aktif yang dapat mengubah status; otorisasi diperiksa lagi di dalam script lock.
- Transisi: `MENUNGGU -> DIPROSES|BATAL`, `DIPROSES -> SIAP|BATAL`, `SIAP -> SELESAI|BATAL`, dan `DIANTAR -> SELESAI|BATAL`.
- `SIAP -> DIANTAR` hanya valid bila `metode_kirim=DIANTAR`. Jalur kompatibel `SIAP -> SELESAI` tetap berlaku.
- `SELESAI` dan `BATAL` terminal. Request ke status yang sudah sama adalah replay sukses `unchanged` dan tidak mengirim notifikasi ulang.
- Order `CREATING` atau `RECOVERY_REQUIRED` tidak boleh diproses lewat state machine bisnis.

### Ledger dan recovery

- ID deterministik: `PTH_ORDER_REDEEM_{order_id}`, `PTH_ORDER_REFUND_{order_id}`, dan `PTH_ORDER_REWARD_{order_id}`.
- `event_code`: `ORDER_REDEEMED`, `ORDER_REDEEM_REFUNDED`, atau `ORDER_REWARD_RELEASED_BY_REVIEW`.
- Saldo hanya boleh bergerak dari `saldo_sebelum` ke `saldo_akhir`. Kondisi selain before/after yang diharapkan menghasilkan konflik dan tidak boleh ditimpa.
- `transaction_status`: `PENDING | APPLIED | RECOVERY_REQUIRED`. Snapshot Orders menyimpan source/target status, actor, waktu, serta before/after saldo atau `total_belanja`.
- Pembatalan mengembalikan redeem dan mengubah tepat satu PromoUsage `DIGUNAKAN -> DIBATALKAN`; duplicate atau status lain adalah konflik.
- `total_belanja` bertambah maksimal satu kali saat pertama menjadi `SELESAI`; reward poin tetap menunggu review.
- Ledger legacy yang ambigu menghasilkan `POINT_LEGACY_AMBIGUOUS` dan membutuhkan rekonsiliasi manual.

### Review

- Hanya pemilik committed order `SELESAI` yang boleh membuat atau mengedit review, maksimal 7 hari dari `status_updated_at` dengan fallback timestamp legacy.
- Rating harus integer 1-5. Komentar maksimal 500 karakter, control character dibuang, dan prefix formula Sheets ditulis sebagai literal.
- Review baru memakai ID `REV_ORDER_{order_id}` dan fingerprint payload. Replay identik idempotent; payload berbeda meng-update row kanonik tanpa reward ulang.
- Public reader hanya memuat review aktif dengan relasi member/order valid dan rating valid.

### Error operasional baru

`UNAUTHORIZED_ACTOR`, `TRANSISI_METODE_TIDAK_VALID`, `CANCEL_REASON_INVALID`, `ORDER_TRANSACTION_RECOVERY_REQUIRED`, `ORDER_TRANSACTION_CONFLICT`, `POINT_EVENT_DUPLICATE`, `POINT_EVENT_CONFLICT`, `POINT_BALANCE_CONFLICT`, `POINT_LEGACY_AMBIGUOUS`, `PROMO_USAGE_DUPLICATE`, `PROMO_USAGE_STATUS_CONFLICT`, `REVIEW_RATING_INVALID`, `REVIEW_TEXT_INVALID`, `REVIEW_DUPLICATE_CONFLICT`, `REVIEW_OWNERSHIP_CONFLICT`, `REVIEW_RECOVERY_REQUIRED`, `REVIEW_REWARD_RECOVERY_REQUIRED`.

### Migration dan prosedur operasional

- Jalankan manual `migrateTransactionHardening_8_A3()` setelah backup dan sebelum deployment kode. Migration hanya menambah header dan aman dijalankan ulang.
- Verifikasi header baru pada `Orders`, `PointHistory`, dan `Reviews` sesuai schema di atas.
- Untuk `RECOVERY_REQUIRED`, hentikan perubahan order terkait, cocokkan snapshot dengan saldo/member/ledger/promo, perbaiki hanya berdasarkan bukti audit, lalu retry request target yang sama.
- Jangan menghapus row ledger, review, order, atau PromoUsage untuk menyelesaikan konflik.

## 4B. Data dan schema safety (Fase 8-B)

### Typed Spreadsheet write boundary

- Seluruh write produksi berbasis object wajib melalui `appendRowObj()`, `appendRowsObj()`, atau `updateRowById()`.
- String biasa diperlakukan sebagai literal. String yang, setelah whitespace awal, dimulai `=`, `+`, `-`, atau `@` disimpan dengan satu apostrof agar tidak dievaluasi sebagai formula.
- String yang sudah diawali apostrof tidak di-escape ulang. Data legacy tidak dinormalisasi atau di-backfill otomatis.
- Number finite, boolean, dan `Date` diteruskan sebagai tipe aslinya. Number non-finite dan object arbitrer ditolak.
- JSON internal dikenali dari kolom `json` pada schema registry atau marker `sheetJson()`/`sheetSerializedJson()`. JSON divalidasi dengan `JSON.parse()` sebelum write dan isi JSON tidak dimodifikasi.
- Formula internal hanya boleh ditulis dengan marker `sheetTrustedFormula('=...')`. String formula tanpa marker selalu menjadi literal.
- ID dan enum tetap harus melewati validator domain; formula safety bukan pengganti validasi tersebut.

### Schema registry

`backend/Schema.gs` mendefinisikan required header, optional/additive header, primary ID, uniqueness, dan kolom JSON untuk sheet produksi. Header dicocokkan berdasarkan nama, bukan posisi. Header kosong, duplicate header, dan missing required header gagal secara tertutup.

`updateRowById()` mensyaratkan tepat satu kecocokan: tidak ditemukan menghasilkan `false`, duplicate ID menghasilkan `DATA_DUPLICATE_PRIMARY_ID`, dan tepat satu row diperbarui. Scan duplicate ID seluruh sheet tidak dilakukan pada setiap read; jalankan fungsi read-only `auditPhase8BSchemaReadOnly()` sebelum deployment.

### Nilai kanonik

- Integer: bentuk desimal integer kanonik, finite, dengan batas domain; empty berbeda dari zero.
- Decimal: bentuk desimal finite tanpa exponent, dengan batas domain.
- Boolean: `true/false` atau `1/0`; alias `aktif/nonaktif` dan `ya/tidak` hanya bila parser dipanggil dengan `activeAliases`.
- Enum: trim lalu normalisasi case sesuai contract dan wajib menjadi anggota allowlist.
- ID: trim, panjang terbatas, dan regex allowlist per domain.
- Tanggal sheet: `yyyy-MM-dd` atau timestamp `yyyy-MM-dd HH:mm[:ss]`, dengan validasi kalender agar tanggal rollover ditolak.

Jalur transaksi fail-closed ketika nilai penting malformed. Reader display boleh mempertahankan fallback aman yang telah didokumentasikan dan tidak memengaruhi saldo, harga, status, autentikasi, promo, atau mutation.

Fase 8-B tidak menambah kolom dan tidak memerlukan migration. Setup dan migration lama boleh memakai direct range write hanya untuk header, seed, formula, atau backfill internal yang trusted dan tetap wajib memvalidasi prerequisite masing-masing.

## 4C. Cache, timeout, observability, dan failure UX (Fase 8-C)

### Cache registry dan catalog revision

- Cache data aplikasi backend adalah `catalog_cache` (TTL 300 detik) dan `setting_<KEY>` (TTL 300 detik). Telegram webhook dedup `tg_upd_*` serta login rate-limit bukan cache data aplikasi.
- Invalidasi dilakukan setelah source mutation sukses. Settings hanya menghapus key terkait; writer Products/DeliverySlots/Settings publik menghapus katalog dan memperbarui revision. Kegagalan invalidasi atau revision dicatat best-effort dan tidak membatalkan commit.
- `getCatalog.data.catalog_revision` adalah field additive. Nilainya opaque (`timestamp-random`), disimpan ringan pada Script Properties, tidak memakai Spreadsheet, tidak bertambah pada read, dan bukan counter atomic.
- Browser boleh initial-render dari `sessionStorage`, kemudian selalu melakukan background refresh saat load untuk menemukan revision/data baru. Revision bukan push invalidation. Response lama atau request yang sudah tidak relevan wajib diabaikan.
- Cache browser malformed/corrupt dibuang. TTL 5 menit tetap menjadi fallback saat revision/cache invalidation gagal.
- Perubahan manual langsung di Spreadsheet tidak dapat menaikkan revision. Perubahan tersebut terlihat setelah TTL backend/browser atau setelah admin menjalankan `/clearcache`.
- `/clearcache` hanya membersihkan cache data Settings dan katalog serta mengganti revision. Command ini tidak menyentuh webhook dedup, login rate-limit, session, pending order, cart, atau campaign-seen browser.

### Timeout dan error transport frontend

- Read ringan: 12 detik; validation/preview: 15 detik; mutation non-order: 20 detik; `createOrder`: 30 detik; `getOrderByRequestId`: 15 detik; geocoding/search: 9 detik.
- Helper request memeriksa HTTP status, JSON valid, dan envelope API. Kategori konsisten: timeout, network, session, validation, stale, busy, unknown transaction, recovery, dan server/internal.
- Mutation tidak di-retry otomatis. Timeout create order tetap menghasilkan state lokal `UNKNOWN`; safe resend tetap melakukan lookup dahulu.
- Browser tanpa `AbortController` memakai timeout settled guard dan request sequence. Network yang sudah berjalan mungkin tidak dapat dibatalkan, tetapi late response tidak boleh memutasi UI dan timer selalu dibersihkan setelah settle.

### Error envelope dan correlation

- Envelope error tetap `{ok:false,error,code}` dan dapat secara additive membawa `correlation_id` serta `reference_code`.
- Create order memakai `client_request_id` UUID tervalidasi sebagai correlation dan idempotency key sesuai kontrak 8-A2. Fase 8-C tidak mengubah aturan idempotency.
- Operasi non-order memakai correlation ID server-side. Nilai correlation bebas dari client tidak diterima ke log.
- Reference code terutama ditampilkan untuk `INTERNAL` dan `*_RECOVERY_REQUIRED`; validation biasa tidak wajib menampilkannya.

### Safe structured operational logging

- Contract logis: timestamp, severity, event code, operation, stage, correlation ID, safe entity reference, error code, dan retryable. Metadata disimpan pada `detail_json`; schema sheet Logs tidak berubah.
- Metadata memakai allowlist dan batas panjang. Redaction dilakukan sebelum serialization. OTP, session token, password, capability key, nomor HP lengkap, alamat, komentar/catatan, raw request, raw Telegram update, dan raw external response body dilarang dicatat.
- Serialization dan write log dibungkus fail-safe. Kegagalan logger tidak memanggil logger yang sama secara rekursif dan tidak menggagalkan flow utama.

### Failure UX dan network eksternal

- Session expiry hanya membersihkan session lokal dan meminta login ulang; cart, pending order unresolved, serta state `UNKNOWN` tidak berubah dan tidak ada redirect/login loop.
- Validation menunjuk input yang perlu diperbaiki. Timeout/network mempertahankan input dan menawarkan retry manual. Stale data menawarkan refresh. Busy memakai tombol sama. Unknown order wajib diperiksa tanpa blind resend. Recovery meminta menghubungi admin.
- Geocoding membedakan not-found dari network/timeout, mempertahankan alamat valid sebelumnya, serta mengabaikan hasil lama setelah lokasi baru atau navigasi.
- `UrlFetchApp.fetch()` tidak dapat dibatalkan setelah dimulai. Telegram deadline hanya budget sebelum network call, bukan hard network timeout. HTTP, malformed JSON, API error, dan network failure diklasifikasikan; notifikasi setelah commit tetap best-effort tanpa retry otomatis.

## 5. Struktur Repo

```
Samijaya/
├── docs/                 ← frontend (GitHub Pages)
│   ├── index.html
│   ├── style.css
│   ├── config.js         ← hanya API_URL
│   ├── app.js
│   └── map.js
├── backend/              ← Apps Script (clasp)
│   ├── appsscript.json
│   ├── Util.gs
│   ├── Lock.gs
│   ├── Router.gs
│   ├── Setup.gs
│   ├── Auth.gs
│   ├── Catalog.gs
│   ├── Order.gs
│   ├── Point.gs
│   └── Telegram.gs
├── CONTRACT.md
├── RULES.md
└── PLAN.md
```

# CONTRACT — Samijaya MVP

## 1. Aturan Umum
- Database: Google Spreadsheet, ID dibaca dari Script Properties `SPREADSHEET_ID`.
- Semua response API: `{ok:true, data:...}` atau `{ok:false, error:"pesan", code:"KODE"}`. (Error codes baru: `NAMA_PENERIMA_TIDAK_VALID`, `NO_HP_PENERIMA_TIDAK_VALID`, `VARIANT_REQUIRED`, `VARIANT_NOT_FOUND`, `VARIANT_INACTIVE`, `VARIANT_MISMATCH`).
- Request FE→BE: HTTP POST, `Content-Type: text/plain`, body JSON string `{action, payload, token?}`.
- Status order (enum, dilarang menambah): `MENUNGGU, DIPROSES, SIAP, DIANTAR, SELESAI, BATAL`.
- `order_id`: `SJ` + YYMMDD + 3 digit urut harian (contoh `SJ260717001`), digenerate DI DALAM lock.
- Tanggal: `YYYY-MM-DD`. Waktu: `HH:mm`. Timezone: Asia/Jakarta.
- Foto: simpan `FILE_ID` Google Drive; URL tampil = `https://drive.google.com/thumbnail?id=<FILE_ID>&sz=w400`.
- ID lain (member_id, address_id, product_id, dst): prefix + timestamp base36.

## 2. Sheet (16) — header persis, dilarang menambah/mengubah kolom

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
`member_id | nama | no_hp | tgl_lahir | email | jenis_kelamin | total_poin | total_belanja | created_at | status`

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
`order_id | member_id | nama | no_hp | tgl_antar | metode_kirim | lokasi_pickup_id | address_id | alamat_snapshot | lat | lng | jarak_km | ongkir | slot_id | subtotal | poin_dipakai | total | metode_bayar | status | catatan_customer | catatan_admin | created_at | updated_at | timeline_json | nama_penerima | no_hp_penerima`

- `metode_kirim`: `AMBIL | DIANTAR | OJOL`
- `metode_bayar`: `COD | TRANSFER`
- `nama_penerima`: string; nama orang yang akan menerima pesanan. Kalau customer tidak specify, server isi dengan snapshot nama pemesan.
- `no_hp_penerima`: string; nomor HP penerima. Aturan validasi: hanya digit setelah trim, panjang 10-14, awalan 08/628/62 dgn digit ke-3 = 8. Kalau customer tidak specify, server isi dengan snapshot no_hp pemesan.

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
`id | member_id | order_id | tipe | jumlah | saldo_akhir | keterangan | created_at`
- `tipe`: `TAMBAH | PAKAI | KOREKSI`

### 12. Sessions
`token | no_hp | member_id | otp | otp_expires_at | otp_used | session_expires_at | created_at`

### 13. MessageTemplates
`kode | isi | keterangan`
- Kode wajib: `OTP, ORDER_DITERIMA, ORDER_DIPROSES, ORDER_SIAP, ORDER_DIANTAR, ORDER_SELESAI, ORDER_BATAL`
- Placeholder yang boleh dipakai: `{NAMA} {ORDER_ID} {OTP} {POINT} {TOTAL} {CABANG}`

### 14. Banners
`banner_id | judul | foto_file_id | link | urutan | status`

### 15. Logs
`timestamp | tipe | ref_id | pesan | detail_json`
- `tipe`: `NOTIF | ACTIVITY | ERROR`

### 16. Reviews
`review_id | order_id | member_id | rating | ulasan | status | created_at`
- `status`: `aktif` / `hidden` / `dihapus`
- `rating`: 1-5 (integer)
- `ulasan`: teks bebas, opsional

## 3. Daftar Action API (lengkap — dilarang menambah tanpa izin)

- `ping` — health check
- `requestOtp` — kirim OTP via Telegram admin
- `verifyOtp` — verifikasi OTP, buat sesi
- `getMe` — data member + poin + alamat
- `getCatalog` — banner, kategori, produk, lokasi, slot, holidays, settings publik
- `getSlotAvailability` — kuota slot per tanggal
- `createOrder` — buat order (kritis, dalam lock)
- `getMyOrders` — riwayat order member
- `getMyPoints` — riwayat poin member
- `addAddress` — tambah alamat baru member
- `addressSetDefault` — set 1 alamat jadi default (payload: `{address_id}`, enforce 1 default per member)

Plus jalur webhook Telegram (via `TELEGRAM_SECRET` di header).

## 4. Aturan Poin & Ulasan (F.1)
- Poin diberikan SAAT ULASAN DISUBMIT, bukan saat status SELESAI.
- Deadline review: 7 hari dari waktu status jadi SELESAI.
- Kalau lewat deadline → poin HANGUS (tidak diberikan sama sekali).
- Ulasan bisa dihapus dan disubmit ulang selama masih dalam deadline 7 hari.

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
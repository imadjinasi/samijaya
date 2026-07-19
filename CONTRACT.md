# CONTRACT — Samijaya MVP

## 1. Aturan Umum
- Database: Google Spreadsheet, ID dibaca dari Script Properties `SPREADSHEET_ID`.
- Semua response API: `{ok:true, data:...}` atau `{ok:false, error:"pesan", code:"KODE"}`.
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
`address_id | member_id | label | detail | alamat_snapshot | latitude | longitude | created_at | status`

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
`order_id | member_id | nama | no_hp | tgl_antar | metode_kirim | lokasi_pickup_id | address_id | alamat_snapshot | lat | lng | jarak_km | ongkir | slot_id | subtotal | poin_dipakai | total | metode_bayar | status | catatan_customer | catatan_admin | created_at | updated_at | timeline_json`

- `metode_kirim`: `AMBIL | DIANTAR | OJOL`
- `metode_bayar`: `COD | TRANSFER`

### 10. OrderItems
`order_id | product_id | nama_snapshot | harga_snapshot | qty | subtotal`

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
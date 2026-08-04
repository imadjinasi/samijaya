# Samijaya Operations Runbook

Gunakan bersama dokumen readiness, reconciliation, dan incident. Jangan simpan secret, PII, raw payload, atau data production di repo.

## Backup

1. Full Spreadsheet copy bernama `Samijaya-backup-YYYYMMDD-HHmm-WIB`.
2. Export workbook dengan timestamp sama; jangan overwrite.
3. Snapshot Apps Script source dan release Git commit/tag.
4. Catat Apps Script version, fixed deployment ID, dan web-app URL.
5. Catat nama configuration sebagai presence only, tanpa nilai.
6. Catat webhook state tanpa capability URL/key.
7. Record owner, timestamp, artifact location, checksum bila ada, dan restore-read test.

## Restore drill staging — approval terpisah

Gunakan workbook copy, deployment staging, serta bot staging/mock. Jangan mengubah webhook produksi. Buktikan workbook dapat dipakai; backend menunjuk copy; full schema lulus; login member uji/katalog/order/status/review/poin bekerja; frontend menunjuk staging; lalu rollback konfigurasi staging dan ulangi health/reconciliation.

## Deployment fixed ID

1. Backup dan verifikasi release commit.
2. Jalankan `clasp` dari folder `backend` karena `.clasp.json` berada di sana.
3. `clasp push` hanya setelah approval.
4. Full schema gate; migration hanya bila `REQUIRED`, setelah backup dan approval khusus.
5. Deploy: `clasp deploy -i AKfycbxwvjM6cZLD5OIbj7-huIkdonJNfQP8efvkTXGp1dIdmpNBjrAxgLDHPs3C9kPrtEMc`.
6. Jangan deploy produksi tanpa `-i`.
7. Ping/Telegram smoke; cocokkan source URL dengan fixed deployment tanpa memaparkan capability.
8. Push release Git lalu verifikasi GitHub Pages source/settings. Repo tidak memiliki workflow Pages.
9. Hard refresh/cache check, order uji, reconciliation, monitoring, continue/rollback decision.

## Rollback

- Backend: fixed deployment kembali ke Apps Script version terakhir yang baik.
- Frontend: revert melalui commit baru, push tanpa force, verifikasi Pages/hard refresh.
- Data: jangan hapus conflict row; restore hanya setelah recovery point dan post-backup impact diketahui.
- Properties: restore dari inventory rahasia luar repo dengan dual control.
- Webhook: current/next rotation, smoke, finalisasi; jangan log key.
- Cache: `/clearcache` hanya setelah source benar; bukan pemulihan transaksi/session/webhook.

Setelah rollback ulangi schema, health, smoke subset, reconciliation, dan log review. Data restore adalah pilihan terakhir.

Evidence record: requirement, status, safe reference, owner, timestamp WIB, release version, rollback result. Redaksi screenshot secara manual.

## Data Handbook

Sheet `Handbook` adalah panduan operator ke-22 dan tidak termasuk 21 sheet bisnis. Header tabel tetap di row pertama. Gunakan filter `sheet_name`, `input_mode`, `required`, atau `sensitive` untuk menemukan panduan; warna mode hanya bantuan visual.

Arti mode:

- `MANUAL`: operator boleh mengisi sesuai format dan relasi yang dijelaskan.
- `SYSTEM`: dihasilkan sistem; gunakan frontend/Telegram yang disebutkan bila tersedia.
- `MIXED`: dapat berubah lewat operasi manual dan sistem; perhatikan dampak cache dan transaksi baru.
- `FORMULA`: hanya formula yang dikelola sistem/migration.
- `DO_NOT_EDIT`: jangan koreksi manual; ikuti reconciliation/runbook bila ada konflik.

Urutan aman untuk workbook existing:

1. Buat backup Spreadsheet dan pastikan source release sudah diverifikasi.
2. Jalankan deployment schema/readiness audit yang relevan. Jangan memperbaiki row transaksi secara manual.
3. Jalankan satu fungsi `migrateDatabase()` dari editor Apps Script. Fungsi ini mem-preflight seluruh header, membuat tab/kolom yang belum ada, mempertahankan kolom tambahan operator, lalu menyinkronkan Handbook dan managed header note.
4. Periksa `created_sheets`, `added_columns`, `preserved_unknown_columns`, `row_conflicts`, dan `note_conflicts` pada log. Pertahankan custom column/row/note sampai pemiliknya memutuskan tindak lanjut.
5. Jalankan `auditDataHandbookCoverageReadOnly()`. Audit bersih harus tidak memiliki missing header/row, duplicate, stale row, note conflict, invalid mode, atau missing sensitive classification. `custom_row` boleh tetap ada.
6. Jangan menjalankan migration backfill row hanya karena migration struktur selesai. `migrateOrderItemRef`, `migrateAddressDefault`, `migrateOrderSeen`, template, dan legacy product mapping tetap membutuhkan bukti serta approval terpisah.
7. Setelah semua gate lokal dan staging lulus, barulah lakukan `clasp push`/fixed-ID deployment sesuai approval terpisah.

Jangan menaruh secret atau nilai produksi dalam Handbook. Perbarui `DataHandbook.gs` ketika header, parser, writer, default efektif, enum, sensitivitas, atau cara operasional berubah; jalankan ulang migration dan audit setelah perubahan source disetujui.

Untuk workbook lama yang belum memiliki field promo add-on/kelipatan, jalankan runner struktur tunggal `migrateDatabase()` hanya setelah backup. Untuk `OrderItems.product_id` legacy, jalankan `auditLegacyOrderItemProductMappingReadOnly()` lebih dahulu. Migration `migrateLegacyOrderItemProductIdsByExactName()` hanya mengubah row yang `nama_snapshot`-nya sama persis dengan tepat satu produk aktif maupun nonaktif saat ini; row unmatched/ambiguous tetap tidak diubah dan wajib direkonsiliasi manual.

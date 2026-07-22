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

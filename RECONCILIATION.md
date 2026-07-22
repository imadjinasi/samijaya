# Samijaya Reconciliation

Entry point gabungan: `auditPhase8DReadinessReadOnly()`. Untuk workbook besar jalankan helper section read-only terpisah. Section gagal atau bounded tidak boleh dihitung PASS.

Audit tidak memperbaiki data, menulis sheet/cache/property, mengirim Telegram, atau memanggil network. Sample maksimal sepuluh dan hanya safe reference; istilah ini bukan klaim anonimisasi kuat.

Severity/status: `CRITICAL` launch blocker; `ERROR` anomaly/failure; `WARNING` perlu verifikasi/risk approval; `UNVERIFIED` bukti tidak cukup/legacy ambigu/bounded; `VERIFIED` pemeriksaan penuh tanpa conflict. Missing `CATALOG_CACHE_REVISION` adalah warning.

Audit mencakup duplicate ID, commit/recovery, child missing/orphan, deterministic ledger, saldo yang dapat dibuktikan, legacy ambiguity, PromoUsage, review/reward, member spend, omzet committed `SELESAI`, OTP lock anomaly, recent logs, full schema, dan property presence/format.

## Conflict procedure

1. Freeze entity dan catat safe reference/correlation.
2. Backup sebelum koreksi.
3. Cocokkan snapshot, child rows, member balance/spend, ledger, PromoUsage, dan review.
4. Legacy memerlukan opening balance/evidence; jangan diasumsikan valid.
5. Jangan menghapus order, ledger, review, atau PromoUsage.
6. Data fix memerlukan approval terpisah, peer review, dan audit ulang.

`total_belanja` legacy tanpa transaction evidence adalah `UNVERIFIED`, bukan conflict fatal. Omzet audit hanya menjumlah subtotal order committed/legacy-committed `SELESAI`.

Logs dibaca maksimal 250 baris terbaru. Bila window terbatas, status `UNVERIFIED`; review window terpisah diperlukan sebelum menyatakan sejarah bersih.

Record: release/version, audit reference, section status, counts awal/akhir, owner, timestamp WIB, accepted-risk link, dan tindakan. Jangan salin raw row/payload.

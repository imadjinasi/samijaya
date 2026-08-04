# Samijaya Launch Readiness

Gate terpusat Fase 8-D. Status sah: `PASS`, `FAIL`, `NOT TESTED`, `NOT APPLICABLE`, `ACCEPTED RISK`. `PASS` wajib memiliki evidence bertanggal, owner, dan rollback.

Audit schema 8-B pernah menghasilkan `ok: true`, tetapi statusnya **REVERIFY REQUIRED** karena registry dan workbook kemudian menghapus requirement `Banners`. Release source terbaru wajib diaudit ulang. Header yang tersedia membuktikan hasil migration tersedia, bukan waktu atau aktor eksekusi.

## Gate record

| Requirement | Status | Evidence | Verification | Owner | Verified at | Failure action |
|---|---|---|---|---|---|---|
| Release commit/tag | NOT TESTED | `<commit/tag>` | Cocokkan HEAD/remote/tag | `<owner>` | `<WIB timestamp>` | Stop rollout |
| Backup lengkap | NOT TESTED | `<backup refs>` | Operations runbook | `<owner>` | `<timestamp>` | Jangan deploy |
| Full launch schema | NOT TESTED | `<audit ref>` | `auditPhase8DLaunchSchemaReadOnly()` | `<owner>` | `<timestamp>` | Migration hanya setelah approval |
| Reconciliation awal/akhir | NOT TESTED | `<audit refs>` | `auditPhase8DReadinessReadOnly()` | `<owner>` | `<timestamp>` | Freeze conflict; NOT READY |
| Script configuration | NOT TESTED | `<presence record>` | Status saja, tanpa nilai | `<owner>` | `<timestamp>` | Restore inventory aman |
| Restore drill staging | NOT TESTED | `<drill ref>` | Operations runbook | `<owner>` | `<timestamp>` | Rollback staging |
| Smoke staging/production | NOT TESTED | `<matrix ref>` | Matrix di bawah | `<owner>` | `<timestamp>` | Rollback release |
| Controlled soak | NOT TESTED | `<observation ref>` | Checks awal/tengah/akhir | `<owner>` | `<timestamp>` | Perpanjang soak |

## Configuration inventory

Jangan mencatat nilai property/secret.

| Name/location | Required | Consumer | Allowed evidence | Rotation | Missing impact | Auto-create safe? |
|---|---|---|---|---|---|---|
| Script Property `SPREADSHEET_ID` | Yes | Sheet access | `present`/`missing` | Workbook change, dual review | Backend gagal | No |
| `TELEGRAM_WEBHOOK_KEY` | Jika webhook aktif | Router | `present`/`missing` | Current/next | Webhook ditolak | No |
| `TELEGRAM_WEBHOOK_KEY_NEXT` | Optional | Rotation | `present`/`missing` | Hapus setelah finalisasi | None outside rotation | No |
| `CATALOG_CACHE_REVISION` | Optional | Catalog cache | `present`/`missing`/`format_valid` | Auto-managed | Warning; TTL fallback | Ya, hanya mutation normal; bukan audit |
| Settings `TELEGRAM_BOT_TOKEN` | Jika Telegram aktif | Telegram API | presence only | Incident/periodic | Bot gagal | No |
| Settings `TELEGRAM_SECRET` | Recommended | Defense-in-depth | presence only | Bersama webhook | Defense berkurang | No |
| Settings `ADMIN_PASSWORD_HASH` | Yes | Admin login | presence only | Policy | Login admin gagal | No |
| Settings `ADMIN_CHAT_IDS` | Yes | Authorization/notification | presence only | Staff change | Admin access/notif gagal | No |

OTP/session policy berada di Settings. Rate-limit dan webhook dedup berada di CacheService. Hard-coded `WEBHOOK_URL` dan frontend `API_URL` adalah configuration risk; cocokkan dengan fixed deployment aktif tanpa refactor otomatis.

## Migration ledger

Status migration: `VERIFIED`, `UNVERIFIED`, `NOT REQUIRED`, `REQUIRED`, `FAILED`.

| Function | Result | Rerun | Current status | Recovery |
|---|---|---|---|---|
| `migrateVariants_7_8_A` | Variant sheet/fields | Additive/idempotent | UNVERIFIED | Restore workbook |
| `migrateAddons` | Add-on sheets | Create-if-missing | UNVERIFIED | Restore workbook |
| `migrateOrderItemRef` | Item ref/backfill | Conditional backfill | UNVERIFIED | Verify ordering evidence |
| `migrateAddressDefault` | Default field/backfill | Conditional backfill | UNVERIFIED | Restore/reconcile |
| `migrateTemplates_FixB1` | Template upsert | Rewrites known templates | UNVERIFIED | Restore template snapshot |
| `migrateCampaigns` | Campaigns | Header strict | UNVERIFIED | Restore workbook |
| `migrateOrderSeen` | Seen timestamps | Additive/backfill | UNVERIFIED | Restore snapshot |
| `migratePromoCodes_7_11_A` | Promo sheets/order fields | Additive | UNVERIFIED | Restore workbook |
| `migratePromoAddons` | Tujuh field promo add-on/kelipatan | Additive/idempotent | UNVERIFIED | Restore workbook |
| `migrateSessionsSecurity_8_A1` | OTP lock fields | Additive | UNVERIFIED | Restore workbook |
| `migrateOrderIdempotency_8_A2` | Commit fields | Additive | UNVERIFIED | Restore workbook |
| `migrateTransactionHardening_8_A3` | Transaction/ledger/review fields | Additive | UNVERIFIED | Restore workbook |
| `migrateLegacyOrderItemProductIdsByExactName` | Remap product_id legacy bila nama persis dan unik | Conditional; backup wajib | REQUIRED | Audit ulang dan pulihkan backup bila bukti mapping salah |
| Fase 8-B/8-C | No migration | N/A | NOT REQUIRED | N/A |

Update status dari full schema gate. Jangan menjalankan migration produksi dari checklist ini.

## Smoke and monitoring

Record tiap case dengan status/evidence/owner/timestamp/rollback: OTP/login/logout/session expiry; catalog/cache/revision; campaign/copy promo; promo valid/invalid/stale; poin on/off; semua metode kirim; slot/holiday; stored/ad-hoc address; create/double-click; timeout `UNKNOWN`; lookup/safe resend; Telegram status; `DIANTAR`; cancel/refund/promo cancellation; review first/replay/edit; omzet; notification failure; schema/correlation/redaction; mobile/desktop; offline/slow network.

Minimum staging observation adalah 24 jam **dengan aktivitas terkontrol**, bukan idle: baseline health/audit/reconciliation; order lifecycle; Telegram staging/mock; repeated health/log checks awal-tengah-akhir; reconciliation akhir. Pantau error rate, recovery, unresolved unknown, duplicate/schema error, OTP lockout, Telegram/notif failure, stale cache, conversion/drop-off, dan ledger mismatch.

## Accepted risk

| Risk | Rationale | Mitigation | Owner | Review date | Approval |
|---|---|---|---|---|---|
| `<risk>` | `<reason>` | `<monitor/rollback>` | `<owner>` | `<date>` | `<approver/timestamp>` |

Minor UI legacy dan address-row loading adalah kandidat `POST-LAUNCH`, bukan accepted risk otomatis.

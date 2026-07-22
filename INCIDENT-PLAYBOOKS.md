# Samijaya Incident Playbooks

Pola umum: record gejala/safe reference; pemeriksaan read-only; freeze transaksi ambigu; backup sebelum koreksi; eskalasi; tutup setelah health, smoke subset, reconciliation, dan monitoring stabil. Jangan masukkan secret/PII ke tiket.

| Incident | Safe checks / first action | Do not | Closure evidence |
|---|---|---|---|
| Telegram diam | Ping, recent events, config presence | Blind webhook reset | Bot smoke dan logs stabil |
| Capability ditolak | Current/next presence, rejected count | Cetak key/URL | Authorized update sukses |
| OTP gagal/locked | Session anomaly/rate pattern | Baca/kirim OTP/token | OTP baru dan lock rate normal |
| Katalog stale | Source/revision/TTL; clear only if source correct | Anggap missing revision corruption | Fresh catalog check |
| Frontend timeout | Ping/reference/network UX | Blind mutation retry | Stable request/state preserved |
| Order `UNKNOWN` | Member-scoped request lookup | Blind resend | Result/absence terbukti |
| Order recovery | Freeze; reconcile snapshot/children/ledger/promo | Delete rows/status processing | Audit clean |
| Duplicate/schema | Full schema/duplicate audit | Rename/delete tanpa evidence | Gates pass |
| Refund/reward conflict | Event/before-after/snapshot | Force overwrite balance | Ledger/balance verified |
| PromoUsage conflict | Single usage vs order snapshot | Delete usage | Reconciliation clean |
| Log write failure | External execution evidence/schema/access | Recursive logging/raw payload | Controlled event logs safely |
| Wrong backend | Fixed version/release check | Deploy tanpa `-i` | Fixed URL approved version |
| Wrong frontend | Pages source/release check | Force push | Approved commit visible |
| Rollback | Operations rollback section | Mix code/data restore casually | Post-rollback gates pass |
| Secret leak | Revoke/rotate, webhook current/next, sessions if needed | Paste values in repo/ticket | Old rejected/new smoke passes |
| Notification failure | Confirm commit, inspect classification | Rollback committed order | Data correct/path restored |

Isi sebelum launch: `<technical owner>`, `<operations owner>`, `<security owner>`, `<on-call channel>`, `<severity/SLA>`.

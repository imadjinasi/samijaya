# Samijaya Hardening Backlog

Ringkasan permanen; detail kontrak tetap berada di `CONTRACT.md`.

| Status | Fase | Item | Bukti singkat |
|---|---|---|---|
| DONE | 8-A1 | Session, OTP, Telegram capability, dedup, dan login rate-limit hardened | `Auth.gs`, `Router.gs`, `Telegram.gs`, `security-harness.js` |
| DONE | 8-A2 | Create-order idempotent, lookup unknown, dan recovery snapshot | `Order.gs`, `order-idempotency-harness.js` |
| DONE | 8-A3 | State machine, ledger poin/refund, promo cancellation, dan review hardening | `Order.gs`, `Point.gs`, `Review.gs`, `transaction-hardening-harness.js` |
| DONE | 8-B | Typed/formula-safe write boundary, schema registry, parser kanonik, duplicate-ID protection | `Util.gs`, `Schema.gs`, `data-schema-safety-harness.js` |
| DONE | 8-C | Cache registry, targeted invalidation, opaque catalog revision, browser consistency | `Util.gs`, `Catalog.gs`, `app.js`, cache harness |
| DONE | 8-C | Timeout policy, late-response suppression, geocoding failure safety | `app.js`, `map.js`, frontend failure harness |
| DONE | 8-C | Fail-safe structured logging, correlation, Telegram response classification | `Util.gs`, `Router.gs`, `Telegram.gs` |
| DONE | 8-C | Failure UX dan loading/button cleanup pada flow utama | `app.js`, frontend failure harness |
| DONE | 8-D | Data Handbook deklaratif, idempotent managed rows/header notes, dan coverage audit | `DataHandbook.gs`, `data-handbook-harness.js` |
| OPEN | UI minor | Sebagian screen legacy masih memakai inline style/`alert()` dan copy generik | Tidak diubah agar tidak menjadi redesign |
| OPEN | UI minor | Tombol delete/default address belum mempunyai indikator loading per-row | Retry manual tetap tersedia |
| OPEN | Data legacy | Mutation manual Spreadsheet bergantung pada TTL atau `/clearcache` | Monitor setelah deployment |
| OPEN | Data legacy | CacheService dan Script Properties bersifat best-effort | TTL dan safe logging menjadi fallback |
| DEFERRED | 8-D | Staging soak test, production smoke test, monitoring eksternal, backup/restore drill | Pekerjaan operasional; di luar scope 8-C |
| DEFERRED | 8-D | Launch gate, rollout observation, dan incident rehearsal | Memerlukan otorisasi/deployment terpisah |

Tidak ada migration atau perubahan schema Spreadsheet pada Fase 8-C.

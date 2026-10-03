# Samijaya on Mi8

This runbook applies to the Node/PostgreSQL deployment. The legacy Apps Script and Spreadsheet procedure remains in `OPERATIONS-RUNBOOK.md` for rollback.

## Layout

- Ubuntu chroot: `/data/local/ubuntu26` on Android.
- Application: `/srv/samijaya/current`, a symlink to a versioned release under `/srv/samijaya/releases`.
- Private configuration: `/srv/samijaya/prod.env` (root, mode `600`).
- PostgreSQL: Termux PostgreSQL on `127.0.0.1:5432`; production database `samijaya`, role `samijaya_app`.
- Node: `127.0.0.1:3100`, PID `/srv/samijaya/app.pid`, log `/srv/samijaya/logs/app.log`.
- Dedicated Cloudflare tunnel: `/etc/mi8vps/cloudflared-samijaya.token` (mode `600`), metrics `127.0.0.1:20242`, log `/var/log/cloudflared-samijaya.log`.
- RuangHadir uses port `3000` and cloudflared metrics `20241`; inspect it after host changes.

## Administration

Use `ssh mi8vps` for normal application administration. This alias reaches the Ubuntu chroot directly over Tailscale as the non-root `admsamijaya` user. Use `sftp mi8vps` or `scp ... mi8vps:...` for file transfer. Keep application paths under `/srv/samijaya`; do not create `/var/www` aliases.

Use `ssh mi8vps-root` only for privileged Android, chroot, PostgreSQL, process, and secret-file maintenance. From its Termux prompt, enter Ubuntu with:

```sh
chroot /data/local/ubuntu26 /usr/bin/env -i HOME=/root PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /bin/bash -l
```

The prompt changes to `root@localhost:/#`. Do not run `chroot` again from there. `admsamijaya` has no functional `sudo` because `/data` is mounted `nosuid`; do not remount it. The older Cloudflare SSH hostnames under `ruanghadir.my.id` have been retired. Cloudflare tunnels provide public application ingress, not host administration.

## Start and stop

From inside Ubuntu, use `/srv/samijaya/current/deploy/start-app.sh` and `stop-app.sh`. The scripts inspect the recorded PID and signal only this application. Check `/_health` and `/_ready` on `127.0.0.1:3100`; `/_ready` verifies access to the imported 21-table manifest. A 200 response is necessary but does not replace row reconciliation or customer action tests.

Never print `prod.env` or tunnel token in a command, log, issue, or chat. Use a name-only presence check for required variables. Restart Node after changing environment values.

## Data migration and release gate

1. Stop writes through the old frontend/API and record the start of the cutover window.
2. Copy the current production Spreadsheet and export a fresh XLSX. Retain the copy, original export, checksum, and pre-cutover PostgreSQL dump as rollback evidence.
3. Import all 21 business sheets into a new database in one transaction. Preserve the original rows in the export. Check manifest counts against actual table counts; reconcile Members, Sessions, Products, ProductVariants, ProductAddons, Orders, OrderItems, OrderItemAddons, PointHistory, PromoCodes, and PromoUsage.
4. Check duplicate primary IDs and orphan references. Do not alter an ambiguous production row without a documented decision. In particular, the 2026-10-03 export had duplicate `ProductAddons.addon_id` values on sheet rows 2–4.
5. Move secret Settings values into `prod.env`, including `DEMO_OTP`, then run `migrations/redact_secret_settings.sql` on the target database. Verify the targeted database values are blank and the required environment variables are present without printing values. Keep the untouched workbook export as the rollback source.
6. Run action tests against a separate database using a synthetic member and session. Cover order creation and replay, admin status transitions, reviews and points, and negative cases. Keep outbound Telegram and JalurPesan calls disabled in the test process.
7. Verify secrets by presence only, start the production Node process, and check loopback health, readiness, frontend, admin, and API.
8. Start the dedicated tunnel manually. Confirm its connector health and metrics on `20242`, then public HTTPS paths. Confirm RuangHadir public health and metrics on `20241`.
9. Register the new Telegram webhook only after the public route and capability key checks pass. Verify webhook state without logging the capability URL. Test OTP only with a designated test phone.
10. Record release commit, database dump checksum, tunnel state, public smoke results, and rollback decision. Add safe boot integration only after acceptance.

## Rollback

Keep the old Apps Script backend, Spreadsheet backup, and previous versioned Node release available. If the new release fails before public cutover, stop only Samijaya's PID, point `current` back to the prior release, and restart it. If public cutover fails, restore the prior customer route and webhook configuration, then verify RuangHadir and the previous Samijaya path. A PostgreSQL restore requires a captured recovery point and an explicit assessment of writes made after it; do not overwrite new orders blindly.

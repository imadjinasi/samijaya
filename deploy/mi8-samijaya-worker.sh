#!/system/bin/sh
set -u

STATE=/data/local/mi8vps
ROOT=/data/local/ubuntu26
PIDFILE="$STATE/samijaya-worker.pid"
LOG="$STATE/samijaya-worker.log"
APP_PIDFILE="$ROOT/srv/samijaya/app.pid"

if [ -s "$PIDFILE" ]; then
    OLD_PID="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [ -n "$OLD_PID" ] && [ -r "/proc/$OLD_PID/cmdline" ]; then
        OLD_CMD="$(tr '\000' ' ' < "/proc/$OLD_PID/cmdline" 2>/dev/null || true)"
        case "$OLD_CMD" in
            *mi8-samijaya-worker.sh*) exit 0 ;;
        esac
    fi
fi

echo $$ > "$PIDFILE"
exec >>"$LOG" 2>&1
echo "Samijaya worker started $(date), pid=$$"

app_running() {
    [ -s "$APP_PIDFILE" ] || return 1
    APP_PID="$(cat "$APP_PIDFILE" 2>/dev/null || true)"
    [ -n "$APP_PID" ] && [ -r "/proc/$APP_PID/cmdline" ] || return 1
    APP_CMD="$(tr '\000' ' ' < "/proc/$APP_PID/cmdline" 2>/dev/null || true)"
    case "$APP_CMD" in
        *"node server/index.js"*) return 0 ;;
    esac
    return 1
}

connector_running() {
    for P in $(pidof cloudflared 2>/dev/null || true); do
        [ -r "/proc/$P/cmdline" ] || continue
        CMD="$(tr '\000' ' ' < "/proc/$P/cmdline" 2>/dev/null || true)"
        case "$CMD" in
            *"--metrics 127.0.0.1:20242"*"/etc/mi8vps/cloudflared-samijaya.token"*) return 0 ;;
        esac
    done
    return 1
}

while :; do
    if ! app_running; then
        if [ -e "$APP_PIDFILE" ]; then
            mv "$APP_PIDFILE" "$APP_PIDFILE.stale.$(date +%s)"
        fi
        if chroot "$ROOT" /usr/bin/env -i HOME=/root \
          PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
          /bin/bash /srv/samijaya/current/deploy/start-app.sh; then
            echo "Samijaya app started $(date)"
        else
            echo "WARN: Samijaya app start failed $(date)"
        fi
    fi

    if ! connector_running; then
        nohup su -g 0 -G 3003 -c \
          "exec chroot $ROOT /usr/local/bin/cloudflared tunnel --no-autoupdate --metrics 127.0.0.1:20242 --loglevel info --logfile /var/log/cloudflared-samijaya.log run --token-file /etc/mi8vps/cloudflared-samijaya.token" \
          </dev/null >/dev/null 2>&1 &
        echo "Samijaya connector launched $(date)"
    fi

    sleep 30
done

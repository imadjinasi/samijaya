#!/bin/sh
set -eu
root=/srv/samijaya
pidfile="$root/app.pid"
log="$root/logs/app.log"
if [ -f "$pidfile" ]; then
  old=$(cat "$pidfile")
  if [ -r "/proc/$old/cmdline" ] && tr '\000' ' ' < "/proc/$old/cmdline" | grep -q '/usr/bin/node server/index.js'; then
    echo "Samijaya already running: $old"
    exit 0
  fi
  echo 'Existing PID file does not identify a running Samijaya process; inspect it before restart' >&2
  exit 2
fi
test -f "$root/prod.env"
test -f "$root/current/server/index.js"
mkdir -p "$root/logs"
chmod 700 "$root/logs"
umask 077
set -a
. "$root/prod.env"
set +a
export PORT=3100
cd "$root/current"
nohup /usr/bin/setpriv --reuid samijaya --regid samijaya --init-groups \
  /usr/bin/node server/index.js >> "$log" 2>&1 < /dev/null &
pid=$!
sleep 2
if ! kill -0 "$pid" 2>/dev/null; then
  echo 'Samijaya exited during startup; inspect app log' >&2
  exit 1
fi
printf '%s\n' "$pid" > "$pidfile"
echo "Samijaya started: $pid"

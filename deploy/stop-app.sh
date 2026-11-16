#!/bin/sh
set -eu
pidfile=/srv/samijaya/app.pid
test -f "$pidfile" || { echo 'Samijaya is not recorded as running'; exit 0; }
pid=$(cat "$pidfile")
if [ ! -r "/proc/$pid/cmdline" ] || ! tr '\000' ' ' < "/proc/$pid/cmdline" | grep -q '/usr/bin/node server/index.js'; then
  echo 'PID file does not identify the Samijaya Node process; refusing to signal' >&2
  exit 2
fi
kill -TERM "$pid"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if [ ! -r "/proc/$pid/cmdline" ] || ! tr '\000' ' ' < "/proc/$pid/cmdline" | grep -q '/usr/bin/node server/index.js'; then break; fi
  sleep 1
done
if [ -r "/proc/$pid/cmdline" ] && tr '\000' ' ' < "/proc/$pid/cmdline" | grep -q '/usr/bin/node server/index.js'; then
  echo 'Samijaya did not stop in 10 seconds' >&2
  exit 1
fi
rm "$pidfile"
echo 'Samijaya stopped'

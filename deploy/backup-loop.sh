#!/bin/sh
# Jalankan backup sekali sehari pada jam BACKUP_HOUR_WITA (WITA = UTC+8).
set -u
HOUR=${BACKUP_HOUR_WITA:-2}
LAST=""
echo "[backup] terjadwal setiap hari jam $HOUR WITA, simpan ${BACKUP_KEEP_DAYS:-14} hari"
while true; do
  NOW=$(( $(date +%s) + 8 * 3600 ))
  TODAY=$(date -u -d "@$NOW" +%Y%m%d)
  CUR_HOUR=$(date -u -d "@$NOW" +%H | sed 's/^0//')
  if [ "${CUR_HOUR:-0}" -eq "$HOUR" ] && [ "$TODAY" != "$LAST" ]; then
    if sh /scripts/backup.sh; then LAST=$TODAY; else echo "[backup] GAGAL, dicoba lagi 10 menit"; fi
  fi
  sleep 600
done

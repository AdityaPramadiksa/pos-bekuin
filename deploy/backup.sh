#!/bin/sh
# Satu kali backup: database (format custom pg_dump) + arsip foto upload.
# Dipakai container "backup" (terjadwal) dan scripts/backup-now.sh (manual).
set -eu
STAMP=$(date -u -d "@$(( $(date +%s) + 8 * 3600 ))" +%Y%m%d-%H%M) # waktu WITA
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
mkdir -p /backups/db /backups/uploads

pg_dump -Fc -f "/backups/db/bekuin-$STAMP.dump.tmp"
mv "/backups/db/bekuin-$STAMP.dump.tmp" "/backups/db/bekuin-$STAMP.dump"
if [ -d /data/uploads ]; then
  tar -czf "/backups/uploads/uploads-$STAMP.tar.gz" -C /data uploads
fi

# Hapus backup yang lebih tua dari KEEP_DAYS hari.
find /backups/db -name 'bekuin-*.dump' -mtime +"$KEEP_DAYS" -delete
find /backups/uploads -name 'uploads-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "[backup] selesai bekuin-$STAMP ($(du -h "/backups/db/bekuin-$STAMP.dump" | cut -f1))"

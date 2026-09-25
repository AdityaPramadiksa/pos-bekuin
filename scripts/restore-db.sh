#!/bin/sh
# Pulihkan database dari file backup (di VPS, dari folder repo):
#   sh scripts/restore-db.sh backups/db/bekuin-20260925-0200.dump [backups/uploads/uploads-20260925-0200.tar.gz]
# PERHATIAN: data saat ini diganti isi backup. API dihentikan selama proses.
set -eu
DUMP=${1:?pakai: sh scripts/restore-db.sh <file.dump> [uploads.tar.gz]}
UPLOADS=${2:-}
COMPOSE="docker compose -f docker-compose.prod.yml --env-file deploy/.env"
[ -f "$DUMP" ] || { echo "File $DUMP tidak ada"; exit 1; }

printf 'Ganti database dengan %s? Ketik YA untuk lanjut: ' "$DUMP"
read -r ANSWER
[ "$ANSWER" = "YA" ] || { echo "Dibatalkan"; exit 1; }

$COMPOSE stop api
# Simpan cadangan kondisi sekarang dulu, untuk berjaga-jaga.
$COMPOSE exec -T backup sh /scripts/backup.sh
$COMPOSE exec -T db pg_restore -U bekuin -d bekuin_pos --clean --if-exists --no-owner < "$DUMP"
if [ -n "$UPLOADS" ]; then
  $COMPOSE run --rm --no-deps -v "$(pwd)/$UPLOADS:/restore.tar.gz:ro" --entrypoint sh api \
    -c 'rm -rf /data/uploads/* && tar -xzf /restore.tar.gz -C /data'
fi
$COMPOSE start api
echo "Selesai. Cek: buka https://<domain>/api/v1/health (status harus ok)"

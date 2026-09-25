#!/bin/sh
# Backup manual sekarang (di VPS, dari folder repo): sh scripts/backup-now.sh
set -eu
docker compose -f docker-compose.prod.yml --env-file deploy/.env exec -T backup sh /scripts/backup.sh
ls -lh backups/db | tail -5

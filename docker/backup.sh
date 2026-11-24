#!/bin/sh
# Dumps the database once a day into /backups and keeps the newest $KEEP files.
# Restore:  gunzip -c /backups/careeros-YYYYmmdd-HHMM.sql.gz | psql
set -eu
KEEP="${KEEP:-14}"
while true; do
  file="/backups/careeros-$(date +%Y%m%d-%H%M).sql.gz"
  if pg_dump --no-owner --clean --if-exists | gzip > "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "Backup written: $file"
  else
    rm -f "$file.tmp"
    echo "Backup FAILED" >&2
  fi
  # Keep only the newest $KEEP dumps
  count=0
  for old in $(ls -1t /backups/careeros-*.sql.gz 2>/dev/null); do
    count=$((count + 1))
    if [ "$count" -gt "$KEEP" ]; then rm -f -- "$old"; fi
  done
  sleep 86400
done

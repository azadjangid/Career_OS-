#!/bin/sh
set -e
case "$1" in
  api)
    if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
      echo "Applying database migrations..."
      /app/node_modules/.bin/prisma migrate deploy --schema=/app/prisma/schema.prisma
    fi
    exec node /app/apps/api/dist/server.js
    ;;
  worker)
    exec node /app/apps/api/dist/worker.js
    ;;
  migrate)
    exec /app/node_modules/.bin/prisma migrate deploy --schema=/app/prisma/schema.prisma
    ;;
  *)
    exec "$@"
    ;;
esac

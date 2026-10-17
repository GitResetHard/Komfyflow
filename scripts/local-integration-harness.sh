#!/usr/bin/env bash
# Optional sandbox harness. Binaries below are NOT part of the deliverable.
# Production/local developer deployments should use Docker Compose instead.
set -euo pipefail
ROOT=/tmp/komfyflow-services/root
export LD_LIBRARY_PATH="$ROOT/usr/lib/x86_64-linux-gnu"
export DATABASE_URL='mysql://komfyflow:local-test-only-password@127.0.0.1:3307/komfyflow'
export REDIS_URL='redis://127.0.0.1:6380'
export APP_URL='http://localhost:3000'
export SESSION_SECRET='local-integration-only-secret-not-for-production'
export STORAGE_DRIVER=local
export STORAGE_DIR=/tmp/komfyflow-integration-objects
export ALLOW_LOCAL_STORAGE=true
export NODE_ENV=${NODE_ENV:-development}
"$ROOT/usr/sbin/mariadbd" --no-defaults --basedir="$ROOT/usr" --datadir=/tmp/komfyflow-services/data --socket='' --port=3307 --bind-address=127.0.0.1 --pid-file=/tmp/komfyflow-services/mysql-harness.pid --log-error=/tmp/komfyflow-services/mysql-harness.log &
DB_PID=$!
"$ROOT/usr/bin/redis-server" --port 6380 --bind 127.0.0.1 --dir /tmp/komfyflow-services --save '' >/tmp/komfyflow-services/redis-harness.log 2>&1 &
REDIS_PID=$!
trap 'kill ${WEB_PID:-} ${WORKER_PID:-} "$DB_PID" "$REDIS_PID" 2>/dev/null || true' EXIT
for i in $(seq 1 40); do if "$ROOT/usr/bin/mariadb" --no-defaults --protocol=tcp -h127.0.0.1 -P3307 -uroot -e 'SELECT 1' >/dev/null 2>&1; then break; fi; sleep 0.5; done
"$ROOT/usr/bin/mariadb" --no-defaults --protocol=tcp -h127.0.0.1 -P3307 -uroot -e "DROP DATABASE IF EXISTS komfyflow; CREATE DATABASE komfyflow; CREATE USER IF NOT EXISTS 'komfyflow'@'127.0.0.1' IDENTIFIED BY 'local-test-only-password'; GRANT ALL ON komfyflow.* TO 'komfyflow'@'127.0.0.1';"
npx prisma migrate deploy
npm run db:seed
npm run worker >/tmp/komfyflow-services/worker-harness.log 2>&1 &
WORKER_PID=$!
npm run "${WEB_MODE:-dev}" >/tmp/komfyflow-services/web-harness.log 2>&1 &
WEB_PID=$!
for i in $(seq 1 80); do if curl --noproxy '*' -sf http://localhost:3000/api/workflows >/dev/null; then break; fi; sleep 1; done
if [[ "$#" -gt 0 ]]; then "$@"; else curl --noproxy '*' -sf http://localhost:3000/api/workflows; fi

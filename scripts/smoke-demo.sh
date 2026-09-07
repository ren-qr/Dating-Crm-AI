#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[smoke] DATABASE_URL is not set; skipping real database smoke."
  exit 0
fi

PORT="${SMOKE_PORT:-3100}"
HOST="${SMOKE_HOST:-127.0.0.1}"
export SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://${HOST}:${PORT}}"
export NEXTAUTH_URL="${NEXTAUTH_URL:-${SMOKE_BASE_URL}}"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-date-manage-smoke-secret}"

echo "[smoke] applying migrations with prisma migrate deploy"
pnpm exec prisma migrate deploy

echo "[smoke] seeding demo data"
pnpm seed

echo "[smoke] starting Next.js dev server at ${SMOKE_BASE_URL}"
pnpm exec next dev --hostname "${HOST}" --port "${PORT}" >/tmp/date-manage-smoke-next.log 2>&1 &
server_pid=$!

cleanup() {
  kill "${server_pid}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -fsS "${SMOKE_BASE_URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "${SMOKE_BASE_URL}" >/dev/null 2>&1; then
  echo "[smoke] Next.js dev server did not become ready. Last log lines:"
  tail -n 80 /tmp/date-manage-smoke-next.log || true
  exit 1
fi

node scripts/smoke-real-db.mjs

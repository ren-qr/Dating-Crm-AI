#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/restore-db.sh --file <backup.dump> --yes

Options:
  --file   PostgreSQL custom-format backup file created by scripts/backup-db.sh.
  --yes    Required confirmation flag. Restore is destructive.
  -h, --help

The script reads DATABASE_URL from .env and restores into that database.
USAGE
}

BACKUP_FILE=""
CONFIRMED="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "Missing value for --file" >&2
        exit 1
      fi
      BACKUP_FILE="$2"
      shift 2
      ;;
    --yes)
      CONFIRMED="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "${CONFIRMED}" != "true" ]]; then
  echo "Restore is destructive. Re-run with --yes to confirm." >&2
  exit 1
fi

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Missing required --file <backup.dump>" >&2
  usage >&2
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required but was not found in PATH." >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing .env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set in .env" >&2
  exit 1
fi

echo "Restoring PostgreSQL backup:"
echo "  file: ${BACKUP_FILE}"
echo "  target: DATABASE_URL from ${ENV_FILE}"

pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="${DATABASE_URL}" \
  "${BACKUP_FILE}"

echo "Restore completed from: ${BACKUP_FILE}"

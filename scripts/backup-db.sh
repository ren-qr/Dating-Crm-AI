#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
DEFAULT_OUTPUT_DIR="${ROOT_DIR}/storage/backups"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/backup-db.sh [--output <directory-or-file>]

Options:
  --output  Backup output directory or .dump file path. Defaults to storage/backups.
  -h, --help

The script reads DATABASE_URL from .env and writes a PostgreSQL custom-format dump.
USAGE
}

OUTPUT="${DEFAULT_OUTPUT_DIR}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "Missing value for --output" >&2
        exit 1
      fi
      OUTPUT="$2"
      shift 2
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

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required but was not found in PATH." >&2
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

timestamp="$(date +%Y%m%d-%H%M%S)"

if [[ "${OUTPUT}" == *.dump ]]; then
  backup_file="${OUTPUT}"
  mkdir -p "$(dirname "${backup_file}")"
else
  mkdir -p "${OUTPUT}"
  backup_file="${OUTPUT%/}/date-manage-${timestamp}.dump"
fi

echo "Creating PostgreSQL backup:"
echo "  output: ${backup_file}"

pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="${backup_file}" \
  "${DATABASE_URL}"

echo "Backup completed: ${backup_file}"

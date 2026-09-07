#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CREATE_ENV=0
START_DB=0
DRY_RUN=0

usage() {
  cat <<'USAGE'
用法：bash scripts/demo-setup.sh [选项]

选项：
  --create-env   当 .env 不存在时，从 .env.example 生成 .env；已存在则绝不覆盖
  --start-db     使用 docker compose 启动本地 PostgreSQL 演示库
  --dry-run      只检查环境与打印将执行的命令，不修改数据库
  -h, --help     显示帮助

常用：
  bash scripts/demo-setup.sh --create-env --start-db
  bash scripts/demo-setup.sh --dry-run
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --create-env) CREATE_ENV=1 ;;
    --start-db) START_DB=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数：$1" >&2
      usage
      exit 2
      ;;
  esac
  shift
done

info() {
  printf '==> %s\n' "$1"
}

warn() {
  printf '!! %s\n' "$1" >&2
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    warn "缺少命令：$1"
    return 1
  fi
}

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
  else
    return 1
  fi
}

info "检查 Node/pnpm 环境"
require_cmd pnpm

if [ ! -d node_modules ]; then
  warn "未发现 node_modules。请先运行：pnpm install"
fi

if [ -f .env ]; then
  info "发现已有 .env，脚本不会覆盖"
elif [ "$CREATE_ENV" -eq 1 ]; then
  info "从 .env.example 生成 .env"
  run cp .env.example .env
  if [ "$DRY_RUN" -eq 0 ]; then
    local_secret="$(openssl rand -hex 32)"
    local_key="$(openssl rand -hex 32)"
    sed -i '' "s/replace-with-at-least-32-random-characters/${local_secret}/" .env
    sed -i '' "s/replace-with-32-byte-base64-key/${local_key}/" .env
  fi
else
  warn "未发现 .env。可运行：bash scripts/demo-setup.sh --create-env"
  warn "或手动复制 .env.example 后按需调整 DATABASE_URL / NEXTAUTH_SECRET / APP_ENCRYPTION_KEY"
fi

if [ "$START_DB" -eq 1 ]; then
  info "启动本地 PostgreSQL 演示库"
  require_cmd docker
  COMPOSE="$(compose_cmd)" || {
    warn "缺少 docker compose；请安装 Docker Desktop 或手动准备 PostgreSQL"
    exit 1
  }
  # shellcheck disable=SC2086
  run $COMPOSE up -d postgres
else
  info "跳过 Docker 启库；如需本地演示库可加 --start-db"
fi

if [ "$DRY_RUN" -eq 0 ]; then
  if [ ! -f .env ]; then
    warn "没有 .env，停止执行数据库迁移与 seed，避免连到错误环境。"
    exit 1
  fi
fi

info "生成 Prisma Client"
run pnpm prisma:generate

info "执行 Prisma migrate dev"
run pnpm prisma:migrate

info "执行演示 seed"
run pnpm seed

if [ "$DRY_RUN" -eq 1 ]; then
  cat <<'DONE'

dry-run 完成：以上命令仅打印，未执行数据库迁移或 seed。
DONE
  exit 0
fi

cat <<'DONE'

演示数据准备完成。
访问地址：http://localhost:3000
演示账号：admin@meetra.local / Demo@123456
其他账号：manager@meetra.local、consultant@meetra.local，默认密码同上。

启动应用：
  pnpm dev
DONE

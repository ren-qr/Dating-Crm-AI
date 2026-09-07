#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3002}"
PID_FILE="${PID_FILE:-.next/meetra-local-server.pid}"
LOG_FILE="${LOG_FILE:-.next/meetra-local-server.log}"
SKIP_BUILD=0
DAEMON=0

usage() {
  cat <<'USAGE'
用法：bash scripts/start-local-server.sh [选项]

选项：
  --host <host>    监听地址，默认 0.0.0.0
  --port <port>    监听端口，默认 3002
  --skip-build     跳过 pnpm build，直接启动已有构建
  --daemon         后台启动，日志写入 .next/meetra-local-server.log
  -h, --help       显示帮助

常用：
  bash scripts/start-local-server.sh
  bash scripts/start-local-server.sh --daemon
  bash scripts/start-local-server.sh --port 3003
USAGE
}

info() {
  printf '==> %s\n' "$1"
}

warn() {
  printf '!! %s\n' "$1" >&2
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    warn "缺少命令：$1"
    exit 1
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)
      HOST="${2:-}"
      shift
      ;;
    --port)
      PORT="${2:-}"
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      ;;
    --daemon)
      DAEMON=1
      ;;
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

if [ -z "$HOST" ] || [ -z "$PORT" ]; then
  warn "host 和 port 不能为空。"
  exit 2
fi

require_cmd pnpm

if [ ! -f .env ]; then
  warn "未发现 .env。请先运行：bash scripts/demo-setup.sh --create-env --start-db"
  exit 1
fi

if [ -f "$PID_FILE" ]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$old_pid" ] && kill -0 "$old_pid" >/dev/null 2>&1; then
    warn "本地生产服务似乎已在运行，PID=${old_pid}。如需重启，请先运行：bash scripts/stop-local-server.sh"
    exit 1
  fi
  rm -f "$PID_FILE"
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  info "构建生产版本"
  pnpm build
else
  info "跳过构建，使用现有 .next 产物"
fi

mkdir -p "$(dirname "$PID_FILE")"

local_ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [ -z "$local_ip" ]; then
  local_ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi

info "本机访问：http://127.0.0.1:${PORT}/"
if [ -n "$local_ip" ]; then
  info "局域网访问：http://${local_ip}:${PORT}/"
else
  warn "未自动识别局域网 IP，可手动运行：ipconfig getifaddr en0"
fi

if [ "$DAEMON" -eq 1 ]; then
  info "后台启动生产服务，日志：${LOG_FILE}"
  nohup pnpm start -- -H "$HOST" -p "$PORT" >"$LOG_FILE" 2>&1 &
  server_pid=$!
  echo "$server_pid" >"$PID_FILE"
  info "启动完成，PID=${server_pid}"
  info "停止服务：bash scripts/stop-local-server.sh"
  exit 0
fi

info "前台启动生产服务。按 Ctrl+C 停止。"
pnpm start -- -H "$HOST" -p "$PORT"

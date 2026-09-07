#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PID_FILE="${PID_FILE:-.next/meetra-local-server.pid}"

if [ ! -f "$PID_FILE" ]; then
  echo "未发现 PID 文件：${PID_FILE}"
  echo "如果服务以前台方式运行，请在对应终端按 Ctrl+C 停止。"
  exit 0
fi

server_pid="$(cat "$PID_FILE" 2>/dev/null || true)"

if [ -z "$server_pid" ]; then
  rm -f "$PID_FILE"
  echo "PID 文件为空，已清理。"
  exit 0
fi

if kill -0 "$server_pid" >/dev/null 2>&1; then
  kill "$server_pid"
  echo "已停止 Meetra 本地生产服务，PID=${server_pid}"
else
  echo "PID=${server_pid} 未运行，清理 PID 文件。"
fi

rm -f "$PID_FILE"

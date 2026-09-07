#!/usr/bin/env bash
# 角色检查（开放写权限模式）：
#   - orchestrator：只读角色，暂存区有任何文件 → 逐个报错并阻断（exit 1）
#   - 执行角色（allowed 含 "**"）：一律放行（exit 0）；改动落在其他角色 owner_paths 内时
#     打印跨职责警告，提醒在完成报告中说明并请对应 owner 复核（docs/coordination/** 共享区不警告）
#   - 兼容旧包 / 自定义收窄：allowed 不含 "**" 时沿用旧的越界阻断逻辑
# 用法： bash scripts/check-allowed-paths.sh <role-id>
set -euo pipefail
ROLE="${1:-}"
[ -z "$ROLE" ] && { echo "用法: $0 <role-id>"; exit 2; }

# 必须在 git 仓库里
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "✗ 当前不是 git 仓库，先 git init（否则无法检查暂存区）"; exit 2
fi
# 角色清单：可见文件名优先（agent-paths.json），兼容旧隐藏名
PF=agent-paths.json; [ -f "$PF" ] || PF=.agent-paths.json
if [ ! -f "$PF" ]; then echo "✗ 缺少 agent-paths.json（解压可能丢了文件，重新 unzip -o 到空目录）"; exit 2; fi
# 解析：优先 node，回退 python3（不把整套约束锁死在 Node 环境）。
# 兼容两种结构：新 roles.<id>={allowed:[...],owner:[...]}；旧 roles.<id>=[...]（视为 owner 且 allowed 同值）。
# 用法：_read roles ｜ _read allowed <id> ｜ _read owner <id> ｜ _read others <id>（其他角色 owner，行格式 <id>\t<path>）
_read() {
  if command -v node >/dev/null 2>&1; then
    node -e "const m=require('./'+process.argv[1]).roles||{};const norm=v=>Array.isArray(v)?{allowed:v,owner:v}:{allowed:(v&&v.allowed)||[],owner:(v&&v.owner)||[]};const mode=process.argv[2]||'roles';const r=process.argv[3]||'';if(mode==='roles')process.stdout.write(Object.keys(m).join(' '));else if(mode==='allowed')process.stdout.write(norm(m[r]).allowed.join('\n'));else if(mode==='owner')process.stdout.write(norm(m[r]).owner.join('\n'));else{const out=[];Object.keys(m).forEach(k=>{if(k===r)return;norm(m[k]).owner.forEach(p=>out.push(k+'\t'+p));});process.stdout.write(out.join('\n'));}" "$PF" "${1:-roles}" "${2:-}"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import json,sys;m=json.load(open(sys.argv[1])).get('roles',{});norm=lambda v:{'allowed':v,'owner':v} if isinstance(v,list) else {'allowed':(v or {}).get('allowed',[]),'owner':(v or {}).get('owner',[])};mode=sys.argv[2] if len(sys.argv)>2 else 'roles';r=sys.argv[3] if len(sys.argv)>3 else '';sys.stdout.write(' '.join(m.keys()) if mode=='roles' else chr(10).join(norm(m.get(r))['allowed']) if mode=='allowed' else chr(10).join(norm(m.get(r))['owner']) if mode=='owner' else chr(10).join(k+chr(9)+p for k in m if k!=r for p in norm(m.get(k))['owner']))" "$PF" "${1:-roles}" "${2:-}"
  else
    echo "✗ 需要 node 或 python3 来解析 agent-paths.json" >&2; exit 2
  fi
}

FILES=$(git diff --cached --name-only || true)

# —— 总控只读：写任何文件都阻断 ——
if [ "$ROLE" = "orchestrator" ]; then
  [ -z "$FILES" ] && { echo "无暂存改动"; exit 0; }
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    echo "✗ 总控为只读角色，不得写文件: $f"
  done <<< "$FILES"
  exit 1
fi

KNOWN=$(_read roles)
case " ${KNOWN} " in
  *" ${ROLE} "*) : ;;
  *) echo "✗ 未知角色: ${ROLE}  (可用角色: ${KNOWN} orchestrator)"; exit 2 ;;
esac

[ -z "$FILES" ] && { echo "无暂存改动"; exit 0; }

ALLOWED=$(_read allowed "$ROLE")
MY_OWNER=$(_read owner "$ROLE")

# glob 匹配：** 允许跨目录；单个 * 不允许跨目录（docs/*.md 不得匹配 docs/security/x.md）
matches() {
  local f="$1" p="$2" base fs ps
  base="${p%/}"; base="${base%/\*\*}"; base="${base%/\*}"
  if [[ "$base" != *'*'* ]]; then            # base 不含通配才按目录前缀匹配
    [[ "$f" == "$base" ]] && return 0        # 精确文件/目录
    [[ "$f" == "$base"/* ]] && return 0      # 目录前缀（含深层）
  fi
  if [[ "$f" == $p ]]; then                  # 按 glob 匹配（next.config.*、src/routes/**/+server.ts 等）
    [[ "$p" == *'**'* ]] && return 0         # ** 模式：允许跨目录
    fs="${f//[^\/]/}"; ps="${p//[^\/]/}" # 单星模式：要求路径深度一致，防 * 跨目录
    [ "${#fs}" -eq "${#ps}" ] && return 0
    return 1
  fi
  return 1
}

# —— 开放写权限模式（allowed 含 "**"）：全放行，仅对落在其他角色 owner_paths 的改动打跨职责警告 ——
if printf '%s\n' "$ALLOWED" | grep -qx '\*\*'; then
  OTHERS=$(_read others "$ROLE")
  warned=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    # 共享协作区：docs/coordination/** 所有角色均可写入（交接单/验收/裁决），不算跨职责
    case "$f" in docs/coordination/*) continue ;; esac
    # 落在本角色 owner_paths 内 → 本职责改动，不警告
    mine=0
    while IFS= read -r p; do
      [ -z "$p" ] && continue
      if matches "$f" "$p"; then mine=1; break; fi
    done <<< "$MY_OWNER"
    [ "$mine" -eq 1 ] && continue
    while IFS=$'\t' read -r oid p; do
      [ -z "${oid:-}" ] && continue
      [ -z "${p:-}" ] && continue
      if matches "$f" "$p"; then
        echo "⚠ 跨职责修改: $f 属 @${oid} 职责范围，请在完成报告中说明并请其复核"
        warned=1
        break
      fi
    done <<< "$OTHERS"
  done <<< "$FILES"
  if [ "$warned" -eq 1 ]; then
    echo "✓ 放行（开放写权限模式，⚠ 为跨职责提醒）"
  else
    echo "✓ 放行（开放写权限模式，无跨职责改动）"
  fi
  exit 0
fi

# —— 兼容旧包 / 自定义收窄：allowed 不含 "**" → 按旧逻辑阻断越界 ——
bad=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  ok=0
  # 共享协作区：docs/coordination/** 所有角色均可写入（交接单/验收/裁决），全局放行
  case "$f" in docs/coordination/*) ok=1 ;; esac
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    if matches "$f" "$p"; then ok=1; break; fi
  done <<< "$ALLOWED"
  [ "$ok" -ne 1 ] && { echo "✗ 越界: $f 不在 [$ROLE] 的 allowed_paths"; bad=1; }
done <<< "$FILES"
[ "$bad" -eq 0 ] && echo "✓ 所有改动都在 [$ROLE] 边界内"
exit $bad

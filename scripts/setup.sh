#!/usr/bin/env bash
# 一键 bootstrap：git 仓库 + 权限 + 钩子 + 目录 + 清理旧生成残留
set -e
[ -d .git ] || git init
chmod +x scripts/*.sh scripts/hooks/* 2>/dev/null || true
git config core.hooksPath scripts/hooks
mkdir -p docs/coordination/handoffs docs/coordination/acceptance docs/coordination/decisions

# 清理孤儿 agent 文件（把新版 zip 解压覆盖到旧目录时，上一代角色文件会残留）
PF=agent-paths.json; [ -f "$PF" ] || PF=.agent-paths.json
_roles() {
  if command -v node >/dev/null 2>&1; then node -e "process.stdout.write(Object.keys(require('./'+process.argv[1]).roles).join(' '))" "$PF"
  elif command -v python3 >/dev/null 2>&1; then python3 -c "import json,sys;print(' '.join(json.load(open(sys.argv[1]))['roles'].keys()),end='')" "$PF"; fi
}
if [ -f "$PF" ]; then
  KNOWN=" $(_roles) orchestrator "
  for d in agents .claude/agents; do
    [ -d "$d" ] || continue
    for f in "$d"/*.toml "$d"/*.md; do
      [ -e "$f" ] || continue
      b=$(basename "$f"); b="${b%.toml}"; b="${b%.md}"; b="${b#_}"
      case "$KNOWN" in *" $b "*) ;; *) echo "  清理孤儿: $f"; rm -f "$f";; esac
    done
  done
  # 清理旧隐藏版元数据（已由可见版取代，留着会误导审查）
  [ "$PF" = "agent-paths.json" ] && rm -f .agent-paths.json .agent-manifest.json 2>/dev/null || true
fi

# 关键隐藏文件在场检查（缺失=解压/拷贝丢了隐藏文件）
for need in .github/CODEOWNERS .github/workflows/ci.yml .gitignore .env.example; do
  [ -f "$need" ] || echo "⚠ 缺少 ${need} —— 解压时丢了隐藏文件！请重新 unzip -o 包.zip -d 全新目录"
done

echo "✓ 完成：git 仓库就绪、钩子启用、旧残留已清理。"
echo "  角色检查：export AGENT_ROLE=<你的角色> 后，commit 时自动运行（执行角色跨职责只提醒；orchestrator 只读阻断）。"
echo "  下一步：由 devops-engineer 初始化项目骨架，CI 才会真正跑。"

# 一致性自检（发现旧版本残留会提示；只提示不阻断 bootstrap）
bash scripts/verify-consistency.sh || true

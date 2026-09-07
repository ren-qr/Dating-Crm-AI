# Meetra V3 重建基线

这是婚恋门店 CRM 项目。后台 AI 入口已接入新的 v0.3 Manager Runtime 最小闭环，保留 CRM、登录、PostgreSQL/Prisma、模型配置与后台 UI。本轮没有变更数据库结构；CRM API 已对齐 Schema V3.1。

新 Runtime 的目录、契约、边界、测试及未完成项见 [Agent Runtime v0.3](docs/agent-runtime-v0.3.md)。[docs/v3](docs/v3) 保留历史设计，不再作为新 Agent 执行架构。

## 保留与移出

- 保留：会员、回访、黑名单、审计、员工、门店、登录、模型配置、AI 聊天 UI。
- 移出：旧 Agent 意图分类、语义词典、工具调度、AI 会员检索、画像、话术与匹配接口。
- 不包含：`.env`、数据库数据、`node_modules`、`.next`、`storage`、Git 历史、历史协作文档和竞争资料。

## 本地启动

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
bash scripts/demo-setup.sh --create-env --start-db
pnpm dev -- -H 0.0.0.0 -p 3002
```

访问 `http://127.0.0.1:3002/`。

## 当前 AI 边界

`/api/v1/ai/chat` 在已登录员工会话下运行 Manager：

- 可选择 `search_members`，经 Gateway、确定性工具和 Result Policy 返回受控摘要；
- 目前仅查询当前门店、本人负责的会员，要求 `member:read`；
- 不执行写操作；
- 不以 Prompt 代替权限边界；
- 状态、Trace、Audit、Eval 暂为进程内存实现，不提供持久化或故障恢复保证；
- 模型配置只持久化到 `AiSetting`，环境变量仅作默认回退。

## V3 下一步

先验收只读能力与上下文边界，再接入个人资料、择偶要求能力和经确认的语义解析。工作流、任务恢复、审批、调度与专用 Agent 尚未启用，不沿用历史 MatchCase 迁移计划。

## 校验

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

# Meetra V3 重建基线

这是婚恋门店 CRM 项目。当前会员查询主入口是 Query V2：结构化条件为事实来源，AI 仅用于将自然语言转换成可见、可修改的查询条件。CRM、登录、PostgreSQL/Prisma、模型配置和后台 UI 均保留；本轮不变更数据库结构。

## 保留与移出

- 保留：会员、回访、黑名单、审计、员工、门店、登录、模型配置、Query V2 会员查询。
- 移出：旧 AI 聊天入口、Manager Runtime、语义词典、Capability 调度、多轮澄清状态及其专属评测。
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

## 当前会员查询边界

`/api/v1/members/query` 只执行经过校验的 Query V2 条件；`/api/v1/ai/member-query` 仅生成查询草案：

- 两个接口均要求登录与 `member:read`；查询始终限制在当前门店及当前员工负责范围；
- 地区由服务器通过 `Area` 字典解析为既有 2/4/6 位编码；
- 查询结果只投影允许展示的会员摘要，电话、证件与加密字段不会返回给模型或查询 UI；
- 未解析条件会明确返回并阻止执行，模型不可直接访问 Prisma、SQL、门店范围或权限；
- Query Trace 为进程内存实现，可按 `traceId` 检查当前请求，不提供重启后的持久化保证；
- 模型配置只持久化到 `AiSetting`，环境变量仅作默认回退。

## V3 下一步

在 Query V2 稳定后，再按独立规格评估后续 Agent、工作流、审批、调度与专用能力；本仓库当前不保留旧 Runtime 作为过渡实现。

## 校验

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

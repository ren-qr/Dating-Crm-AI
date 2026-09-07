# V3 重建基线清单

生成日期：2026-08-29

## 可运行资产

- Next.js CRM 后台与现有会员、回访、黑名单、审计、人员、门店页面。
- NextAuth Credentials、Prisma/PostgreSQL、既有迁移、`Member` 身份字段加密与审计能力。
- AI 助理导航、右侧聊天抽屉、模型设置与普通模型聊天接口。

## 已清理的旧 AI 运行路径

- 意图规则、模型辅助意图解析、静态知识库、语义筛选规则、`agent-dispatcher`。
- `search_member`、会员画像、匹配建议、话术生成等旧 AI Business Tools 与专用 API。
- 前端“查询会员”提示标签与旧业务工具入口。
- AI 设置的本地 `storage/ai-config.json` 双写。

## 不包含

- `.env`、数据库数据与备份、`storage/`、Git 历史。
- `node_modules/`、`.next/`、覆盖率与其他构建产物。
- 历史协作文档、竞争资料、旧 AI 设计文档和旧 AI 专项测试。

## 尚未实施的 V3 迁移

- `Staff / Manager` 两级权限的真实代码与数据迁移。
- Runtime、Policy Engine、Task、Event、MatchCase、三个 Agent 与 Workflow。
- 会员端、线下约见与实时语音。

这些事项已在 `docs/v3` 定义为后续受控迁移，不应在旧 P1/P2/P3 CRM 代码上继续叠加。

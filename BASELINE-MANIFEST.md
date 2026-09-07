# V3 重建基线清单

更新日期：2026-09-07

## 可运行资产

- Next.js CRM 后台与会员、回访、黑名单、审计、人员、门店页面。
- NextAuth Credentials、Prisma/PostgreSQL、既有迁移与审计能力。
- Schema V3.1：`Member` 基础资料；`MemberSensitiveInfo`、`MemberMatePreference`、`MemberExtraProfile` 三个一对一扩展。
- AI 助理导航、右侧聊天界面、模型设置和 `Manager → CapabilityRequest → Gateway → ResolvedAction → Executor` 运行链。

## 已清理的旧 AI 运行路径

- 意图规则、模型辅助意图解析、静态知识库、语义筛选规则、`agent-dispatcher`。
- 已移除的旧 `search_member`、会员画像、匹配建议、话术生成等旧 AI Business Tools 与专用 API。
- 前端“查询会员”提示标签与旧业务工具入口。
- AI 设置的本地 `storage/ai-config.json` 双写。

## 不包含

- `.env`、数据库数据与备份、`storage/`、Git 历史。
- `node_modules/`、`.next/`、覆盖率与其他构建产物。
- 历史协作文档、竞争资料、旧 AI 设计文档和旧 AI 专项测试。

## 当前 Phase 1 状态

- `search_members` 与 `get_member_profile` 通过现有 `business-support/tools/member` 读取 CRM，LLM 不直接访问 Prisma/Repository/SQL。
- 默认数据行范围为当前认证员工的当前门店及本人负责会员；敏感资料由 `MemberSensitiveInfo` 读取。
- State、Trace、Audit、Eval 为单进程内存实现；服务重启或多实例不保留会话状态。
- 本轮未新增或执行 Prisma migration；已确认现有 migration 与数据库 Schema 一致。

## 未实施范围

- `Staff / Manager` 两级权限的真实代码与数据迁移。
- Match、Ranking、Member Consultant、Offline Host、多 Agent、长期记忆、复杂 Workflow 与 Scheduler 产品能力。
- 会员端、线下约见与实时语音。

这些事项已在 `docs/v3` 定义为后续受控迁移，不应在旧 P1/P2/P3 CRM 代码上继续叠加。

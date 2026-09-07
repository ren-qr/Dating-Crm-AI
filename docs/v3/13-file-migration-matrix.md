# 文件迁移矩阵

| 旧位置 | 当前唯一实现 | 状态 | 兼容层 / 说明 |
| --- | --- | --- | --- |
| `src/app/api/v1/ai/chat/route.ts` | `src/agent-system/agents/chat-application/send-chat-message.ts` | 已适配 | Route 保留路径、Zod、身份与响应映射；Prompt 与模型调用由 Agent 体系承接 |
| `src/lib/server/ai/client.ts` | `src/agent-system/shared/ai/client.ts` | 已迁移 | AI Provider 行为不变 |
| `src/lib/client/members.ts` 中 AI 调用 | `src/interface/chat/client/ai-client.ts` | 已迁移 | `members.ts` 兼容导出已归入 `src/interface/shared/legacy-client/` |
| `src/lib/client/members.ts` 中通用 HTTP | `src/interface/shared/client/api-client.ts` | 已迁移 | 通用 HTTP Client 已归入交互层共享能力 |
| `src/app/api/v1/members/route.ts` 的 GET 查询 | 无 | 已删除 | 原会员列表查询半成品已删除；会员列表能力待重新设计 |
| 会员列表范围规则 | 无 | 已删除 | 原范围规则随半成品模块删除；未来按新权限设计重建 |
| 会员列表 Prisma 查询 | 无 | 已删除 | 原 Repository 随半成品模块删除；未来按新查询能力重建 |
| 会员 POST 与详情 Route | 原位置 | 未迁移 | 保持现有功能，下一批再拆 Application Service |
| 旧 AI 匹配 API / `member-tools.ts` | 不存在于 V3 基线 | 已移出 | 不在本批恢复；MatchCase 前先建立唯一 Matching Service |

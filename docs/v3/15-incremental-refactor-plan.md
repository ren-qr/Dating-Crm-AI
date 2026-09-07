# 增量整理计划

## 本批：已完成

1. 将普通聊天的 Prompt 和模型调用移入 AI Application Service。
2. 曾将会员列表查询、范围决策和 Prisma 读操作分离；该半成品模块现已删除，待重新设计。
3. 将会员数据权限收敛为单一规则：具备会员能力码的 `Staff` 与 `Manager` 都可读写全部会员字段；门店、归属筛选只作为查询条件，不再作为会员授权范围。
4. 提取通用浏览器 HTTP Client 与 AI Feature Client，并保留旧导出兼容。

## 唯一实现与边界

- 会员列表读取的旧编排入口已删除，新的查询能力尚未确定。
- 旧 `member-data-scope.ts` 与 Repository 已删除，不再作为权限或数据访问依据。
- 普通聊天的 Prompt 组装点是 `src/agent-system/agents/chat-application/send-chat-message.ts`。

## 下一批建议

1. 将 `POST /api/v1/members` 的创建、黑名单拦截、审计移动到 Member Application Service。
2. 将详情读写迁入 Member Application Service，复用同一会员能力码与审计规则。
3. 提取 `MemberPresenter`，使列表和创建响应的脱敏格式化有唯一实现。
4. 在没有旧实现后，再设计唯一 Matching Application Service；不要先恢复已移出的 AI 匹配接口。

## 已知风险

- 会员数据权限已收敛；非会员模块仍需逐步迁移到两级角色与能力码策略。

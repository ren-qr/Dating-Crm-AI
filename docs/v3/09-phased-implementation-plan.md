# 分阶段实施计划

## 阶段 0：架构冻结与基线整理

- 本包完成：移除旧 Agent 运行路径，保留普通聊天与 CRM；建立 V3 规范。
- 验收：构建、类型检查、既有 CRM 测试通过；纯聊天不访问数据库工具。

## 阶段 1：最小纵向链路

```text
员工显式发起快速匹配
→ Trigger
→ Runtime
→ Policy
→ Quick Match Workflow
→ 候选草案
→ 员工确认
→ MatchCase + Audit/Event
```

建议提交粒度：

1. `feat(v3-core): add trigger task and trace contracts`
2. `feat(v3-policy): add capability and decision boundary`
3. `feat(v3-tools): add typed tool registry`
4. `feat(v3-match): add match case and quick-match workflow`
5. `feat(v3-ui): connect staff copilot to runtime trigger`
6. `test(v3): add workflow policy and idempotency coverage`

## 后续阶段

- 阶段 2：Member Advisor 与意愿收集。
- 阶段 3：约见协调、Meeting Host 与会后复盘。
- 阶段 4：知识库、评估体系、运营自动任务。

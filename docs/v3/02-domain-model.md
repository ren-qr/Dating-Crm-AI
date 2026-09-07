# 领域模型

## 已有保留模型

现有 Prisma Schema 位于 `prisma/schema.prisma`。当前业务基线使用 `Employee`、`Store`、`Member`、`MemberService`、`AuditLog`、`AiSetting` 等模型；`Member` 是会员资料主记录，手机号和身份证维持加密与 Hash 辅助字段。

## V3 新增概念（设计，未迁移）

| 模型 | 用途 | 关键字段 |
| --- | --- | --- |
| `MatchCase` | 一次匹配流程的唯一事实来源 | 双方会员、状态、责任人、匹配依据、版本 |
| `AgentTask` | 可恢复的结构化待办 | 类型、Case、Owner、输入、前置条件、超时、幂等键 |
| `AgentRun` | Runtime 的一次运行 | Agent、Trigger、状态、步数、开始/结束 |
| `WorkflowRun` | 固定流程的执行实例 | 定义版本、当前节点、状态、Case |
| `DomainEvent` | 已发生的业务事实 | 类型、聚合 ID、Schema 版本、发生时间 |
| `OutboxEvent` | 可靠投递中的事件 | 事件、投递状态、重试次数、幂等键 |
| `PolicyDecision` | 某次访问或操作的治理判断 | Subject、Action、Resource、Allow/Deny、理由、版本 |
| `ApprovalRequest` | 人工确认记录 | 操作草案、审批人、状态、过期时间 |
| `ToolCall` | 工具调用证据 | Tool、输入摘要、输出摘要、授权、Trace |

`MatchCase` 保存流程事实；`MemberService` 保存会员服务时间线。约见结论、意愿和后续跟进只允许有一个正式写入 Owner，其他位置只引用其 ID。

## 建议基础 Schema

```text
Trigger { id, type, actor, channel, payload, traceId }
AgentTask { id, taskType, caseId?, owner, status, input, expectedOutput,
            preconditions, timeoutAt, retryPolicy, idempotencyKey, parentTaskId?, traceId }
DomainEvent { id, type, aggregateType, aggregateId, schemaVersion, payload, occurredAt, traceId }
AgentRun { id, agentId, taskId?, triggerId, status, stepCount, startedAt, endedAt, traceId }
WorkflowRun { id, workflowKey, workflowVersion, taskId, currentNode, status, state, traceId }
ToolCall { id, runId, toolKey, inputDigest, resultDigest, policyDecisionId, status, traceId }
PolicyDecision { id, subject, action, resource, fields, scope, effect, reason, policyVersion }
```

所有 JSON 载荷必须有 Zod/TypeScript Schema 与 `schemaVersion`；不得依赖无约束 `payloadJson` 作为长期契约。

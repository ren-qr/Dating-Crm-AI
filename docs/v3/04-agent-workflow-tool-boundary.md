# Agent、Workflow 与 Tool 边界

| 类型 | 判断标准 | 示例 |
| --- | --- | --- |
| Tool | 单次、原子、可验证的业务操作 | `searchMembers`、`loadMeetingContext`、`recordConsent` |
| Workflow | 路径可预先定义，需要审计与恢复 | 快速匹配、意愿收集、约见协调、会后跟进 |
| Agent | 需要在受限范围内理解语义或决定下一步 | Staff Copilot、Member Advisor、Meeting Host |

## 工具要求

工具在 Tool Registry 中声明输入 Schema、输出 Schema、权限、风险等级、幂等能力、超时和审计类别。禁止 `executeSql(sql)` 一类底层工具。

## 三种控制模式

1. 单次工具：明确查询或固定按钮，直接映射 Tool。
2. 固定 Workflow：确定业务程序，由代码推进，模型仅用于语义节点。
3. 受限 Agent 循环：目标明确但路径不定；Runtime 限制工具、步数、跳转次数与预算。

Agent 无权改派 Task；只能返回 `completed`、`waiting`、`blocked` 或 `failed`。Orchestrator 决定重试、改派、澄清或升级人工。

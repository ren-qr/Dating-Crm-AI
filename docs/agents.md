# Agent 与能力清单

本文件是项目中 Agent、Agent 能力与 Agent 工作项的唯一说明表。新增 Agent、为 Agent 增加能力或分配新的工作前，先更新本文件；工具本身的设计与状态仍以 `docs/tools.md` 为准。

## 当前 Agent

| Agent ID | 名称 | 服务对象 | 当前状态 | 入口 | 已启用能力 | 可调用工具 | 代码位置 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AG-BACKOFFICE-001 | 后台助手 Manager Agent | 内部员工 | 最小 Runtime 已接入，待真实模型与数据库联调验收 | 后台 AI 悬浮聊天入口 | 普通回答、受控只读搜索 | `search_members` | `src/agent-system/runtime/` |

说明：`src/app/api/v1/ai/chat/route.ts` 已切换至新 Manager Runtime。仅首个只读能力启用；不是完整自主员工。运行边界、占位能力和测试记录见 [Runtime 说明](agent-runtime-v0.3.md)。旧普通聊天入口 deprecated，不再引用。

## 能力清单

| 能力 ID | 所属 Agent | 能力 / 工作 | 状态 | 触发方式 | 依赖工具 | 输出 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CAP-MEMBER-001 | AG-BACKOFFICE-001 | 查询会员个人资料 | 工具已开发，未接入 Agent | 自然语言、固定入口待实现 | `get_member_profile` | 会员个人资料字段 | 只读能力 |
| CAP-MEMBER-002 | AG-BACKOFFICE-001 | 搜索会员 | 已接入开发 Runtime，待真实环境验收 | 自然语言聊天；固定入口未实现 | `search_members` | 经 Result Policy 筛选的摘要列表 | 云模型不接收真实姓名和数据库 ID；仅本人本店范围；Mock 不识别筛选语义 |
| CAP-MEMBER-003 | AG-BACKOFFICE-001 | 查询择偶要求 | 工具已开发，未接入 Agent | 自然语言、固定入口待实现 | `get_member_mate_preference` | 会员择偶要求字段 | 只读能力 |

## 记录规则

| 变更类型 | 必填记录 |
| --- | --- |
| 新增 Agent | Agent ID、名称、服务对象、状态、入口、代码位置 |
| 新增 Agent 能力 | 能力 ID、所属 Agent、能力说明、触发方式、依赖工具、输出、状态 |
| 新增 Agent 工作流或定时工作 | 所属 Agent、触发条件、执行步骤、输出、失败处理、状态 |
| 启用工具 | 更新对应能力的依赖工具与状态；工具详细定义更新 `docs/tools.md` |
| 下线能力或 Agent | 标记下线时间和替代项，不覆盖历史记录 |

## 状态说明

| 状态 | 含义 |
| --- | --- |
| 规划中 | 已确认方向，尚未实现 |
| 开发中 | 正在实现或联调 |
| 工具已开发，未接入 Agent | 工具可独立调用，但 Agent 尚未能选择或执行它 |
| 已启用 | 已接入 Agent 并可从对应入口使用 |
| 暂停 | 临时不提供，但保留实现和记录 |
| 已下线 | 不再使用，保留历史记录 |

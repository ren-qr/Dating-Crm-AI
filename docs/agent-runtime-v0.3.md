# Agent Runtime v0.3 - Phase 1 实施记录

状态：Phase 1 工程门禁通过；真实模型质量评测待可用凭据。日期：2026-09-07。

## 范围

Phase 1 只实现后台助手的只读会员查询闭环：`search_members` 与 `get_member_profile`。不实现匹配、排名、写操作、长期记忆、多 Agent、复杂 Workflow 或新的业务 Schema。

## 运行链

```text
CRM Chat UI / API
  -> RuntimeContext（NextAuth 身份、门店、权限、服务端 trust zone）
  -> StateStore
  -> ContextBuilder
  -> Manager
  -> CapabilityRequest
  -> CapabilityGateway
  -> ResolvedAction
  -> Executor / Adapter
  -> existing member tools / Prisma
  -> ResultPolicy
  -> ModelSafeResult + AuthorizedDisplayResult
  -> Manager response / typed UI cards
```

核心不变量：LLM 不直接调用 Prisma、Repository 或 SQL；Executor 仅接受 Gateway 本回合签发且未消费的 `ResolvedAction`；每回合最多执行一个业务 capability。

## 目录职责

```text
src/agent-system/
  runtime/        单回合编排、Manager、模型上下文、服务端装配
  contracts/      CapabilityRequest、GatewayResult、ResolvedAction、UI 显示契约
  gateway/        schema、Area、会员引用、语义、权限、风险和信任区判断
  capabilities/   两项 capability 的元数据、Zod 输入/输出 schema
  execution/      已批准 Action 的 adapter 与输出校验
  result/         行范围、字段、敏感文本、模型/UI 双投影
  state/          SessionLog、WorkingState、StateStore abstraction
  tracing/         内存 trace、audit、eval hook
  prompts/         Manager/response prompt
```

## 两项能力

| capability | 查询事实来源 | 入口参数 | 最终执行参数 | 权限 |
| --- | --- | --- | --- | --- |
| `search_members` | 既有 `business-support/tools/member/searchMembers` | 结构化筛选语义 | 确定性数据库筛选条件 | `member:read` |
| `get_member_profile` | 既有 `getMemberProfile` | `item-N`、selected ref、精确姓名或 memberNo | 唯一 `memberId` | `member:read` |

默认行范围固定为当前认证员工的当前门店、本人负责会员。任何 item 引用转内部 ID 后都再次查询该范围；旧 `resultRef` 不是授权凭证。

## 状态与多轮

`WorkingState` 仅包含：`stateVersion`、`activeQuery`（语义/已解析条件、结果内部 ID 映射、页码）、`selectedMemberId`、`pendingClarification`。状态由 StateStore 按会话串行化，并绑定操作者、门店、信任区。

- 成功执行后才提交新的查询/选择状态；空结果也是成功状态。
- 技术失败不覆盖上一有效查询。
- 澄清只写服务器 `clarificationId` 与原始请求，不提前提交筛选条件。
- `清空条件/清除筛选` 是本地状态动作，不触发全量查询。
- 当前 Store 为内存实现；接口可替换为独立 runtime 状态持久化，未向 `Member` 或 `AuditLog` 塞入 Agent 状态。

## 数据、隐私与信任区

`search_members` 继续复用现有年龄派生 `deriveMemberAge`，不修改 `birthDate String`。地区名称只能通过 `AreaResolver` 查 `Area` 并生成 `Area.code`；`学历高/硕士以上`、`收入高/数值收入`不定义未经批准的业务阈值，统一澄清。

```text
RawResult
  -> ModelSafeResult          仅 ContextBuilder / Manager
  -> AuthorizedDisplayResult  仅已认证 UI
```

- 云模型：不见姓名、memberNo、内部 ID、门店/员工 ID、电话、证件、hash、自由文本。
- 本地模型：可见姓名，但仍不见 memberNo、内部 ID、电话、证件、hash 与自由文本。
- `MemberSensitiveInfo`、`MemberExtraProfile`、跟进、匹配、黑名单、文档自由文本不进入 Phase 1 模型上下文。
- 客户端不能提交身份、角色、门店或 trust zone；均由 NextAuth 和 `AiSetting` provider 服务端决定。

## HTTP 与 UI

`POST /api/v1/ai/chat` 请求：

```json
{
  "message": "查找28岁左右的女性",
  "conversationId": "optional UUID",
  "clarificationId": "optional UUID",
  "clarificationAnswer": "optional text"
}
```

成功 envelope 的 `data` 包含 `status`、`message`、`state`、可选 `displayResult` 与 `clarification`。UI 使用 typed `displayResult` 渲染卡片和 “查看资料” 操作；不从模型文本正则解析结果。地区代码通过受控 `/api/v1/areas?codes=...` 转展示名。查看资料会发送引用文本，服务端解析为当前工作状态中的 `item-N`。

## 局部修订

- 新增 `get_member_profile`、`MemberReferenceResolver`、`AreaResolver`、双投影显示契约。
- `CapabilityRequest` 增加 `requestMode`：`new_query/refine_query/paginate_query`。
- WorkingState 从早期 `active_query/selected_refs` 升级为版本化查询/结果映射/待澄清结构。
- 没有 Prisma schema、migration、模型 Provider 配置、全局权限策略或 CRM 主数据模型改动。

## 验证与限制

- 定向确定性、契约、权限与安全测试：`pnpm vitest run tests/agent-runtime`。
- 真实模型评测命令：`pnpm eval:agent:real`；缺失可用 Provider 时应报告 `NOT RUN`，不伪造质量百分比。
- 已对齐 CRM 生产路径和 Schema V3.1：会员敏感资料从 `MemberSensitiveInfo` 读取，择偶要求与多元资料使用对应扩展关系；不再将已废弃字段放回 `Member`。
- `pnpm prisma migrate status` 已确认数据库 Schema 与 21 个现有 migration 一致；本轮未创建或执行 migration。
- 全仓 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 均已通过。数据库关系回归测试已在当前配置数据库执行。
- 真实模型评测仍取决于部署环境的可用 Provider；无凭据时命令输出 `Real-model eval: NOT RUN (credentials unavailable)`。

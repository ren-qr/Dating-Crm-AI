# 目标代码架构

不立即移动现有 CRM 路径。新模块先并列落地，逐项迁移后删除旧实现。

```text
src/
  app/                         # Next.js 页面与 API 入口
  core/
    runtime/ triggers/ tasks/ events/ tracing/ orchestration/
  domain/
    member/ match-case/ meeting/ consent/ follow-up/
  agents/
    staff-copilot/ member-advisor/ meeting-host/
  workflows/
    quick-match/ collect-consent/ meeting-arrangement/ post-meeting-followup/
  tools/
    registry/ member/ matching/ meeting/ knowledge/
  policies/
    authorization/ privacy/ risk/ approval/
  infrastructure/
    database/ model/ scheduler/ queue/ observability/
```

现有映射：

| 当前路径 | V3 处理 |
| --- | --- |
| `src/components/ai-assistant.tsx` | 保留 UI，后续接 Runtime API |
| `src/app/api/v1/ai/chat/route.ts` | 保留纯聊天临时入口，未来适配 Trigger API |
| `src/lib/server/ai/client.ts` | 迁至 `infrastructure/model` 或保留适配层 |
| `src/lib/server/route-helpers.ts` | 提炼为 Policy/授权适配层 |
| `src/lib/server/member-service.ts` | 保留为 MemberService 领域服务候选 |
| `src/app/api/v1/members/**` | 保留 CRM API，逐步使用 Domain Service |

不建议第一阶段引入 LangChain/LangGraph。自建 Runtime + Zod + Prisma 可满足状态、审批和审计；未来若图式编排复杂，可评估 LangGraph，代价是学习、运行状态和可观测性整合。

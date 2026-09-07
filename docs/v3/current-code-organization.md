# 当前代码组织与四大体系映射

本文件记录当前项目代码与产品架构的对应关系。产品架构按四大体系划分；Next.js 的 `src/app` 和 Prisma 的 `prisma` 保留框架要求的实际位置。

## 交互层

```text
src/app/                    网页页面、API 接入、认证路由（Next.js 入口）
src/interface/web/          后台网页组件
src/interface/chat/         聊天交互客户端
src/interface/shared/       交互层共享客户端能力
```

当前已实现：后台网页、后台 AI 聊天入口、会员工作台、HTTP API。

尚未实现：独立 APP、语音交互入口。

## Agent 体系

```text
src/agent-system/runtime/   新 Manager、Context Builder 与执行循环
src/agent-system/contracts/ 请求、动作、结果契约
src/agent-system/gateway/   语义、权限、风险、确认、信任区管线
src/agent-system/capabilities/ 统一能力注册与只读搜索定义
src/agent-system/execution/ Executor 与业务适配器
src/agent-system/result/    Result Policy
src/agent-system/state/     Session Log / Working State / Task State
src/agent-system/tracing/   Trace / Audit / Eval 接口与内存实现
src/agent-system/prompts/   Manager 提示词
src/agent-system/agents/    已弃用普通聊天和历史导航
src/agent-system/shared/ai/
                            AI 配置、模型调用和隐私处理
src/agent-system/workflows/ 工作流层预留目录
src/agent-system/schedulers/
                            调度层预留目录
```

当前已实现：新 Manager 最小闭环及搜索能力。详见 [Runtime 说明](../agent-runtime-v0.3.md)。

当前未实现：完整后台助手 Agent、可恢复工作流、定时调度运行时。

## 业务支撑体系

```text
src/business-support/tools/ 工具层
src/business-support/tools/registry.ts
                            deprecated 旧函数清单，不用于新 Runtime
src/business-support/tools/member/
                            会员工具
src/business-support/permissions/
                            权限与身份实现
src/business-support/rules/ 确定性规则预留目录
```

当前已实现：会员查询工具、NextAuth 身份认证、权限码判断基础能力。

当前未集中整理：确定性业务规则仍散落在部分 API 和兼容代码中。

## 数据体系

```text
prisma/schema.prisma        业务数据模型
prisma/migrations/          数据结构迁移
prisma/data/                地区等初始化数据
AuditLog                    审计数据模型
```

```text
业务数据                    Member、Area、会员扩展资料等
知识库                      当前未实现
记忆库                      当前未实现
审计数据                    AuditLog，以及相关审计 API
```

## 当前混用代码

以下文件同时包含接口接入、业务判断、旧版兼容或已删除模型引用，暂不机械移动：

```text
src/lib/server/member-service.ts
src/lib/server/blacklist.ts
src/lib/server/member-profile-view.ts
src/app/api/v1/members/**
src/app/api/v1/followups/route.ts
src/app/api/v1/blacklists/route.ts
src/app/api/v1/dashboard/overview/route.ts
```

`src/features/members/**` 已于本轮删除；它曾是会员列表查询的半成品模块。其余文件需要逐项确认行为后再拆分，不能仅按文件名判断归属。

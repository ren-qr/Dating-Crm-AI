# 当前代码组织与四大体系映射

本文件记录当前项目代码与产品架构的对应关系。产品架构按四大体系划分；Next.js 的 `src/app` 和 Prisma 的 `prisma` 保留框架要求的实际位置。

## 交互层

```text
src/app/                    网页页面、API 接入、认证路由（Next.js 入口）
src/interface/web/          后台网页组件
src/interface/shared/       交互层共享客户端能力
```

当前已实现：后台网页、会员工作台、Query V2 的结构化筛选与 AI Quick Fill、共享 Assistant Core 的左侧 AI 页面和右下角悬浮对话入口、HTTP API。

尚未实现：独立 APP、语音交互入口。

## Query V2

```text
src/ai-query/               查询合同、字段白名单、AI 解析与确定性执行
src/ai-assistant/           Assistant Core：reply | query_members 动作解析
src/lib/server/area-resolver.ts
                            Area 字典解析（2/4/6 位编码）
src/lib/server/query-trace.ts
                            请求内存 Trace
src/lib/server/ai/          Provider 配置、模型调用和隐私校验
```

当前已实现：结构化会员查询和 AI Quick Fill；AI 助理仅可普通对话或将 `query_members` 交给同一个 Query V2 执行器。旧聊天 Runtime、Capability Gateway、Working State 与其专属评测已删除。

当前未实现：可恢复工作流、定时调度运行时，以及多工具的完整后台助手 Agent。

## 业务支撑体系

```text
src/business-support/permissions/
                            权限与身份实现
src/business-support/rules/ 确定性规则预留目录
```

当前已实现：NextAuth 身份认证、权限码判断、门店与负责人数据范围、Query V2 确定性执行。

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

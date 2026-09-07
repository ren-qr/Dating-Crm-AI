# 门店婚恋会员管理后台 · 团队协同规范

> 本文件是所有 Agent 的共同契约。每个 agent 的 prompt 里也内置了同一套规范。

## 统一产出格式（每次任务完成后必须输出）
- 变更摘要：一句话说明这次做了什么
- 修改文件：列出新增 / 修改 / 删除的文件路径
- 测试结果：跑了哪些测试、是否通过（贴关键输出）
- 风险与影响：可能波及的其他模块或接口
- 需要配合：需要哪个角色接手 / 确认，以及交接内容与格式
- 跨职责说明：为什么修改非本职责文件 / 影响哪个角色 / 需要谁复核 / 是否改动契约、数据库结构、安全策略、部署配置（无则写"无"）

## 完成定义（DoD）
- Lint / 类型检查通过
- 相关单元与集成测试通过
- 接口契约与文档同步更新
- 数据库迁移可回滚（有 up/down）
- README / 变更说明已更新
- 跨职责修改已在报告中说明并获得对应 owner 复核
- 后台必须覆盖桌面端高密度表格与筛选工作流，支持门店运营高频使用场景
- 会员档案、匹配、跟进、活动、收费、财务、人员、风控模块必须完成闭环联动
- 可视化看板需包含会员新增、匹配成功率、活动到场率、营收与提成等核心指标
- 导出与备份功能必须支持按模块与时间范围筛选
- 资料上传、黑名单拦截、客户归属、提成核算、回访提醒都必须有完整审计留痕
- 数据库迁移必须可回滚，初始化数据必须与权限模型一致

## Git / 文件边界
- 开放写权限：所有执行角色技术上可改动项目内任意文件
- 跨职责（他人 owner_paths）修改必须在完成报告中说明并请对应 owner 复核
- 涉及接口契约 / 数据库结构 / 安全策略 / 部署配置的改动，必须提请对应 owner 与总控确认后合入
- 文件冲突或边界不清时，交总控 Agent 裁决
- 提交信息格式：type(scope): 摘要（如 feat(login): 员工账号密码登录，签发会话）
- 一个任务对应一组内聚提交，便于审核与回滚
- docs/coordination/** 为共享协作区：所有角色均可写入交接单 / 验收 / 裁决记录，不属于任何角色的 owner_paths

## 任务交接协议
- 交接用结构化「交接单」传递：来源角色 / 目标角色 / 交接物 / 约定格式 / 验收点
- 接口相关交接必须附契约：路径、方法、入参、出参、错误码、分页、权限码
- 数据库变更交接必须附：变更说明、迁移脚本、回滚脚本、受影响表
- 接收方动工前先确认契约；有异议退回来源角色或总控，不擅自改契约

## 鉴权方案（全局唯一）
- NextAuth Credentials

## 包管理器（全局唯一）
- pnpm（锁文件、CI 命令、.gitignore 均以此为准）

## 接口契约
- Owner：后端工程师（backend-engineer）
- 约定：统一响应体：{ code: number, message: string, data: T | null, requestId: string, timestamp: string }。分页响应：{ items: T[], page: number, pageSize: number, total: number, hasNext: boolean }. 错误码约定：0=成功，1000=参数错误，1001=未认证，1002=无权限，1003=资源不存在，1004=状态冲突，1005=黑名单拦截，1006=资料校验失败，1007=文件上传失败，1008=导出任务失败，2000=服务器内部错误。鉴权方案：NextAuth Credentials，所有业务接口默认需要登录；通过角色与权限码做二级授权。权限码：member:read/member:write/member:delete，profile:read/profile:write，document:read/document:write/document:delete，match:read/match:write/match:execute，followup:read/followup:write，activity:read/activity:write/activity:checkin，billing:read/billing:write，finance:read/finance:write，staff:read/staff:write，role:read/role:write，customer:read/customer:assign/customer:commission，blacklist:read/blacklist:write，reminder:read/reminder:write，audit:read，export:read/export:write。DTO 约定：所有创建/更新请求使用显式字段名，日期统一 ISO-8601 字符串，金额统一以分为单位整数，布尔字段使用 true/false，状态字段使用受限枚举。列表查询支持 page/pageSize/sortBy/sortOrder/keyword 及模块特定过滤条件；所有可搜索文本字段采用分页模糊查询但不暴露敏感原文。文件资料通过预签名上传或受控上传接口登记元数据，不直接返回私有存储地址。
- 接口清单（完整版见 templates/api-contract.md）：
  - POST /api/v1/auth/login — 员工账号密码登录，签发会话
  - POST /api/v1/auth/logout — 登出并清理会话
  - GET /api/v1/me — 获取当前登录员工、角色与权限
  - GET /api/v1/members — 会员档案分页查询
  - POST /api/v1/members — 创建会员婚恋档案
  - GET /api/v1/members/{id} — 查看会员详情
  - PATCH /api/v1/members/{id} — 更新会员档案
  - POST /api/v1/members/{id}/documents — 登记或上传会员证件资料元数据
  - GET /api/v1/matches — 匹配关系与牵线记录分页查询
  - POST /api/v1/matches/execute — 执行多条件智能匹配并生成候选牵线结果
  - POST /api/v1/followups — 新增相亲跟进记录
  - GET /api/v1/activities — 线下相亲活动列表查询
  - POST /api/v1/activities — 发布线下相亲活动
  - POST /api/v1/activities/{id}/checkins — 活动报名签到登记
  - GET /api/v1/billing/plans — 会员收费套餐列表
  - POST /api/v1/billing/charges — 生成会员收费单或续费单
  - GET /api/v1/finance/summary — 营收统计汇总
  - GET /api/v1/staff — 员工与角色列表查询
  - POST /api/v1/staff — 创建员工账号与角色分配
  - GET /api/v1/customers/assignment — 客户归属查询
  - POST /api/v1/customers/assignment — 客户归属调整与记录
  - GET /api/v1/commissions — 提成核算结果查询
  - GET /api/v1/blacklists — 黑名单风险名单查询
  - POST /api/v1/blacklists — 新增黑名单风险拦截记录
- 数据模型：Employee、Role、Permission、StaffRole、Member、MemberProfile、MemberDocument、MatchRecord、FollowUpRecord、Activity、ActivityRegistration、CheckInRecord、MembershipPlan、BillingOrder、PaymentRecord、RevenueSnapshot、CustomerAssignment、CommissionLedger、BlacklistEntry、ReminderTask、AuditLog、ExportJob（结构变更必须附 up/down 迁移）

## 安全 / 权限审核清单
- 越权访问：每个接口都校验身份与资源归属
- 水平越权：用户只能访问自己的数据（按 owner 过滤）
- 垂直越权：RBAC 权限码校验，前后端权限一致
- 敏感字段：密码 / 令牌 / 隐私字段不落日志、不明文返回
- 审计日志：关键操作留痕（谁 / 何时 / 做了什么）
- 会话 / 令牌：本项目统一采用 NextAuth Credentials——设置过期、可注销失效、防重放
- 输入校验：所有外部输入做校验与转义，防注入（Web 另需防 XSS / CSRF）
- 所有接口必须基于 NextAuth Credentials 验证身份并校验角色权限码
- 会员证件资料与敏感字段必须加密存储，禁止明文落库
- 黑名单命中后必须阻断匹配、报名、收费与归属调整等高风险动作
- 操作日志必须记录操作者、时间、对象、前后值摘要与请求 ID
- 导出任务必须做权限校验、脱敏与下载授权控制
- 财务与提成接口必须防止越权查看其他门店或其他员工数据
- 所有上传文件必须校验类型、大小、来源与文件名安全性
- 对外返回不得泄露身份证号、联系方式、隐私字段原文
- 回访提醒与批量导出必须具备审计记录与幂等保护
- 匹配与归属调整必须保留可追溯的人工干预记录

## 总控调度流程
1. 需求分析：澄清目标、边界与验收标准
2. 任务拆分：拆成可独立交付的小任务，标注负责角色与依赖关系
3. 契约收敛：先让契约 owner 定稿接口契约（OpenAPI / DTO / 错误码 / 分页 / 权限码），各方确认
4. 分派执行：把任务连同契约、DoD 一起分派给对应角色
5. 进度跟踪：收集各角色的结构化产出报告
6. 交叉审核：审核代码质量、契约一致性、安全与 DoD 达成情况
7. 返工闭环：不达标的退回对应角色，附明确修改点
8. 集成验收：全部满足 DoD 后做集成验证，输出最终验收结论

## 协作关系
- **后端工程师** `backend-engineer` ↔ frontend-engineer, database-engineer, testing-engineer, security-engineer, devops-engineer
- **前端工程师** `frontend-engineer` ↔ backend-engineer, testing-engineer, security-engineer, devops-engineer
- **数据库工程师** `database-engineer` ↔ backend-engineer, testing-engineer, security-engineer, devops-engineer
- **测试工程师** `testing-engineer` ↔ backend-engineer, frontend-engineer, database-engineer, security-engineer, devops-engineer
- **安全工程师** `security-engineer` ↔ backend-engineer, frontend-engineer, database-engineer, testing-engineer, devops-engineer
- **运维工程师** `devops-engineer` ↔ backend-engineer, frontend-engineer, database-engineer, testing-engineer, security-engineer

## 职责归属（owner_paths，审核归属而非编辑限制）
> 本包为开放写权限模式：执行角色 allowed_paths=["**"]（技术上可改任意文件），orchestrator 只读。owner_paths 只决定「谁对这片文件负责、跨职责改动需要谁复核」。
- **后端工程师** `backend-engineer`｜职责归属：`src/app/api/**`、`src/server/**`、`src/lib/server/**`、`src/lib/auth/**`｜只读审查：`prisma/**`、`docs/api/**`、`docs/coordination/**`
- **前端工程师** `frontend-engineer`｜职责归属：`src/app/(public)/**`、`src/app/(admin)/**`、`src/components/**`、`src/app/layout.tsx`、`src/app/globals.css`、`src/lib/client/**`、`src/styles/**`、`public/**`｜只读审查：`src/app/api/**`、`prisma/**`、`docs/coordination/**`
- **数据库工程师** `database-engineer`｜职责归属：`prisma/**`｜只读审查：`src/app/api/**`、`src/server/**`、`docs/coordination/**`
- **测试工程师** `testing-engineer`｜职责归属：`tests/**`、`__tests__/**`、`e2e/**`、`src/test-utils/**`、`vitest.config.*`、`vitest.setup.*`、`jest.config.*`、`playwright.config.*`｜只读审查：`src/app/api/**`、`src/app/(admin)/**`、`prisma/**`、`docs/coordination/**`
- **安全工程师** `security-engineer`｜职责归属：`security/**`、`docs/security/**`｜只读审查：`src/app/api/**`、`src/lib/auth/**`、`prisma/**`、`docs/coordination/**`
- **运维工程师** `devops-engineer`｜职责归属：`.github/**`、`scripts/**`、`infra/**`、`Dockerfile`、`docker-compose.*`、`docker/**`、`deploy/**`、`README.md`、`docs/*.md`、`package.json`、`pnpm-lock.yaml`、`tsconfig.json`、`next.config.*`、`tailwind.config.*`、`eslint.config.*`、`.eslintrc.*`、`.prettierrc.*`、`prettier.config.*`、`.gitignore`、`.env.example`｜只读审查：`src/app/api/**`、`src/app/(admin)/**`、`prisma/**`、`security/**`、`docs/coordination/**`
- **总控 Agent**（总控）｜只读，不写任何文件

## 落地产物（本包已生成，配合执行层约束）
- `.github/CODEOWNERS` — 路径 → 审核归属角色（代表「谁需要审核」，不代表「谁能改」）
- `.github/workflows/ci.yml` — CI 跑 DoD（lint / 测试 / 构建），devops 按技术栈补全
- `agent-paths.json` + `scripts/check-allowed-paths.sh` — 提交前跨职责提醒（执行角色只警告不阻断；orchestrator 只读，写文件即阻断）
- `templates/` — 交接单 / 接口契约 / 验收报告 模板

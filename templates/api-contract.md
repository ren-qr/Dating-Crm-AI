# 契约（由 contract owner 定稿，冻结后改动走裁决记录）

> interface_kind = rest

## 约定
统一响应体：{ code: number, message: string, data: T | null, requestId: string, timestamp: string }。分页响应：{ items: T[], page: number, pageSize: number, total: number, hasNext: boolean }. 错误码约定：0=成功，1000=参数错误，1001=未认证，1002=无权限，1003=资源不存在，1004=状态冲突，1005=黑名单拦截，1006=资料校验失败，1007=文件上传失败，1008=导出任务失败，2000=服务器内部错误。鉴权方案：NextAuth Credentials，所有业务接口默认需要登录；通过角色与权限码做二级授权。权限码：member:read/member:write/member:delete，profile:read/profile:write，document:read/document:write/document:delete，match:read/match:write/match:execute，followup:read/followup:write，activity:read/activity:write/activity:checkin，billing:read/billing:write，finance:read/finance:write，staff:read/staff:write，role:read/role:write，customer:read/customer:assign/customer:commission，blacklist:read/blacklist:write，reminder:read/reminder:write，audit:read，export:read/export:write。DTO 约定：所有创建/更新请求使用显式字段名，日期统一 ISO-8601 字符串，金额统一以分为单位整数，布尔字段使用 true/false，状态字段使用受限枚举。列表查询支持 page/pageSize/sortBy/sortOrder/keyword 及模块特定过滤条件；所有可搜索文本字段采用分页模糊查询但不暴露敏感原文。文件资料通过预签名上传或受控上传接口登记元数据，不直接返回私有存储地址。

## 接口列表
| 方法 | 路径 | 说明 | 负责角色 |
|------|------|------|----------|
| POST | /api/v1/auth/login | 员工账号密码登录，签发会话 | backend-engineer |
| POST | /api/v1/auth/logout | 登出并清理会话 | backend-engineer |
| GET | /api/v1/me | 获取当前登录员工、角色与权限 | backend-engineer |
| GET | /api/v1/members | 会员档案分页查询 | backend-engineer |
| POST | /api/v1/members | 创建会员婚恋档案 | backend-engineer |
| GET | /api/v1/members/{id} | 查看会员详情 | backend-engineer |
| PATCH | /api/v1/members/{id} | 更新会员档案 | backend-engineer |
| POST | /api/v1/members/{id}/documents | 登记或上传会员证件资料元数据 | backend-engineer |
| GET | /api/v1/matches | 匹配关系与牵线记录分页查询 | backend-engineer |
| POST | /api/v1/matches/execute | 执行多条件智能匹配并生成候选牵线结果 | backend-engineer |
| POST | /api/v1/followups | 新增相亲跟进记录 | backend-engineer |
| GET | /api/v1/activities | 线下相亲活动列表查询 | backend-engineer |
| POST | /api/v1/activities | 发布线下相亲活动 | backend-engineer |
| POST | /api/v1/activities/{id}/checkins | 活动报名签到登记 | backend-engineer |
| GET | /api/v1/billing/plans | 会员收费套餐列表 | backend-engineer |
| POST | /api/v1/billing/charges | 生成会员收费单或续费单 | backend-engineer |
| GET | /api/v1/finance/summary | 营收统计汇总 | backend-engineer |
| GET | /api/v1/staff | 员工与角色列表查询 | backend-engineer |
| POST | /api/v1/staff | 创建员工账号与角色分配 | backend-engineer |
| GET | /api/v1/customers/assignment | 客户归属查询 | backend-engineer |
| POST | /api/v1/customers/assignment | 客户归属调整与记录 | backend-engineer |
| GET | /api/v1/commissions | 提成核算结果查询 | backend-engineer |
| GET | /api/v1/blacklists | 黑名单风险名单查询 | backend-engineer |
| POST | /api/v1/blacklists | 新增黑名单风险拦截记录 | backend-engineer |
| GET | /api/v1/reminders | 到期回访提醒列表 | backend-engineer |
| POST | /api/v1/exports | 发起数据导出任务 | backend-engineer |
| GET | /api/v1/audit-logs | 操作日志审计查询 | backend-engineer |

## 每个接口的完整定义（按此模板逐个补全）
```
### <METHOD> <path>
- 权限码 / 请求 DTO / 响应 DTO / 错误码 / 分页排序过滤 / 请求示例 / 响应示例
```

## 数据模型 / 实体
- Employee
- Role
- Permission
- StaffRole
- Member
- MemberProfile
- MemberDocument
- MatchRecord
- FollowUpRecord
- Activity
- ActivityRegistration
- CheckInRecord
- MembershipPlan
- BillingOrder
- PaymentRecord
- RevenueSnapshot
- CustomerAssignment
- CommissionLedger
- BlacklistEntry
- ReminderTask
- AuditLog
- ExportJob
（结构变更需附迁移 / 版本管理）

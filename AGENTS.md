# Meetra 工程协作约定

本文件只约束所有任务都适用的工程边界。按需阅读与任务相关的代码、Schema、契约或部署文档；不要为小改动预读整个仓库，也不要因不存在的审批人暂停安全的本地工作。

## 默认完成方式

- 在请求范围内连续完成实现、验证和必要修复；仅在不可逆迁移、权限扩大、破坏性接口或缺少关键业务规则时请求确认。
- 运行与本次改动风险相称的 lint、类型检查和测试；跨模块、核心安全边界或用户明确要求时运行完整工程门禁。
- 如涉及接口契约、公开行为、Schema、安全策略、部署或运行说明，同步对应文档；无关改动不更新 README 或制造文档副本。
- 如新增数据库迁移，提供可逆迁移或明确说明不可逆风险、受影响数据和恢复方案。

## 交付报告

仅在修改代码、配置、Schema 或文档时输出：变更摘要、修改文件、验证结果、风险/影响、需复核事项。只读问答、状态查询和本地服务启动可简短回复。

## 稳定技术边界

- 包管理器：`pnpm`。
- 鉴权：NextAuth Credentials。业务接口默认验证登录身份，并在服务端执行权限与资源作用域判断。
- API 成功响应遵循 `{ code, message, data, requestId, timestamp }`；分页数据遵循 `{ items, page, pageSize, total, hasNext }`。新增或变更接口时使用 [templates/api-contract.md](templates/api-contract.md) 记录契约。
- 不记录或明文返回密码、令牌、联系方式、证件及其他敏感原文；外部输入必须校验；高风险操作需要审计留痕。
- 不得绕过既有门店、负责人、角色或权限范围。当前业务与数据事实以代码和 `prisma/schema.prisma` 为准，不以历史模块清单推断。

## 协作与边界

- `agent-paths.json` 是唯一机器可读的职责归属来源；`scripts/check-allowed-paths.sh` 的跨职责提示是复核提醒，不阻塞开放写权限模式下的实现。
- 跨职责改动在交付报告中列出受影响 owner。破坏性接口、不可逆迁移、权限/安全策略扩大或生产部署变更，必须明确列出待确认事项后再合入。
- 接口、Schema 或安全边界变更应附契约、迁移/风险说明和针对性测试；普通兼容性调整无需等待人工复核才可完成本地验证。
- 一项任务使用一组内聚提交，提交信息格式为 `type(scope): 摘要`。

## 按需流程与文档

- 跨团队、跨模块或里程碑级工作：阅读 `docs/coordination/operating-model.md`。
- 接口变更：阅读 `templates/api-contract.md`。
- 交接或验收：按需使用 `templates/handoff.md`、`templates/acceptance-report.md`。
- Schema、权限或产品边界：读取对应的 `docs/database/`、`docs/security/`、`docs/requirements/` 或 `docs/v3/` 文档。

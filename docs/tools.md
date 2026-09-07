# 系统工具清单

状态：Phase 1。此文件是业务工具的唯一清单；Agent Runtime 的能力契约在 `src/agent-system/capabilities/`。工具按业务能力定义，不向调用方暴露 Prisma、SQL 或表级操作。

| 工具名称 | 功能 | 输入 | 输出 | 权限 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `search_members` | 在当前门店、当前员工负责范围内确定性筛选会员；不做匹配或排序 | 年龄、性别、现居/籍贯 Area code、职业、学历、现有收入类别、分页 | 受控摘要列表与分页信息 | `member:read` | 已接入 Phase 1 Runtime |
| `get_member_profile` | 按已解析且重新 ACL 校验的唯一会员获取低敏摘要 | 仅 Gateway 生成的 `memberId` | 受控个人资料摘要 | `member:read` | 已接入 Phase 1 Runtime |
| `get_member_mate_preference` | 读取会员择偶要求，尚未注册为 Phase 1 Agent capability | `memberId`、字段白名单 | 按需择偶要求 | `member:read` | 现有确定性工具，未接入 Agent |

## `search_members`

- **使用场景**：聊天自然语言筛选、固定筛选入口、在已有查询上继续收窄或翻页。
- **输入参数**：`ageMin`、`ageMax`、`gender`、`currentProvinceCode/currentCityCode/currentDistrictCode`、`hometownProvinceCode/hometownCityCode/hometownDistrictCode`、`occupation`、`education`、`incomeRange`、`page`、`pageSize`。
- **输出结构**：底层 `{ items, page, pageSize, total, hasNext }`；Runtime 再生成 ModelSafeResult 与 AuthorizedDisplayResult。
- **权限与范围**：必须 `member:read`；查询强制当前门店 + 当前负责人。模型不可提供门店、员工或 DB ID。
- **异常与澄清**：未知参数、反向年龄范围、页大小越界为验证失败；无已定义政策的学历/收入模糊表达为澄清；地区必须经 `AreaResolver` 转为 `Area.code`。
- **测试**：确定性查询、权限/门店/负责人隔离、云端字段脱敏、状态连续筛选、面积义解析、输入/输出 schema、错误不提交状态。

## `get_member_profile`

- **使用场景**：查看当前结果第 N 位、已选中会员、当前范围内唯一姓名或会员编号。
- **输入参数**：Capability 对外只声明 `memberRef/memberName/memberNo`；Gateway 的 `MemberReferenceResolver` 在当前 scope 内解析，Executor 最终只接收唯一 `memberId`。
- **输出结构**：与搜索同一低敏资料投影：本地模型可见姓名；云端模型不见姓名；两者均不见 `memberNo`、内部 ID、电话、证件、hash 与自由文本。
- **权限与范围**：必须 `member:read`；每次读取再次校验当前门店 + 当前负责人；旧 `item-N` 不是授权令牌。
- **异常与澄清**：无选中项、序号越界、同名、范围变化或不存在分别澄清/不可用；不伪造资料。
- **测试**：item-N 映射、同名澄清、stale reference 重新 ACL、云端投影、Executor 防伪造。

## Runtime 数据边界

- 复用 `src/business-support/tools/member/member-tools.ts` 作为 `search_members` 的唯一确定性查询实现和年龄派生来源。
- `RawResult` 只能由 adapter 处理；`ModelSafeResult` 才能进 ContextBuilder；`AuthorizedDisplayResult` 仅给已认证 UI，包含 `resultRef + item-N` 导航引用而不含内部 ID。
- `MemberSensitiveInfo`、`MemberExtraProfile` 自由文本、跟进/匹配/黑名单/文档内容均不进入 Phase 1 模型上下文。

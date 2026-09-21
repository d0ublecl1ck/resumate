# 用户故事：外部 Agent 使用者与集成者

这些故事的受益者是使用或接入 Agent 的人。系统上下文、轮次协调和事务约束迁入[公共契约](contracts.md)的 ER-9.3、ER-11.2、ER-11.4，原编号映射见[覆盖表](coverage.md)。P0 为 MVP，P1 为增强。

## Epic 12：开放生态

### US-12.1 用已有 Agent 操作简历【P0】
作为已有个人 Agent 的求职者，我希望通过公共 API 创建和编辑简历，以便继续使用既有记忆与工作资料。
```gherkin
Scenario: 不依赖内置 Runtime 完成编辑
Given 内置 Runtime 未运行，我的外部 Agent 持有合法 Token 且采用 approval
When 外部 Agent 请求创建并编辑简历
Then 公共 API 返回可审阅创建摘要和内容 Diff，确认与结算后产生可追溯版本
Scenario: 使用自有上下文
Given 外部 Agent 有用户提供的岗位资料，Token 没有 profile:write
When Agent 基于这些资料提出简历修改
Then 系统按正常权限和 Diff 流程处理，既不要求运行内置 Agent，也不自动写入 Profile
```

### US-12.4 按接入指南完成核心流程【P0】
作为使用 Hermes、Codex 或通用 Agent 的求职者，我希望获得可装载的能力指南，以便少做手工适配。
```gherkin
Scenario: 装载标准指南
Given Agent 可装载系统提供的 SKILL，且已配置合法凭证
When 我按指南要求 Agent 创建/编辑简历、选模板、从 Profile 生成、管理 JD 与软绑定、按 JD 微调、回滚或导出
Then 指南为每种操作给出工具、参数、确认和轮次步骤，可按公共契约执行对应流程
Scenario: 指南与 API 对齐
Given 接入文档声明了对应契约版本
When 集成者按 Hermes、Codex 和通用 MCP 示例运行最小流程
Then 示例中的工具、字段、确认响应与该版本 OpenAPI 一致
```

### US-12.6 显式管理外部编辑轮次【P0】
作为开发外部 Agent 集成的开发者，我希望声明一次用户任务的开始与结束，以便多次 API 修改只形成一个版本。
```gherkin
Scenario: 显式结算
Given 我通过创建 turn 获得 user_turn_id，并在该轮应用多个有效 Patch
When 我调用 finalize
Then 系统每份简历最多提交一个聚合版本，返回该轮最终状态及各资源结果
Scenario: 重试结算
Given 同一 turn 已成功 finalize
When 我用相同幂等键重试该结算
Then 系统返回原结果，不创建第二个版本
Scenario: 关闭后迟到写入
Given turn 已关闭
When 客户端继续用该 turn 写入
Then API 返回 TURN_ALREADY_CLOSED，既不修改旧草稿，也不创建隐式新任务
Scenario: 客户端未结算即断线
Given turn 有有效修改，D-04 的空闲期限已冻结
When 空闲时间达到关闭期限
Then 系统停止该轮写入并按 C-04 结算，客户端重连可查询最终结果
```

### US-12.8 用 MCP 工具接入【P0】
作为使用通用 MCP 客户端的求职者，我希望发现并调用标准工具，以便在熟悉的 Agent 中操作简历。
```gherkin
Scenario: MCP 核心流程
Given MCP 客户端已认证且有相应 Scope
When Agent 调用 Profile 检索、Resume 创建、JD 管理与微调、Diff、提交、版本和导出工具
Then 工具遵循与 REST 相同的资源、授权和聚合规则，结果包含可追踪的公共资源标识
Scenario: MCP 越权
Given Token 只允许读取 Profile
When 客户端请求写入 Profile
Then 工具返回权限错误，不能通过 MCP 绕过公共 API 的授权门
```

### US-12.9 用 TypeScript SDK 集成【P0】
作为构建 TypeScript 客户端的集成者，我希望使用类型明确的 SDK，以便减少手写请求与错误解析。
```gherkin
Scenario: 完成 TypeScript 最小流程
Given 我使用公开示例配置 TypeScript SDK 和 Token
When 我运行检索、创建、审阅、写入、结算和导出的示例
Then SDK 按契约返回类型化结果，并保留 PendingAction、冲突、轮次关闭等状态
```

### US-12.10 订阅资料变更事件【P1】
作为同步个人工作流的集成者，我希望订阅已授权资源事件，以便在变更后触发自己的处理。
```gherkin
Scenario: 接收已提交事件
Given 我订阅了获准资源的 profile.updated、resume.version.created 或 export.completed
When 相应操作成功完成
Then 接收端获得带唯一事件 ID、资源标识及可验证签名的通知，失败提交不发送成功事件
Scenario: 重复投递
Given 接收端未成功确认上一次通知
When 服务按 D-04 重试投递
Then 重试沿用同一事件 ID，接收端可去重，耗尽后订阅记录显示失败状态
Scenario: 授权已撤销
Given 订阅对应的资源权限已被撤销
When 后续资源发生变化
Then 系统不再向该订阅投递资源事件
```

### US-12.11 用 Python SDK 集成【P0】
作为构建 Python 工具的集成者，我希望使用公开 SDK，以便将简历能力接入自己的脚本。
```gherkin
Scenario: 完成 Python 最小流程
Given 我使用公开示例配置 Python SDK 和 Token
When 我运行检索、创建、审阅、写入、结算和导出的示例
Then SDK 保留与公共 API 相同的结果、幂等键和可处理错误，不私自跳过确认
```

### US-12.12 自动发现接入能力【P0】
作为配置第三方 Agent 的集成者，我希望查询能力发现端点，以便确定契约、入口和认证方式。
```gherkin
Scenario: 查询能力
Given 我已知服务根地址
When 我请求 GET /.well-known/resume-agent
Then 响应列出契约版本、OpenAPI/MCP 入口和认证方式，不返回私人资源或凭证
```

### US-12.13 保持内外部编辑结果一致【P0】
作为交替使用内置与外部 Agent 的求职者，我希望两种入口共用历史与审阅流程，以便自由切换工具。
```gherkin
Scenario: 对等内容操作
Given 内外部客户端拥有等价权限、相同基线和执行模式
When 它们分别在独立测试简历上执行相同内容修改
Then Diff、授权要求、版本聚合与错误语义一致，外部版本仅以 client_id 区分来源
Scenario: 不信任伪造来源
Given PAT 客户端伪造 source=manual 或请求参数 execution_mode=full_access
When 它提交写操作
Then 服务端仍按 agent 身份与固化模式鉴权，不因伪造字段跳过确认
```

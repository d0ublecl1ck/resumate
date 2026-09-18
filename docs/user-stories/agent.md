# 用户故事：Agent 与系统

> 来源：《Resumate：对话式简历编辑系统》产品文档。索引见 `README.md`。
> 优先级：P0 = MVP 必须；P1 = 迭代增强；EXT = 比赛扩展。
> 格式：作为【角色】，我希望【目标】，以便【价值】。

---


## Epic 9：Agent Runtime 与工具

### US-9.3 上下文管理【P0】
作为系统，我希望按需加载简历摘要与相关章节而非全量历史，以便控制上下文成本。
- [ ] 默认注入系统提示、当前简历摘要、current_version_id、最近消息
- [ ] 完整章节按需读取，工具结果结构化压缩

---



---

## Epic 11：版本聚合（UserTurn 与手动缓冲）

### US-11.2 跨轮次边界【P0】
作为系统，我希望新消息到达时先 finalize 上一轮并拒绝迟到写入，以便轮次边界严格清晰。
- [ ] 两次用户消息必然属于两个不同 UserTurn 与版本边界
- [ ] 已关闭 turn 的迟到写入被拒绝（TURN_ALREADY_CLOSED）或转入新系统任务


### US-11.4 并发冲突处理【P0】
作为系统，我希望写入携带 base_version_id 并在冲突时返回 409，以便多入口编辑不互相覆盖。
- [ ] Patch、Snapshot、Version、current_version_id 同事务原子更新
- [ ] 写接口幂等（idempotency_key），重试不产生重复版本
- [ ] 冲突时 Agent 重新基于最新版本重做 Patch

---



---

## Epic 12：开放生态

### US-12.1 外部 Agent 接入【P0】
作为外部 Agent 用户，我希望自己的 Agent 通过 OpenAPI/MCP/SDK 接入系统，以便复用已有记忆和个人上下文而无需迁移到内置 Agent。
- [ ] 内置与外部 Agent 使用相同工具 Schema 与公共 API
- [ ] 提供 REST/OpenAPI、MCP Server 与 TS/Python SDK
- [ ] 接入文档含 Hermes、Codex 与通用 MCP 示例


### US-12.4 能力发现与 Webhook【P1】
作为外部 Agent 开发者，我希望通过 capability discovery 与 webhook 集成系统，以便自动化订阅变更。
- [ ] `GET /.well-known/resume-agent` 返回 OpenAPI、MCP、认证方式和版本
- [ ] Webhook：profile.updated、resume.version.created、export.completed

# Resumate 对话式简历编辑系统 PRD

## 文档信息

| 项目 | 内容 |
| --- | --- |
| 状态 | Draft：待产品、设计、工程和测试共同确认 |
| 版本 | 0.2 |
| 日期 | 2026-09-21 |
| 故事基线提交 | `2843477`：100 条用户故事，公共契约 C-01～C-13 |
| 适用范围 | Resumate 简历工程、JD 管理与岗位微调、Profile 工程、Agent Runtime、开放接入和面试扩展 |
| 需求基线 | [产品设计蓝图](../design.md)、[用户故事索引](../user-stories/README.md)、[公共行为契约](../user-stories/contracts.md)、[覆盖表](../user-stories/coverage.md) |

本文是产品与工程之间的共同约束。用户故事文件保留完整的 Given/When/Then 场景；本文负责说明问题、范围、交付切片、成功标准、依赖和决策边界。若本文与用户故事的具体场景发生冲突，以已确认的公共契约和用户故事为准，并在变更日志中记录调整。

## 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| 0.1 | 2026-09-21 | 根据产品定义与角色用户故事整理首版 PRD |
| 0.2 | 2026-09-21 | 同步 JD 管理、岗位微调、软绑定及最新轮次与授权契约 |

## 目录

1. [执行摘要](#1-执行摘要)
2. [问题陈述](#2-问题陈述)
3. [目标用户与角色](#3-目标用户与角色)
4. [战略背景](#4-战略背景)
5. [解决方案概览](#5-解决方案概览)
6. [成功指标](#6-成功指标)
7. [用户故事与需求](#7-用户故事与需求)
8. [范围边界](#8-范围边界)
9. [依赖与风险](#9-依赖与风险)
10. [开放问题](#10-开放问题)
11. [PRD 自评](#11-prd-自评)

## 1. 执行摘要

Resumate 为求职者提供一个以 Profile 为事实源、以 Resume 为岗位投影，并以 JD 记录岗位需求的对话式简历编辑系统：用户可以维护完整职业事实，保存和检索多个岗位 JD，按目标岗位生成或微调多份简历，并通过自然语言提出修改；Agent 只能通过公共 API 读取和写入，内容变更在授权模式下先生成可审阅 Diff，在 Full Access 模式下允许普通内容修改连续执行但仍保留高影响操作确认，最终通过 Working Copy、UserTurn 和不可变版本统一结算。确认、拒绝和取消等绑定待办的控制事件留在原轮次，只有新的独立任务消息才开启新轮次。系统同时向用户自己的 Hermes、Codex、MCP 客户端或 SDK 开放同一套能力，使内置 Agent 与外部 Agent 共享权限、审计、版本、冲突和导出语义。成功交付的结果是：用户能以可信、可回滚、可迁移的方式完成岗位简历准备，而不必把个人记忆和工作资料迁移到某个内置 Agent 中。

🔶 **Assumption：** 对话式编辑、Profile 与 Resume 分离、可复用的 JD 记录、岗位微调和开放 Agent 接入会同时降低重复维护成本并提升用户对修改结果的信任；当前仓库没有用户访谈、留存或任务完成基线，需要在开发前验证。

## 2. 问题陈述

### 2.1 谁遇到问题

主要用户是需要准备一个或多个岗位版本的求职者，包括首次制作简历的人、同时维护校招版和社招版的人，以及希望在不同岗位方向复用同一套职业事实的人。

次要用户包括：

- **模板管理员**：维护可复用模板、渲染边界和模板版本稳定性。
- **外部 Agent 使用者**：希望继续使用自己的 Agent、长期记忆和工作资料。
- **集成开发者**：将 Profile、Resume、Diff、Version 和导出能力接入 MCP、TypeScript SDK、Python SDK 或自动化工作流。

### 2.2 发生了什么

当前需求显示出五类相互关联的问题：

1. **事实与投递版本混在一起**：完整职业资料、岗位筛选和最终投递文案需要不同生命周期，但传统简历编辑容易把一份简历当作唯一事实源。
2. **AI 修改缺少可验证边界**：自然语言意图需要转换为结构化修改；用户需要知道修改了什么、依据是什么、将写入哪一份简历以及是否已经提交。
3. **多次修改难以追踪和恢复**：手动输入、Agent 多次 Patch、取消、失败、并发和重试可能产生碎片版本、覆盖工作或重复提交。
4. **用户被锁定在单一 Agent 入口**：用户已有的记忆、岗位资料和工作流可能存在于外部 Agent 中；如果公共能力只服务内置 Runtime，用户需要迁移上下文且难以切换工具。
5. **岗位需求缺少可复用上下文**：JD 如果只是一次性粘贴，用户无法持续管理岗位要求、比较关联简历或在 JD 更新后安全地重新生成微调建议。

### 2.3 为什么痛苦

**用户影响：**

- 同一事实需要在多份简历中重复输入和维护。
- 用户无法快速判断 AI 是否虚构了数字、改变了目标简历或使用了未经确认的事实。
- 取消或失败后，用户不清楚哪些修改已生效，容易重复操作或误以为内容丢失。
- 历史版本、岗位来源和事实依据不完整时，用户很难解释某段简历内容从何而来。
- 已保存岗位要求若没有修订和快照边界，JD 更新可能让旧 Diff 失效或误改错误简历。
- 外部 Agent 无法复用公共能力时，用户被迫迁移个人上下文或接受内置 Agent 的工作方式。

**产品影响：**

- 没有稳定的 Patch、Version 和授权语义，前端、内置 Agent、MCP 和 SDK 会形成不同实现。
- 没有公开且可移植的数据契约，用户难以迁移完整职业资料，生态接入成本升高。
- 高影响操作边界不清会同时带来误操作、权限越界、审计不完整和用户信任下降。

### 2.4 当前证据与限制

当前可验证的需求证据来自产品设计蓝图、角色用户故事、公共行为契约和需求覆盖表，详见[用户故事索引](../user-stories/README.md)。仓库没有提供以下数据：用户访谈、现有产品分析、竞品数据、简历任务完成率、导出失败率或模型成本基线。

🔵 **Open Question：** 产品负责人需要补充目标用户访谈或任务观察，确认用户最优先解决的是事实维护、岗位生成、AI 审阅、版本恢复还是外部 Agent 接入。

🔵 **Open Question：** 产品和数据负责人需要补充当前任务完成率、首次完成时间、人工返工率和导出成功率，作为第 6 节指标基线。

## 3. 目标用户与角色

### 3.1 主要角色：求职者

| 维度 | 描述 |
| --- | --- |
| 角色 | 需要准备一个或多个岗位简历的个人用户 |
| 目标 | 维护完整职业事实，保存岗位需求，快速生成或微调岗位版本，准确表达经历并准备面试 |
| 约束 | 时间有限；同一经历需要适配不同岗位；不能接受虚构事实、误改已投递内容或 JD 变化覆盖旧成果 |
| 当前任务 | 收集经历、保存 JD、复制旧简历、选择关联简历、调整岗位表达、导出文件、复盘历史修改 |
| 需要的信任 | 修改有依据、提交目标明确、历史可追溯、失败可恢复、外部访问可控 |

**功能性工作：** 维护 Profile 事实和 JD，选择或复制 Resume 作为岗位微调目标，审阅和提交 Patch，导出或恢复指定版本。

**情绪工作：** 确认简历内容真实、知道 Agent 正在做什么、在失败或冲突后仍然掌控工作。

**🔶 Assumption：** 求职者愿意将职业事实集中维护在 Profile 中，并接受 Resume 是面向岗位的选择性投影；需要通过首次使用流程和访谈验证。

### 3.2 次要角色：外部 Agent 使用者与集成开发者

| 维度 | 外部 Agent 使用者 | 集成开发者 |
| --- | --- | --- |
| 目标 | 在自己的 Agent 中完成简历任务 | 用稳定契约构建 MCP、SDK 或自动化集成 |
| 关键需求 | 不运行内置 Runtime 也能创建、编辑、导出和恢复 | 类型明确、错误可处理、轮次可结算、事件可去重 |
| 信任要求 | 外部 Agent 与内置 Agent 规则一致 | API、MCP、SDK、内置 Agent 语义一致 |

### 3.3 次要角色：模板管理员

模板管理员负责模板的草稿、边界校验、发布、下架和修订。管理员可以管理模板资源，但不因此获得求职者私有 Profile 或 Resume 内容访问权。模板发布后，已有简历继续引用原模板版本；新修订不得静默改变已投递简历的呈现。

### 3.4 系统参与者

内置 Agent、面试官 Agent、Resume Service、Profile Service、Version Service、Render/Export Service、Model Gateway、Webhook Dispatcher 和 Audit Log 是实现参与者，不作为独立用户角色。它们必须通过公共契约协作，业务真相由 Resume/Profile API 和版本数据保存。

## 4. 战略背景

### 4.1 产品目标

本项目将以下结果作为产品方向：

1. **把个人职业事实与岗位简历分离**：Profile 保存完整事实、证据和验证状态；Resume 保存特定岗位、模板和时间点的选择性内容。
2. **把岗位需求变成可复用、可追溯的对象**：JD 独立保存原文、来源、修订和最多一份当前绑定简历；岗位微调可改选其他简历或复制后修改，不自动改变原绑定。
3. **让对话成为编辑入口，而不是新的数据真相源**：Agent 负责理解意图、调用工具和解释结果；业务状态仍由公共 API 管理。
4. **建立可审阅、可回滚的修改闭环**：所有内容变化经过 Patch、Diff、Working Copy 和正式 Version 的一致流程。
5. **支持开放生态**：内置 Agent 和外部 Agent 使用同一套 OpenAPI、MCP、SDK、PAT、Webhook 和能力发现契约。
6. **为面试准备形成后续闭环**：从 Resume 与 JD 生成题库、模拟面试、评估报告和成长计划。

### 4.2 差异化定位

Resumate 的差异化来自组合关系：

- **事实源与投影分离**：Profile 不受一页简历和单一岗位限制；Resume 不会因 Profile 更新而静默变化。
- **岗位上下文可复用**：JD 独立保存修订和来源，支持绑定、换绑、解绑、直接微调或复制后微调；JD 删除不级联删除 Resume，历史版本保留当时的 JD 快照。
- **修改可解释**：Agent 给出字段/行级 Diff、理由、事实来源和提交边界。
- **入口开放**：内置 Agent 只是公共 API 的参考客户端；用户可继续使用自己的 Agent 和个人上下文。
- **版本语义统一**：手动编辑、内置 Agent、外部 Agent、MCP 和 SDK 共用冲突、幂等、审计、取消和恢复规则。
- **高影响操作有硬边界**：Full Access 免除普通内容修改的逐次确认，但删除、回滚、覆盖导出、Profile 选材、显式同步和事实晋升仍需确认。

### 4.3 为什么现在

产品定义已经明确了简历工程、轻量 Agent、Profile、开放生态、执行模式和版本聚合的共同方向；当前用户故事也已将授权、取消、导出、并发和轮次边界拆为可验收场景。现在需要将这些分散约束收敛为一个可供产品、设计、后端、前端、测试和集成开发者共同使用的交付基线。

🔶 **Assumption：** 先固定公共可观察行为，再决定具体数据库、Patch 格式、检索实现和 MCP 部署方式，可以降低后续多客户端分叉风险；需要在架构评审中验证。

### 4.4 商业和市场数据边界

本 PRD 不编造 TAM、SAM、SOM、收入、转化率或竞品份额。商业目标、目标市场和竞品证据需要单独完成研究后补入；在此之前，本文只作为产品需求和工程验收基线。

## 5. 解决方案概览

### 5.1 产品模型

系统由 Profile、JD、Resume 三个内容域和一个开放运行层组成：

- **Profile 工程**：保存个人职业事实、证据、验证状态、可见性和 Profile 版本。
- **JD 工程**：保存岗位名称、公司、正文、来源、标签、修订和最多一份当前绑定 Resume；岗位微调使用 JD 快照，不把 JD 当作系统指令。
- **Resume 工程**：保存岗位简历、结构化章节、模板、Patch、Diff、Working Copy 和 Resume 版本。
- **Agent Runtime 与开放生态层**：负责对话、上下文、工具调用、执行模式、流式事件和外部接入，不维护另一套业务状态。

核心关系如下：

```text
Profile ── 选材与来源快照 ──> Resume
JD ── 当前软绑定（0 或 1 份） ──> Resume
JD revision + 所选 Resume 基线 ──> 微调 Diff
内置 Agent / 外部 Agent / 前端 ── 公共 API ──> Working Copy
Working Copy ── finalize / flush ──> ResumeVersion
```

一个 Resume 可被多个 JD 引用；本次微调目标与 JD 的当前绑定分别保存。

### 5.2 端到端用户流程

#### 流程 A：创建与编辑岗位简历

1. 用户通过表单或对话提出创建目标，可选关联已保存 JD。
2. 系统确定目标岗位、标题、资料来源、模板、JD revision 和当前模式。
3. approval 模式下，Agent 展示创建摘要并等待再次确认；Full Access 可创建，但仍记录来源和结果。
4. 系统创建可引用基线的草稿，Agent 读取相关 Profile 内容或用户提供的事实。
5. Agent 生成结构化 Patch，系统校验目标、Schema、事实依据和 `base_version_id`。
6. approval 模式展示 PendingAction 与 Diff；Full Access 对普通内容 Patch 直接更新 Working Copy。
7. 用户接受、拒绝或编辑建议，在原轮次处理对应待办；本轮结束、取消、失败或下一条独立任务消息到达时，权限有效则 finalize，权限已撤销则冻结草稿。
8. 每个 Resume 最多产生一个本轮聚合正式版本；无实际变化不创建空版本。

#### 流程 B：从 Profile 生成岗位简历

1. 用户选择 Profile，并输入岗位方向、粘贴 JD 或选择已保存 JD。
2. 系统按 Scope 返回相关事实、证据、置信度和匹配理由。
3. Agent 展示候选事实、基本信息范围、标题和岗位目标；使用已保存 JD 时展示其 revision。
4. 两种模式均需确认选材及创建范围，草稿保存 `profile_version_id`、`selected_fact_ids`、`target_role` 和 JD 快照。approval 中，随后生成的首版实际文案另展示 Diff；只确认选材不代表批准未展示的文案，相同已展示并确认的负载不重复确认。
5. approval 中，接受的首版内容进入原轮次 Working Copy；Full Access 中普通内容 Patch 可自动应用。结算后生成首版内容版本，Profile 保持不变。
6. Profile 后续更新不静默覆盖已生成 Resume；用户必须显式请求同步。

#### 流程 C：手动编辑与导出

1. 用户在结构化编辑器中输入，前端立即更新本地草稿并同步服务端缓冲。
2. 自动保存开启时，以最后一次有效输入为起点计算 30 秒静默窗口。
3. 页面切换、离开、显式保存或导出前，系统先 flush 手动缓冲。
4. 导出固定 `resume_version_id`、模板版本和导出配置；导出本身不生成内容版本。
5. 保存或渲染失败时保留草稿并明确显示失败阶段，不能显示成功下载状态。
6. 自动保存关闭时暂停静默提交；异常关闭后恢复服务端已收到的未提交草稿，经过 30 秒也不视为已生成版本，主动保存、切换、离开和导出入口仍可 flush。

#### 流程 D：JD 管理与岗位微调

1. 用户保存岗位名称和 JD 正文，可附公司、来源链接和标签；岗位名称或正文为空时不得创建记录。
2. 用户可搜索 JD、查看关联简历，并将一个 JD 绑定、换绑或解绑一份可访问 Resume；绑定只改 JD 元数据，不生成 ResumeVersion。
3. 发起岗位微调时默认选择当前绑定 Resume；未绑定时必须明确选择 Resume，不能默认修改最近编辑的简历。
4. 用户选择直接微调原稿或复制后微调；改选其他 Resume 只影响本次任务，不自动替换 JD 绑定。
5. Agent 基于 JD revision 和 Resume 基线生成候选 Diff；任一发生变化，旧预览和旧确认失效。
6. 结算后只提交实际目标 Resume 的聚合版本，保留 JD 快照、来源 Resume 和绑定状态；删除 JD 不删除 Resume 或历史快照。

#### 流程 E：外部 Agent 接入

1. 用户创建受限 PAT，指定 Scope、资源、字段、用途和有效期。
2. 客户端通过能力发现端点获得契约版本、OpenAPI/MCP 入口和认证方式。
3. 外部 Agent 通过 REST、MCP、TypeScript SDK 或 Python SDK 创建 UserTurn，调用公共工具并携带稳定 `user_turn_id`。
4. approval 模式下处理 PendingAction；Full Access 只按服务端固化模式放宽普通内容写入。
5. 确认、拒绝和取消等绑定待办的控制事件在原轮次消费；只有新的独立任务消息才关闭旧轮次并开启新 `user_turn_id`。
6. 客户端显式 finalize；先检查当前权限再返回重复请求的原结果。已关闭轮次的迟到写入返回 `TURN_ALREADY_CLOSED`；凭证撤销后不能读取幂等缓存结果。
7. 客户端断线时按 D-04 空闲期限关闭轮次；权限有效则结算，授权撤销则冻结未提交草稿，仅所有者重新审阅后可在新轮次恢复。

#### 流程 F：面试与能力提升扩展

1. 用户固定 Resume 版本和 JD，选择 Java 后端或 Web 前端岗位知识库。
2. 每个岗位均提供技术知识、项目深挖、场景和行为题及对应知识库与评价标准；独立简历题库生成和笔试题入口保留为 EXT 独立能力。
3. 用户通过文本或语音回答，系统按上下文继续追问；语音不可用时降级到文本。
4. 系统生成包含回答证据的多维评估报告。
5. 用户查看同口径成长曲线并生成与薄弱维度关联的练习计划。

### 5.3 能力分层与交付优先级

| 层级 | P0 首发 | P1 增强 | EXT 扩展 |
| --- | --- | --- | --- |
| Resume | 多简历 CRUD、复制、标签、归档、软删除、结构化编辑、Diff、版本、恢复、预览、PDF/Markdown/JSON 导出 | 文档导入、语义比较、批量修改、模板并排比较 | 作为面试输入的稳定 Resume 快照 |
| Profile | 事实 CRUD、证据、验证、搜索、岗位匹配、来源追溯、从 Profile 生成 Resume | 更强检索和同步策略 | 面试事实关联 |
| JD | JD CRUD、搜索筛选、详情、绑定/换绑/解绑、候选简历选择、直接微调和复制后微调 | — | 面试输入的稳定 JD 快照 |
| Agent | 单会话 Loop、工具、SSE、预算、取消、重试、approval、Full Access、UserTurn 聚合 | 多会话恢复、上下文压缩优化、模型路由/成本/评测 | 面试官 Agent |
| 开放生态 | OpenAPI、PAT、基础 Scope、MCP、TypeScript/Python SDK、能力发现、导出/恢复 | Webhook | 外部面试工作流 |
| 模板 | 创建、发布、下架、删除保护、版本固定 | 边界自动校验、并排比较 | — |
| 设置与治理 | 模型配置、Agent 配置、主题、语言、头像昵称、自动保存、默认模板、快捷键、审计 | — | — |
| 面试 | — | — | 双岗位各覆盖技术知识、项目深挖、场景和行为题，并使用对应知识库、文本/语音追问、评估、成长曲线和改进计划 |

### 5.4 系统边界

实现应遵循现有[设计蓝图](../design.md)的同仓库前后端分离结构：`ui/` 提供 React 界面，`backend/` 提供 FastAPI 服务。业务模块应按领域进入 `backend/app/modules/<domain>/`，HTTP 路由、业务服务、DAO、模型和公共 Schema 分层。具体数据库、领域 Patch 格式、快照策略、检索算法和 MCP 部署方式属于第 10 节及公共契约 C-12/C-13 的实现决策，不在本 PRD 中预先指定。

## 6. 成功指标

### 6.1 指标原则

当前没有可靠基线，因此以下指标先定义测量口径，不填入未经验证的数值。产品负责人和数据负责人在发布前补齐 baseline、目标值、样本范围、统计周期和埋点责任。

### 6.2 主指标

**主指标：目标简历任务成功率**

- **定义：** 用户从提出创建、生成或编辑目标开始，到得到符合目标且完成正式结算的 Resume 版本的任务比例；岗位微调任务必须同时关联有效 JD revision。
- **纳入条件：** 目标 Resume、UserTurn、最终版本、任务结果和必要的来源/确认状态可关联。
- **当前基线：** 🔵 Open Question，尚未测量。
- **目标值：** 🔵 Open Question，需按创建、Profile 生成、JD 微调和普通编辑拆分后确认。
- **时间窗口：** 🔵 Open Question，需确定按 UserTurn、会话还是用户任务统计。

### 6.3 次指标

| 指标 | 口径 | 基线/目标 |
| --- | --- | --- |
| JD 微调完成率 | 已保存 JD 选择目标 Resume 后，成功生成并结算岗位相关版本的比例；直接修改和复制后微调分开统计 | 🔵 待确认 |
| JD 绑定稳定性 | 绑定、换绑、解绑成功且不产生内容版本、不误删 Resume 的比例 | 目标为 100%；基线待测 |
| 首次有效版本完成率 | 新用户创建或导入后产生首个有内容正式版本的比例 | 🔵 待确认 |
| Diff 审阅通过率 | 产生 Patch 后，用户接受或编辑后接受并成功结算的比例 | 🔵 待确认 |
| 无效修改率 | 因虚构事实、错误目标、Schema 错误或权限拒绝而需要重做的修改比例 | 🔵 待确认 |
| 版本重复率 | 相同幂等请求造成重复版本的比例 | 目标为零；基线待测 |
| 冲突恢复完成率 | 发生 409 后，用户或 Agent 成功基于新版本完成提交的比例 | 🔵 待确认 |
| 导出成功率 | 固定版本后产生可下载且通过完整性校验文件的比例 | 🔵 待确认 |
| 外部客户端完成率 | 通过 REST/MCP/SDK 完成最小创建、审阅、提交、导出流程的比例 | 🔵 待确认 |
| 事实来源覆盖率 | Resume 内容可追溯到 ProfileFact 或用户明确输入的比例 | 目标为 100% 的可追溯内容；实现口径待确认 |
| 模型任务成本 | 按 Run、模型、Token 和价格版本记录的成本 | 预算和告警阈值待确认 |

### 6.4 安全与一致性护栏

以下是发布门槛，而非可用增长目标：

- 未获 Scope 或资源归属的读取和写入必须被拒绝，且不得泄露资源存在性之外的内容。
- 外部文本、JD、文件、网页和工具结果不得改变权限、执行模式或确认状态。
- Full Access 不得跳过删除、回滚、覆盖导出、Profile 选材、显式同步和事实晋升确认。
- 已关闭 UserTurn 的迟到写入必须返回 `TURN_ALREADY_CLOSED`，不得污染新轮次。
- 相同身份、资源和负载的重复写入、flush、finalize 在当前权限仍有效时返回原结果，不生成重复版本；已撤销凭证不能读取幂等缓存。
- 失败、取消和超时在权限仍有效时只能结算边界前的有效修改；授权撤销时冻结草稿等待所有者重新审阅；未批准提案不得进入 Working Copy 或正式版本。
- Profile 更新不得静默改写既有 Resume；模板新修订不得静默改变既有简历排版。
- JD revision 或目标 Resume 基线变化时，旧岗位微调预览和确认必须失效；换绑、解绑和删除 JD 不得改写 Resume 内容或历史快照。
- 模型凭证不得明文回传；审计中不得记录可恢复的密钥内容。

### 6.5 埋点和验收要求

每个 P0 用户任务至少需要记录：用户角色、资源 ID、JD ID 与 revision（如适用）、版本 ID、`user_turn_id`、`agent_run_id`、客户端、执行模式、确认结果、冲突结果、失败阶段、导出结果和耗时。测试记录应使用固定输入，并同时覆盖成功、拒绝、冲突、取消、重试、恢复和无变化路径。

## 7. 用户故事与需求

### 7.1 Epic 假设

我们认为，将完整职业事实集中到 Profile、将岗位需求保存为可复用 JD、将岗位简历建模为可追溯投影，并让内置与外部 Agent 通过统一的 Diff、权限和版本 API 工作，可以减少重复维护和误操作，使用户更快完成可信的岗位简历任务。我们将通过目标简历任务成功率、JD 微调完成率、事实来源覆盖率、Diff 审阅结果、冲突恢复结果和外部客户端最小流程完成率验证这一假设。

### 7.2 交付切片与扩展

#### Epic A：简历创建、管理和结构化编辑

**用户结果：** 求职者可以通过表单或对话创建独立草稿，搜索、复制、切换、重命名、归档、恢复和编辑多份简历。

| 故事 | P0 验收结果 | 规范来源 |
| --- | --- | --- |
| US-1.1 | 对话创建展示岗位、标题、拟带入基本信息和来源；回复“确认创建”并明确待办后在原轮次创建；补齐内容先展示 Diff | [jobseeker.md](../user-stories/jobseeker.md#us-11-对话创建简历) |
| US-1.2 | 标题搜索、排序和无匹配空状态可用 | [jobseeker.md](../user-stories/jobseeker.md#us-12-找到目标简历) |
| US-1.3 | 复制后身份、内容和历史独立 | [jobseeker.md](../user-stories/jobseeker.md#us-13-复制简历创建岗位分支) |
| US-1.4 | 切换前结算旧轮；目标歧义时先选择 | [jobseeker.md](../user-stories/jobseeker.md#us-14-对话切换当前简历) |
| US-1.5 | 字段校验、章节移动、自定义章节和稳定 ID 保持一致 | [jobseeker.md](../user-stories/jobseeker.md#us-15-手动结构化编辑) |
| US-1.7 | 重命名只改元数据，不生成内容版本 | [jobseeker.md](../user-stories/jobseeker.md#us-17-重命名简历) |
| US-1.8 | 归档隐藏于活跃列表，可重新启用，历史保留 | [jobseeker.md](../user-stories/jobseeker.md#us-18-归档与重新启用简历) |
| US-1.9 | 删除为软删除；恢复窗口内可恢复，过期后明确拒绝 | [jobseeker.md](../user-stories/jobseeker.md#us-19-删除与恢复简历) |
| US-1.10 | 标签和时间范围组合筛选 | [jobseeker.md](../user-stories/jobseeker.md#us-110-用标签筛选简历) |
| US-1.11 | 表单创建可复用默认 Profile 和模板；无 Profile 也能建空草稿 | [jobseeker.md](../user-stories/jobseeker.md#us-111-手动新建简历) |

#### Epic B：自然语言编辑、Diff、版本与导出

**用户结果：** 用户能看懂 Agent 修改的目标、理由、来源和状态，并安全地提交、导出、比较或恢复内容。

| 故事 | P0 验收结果 | 规范来源 |
| --- | --- | --- |
| US-2.1 | 自然语言意图生成可审阅 Diff；没有事实时追问或给无虚构候选 | [jobseeker.md](../user-stories/jobseeker.md#us-21-自然语言编辑简历) |
| US-2.3 | 撤销和回滚先展示反向 Diff 与候选版本 | [jobseeker.md](../user-stories/jobseeker.md#us-23-对话式撤销与回滚) |
| US-2.4 | 运行进度可见；取消时权限有效则结算有效修改，撤权则冻结草稿；失败重试不重放成功写入 | [jobseeker.md](../user-stories/jobseeker.md#us-24-查看取消与重试-agent-执行) |
| US-3.1 | 展示 before/after、字段/行级变化、上下文、理由和最终状态 | [jobseeker.md](../user-stories/jobseeker.md#us-31-看清修改内容与理由) |
| US-3.2 | 支持逐项接受、拒绝、编辑后接受；重复确认幂等；依赖错误可解释 | [jobseeker.md](../user-stories/jobseeker.md#us-32-逐项决定保留哪些修改) |
| US-4.1 | 正式版本不可变，时间线包含作者、说明、摘要和快照 | [jobseeker.md](../user-stories/jobseeker.md#us-41-查看不可变版本历史) |
| US-4.2 | 任意两个版本可比较，同版显示无差异 | [jobseeker.md](../user-stories/jobseeker.md#us-42-对比任意两个版本) |
| US-4.3 | 手动恢复先 flush，再以新编辑会话提交；Agent 恢复进入原轮 Working Copy；新内容提交使旧 redo 失效 | [jobseeker.md](../user-stories/jobseeker.md#us-43-恢复撤销与重做内容) |
| US-4.4 | 可识别 manual/agent 来源及客户端、模式、消息和工具链 | [jobseeker.md](../user-stories/jobseeker.md#us-44-识别版本来源) |
| US-5.1 | 草稿预览与正式版本区分；渲染失败保留旧成功预览并可重试 | [jobseeker.md](../user-stories/jobseeker.md#us-51-预览最终呈现) |
| US-5.2 | PDF/Markdown 导出先结算手动缓冲；失败阶段可见；导出不改内容 | [jobseeker.md](../user-stories/jobseeker.md#us-52-导出可投递或可读文件) |
| US-5.4 | JSON 导出包含当前版本完整结构、稳定 ID 和来源标识 | [jobseeker.md](../user-stories/jobseeker.md#us-54-导出结构化简历) |
| US-6.3 | 模板切换不改内容版本；预览、模板和导出版本一致 | [jobseeker.md](../user-stories/jobseeker.md#us-63-选择模板并比较呈现效果) |

#### Epic C：Profile 事实源与岗位生成

**用户结果：** 用户维护一次完整事实，并按目标岗位选择性生成多份 Resume；Profile 变化不会静默污染已有简历。

| 故事 | P0 验收结果 | 规范来源 |
| --- | --- | --- |
| US-7.1 | 保存经历、项目、技能、教育、证书、作品等事实及来源、证据和验证状态 | [jobseeker.md](../user-stories/jobseeker.md#us-71-建立完整事实档案) |
| US-7.2 | 新简历复用最新获准基本信息；旧简历保持原值并可提示同步 | [jobseeker.md](../user-stories/jobseeker.md#us-72-基本信息一次维护创建时复用) |
| US-7.3 | Profile 版本可比较、恢复；既有 Resume 不静默更新 | [jobseeker.md](../user-stories/jobseeker.md#us-73-安全查看和恢复档案历史) |
| US-7.4 | 按 JD 返回相关事实、证据、置信度、理由和缺口 | [jobseeker.md](../user-stories/jobseeker.md#us-74-按岗位找素材) |
| US-7.5 | 反向列出事实被哪些简历及版本使用 | [jobseeker.md](../user-stories/jobseeker.md#us-75-查看事实用于哪些简历) |
| US-7.6 | 更正事实生成 Profile 新版本，事实身份保持 | [jobseeker.md](../user-stories/jobseeker.md#us-76-修正个人事实) |
| US-7.7 | 删除事实前展示引用影响；历史简历不变 | [jobseeker.md](../user-stories/jobseeker.md#us-77-删除过期事实) |
| US-7.8 | 支持关键词、岗位、标签、类型和数量上限查询 | [jobseeker.md](../user-stories/jobseeker.md#us-78-搜索与筛选事实) |
| US-7.9 | 事实验证状态和证据来源可见，不由模型自行证明 | [jobseeker.md](../user-stories/jobseeker.md#us-79-标明事实验证状态) |
| US-7.10 | Token 不可见事实不出现在内容、证据或可反推摘要中 | [jobseeker.md](../user-stories/jobseeker.md#us-710-控制档案披露范围) |
| US-7.11 | 支持默认 Profile 的创建、使用和删除影响预览 | [jobseeker.md](../user-stories/jobseeker.md#us-711-管理默认个人档案) |
| US-8.1 | 先审阅选材和创建摘要；创建后再审阅首版实际文案 Diff，未接受文案不进入 Working Copy | [jobseeker.md](../user-stories/jobseeker.md#us-81-从-profile-生成岗位简历) |
| US-8.2 | 同一 Profile 支持不同岗位投影，逐段可追溯 | [jobseeker.md](../user-stories/jobseeker.md#us-82-跨方向复用同一档案) |
| US-8.3 | Profile 同步先预览，用户只提交选中变化 | [jobseeker.md](../user-stories/jobseeker.md#us-83-显式同步档案更新) |
| US-8.4 | 新事实晋升 Profile 必须独立确认；Full Access 也不能免除 | [jobseeker.md](../user-stories/jobseeker.md#us-84-将新事实加入-profile) |

#### Epic D：Agent 运行和执行模式

**用户结果：** Agent 可控、可取消、可重试，运行模式在服务端固定，并且不能因为提示词或外部内容改变权限边界。

| 故事/契约 | P0 验收结果 | 规范来源 |
| --- | --- | --- |
| US-9.1 | 步骤、Token、成本、超时任一上限触发后停止后续调用并按 C-04 结算 | [jobseeker.md](../user-stories/jobseeker.md#us-91-控制单次执行预算) |
| US-9.2 | PendingAction 绑定确认人、tool_call、资源、基线和负载；目标变化使旧确认失效 | [jobseeker.md](../user-stories/jobseeker.md#us-92-确认准确的写入目标) |
| US-10.1 | approval 默认开启；创建和普通写入按规则再次确认 | [jobseeker.md](../user-stories/jobseeker.md#us-101-默认授权模式) |
| US-10.2 | Full Access 只免普通内容逐次确认；删除、回滚、覆盖导出等仍需确认 | [jobseeker.md](../user-stories/jobseeker.md#us-102-full-access-连续编辑) |
| US-10.3/C-02 | 模式按会话、Agent、账户优先级解析；Run 启动后固定 | [jobseeker.md](../user-stories/jobseeker.md#us-103-明确模式的作用范围)、[contracts.md](../user-stories/contracts.md#c-02-模式与资源作用域) |
| US-11.1/C-03 | 同一 UserTurn 多次 Patch 或恢复历史内容均进入同一 Working Copy；每份 Resume 最多一个版本；无变化不建版本 | [jobseeker.md](../user-stories/jobseeker.md#us-111-一条消息聚合为一次提交)、[contracts.md](../user-stories/contracts.md#c-03-working-copy-与正式版本) |
| US-11.3/C-05 | 自动保存开启时从最后一次输入计算 30 秒窗口；关闭时保留草稿；保存、切换、离开、导出仍主动 flush | [jobseeker.md](../user-stories/jobseeker.md#us-113-连续手动编辑合并保存)、[contracts.md](../user-stories/contracts.md#c-05-手动编辑与导出) |
| US-11.5/C-06 | 基线过期返回 409；保留冲突草稿；重做 Diff 后才能提交 | [jobseeker.md](../user-stories/jobseeker.md#us-115-处理同时编辑冲突)、[contracts.md](../user-stories/contracts.md#c-06-并发幂等与错误-er-114原-us-114) |
| US-11.6 | 异常关闭后恢复服务端已收到的输入；自动保存关闭时保持未提交草稿并提供保存入口 | [jobseeker.md](../user-stories/jobseeker.md#us-116-恢复异常关闭前的输入) |
| C-04/C-09 | 确认留在原轮次；失败、超时、取消在权限有效时结算，撤权时冻结；关闭轮次拒绝迟到写入 | [contracts.md](../user-stories/contracts.md#c-04-userturn-生命周期-er-112原-us-112)、[contracts.md](../user-stories/contracts.md#c-09-agent-runtime-er-93原-us-93) |

#### Epic E：开放生态、迁移和对等客户端

**用户结果：** 用户可以控制外部访问，使用自己的 Agent 或 SDK 完成核心流程，并迁移完整资料和历史。

| 故事 | P0 验收结果 | 规范来源 |
| --- | --- | --- |
| US-12.1 | 外部 Agent 不运行内置 Runtime 也能完成创建、编辑、审阅、提交 | [agent.md](../user-stories/agent.md#us-121-用已有-agent-操作简历) |
| US-12.2 | PAT 可按 Scope、资源、字段、用途和有效期限制 | [jobseeker.md](../user-stories/jobseeker.md#us-122-发放最小权限-token) |
| US-12.3 | 完整备份包含 Profile/Resume 全部版本、父子关系、来源、JD 记录与当前绑定映射及版本内 JD 快照 | [jobseeker.md](../user-stories/jobseeker.md#us-123-导出完整个人资料与历史) |
| US-12.4 | 接入指南覆盖 JD 管理、软绑定和岗位微调，以及既有简历流程；工具、字段、确认和轮次步骤与契约一致 | [agent.md](../user-stories/agent.md#us-124-按接入指南完成核心流程) |
| US-12.5 | Token 撤销后新访问拒绝；未提交草稿冻结，只有资源所有者重新审阅后才能在新轮次恢复 | [jobseeker.md](../user-stories/jobseeker.md#us-125-撤销-token-并查看访问日志) |
| US-12.6 | 外部 Agent 显式 begin/finalize；重复 finalize 幂等；迟到写入返回固定错误 | [agent.md](../user-stories/agent.md#us-126-显式管理外部编辑轮次) |
| US-12.7 | 结构化备份先校验引用和预览；确认后创建新资源并映射恢复 JD 绑定，未映射目标报告为未绑定 | [jobseeker.md](../user-stories/jobseeker.md#us-127-从结构化备份恢复) |
| US-12.8 | MCP 包含 JD 管理与微调工具，与 REST 使用相同资源、授权、版本和聚合规则 | [agent.md](../user-stories/agent.md#us-128-用-mcp-工具接入) |
| US-12.9 | TypeScript SDK 完成检索、创建、审阅、写入、结算和导出，并保留类型 | [agent.md](../user-stories/agent.md#us-129-用-typescript-sdk-集成) |
| US-12.11 | Python SDK 保留公共结果、幂等键、确认和错误语义 | [agent.md](../user-stories/agent.md#us-1211-用-python-sdk-集成) |
| US-12.12 | 能力发现端点只返回契约、入口、能力和认证方式 | [agent.md](../user-stories/agent.md#us-1212-自动发现接入能力) |
| US-12.13 | 内外部客户端在相同权限和基线下得到一致 Diff、确认、版本和错误语义 | [agent.md](../user-stories/agent.md#us-1213-保持内外部编辑结果一致) |
| C-07/C-10 | 数据可移植、公共接口和审计字段版本化；PAT/MCP 不得伪造 manual 或 Full Access | [contracts.md](../user-stories/contracts.md#c-07-profile-与可移植性)、[contracts.md](../user-stories/contracts.md#c-10-公共接口与审计) |

#### Epic F：模板、设置与隐私

**用户结果：** 模板发布和设置可管理、可审计，个人资料默认私有，已使用模板和简历版本稳定。

| 故事 | P0 验收结果 | 规范来源 |
| --- | --- | --- |
| US-6.1 | 管理员可保存未发布模板草稿；无权限账户被拒绝 | [admin.md](../user-stories/admin.md#us-61-创建可复用模板) |
| US-6.5 | 必需配置和渲染校验通过后才能发布 | [admin.md](../user-stories/admin.md#us-65-发布模板) |
| US-6.6 | 下架阻止新选用但不影响已有引用；可重新上架 | [admin.md](../user-stories/admin.md#us-66-下架模板并保留已有简历) |
| US-6.7 | 无引用模板可确认删除；有引用模板只能下架 | [admin.md](../user-stories/admin.md#us-67-删除未使用的模板) |
| US-6.8 | 已发布模板修改形成新修订，旧简历继续使用旧版本 | [admin.md](../user-stories/admin.md#us-68-更新模板而不改变已投递样式) |
| US-13.1/13.6 | 模型凭证加密、不回显；Agent 配置按 Run 固化且不能绕过权限 | [jobseeker.md](../user-stories/jobseeker.md#us-131-使用自己的模型配置)、[jobseeker.md](../user-stories/jobseeker.md#us-136-配置-agent-行为) |
| US-13.2/13.3/13.4 | 主题、头像、昵称和语言持久化；简历原文和历史内容不被自动翻译 | [jobseeker.md](../user-stories/jobseeker.md#us-132-保存界面主题偏好)、[jobseeker.md](../user-stories/jobseeker.md#us-133-设置头像与昵称)、[jobseeker.md](../user-stories/jobseeker.md#us-134-切换界面语言) |
| US-13.5 | Profile/Resume 默认私有，访问和变更审计可查 | [jobseeker.md](../user-stories/jobseeker.md#us-135-审计敏感数据访问与变更) |
| US-13.10/13.11/13.12 | 自动保存、默认模板/导出配置和快捷键行为可持久化并处理边界 | [jobseeker.md](../user-stories/jobseeker.md#us-1310-配置自动保存)、[jobseeker.md](../user-stories/jobseeker.md#us-1311-设置默认模板与导出配置)、[jobseeker.md](../user-stories/jobseeker.md#us-1312-查看与配置快捷键) |

#### Epic G：面试与能力提升扩展

**用户结果：** 用户可以以固定 Resume/JD 和岗位知识为上下文练习，并获得有依据的评估和下一步计划。

| 故事 | 验收结果 | 规范来源 |
| --- | --- | --- |
| US-14.1 | 面试题关联 Resume 版本、岗位、证据和参考答案 | [jobseeker.md](../user-stories/jobseeker.md#us-141-根据简历生成面试题) |
| US-14.2 | Java 后端与 Web 前端各覆盖技术知识、项目深挖、场景和行为题，使用差异化知识库和评价标准，引用有来源 | [jobseeker.md](../user-stories/jobseeker.md#us-142-使用双岗位知识库练习) |
| US-14.3 | 文本回答触发基于关键词和上下文的追问，问答关联保留 | [jobseeker.md](../user-stories/jobseeker.md#us-143-文本多轮模拟面试) |
| US-14.4 | 报告包含技术、深度、逻辑、匹配和可测表达维度；不可测维度标不适用 | [jobseeker.md](../user-stories/jobseeker.md#us-144-获取有依据的评估报告) |
| US-14.5 | 仅对岗位、题目和量表可比较的记录展示成长趋势 | [jobseeker.md](../user-stories/jobseeker.md#us-145-查看可比较的成长曲线) |
| US-14.6 | 语音回答显示 ASR 转写并由 TTS 播报；服务不可用时降级文本 | [jobseeker.md](../user-stories/jobseeker.md#us-146-用语音参加面试) |
| US-14.7 | 面试固定 Resume 版本和 JD 快照，展示匹配点和风险点 | [jobseeker.md](../user-stories/jobseeker.md#us-147-用-resume-与-jd-准备面试) |
| US-14.8 | 支持客观题、开放题和代码题，并保存题目来源版本 | [jobseeker.md](../user-stories/jobseeker.md#us-148-生成岗位笔试题) |
| US-14.9 | 改进计划关联评估薄弱项、练习题、目标和复测入口 | [jobseeker.md](../user-stories/jobseeker.md#us-149-获得具体改进计划) |

#### Epic H：JD 管理与岗位微调

**用户结果：** 求职者可以保存岗位需求，关联一份常用简历，并在同一 JD 下直接微调或复制后微调；JD 修订、目标 Resume 基线和绑定关系都不会被隐式混淆。

| 故事 | P0 验收结果 | 规范来源 |
| --- | --- | --- |
| US-15.1 | 岗位名称和 JD 正文为必填；保存原文及可选公司、来源链接、标签；空内容不建记录 | [jobseeker.md](../user-stories/jobseeker.md#us-151-保存目标岗位-jd) |
| US-15.2 | 编辑生成新的 JD revision；旧版本中使用的 JD 快照稳定；JD 变化使旧微调 Diff 和确认失效 | [jobseeker.md](../user-stories/jobseeker.md#us-152-更新岗位需求) |
| US-15.3 | 支持岗位/公司/标签筛选、详情、当前绑定状态和微调入口 | [jobseeker.md](../user-stories/jobseeker.md#us-153-查找岗位及关联简历) |
| US-15.4 | 默认选择绑定 Resume；未绑定必须先选；可改选其他 Resume；改选不自动换绑；直接微调只提交目标 Resume | [jobseeker.md](../user-stories/jobseeker.md#us-154-选择不同简历针对同一-jd-微调) |
| US-15.5 | 复制后微调保留原稿；副本独立产生版本；不自动替换 JD 原绑定 | [jobseeker.md](../user-stories/jobseeker.md#us-155-保留原稿并生成岗位副本) |
| US-15.6 | 一个 JD 当前最多绑定一份 Resume；绑定、换绑、解绑只改元数据，不生成 ResumeVersion；失败保留原绑定 | [jobseeker.md](../user-stories/jobseeker.md#us-156-为-jd-绑定换绑或解绑简历) |
| US-15.7 | 删除 JD 先展示影响；删除不级联 Resume；绑定 Resume 不可用时提供换绑或解绑 | [jobseeker.md](../user-stories/jobseeker.md#us-157-删除岗位记录而保留简历) |

JD 相关接口、Scope、revision、绑定、快照和微调边界以 [C-13](../user-stories/contracts.md#c-13-jd-管理与简历软绑定) 为准。岗位微调必须记录 `jd_id`、JD revision、JD 正文快照、来源 Resume 和对应 Resume 基线。

### 7.3 全局工程约束

以下约束横跨所有用户故事，工程实现和验收测试必须复用同一语义：

1. **授权与信任边界**：approval 模式下需确认的操作必须有 PendingAction；Full Access 只放宽普通内容写入；高影响操作仍确认；所有模式都校验身份、归属、Scope、字段权限、Schema、硬性禁止项和审计。
2. **版本边界**：`current_version_id` 只指向正式版本；Working Copy 保存本轮或手动缓冲；finalize/flush 是正式内容版本唯一入口；无变化不创建空版本。
3. **轮次边界**：绑定待办的确认、拒绝、编辑和取消是原轮次的控制事件；只有新的独立任务消息才关闭旧 UserTurn 并开启新轮次。已关闭轮次的写入必须拒绝；取消、失败和超时只在权限仍有效时保留并结算边界前已完成的有效修改，授权撤销时冻结草稿等待所有者重新审阅。
4. **并发与幂等**：写入必须带 `base_version_id`；过期返回 409 和最新版本；写入、flush、finalize 使用 `idempotency_key`，且读取幂等结果前必须重新校验当前身份和权限；重复请求返回原结果。
5. **事实和来源**：不能把未验证内容或模型推断当作事实；Resume 保存 Profile 版本、选中事实和逐段来源；Profile 变更不静默修改已有 Resume；岗位微调额外保存 JD revision 和内容快照。
6. **可信客户端边界**：外部客户端缺少 `source` 时默认标记为 agent；客户端不能通过参数伪造 `manual` 或 `full_access`；执行模式由服务端 Run 上下文决定，PAT/MCP 不因 `resume:write` 获得 JD 管理权限。
7. **外部输入**：JD、文件、网页、提示词和工具结果都视为不可信内容，不能改变授权、模式或资源目标。
8. **JD 绑定边界**：一个 JD 当前最多绑定一份 Resume，一个 Resume 可被多个 JD 引用；绑定、换绑、解绑只改 JD 元数据，不生成 ResumeVersion；改选微调目标不自动替换绑定；删除 JD 不删除 Resume 或历史 JD 快照。

### 7.4 P1 和 EXT 验收前置

US-1.6、US-2.2、US-2.5、US-2.6、US-5.3、US-6.2、US-6.4、US-12.10、US-13.7、US-13.8、US-13.9 以及 US-14.* 不属于 P0 完成条件，但其数据、版本、权限和错误语义必须沿用 P0 公共契约。特别是 D-01～D-05 参数冻结前，不得宣称相关故事已经完成验收。

### 7.5 需求追溯规则

- 完整 Given/When/Then 以[求职者故事](../user-stories/jobseeker.md)、[管理员故事](../user-stories/admin.md)和[外部 Agent 故事](../user-stories/agent.md)为准。
- 公共授权、版本、轮次、并发、可移植性、模板和接口约束以[contracts.md](../user-stories/contracts.md)为准。
- 原有故事拆分、迁移到工程契约和主题覆盖以[coverage.md](../user-stories/coverage.md)为准。
- PRD 新增需求必须先建立故事 ID 或契约 ID，再进入实现；不得复用旧 ID 表示无关能力。

## 8. 范围边界

### 8.1 本期包含

本 PRD 覆盖 P0 简历核心、JD 管理与岗位微调、Profile 事实与生成、Agent 运行与保存、开放生态基础、个人设置、模板生命周期和隐私审计。P1 与 EXT 在第 5、7、10 节保留需求边界，但不作为 P0 交付验收条件。

### 8.2 明确不包含

- 复杂多 Agent 编排和跨 Agent 自主协商。
- 自动投递、招聘网站账号操作和外部招聘平台代办。
- 将 Git 仓库本身作为简历存储。
- 企业多租户复杂权限模型。
- 实时文生视频数字人；数字人/DDS 只作为后续表现层选项。
- 将尚未选定的数据库、领域 Patch 格式、快照存储和检索算法写成产品承诺。
- 用未验证的市场规模、成本、转化率或体验指标替代真实数据。

### 8.3 未来考虑

- OAuth 与更细粒度的企业级授权。
- 多租户组织、团队模板协作和更复杂的审计治理。
- 更强的语义检索、上下文压缩、模型路由和成本优化。
- PDF/Markdown 之外的导入格式和附件事实抽取增强。
- 语音和数字人表现层的进一步体验设计。

## 9. 依赖与风险

### 9.1 依赖

| 类型 | 依赖 | 交付要求 |
| --- | --- | --- |
| 产品 | D-01～D-05 参数冻结 | 在对应功能开发和验收前冻结恢复窗口、语言/上传限制、渲染目标、轮次空闲和评测口径 |
| 设计 | Diff、三栏工作台、JD 管理、岗位微调、预览失败、冲突和多资源结果状态 | 覆盖草稿、待确认、已提交、取消、失败、冲突、空状态、不可用绑定和 JD revision 变化 |
| 后端 | Resume/Profile/Version/JD/Turn/Manual Edit 公共服务 | 统一校验、事务、幂等、错误码、审计和 OpenAPI |
| 前端 | 统一 API Client 和状态展示 | 不自行推导保存成功、版本提交或权限结果；按服务端状态渲染 |
| Agent | Tool Registry、Context Builder、Approval Gate、SSE | 只通过公共 API 操作业务状态，断线和重启可恢复 |
| 模型 | Provider、能力、价格和凭证管理 | API Key 加密、不回显；记录实际模型、用量和价格版本 |
| 渲染 | 模板版本、字体、纸张、PDF 生成 | 预览和导出固定相同输入，边界样例可复现 |
| 开放生态 | PAT、MCP、TypeScript/Python SDK、能力发现、Webhook | 结果、错误、确认、轮次和版本语义与 REST 一致 |
| 测试 | 固定故事输入、边界样例和评测集 | P0 场景具备自动测试或可复现人工验收记录 |

### 9.2 风险与缓解

| 风险 | 类型 | 缓解方式 | 责任角色 |
| --- | --- | --- | --- |
| 用户并不愿意先维护 Profile，首次使用成本过高 | Value/Usability | 提供无 Profile 空草稿；比较表单创建、对话创建和 Profile 生成的完成率；做用户访谈 | 产品/设计 |
| Agent 生成看似合理但无证据的量化成果 | Value/Safety | 事实来源和验证状态进入 Patch 校验与 Diff；无依据时追问或给无数字候选；覆盖反虚构测试 | 产品/Agent/测试 |
| Full Access 免确认范围被误解为可删除或回滚 | Usability/Safety | Run 启动时展示模式范围；高影响操作独立 PendingAction；最终 Diff 和撤销入口始终可见 | 产品/前端/后端 |
| 取消、失败和下一条消息并发导致错误版本 | Feasibility | 服务端关闭写入边界；UserTurn 状态机；幂等键；针对边界做并发测试 | 后端/测试 |
| 手动和 Agent 同时编辑造成覆盖 | Feasibility | `base_version_id` 乐观锁；409 保留冲突草稿；强制重读并重做 Diff | 后端/前端 |
| 内置 Agent、MCP、SDK 逐渐产生不同语义 | Viability/Feasibility | OpenAPI、工具 Schema、错误码、样例和契约测试作为单一接口基线；内外部对等测试 | 后端/集成 |
| PDF 预览和导出不一致，影响投递 | Usability/Feasibility | 固定内容版本、模板版本、字体和纸张；D-03 边界样例；导出完整性与视觉验收 | 设计/渲染/测试 |
| 用户在 JD 变化或改选简历后误以为旧 Diff 仍适用 | Feasibility/Usability | Diff 固定 JD revision 与 Resume 基线；任一变化使旧确认失效；明确直接修改和复制后微调的影响 | 产品/前端/后端 |
| 外部 Agent 或恶意内容借提示注入扩大权限 | Safety | 外部输入不可信；权限和模式只由服务端上下文决定；JD Scope 独立校验；审计访问并测试越权 | 安全/后端 |
| 模型成本和延迟不可控 | Viability | Run 记录步骤、Token、成本、超时；到达上限时依 C-04 结算；P1 增加路由、成本和评测 | 产品/Agent |
| 评估报告把不可测语音指标当成事实 | Value/Safety | 纯文本场景明确标不适用；有录音才计算语速等指标；保留回答证据和评估口径 | 面试模块/测试 |
| 迁移备份存在损坏引用或敏感附件不可导出 | Feasibility/Safety | 导入前校验和预览；不可导出附件写入清单；不创建部分可见资源；来源不授予权限 | 后端/安全 |

## 10. 开放问题

以下问题没有在现有产品定义、用户故事或公共契约中给出答案。负责人需要在对应开发切片进入验收前完成决策；参数冻结前不得写入“已支持”的固定数值。

| ID | 问题 | 负责人 | 影响范围 | 状态 |
| --- | --- | --- | --- | --- |
| D-01 | Resume 软删除恢复窗口、到期清理和历史保留边界是什么？ | 产品负责人 | US-1.9、C-08 | Open |
| D-02 | 支持哪些语言、时区和问候时段？头像格式/大小、昵称长度上限是什么？ | 产品/设计 | US-1.6、US-13.3、US-13.4 | Open |
| D-03 | 预览延迟、长简历样本、PDF 视觉容差和支持浏览器是什么？ | 设计/测试 | US-5.1、US-6.2、US-6.3 | Open |
| D-04 | 外部 turn 空闲关闭期限、Webhook 重试/退避/留存策略是什么？ | 产品/后端 | US-12.6、US-12.10 | Open |
| D-05 | 文档导入限制、解析范围、模型评测集、评分维度和权重是什么？ | 产品/测试 | US-5.3、US-13.9、US-14.4 | Open |
| Q-01 | 首发主路径是“对话创建”、Profile 生成还是手动表单创建？三者的优先级和入口关系是什么？ | 产品/设计 | US-1.1、US-1.11、US-8.1 | Open |
| Q-02 | 目标简历任务如何定义开始、完成、放弃和重做，以便计算主指标？ | 产品/数据 | 第 6 节全部指标 | Open |
| Q-03 | ResumeDocument 采用领域 Patch 还是 RFC 6902 JSON Patch？ | 后端/架构 | C-12、US-2.1、US-3.2 | Open |
| Q-04 | ResumeVersion 保存全量 Snapshot，还是 Snapshot 加 Patch？ | 后端/架构 | C-03、US-4.*、备份恢复 | Open |
| Q-05 | 首发数据库和本地优先策略如何选择？ | 后端/架构 | C-12、所有持久化能力 | Open |
| Q-06 | ProfileFact 采用统一事实表还是强类型领域表？ | 后端/架构 | C-07、US-7.* | Open |
| Q-07 | Profile 检索采用标签过滤、全文、向量还是混合检索？ | 后端/Agent | US-7.4、US-7.8、US-8.1 | Open |
| Q-08 | Profile 更新后的 Resume 同步默认采用手动、建议式还是策略配置？ | 产品/设计 | US-8.3、C-07 | Open |
| Q-09 | MCP Server 是内置进程还是独立部署？版本兼容策略是什么？ | 后端/集成 | US-12.8、US-12.12 | Open |
| Q-10 | 外部 Agent 未显式 finalize 时，服务端是否按 D-04 自动关闭并结算？ | 产品/后端 | US-12.6、C-04 | Open |
| Q-11 | Full Access 是否允许删除和回滚，还是始终保留硬性确认？当前故事采用“始终确认”。是否需要额外不可配置的禁止项？ | 产品/安全 | C-01、US-10.2 | Open/决策待确认 |
| Q-12 | 一个 UserTurn 修改多份 Resume 时，界面如何呈现多个版本结果和部分成功？ | 产品/设计 | US-2.6、C-03 | Open |
| Q-13 | 面试评估的量表版本、证据最小粒度和成长曲线可比条件是什么？ | 产品/测试 | US-14.4、US-14.5 | Open |
| Q-14 | 首发是否支持附件证据的在线预览、下载和完整迁移？ | 产品/后端 | US-7.*、US-12.3、C-07 | Open |

### 已确认的产品决策

以下内容不再作为开放假设，工程必须按公共契约实现：

- approval 模式下所有 Agent 创建均展示摘要并再次确认；直接表单提交本身是对已展示操作的确认；Profile 选材创建的实际首版文案需单独展示并审阅。
- Full Access 免除普通写入逐次确认，但删除、回滚、覆盖导出、Profile 选材、显式同步和事实晋升仍需确认。
- 取消、失败和超时停止后续写入；权限仍有效时保留边界前已完成的有效修改并 finalize；授权撤销时冻结草稿，等待资源所有者在新轮次重新审阅。
- 绑定待办的确认、拒绝、编辑和取消是原轮次控制事件；只有新的独立任务消息才开启新 UserTurn。
- apply 更新 Working Copy，finalize/flush 才提交正式版本；同一轮普通 Patch 与已确认恢复目标共用一个 Working Copy 和一次正式提交；无实际变化不创建空版本。
- 自动保存开启时按最后一次有效输入后的 30 秒静默窗口提交，关闭时恢复为未提交草稿；显式保存、切换、离开和导出仍触发 flush。
- 导出前先结算手动缓冲；导出不改变源数据、不新增内容版本。
- 已关闭 UserTurn 的迟到写入一律拒绝，不转成隐式新任务。
- 模式优先级为会话、Agent、账户默认；Run 启动时固化，后续设置变更只影响后续 Run。
- JD 为独立岗位记录；一个 JD 当前最多绑定一份 Resume，一个 Resume 可被多个 JD 引用；绑定/换绑/解绑只改元数据，不生成 ResumeVersion。
- 岗位微调可直接修改所选 Resume 或复制后修改；改选目标不自动换绑；JD 或 Resume 变化使旧预览和确认失效；历史版本保留 JD 快照。

## 11. PRD 自评

### 最强部分

第 7 节的需求追溯和第 7.3 节的全局工程约束最完整：它们将角色故事与 C-01～C-13 公共契约放在同一条实现链路上，覆盖了 JD 记录与微调、授权、Diff、版本、轮次、并发、迁移、开放接入和面试扩展的边界。

### 最弱部分

第 4 节战略背景和第 6 节指标仍缺少外部用户证据与真实基线。当前内容来自仓库内设计资料，能够作为需求假设和工程验收口径，不能作为市场规模、商业价值或产品效果的证明。

### 最高风险假设

| 假设 | 影响 | 验证方式 |
| --- | --- | --- |
| 用户愿意先维护 Profile，再生成岗位 Resume | Profile 主路径可能增加首次使用成本 | 访谈并比较空草稿、对话创建和 Profile 生成三条路径 |
| 用户愿意保存并复用 JD，且能理解绑定与改选的区别 | JD 管理可能增加对象和决策负担，直接微调可能误改原稿 | 观察保存 JD、绑定、改选、直接微调和复制后微调任务；测试 JD revision 变化提示 |
| Diff 和版本信息足以建立用户对 Agent 修改的信任 | 用户可能仍需大量手动返工 | 观察真实任务的接受、拒绝、编辑后接受和回滚行为 |
| 外部 Agent 接入是首发价值的一部分 | 生态投入可能早于核心用户需求 | 访谈已有 Hermes/Codex/MCP 工作流用户，验证最小流程使用意愿 |
| UserTurn 聚合能同时降低版本碎片和恢复成本 | 聚合边界可能让用户不理解保存状态 | 用取消、失败、下一条消息和多 Resume 场景做可用性测试 |
| 固定 Resume/JD 和证据关联能提升面试练习质量 | 评估报告可能被认为泛化或不可信 | 使用固定题集和回答样例做盲评，并冻结 D-05 量表 |

### 交付前的下一步

先冻结 D-01～D-05，并补齐主指标的统计口径和基线；随后用一组固定的 P0 任务验证四条路径：对话创建、Profile 生成、JD 微调、手动创建。重点验证待办确认不新开轮次、授权撤销冻结草稿、JD revision 使旧确认失效，以及授权、取消、导出、并发和来源追溯场景。


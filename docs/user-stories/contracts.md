# 公共行为契约与工程需求

本文是所有[用户故事](README.md)共享的验收依据。故事描述用户结果；本文件定义授权、数据和协议约束。功能优先级不代表已经实现。

## C-01 授权与信任边界

产品决策：取消保留已完成的有效修改；Full Access 对高影响操作保留确认；授权模式下所有创建均再次确认。

| Agent 操作 | approval | full_access |
| --- | --- | --- |
| 读取、检索、比较、渲染、导出新文件 | 在资源权限范围内自动执行 | 在资源权限范围内自动执行 |
| 创建或复制 Resume、创建 Profile 或 JD | 展示创建摘要，再次确认后创建 | 直接创建，记录结果与来源 |
| 普通内容 Patch、元数据更新、归档、设置变更 | 展示 Diff 或状态变化摘要，确认后执行 | 自动执行，保留变化摘要与审计 |
| 删除、历史恢复、undo/redo、覆盖已有导出文件 | 独立确认 | 独立确认 |
| Profile 选材生成简历、Resume 事实晋升 Profile、显式同步 Profile 到 Resume | 展示候选事实或 Diff，明确确认 | 仍需明确确认，以维持事实源和已有简历的边界 |

- **BEFORE** Agent 执行需确认的操作 -> **MUST** 创建 PendingAction；内容变更展示 before、after、字段/行级 Diff 和理由，创建、删除、配置等操作展示目标与影响摘要。
- **WHEN** 用户明确要求创建简历 -> **MUST** 在 approval 中再次确认，**MUST NOT** 将最初的创建指令当作待办批准；同一创建预览中已确认选材及目标时 **MUST NOT** 再对相同负载重复要求确认。
- **WHEN** 用户直接使用表单保存或点击创建 -> **MUST** 将该显式交互视为对所展示操作的授权；删除和回滚等仍展示确认步骤，**MUST NOT** 对每次手动字段输入弹出 Agent 确认。
- **BEFORE** 消费确认 -> **MUST** 校验确认人、tool_call_id、资源、基线及负载一致；创建类尚无资源 ID 时绑定创建请求标识、所有者和预览负载。
- **IF** 目标、基线、负载或候选事实版本发生变化 -> **MUST** 使旧确认失效，重新展示预览；重复确认同一请求 **MUST** 返回同一执行结果。
- **WHEN** 外部 JD、文件、网页或工具结果要求跳过确认、改变模式或访问其他资源 -> **MUST** 视为不可信内容，不作为授权依据。
- **IN ALL MODES** -> **MUST** 校验身份、资源归属、Scope、字段权限、Schema、硬性禁止项并记录审计；Full Access **MUST NOT** 扩张 Token 权限。

## C-02 模式与资源作用域

- **WHEN** 创建 AgentRun -> **MUST** 固化服务端解析出的 execution_mode；优先采用显式会话设置，其次 Agent 设置，最后账户默认值；初始默认值为 approval。
- **WHEN** 用户更改模式 -> **MUST** 对之后创建的 Run 生效，保留当前 Run 的已固化模式；界面同时显示当前 Run 模式与后续模式，立即停止执行使用 cancel。
- **WHEN** 设置 scope=system -> **MUST** 解释为该账户的默认设置，**MUST NOT** 赋予普通用户修改其他账户默认值的权限。
- **WHEN** 开关 Full Access -> **MUST** 明示免确认范围及保留确认的操作，并记录操作者、作用域和时间。
- **WHEN** 用户切换 active_resume_id -> **MUST** 先结算该会话上一轮；新的工具调用绑定新目标，旧调用 **MUST NOT** 因 UI 切换而改写其资源 ID。
- **IF** finalize 发生冲突 -> **MUST** 暂停新轮次的写执行，展示待处理冲突；新消息可保留为排队消息，解决冲突后才开启新的写轮次。

## C-03 Working Copy 与正式版本

ResumeDocument 覆盖 basics、summary、education、experience、projects、skills、certificates 和自定义章节。章节与条目使用稳定 ID；排序不会改变身份。Profile 保存完整事实，Resume 保存岗位选材、生成文案及其来源。

- **WHEN** 创建空草稿 -> **MUST** 返回可供首次内容写入引用的基线标识；草稿创建本身为可审计、幂等的资源操作，**MUST NOT** 用它伪装一次实际内容提交。
- **WHEN** 手动或 Agent 修改内容 -> **MUST** 更新各自基于明确 base_version_id 的 Working Copy；current_version_id 只指向最近的正式版本。
- **WHEN** approval 中批准内容 Patch -> **MUST** 更新本轮 Working Copy，**MUST NOT** 每次 apply 都新建正式版本；full_access 普通 Patch 省略 PendingAction，但仍校验 Patch。
- **WHEN** finalize 或 flush -> **MUST** 原子提交聚合 Patch、Snapshot、Version 与 current_version_id；这是正式内容版本的提交入口，包括生成首版内容和经确认的恢复操作。
- **IF** 聚合结果与基线无内容差异 -> **MUST NOT** 创建空版本。
- **WHEN** 同轮修改多份 Resume -> **MUST** 每份最多提交一个版本，并分别展示结果；保证单份简历事务原子性，**MUST NOT** 声称跨简历全局事务。
- **WHEN** 重命名、归档、切换模板或修改用户设置 -> **MUST** 审计元数据或展示配置变化，**MUST NOT** 生成 Resume 内容版本。
- **WHEN** restore/undo/redo -> **MUST** 保留原历史，通过新版本表达最终恢复结果；手动入口先 flush 原缓冲，再预览并以新的编辑会话提交恢复；Agent 入口将已确认的恢复目标应用到本轮 Working Copy，后续修改基于恢复后的草稿，仍由该轮唯一一次 finalize 提交，**MUST NOT** 在同一轮先提交普通 Patch 再额外提交恢复版本。
- **WHEN** undo 后又提交新的内容修改 -> **MUST** 清除旧 redo 分支的可执行状态，历史版本仍可查；无可撤销或重做项时返回可解释的无操作结果。

版本记录包括 source、actor_id、client_id、conversation_id、user_turn_id、agent_run_id、execution_mode、started_at、committed_at、parent_version_id、base_version_id、aggregated_patch、snapshot、message、change_count、affected_sections；不适用字段可为空，并向用户显示原因。手动提交关联 edit_session_id；只有实际人工确认时才记录确认人，自动执行 **MUST NOT** 伪造确认记录。

## C-04 UserTurn 生命周期（ER-11.2，原 US-11.2）

| 事件 | 有效修改处理 | 后续动作 |
| --- | --- | --- |
| 正常结束 | finalize 已成功应用的修改 | 展示最终 Diff、版本和摘要 |
| 失败、超时、取消 | 在权限仍有效时保留有效修改并 finalize；approval 仅包含已批准内容 | 显示终止原因、已保留结果与撤销入口 |
| Token 或资源授权撤销 | 保留尚未提交的草稿，停止自动结算 | 仅资源所有者可重新审阅并在新轮次恢复 |
| 下一条独立任务消息到达 | 串行停止旧轮次写入并 finalize | 旧轮关闭后创建新 user_turn_id |
| 已关闭轮次迟到调用 | 拒绝，不转入隐式系统任务 | 返回 TURN_ALREADY_CLOSED，不影响任何 Working Copy |
| finalize 基线冲突 | 保留冲突草稿，停止提交，不覆盖新版本 | 返回 409，重新预览和处理冲突 |

- **WHEN** 用户通过按钮或对话明确批准、拒绝、编辑待办 -> **MUST** 记录为绑定 PendingAction 的审阅事件，在原轮次处理，**MUST NOT** 将其当作开启新任务的消息；多个待办无法唯一匹配时先澄清对象。
- **WHEN** 用户发来独立的新任务消息 -> **MUST** 关闭上一任务轮次；“一条用户消息一个 UserTurn”中的消息指新任务消息，不包括授权、拒绝和取消控制事件。
- **WHEN** 取消、失败或下一条任务消息关闭旧轮 -> **MUST** 使尚未批准的 PendingAction 失效；已确认的资源创建保留，即使尚未产生内容版本。
- **WHEN** cancel 与工具应用并发 -> **MUST** 以服务端关闭写入边界为准；边界前成功应用的有效 Patch 纳入聚合，边界后调用拒绝。
- **WHEN** 失败重试或重启 -> **MUST** 先读取服务端 turn、待办与提交状态；已提交请求返回原结果，新执行使用新轮次，**MUST NOT** 盲目重放已完成写操作。
- **WHEN** 外部 Agent 工作 -> **MUST** 使用 begin/finalize 端点声明边界，后续请求携带稳定 user_turn_id；同一 turn 可跨多次请求。
- **IF** 外部客户端断线且未 finalize -> **MUST** 按发布前确定的空闲期限关闭轮次并采用同一有效修改保留策略；结算时仍需校验当前权限，已撤销授权的草稿保持冻结，不得通过超时提交绕过撤销；具体期限见 D-04。

## C-05 手动编辑与导出

- **WHEN** 用户输入 -> **MUST** 立即更新本地编辑草稿并同步服务端缓冲；每次有效新输入从最后输入时间重置静默计时器（默认 10 秒，可在设置的「个人偏好」里调为 3–120 秒）。
- **WHEN** 自动保存开启且距最后有效输入满该静默时长 -> **MUST** flush 为一个 source=manual 版本；不同 Resume 的窗口独立；**IF** 用户显式关闭自动保存 -> **MUST** 保留服务端草稿并显示未提交，暂停静默提交计时，主动 flush 入口仍有效。
- **WHEN** 用户切换简历、离开页面、显式保存或导出 -> **MUST** 立即请求 flush；失败时保留草稿并提示未保存，**MUST NOT** 宣称保存或导出成功。
- **WHEN** 浏览器异常关闭 -> **MUST** 保留服务端已收到的缓冲；自动保存开启时按静默计时提交，关闭时等待用户恢复后主动保存；重开页面展示服务器确认状态，**MUST NOT** 声称保存了服务器未收到的输入。
- **WHEN** 导出存在手动缓冲的简历 -> **MUST** 先 flush，再固定导出的 resume_version_id；flush 可产生一个版本，导出过程本身不产生版本或修改内容。
- **WHEN** 导出没有内容变化 -> **MUST NOT** 新建版本；Agent 本轮存在未 finalize 修改时，导出已提交版本并标明版本，或等待本轮结算后重试，**MUST NOT** 默默导出半成品。
- **WHEN** 预览未提交内容 -> **MUST** 标明“草稿预览”；正式版本预览与 PDF 使用相同内容版本、模板版本和导出配置。
- **WHEN** 手动与 Agent 同时编辑 -> **MUST** 各自保持基线，在 flush/finalize 时执行 C-06；预览 **MUST NOT** 把两份未合并草稿显示成一个已保存版本。

## C-06 并发、幂等与错误（ER-11.4，原 US-11.4）

- **BEFORE** 内容写入及提交 -> **MUST** 校验 base_version_id；过期时返回 409、机器错误码和最新版本标识，不改变正式内容。
- **WHEN** 同一 Working Copy 内再次提案 -> **MUST** 基于当前草稿修订校验；用户确认绑定草稿修订，防止同一正式基线下的旧 Diff 覆盖后续草稿。
- **WHEN** 处理冲突 -> **MUST** 重新读取最新内容并重新生成 Diff；approval 和高影响操作重新确认，full_access 普通修改可自动重算后提交。
- **WHEN** 写请求、finalize 或 flush 重试 -> **MUST** 先检查当前身份和权限再读取幂等结果，并使用 idempotency_key；同身份、资源和相同负载的重复键返回原结果，相同键不同负载拒绝，已撤销凭证不能借幂等缓存再次访问结果。
- **WHEN** 提交版本 -> **MUST** 保证 user_turn_id + resume_id 或 edit_session_id + resume_id 至多成功提交一次；数据库失败时整体回滚该资源事务。
- **WHEN** Patch 校验失败、资源不存在、越权、Scope 不足、Token 过期或轮次已关闭 -> **MUST** 返回稳定机器错误码和用户可理解的错误；禁止泄露无权访问的资源内容。

## C-07 Profile 与可移植性

- **WHEN** 保存 ProfileFact -> **MUST** 保留 type、title、content、tags、source、evidence、confidence、verified_at、visibility；无证据或未验证状态应明确显示，**MUST NOT** 编造证据或量化成果。
- **WHEN** 生成 Resume -> **MUST** 保存 profile_id、profile_version_id、selected_fact_ids、target_role、JD 及逐段来源；历史 Profile 版本或等价生成时快照足以恢复原事实内容。
- **WHEN** Profile 修改或事实删除 -> **MUST** 保持已有 Resume 及历史内容不变；删除前展示反向引用，同步需按 C-01 显式确认。
- **WHEN** 只授权 profile:read 和 resume:write -> **MUST** 允许最小生成流程读取获准事实并创建获准新简历，**MUST NOT** 返回 Token 未获准的联系方式或其他字段。
- **WHEN** 导出完整备份 -> **MUST** 使用公开 JSON Schema 的版本化清单，包含 Profile/Resume 全部版本、父子关系、事实来源、选材关联、时间与作者来源；证据附件可下载则包含文件及引用映射，不可导出项在清单中说明。
- **WHEN** 输出 Markdown -> **MUST** 提供可读正文、来源和历史索引；JSON 是完整恢复的权威载荷，**MUST NOT** 声称单篇 Markdown 等价于完整备份。
- **WHEN** 导入结构化备份 -> **MUST** 验证格式版本和引用完整性，预览新增范围，确认后恢复为当前用户拥有的新资源，保留原 ID 映射与历史出处；导入的历史 actor 仅作来源，不能授予本地权限。
- **WHEN** 从 PDF/Markdown 提取事实 -> **MUST** 进入 P1 文档导入流程，展示候选与不确定内容，确认后写入；与 P0 的 JSON 备份恢复区分。

## C-08 模板与资源生命周期

- **WHEN** 编辑已发布模板 -> **MUST** 保留已有引用可用的模板版本；下架阻止新选用，已有简历仍可预览、导出。
- **WHEN** 删除已被简历引用的模板 -> **MUST** 拒绝物理删除并提示先下架；未被引用的模板可经确认删除。
- **WHEN** 切换模板 -> **MUST** 保持内容与内容版本不变；预览更新在同页完成，切换失败保留原模板和预览。
- **WHEN** 软删除 Resume -> **MUST** 显示可恢复截止时间，并在恢复窗口内支持恢复原内容与历史；窗口外拒绝恢复，具体保留期限见 D-01。
- **WHEN** 归档 Resume -> **MUST** 从默认活跃列表移除并允许从归档列表恢复；内容和历史保留。

## C-09 Agent Runtime（ER-9.3，原 US-9.3）

- **WHEN** 内置 Runtime 执行 -> **MUST** 按模型调用、工具执行、结果追加循环运行，执行轮次、Token、成本与超时上限；耗尽时依 C-04 结算并提示具体限制。
- **WHEN** 构造上下文 -> **MUST** 包含提示词、Agent 配置、当前资源摘要、正式版本、当前草稿标识与最近消息；章节按需读取，避免默认注入全量历史。
- **WHEN** 压缩上下文或工具结果 -> **MUST** 保留当前资源/版本、已确认与待确认动作、事实来源和未完成目标；压缩算法优化属于 P1，基础状态正确性属于 P0。
- **WHEN** Runtime 重启 -> **MUST** 从公共 API 恢复业务状态；Runtime **MUST NOT** 直接操作业务数据库或维护另一套简历真相源。
- **WHEN** 通过 SSE 发布 Run 事件 -> **MUST** 区分文本、工具进度、待确认、完成、取消、错误和最终提交状态；断线重连先获取服务端状态再续读，不能触发重复写入。

## C-10 公共接口与审计

| 能力 | 公共契约范围 |
| --- | --- |
| Resume | CRUD、duplicate、archive、document、patches/validate/preview/apply、render、PDF/Markdown/JSON export、import |
| Version | versions、版本详情、diff、restore、undo/redo、来源筛选、changes |
| Profile | CRUD、facts CRUD、search、match-job、resume-drafts、versions、diff、restore |
| JD | CRUD、搜索筛选、详情、软绑定读取/替换/解除、候选简历选择与针对性微调；边界见 C-13 |
| Conversation | conversations、messages、events、cancel、PendingAction approve/reject |
| 配置 | agent/config、models、models/test、settings、agent/execution-mode |
| 聚合边界 | turns 创建/读取/finalize/cancel、manual-edits 创建/读取/flush |
| 开放接入 | OpenAPI、MCP、TypeScript/Python SDK、PAT、能力发现、Webhook |

- **WHEN** 发布公共契约 -> **MUST** 在仓库维护 OpenAPI、工具 Schema、错误码和请求响应样例；API、前端客户端、内置 Agent、MCP 与 SDK 使用一致的语义；Profile search 请求覆盖 query、target_role、filters、limit，match-job 响应提供事实、证据、置信度与理由。
- **WHEN** 外部请求缺少 source -> **MUST** 标记 agent；仅可信前端会话可声明 manual，source **MUST NOT** 用于跳过授权；模式从服务端上下文解析，不信任工具入参。
- **WHEN** 记录审计 -> **MUST** 覆盖操作者、client_id、Scope、资源、声明用途、触发消息、工具链、确认、模式切换、finalize、flush、取消和冲突；用途是客户端声明的标签，不等于自动证明用途合规。
- **WHEN** 返回模型配置或错误日志 -> **MUST NOT** 回传明文 API Key；凭证加密存储，测试连通性不得泄漏密钥。
- **WHEN** 发送 Webhook -> **MUST** 只面向已授权订阅者，使用唯一事件 ID 与可验证签名，重复投递可去重；事件覆盖 profile.updated、resume.version.created、export.completed。
- **WHEN** 能力发现 -> **MUST** 在 `GET /.well-known/resume-agent` 返回契约版本、OpenAPI/MCP 入口、支持能力和认证方式；不得返回用户资源或凭证。

## C-11 发布前需冻结的验收参数

这些是原需求未给定的参数，不代表已确定的产品数值。对应故事可继续设计；依赖参数的场景在参数及样例冻结前不能宣称完成验收。产品负责人确定范围，设计/开发/测试共同补齐验证环境。

| ID | 待决定内容 | 影响与负责人 | 冻结后验证 |
| --- | --- | --- | --- |
| D-01 | 软删除恢复窗口与到期处理 | US-1.9；产品负责人 | 截止前、截止时刻、截止后恢复结果；历史保留与清除边界 |
| D-02 | 支持语言、时区/问候时段、头像格式与大小、昵称长度 | US-1.6、US-13.3、US-13.4；产品/设计 | 每种语言、时段边界、格式白名单、大小与长度上限及越界 |
| D-03 | 预览延迟目标、长简历样本、PDF 视觉容差与测试浏览器 | US-5.1、US-6.3、US-6.2；设计/测试 | 固定版本、模板、字体、纸张与边界样例；记录测量值和差异 |
| D-04 | 外部 turn 空闲关闭期限、Webhook 重试次数/退避/留存 | US-12.6、US-12.10；产品/后端 | 空闲边界、重连、重复与耗尽后可见失败 |
| D-05 | 文档导入文件限制、解析支持范围、评测数据与评分量表 | US-5.3、US-13.9、US-14.4；产品/测试 | 超限/损坏/扫描件、固定评测集、维度权重与证据样例 |

## C-12 技术决策边界

领域 Patch 或 RFC 6902、Snapshot 存储方式、数据库选择、ProfileFact 表结构、检索实现、MCP 部署方式与浏览器 flush 传输方式属于实现决策；开发前在对应设计与工单确定，不能改变本文件的可观察结果。P0 明确使用 PAT 基础授权；OAuth 扩展不属于当前验收承诺。手动窗口从最后一次输入计算、Resume 可动态切换、Profile 显式同步已在上文确定，不再作为开放问题。

## C-13 JD 管理与简历软绑定

JD 是独立岗位需求记录，字段包括 id、owner_id、岗位名称、公司（可选）、正文、来源链接（可选）、标签、revision、创建/更新时间及 bound_resume_id（可空）。绑定用于快速选定简历；针对岗位产生的内容变化仍由 Resume 版本体系管理。

| 关系或操作 | 确定语义 |
| --- | --- |
| 一个 JD 的当前绑定 | 0 或 1 份 Resume 引用；建立绑定时必须为当前用户拥有且可访问的简历 |
| 一个 Resume 的反向关联 | 可被多个 JD 引用，界面列出关联 JD |
| 绑定、换绑、解绑 | 只改变 JD 的关联元数据，不复制简历、不改内容、不产生 ResumeVersion |
| 微调使用的简历 | 默认预选绑定简历；可以改选其他有权使用的简历 |
| 改选微调目标 | 只影响本次操作，不自动替换 JD 的绑定；替换须显式选择“绑定此简历” |
| 原稿与岗位副本 | 可明确选择直接微调所选简历，或复制后微调；复制创建按 C-01 授权 |
| JD 或 Resume 后续变化 | 不自动同步内容；已生成版本保留当时的 JD 快照和来源 |

- **WHEN** 保存 JD -> **MUST** 校验岗位名称和正文非空，原样保存用户给出的来源链接；编辑生成新的 revision，**MUST NOT** 自动抓取链接或将 JD 文本当作系统指令。
- **WHEN** 读取、编辑、删除或绑定 JD -> **MUST** 验证所有权与权限；外部访问通过独立 jd:read/jd:write Scope 控制，**MUST NOT** 由 resume:write 隐式获得 JD 管理权限。
- **WHEN** 设置绑定 -> **MUST** 校验 JD 和 Resume 属于同一当前用户、目标未删除且可访问；替换是原子操作，失败时保留原绑定，**MUST NOT** 建立多个当前绑定。
- **WHEN** 从 JD 发起微调 -> **MUST** 明示 JD、简历标题、选择直接修改还是副本；读取所选 Resume 基线及 JD revision，生成与岗位要求关联的候选 Patch 和理由，遵循当前模式授权。
- **WHEN** 直接修改被多个 JD 引用的 Resume -> **MUST** 展示这些关联及直接修改影响，并提供复制后微调入口；不得让用户误以为会为各 JD 自动隔离版本。
- **BEFORE** 应用或结算针对 JD 的修改 -> **MUST** 校验 Resume 基线与 JD revision；任一发生变化，保留草稿并重新计算预览，approval 中旧确认失效。
- **WHEN** 基于已保存 JD 提交岗位微调版本 -> **MUST** 保留 jd_id、JD revision、岗位名称、JD 正文快照、来源简历和对应基线；切换绑定不改写这些历史元数据。
- **WHEN** 删除 JD -> **MUST** 展示当前绑定及影响，确认后移除管理列表中的记录和当前绑定，**MUST NOT** 删除或回滚 Resume、历史版本及其已保存的 JD 快照。
- **WHEN** 绑定 Resume 被删除或不可访问 -> **MUST** 将绑定显示为不可用并提供换绑/解绑，**MUST NOT** 自动选取另一份简历；归档但仍可访问的简历可显示归档标记后继续选择。
- **WHEN** 微调完成 -> **MUST** 展示针对该 JD 的最终 Diff、版本和绑定状态；失败、拒绝或无内容变化遵循 C-04/C-06，**MUST NOT** 将失败尝试自动设为绑定结果。
- **WHEN** 导出完整个人备份 -> **MUST** 一并导出 JD 记录、当前绑定关系及版本内的 JD 快照；恢复时按新资源 ID 映射重建有效绑定，无法映射的目标列为未绑定并报告。


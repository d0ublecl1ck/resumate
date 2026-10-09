---
id: 177f2
status: open
created_at: 2026-10-07T11:01:05.928Z
updated_at: 2026-10-07T11:01:18.771Z
priority: medium
labels: []
parent: null
blocked_by: []
---

# Profile 选材生成简历：从主档事实按 JD 选材生成初稿

## Background

### 背景

`/profile` 页顶部有一颗「生成简历」按钮，但它在当前实现里只是跳转到 `/resumes?create=1` 打开通用「新建简历」弹窗——弹窗只有「从现有简历复制」与「完全新开」两条链路，**完全不使用主档事实**。用户在主档页点了「生成简历」，得到的是一个与主档无关的空壳或副本。本工单要把 FEA-D09 定义的「Profile 选材生成」接上。

### 现状

- `ui/src/components/profile-workspace.tsx:102`：`<Link to="/resumes?create=1">…{t("profile.actions.generateResume")}</Link>`，纯跳转，无任何选材或生成动作。
- i18n key：`profile.actions.generateResume`（zh-CN / en 已存在）。
- 落点 `ui/src/components/create-resume-modal.tsx` 只有两条链路（复制现有 / 完全新开），且其 Non-goals 明确写了「不做创建后用 Profile 预填充对话框」（见已关工单 `b4cd1`）。
- 后端 `POST /resumes` 其实已接受 `profileId`（`backend/app/modules/resume/schemas.py:100`、`service.py:192`），但 `create_resume` 只把它当外键存储，文档仍写空 `{}`（`service.py:201`），**没有任何选材或事实读取**。前端 `createResume`（`ui/src/lib/api.ts:130`）虽然支持 `profileId`，当前调用方也从不传。

### 依据（范围内必须同时满足）

- `docs/prd/对话式简历编辑系统-屏幕流定义.md:59` **FEA-D09 Profile 生成与同步**：JD 匹配、选材、生成简历、显式同步、事实晋升；对应 US-8.1～8.4、C-01、C-07。
- `docs/user-stories/jobseeker.md:552` **US-8.1**：按 JD 选择素材生成简历；审阅候选事实并说明理由、缺关键事实时追问、不复制全部档案；approval 下明确确认后才创建带来源关联的草稿，首版文案另展示实际 Diff，Profile 保持不变。`US-8.2`：同一 Profile 跨方向复用，每份简历只含各自选定事实，可追溯岗位、JD、Profile 版本及逐段事实来源。
- `docs/user-stories/contracts.md:15`：**Profile 选材生成简历**在 approval 下展示候选事实或 Diff 并明确确认；full_access 下**仍需明确确认**，以维持事实源与已有简历的边界。
- `docs/agent/agent-operation-api.md:20`：**Profile 选材生成**明确列在「不包含（后续工单）」。
- 已关工单 `b4cd1`：把「创建后用 Profile 预填充」后置，理由正是下面「执行者约束」。

### 执行者约束（本工单最大的设计分歧）

两条路，必须在开工前拍板：

1. **profile 作用域 run**：`POST /sessions/{session_id}/runs`（§21.3）。它能读主档、能 `propose_profile_change`，但按 §21.3「run 凭据不绑定任何简历（`resumeId=null`），鉴权层只放行 `resumeId` 为空的轮次，**profile run 无法访问任何简历**」。因此 profile run **不能**创建简历、也不能写任何简历端点。
2. **前端直连确定性端点**：不经 Agent，直接读 `GET /profile`/`GET /profile/facts` 选材后调 `POST /resumes`。它不违反 §21.3，但没有「展示候选事实及选择理由、缺关键事实时追问」的推理能力，等于把 US-8.1 降级成模板填充。

### 候选方案与推荐

**方案 A（推荐）：profile run 只产出「选材预览」，人类确认后由确定性路径创建**

- profile 作用域 run 复用现有 `propose_profile_change` / pending action 语义，但新增一种 `kind`（如 `resume_generation`），payload 带：候选事实 ID + 选择理由、基本信息范围、建议标题、目标岗位、模板、JD 引用。它**不直接建简历**。
- 人类 approve 后，由确定性的执行路径落地创建：前端（或后端专用端点）读 pending action 的选材负载 + 主档事实，调 `POST /resumes`（带 `profile_id` 与选中的文档内容），并记录「Profile 版本 + 逐段事实来源」。
- 推荐理由：既满足 `contracts.md:15` 的「明确确认」（pending action 就是确认载体），又完全不动 §21.3 的作用域隔离（创建动作不在 profile run 凭据下发生）；且把「LLM 负责选材与解释、确定性代码负责写入」分开，符合 C-01 的显式授权语义。

**方案 B（备选）：新增跨 scope 的 resume 生成 run**

- 让一个 run 同时有读 profile 与写 resume 的能力（run 凭据绑定目标 resume 或允许 profile 读取）。能一步到位，但需要改 §21.3 的鉴权白名单与凭据绑定语义，等于重新打开「跨 scope 访问」的口子，风险最大，不推荐作为首版。

**明确排除**：直接在 `profile-workspace.tsx` 里静态拼一个 `POST /resumes`，不带任何选材与理由——这不满足 US-8.1，不如不做。

## Scope

- 决定执行者与确认载体（推荐方案 A），并把结论写入 `docs/agent/agent-operation-api.md` 对应小节（新增 profile run 产出「生成简历选材预览」的 pending action 契约）。
- 定义选材负载结构：候选事实 ID + 理由、基本信息范围、标题、目标岗位、模板、JD 引用；以及 approve 后创建简历所写的内容与来源快照形态。
- 前端：`/profile` 的「生成简历」按钮不再裸跳 create 弹窗，改为进入 profile 助手的选材对话/预览；确认后落地创建并跳转编辑器。
- 让 `POST /resumes` 的 `profile_id` 从「仅存外键」变成「带来源关联的生成入口」：创建时写入选中事实内容，并保留 Profile 版本与逐段事实来源（US-8.2 可追溯）。
- 决策并记录：选材事实内容存进 `ResumeDocument` 的哪些字段、来源快照存哪（新表 / 文档元数据 / pending action 审计），以及重复生成同一方向的去重策略。
- 同步 `ui/prototypes/index.html` 与相关 Storybook story（选材预览、空事实、缺关键事实追问、确认与拒绝态）。
- 同步 PRD 屏幕流 `SCR-001` / create 入口叙述与 US-8.1 的实现状态。

### 与 `POST /resumes` 的 `profile_id` 字段的关系

- 字段已存在（`ResumeCreate.profile_id`，可空），无需 schema 迁移即可承载「这份简历由哪个 Profile 生成」。
- 但当前它只是外键：`service.create_resume` 不读 Profile、不写文档。本工单要决定它是否升级为「生成入口」——即 `profile_id` 非空时，创建请求是否必须携带一份**已确认的选材负载**（事实 ID 列表 + 来源快照），由服务端校验该负载来自同 owner 的 Profile。
- 若不做这层校验，`profile_id` 会停留在「装饰性外键」，来源可追溯性（US-8.2）无法成立；若做，需要考虑 `POST /resumes` 的既有调用方（当前 create-resume-modal 传 `profileId: undefined`）保持向后兼容。

### 待决点（开工前必须对齐）

- 执行者与确认载体：方案 A / B 二选一（推荐 A）。
- 选材结果与来源快照的持久化位置（文档元数据 vs 独立关联表）。
- 首次生成是否允许「部分缺失关键事实仍创建」，还是严格追问后再创建（US-8.1 要求缺关键事实时追问）。

### 已知代价

- 若走方案 A，一次生成需要「profile run -> pending action -> 人类确认 -> 确定性创建」两段，端到端延迟与轮次数量高于直接建简历。
- 来源快照会随 Profile 事实演进变旧（US-8.3 的显式同步正是为此），需要额外的同步入口，本工单只定义快照，不实现同步（见 Non-goals）。
- 选材质量依赖模型输出，需要有「未选中事实不得进入文档」的服务端校验，否则 LLM 误选会污染新简历。

## Non-goals

- 不实现 US-8.3 显式同步 Profile 到已有 Resume（预览、逐项同步）。
- 不实现 US-8.4 Resume 事实晋升 Profile。
- 不改 profile 助手的会话选取逻辑（那是 `11ad1` 的范围）。
- 不重做「新建简历」弹窗的两条链路（复制 / 完全新开，`b4cd1` 已收敛）；本工单是在此之外新增「从主档生成」入口。
- 不改 `POST /resumes/{id}/duplicate`。
- 不做 JD 的软绑定与微调（FEA-D11，另属后续）。

## Acceptance Criteria

- [ ] `/profile` 顶部「生成简历」不再是裸跳 `/resumes?create=1`；点击进入选材流程（对话或预览）。
- [ ] 选材预览展示候选事实与选择理由，缺关键事实时追问，不复制全部档案（US-8.1）。
- [ ] approval 与 full_access 下都要求明确确认后才创建简历（`contracts.md:15`）。
- [ ] 确认创建后，简历内容只含被选中的事实，且可追溯 Profile 版本与逐段事实来源（US-8.2）。
- [ ] `POST /resumes` 的 `profile_id` 语义被明确定义并实现（校验选材负载来自同 owner 的 Profile，或明确记录其仍仅为外键），既有不传 `profileId` 的调用方行为不变。
- [ ] profile run 无法访问简历的约束（§21.3）不被破坏；若采用方案 A，创建动作发生在 profile run 凭据之外。
- [ ] 契约文档 `docs/agent/agent-operation-api.md` 记录新增的 pending action `kind` 与负载、以及 `POST /resumes` 的 `profile_id` 语义。
- [ ] 原型与 Storybook 覆盖选材预览 / 空事实 / 缺事实追问 / 确认 / 拒绝态。
- [ ] 相关测试通过，`archkit inspect .` 通过。

## Implementation

<!-- 待开工后补记：选定的执行者路径、pending action kind 与负载、来源快照落点、改动文件与测试。 -->

## Verification

- 2026-10-10 现状核查（只读，**未开工**）：
  - `ui/src/components/profile-workspace.tsx:154` 的「生成简历」仍是 `<Link to="/resumes?create=1">` 裸跳，没有进入选材流程。
  - `grep -rn 'resume_generation' backend/ ui/src/` 无命中：方案 A 需要的 pending action `kind` 与选材负载未定义、未实现。
  - `POST /resumes` 的 `profile_id` 仍只被当外键存储（`ui/src/lib/api.ts:130` 的 `createResume` 支持该字段，但调用方从不传）。
  - `git log` 中与本工单绑定的提交只有开单提交 `b9ece3e`，无实现提交。
- 剩余项：本工单 Scope 全部未实现——执行者与确认载体（推荐方案 A）未拍板、选材负载结构与 approve 后创建路径未定义、`/profile` 入口未改、`profile_id` 语义未升级、原型与 Storybook 选材预览未补、契约文档与 PRD/US-8.1 实现状态未同步。
- 阻塞/待决：Background「待决点」三项（方案 A/B 二选一、来源快照持久化位置、缺关键事实是否允许部分创建）均需用户先拍板，未决前不应实现。

## Related ADRs

- `docs/agent/agent-operation-api.md` §21.3（profile 作用域 run 的凭据不绑定简历）、`:20`（Profile 选材生成列为后续工单）
- `docs/user-stories/contracts.md:15`（选材生成必须明确确认）
- 已关工单 `b4cd1`（把 Profile 预填充后置，指出 §21.3 的执行者约束）

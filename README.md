<div align="center">

<img src="ui/public/brand/lockup.png" width="300" alt="Resumate" />

> *「让 Agent 帮你改简历可以，但改了什么、谁批准的、能不能回退，得说得清楚。」*

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](backend/pyproject.toml)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](backend/pyproject.toml)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-psycopg%203-4169E1?logo=postgresql&logoColor=white)](docs/design.md)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](ui/package.json)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](ui/package.json)

**以 Profile 为事实源、Resume 为岗位投影，把「对话式改简历」做成可审阅、可回滚、可迁移的版本流。**

[它解决什么问题](#它解决什么问题) · [效果示例](#效果示例) · [快速开始](#快速开始) · [它能做什么](#它能做什么) · [它和同类有什么不同](#它和同类有什么不同) · [信任边界](#信任边界) · [仓库结构](#仓库结构) · [验证与测试](#验证与测试) · [已知边界](#已知边界)

</div>

---

## 它解决什么问题

你有八年经历，要投两个方向。于是你维护了两份简历：第一份改了联系方式，第二份忘了同步；还有第三份是半年前投大厂时存的，你自己都忘了它跟现在差在哪。

然后你让 Agent 帮你改。它改得很快。问题是它**直接写进去了**——你看不到改了哪几行，找不到上一版，也回答不出一句「谁批准你动我简历的」。

Resumate 把这件事拆成三层：**Profile 存事实**（你是谁、做过什么），**Resume 是岗位投影**（对某个岗位该怎么讲），**JD 记录岗位需求**。Agent 想改，只能走公共 API 提一轮提案；提案先变成可审阅的 Diff，你点批准，才写进草稿；结算时才成为一个不可变版本。

中间任何一步，你的正式简历都没被动过。

## 效果示例

真实的审批闭环（本仓库起服务实测，节选）：

```console
# 1) 开一个 approval 轮次；模式由服务端固化，客户端说了不算
$ curl -sS -b cookies.txt -X POST "$BASE/resumes/$RESUME_ID/turns" \
    -H 'Content-Type: application/json' -d '{"message":"突出性能优化成果","executionMode":"approval"}'
{ "id": "turn_1db565f69c9f", "executionMode": "approval", "modeSource": "session", "state": "open" }

# 2) 先预览，拿到 Diff 和待办
$ curl -sS ... "$BASE/turns/$TURN_ID/patches:preview" -d @patch.json
{ "changeCount": 1, "affectedSections": ["工作经历"],
  "pendingActionId": "pa_5cf7d053e5fe", "requiresConfirmation": true, "baseRebased": false }

# 3) 用户没批准就想写？服务端直接拒
$ curl -sS ... "$BASE/turns/$TURN_ID/patches:apply" -d @apply.json
HTTP 409  { "code": "PENDING_ACTION_NOT_APPROVED", "message": "待办尚未通过审批" }

# 4) 用户批准 → 写入草稿；同一幂等键重放不会写第二次
$ curl -sS ... "$BASE/pending-actions/$PA_ID/approve"
"approved"
$ curl -sS ... "$BASE/turns/$TURN_ID/patches:apply" -d @apply.json
{ "applied": true, "workingRevision": 1, "idempotentReplay": false }
$ curl -sS ... "$BASE/turns/$TURN_ID/patches:apply" -d @apply.json
{ "applied": true, "workingRevision": 1, "idempotentReplay": true }

# 5) 结算成这一轮唯一的版本
$ curl -sS ... "$BASE/turns/$TURN_ID/finalize" -d '{"idempotencyKey":"finalize-...-1"}'
{ "state": "finalized", "result": { "versionId": "ver_98b66ec43aa6", "changeCount": 1 } }

# 6) 轮次关了就别再写
$ curl -sS ... "$BASE/turns/$TURN_ID/patches:validate" -d @patch.json
HTTP 409  { "code": "TURN_ALREADY_CLOSED" }
```

同一套端点也接受 PAT Bearer，scope 与端点权限码一一对应：

```console
$ curl -sS -H "Authorization: Bearer rsm_pat_..." "$BASE/resumes/$RESUME_ID/working-document"
HTTP 200
$ curl -sS -H "Authorization: Bearer rsm_pat_只读令牌..." -X POST "$BASE/resumes/$RESUME_ID/turns" -d '{}'
HTTP 403  { "code": "SCOPE_INSUFFICIENT" }

# 审批是人类动作：PAT 不能批准自己的待办
$ curl -sS -H "Authorization: Bearer rsm_pat_写令牌..." -X POST "$BASE/pending-actions/$PA_ID/approve" -d '{}'
HTTP 403  { "code": "FORBIDDEN", "message": "审批动作仅限人类会话，Agent 令牌不可调用" }
```

## 快速开始

前置条件（**必须**先备好，否则起不来）：

| 依赖 | 说明 |
| --- | --- |
| PostgreSQL | 运行库 `resumate` 与测试库 `resumate_test`；驱动 psycopg 3 |
| Redis | 会话与邮箱验证令牌的存储；**不是事实源**，丢了只影响登录态 |
| Python ≥ 3.11 + [uv](https://docs.astral.sh/uv/) | 后端与 `agent-core` |
| Node + pnpm | 前端；仓库是 pnpm workspace（只有 `ui` 一个包） |

不需要任何外部 API Key 就能把系统跑起来。对话功能要真正驱动模型时，才需在设置页里配一个 OpenAI 兼容端点与密钥（密钥只写不读，落库前加密）。

```bash
# 0) 基础设施（本机 Homebrew 为例）
brew services start postgresql@18
createdb resumate && createdb resumate_test
brew services start redis

# 1) 后端
cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.tasks.seed        # 内置模板 + 本地管理员
uv run uvicorn app.main:app --reload   # http://localhost:8000

# 2) 前端（另开终端，仓库根）
pnpm install
cd ui && pnpm dev                      # Vite 把 /api 代理到 :8000
```

本地种子账号是 `admin@resumate.dev` / `resumate-admin`——**只用于本地**，部署前必须改。健康检查 `GET /health/`，接口文档 `/docs`，OpenAPI `/openapi.json`。

## 它能做什么

| 能力 | 现状 |
| --- | --- |
| 简历 CRUD、复制、标签、归档、软删除与恢复 | 已实现（后端 + 界面） |
| 不可变版本、任意两版比较、恢复 | 已实现（版本列表与恢复界面） |
| 简历导出（PDF / 文件） | 未实现：编辑器「导出」按钮还没有后端端点，点击无行为 |
| 章节 / 条目级结构化编辑与领域 Patch | 已实现（手动编辑经 `PUT /resumes/{id}/document` 落库并生成 manual 版本；领域 Patch 5 个 op，非 RFC 6902） |
| **UserTurn + Working Copy + 审批闭环** | 已实现：`begin → validate → preview → approve → apply → finalize` |
| **PendingAction 人工审批、幂等键、基线重排** | 已实现并覆盖测试（含 `REBASE_CONFLICT`） |
| **Agent 轮次 SSE 事件订阅** | 已实现：`GET /turns/{turn_id}/events` 推 snapshot / turn.updated / 心跳，前端 `subscribeTurnEvents` |
| Profile 职业事实库、事实反向引用 | 已实现 |
| JD 管理、岗位匹配、简历软绑定（每 JD 0 或 1 份） | 已实现 |
| RBAC（角色 / 权限 / 在线维护）、PAT 与访问审计 | 已实现 |
| 模板只读查询与模板预览 | 已实现（管理端写接口未开放） |
| 开放接入：能力发现、PAT、备份导出/导入 | 已实现 |
| 界面 i18n（`zh-CN` / `en`） | 已实现，键结构有测试校验 |
| 内置对话流、自然语言解析、岗位匹配界面 | **未实现，前端仍走 mock**（见 [已知边界](#已知边界)） |

后端现有 **11 个业务模块、88 个 HTTP 端点**；前端 **20 个页面组件、20 个 Storybook story 文件**。

## 它和同类有什么不同

| 维度 | 常见简历工具 | 常见「AI 改简历」 | Resumate |
| --- | --- | --- | --- |
| 事实与成品 | 只有一份成品文档 | 只有一份成品文档 | Profile（事实源）与 Resume（岗位投影）分离，互不污染 |
| Agent 写入方式 | 不涉及 | 直接改文档 | Agent **只能**走公共 API，先提案、先 Diff、先批准 |
| 版本 | 手动另存为 | 常常没有 | 不可变版本 + Working Copy，一轮一份简历至多一个版本 |
| 外部 Agent | 不涉及 | 绑定自家内置 Agent | 内置 Agent 与外部 Agent（Hermes / Codex / MCP 客户端）走**同一套**权限、审计、冲突与导出语义 |
| 并发 | 不涉及 | 后写覆盖先写 | 乐观锁 + 幂等键；基线漂移会显式报 `baseRebased` 或 `REBASE_CONFLICT`，不静默覆盖 |
| 迁移 | 导出 PDF | 导出 PDF | JSON 全量备份（含全部版本与事实来源），不把资料锁死在系统里 |

## 信任边界

- **Agent 不碰数据库。** `agent-core` 不 import 任何 Web 框架、ORM、迁移工具或数据库驱动，所有读写走公共 REST API（契约 C-09）。
- **两种授权模式，服务端固化。** 请求体里的 `executionMode` 只是输入，最终由服务端按「会话 → Agent 配置 → 账户默认」解析并固化到该轮次；调用方无法通过参数把自己提权到 `full_access`。
- **确认不可伪造。** approval 模式下，没有已 `approved` 的 `pendingActionId`，`apply` 一定失败。批准与拒绝是**用户动作**：服务端只接受浏览器会话，PAT / Agent 来源一律 403 `FORBIDDEN` 并写审计，Agent 无法自行批准自己的待办。
- **外部资料一律不可信。** 用户给的 JD、网页、文件、工具返回都不能作为「跳过确认、改变模式、访问其他资源」的依据。
- **密钥不进代码库。** SMTP 与模型密钥只放未跟踪的 `backend/.env`；模型密钥写库前加密，接口只返回 `keyConfigured`，从不回显明文。

## 仓库结构

```text
.
├── ui/          # React 19 + TypeScript + Vite 前端（PNPM workspace 唯一成员）
├── backend/     # FastAPI + SQLAlchemy 2 + PostgreSQL；模块按 api → service → dao → models 分层
├── agent-core/  # Agent 底座（Python, uv）：公共 API 客户端、轮次会话、工具表、模型无关 Runtime、resumate-agent CLI
│   └── skills/resumate-api-operations/   # 给外部 Agent 的装载契约（SKILL.md + reference.md + README.md）
├── docs/        # design.md 蓝图、prd/、user-stories/ 公共契约、issues/ Issues-as-Code
├── quality-gates/  # 项目自有质量门禁（archkit inspect 执行的就是这里）
└── ui/prototypes/index.html   # 定稿原型：令牌 / 外壳 / 路由对齐 ui/src，改实现时同步改这里
```

## 验证与测试

在仓库根目录执行；下面每个数字都可以用左侧命令复现：

```bash
uv run --directory backend pytest        # → 228 passed
cd agent-core && uv run pytest -q        # → 101 passed
cd ui && pnpm test                       # → 35 files / 259 passed
archkit inspect .                        # → Quality gates passed.

DATABASE_URL=sqlite:// uv run --directory backend alembic upgrade head   # 迁移可在内存 SQLite 上验证
```

统计口径：

```bash
grep -rhoE "@router\.(get|post|put|patch|delete)\(" backend/app | wc -l         # → 88 个端点
ls ui/src/pages | grep -vE "\.stories\.|\.test\." | wc -l                     # → 20 个页面组件
ls ui/src/pages/*.stories.tsx ui/src/components/*.stories.tsx | wc -l         # → 20 个 story 文件
```

## 已知边界

诚实清单——这些还没做，或需要你先准备好：

- **Agent Run 与主档助手已接真实端点，JD 解析仍是启发式。** 发起运行、轮次与待办展示、审批、SSE 实时刷新，以及个人资料助手的会话 / 实时刷新 / 审批都已走真实 API；已在本地用启发式与样例数据的只剩 JD 解析（`parseJdFromText` / `parseJdFromImage`）与岗位匹配（[ui/README.md](ui/README.md)）。
- **Agent 轮次 SSE 只推真实状态。** `GET /turns/{turn_id}/events` 目前只推轮次/待办的 `snapshot` 与 `turn.updated`，空闲发心跳；模型进度 / token / 步骤事件需要 Agent run loop 与队列，尚未实现（见 [契约 §18](docs/agent/agent-operation-api.md)）。
- **没有 MCP server。** 能力发现返回的 `mcpUrl` 是占位，实测 `GET /mcp` 返回 404；外部接入目前走 REST 与 PAT。
- **后端 spawn 运行体要求 CLI 在 `PATH`。** `POST /resumes/{id}/runs` 默认执行 `resumate-agent`，安装方式：`uv tool install ./agent-core`（或把 `AGENT_RUNNER_COMMAND` 指向其它可执行文件）。注意该工具是安装时的快照，`agent-core` 改动后需要重新安装才会生效。
- **模板管理端写接口未开放**，模板当前只读。
- **Webhook 与题库/面试扩展属 P1/EXT**，未实现，见 [用户故事索引](docs/user-stories/README.md)。
- **必须自备 PostgreSQL 与 Redis**，没有单文件 / 零依赖模式。
- **仓库未附 LICENSE**，因此当前默认保留所有权利。

## 待办（TODO）

已确认要做、但排在全部功能完成之后的事项：

- [ ] **新用户引导** —— 首次进入的引导流程与空态引导。前置条件：全部功能开发完成。

本节与「[已知边界](#已知边界)」的分工：那里登记「明确不做或长期缺口」，这里只登记「已承诺要做、只是排在后面」。

## 文档索引

| 想了解 | 看这里 |
| --- | --- |
| 系统设计哲学、架构、数据模型、关键决策 | [设计蓝图](docs/design.md) |
| 产品问题、范围与交付切片 | [PRD](docs/prd/对话式简历编辑系统-PRD.md) |
| 逐条用户故事与公共行为契约 | [用户故事索引](docs/user-stories/README.md)、[公共契约](docs/user-stories/contracts.md)、[覆盖表](docs/user-stories/coverage.md) |
| Agent 操作 API 契约（冻结） | [agent-operation-api.md](docs/agent/agent-operation-api.md) |
| 外部 Agent 怎么接入 | [Skill README](agent-core/skills/resumate-api-operations/README.md) |
| 后端配置、模块与测试 | [backend/README.md](backend/README.md) |
| 前端对接现状、RBAC 与 i18n | [ui/README.md](ui/README.md) |
| 页面视觉规范 | [定稿原型](ui/prototypes/index.html)（对齐 `ui/src` 实现）、[品牌资产](ui/public/brand/README.md) |
| 质量门禁 | [quality-gates/README.md](quality-gates/README.md) |
| 变更的「为什么」 | [docs/issues/](docs/issues/)（每个非合并提交都带 `Issue: <id>`） |

## 开发约定

```bash
git config core.hooksPath .githooks   # 克隆后执行一次
```

启用后 pre-commit 会在提交前删除目录中已有其他被跟踪文件的 `.gitkeep`（仅 `.gitkeep` 或仅有未跟踪文件时保留）。任何代码变更后必须跑 `archkit inspect .` 并修到通过；页面与文案改动还必须遵守 [AGENTS.md](AGENTS.md) 里的原型先行、Storybook 先行与 i18n 双语文案规则。

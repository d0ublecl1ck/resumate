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

运行配置来自未跟踪的 `backend/.env`（模板见 `backend/.env.example`）；后端启动时会做配置自检并打印配置来源（`.env` 是否存在、哪些关键项来自环境变量，不打印任何密钥取值），SMTP 这组配置不齐备会直接拒绝启动。**`git worktree` 不会带过来未跟踪的 `.env`，需要手动复制**，否则会因「SMTP 未配置」起不来；无邮件需求的本地场景可设 `RESUMATE_ALLOW_MISSING_ENV=1` 放行（会有醒目 WARNING，邮件相关功能不可用）。

### 本机一条命令

```bash
bash scripts/dev.sh up      # 基础设施 → 后端 → 前端 → Agent CLI
bash scripts/dev.sh status  # 只读：PostgreSQL/Redis、端口、健康检查、Agent CLI
bash scripts/dev.sh logs backend
bash scripts/dev.sh down    # 只停本脚本拉起的进程
```

运行期日志与 PID 落在 `backend/var/dev/`（已 gitignore）。脚本会补上 `createdb`、`alembic upgrade head`、seed，并在缺 `resumate-agent` 时执行 `uv tool install ./agent-core`——后端要靠这个 CLI 跑 Agent 轮次。

### 容器一条命令

```bash
docker compose up -d --build   # 前端 http://localhost:8081，后端经 /api 反代
docker compose down            # 停止；PostgreSQL 数据卷保留
```

镜像为生产式：nginx 托管 `ui/dist` 并把 `/api` 反代到 backend；backend 容器入口自动执行迁移与 seed，并内置 `resumate-agent`。网络拉不动基础镜像时，先给 Docker 配好镜像加速再执行。

容器同样受后端启动自检约束：**缺 SMTP 配置会拒绝启动**。`compose.yaml` 为此给 backend 显式设了 `RESUMATE_ALLOW_MISSING_ENV=1` 作为本地 / demo 默认——不配 SMTP 也能起来，但邮件功能不可用，日志里有一条放行 WARNING。要在容器里真发信，把 SMTP 变量写进仓库根 `.env` 或先 export 到宿主环境（compose 的变量替换只读这两个来源，**不读 `backend/.env`**），backend 会把它们透传进容器。生产部署必须提供完整 `SMTP_*`，并显式设 `RESUMATE_ALLOW_MISSING_ENV=0`（或删掉该行），让缺配置直接拒绝启动而不是降级放行。

### 手动分步（等价于上面）

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
| 空闲自动保存与服务端草稿缓冲 | 已实现：输入停顿先经 `PUT /resumes/{id}/draft` 进缓冲（不建版本），静默到期自动提交 manual 版本；默认 10 秒，设置里可调 3–120 秒（C-05） |
| **UserTurn + Working Copy + 审批闭环** | 已实现：`begin → validate → preview → approve → apply → finalize` |
| **PendingAction 人工审批、幂等键、基线重排** | 已实现并覆盖测试（含 `REBASE_CONFLICT`） |
| **Agent 轮次 SSE 事件订阅** | 已实现：`GET /turns/{turn_id}/events` 推 snapshot / turn.updated / 心跳，前端 `subscribeTurnEvents` |
| Profile 职业事实库、事实反向引用 | 已实现 |
| JD 管理、岗位匹配、简历软绑定（每 JD 0 或 1 份） | 已实现 |
| RBAC（角色 / 权限 / 在线维护）、PAT 与访问审计 | 已实现 |
| 模板只读查询与模板预览 | 已实现（管理端写接口未开放） |
| 开放接入：能力发现、PAT、备份导出/导入 | 已实现 |
| 界面 i18n（`zh-CN` / `en`） | 已实现，键结构有测试校验 |
| 内置对话流、JD 自然语言解析 | 已实现（粘贴文本经 `POST /jds:parse-text` 调用户已配置的模型） |
| **AI 模拟面试闭环**（建场冻结简历版本与 JD 快照、逐题作答与追问、带证据的结构化评估报告） | 已实现（`/interview/*`，后端 + 界面；出题支持难度 / 题型筛选，报告可导出 Markdown） |
| **岗位题库**（Java 后端 / Web 前端四类题型与三档难度，题目由生成脚本产出） | 已实现（`/bank/*` 后端 + 题库屏接真，真实 200 题） |
| **知识库检索**（自建种子语料、确定性 BM25、切片出处与「依据不足」分状态） | 已实现（`/kb/*` 后端 + 题库屏检索面板，无命中即 `no_match`） |
| **语音作答**（语速 = 转写字数 ÷ 真实时长、代理清晰度、无录音显示不适用） | 已实现（云端 ASR 转写 + 云端 TTS 播报 + 故障演练开关；未配置或失败时降级为纯文字） |
| **笔试模块**（客观题服务端确定性判分、开放题模型评审、代码题不执行） | 已实现（`/quiz/*` 后端 + 笔试屏） |
| **面试数据聚合**（成长曲线、口径比较、练习计划与复测、重新生成、洞察） | 已实现（`/interview/growth|comparison|practice-items|insights` 等 + 五个聚合屏） |
| **评分一致性抽检**（复评脚本 + 流程 + 留档；结论：不通过） | 已实现，可比较维度覆盖率 100% 达标（门槛 0.8）；不通过原因是单点最大偏差 14 分 > 10（四维合并 MAD 3.45、±5 分内 90%），见 [留档](docs/evaluation/rubric-consistency-2026-10-09.md) |
| 简历编辑器对话区（当前对话 / 历史会话切换并继续对话） | 已实现 |
| 岗位匹配界面 | **未实现，前端仍走 mock**（见 [已知边界](#已知边界)） |

后端现有 **15 个业务模块、126 个 HTTP 端点**；前端 **23 个页面组件、42 个 Storybook story 文件**。

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
├── scripts/dev.sh   # 本机一体化启动脚本（up / down / restart / status / logs）
├── docker/      # 容器构建：后端与前端镜像、nginx 配置、后端入口脚本
├── compose.yaml # 生产式容器编排（PostgreSQL + Redis + backend + ui）
├── docs/        # design.md 蓝图、prd/、user-stories/ 公共契约、issues/ Issues-as-Code
├── quality-gates/  # 项目自有质量门禁（archkit inspect 执行的就是这里）
└── ui/prototypes/index.html   # 定稿原型：令牌 / 外壳 / 路由对齐 ui/src，改实现时同步改这里
```

## 验证与测试

在仓库根目录执行；下面每个数字都可以用左侧命令复现：

```bash
uv run --directory backend pytest        # → 531 passed
cd agent-core && uv run pytest -q        # → 110 passed
cd ui && pnpm test                       # → 73 files / 520 passed
node quality-gates/run.js                # → Quality gates passed.（与 archkit inspect . 同源；.githooks/pre-commit 在每次提交前自动跑同一批门禁）

DATABASE_URL=sqlite:// uv run --directory backend alembic upgrade head   # 迁移可在内存 SQLite 上验证
```

统计口径：

```bash
ls -d backend/app/modules/*/ | grep -v __pycache__ | wc -l                    # → 15 个业务模块
grep -rhoE "@router\.(get|post|put|patch|delete)\(" backend/app | wc -l         # → 126 个端点
ls ui/src/pages | grep -vE "\.stories\.|\.test\." | wc -l                     # → 23 个页面组件
find ui/src -name "*.stories.tsx" | wc -l                                     # → 42 个 story 文件
```

## 已知边界

诚实清单——这些还没做，或需要你先准备好：

- **Agent Run、主档助手与 JD 文本解析已接真实端点，只剩 JD 截图识别与岗位匹配走本地样例。** 发起运行、轮次与待办展示、审批、SSE 实时刷新、个人资料助手，以及「新增 JD」的粘贴文本解析（`POST /jds:parse-text`，用用户已配置的模型）都已走真实 API；仍在本地用启发式与样例数据的只剩 JD 截图识别（`parseJdFromImage`）与岗位匹配（[ui/README.md](ui/README.md)）。
- **Agent 轮次 SSE 只推真实状态。** `GET /turns/{turn_id}/events` 目前只推轮次/待办的 `snapshot` 与 `turn.updated`，空闲发心跳；模型进度 / token / 步骤事件需要 Agent run loop 与队列，尚未实现（见 [契约 §18](docs/agent/agent-operation-api.md)）。
- **没有 MCP server。** 能力发现返回的 `mcpUrl` 是占位，实测 `GET /mcp` 返回 404；外部接入目前走 REST 与 PAT。
- **后端 spawn 运行体要求 CLI 在 `PATH`。** `POST /resumes/{id}/runs` 默认执行 `resumate-agent`，安装方式：`uv tool install ./agent-core`（或把 `AGENT_RUNNER_COMMAND` 指向其它可执行文件）。注意该工具是安装时的快照，`agent-core` 改动后需要重新安装才会生效。
- **模板管理端写接口未开放**，模板当前只读。
- **Webhook 未实现**；A11 的面试闭环、岗位题库、知识库检索、语音作答（云端 ASR + TTS）、笔试、数据聚合与评分一致性抽检均已实现（见 [用户故事索引](docs/user-stories/README.md)）。**评分一致性抽检结论是不通过**：可比较维度覆盖率 100% 达标（门槛 0.8），不通过原因是单点最大偏差 14 分超过 10 分上限（四维合并 MAD 3.45、±5 分内 90%），因此当前量表分数只能作为相对趋势参考。
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

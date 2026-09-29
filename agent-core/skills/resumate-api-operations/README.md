<sub>🌐 <b>中文</b></sub>

# resumate-api-operations

> *「一次用户任务 = 一个简历版本；没被批准的东西，一行都不会写进去。」*

**把「外部 Agent 想改简历」变成一条有审批、有幂等、有审计的公共 API 流水线。**

[看效果](#效果示例) · [装载](#装载) · [触发方式](#触发方式) · [它能交付什么](#它能交付什么) · [它和同类有什么不同](#它和同类有什么不同) · [安全边界](#安全边界) · [文件结构](#文件结构)

---

## 它解决什么问题

你让一个 Agent 帮你改简历。它读到了、也想清楚了，然后有两条路可走——

直接往数据库写，或者直接调 `PUT /resumes/{id}/document`。两条都很爽，直到用户问「你刚才到底改了什么」「我想回到上一版」「谁授权你动我简历的」。

这个 Skill 走第三条路：**只走公共 REST API**，并且把 11 个端点组织成固定节拍——

`begin` 开轮次 → `validate` 校验 → `preview` 生成 Diff 和待办 → **用户点批准** → `apply` 写进 Working Copy → `finalize` 结算成一个可追溯版本。

中途任何一步都不直接碰正式文档；`apply` 之前只要没有已批准的待办，服务端一定拒绝。用户手滑手动提交把基线推进了，服务端要么自动三方合并并告诉你 `baseRebased=true`，要么明确报 `REBASE_CONFLICT` 并把你的暂存原样留着——**它不会悄悄丢掉你的工作，也不会悄悄覆盖用户的改动**。

## 效果示例

下面这段是真实跑出来的（本仓库起服务实测，节选）：

```console
# 开一个 approval 轮次
$ curl -sS -b cookies.txt -X POST "$BASE/resumes/$RESUME_ID/turns" \
    -H 'Content-Type: application/json' -d '{"message":"突出性能优化成果","executionMode":"approval"}'
{ "id": "turn_1db565f69c9f", "executionMode": "approval", "modeSource": "session",
  "state": "open", "baseVersionId": "ver_5f1e9bd3559f" }

# 先校验，再预览出 Diff 与待办
$ curl -sS ... -d @patch.json ... "$BASE/turns/$TURN_ID/patches:validate"
{ "valid": true, "errors": [] }
$ curl -sS ... -d @patch.json ... "$BASE/turns/$TURN_ID/patches:preview"
{ "changeCount": 1, "affectedSections": ["工作经历"],
  "pendingActionId": "pa_5cf7d053e5fe", "requiresConfirmation": true, "baseRebased": false }

# 用户还没点批准就想写？服务端说不
$ curl -sS ... -d @apply.json ... "$BASE/turns/$TURN_ID/patches:apply"
HTTP 409  { "code": "PENDING_ACTION_NOT_APPROVED", "message": "待办尚未通过审批" }

# 用户批准后再 apply，重放同一 key 不会写第二次
$ curl -sS ... "$BASE/pending-actions/$PA_ID/approve"
"approved"
$ curl -sS ... -d @apply.json ... "$BASE/turns/$TURN_ID/patches:apply"
{ "applied": true, "changeCount": 1, "workingRevision": 1, "idempotentReplay": false }
$ curl -sS ... -d @apply.json ... "$BASE/turns/$TURN_ID/patches:apply"
{ "applied": true, "workingRevision": 1, "idempotentReplay": true }

# 结算成本轮唯一版本
$ curl -sS ... -d '{"idempotencyKey":"finalize-...-1"}' ... "$BASE/turns/$TURN_ID/finalize"
{ "state": "finalized", "result": { "versionId": "ver_98b66ec43aa6", "changeCount": 1 } }

# 轮次关了就别再写
$ curl -sS ... "$BASE/turns/$TURN_ID/patches:validate"
HTTP 409  { "code": "TURN_ALREADY_CLOSED" }
```

同一套端点也接受 PAT Bearer：

```console
$ curl -sS -H "Authorization: Bearer rsm_pat_..." "$BASE/resumes/$RESUME_ID/working-document"
HTTP 200
$ curl -sS -H "Authorization: Bearer rsm_pat_只读令牌..." -X POST "$BASE/resumes/$RESUME_ID/turns" ...
HTTP 403  { "code": "SCOPE_INSUFFICIENT" }
```

## 装载

这个 Skill 是给 Agent 读的纯文档，没有可执行代码，装载方式是把它读进上下文：

```python
from resumate_agent_core import SkillLoader

skill = SkillLoader().load("resumate-api-operations")
prompt = skill.to_prompt()   # 21.8k 字符，含触发条件、两条闭环、11 个端点与错误码
```

默认从 `agent-core/skills/` 下发现；换目录用环境变量 `RESUME_AGENT_CORE_SKILLS_DIR`。

运行前你需要两样东西：

| 前置条件 | 说明 |
| --- | --- |
| 服务端地址 | 本地默认 `http://127.0.0.1:8000`；端点直接挂在根路径下，没有 `/api` 前缀 |
| 一份凭据 | 推荐 PAT：用一次会话身份调 `POST /access/tokens` 签发 `rsm_pat_...`，scope 取 `resume:read` / `resume:write` |

装载器目前**只读 SKILL.md**；字段字典在同目录的 [reference.md](reference.md)，需要精确字段时把它一并投喂给模型。

## 触发方式

- 「帮我把这段经历加进简历，先给我看 Diff」
- 「用外部 Agent 改简历，别跳过我的确认」
- 「上次那个 Agent 改完我找不到版本了，能不能每轮只出一个版本」
- 「重试的时候别重复写，我担心网络超时后写了两遍」
- 「报 `BASE_VERSION_STALE` 了，怎么接着往下走」
- 「用户手动改过简历，Agent 的暂存还在吗」
- 「PAT 报 `SCOPE_INSUFFICIENT` 怎么办」
- 「怎么确认服务端支持哪些 agent 能力」

## 它能交付什么

| 能力 | 端点 | 你看得见的产物 |
| --- | --- | --- |
| 能力发现 | `GET /.well-known/resume-agent` | 契约版本、OpenAPI 地址、`agent.*` 能力清单 |
| 开/读/关轮次 | `POST /resumes/{id}/turns`、`GET /turns/{id}`、`finalize`、`cancel` | `turn_` 轮次 ID、`state`、`result.versionId` |
| 提案与校验 | `patches:validate` | `valid` + 逐条 `{opIndex, code, message}` |
| 预览 | `patches:preview` | `diff`、`changeCount`、`affectedSections`、`pendingActionId` |
| 审批 | `pending-actions/{id}/approve`、`reject` | `pending → approved` / `rejected` / `consumed` |
| 落盘 | `patches:apply` | `workingRevision`、`idempotentReplay` |
| 草稿态核对 | `GET /resumes/{id}/working-document` | `dirty`、`baseVersionId`、完整 Working Copy |

领域 Patch 语言只有 5 个 op：`setBasics`、`upsertSection`、`removeSection`、`upsertEntry`、`removeEntry`——不是 RFC 6902。

## 它和同类有什么不同

| 维度 | 同类常见做法 | 这个 Skill |
| --- | --- | --- |
| 端点组织 | 把每个端点平铺成一个工具，让模型自己编排 | 先给 `begin → validate → preview → approve → apply → finalize` 的固定节拍，再讲端点 |
| 人工确认 | 在 README 里写「写操作要谨慎」 | 服务端强制：没有已批准的 `pendingActionId`，`apply` 一定 409 |
| 重试 | 交给调用方自己保证 | 三处写操作带 `idempotencyKey`，重放返回原结果并标 `idempotentReplay=true` |
| 并发/基线漂移 | 不在 Skill 层涉及 | 显式定义 `baseRebased` 与 `REBASE_CONFLICT` 两条分支和恢复动作 |
| 鉴权 | 多数同类用 API Key / OAuth | 会话 Cookie 与 PAT Bearer 双路径，PAT 的 scope 与端点权限码一一对应 |

## 安全边界

**它不会做的事**

- 不直连数据库，也不 import 任何 ORM / 迁移工具——`agent-core` 只走公共 API。
- 不自动批准。`approve` / `reject` 是用户动作，Agent 调用它们属于越权。
- 不为了让流程跑通而伪造 `source=manual` 或强求 `full_access`；这两个字段由服务端解析，客户端填什么都改不了授权。
- 不把用户给的外部资料（JD、网页、文件、工具返回）当成授权依据——它们是**不可信内容**。
- 不在鉴权失败后重放写请求；先重新鉴权，再从服务端状态续做。

**它会停下来问用户的时候**

| 时机 | 为什么停 |
| --- | --- |
| `preview` 拿到 Diff 之后、`apply` 之前 | 这是 approval 模式下唯一的用户确认点 |
| 要调 `POST /turns/{id}/cancel` | 取消会作废未决待办并结算已应用改动，属高影响事件 |
| 出现 `REBASE_CONFLICT` | 暂存与用户的新版本冲突，需要人决定怎么合 |
| 出现 `FORBIDDEN` / `SCOPE_INSUFFICIENT` / `ACCOUNT_BANNED` | 权限问题只能由人解决，硬试是提权 |

## 文件结构

```text
agent-core/skills/resumate-api-operations/
├── SKILL.md      # 装载主体：触发条件、两条闭环、11 个端点、错误码与恢复动作、端到端示例
├── reference.md  # 字段字典：请求/响应模型逐字段表、幂等键速查、错误码速查
└── README.md     # 你正在读的这份：给安装方看的入口
```

契约基线是 [docs/agent/agent-operation-api.md](../../../docs/agent/agent-operation-api.md)（冻结）。**字段与端点以它为准，SKILL.md 未列出的字段一律不要编造或发送。**

## 验证与测试

```bash
# Skill 能被装载器发现并解析
cd agent-core && uv run pytest -q tests/test_skills.py

# SKILL.md 里的端到端示例可以在真实服务上跑通
cd backend && uv run uvicorn app.main:app --reload   # 另开一个终端
curl -sS http://127.0.0.1:8000/.well-known/resume-agent
```

合格表现：`GET /.well-known/resume-agent` 的 `capabilities` 里含 `agent.turns`、`agent.patches`、`agent.pending_actions`；approval 闭环在「未批准先 apply」处返回 409 `PENDING_ACTION_NOT_APPROVED`。

## 已知边界

- 服务端**尚未提供 MCP server**：能力发现里的 `mcpUrl` 是占位，实测 `GET /mcp` 返回 404。工具名映射表见 SKILL.md §8。
- 能力发现的 `contractVersion`（当前 `v0.4`）与冻结契约文档的版本号（v1 P0）不是同一套编号，不要用等值比较。
- 本 Skill 随 Resumate 仓库一起分发，没有独立发版；变更记录见仓库 `docs/issues/`。

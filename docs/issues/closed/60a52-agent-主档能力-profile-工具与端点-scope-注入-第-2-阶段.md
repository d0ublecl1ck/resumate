---
id: 60a52
status: closed
created_at: 2026-10-01T09:00:00.000Z
updated_at: 2026-10-02T02:45:24.649Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-02T02:36:46.345Z
closed_at: 2026-10-02T02:45:24.649Z
---

# Agent 主档能力：profile 工具与端点、scope 注入（第 2 阶段）

## Background

- 第 1 阶段（fef83）已把 scope/target 泛化到主档，并能 `POST /sessions/{id}/runs` 起 profile run。
- 缺口：profile pending action 没有 HTTP 端点；agent-core 不认识主档；profile run spawn 出的 CLI 无 `--resume-id` 会失败。

## Scope

- 后端：`GET /sessions/{id}/turns`（owner 隔离、最新优先、含 pendingActions）；`POST /turns/{id}/profile-actions`（scope=profile 校验、允许 run 凭据、加入白名单、越权 404/403 审计）；profile 轮次的 finalize/cancel 泛化；session run 传 profile 作用域参数。
- agent-core：`get_profile`、`propose_profile_change` 工具；按 scope 注入工具集（profile 不注入简历读写工具）；CLI `--scope profile`；run 结束时写面向用户的 assistant 会话消息。
- 真实端到端跑一次 profile run，留下 `scope=profile` / `target=profile` 的 DB 证据。

## Non-goals

- 不重开 e9ad6 越权路径：approve/reject 仍人类会话，run 凭据 403。
- 不改前端；不合并回 main。

## Acceptance Criteria

- [x] `GET /sessions/{id}/turns` 契约与 `GET /resumes/{id}/turns` 同构。
- [x] `POST /turns/{id}/profile-actions` 允许 run 凭据、scope=profile 才可用、越权 404/403 且审计。
- [x] `run_token._ALLOWED_ENDPOINTS` 覆盖新端点，`test_run_token_allowlist.py` 通过。
- [x] agent-core profile 工具集不含简历读写工具；CLI profile 模式可跑；结束写 assistant 会话消息。
- [x] `uv run --directory backend pytest -q` 现有 221 不退化；`cd agent-core && uv run pytest -q` 现有 97 不退化。
- [x] 真实 profile run 端到端 + DB 证据；`archkit inspect .` 通过。

## Implementation

### backend
- `GET /sessions/{session_id}/turns`：`service.list_session_turns` + `dao.list_turns_for_session`（owner 隔离、created_at 倒序、含 pendingActions），契约与 `GET /resumes/{id}/turns` 同构。
- `POST /turns/{turn_id}/profile-actions`：暴露既有 `service.stage_profile_action`（scope=profile 校验；approval 建 pending / full_access 立即写）；权限 `resume:write` 但**不要求**人类会话，供 run 凭据调用。
- profile 轮次的 `finalize` / `cancel` 泛化：无 working copy，finalize 直接关闭、cancel 关闭并把未决 pending 置 stale；`patches:*` 仍只限 resume。
- `run_token._ALLOWED_ENDPOINTS` 增 `GET /profile`、`GET /profile/facts`、`POST /turns`、`GET /sessions/{id}/turns`、`POST /turns/{id}/profile-actions`；`test_run_token_allowlist.py` 用 AST 从 client.py 推导并比对，自动纳管新增 client 方法。
- session run spawn 传 `--scope profile`（`_child_command` 按 scope 分支，profile 不带 `--resume-id`）。
### agent-core
- `models.py`：`UserTurn.scope`、`resume_id` 可空、`PendingAction.target`/`target_resource` 可空、`kind` 支持 `profile_change`、`TurnResult.resume_id` 可空；新增 `ProfileFact`/`ProfileSummary`/`ProfileActionPreview`。
- `client.py`：`get_profile`、`list_profile_facts`、`create_profile_turn`（`POST /turns`）、`list_session_turns`、`propose_profile_change`。
- `tools.py`：新增 `get_profile`、`propose_profile_change`；`tools_for_scope`/`tool_specs_for_scope`/`openai_tool_specs_for_scope`——profile 集不含 `get_working_document`/`validate_patch`/`preview_patch`/`apply_patch`，`create_turn` 为 profile 版（要求 `session_id`）。
- `turn.py`/`runtime.py`：`TurnSession` 支持 `scope`，profile 走 `create_profile_turn`；`AgentRuntime.run(scope=...)` 选工具集，`_invoke` 自动补 `session_id`。
- `session.py`：新增 `reply(text)`，run 结束把最终 assistant 文字写成 `role=assistant`、`content={"text": ...}` 的会话消息（取下一 seq 并把游标移过它，不是模型上下文）。
- `cli.py`：新增 `--scope {resume,profile}`（env `RESUME_AGENT_CORE_SCOPE`）；profile 要求 `--session`、不要求 `--resume-id`；state 快照写入 scope。

## Verification

```console
$ cd backend && uv run pytest -q
228 passed, 4 warnings in 14.20s

$ cd agent-core && uv run pytest -q
101 passed in 0.14s

$ archkit inspect .
Quality gates passed.
```

基线：backend 221、agent-core 97；现 228 / 101，0 退化。

### 端到端（真实 HTTP + 真实工具 + 真实 DB；模型用本地 OpenAI 兼容桩）
在 8011 端口起本 worktree 后端（`AGENT_RUNNER_COMMAND=<worktree>/agent-core/.venv/bin/resumate-agent`），用真实会话 cookie 起 `POST /sessions/{id}/runs`：

```console
POST /sessions/sess_e805b5cdb755/runs  ->  202 {"runId":"run_de0e4c76ae4a","status":"started"}

run log:
  tool_progress get_profile completed  -> {"id":"profile_50a3bf88124d", ...}
  tool_progress propose_profile_change completed -> {"valid":true,"target":"profile","changeCount":1,"pendingActionId":"pa_af93de9242de","requiresConfirmation":true}
  message "已读取你的主档，并提交了一条待确认的技能改动，请在界面上确认。"
  finalize turn_50931a20ff54 state=finalized scope=profile

DB:
  agent_turns: (turn_50931a20ff54, scope=profile, state=finalized, session_id=sess_e805b5cdb755)
  agent_pending_actions: (pa_af93de9242de, turn_id=turn_50931a20ff54, target=profile, kind=profile_change, state=pending, resume_id=NULL)

GET /sessions/sess_e805b5cdb755/messages: seq 7 = 上下文 assistant 镜像；seq 8 = {"text": "..."} 面向用户的回复。
```

说明：远端 OpenAI 兼容端点 `http://23.254.197.253:8080` 对库内密钥与 codex-api skill 密钥都返回 401 INVALID_API_KEY（2026-10-02 实测），因此真实 LLM 调用无法完成；改用本地桩 provider 跑通「后端 spawn → run 凭据鉴权 → agent-core profile 工具 → 后端建轮次/建 pending action → finalize → 会话回复」全链路。测试后已把该用户的 `model_config` 精确还原（model/endpoint/apiKey blob 一致），并停掉 8011 与桩服务。

## Related ADRs

- None.

---
id: 91eeb
status: closed
created_at: 2026-10-09T16:18:39.653Z
updated_at: 2026-10-09T16:35:53.599Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T16:18:57.894Z
closed_at: 2026-10-09T16:35:53.599Z
---

# profile 作用域注入会话绑定并强制覆盖模型猜测的 session_id

## Background

用户在 `/profile` 右侧「个人资料助手」发送「我叫示例用户 20050303」，Agent 能列出自己的工具、
也能成功调用 `get_profile`，但为了调 `create_turn` 只能自己猜 session id：日志里连续出现
`default` / `sess_default` / `sess_50a3bf88124d` / `profile_50a3bf88124d` 等 10 个猜测值，
全部返回 `RESOURCE_NOT_FOUND`，最后反过来问用户要 session_id，这次录入没有写入任何内容。

两处接线缺陷都在 `agent-core/src/resumate_agent_core/runtime.py`：

1. `bound_system_prompt()` 在一开始就 `if scope != "resume" or not resume_id: return`，
   于是 profile 作用域拿不到任何绑定说明。该函数 docstring 自己写着「Name the bound resume
   (and open turn) so the model never guesses either」，但这套保护只覆盖 resume 作用域。
2. `AgentRuntime._invoke()` 里 resume 绑定是强制覆盖
   （`if session.resume_id and "resume_id" in properties: args["resume_id"] = session.resume_id`），
   而 session 绑定只是兜底填充
   （`if "session_id" in required and not args.get("session_id"): args["session_id"] = self.session_id`）。
   `create_turn` 的 schema `"required": ["session_id"]`，于是模型一旦猜一个值，猜测值就压掉运行体
   真实的 `self.session_id`。

## Scope

- `agent-core/src/resumate_agent_core/runtime.py` 的 `_invoke()`：只要工具的 `properties` 声明了
  `session_id`，就用运行体自己的 `self.session_id` 强制覆盖模型给的值；保留「模型没给就注入」的行为，
  并处理 `self.session_id is None` 的边界（此时不注入，交给工具自身的 required 校验报错）。
- `agent-core/src/resumate_agent_core/runtime.py` 的 `bound_system_prompt()`：给 profile 作用域补绑定段，
  至少包含本次 run 所属的 session id、这是 profile 作用域、以及运行体已开好的 turn_id（复用它、
  不要另调 `create_turn`），措辞与 resume 作用域既有的两段一致。
- `agent-core/tests/test_profile_session_binding.py`（新增）：先写会失败的红灯用例。

## Non-goals

- 不改 resume 作用域既有的绑定措辞与语义。
- 不改 `agent-core/src/resumate_agent_core/tools.py` 的工具 schema 与 scope 选择。
- 不改 `backend/app/modules/agent/runner.py`：它已经通过 `--session` 把 session id 交给子进程，
  时序与数据都已具备。
- 不做兼容分支：`session_id` 由 schema 声明即视为「由运行体持有」，不保留模型覆盖入口。

## Acceptance Criteria

- [x] 模型给 `create_turn` 传伪造 `session_id` 时，最终发给后端的仍是运行体自己的 session。
- [x] profile 作用域的 system prompt 含本次 run 的 session id，并说明这是 profile 作用域。
- [x] profile 作用域的 system prompt 在运行体已开好 turn 时含 `turn_id` 且明确禁止再调 `create_turn`。
- [x] 回归用例：不注入绑定 + 模型自猜 session_id 时失败；修复后同一路径通过。
- [x] `cd agent-core && uv run pytest -q` 与 `cd backend && .venv/bin/python -m pytest -q` 全通过。
- [x] `node quality-gates/run.js` 与 `archkit inspect .` 全通过。
- [x] 真实端到端：临时后端 8006 + 临时前端 5176，用有效模型配置的账号在个人资料助手发送
      「我叫示例用户 20050303」，运行日志不再出现猜 session_id 与 `RESOURCE_NOT_FOUND`，
      运行体先开好的轮次被复用并走到提案（pending action）等待确认，临时进程用毕全部停止。

## Implementation

三处最小改动，全部在 `agent-core/src/resumate_agent_core/runtime.py`：

1. `_invoke()`：session 绑定改为「声明即强制覆盖」，与 resume 绑定同等对待。

   ```python
   # 修复前：只在模型没给时才注入，猜测值会压掉运行体真实的 session。
   if "session_id" in required and not args.get("session_id"):
       args["session_id"] = self.session_id
   # 修复后：只要工具声明了 session_id，一律覆盖；self.session_id 为 None 时不注入空串。
   if self.session_id and "session_id" in properties:
       args["session_id"] = self.session_id
   ```

2. `bound_system_prompt()` 新增 `session_id` 参数，并给 profile 作用域补两段绑定（会话 + 已开轮次）。
   原文对 profile 是 `if scope != "resume" or not resume_id: return` 直接短路；现在 profile 分支先写：

   - `This run belongs to profile session <id>. Tools that take a session_id are pre-filled with it;
     never guess or invent a session id.`
   - `A profile turn is already open (<turn_id>). Reuse it: submit profile changes for confirmation with
     propose_profile_change; do not call create_turn.`

   resume 分支逐字不变，因此 resume 作用域的提示词长度与语义都没动。
3. `opening_messages()` 与 `run()` / `resume()` 把 `self.session_id` 透传进绑定函数。

时序确认：`run()` 里 `self._open_session()` → `session.begin()` 开轮次 → 之后才构造
`opening_messages()`，所以第一次模型调用前 session id 与 turn_id 都已就绪；端到端日志里
session 的第 2 条消息（system）已经带着两段绑定，证明这一点。

未改 `backend/app/modules/agent/runner.py`：它已经通过 `--session` 把 session id 交给子进程，
`docs/issues/4ff97` 的并发改动只增加 `report_error` 透传，与本缺陷无交叉。

## Verification

红绿对照（临时把 `bound_system_prompt` 与 `_invoke` 换回修复前实现后重跑）：

```
fixed-code run: 3 passed in 0.06s
old-code run:   exit=1
  AssertionError: 伪造的 session_id 不应该被后端拒绝：
    ['[RESOURCE_NOT_FOUND] 会话 sess_guessed 不存在 (HTTP 404)']
```

```
$ cd agent-core && uv run pytest -q
130 passed in 1.37s

$ cd backend && .venv/bin/python -m pytest -q
574 passed, 4 warnings in 42.92s

$ pnpm -C ui test
Test Files  80 passed (80)
     Tests  606 passed (606)

$ node quality-gates/run.js
Quality gates passed.

$ archkit inspect .
Quality gates passed.
```

真实端到端（临时后端 127.0.0.1:8006 + 临时前端 127.0.0.1:5176，
`API_PROXY_TARGET=http://127.0.0.1:8006`，账号 `admin@resumate.dev`，approval 模式）：

```
login 200 admin@resumate.dev
create session 201 sess_347960badc94
append user message 201 1
start profile run 202 {'runId': 'run_cc9d52304815', 'status': 'started'}
turn turn_e9f553fac5a1 state= open pending= ['pending'] runError= None
SESSION_ID sess_347960badc94
```

`backend/var/agent-runs/run_cc9d52304815.log` 的工具轨迹（`create_turn` 一次都没有出现）：

```
   1 "name": "capability", "phase": "started"
   1 "name": "get_profile", "phase": "started"
   2 "name": "get_turn", "phase": "started"
   2 "name": "list_pending_actions", "phase": "started"
  12 "name": "propose_profile_change", "phase": "started"
RESOURCE_NOT_FOUND=0
FORBIDDEN=0
== guessed-session guard == 0
{"type": "tool_progress", "toolCallId": "call_03_WJ8p1aaXDzxWjyYsMRrc6384", "name": "propose_profile_change",
 "phase": "completed", "result": {"valid": true, "target": "profile", "changeCount": 1,
 "pendingActionId": "pa_d48f5114113b", "requiresConfirmation": true}}
```

同一 session 落库的 system 消息（`GET /sessions/sess_347960badc94/messages` 的 seq 2）已经带绑定：

```
This run belongs to profile session sess_347960badc94. Tools that take a session_id are pre-filled
with it; never guess or invent a session id.

A profile turn is already open (turn_e9f553fac5a1). Reuse it: submit profile changes for confirmation
with propose_profile_change; do not call create_turn.
```

对照现场：同一台机器上跑仓库外的旧 CLI（`~/.local/bin/resumate-agent`）时，同一个用例的日志是
`RESOURCE_NOT_FOUND=22`、`create_turn` 失败 21 次，猜的 id 正是 `session_default` / `default`
/ `local` / `sess_admin` / `profile_9fd94e7179fc` 这一串；换成修复后的源码后归零。
（旧 CLI 是 `uv tool install` 装的上游副本，本次用临时包装脚本把临时后端的
`AGENT_RUNNER_COMMAND` 指向本 worktree 的 `agent-core/src`。）

收尾：临时后端与临时前端已停，`8006`、`5176` 已释放；用户在用的 `8000`、`5173` 未重启。


## Related ADRs

- None.

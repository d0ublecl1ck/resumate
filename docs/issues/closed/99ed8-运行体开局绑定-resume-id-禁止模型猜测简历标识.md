---
id: 99ed8
status: closed
created_at: 2026-10-07T10:20:00.000Z
updated_at: 2026-10-07T10:48:07.728Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-10-07T10:18:05.862Z
closed_at: 2026-10-07T10:48:07.728Z
---

# 运行体开局绑定 resume_id，禁止模型猜测简历标识

## Background

「用对话改简历」在真实 UI 里改不动简历：标准 run 由后端 spawn `resumate-agent`，子进程从 `tools_for_scope("resume")` 拿到的工具把 `resume_id` 声明为 **required**，而开局上下文只有 `[system(DEFAULT_SYSTEM_PROMPT), user(prompt)]`（`agent-core/src/resumate_agent_core/runtime.py:539`），**从不告诉模型它被绑定到哪份简历**。模型只好自己猜：

```text
seq5  assistant ...the task didn't include a `resume_id`. Let me check whether there's a discoverable default.
seq6  tool      ERROR [FORBIDDEN]: 运行凭据只能访问它所属的简历
seq8/9/10 tool  ERROR [FORBIDDEN]: 运行凭据只能访问它所属的简历   ← 猜了 res_default / res_main / res_me / res_001
seq11 assistant 我无法开始编辑，因为缺少目标简历标识……
```

（证据来自 dev 库 session `sess_ebb102d0a25f`，浏览器真实发起的那次 run。）

机制：`runtime.py:368-369` 只在 `resume_id` 缺失时注入 `session.resume_id`，模型一旦自己填了（错的）id，注入永远触发不到，请求就被运行凭据的 scope 拦成 FORBIDDEN。

## Scope

- `agent-core/src/resumate_agent_core/runtime.py`：
  - 开局上下文明确写出绑定简历：resume 作用域时 system prompt 追加 `This run is bound to resume <id>...never guess or invent a resume id`（新增可测的纯函数 `bound_system_prompt` / `opening_messages`）。
  - `_invoke` 成为 resume 绑定的权威：工具 schema 含 `resume_id` 属性且 `session.resume_id` 非空时，**无条件覆盖**为 `session.resume_id`（模型自己填的错值也会被改回正确值）。
- `agent-core/src/resumate_agent_core/tools.py`：`create_turn` 与 `get_working_document` 的 `resume_id` 从 `required` 移除（保留在 properties，模型仍可见；运行时注入兜底）。
- 测试：`agent-core/tests/test_runtime.py`（开局上下文含绑定 id；模型给错 id 被覆盖；模型省略 id 仍可用）、`agent-core/tests/test_tools.py`（resume 作用域 schema 不再 required resume_id）。

## Non-goals

- 不改 `backend/`、不改运行凭据 scope 校验、不新增「列出我的简历」端点。
- 不改 profile 作用域工具集（profile 轮次不绑简历）。

## Acceptance Criteria

- [x] 开局 system prompt 含绑定的 resume id；模型即使给出错误 resume_id，工具调用也落到正确简历。
- [x] `resume_id` 不再出现在 `create_turn` / `get_working_document` 的 `required` 中，模型省略时运行时注入。
- [x] `agent-core/tests` 全绿（Red→Green）。
- [x] 重装 uv tool 后真实 run 的 session 记录里不再出现 `FORBIDDEN: 运行凭据只能访问它所属的简历`，并生成待确认修改。

## Implementation

- `agent-core/src/resumate_agent_core/runtime.py`：新增 `bound_system_prompt` / `opening_messages`，resume 作用域的开局 system prompt 明确写出 This run is bound to resume <id> ... never guess or invent a resume id；`run()` 与 `resume()` 的兜底上下文都走它。
- `runtime.py` `_invoke`：工具 schema 的 properties 含 `resume_id` 且 `session.resume_id` 非空时**无条件覆盖**传入的 `resume_id`，模型猜错也改回绑定值；注入条件由「required 且缺失」放宽为「有属性就注入」，与 `required` 解耦。
- `agent-core/src/resumate_agent_core/tools.py`：`create_turn` 与 `get_working_document` 的 `required` 去掉 `resume_id`（保留在 properties），模型省略时由运行时兜底。
- 测试：`agent-core/tests/test_runtime.py` 新增 4 条（scope-aware 绑定 prompt、开局上下文含绑定 id、模型给错 id 被覆盖、模型省略 id 仍可用）；`agent-core/tests/test_tools.py` 新增 1 条（resume 作用域 schema 不再 required resume_id）。

## Verification

TDD Red（实现前）：

```text
uv run --directory agent-core pytest -q
→ 4 failed, 102 passed
   test_bound_system_prompt_names_the_resume_only_for_resume_scope
   test_opening_context_tells_the_model_which_resume_it_is_bound_to
   test_runtime_overrides_a_guessed_resume_id
   test_resume_scoped_schemas_leave_resume_id_to_the_runtime
```

Green（实现后）：

```text
uv run --directory agent-core pytest -q   → 106 passed
```

### 合并后真实页面 E2E（2026-10-07）

同一轮会话 `sess_13d880e9db1d` 的 18 条消息里 `FORBIDDEN` 计数为 0（修复前模型会猜 `res_default` / `res_main` / `res_me` / `res_001`，全部被运行凭据 scope 拦成 FORBIDDEN）；`get_working_document` 直接读到绑定简历，生成 pending action，approve 后 `apply_patch` + `finalize_turn` 成功，简历 `basics.location` 变为「杭州」。

采样与截图见 9d3cb 的 Verification。

## Related ADRs

- None.

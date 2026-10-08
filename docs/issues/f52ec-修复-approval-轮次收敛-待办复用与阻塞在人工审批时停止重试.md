---
id: f52ec
status: in-progress
created_at: 2026-10-08T14:46:03.181Z
updated_at: 2026-10-08T15:15:57.567Z
priority: high
labels: []
parent: null
blocked_by: []
started_at: 2026-10-08T15:15:57.567Z
---

# 修复 approval 轮次收敛：待办复用与阻塞在人工审批时停止重试

## Background

用户批准待办后，运行体靠模型反复重试推进：实测一次 approval run（`backend/var/agent-runs/run_cc6ebed8e375.log`）为同一处改动连开两个待办、反复 `list_pending_actions` / `apply_patch`，直到 `BUDGET_EXCEEDED`（101176 > 100000）被后端 cancel；工作副本仍被 settle 提交，但界面上「批准了却没反应」。

同一条链路上还实测到两个更严重的缺陷：

1. `setBasics` 只给部分字段时会**静默清空**其它基础字段（run_cc6ebed8e375 的 pa_3a484ac61272 把 fullName / email / phone 清成空串并提交成版本；已用 PUT 恢复为 ver_ceacfa85e01a）。
2. DeepSeek thinking 模式要求把上一轮 assistant 的 `reasoning_content` 原样传回，provider 丢弃该字段导致下一次请求直接 400（`run_1a7100e4b2d5.log`：`The reasoning_content in the thinking mode must be passed back to the API`）。

## Scope

- approval 模式不再靠模型重试推进：预览生成待办后由运行体程序化轮询人工决定（不消耗模型 token），批准后由运行体直接 apply，并用一条 user 消息把结果交回模型继续；拒绝 / 失效 / 超时则带着原因停在人工闸口，**不结算轮次**。
- 同一轮次已有未决待办时，运行体拒绝重复 `preview_patch`，把错误交回模型要求复用它。
- 让待办复用安全：`setBasics` 改为「只覆盖请求里显式给出的字段」，agent-core 只把调用方真正给出的 basics 字段送上 wire；显式给空串仍然能清空字段。
- provider 保留并回传 `reasoning_content`；错误信息带上（抹掉 api key 的）响应体前 500 字符，`RESUMATE_PROVIDER_DEBUG=1` 时把请求体打到 stderr。
- 库内默认不接管等待（`approval_timeout_seconds=0`），命令行运行体通过 `RESUMATE_APPROVAL_WAIT_SECONDS`（默认 900s）开启。

## Non-goals

- 不改「批准」端点的语义：审批仍然是人类动作，运行体不代替人批准。
- 不新增会话 / 轮次契约字段。
- 「发送会作废上一轮待办」的界面拦截由 issue 3fdec 负责，本工单只保证运行体行为。

## Acceptance Criteria

- [x] approval 下批准后由运行体 apply 并 finalize，模型调用次数不随等待增长（实测 5 轮 / 16037 tokens 完成整轮）。
- [x] 同一轮次第二次 `preview_patch` 不再落到 API（单测断言只发一次 preview）。
- [x] 部分 `setBasics` 不再清空其它字段；显式空串仍能清空（backend 单测 3 条）。
- [x] thinking 模式的 `reasoning_content` 回传（单测 + 真实模型实跑无 400）。
- [x] ui / backend / agent-core 三个套件通过，`archkit inspect .` 通过。

## Implementation

- `agent-core/src/resumate_agent_core/runtime.py`：新增 `approval_poll_seconds` / `approval_timeout_seconds` 与 `_await_approval`（轮询 `GET /turns/{id}/pending-actions`，不花模型 token）、`_apply_pending`（批准后由运行体 apply）、`_append_runtime_note`（以 **user** 消息告知模型运行体做过什么）；待办未决时拒绝重复 preview；超时 / 拒绝 / 失效走 `stop_for_approval`，只写 checkpoint 不结算轮次。`Message` 增加 `reasoning` 字段并进出 wire。
- `agent-core/src/resumate_agent_core/openai_provider.py`：解析并回传 `reasoning_content`；HTTP 错误带（脱敏的）响应体；`RESUMATE_PROVIDER_DEBUG` 时打印请求体。
- `agent-core/src/resumate_agent_core/cli.py`：`_approval_wait_seconds()` 读 `RESUMATE_APPROVAL_WAIT_SECONDS` 并传给运行体。
- `agent-core/src/resumate_agent_core/models.py`：`PatchRequest.to_wire` 只序列化调用方显式设置过的 basics 字段。
- `backend/app/modules/agent/patch.py`：`setBasics` 只合并显式给出的字段（显式空串仍清空）。

## Verification

- `uv run pytest -q`（agent-core）：116 passed（新增 3 条收敛用例 + reasoning 回传 + patch wire 用例）。
- `uv run pytest -q`（backend）：282 passed（新增 `tests/test_agent_patch.py` 3 条）。
- `pnpm -C ui test`：56 files / 466 tests passed；`archkit inspect .`：Quality gates passed。
- 真实端到端（worktree 第二套 dev，前端 5174 / 后端 8001，Playwright headless + zh-CN，真实 deepseek 端点）：发送 → 待确认卡片 4s 出现 → 批准 → 运行体 apply → finalize → 编辑器 6s 内自动显示新头衔；整轮 5/24 turns、16037/100000 tokens（修复前同样场景烧到 100k 被 cancel）。
- 残余（记入 `.freak`）：运行体自造的 apply 用的是模型最近一次调用的 ops，可能与被批准的那次预览不一致而返回 `PENDING_ACTION_STALE`；实测模型会自己重新 list + apply 并成功，代价是多 1~2 轮。

## Related ADRs

- None.

---
id: 1d3e2
status: in-progress
created_at: 2026-10-01T06:00:00.000Z
updated_at: 2026-10-01T01:36:58.745Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T01:36:58.745Z
---

# run 凭据端点白名单与 agent-core client 一致性测试

## Background

- `backend/app/modules/agent/run_token.py` 的 `_ALLOWED_ENDPOINTS` 是手写清单，与 `agent-core/src/resumate_agent_core/client.py` 实际调用的路径之间没有任何一致性校验（8f5fe 自报的残余风险）。
- agent-core 将来新增必需端点而忘记加白名单，生产 run 会立刻 403，且只有真跑起来才发现。

## Scope

- 新增测试：用 AST 从 `client.py` 推导实际调用的 `(METHOD, path template)` 集合，与 `_ALLOWED_ENDPOINTS` 比对；缺一即失败并给出可读差异。
- 人机边界：`approve`/`reject` 是 human-only，必须继续被白名单拒绝（正向断言）。
- 反向检查：白名单不得有 client 不再使用的陈旧条目。
- 防绕过：`client.py` 的 HTTP 只能走 `_request` 一个 seam（直接 `self._http.request` 计数为 1）。
- `.freak` 中 8f5fe 的残余线索按结果补充说明。

## Non-goals

- 不改变任何生产行为（不改 `run_token.py` 的白名单内容、不改 `client.py` 业务逻辑）。
- 不碰 `ui/`；不合并回 main。

## Acceptance Criteria

- [ ] 测试从 `client.py` 源码推导端点；新增/修改 `self._request` 调用会让测试感知。
- [ ] 任一非 human-only 端点不在白名单时测试失败，并列出缺失路径。
- [ ] human-only（approve/reject）必须仍被白名单拒绝。
- [ ] 临时删掉一个白名单条目时测试变红（贴红/绿输出）。
- [ ] `UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest -q` 现有 200 条不退化；`archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.

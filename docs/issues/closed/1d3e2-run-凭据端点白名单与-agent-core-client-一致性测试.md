---
id: 1d3e2
status: closed
created_at: 2026-10-01T06:00:00.000Z
updated_at: 2026-10-01T01:38:21.677Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T01:36:58.745Z
closed_at: 2026-10-01T01:38:21.677Z
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

- [x] 测试从 `client.py` 源码推导端点；新增/修改 `self._request` 调用会让测试感知。
- [x] 任一非 human-only 端点不在白名单时测试失败，并列出缺失路径。
- [x] human-only（approve/reject）必须仍被白名单拒绝。
- [x] 临时删掉一个白名单条目时测试变红（贴红/绿输出）。
- [x] `UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest -q` 现有 200 条不退化；`archkit inspect .` 通过。

## Implementation

- `backend/tests/test_run_token_allowlist.py`（新增，6 条）：
  - `_request_calls()` 用 `ast` 解析 `agent-core/.../client.py`，取所有 `self._request(method, path)`；`Constant`/`JoinedStr`/`_encode(...)`/`self._turn_path(...)` 统一渲染成 path template（动态段折叠为 `*`）。
  - `test_all_client_endpoints_are_allowed_or_human_only`：对每个派生端点实例化样例路径；非 human-only 必须 `endpoint_allowed`，否则失败并列出缺失路径；human-only 跳过（由下一条单独断言）。
  - `test_human_only_endpoints_stay_out_of_the_run_allowlist`：approve/reject 必须仍在白名单之外。
  - `test_allowlist_has_no_stale_entries`：白名单每条都必须被某个派生端点命中（陈旧条目失败）。
  - `test_missing_allowlist_entry_is_detected`：monkeypatch 删掉 `GET /turns/{id}/state` 后，断言检查器报出 `GET /turns/*/state`（自证校验器真的会红）。
  - `test_client_keeps_a_single_http_seam`：`client.py` 直接 `self._http.request` 计数必须为 1，防止绕过 `_request` 新增端点。
- `.freak`：标记 8f5fe 的端点白名单漂移风险已处理，并记录「动态拼接路径会 fail-closed」的盲区。
- 未改任何生产行为：`run_token.py` 与 `client.py` 的业务代码零改动（红/绿演示后 `git diff` 为空）。

## Verification

红（临时删除白名单里的 `GET /turns/{id}/state` 条目）：

```console
$ UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest tests/test_run_token_allowlist.py -q
E  AssertionError: agent-core/client.py calls endpoints the run credential does not allow; a production run would get 403. Add them to _ALLOWED_ENDPOINTS (or keep human decisions human-only):
E      GET /turns/*/state
1 failed, 5 passed, 2 warnings in 0.05s
```

绿（恢复该条目）：

```console
$ UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest tests/test_run_token_allowlist.py -q
6 passed, 2 warnings in 0.04s
```

全量：

```console
$ UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest -q
206 passed, 4 warnings in 8.98s

$ archkit inspect .
Quality gates passed.
```

基线 200 条，无退化（+6）。

## Related ADRs

- None.

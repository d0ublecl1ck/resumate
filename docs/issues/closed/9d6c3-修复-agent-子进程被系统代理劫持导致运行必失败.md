---
id: 9d6c3
status: closed
created_at: 2026-10-07T09:31:20.033Z
updated_at: 2026-10-07T09:36:09.758Z
started_at: 2026-10-07T09:31:28.000Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 运行体与模型接入
closed_at: 2026-10-07T09:36:09.758Z
---

# 修复 Agent 子进程被系统代理劫持导致运行必失败

## Background

页面上发起一次 Agent 轮次（`POST /resumes/{id}/runs`）会返回 202，但后端 spawn 的 `resumate-agent` 子进程立刻写出
`{"type":"error","code":"UNKNOWN","message":"[UNKNOWN] Request failed (HTTP 502)","detail":"session failed"}`
（对应 `agent-core/src/resumate_agent_core/runtime.py` 的 `_open_session`）。backend 日志里看不到子进程发出的 `POST /sessions`，说明它根本没连到本机后端。

机制：这台 macOS 开启了系统代理（`scutil --proxy`：HTTP/HTTPS 均为 `127.0.0.1:7897`）。`httpx` 默认 `trust_env=True`，其 `get_environment_proxies()` 依次读取 `urllib.request.getproxies_environment()` 与（前者为空时）`getproxies_macosx_sysconf()`。父进程里存在 `no_proxy`/`NO_PROXY`，使 `getproxies_environment()` 返回非空字典，从而**短路掉 macOS 系统代理**；而 `backend/app/modules/agent/runner.py::_child_env` 刻意构造最小环境（只给 PATH/LANG/PYTHONUNBUFFERED 与 `RESUME_AGENT_CORE_*`），把这两个变量一并剥掉。子进程里 `getproxies_environment()` 返回空 → 回落到 macOS 系统代理 → httpx 把 `http://127.0.0.1:8000/sessions` 也发给 `127.0.0.1:7897`，代理回 502，响应体不是本项目的错误信封，归一化成 `UNKNOWN` + `Request failed`。

实测对照：`env -i PATH=... LANG=... PYTHONUNBUFFERED=1 ...` 复刻子进程环境时 `urllib.request.getproxies()` 返回 `{"http": "http://127.0.0.1:7897", "https": "http://127.0.0.1:7897", "socks": "http://127.0.0.1:7897"}`；同一环境只多加 `NO_PROXY=127.0.0.1,localhost` 即整轮跑通并 finalize。

## Scope

- 在 `backend/app/modules/agent/runner.py` 抽出一组小函数：从 URL 提取主机、判断是否回环、拼接去重的 bypass 列表；`_child_env` 据此注入 `NO_PROXY` 与 `no_proxy`。
- bypass 至少覆盖：`localhost`、`127.0.0.1`、`::1` 三个回环形式，以及从 `base_url` 解析出的后端主机。
- 若用户配置的模型 Endpoint 也指向回环地址（如本地 relay `http://127.0.0.1:8787/v1`），把它的主机也加入 bypass，避免本地模型端点被同样打挂；公网 Endpoint（如 `https://api.deepseek.com/v1`）不加入，仍走系统代理。
- 测试覆盖：`backend/tests/test_agent_runs.py` 断言 `_child_env` 的 `NO_PROXY`/`no_proxy` 取值与上述边界。

## Non-goals

- 不修改 macOS 系统代理设置，也不终止用户本机 `7897` 代理。
- 不在 `agent-core` 侧把 `ResumateClient` 改成 `trust_env=False`：那样会连模型 provider 的系统代理语义一起关掉，公网 Endpoint 在「必须经代理才能出网」的网络里会直接失败；本次只做子进程本地的 bypass 列表。
- 不改 provider 的代理语义、不改模型配置、不动前端 `ui/`、不改数据库内容。

## Acceptance Criteria

- [x] 新增的 backend 测试在改实现前失败（Red），断言 `_child_env` 结果同时含 `NO_PROXY` 与 `no_proxy`，且覆盖 `localhost` / `127.0.0.1` / `::1` 与从 `base_url` 解析的主机。
- [x] 本地回环 Endpoint 的主机被收录进 bypass；公网 Endpoint 的主机不被收录。
- [x] `cd backend && uv run pytest -q` 全绿。
- [x] 仓库根 `archkit inspect .` 通过。
- [x] 合并到 main 后（dev 后端 `--reload` 自动重载）实测：`run_3a6bb01ab9a1` 的 `backend/var/agent-runs/run_3a6bb01ab9a1.log` 出现 model 回复、`finalize` 与 `session` 事件，且不再出现 502 error。

## Implementation

- `backend/app/modules/agent/runner.py`：新增 `_LOOPBACK_HOSTS`、`_url_host`（容忍没有 scheme 的 Endpoint）、`_is_loopback_host`（`localhost` / `*.localhost` / `ipaddress.is_loopback`）、`_proxy_bypass_hosts`（回环三形式 + `base_url` 主机 + 回环的模型 Endpoint 主机，去重且保序）；`_child_env` 用它的结果同时写入 `NO_PROXY` 与 `no_proxy`，并在注释里写清 httpx `trust_env=True` + macOS 系统代理 + 最小环境剥离 bypass 的机制。
- `backend/tests/test_agent_runs.py`：新增 4 条 `_child_env` 单测——两个拼写一致且覆盖回环三形式、`base_url` 主机被收录、回环 Endpoint 被收录、公网 Endpoint 不被收录。
- `docs/agent/agent-operation-api.md` §20.2：子进程环境清单补 `NO_PROXY` / `no_proxy` 并说明机制与「公网 Endpoint 仍走代理」。
- `README.md`：后端测试数 `247` → `251`。
- `.freak`：登记「任何从零构造环境的 spawn 子进程都要显式给 bypass」这条线索。

## Verification

Red（改实现前）：

```console
$ cd backend && uv run pytest tests/ -q -k agent
tests/test_agent_runs.py:235: KeyError: 'NO_PROXY'
FAILED tests/test_agent_runs.py::test_child_env_bypasses_proxy_for_backend_and_loopback_forms
FAILED tests/test_agent_runs.py::test_child_env_bypasses_proxy_for_base_url_host
FAILED tests/test_agent_runs.py::test_child_env_bypasses_proxy_for_loopback_model_endpoint
FAILED tests/test_agent_runs.py::test_child_env_leaves_public_model_endpoint_on_the_proxy
4 failed, 58 passed, 189 deselected  (EXIT=1)
```

Green：

```console
$ cd backend && uv run pytest tests/ -q -k agent
62 passed, 189 deselected  (EXIT=0)
$ cd backend && uv run pytest -q
251 passed  (EXIT=0)
$ archkit inspect .
Quality gates passed.
```

机制实证（本机）：最小环境跑 `urllib.request.getproxies()` → `{"http": "http://127.0.0.1:7897", "https": "http://127.0.0.1:7897", "socks": "http://127.0.0.1:7897"}`（回落到 macOS 系统代理）；父进程同样的调用 → `{"no": "localhost,127.0.0.1,..."}`（有 bypass、无 http/https 代理），与上面的根因一致。

合并后端到端实测（dev 后端 `--reload` 自动重载后）：

```console
$ curl -X POST http://127.0.0.1:8000/resumes/res_aeba1b686aa4/runs -d '{"prompt":"回一句话"}'
HTTP 202  {"runId": "run_3a6bb01ab9a1", "status": "started"}

$ backend/var/agent-runs/run_3a6bb01ab9a1.log
{"type": "message", "text": "好的，请告诉我你想对这份简历做什么修改，我马上处理。"}
{"type": "finalize", "turn": {"id": "turn_3e490d9d6ded", ... "state": "finalized", ...}}
{"type": "session", "sessionId": "sess_399b787caa55"}

$ backend/var/dev/backend.log
"POST /resumes/res_aeba1b686aa4/runs HTTP/1.1" 202 Accepted
"POST /sessions HTTP/1.1" 201 Created
"POST /resumes/res_aeba1b686aa4/turns HTTP/1.1" 201 Created
"POST /turns/turn_3e490d9d6ded/finalize HTTP/1.1" 200 OK
```

修复前 backend.log 里根本看不到子进程发出的 `POST /sessions`；现在它落在 201，运行体随后 finalize。

## Related ADRs

- None.

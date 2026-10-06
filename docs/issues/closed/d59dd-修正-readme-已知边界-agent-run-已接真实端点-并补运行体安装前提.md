---
id: d59dd
status: closed
created_at: 2026-10-01T09:55:00.000Z
updated_at: 2026-10-01T01:34:20.781Z
priority: low
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T09:55:30.000Z
closed_at: 2026-10-01T01:34:20.781Z
---

# 修正 README 已知边界：Agent Run 已接真实端点，并补运行体安装前提

## Background

两处 README「已知边界」与实现脱节：

1. 第一条声称「前端的 Agent Run、自然语言解析、岗位匹配与工作台统计仍读取本地 mock」。但 55e99 已删除 `AGENT_RUNS` fixture 与 `getActiveRun` 的 mock 分支，25573 起改用真实轮次端点，d90a8 起可从界面真实发起 run，`getWorkbenchSummary` 也改为按真实活动轮次统计。仍在本地用启发式与样例数据的是自然语言解析（`parseProfileInput`）、JD 解析与岗位匹配。
2. 缺少部署前提说明：`POST /resumes/{id}/runs` 默认执行 `resumate-agent`（见 `backend/app/core/config.py:60` 与契约 §20），而该 CLI 不在后端 venv 里。不装到 PATH 或不设 `AGENT_RUNNER_COMMAND`，端点直接起不来，而 README 没有告诉读者这件事。

## Scope

- 重写「已知边界」第一条，区分「已接真实端点」与「仍是启发式」的部分。
- 在「已知边界」补一条：运行体 CLI 的安装方式与「快照需重装」的注意点。

## Non-goals

- 不改代码、测试、契约或 `.freak`。
- 不把启发式解析接真实后端（另有工单）。

## Acceptance Criteria

- [x] README「已知边界」不再声称 Agent Run 读取本地 mock。
- [x] README 说明 `resumate-agent` 的安装方式与 `AGENT_RUNNER_COMMAND` 的作用，并写明工具是安装时快照、agent-core 改动后需重装。
- [x] `archkit inspect .` 通过。

## Implementation

`README.md`：
- 第一条改为「**Agent Run 已接真实端点，解析类能力仍是启发式。** 发起运行、轮次与待办展示、审批、SSE 实时刷新都已走真实 API；仍在本地用启发式与样例数据的是自然语言解析（`parseProfileInput`）、JD 解析与岗位匹配」。
- 「没有 MCP server」之后新增一条：「**后端 spawn 运行体要求 CLI 在 `PATH`。** `POST /resumes/{id}/runs` 默认执行 `resumate-agent`，安装方式：`uv tool install ./agent-core`（或把 `AGENT_RUNNER_COMMAND` 指向其它可执行文件）。注意该工具是安装时的快照，`agent-core` 改动后需要重新安装才会生效。」

## Verification

- 实测安装与可用性：`UV_INDEX_URL=https://pypi.org/simple uv tool install ./agent-core` -> `Installed 1 executable: resumate-agent`；`which resumate-agent` -> `<uv tool 的 bin 目录>/resumate-agent`；`resumate-agent --help` 正常输出（含 `--resume`）。
- 安装前 `which resumate-agent` 为空，确认这条前提此前确实缺失。
- `archkit inspect .` -> `Quality gates passed.`
- 本次只改 `README.md` 三行区域与 issue 文档，未触碰代码与测试。

## Related ADRs

- None.

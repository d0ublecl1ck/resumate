---
id: d3f3c
status: in-progress
created_at: 2026-10-09T16:44:31.746Z
updated_at: 2026-10-09T16:44:40.298Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T16:44:40.298Z
---

# 同步 agent_turns run_id/run_error 迁移到 main，消除 alembic revision 错位

## Background

issue 4ff97（运行失败静默）的持久化落点实现已经在分支 `docs/zj-fwwb-2026` 提交：迁移
`2a17c2e1d3d3_add_agent_turn_run_error.py` 给 `agent_turns` 增加 `run_id`（varchar(64)，
可空，带索引）与 `run_error`（JSON，可空），共享 dev 库也已升级到该 revision。

但 main 工作树里没有该迁移文件，导致在 main 下执行任何 alembic 命令都报
`FAILED: Can't locate revision identified by '2a17c2e1d3d3'`，两棵树的迁移链错位。

已确认的处理方案：数据库保留不回滚，把该迁移文件同步进 main，让两棵树迁移链一致。

## Scope

- 在 main 工作树创建并启动本 Issue；
- 把 `docs/zj-fwwb-2026` 分支工作树（同级 worktree `zj-fwwb-2026`）下的
  `backend/migrations/versions/2a17c2e1d3d3_add_agent_turn_run_error.py` 原样复制到
  main 的 `backend/migrations/versions/`，文件名不变；
- 只新增这一个迁移文件，与 Issue 文档一同提交并推送 main。

## Non-goals

- 不回滚 dev 数据库，不执行 alembic downgrade；
- 不改动 `zj-fwwb-2026` 分支工作树；
- 不改动该迁移文件内容以外任何代码，不暂存既有未跟踪文件
  `ui/prototypes/editor-explorations.html`。

## Acceptance Criteria

- [x] main 下 `alembic current` 输出 `2a17c2e1d3d3 (head)`，不再报 revision 缺失；
- [x] main 下 `alembic heads` 只有一个 head；
- [x] main 下 `alembic upgrade head` 无待执行项或直接成功；
- [x] 提交只包含该迁移文件与 Issue 归档，且带唯一的 `Issue: d3f3c` trailer；
- [x] main 已推送到 origin/main 且本地与远端一致。

## Implementation

- 核对父迁移 `c4f1a9d2e6b3` 已存在于 main，目标路径
  `backend/migrations/versions/` 存在，且 main 中无任何文件引用 `2a17c2e1d3d3`；
- 原样复制该迁移文件到 main，文件名不变，复制前后 sha256 均为
  `fa842991bb7ae26acf1471bf79bcab64871d2297a4bbdec0fc73d43d6bc6d74a`；
- 未修改迁移文件内容，也未改动其它代码；数据库未回滚。

## Verification

在 `backend` 目录执行：

```console
$ .venv/bin/python -m alembic current
2a17c2e1d3d3 (head)

$ .venv/bin/python -m alembic heads
2a17c2e1d3d3 (head)

$ .venv/bin/python -m alembic upgrade head
(无输出，退出码 0)
```

三条命令均为退出码 0：`current` 与 `heads` 均指向 `2a17c2e1d3d3` 且只有一个 head，
`upgrade head` 无待执行项，revision 缺失报错消失。

已知残余：main 的 ORM `AgentTurn` 模型尚未包含这两列（实现仍留在分支），
DB 多出的可空列不影响运行，但 main 下 `alembic revision --autogenerate`
会把这些列识别为「应删除」，需等分支实现合并后消失。

## Related ADRs

- None.

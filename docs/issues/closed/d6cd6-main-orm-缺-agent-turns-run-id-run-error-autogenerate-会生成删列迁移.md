---
id: d6cd6
status: closed
created_at: 2026-10-09T16:58:34.161Z
updated_at: 2026-10-09T16:59:45.017Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T16:58:44.321Z
closed_at: 2026-10-09T16:59:45.017Z
---

# main ORM 缺 agent_turns run_id/run_error，autogenerate 会生成删列迁移

## Background

main（f4e6f07）已通过迁移 `backend/migrations/versions/2a17c2e1d3d3_add_agent_turn_run_error.py`（6383c60）把 `agent_turns.run_id` / `run_error` 两列同步进主库；本机主库实测 `agent_turns` 共 91 行，`run_error` 已写 3 行、`run_id` 已写 5 行。

但 main 的 ORM `backend/app/modules/agent/models.py` 的 `AgentTurn` 没有这两个字段（`grep -c run_error` = 0、`grep -c run_id` = 0）：字段实现仍在 `docs/zj-fwwb-2026` 分支，尚未合并进 main。

于是在 main 下跑 `alembic revision --autogenerate`，autogenerate 会以 ORM 为基准，生成「DROP COLUMN run_id / run_error」的迁移；一旦对主库 `upgrade`，已写入的这两列数据直接丢失（本机主库目前 run_id 5 行、run_error 3 行）。

## Scope

- 在项目根 `.freak` 末尾追加一条未完成线索，登记现象（main 的 ORM 无 run_id/run_error）、风险（autogenerate 会生成删列迁移）、原因（实现仍在 `docs/zj-fwwb-2026` 分支未合并）与解除条件（该分支合并进 main 后此线索作废）。
- 按仓库流程建单、提交线索并归档，绑定归档提交。

## Non-goals

- 不改任何代码、迁移或测试；本轮不在 main 落 `run_id` / `run_error` 的 ORM 字段。
- 不合并 `docs/zj-fwwb-2026` 分支。
- 不动既有未跟踪文件 `ui/prototypes/editor-explorations.html`。

## Acceptance Criteria

- [x] `.freak` 新增线索包含现象、风险、原因、解除条件四要素与记录日期。
- [x] 线索以单个 `Issue: d6cd6` trailer 的提交落库；随后归档提交带 `Issue` + `Closes`，`archkit issue close d6cd6` 验证绑定。
- [x] `node quality-gates/run.js` 与 `archkit inspect .` 通过。
- [x] `git push origin main` 成功，且 `HEAD` 与 `origin/main` 一致。

## Implementation

- `.freak` 末尾新增一条未完成线索（记录：2026-10-10）：现象 = main 的 ORM `AgentTurn` 无 `run_id` / `run_error`（实测 `grep -c` 均为 0），而库中该两列已有数据（`agent_turns` 91 行，run_id 5 行、run_error 3 行）；风险 = 在 main 跑 `alembic revision --autogenerate` 会生成 DROP 这两列的迁移；原因 = ORM 实现在 `docs/zj-fwwb-2026` 分支（cd5944f 等）未合并，main 只同步了迁移文件（6383c60）；解除条件 = 该分支合并进 main 后本线索作废。
- 未改任何代码、迁移或测试，未动 `ui/prototypes/editor-explorations.html`。线索提交：`1aad943 docs(freak): 登记 main ORM 缺 run_id/run_error 的删列迁移风险`（单个 `Issue: d6cd6` trailer）。

## Verification

```
node quality-gates/run.js   -> Quality gates passed. (exit 0)
archkit inspect .           -> Quality gates passed. (exit 0)
```

- 线索提交：`1aad943 docs(freak): 登记 main ORM 缺 run_id/run_error 的删列迁移风险`，暂存仅 `.freak` 与本 issue 文档，单个 `Issue: d6cd6` trailer。
- 归档：`archkit issue close d6cd6 --base f4e6f0709949500b9a207105b45e5cfc54ae7f47 --prepare` → 归档提交（rename + status/closed_at）携带 `Issue: d6cd6` + `Closes: d6cd6`；随后 `archkit issue close d6cd6` 输出 `Issue d6cd6 already closed; bound to commit …`。
- 推送：`git push origin main` 成功后 `git rev-parse HEAD origin/main` 一致。

## Related ADRs

- None.

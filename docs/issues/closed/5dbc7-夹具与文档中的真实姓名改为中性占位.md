---
id: "5dbc7"
status: closed
created_at: 2026-10-10T01:50:00.000Z
updated_at: 2026-10-10T01:52:00.000Z
started_at: 2026-10-10T01:50:00.000Z
closed_at: 2026-10-10T01:52:00.000Z
priority: medium
labels: []
parent: null
blocked_by: []
---

# 夹具与文档中的真实姓名改为中性占位

## Background

测试夹具、mock 数据与部分文档里写有真实姓名（本机测试与文档夹具，另见评测与工单记录）。公开仓库与参赛材料采用匿名口径，姓名属于身份线索。

## Scope

- 两个真实中文姓名分别改为示例用户与示例同学（含叠字变体）。
- 拼音形态 zhangmu -> ExampleMate；github.com/zhangmu 作为第三方 mock URL 保留不动。
- 覆盖 backend/tests、agent-core/tests、ui/src 测试与 mock、ui/prototypes/index.html、docs/design.md、docs/evaluation/、docs/issues/closed/{4ff97,85294,91eeb,e8163}.md。
- 同步更新 backend/tests/test_resume.py 里 URL 编码的断言（由旧姓名派生），改为示例同学的编码。

## Non-goals

- 不改业务逻辑、断言结构或接口。
- 不动 github.com/zhangmu 第三方 mock URL。
- 不改竞赛材料。

## Acceptance Criteria

- [x] git grep 两个真实姓名与拼音形态零命中。
- [x] github.com/zhangmu 按约定保留。
- [x] backend pytest 583 passed；agent-core 130 passed；ui 649 passed；tsc 0 error；门禁通过。

## Implementation

- 用一次性脚本按 git ls-files 遍历跟踪文本文件，做字符串替换（先保护 github.com/zhangmu，替换后还原）。
- 叠字变体先于基名替换，避免留下半截字；URL 编码断言改为示例同学的编码。

## Verification

- cd backend && TEST_DATABASE_URL=postgresql+psycopg://localhost:5432/resumate_test_rename .venv/bin/python -m pytest -q -> 583 passed。
- cd agent-core && uv run pytest -q -> 130 passed。
- cd ui && pnpm test -> 81 files / 649 tests passed。
- cd ui && pnpm exec tsc -b --noEmit -> 0 error。
- node quality-gates/run.js 与 archkit inspect . -> Quality gates passed。

## Related ADRs

- None.

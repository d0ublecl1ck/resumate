---
id: 49aca
status: in-progress
created_at: 2026-10-09T09:51:18.972Z
updated_at: 2026-10-09T09:51:27.564Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: A11 面试与能力提升
started_at: 2026-10-09T09:51:27.564Z
---

# 评分一致性抽检：可复现脚本、人工复核规程与留档产物

## Background

S3 核心内容展示第 11 页对外承诺「评分一致性由人工抽检复核，抽检结果与量表版本一起留档」，
S2 把「评分一致性抽检」列为开发前待冻结决策（抽样比例与一致性判定口径均未定）。
仓库当前没有抽检脚本、没有抽样样本、没有留档产物，承诺与实现不一致。

## Scope

- 新增 `backend/scripts/audit_rubric_consistency.py`：对已结束报告按比例分层抽样，复用 interview 模块
  现有评分 prompt 与口径（`_REPORT_SYSTEM` / `_report_user_prompt` / `_coerce_scores` / `llm.chat_json`）
  重新评分，逐维比较原分与复评分，输出人可读 `.md` 与机器可读 `.json` 留档产物。
- 新增 `docs/evaluation/rubric-consistency-procedure.md`：冻结抽样方法、判定阈值与依据、人工复核清单、
  偏差处置与留档命名规范。
- 新增 `backend/tests/test_rubric_consistency.py`：覆盖抽样、差值计算、判定边界与产物写入，模型调用用
  `httpx.MockTransport` 桩掉，不打真实网络。
- 用真实数据库真实跑一次，把真实数字写进留档产物。

## Non-goals

- 不修改 `backend/app/modules/**` 的任何实现，评分逻辑只读复用。
- 不改 `ui/**` 与 `docs/competition/**`（换图与文案由 Lead 统一处理）。

## Acceptance Criteria

- [x] `backend/scripts/audit_rubric_consistency.py` 支持 `--sample-ratio` / `--sample-size` / `--dry-run` /
  `--force`，可重跑且未加 `--force` 时不覆盖已有留档。
- [x] 脚本复用 interview 模块同一份评分 prompt 与口径，不新建第二套评分标准。
- [x] 产物 `docs/evaluation/rubric-consistency-<date>.md` 与同名 `.json` 落盘，含抽样表、逐维偏差、
  平均绝对偏差、最大偏差、完全一致率、±5 分内一致率、判定结论与复现命令。
- [x] `docs/evaluation/rubric-consistency-procedure.md` 冻结抽样方法、判定阈值与依据、人工复核项与偏差处置。
- [x] `backend/.venv/bin/python -m pytest tests/test_rubric_consistency.py -q` 全绿。
- [x] 真实跑一次抽检并留档，报告样本量、逐维平均绝对偏差、最大偏差、一致率与是否通过。
- [x] `docs/evaluation/**` 不含绝对家目录路径。
- [x] `node quality-gates/run.js` 与 `archkit inspect .` 通过。

## Implementation

- 新增 backend/scripts/audit_rubric_consistency.py：按「rubric_version × role」分层随机抽样，
  --sample-ratio / --sample-size / --seed / --dry-run / --force 全部参数化；复用 interview 模块的
  _REPORT_SYSTEM、_report_user_prompt、_coerce_scores 与 llm.chat_json 做复评，不新建评分标准。
- 输出 docs/evaluation/rubric-consistency-<date>.md 与同名 .json；md 含抽样表、逐维偏差、逐样本对照、
  人工复核记录表、判定依据、结论、复现命令，json 含逐样本原分/复评分/逐维差值与复评证据原文。
- 题目按最小列（id/ordinal/prompt/reference_points）加载，兼容题目表尚未迁移 difficulty/knowledge_refs
  新列的历史数据库；单场复评失败时回滚事务并继续，不中断整轮。
- 幂等：留档按输入指纹（样本、量表、prompt 指纹、阈值、模型、seed、比例）判重，输入未变直接跳过；
  输入变化且未加 --force 时报错，不覆盖已有留档。
- 新增 docs/evaluation/rubric-consistency-procedure.md，冻结抽样比例（总体不超过 30 全抽，超过 30 抽 20%
  且每层至少 1 份、整轮不少于 5 份）、判定阈值、人工复核五项、偏差处置与留档命名。
- 新增 backend/tests/test_rubric_consistency.py，17 例。
- 真实跑一轮并留档：docs/evaluation/rubric-consistency-2026-10-09.md 与 .json。

## Verification

- 单测：cd backend && .venv/bin/python -m pytest tests/test_rubric_consistency.py -q ->
  17 passed（模型用 httpx.MockTransport 桩掉，不打真实网络）。
- 真实抽检：cd backend && .venv/bin/python -m scripts.audit_rubric_consistency --sample-ratio 1.0 ->
  总体 5、样本 5（Java 后端 4 / 资深后端工程师 1），全部 scored；
  四维合并平均绝对偏差 3.45，单点最大偏差 14（ivs_814176d3982c correctness 84 到 70），
  完全一致率 20%，±5 分内一致率 90%，verdict=fail（单点最大偏差 14 超过 10）。
- 幂等：同一命令再跑一次 -> status=unchanged，未重复调用模型。
- 门禁：node quality-gates/run.js -> Quality gates passed；archkit inspect . -> Quality gates passed。
- 隐私：grep -rn "/Users/" docs/evaluation 无命中（测试文件里仅有一处断言字符串，不含真实路径）。
- 未完成：人工复核记录表（md 内）与 json 的 manual_review 字段为 pending，需指定抽检人在复核后回填；
  本轮 verdict=fail 的根因初判为最短场次（3 轮问答）上的模型波动，处置待人工复核确认。

## Related ADRs

- None.

"""评分一致性抽检：对真实已结束报告按比例分层抽样，复用同一份量表重新评分并留档。

这一脚本把 S3 第 11 页「评分一致性由人工抽检复核，抽检结果与量表版本一起留档」的
承诺落成可复现的产物：

- 从 interview_sessions 中取已结束（completed）且有报告的真实场次，按「量表版本 ×
  岗位」分层随机抽样；抽样比例、样本量与随机种子都是参数。
- 对每个抽中样本，用 interview 模块当前的评分 prompt 与收敛口径重新跑一遍评分
  （直接复用 _REPORT_SYSTEM / _report_user_prompt / _coerce_scores / llm.chat_json，
  不新建第二套评分标准），逐维比较原分与复评分。
- 输出人可读的 docs/evaluation/rubric-consistency-<date>.md 与机器可读的同名
  .json；留档里带量表版本、评分 prompt 指纹、抽样口径、判定阈值与复现命令。

用法（在 backend 目录下执行）：

    .venv/bin/python -m scripts.audit_rubric_consistency --dry-run
    .venv/bin/python -m scripts.audit_rubric_consistency --sample-ratio 1.0
    .venv/bin/python -m scripts.audit_rubric_consistency --sample-size 5 --force

幂等：同一天、同一批输入（样本、量表、prompt、阈值、模型）的留档已存在时直接跳过，
不会重复调用模型、也不会覆盖已有文件；输入变了但文件已存在时默认报错，需要显式
--force 才重写。人工复核的操作规程见 docs/evaluation/rubric-consistency-procedure.md。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import httpx  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.modules.interview import dao as interview_dao  # noqa: E402
from app.modules.interview import llm as interview_llm  # noqa: E402
from app.modules.interview import service as interview_service  # noqa: E402
from app.modules.interview.models import (  # noqa: E402
    InterviewQuestion,
    InterviewReport,
    InterviewSession,
)
from app.modules.settings import dao as settings_dao  # noqa: E402

# 只读复用 interview 模块的评分口径；这里 import 私有名是有意的，避免出现第二套评分标准。
REPORT_SYSTEM = interview_service._REPORT_SYSTEM  # noqa: SLF001
report_user_prompt = interview_service._report_user_prompt  # noqa: SLF001
coerce_scores = interview_service._coerce_scores  # noqa: SLF001
normalise_scores = interview_service._normalise_scores  # noqa: SLF001
CONTENT_DIMENSIONS = interview_service.CONTENT_DIMENSIONS
CANONICAL_RUBRIC_VERSION = interview_service.RUBRIC_VERSION

SCHEMA = "rubric-consistency/v1"
REPO_ROOT = BACKEND_DIR.parent
DEFAULT_OUTPUT_DIR = REPO_ROOT / "docs" / "evaluation"
DEFAULT_RATIO = 1.0
DEFAULT_SEED = 20261009
DEFAULT_RUBRIC_VERSION = CANONICAL_RUBRIC_VERSION
# 与 finish_session 生成报告时一致的预算，避免推理型模型把 JSON 截断。
REPORT_MAX_TOKENS = 8000
# 抽检复评的读超时：单份 9-20 轮问答的报告比 30s 的探测超时更长，给足预算。
DEFAULT_READ_TIMEOUT_SECONDS = 180.0
# 判定阈值：四维合并平均绝对偏差与单点最大偏差的允许上限，以及可比较维度覆盖率下限。
MEAN_ABS_DIFF_LIMIT = 5.0
MAX_ABS_DIFF_LIMIT = 10
MIN_COMPARABLE_COVERAGE = 0.8
AGREEMENT_TOLERANCE = 5


class ArtifactExistsError(RuntimeError):
    """目标留档已存在且调用方没有要求覆盖。"""


class AuditError(RuntimeError):
    """抽检无法产出有效留档（例如所有样本复评都失败）。"""


@dataclass(frozen=True)
class Candidate:
    """一个已结束、有报告且可复评的真实场次。"""

    session_id: str
    report_id: str
    owner_id: str
    role: str
    rubric_version: str
    created_at: datetime


@dataclass(frozen=True)
class QuestionView:
    """评分 prompt 只需要题号、题干与要点，用最小列加载以兼容历史 schema。"""

    id: str
    ordinal: int
    prompt: str
    reference_points: list[str]


@dataclass(frozen=True)
class VerdictRule:
    """判定标准；默认值即 docs/evaluation/rubric-consistency-procedure.md 冻结的口径。"""

    mean_abs_diff_limit: float = MEAN_ABS_DIFF_LIMIT
    max_abs_diff_limit: int = MAX_ABS_DIFF_LIMIT
    min_coverage: float = MIN_COMPARABLE_COVERAGE
    agreement_tolerance: int = AGREEMENT_TOLERANCE

    def as_dict(self) -> dict[str, Any]:
        return {
            "mean_abs_diff_limit": self.mean_abs_diff_limit,
            "max_abs_diff_limit": self.max_abs_diff_limit,
            "min_coverage": self.min_coverage,
            "agreement_tolerance": self.agreement_tolerance,
        }


DEFAULT_RULE = VerdictRule()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _local_date() -> str:
    return datetime.now().astimezone().date().isoformat()


def scoring_prompt_sha256() -> str:
    """评分 prompt 的指纹，用于发现口径漂移。"""
    return "sha256:" + hashlib.sha256(REPORT_SYSTEM.encode("utf-8")).hexdigest()


def _sha256(payload: Any) -> str:
    text = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------- #
# 抽样与差值
# --------------------------------------------------------------------------- #


def select_sample(
    candidates: list[Candidate],
    *,
    ratio: float = DEFAULT_RATIO,
    seed: int = DEFAULT_SEED,
    sample_size: int | None = None,
) -> list[Candidate]:
    """按「量表版本 × 岗位」分层随机抽样。

    - ratio 是总体抽样比例，比例分配采用最大余数法，层内用固定 seed 随机抽取，
      因此同一批输入与同一 seed 的结果可复现。
    - sample_size 给定时直接覆盖比例，作为样本量上限（不会超过总体）。
    """
    if not isinstance(ratio, (int, float)) or ratio <= 0 or ratio > 1:
        raise ValueError("ratio 必须在 (0, 1] 区间内")
    if sample_size is not None and sample_size < 1:
        raise ValueError("sample_size 必须 >= 1")
    total = len(candidates)
    if total == 0:
        return []
    if sample_size is not None:
        target = min(int(sample_size), total)
    else:
        target = max(1, min(total, int(math.floor(total * ratio + 0.5))))

    groups: dict[tuple[str, str], list[Candidate]] = defaultdict(list)
    for candidate in candidates:
        groups[(candidate.rubric_version, candidate.role)].append(candidate)

    quotas = {key: target * len(items) / total for key, items in groups.items()}
    allocated = {key: min(len(groups[key]), int(math.floor(value))) for key, value in quotas.items()}
    assigned = sum(allocated.values())
    order = sorted(groups, key=lambda key: (-(quotas[key] - allocated[key]), key))
    while assigned < target:
        progressed = False
        for key in order:
            if assigned >= target:
                break
            if allocated[key] < len(groups[key]):
                allocated[key] += 1
                assigned += 1
                progressed = True
        if not progressed:
            break

    rng = random.Random(seed)
    selected: list[Candidate] = []
    for key in sorted(groups):
        items = sorted(groups[key], key=lambda candidate: (candidate.created_at, candidate.session_id))
        selected.extend(rng.sample(items, allocated[key]))
    return selected


def compare_scores(
    original: dict[str, int | None],
    rescore: dict[str, int | None],
    *,
    dimensions: tuple[str, ...] = CONTENT_DIMENSIONS,
) -> list[dict[str, Any]]:
    """逐维比较原分与复评分；任一侧为 null（证据不足）时记不可比较。"""
    comparisons: list[dict[str, Any]] = []
    for dimension in dimensions:
        before = original.get(dimension)
        after = rescore.get(dimension)
        comparable = before is not None and after is not None
        comparisons.append(
            {
                "dimension": dimension,
                "original": before,
                "rescore": after,
                "diff": (after - before) if comparable else None,
                "comparable": comparable,
            }
        )
    return comparisons


def _stats(diffs: list[int], *, tolerance: int = AGREEMENT_TOLERANCE) -> dict[str, Any]:
    if not diffs:
        return {
            "n": 0,
            "mean_abs_diff": None,
            "max_abs_diff": None,
            "exact_agreement_rate": None,
            "within_5_rate": None,
        }
    absolutes = [abs(diff) for diff in diffs]
    return {
        "n": len(diffs),
        "mean_abs_diff": round(sum(absolutes) / len(absolutes), 4),
        "max_abs_diff": max(absolutes),
        "exact_agreement_rate": round(sum(1 for diff in diffs if diff == 0) / len(diffs), 4),
        "within_5_rate": round(sum(1 for value in absolutes if value <= tolerance) / len(diffs), 4),
    }


def summarise(
    comparisons: list[dict[str, Any]],
    *,
    rule: VerdictRule = DEFAULT_RULE,
) -> dict[str, Any]:
    """汇总逐维偏差并按冻结规则给出通过 / 不通过 / 无法判定。"""
    by_dimension: dict[str, list[int]] = {dimension: [] for dimension in CONTENT_DIMENSIONS}
    pooled: list[int] = []
    comparable = 0
    for item in comparisons:
        if not item.get("comparable"):
            continue
        diff = item.get("diff")
        if diff is None:
            continue
        comparable += 1
        pooled.append(diff)
        dimension = item.get("dimension")
        if dimension in by_dimension:
            by_dimension[dimension].append(diff)

    total = len(comparisons)
    coverage = (comparable / total) if total else 0.0
    reasons: list[str] = []
    if total == 0:
        verdict = "inconclusive"
        reasons.append("没有可比较的维度样本")
    elif coverage < rule.min_coverage:
        verdict = "inconclusive"
        reasons.append(f"可比较维度覆盖率 {coverage:.0%} 低于 {rule.min_coverage:.0%}")
    else:
        pooled_stats = _stats(pooled, tolerance=rule.agreement_tolerance)
        mean_ok = pooled_stats["mean_abs_diff"] is not None and pooled_stats["mean_abs_diff"] <= rule.mean_abs_diff_limit
        max_ok = pooled_stats["max_abs_diff"] is not None and pooled_stats["max_abs_diff"] <= rule.max_abs_diff_limit
        verdict = "pass" if (mean_ok and max_ok) else "fail"
        if not mean_ok:
            reasons.append(
                f"四维平均绝对偏差 {pooled_stats['mean_abs_diff']} 超过 {rule.mean_abs_diff_limit}"
            )
        if not max_ok:
            reasons.append(f"单点最大偏差 {pooled_stats['max_abs_diff']} 超过 {rule.max_abs_diff_limit}")
        if verdict == "pass":
            reasons.append("四维平均绝对偏差与单点最大偏差都在阈值内")

    return {
        "comparable": comparable,
        "total": total,
        "coverage": round(coverage, 4),
        "by_dimension": {
            dimension: _stats(values, tolerance=rule.agreement_tolerance)
            for dimension, values in by_dimension.items()
        },
        "pooled": _stats(pooled, tolerance=rule.agreement_tolerance),
        "verdict": verdict,
        "reasons": reasons,
        "rule": rule.as_dict(),
    }


# --------------------------------------------------------------------------- #
# 数据库读取与复评
# --------------------------------------------------------------------------- #


def load_candidates(
    db: Session,
    *,
    rubric_version: str = DEFAULT_RUBRIC_VERSION,
) -> tuple[list[Candidate], list[dict[str, str]]]:
    """取已结束、有报告且有作答的真实场次；量表版本不一致或没有作答的记为 skipped。"""
    statement = (
        select(InterviewSession, InterviewReport)
        .join(InterviewReport, InterviewReport.session_id == InterviewSession.id)
        .where(InterviewSession.status == "completed")
        .order_by(InterviewSession.created_at.asc(), InterviewSession.id.asc())
    )
    candidates: list[Candidate] = []
    skipped: list[dict[str, str]] = []
    for session, report in db.execute(statement).all():
        if not interview_dao.list_answers(db, session.id):
            skipped.append(
                {"session_id": session.id, "report_id": report.id, "reason": "没有作答记录，无法复评"}
            )
            continue
        if report.rubric_version != rubric_version:
            skipped.append(
                {
                    "session_id": session.id,
                    "report_id": report.id,
                    "reason": f"量表版本 {report.rubric_version} 与抽检量表 {rubric_version} 不一致",
                }
            )
            continue
        candidates.append(
            Candidate(
                session_id=session.id,
                report_id=report.id,
                owner_id=session.owner_id,
                role=session.role,
                rubric_version=report.rubric_version,
                created_at=session.created_at,
            )
        )
    return candidates, skipped


def _report_score_map(db: Session, session_id: str) -> dict[str, int | None]:
    report = interview_dao.get_report(db, session_id)
    if report is None:
        return {}
    return {score.dimension: score.score for score in normalise_scores(report.content_scores)}


def _question_views(db: Session, session_id: str) -> list[QuestionView]:
    """按最小列加载题目：只取评分 prompt 实际用到的题号、题干与要点。

    这样脚本既能跑在当前代码库上，也能跑在题目表还没有 difficulty / knowledge_refs
    等新列的历史数据库上；_report_user_prompt 的输入不会因此变化。
    """
    table = InterviewQuestion.__table__
    statement = (
        select(table.c.id, table.c.ordinal, table.c.prompt, table.c.reference_points)
        .where(table.c.session_id == session_id)
        .order_by(table.c.ordinal)
    )
    return [
        QuestionView(
            id=row.id,
            ordinal=row.ordinal,
            prompt=row.prompt,
            reference_points=list(row.reference_points or []),
        )
        for row in db.execute(statement)
    ]


def rescore_session(
    db: Session,
    session: InterviewSession,
    *,
    client: httpx.Client | None = None,
    max_tokens: int = REPORT_MAX_TOKENS,
) -> tuple[dict[str, int | None], dict[str, list[str]]]:
    """用 interview 模块同一份评分 prompt 与收敛口径对一场已结束面试重新评分。"""
    questions = _question_views(db, session.id)
    answers = {answer.question_id: answer for answer in interview_dao.list_answers(db, session.id)}
    pairs = [(question, answers[question.id]) for question in questions if question.id in answers]
    if not pairs:
        raise AuditError(f"会话 {session.id} 没有可复评的问答")
    data = interview_llm.chat_json(
        db,
        session.owner_id,
        system_prompt=REPORT_SYSTEM,
        user_prompt=report_user_prompt(session, pairs),
        max_tokens=max_tokens,
        client=client,
    )
    scores = coerce_scores(
        data.get("contentScores") or data.get("content_scores"),
        [answer.content for _, answer in pairs],
    )
    return (
        {score.dimension: score.score for score in scores},
        {score.dimension: score.evidence for score in scores},
    )


def _model_label(db: Session, owner_id: str) -> dict[str, str]:
    row = settings_dao.get_by_owner(db, owner_id)
    config = (row.model_config if row is not None else {}) or {}
    endpoint = str(config.get("endpoint") or "")
    return {
        "provider": str(config.get("provider") or ""),
        "model": str(config.get("model") or ""),
        "endpoint_host": urlparse(endpoint).netloc if endpoint else "",
    }


# --------------------------------------------------------------------------- #
# 产物渲染与写入
# --------------------------------------------------------------------------- #


def _fmt(value: Any, digits: int = 2) -> str:
    if value is None:
        return "-"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def _fmt_rate(value: Any) -> str:
    if value is None:
        return "-"
    return f"{value * 100:.0f}%"


def _strata_summary(
    candidates: list[Candidate],
    selected: list[Candidate],
) -> list[dict[str, Any]]:
    population: dict[tuple[str, str], int] = defaultdict(int)
    chosen: dict[tuple[str, str], int] = defaultdict(int)
    for candidate in candidates:
        population[(candidate.rubric_version, candidate.role)] += 1
    for candidate in selected:
        chosen[(candidate.rubric_version, candidate.role)] += 1
    return [
        {
            "rubric_version": key[0],
            "role": key[1],
            "population": population[key],
            "selected": chosen.get(key, 0),
        }
        for key in sorted(population)
    ]


def _score_cell(sample: dict[str, Any], dimension: str) -> str:
    original = (sample.get("original") or {}).get(dimension)
    rescore = (sample.get("rescore") or {}).get(dimension)
    diff = next(
        (item["diff"] for item in sample.get("comparisons", []) if item["dimension"] == dimension),
        None,
    )
    diff_text = "-" if diff is None else f"{diff:+d}"
    return f"{_fmt(original)} / {_fmt(rescore)} / {diff_text}"


def _reproduction_command(
    *,
    ratio: float,
    seed: int,
    sample_size: int | None,
    rubric_version: str,
    date: str,
) -> str:
    parts = ["cd backend && .venv/bin/python -m scripts.audit_rubric_consistency"]
    parts.append(f"--sample-ratio {ratio}")
    if sample_size is not None:
        parts.append(f"--sample-size {sample_size}")
    parts.append(f"--seed {seed}")
    if rubric_version != DEFAULT_RUBRIC_VERSION:
        parts.append(f"--rubric-version {rubric_version}")
    parts.append(f"--date {date}")
    return " ".join(parts)


def render_markdown(doc: dict[str, Any]) -> str:
    """把人可读的抽样表、逐维偏差、结论与复现命令渲染成 Markdown。"""
    summary = doc["summary"]
    sampling = doc["sampling"]
    rule = doc["rule"]
    verdict_label = {"pass": "通过", "fail": "不通过", "inconclusive": "无法判定"}.get(
        summary["verdict"], summary["verdict"]
    )
    lines: list[str] = [
        f"# 评分一致性抽检留档（{doc['date']}）",
        "",
        f"- 量表版本：{doc['rubric_version']}",
        f"- 评分 prompt 指纹：{doc['scoring_prompt_sha256']}",
        f"- 生成时间：{doc['generated_at']}",
        f"- 复评模型：{doc['model']['provider']} / {doc['model']['model']}"
        f"（endpoint host：{doc['model']['endpoint_host'] or '-'}）",
        f"- 抽样：{sampling['method']}，比例 {sampling['ratio']}，seed {sampling['seed']}，"
        f"总体 {sampling['population']}，样本 {sampling['selected']}",
        "- 判定口径：四维合并平均绝对偏差 ≤ "
        f"{rule['mean_abs_diff_limit']} 且单点最大偏差 ≤ {rule['max_abs_diff_limit']}，"
        f"可比较维度覆盖率 ≥ {rule['min_coverage']}",
        f"- 结论：**{verdict_label}**（{summary['verdict']}）",
        "",
        "## 抽样表",
        "",
        "| 量表版本 | 岗位 | 总体 | 抽中 |",
        "| --- | --- | ---: | ---: |",
    ]
    for stratum in sampling["strata"]:
        lines.append(
            f"| {stratum['rubric_version']} | {stratum['role']} | "
            f"{stratum['population']} | {stratum['selected']} |"
        )
    lines.extend(
        [
            "",
            "### 抽样明细",
            "",
            "| 会话 | 报告 | 岗位 | 量表 | 作答数 | 状态 |",
            "| --- | --- | --- | --- | ---: | --- |",
        ]
    )
    for sample in doc["samples"]:
        lines.append(
            f"| {sample['session_id']} | {sample['report_id']} | {sample['role']} | "
            f"{sample['rubric_version']} | {sample.get('answer_count', '-')} | {sample['status']} |"
        )
    if sampling.get("skipped"):
        lines.extend(["", "被排除的场次：", ""])
        for item in sampling["skipped"]:
            lines.append(f"- {item['session_id']}：{item['reason']}")

    lines.extend(
        [
            "",
            "## 逐维偏差",
            "",
            "| 维度 | 可比样本 n | 平均绝对偏差 | 最大偏差 | 完全一致率 | ±5 分内一致率 |",
            "| --- | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    dimension_labels = {
        "correctness": "correctness（内容正确性）",
        "depth": "depth（深度）",
        "rigor": "rigor（严谨性）",
        "fit": "fit（岗位匹配度）",
    }
    for dimension in CONTENT_DIMENSIONS:
        stats = summary["by_dimension"].get(dimension, _stats([]))
        lines.append(
            f"| {dimension_labels.get(dimension, dimension)} | {stats['n']} | "
            f"{_fmt(stats['mean_abs_diff'])} | {_fmt(stats['max_abs_diff'])} | "
            f"{_fmt_rate(stats['exact_agreement_rate'])} | {_fmt_rate(stats['within_5_rate'])} |"
        )
    pooled = summary["pooled"]
    lines.append(
        f"| **四维合并** | {pooled['n']} | {_fmt(pooled['mean_abs_diff'])} | "
        f"{_fmt(pooled['max_abs_diff'])} | {_fmt_rate(pooled['exact_agreement_rate'])} | "
        f"{_fmt_rate(pooled['within_5_rate'])} |"
    )

    lines.extend(
        [
            "",
            "## 逐样本分数对照",
            "",
            "单元格格式为「原分 / 复评分 / 差值（复评 − 原分）」；差值 - 表示有一侧证据不足、不可比较。",
            "",
            "| 会话 | 岗位 | correctness | depth | rigor | fit | 状态 |",
            "| --- | --- | ---: | ---: | ---: | ---: | --- |",
        ]
    )
    for sample in doc["samples"]:
        lines.append(
            f"| {sample['session_id']} | {sample['role']} | "
            f"{_score_cell(sample, 'correctness')} | {_score_cell(sample, 'depth')} | "
            f"{_score_cell(sample, 'rigor')} | {_score_cell(sample, 'fit')} | {sample['status']} |"
        )
        if sample.get("error"):
            lines.append(f"|  |  |  |  |  |  | {sample['error']} |")

    lines.extend(
        [
            "",
            "## 人工复核记录",
            "",
            "抽检人按 docs/evaluation/rubric-consistency-procedure.md 逐样本核对四维分数与证据，"
            "并逐行补全下表；复核记录与本次结果一并留档。",
            "",
            "| 会话 | 复核人 | 复核日期 | 证据是否原话 | 分数是否与证据一致 | 处置 |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
    )
    for sample in doc["samples"]:
        lines.append(f"| {sample['session_id']} |  |  |  |  |  |")

    lines.extend(
        [
            "",
            "## 判定口径与依据",
            "",
            f"- 评分是 0–100 的整数，四维用于导出「平均分」与「薄弱维度（低于 "
            f"{interview_service.PRACTICE_WEAK_THRESHOLD}）」两类对外结论。",
            "- 平均绝对偏差上限取 5 分（满分 5%）：平均意义上的漂移不超过半个等级档，"
            "不会把「是否薄弱」的结论整体推过边界。",
            "- 单点最大偏差上限取 10 分（满分 10%）：允许个别维度有真实抖动，但拒绝大偏移。",
            "- 不要求完全一致：模型评分天然有浮动，把 0 偏差当硬门槛会把正常采样噪声误判为失败；"
            "完全一致率与 ±5 分内一致率作为稳定性旁证一并报告。",
            "",
            "## 结论",
            "",
            f"本次抽检结论为 **{verdict_label}**（{summary['verdict']}）。",
            "",
        ]
    )
    for reason in summary["reasons"]:
        lines.append(f"- {reason}")
    lines.extend(
        [
            "",
            "## 复现命令",
            "",
            "    " + doc["reproduction_command"],
            "",
            "## 已知边界",
            "",
            "- 同一模型自评：复评与初评使用同一 provider / model 与 temperature=0，"
            "只能证明口径稳定，不能替代跨模型或人工盲评。",
            "- 样本量：当前抽中样本有限，结论只覆盖本轮抽中的场次；层内样本过少时"
            "结论标记为无法判定。",
            "- 机器可读的逐条证据原文在同名 .json 的 samples[].rescore_evidence 字段，"
            "本页只保留汇总数字。",
            "",
        ]
    )
    return "\n".join(lines)


def write_artifacts(
    doc: dict[str, Any],
    out_dir: Path | str,
    *,
    force: bool = False,
    dry_run: bool = False,
) -> dict[str, Any]:
    """写 .md / .json 留档；已存在且未加 force 时报错，dry-run 不落盘。"""
    directory = Path(out_dir)
    md_path = directory / f"rubric-consistency-{doc['date']}.md"
    json_path = directory / f"rubric-consistency-{doc['date']}.json"
    if dry_run:
        return {"status": "dry-run", "md_path": str(md_path), "json_path": str(json_path)}
    if (md_path.exists() or json_path.exists()) and not force:
        raise ArtifactExistsError(
            f"留档已存在：{md_path.name} / {json_path.name}；如需重写请加 --force"
        )
    directory.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(doc), encoding="utf-8")
    return {"status": "written", "md_path": str(md_path), "json_path": str(json_path)}


# --------------------------------------------------------------------------- #
# 编排
# --------------------------------------------------------------------------- #


def _input_digest(
    *,
    rubric_version: str,
    candidates: list[Candidate],
    rule: VerdictRule,
    seed: int,
    ratio: float,
    model_label: dict[str, str],
) -> str:
    payload = {
        "rubric_version": rubric_version,
        "scoring_prompt_sha256": scoring_prompt_sha256(),
        "rule": rule.as_dict(),
        "seed": seed,
        "ratio": ratio,
        "model": model_label,
        "sample": [
            {
                "session_id": candidate.session_id,
                "report_id": candidate.report_id,
                "created_at": candidate.created_at.isoformat(),
            }
            for candidate in sorted(candidates, key=lambda item: item.session_id)
        ],
    }
    return _sha256(payload)


def run_audit(
    db: Session,
    *,
    out_dir: Path | str = DEFAULT_OUTPUT_DIR,
    ratio: float = DEFAULT_RATIO,
    seed: int = DEFAULT_SEED,
    sample_size: int | None = None,
    rubric_version: str = DEFAULT_RUBRIC_VERSION,
    client: httpx.Client | None = None,
    force: bool = False,
    dry_run: bool = False,
    date: str | None = None,
    rule: VerdictRule = DEFAULT_RULE,
    max_tokens: int = REPORT_MAX_TOKENS,
    log: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """执行一轮抽检；返回含 status 的摘要，status=written 表示已落盘。"""
    log = log or (lambda _message: None)
    population, skipped = load_candidates(db, rubric_version=rubric_version)
    selected = select_sample(population, ratio=ratio, seed=seed, sample_size=sample_size)
    selected.sort(key=lambda candidate: (candidate.created_at, candidate.session_id))
    model_label = (
        _model_label(db, selected[0].owner_id)
        if selected
        else {"provider": "", "model": "", "endpoint_host": ""}
    )
    sampling: dict[str, Any] = {
        "method": "stratified-random",
        "ratio": ratio,
        "seed": seed,
        "sample_size_override": sample_size,
        "population": len(population),
        "selected": len(selected),
        "strata": _strata_summary(population, selected),
        "skipped": skipped,
    }
    digest = _input_digest(
        rubric_version=rubric_version,
        candidates=selected,
        rule=rule,
        seed=seed,
        ratio=ratio,
        model_label=model_label,
    )
    run_date = date or _local_date()
    directory = Path(out_dir)
    md_path = directory / f"rubric-consistency-{run_date}.md"
    json_path = directory / f"rubric-consistency-{run_date}.json"

    if not dry_run and not force and json_path.exists():
        existing = json.loads(json_path.read_text(encoding="utf-8"))
        if existing.get("schema") == SCHEMA and existing.get("input_digest") == digest:
            log("输入与已有留档一致，跳过复评")
            return {
                "status": "unchanged",
                "md_path": str(md_path),
                "json_path": str(json_path),
                "summary": existing.get("summary"),
                "sampling": existing.get("sampling"),
            }
        raise ArtifactExistsError(
            f"同名留档已存在且输入不同：{json_path.name}；如需重写请加 --force 或换 --date"
        )

    if dry_run:
        return {
            "status": "dry-run",
            "md_path": str(md_path),
            "json_path": str(json_path),
            "input_digest": digest,
            "rubric_version": rubric_version,
            "model": model_label,
            "rule": rule.as_dict(),
            "sampling": sampling,
        }

    samples: list[dict[str, Any]] = []
    for candidate in selected:
        log(f"复评 {candidate.session_id}（{candidate.role}）")
        session = db.get(InterviewSession, candidate.session_id)
        sample: dict[str, Any] = {
            "session_id": candidate.session_id,
            "report_id": candidate.report_id,
            "role": candidate.role,
            "rubric_version": candidate.rubric_version,
            "created_at": candidate.created_at.isoformat(),
            "answer_count": len(interview_dao.list_answers(db, candidate.session_id)),
            "status": "scored",
            "original": {},
            "rescore": {},
            "rescore_evidence": {},
            "comparisons": [],
            "error": None,
        }
        if session is None:
            sample["status"] = "failed"
            sample["error"] = "会话已不存在"
            samples.append(sample)
            continue
        try:
            original_scores = _report_score_map(db, candidate.session_id)
            rescore_scores, evidence = rescore_session(
                db, session, client=client, max_tokens=max_tokens
            )
            sample["original"] = original_scores
            sample["rescore"] = rescore_scores
            sample["rescore_evidence"] = evidence
            sample["comparisons"] = compare_scores(original_scores, rescore_scores)
        except Exception as exc:  # noqa: BLE001 - 单场失败不应中断整轮抽检
            sample["status"] = "failed"
            sample["error"] = f"{type(exc).__name__}: {exc}"
            # 单场报错会把事务标记为失败，回滚后再继续评下一场。
            db.rollback()
            log(f"复评失败 {candidate.session_id}：{sample['error']}")
        samples.append(sample)

    if not any(sample["status"] == "scored" for sample in samples):
        raise AuditError("所有样本复评都失败，未写留档")

    comparisons = [item for sample in samples for item in sample["comparisons"]]
    summary = summarise(comparisons, rule=rule)
    doc: dict[str, Any] = {
        "schema": SCHEMA,
        "date": run_date,
        "generated_at": _now_iso(),
        "rubric_version": rubric_version,
        "scoring_prompt_sha256": scoring_prompt_sha256(),
        "input_digest": digest,
        "model": model_label,
        "sampling": sampling,
        "rule": rule.as_dict(),
        "samples": samples,
        "summary": summary,
        "manual_review": {"status": "pending", "reviewer": None, "reviewed_at": None, "notes": ""},
        "reproduction_command": _reproduction_command(
            ratio=ratio,
            seed=seed,
            sample_size=sample_size,
            rubric_version=rubric_version,
            date=run_date,
        ),
    }
    result = write_artifacts(doc, directory, force=force)
    result["summary"] = summary
    result["sampling"] = sampling
    return result


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="评分一致性抽检：抽样复评真实报告并输出版本化留档"
    )
    parser.add_argument("--sample-ratio", type=float, default=DEFAULT_RATIO, help="抽样比例，取值 (0, 1]")
    parser.add_argument("--sample-size", type=int, default=None, help="样本量上限，给定后覆盖抽样比例")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="层内随机种子，默认 20261009")
    parser.add_argument("--rubric-version", default=DEFAULT_RUBRIC_VERSION, help="抽检的量表版本")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="留档输出目录")
    parser.add_argument("--date", default=None, help="留档日期（默认本机当天）")
    parser.add_argument("--dry-run", action="store_true", help="只打印抽样计划，不调用模型、不落盘")
    parser.add_argument("--force", action="store_true", help="允许覆盖同名留档")
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_READ_TIMEOUT_SECONDS,
        help="单次模型调用的读超时秒数",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    timeout = httpx.Timeout(connect=5.0, read=args.timeout, write=30.0, pool=5.0)

    def log(message: str) -> None:
        print(message, file=sys.stderr)

    try:
        with httpx.Client(timeout=timeout) as client, SessionLocal() as db:
            result = run_audit(
                db,
                out_dir=Path(args.output_dir),
                ratio=args.sample_ratio,
                seed=args.seed,
                sample_size=args.sample_size,
                rubric_version=args.rubric_version,
                client=client,
                force=args.force,
                dry_run=args.dry_run,
                date=args.date,
                log=log,
            )
    except ArtifactExistsError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except AuditError as exc:
        print(str(exc), file=sys.stderr)
        return 3
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

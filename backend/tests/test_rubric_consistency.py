"""评分一致性抽检脚本的单测：抽样、差值、判定边界、产物写入与模型桩。

模型调用一律用 httpx.MockTransport 兜住，不访问外网；不修改 interview 模块实现，
只读复用其评分 prompt 与口径。
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.modules.interview import service as interview_service
from app.modules.interview.models import (
    InterviewAnswer,
    InterviewQuestion,
    InterviewReport,
    InterviewSession,
)
from app.modules.settings import service as settings_service
from app.modules.settings.schemas import ModelConfigUpdate
from scripts import audit_rubric_consistency as audit

NOW = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)
OWNER = "user_test"
RUBRIC = interview_service.RUBRIC_VERSION
DIMENSIONS = interview_service.CONTENT_DIMENSIONS
USER = CurrentUser(
    id=OWNER,
    display_name="测试用户",
    role="super_admin",
    roles=("super_admin",),
    permissions=frozenset(),
)

ANSWER_TEXTS = (
    "我把低优先级更新让出去了，保证高优先级交互不被阻塞。",
    "时间切片把长任务拆成 5ms 的小块，避免长帧。",
    "我先看监控大盘再定位，最后用数据复盘。",
    "我把项目经历和目标岗位的职责一条条对上了。",
)
REPORT_PAYLOAD = {
    "contentScores": [
        {"dimension": "correctness", "score": 86, "evidence": [ANSWER_TEXTS[0]]},
        {"dimension": "depth", "score": 72, "evidence": [ANSWER_TEXTS[1]]},
        {"dimension": "rigor", "score": 30, "evidence": [ANSWER_TEXTS[2]]},
        {"dimension": "fit", "score": 90, "evidence": [ANSWER_TEXTS[3]]},
    ],
    "summary": "整体达标。",
}
ORIGINAL = {"correctness": 86, "depth": 72, "rigor": 30, "fit": 90}


def make_candidate(index: int, *, role: str = "Java 后端", rubric: str = RUBRIC) -> audit.Candidate:
    return audit.Candidate(
        session_id=f"ivs_{index:04d}",
        report_id=f"ivr_{index:04d}",
        owner_id=OWNER,
        role=role,
        rubric_version=rubric,
        created_at=NOW + timedelta(minutes=index),
    )


def _comparisons(diffs: list) -> list[dict]:
    items: list[dict] = []
    for dimension, diff in zip(DIMENSIONS, diffs, strict=True):
        if diff is None:
            items.append(
                {"dimension": dimension, "original": 80, "rescore": None, "diff": None, "comparable": False}
            )
        else:
            items.append(
                {"dimension": dimension, "original": 80, "rescore": 80 + diff, "diff": diff, "comparable": True}
            )
    return items


def _document(date: str) -> dict:
    comparisons = audit.compare_scores(ORIGINAL, ORIGINAL)
    return {
        "schema": audit.SCHEMA,
        "date": date,
        "generated_at": NOW.isoformat(),
        "rubric_version": RUBRIC,
        "scoring_prompt_sha256": "deadbeef",
        "input_digest": "digest-1",
        "model": {"provider": "deepseek", "model": "deepseek-flash", "endpoint_host": "api.deepseek.com"},
        "sampling": {
            "method": "stratified-random",
            "ratio": 1.0,
            "seed": 20261009,
            "population": 1,
            "selected": 1,
            "strata": [{"rubric_version": RUBRIC, "role": "Java 后端", "population": 1, "selected": 1}],
        },
        "rule": {
            "mean_abs_diff_limit": 5.0,
            "max_abs_diff_limit": 10,
            "min_coverage": 0.8,
            "agreement_tolerance": 5,
        },
        "samples": [
            {
                "session_id": "ivs_0000",
                "report_id": "ivr_0000",
                "role": "Java 后端",
                "rubric_version": RUBRIC,
                "created_at": NOW.isoformat(),
                "answer_count": 3,
                "status": "scored",
                "original": dict(ORIGINAL),
                "rescore": dict(ORIGINAL),
                "rescore_evidence": {"correctness": [ANSWER_TEXTS[0]]},
                "comparisons": comparisons,
                "error": None,
            }
        ],
        "summary": audit.summarise(comparisons),
        "manual_review": {"status": "pending", "reviewer": None, "reviewed_at": None, "notes": ""},
        "reproduction_command": (
            "cd backend && .venv/bin/python -m scripts.audit_rubric_consistency --sample-ratio 1.0"
        ),
    }


# --------------------------------------------------------------------------- #
# 抽样
# --------------------------------------------------------------------------- #


def test_select_sample_census_includes_every_candidate_when_ratio_one() -> None:
    candidates = [make_candidate(i) for i in range(5)]
    selected = audit.select_sample(candidates, ratio=1.0, seed=1)
    assert len(selected) == 5
    assert {c.session_id for c in selected} == {c.session_id for c in candidates}


def test_select_sample_is_deterministic_and_stratified() -> None:
    candidates = [make_candidate(i, role="Java 后端") for i in range(20)] + [
        make_candidate(100 + i, role="Web 前端") for i in range(20)
    ]
    first = audit.select_sample(candidates, ratio=0.25, seed=20261009)
    second = audit.select_sample(candidates, ratio=0.25, seed=20261009)
    assert [c.session_id for c in first] == [c.session_id for c in second]
    assert len(first) == 10
    by_role: dict[str, int] = {}
    for candidate in first:
        by_role[candidate.role] = by_role.get(candidate.role, 0) + 1
    assert by_role == {"Java 后端": 5, "Web 前端": 5}


def test_select_sample_size_overrides_ratio() -> None:
    candidates = [make_candidate(i) for i in range(10)]
    selected = audit.select_sample(candidates, ratio=1.0, seed=1, sample_size=3)
    assert len(selected) == 3
    assert len({c.session_id for c in selected}) == 3


@pytest.mark.parametrize("ratio", [0.0, -0.1, 1.5])
def test_select_sample_rejects_invalid_ratio(ratio: float) -> None:
    with pytest.raises(ValueError):
        audit.select_sample([make_candidate(0)], ratio=ratio, seed=1)


# --------------------------------------------------------------------------- #
# 差值计算
# --------------------------------------------------------------------------- #


def test_compare_scores_reports_signed_diff_and_null_dimensions() -> None:
    original = {"correctness": 80, "depth": None, "rigor": 70, "fit": 90}
    rescore = {"correctness": 83, "depth": 70, "rigor": 70, "fit": 84}
    result = audit.compare_scores(original, rescore)
    assert [item["dimension"] for item in result] == list(DIMENSIONS)
    by_dimension = {item["dimension"]: item for item in result}
    assert by_dimension["correctness"]["diff"] == 3
    assert by_dimension["correctness"]["comparable"] is True
    assert by_dimension["depth"]["diff"] is None
    assert by_dimension["depth"]["comparable"] is False
    assert by_dimension["rigor"]["diff"] == 0
    assert by_dimension["fit"]["diff"] == -6


# --------------------------------------------------------------------------- #
# 判定规则边界
# --------------------------------------------------------------------------- #


def test_summarise_passes_at_threshold_boundary() -> None:
    summary = audit.summarise(_comparisons([0, 10, 5, 5]))
    assert summary["pooled"]["mean_abs_diff"] == pytest.approx(5.0)
    assert summary["pooled"]["max_abs_diff"] == 10
    assert summary["verdict"] == "pass"


def test_summarise_fails_when_mean_just_over_limit() -> None:
    summary = audit.summarise(_comparisons([5, 5, 6, 5]))
    assert summary["pooled"]["mean_abs_diff"] == pytest.approx(5.25)
    assert summary["verdict"] == "fail"


def test_summarise_fails_when_single_dimension_exceeds_max_limit() -> None:
    summary = audit.summarise(_comparisons([0, 0, 0, 11]))
    assert summary["pooled"]["max_abs_diff"] == 11
    assert summary["verdict"] == "fail"


def test_summarise_inconclusive_when_comparable_coverage_too_low() -> None:
    comparisons = _comparisons([0, 0, None, None]) + _comparisons([0, 0, None, None])
    summary = audit.summarise(comparisons)
    assert summary["coverage"] == pytest.approx(0.5)
    assert summary["verdict"] == "inconclusive"


def test_summarise_reports_exact_and_within_five_rates() -> None:
    summary = audit.summarise(_comparisons([0, 0, 5, 5]))
    stats = summary["pooled"]
    assert stats["n"] == 4
    assert stats["exact_agreement_rate"] == pytest.approx(0.5)
    assert stats["within_5_rate"] == pytest.approx(1.0)
    assert summary["by_dimension"]["correctness"]["mean_abs_diff"] == pytest.approx(0.0)


# --------------------------------------------------------------------------- #
# 产物写入
# --------------------------------------------------------------------------- #


def test_write_artifacts_creates_md_and_json(tmp_path: Path) -> None:
    result = audit.write_artifacts(_document("2026-10-09"), tmp_path)
    assert result["status"] == "written"
    md_path = tmp_path / "rubric-consistency-2026-10-09.md"
    json_path = tmp_path / "rubric-consistency-2026-10-09.json"
    assert md_path.is_file() and json_path.is_file()
    payload = json.loads(json_path.read_text(encoding="utf-8"))
    assert payload["rubric_version"] == RUBRIC
    text = md_path.read_text(encoding="utf-8")
    for marker in ("平均绝对偏差", "完全一致率", "±5", "复现命令", "抽样"):
        assert marker in text
    assert "/Users/" not in text


def test_write_artifacts_refuses_to_overwrite_without_force(tmp_path: Path) -> None:
    audit.write_artifacts(_document("2026-10-09"), tmp_path)
    with pytest.raises(audit.ArtifactExistsError):
        audit.write_artifacts(_document("2026-10-09"), tmp_path)
    result = audit.write_artifacts(_document("2026-10-09"), tmp_path, force=True)
    assert result["status"] == "written"


def test_write_artifacts_dry_run_writes_nothing(tmp_path: Path) -> None:
    result = audit.write_artifacts(_document("2026-10-09"), tmp_path, dry_run=True)
    assert result["status"] == "dry-run"
    assert not list(tmp_path.glob("rubric-consistency-*"))


# --------------------------------------------------------------------------- #
# 模型桩：复用 interview 评分 prompt 与口径
# --------------------------------------------------------------------------- #


def _seed_audit_session(db: Session) -> InterviewSession:
    settings_service.update_model_config(
        db,
        USER,
        ModelConfigUpdate(
            provider="openai",
            endpoint="http://example.test/v1",
            model="gpt-4o",
            api_key="sk-test",
        ),
    )
    session = InterviewSession(
        id="ivs_audit",
        owner_id=OWNER,
        resume_id="res_x",
        resume_version_id="ver_x",
        jd_id="jd_x",
        role="Java 后端",
        status="completed",
        rubric_version=RUBRIC,
        context_snapshot={"role": "Java 后端"},
        created_at=NOW,
        updated_at=NOW,
        completed_at=NOW,
    )
    db.add(session)
    scores = (86, 72, 30, 90)
    for ordinal, (content, score, dimension) in enumerate(
        zip(ANSWER_TEXTS, scores, DIMENSIONS, strict=True), start=1
    ):
        question_id = f"ivs_audit_q{ordinal}"
        db.add(
            InterviewQuestion(
                id=question_id,
                session_id="ivs_audit",
                ordinal=ordinal,
                kind="technical",
                prompt=f"题目 {ordinal}",
                reference_points=[],
                difficulty=None,
                knowledge_refs=[],
                parent_question_id=None,
                derived_from_answer_id=None,
                created_at=NOW,
            )
        )
        db.add(
            InterviewAnswer(
                id=f"ivs_audit_a{ordinal}",
                session_id="ivs_audit",
                question_id=question_id,
                idempotency_key=f"k{ordinal}",
                content=content,
                created_at=NOW,
            )
        )
    db.add(
        InterviewReport(
            id="ivr_audit",
            session_id="ivs_audit",
            rubric_version=RUBRIC,
            content_scores=[
                {"dimension": dimension, "score": score, "evidence": [text]}
                for dimension, score, text in zip(DIMENSIONS, scores, ANSWER_TEXTS, strict=True)
            ],
            summary="",
            highlights=[],
            gaps=[],
            suggestions=[],
            created_at=NOW,
        )
    )
    db.commit()
    return session


def _mock_model() -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": json.dumps(REPORT_PAYLOAD, ensure_ascii=False)}}]},
        )

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_rescore_session_reuses_interview_prompt_and_coercion(db_session: Session) -> None:
    session = _seed_audit_session(db_session)
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        seen["system"] = body["messages"][0]["content"]
        seen["user"] = body["messages"][1]["content"]
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": json.dumps(REPORT_PAYLOAD, ensure_ascii=False)}}]},
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        scores, evidence = audit.rescore_session(db_session, session, client=client)

    assert seen["system"] == interview_service._REPORT_SYSTEM
    assert ANSWER_TEXTS[0] in seen["user"]
    assert scores == ORIGINAL
    assert evidence["correctness"] == [ANSWER_TEXTS[0]]


def test_run_audit_writes_artifacts_with_mocked_model(db_session: Session, tmp_path: Path) -> None:
    _seed_audit_session(db_session)
    with _mock_model() as client:
        result = audit.run_audit(db_session, out_dir=tmp_path, ratio=1.0, seed=7, client=client, date="2026-10-09")

    assert result["status"] == "written"
    payload = json.loads((tmp_path / "rubric-consistency-2026-10-09.json").read_text(encoding="utf-8"))
    assert payload["sampling"]["selected"] == 1
    assert payload["samples"][0]["status"] == "scored"
    assert payload["summary"]["verdict"] == "pass"
    assert payload["samples"][0]["rescore"] == ORIGINAL

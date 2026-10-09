"""笔试编排：按岗位+题型抽题、客观题确定性判分、开放题模型评分、代码题只评审不执行。

安全红线：本模块不执行、不模拟、不沙箱运行任何用户代码。代码题只把提交文本交给
interview 模块的 chat_json 做静态评审（可读性/正确性要点），响应里 executed 恒为 False。
客观题的答案键随题目冻结在 quiz_attempts.questions_snapshot，出题视图显式剥离，
判分全部在服务端完成；开放题与代码题复用面试模块的模型调用与 JSON 加固，并用
「逐字引用、无法核对则不给分（score=null）」的证据口径，与面试报告保持一致。
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.interview import llm as interview_llm
from app.shared.errors import (
    ApiException,
    ErrorCode,
    ModelOutputInvalid,
    ResourceNotFound,
    ValidationFailed,
)

from . import dao, seed
from .models import QuizAnswer, QuizAttempt
from .schemas import (
    QuizAnswerCreate,
    QuizAnswerResult,
    QuizAnswerView,
    QuizAttemptCreate,
    QuizAttemptDetail,
    QuizDimensionScore,
    QuizOptionView,
    QuizQuestionView,
    QuizResultView,
    QuizSourceView,
)

logger = logging.getLogger(__name__)

# 判分口径随笔试冻结存储；调整口径时必须新增版本号，不能原地改语义。
POLICY_VERSION = "quiz-policy-v1"
OBJECTIVE_POLICY = (
    "单选/判断：选项集合与正确答案完全一致得满分，否则 0 分。"
    "多选：与正确答案完全一致得满分；所选是无错选的正确子集（且非空）得半分（向下取整）；"
    "出现任一错选或未选得 0 分。"
)
OPEN_POLICY = (
    "开放题由模型按 correctness/depth/rigor/fit 四维评分，只采纳逐字引用作答原文的证据；"
    "无证据的维度记为 null，按有效维度平均分折算题目分值。"
)
CODE_POLICY = (
    "代码题只做静态评审（correctness/readability 两维），服务端不执行任何用户代码；"
    "按有效维度平均分折算题目分值，executed 恒为 false。"
)
POLICY: dict[str, str] = {
    "version": POLICY_VERSION,
    "objective": OBJECTIVE_POLICY,
    "open": OPEN_POLICY,
    "code": CODE_POLICY,
}

OPEN_DIMENSIONS: tuple[str, ...] = ("correctness", "depth", "rigor", "fit")
CODE_DIMENSIONS: tuple[str, ...] = ("correctness", "readability")
OPEN_POINTS = 20
CODE_POINTS = 20
OPEN_MIN_CHARS = 10
CODE_MIN_CHARS = 8
MIN_EVIDENCE_CHARS = 8

_OPEN_SYSTEM = (
    "你是笔试开放题评分专家。只输出 JSON 本身，不要输出解释或 Markdown 代码块。字段："
    '{"dimensions":[{"dimension":"correctness|depth|rigor|fit","score":0 到 100 的整数,'
    '"evidence":["候选人作答原话"]}],"summary":"总体评价","highlights":["亮点"],'
    '"gaps":["不足"],"suggestions":["改进建议"]}。'
    "四个维度各输出一条且不允许重复：correctness（内容正确性）、depth（深度）、"
    "rigor（严谨性）、fit（岗位匹配度）。evidence 必须逐字引用候选人作答原文，"
    "不得改写、不得编造；某个维度找不到原话证据时，把 evidence 留空数组且 score 设为 null。"
)

_CODE_SYSTEM = (
    "你是代码评审专家，只做静态评审：代码评审阶段绝不执行任何代码，也没有执行环境。"
    "不要尝试运行、模拟或输出程序运行结果，只评审提交文本本身。只输出 JSON 本身，"
    "不要输出解释或 Markdown 代码块。字段："
    '{"dimensions":[{"dimension":"correctness|readability","score":0 到 100 的整数,'
    '"evidence":["候选人代码原话"]}],"summary":"总体评价","issues":["问题"],'
    '"suggestions":["改进建议"]}。'
    "correctness（正确性）与 readability（可读性）各输出一条：evidence 必须逐字引用提交的"
    "代码片段，不得改写；无法从代码中核对时把 evidence 留空数组且 score 设为 null。"
)

_WHITESPACE_RE = re.compile(r"\s+")


class QuizAttemptClosed(ApiException):
    """笔试已提交仍尝试作答；用稳定的 409 机器码而不是 500。"""

    status_code = 409
    code = ErrorCode.RUN_STATE_CONFLICT


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _as_text(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _as_text_list(value: object, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for entry in value:
        text = _as_text(entry)
        if text and text not in items:
            items.append(text)
        if len(items) >= limit:
            break
    return items


def _normalise_for_match(text: str) -> str:
    return _WHITESPACE_RE.sub("", text)


def _keep_verbatim_evidence(evidence: list[str], haystack: str) -> list[str]:
    """只保留确实出自作答文本的证据原话，容忍空白差异与引号/句末标点。"""
    if not haystack:
        return []
    kept: list[str] = []
    for item in evidence:
        probe = _normalise_for_match(item).strip("「」“”\"'。，,.;；：:")
        if len(probe) < MIN_EVIDENCE_CHARS:
            logger.warning("笔试丢弃过短的证据引用：%r", item[:30])
            continue
        if probe in haystack:
            kept.append(item)
            continue
        head = probe[:20]
        if len(head) >= MIN_EVIDENCE_CHARS and head in haystack:
            kept.append(item)
            continue
        logger.warning("笔试丢弃非原话证据（未在作答中找到）：%s", probe[:40])
    return kept


def _coerce_score(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return max(0, min(100, int(round(float(value)))))
    if isinstance(value, str):
        try:
            return max(0, min(100, int(round(float(value.strip())))))
        except ValueError:
            return None
    return None


def _derive_idempotency_key(question_id: str, payload: dict) -> str:
    body = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    digest = hashlib.sha256(f"{question_id}\n{body}".encode("utf-8")).hexdigest()
    return f"auto:{digest[:48]}"


def grade_objective(kind: str, *, selected: list[str], correct: list[str], points: int) -> dict:
    """客观题确定性判分，返回 awardedPoints 与 verdict。口径见 OBJECTIVE_POLICY。"""
    selected_set = {item for item in selected if item}
    correct_set = {item for item in correct if item}
    if kind in ("single_choice", "true_false"):
        is_correct = len(selected_set) == 1 and selected_set == correct_set
        return {"awardedPoints": points if is_correct else 0, "verdict": "correct" if is_correct else "incorrect"}
    if selected_set and selected_set == correct_set:
        return {"awardedPoints": points, "verdict": "correct"}
    if selected_set and selected_set < correct_set:
        return {"awardedPoints": points // 2, "verdict": "partial"}
    return {"awardedPoints": 0, "verdict": "incorrect"}


def _coerce_dimensions(raw: object, haystack: str, allowed: tuple[str, ...]) -> list[QuizDimensionScore]:
    """固定返回全部维度；缺证据或证据非原话的维度记 score=null、evidence=[]。"""
    by_dimension: dict[str, QuizDimensionScore] = {}
    haystack = _normalise_for_match(haystack)
    if isinstance(raw, list):
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            dimension = _as_text(entry.get("dimension")).lower()
            if dimension not in allowed or dimension in by_dimension:
                continue
            evidence = _keep_verbatim_evidence(_as_text_list(entry.get("evidence"), limit=3), haystack)
            score = _coerce_score(entry.get("score")) if evidence else None
            by_dimension[dimension] = QuizDimensionScore(
                dimension=dimension,
                score=score,
                evidence=evidence,
            )
    if not any(item.evidence for item in by_dimension.values()):
        raise ModelOutputInvalid("模型没有给出可核对的原话证据，请重试")
    return [
        by_dimension.get(dimension, QuizDimensionScore(dimension=dimension, score=None, evidence=[]))
        for dimension in allowed
    ]


def _points_from_dimensions(dimensions: list[QuizDimensionScore], max_points: int) -> int:
    scores = [item.score for item in dimensions if item.score is not None]
    if not scores:
        return 0
    average = sum(scores) / len(scores)
    return max(0, min(max_points, int(round(max_points * average / 100))))


def _seed_item(group: str, ordinal: int) -> dict:
    base = seed.seed_question(group)
    if not base:
        raise ValidationFailed(f"暂不支持题型 {group}")
    return {
        "id": _new_id("qzq"),
        "group": group,
        "kind": base["kind"],
        "ordinal": ordinal,
        "points": base["points"],
        "prompt": base["prompt"],
        "options": [dict(option) for option in base.get("options", [])],
        "correctOptionIds": list(base.get("correctOptionIds", [])),
        "optionExplanations": dict(base.get("optionExplanations", {})),
        "referencePoints": list(base.get("referencePoints", [])),
        "referenceAnswer": base.get("referenceAnswer", ""),
        "starterCode": base.get("starterCode", ""),
        "source": dict(seed.SEED_SOURCE),
    }


def _bank_open_item(db: Session, role: str, ordinal: int) -> dict | None:
    rows = dao.list_bank_open_questions(db, role, limit=1)
    if not rows:
        return None
    row = rows[0]
    return {
        "id": _new_id("qzq"),
        "group": "open",
        "kind": "open",
        "ordinal": ordinal,
        "points": OPEN_POINTS,
        "prompt": row.prompt,
        "options": [],
        "correctOptionIds": [],
        "optionExplanations": {},
        "referencePoints": list(row.reference_points or []),
        "referenceAnswer": "",
        "starterCode": "",
        "source": {
            "kind": "bank",
            "label": f"{role} 岗位题库",
            "version": f"{row.kind} · {row.difficulty}",
        },
    }


def _draw_questions(db: Session, role: str, groups: list[str]) -> list[dict]:
    items: list[dict] = []
    for ordinal, group in enumerate(groups, start=1):
        if group == "open":
            item = _bank_open_item(db, role, ordinal) or _seed_item(group, ordinal)
        else:
            item = _seed_item(group, ordinal)
        items.append(item)
    return items


def _question_view(item: dict) -> QuizQuestionView:
    return QuizQuestionView(
        id=item["id"],
        group=item["group"],
        kind=item["kind"],
        ordinal=item["ordinal"],
        points=item["points"],
        prompt=item["prompt"],
        options=[QuizOptionView(id=option["id"], text=option["text"]) for option in item.get("options", [])],
        reference_points=list(item.get("referencePoints") or []),
        reference_answer=item.get("referenceAnswer") or "",
        starter_code=item.get("starterCode") or "",
        source=QuizSourceView.model_validate(item["source"]),
    )


def _answer_view(answer: QuizAnswer) -> QuizAnswerView:
    payload = answer.answer_payload or {}
    return QuizAnswerView(
        id=answer.id,
        question_id=answer.question_id,
        question_group=answer.question_group,
        question_kind=answer.question_kind,
        selected_option_ids=list(payload.get("selectedOptionIds") or []),
        text_answer=payload.get("textAnswer"),
        code_answer=payload.get("codeAnswer"),
        awarded_points=answer.awarded_points,
        max_points=answer.max_points,
        verdict=answer.verdict,
        executed=answer.executed,
        feedback=dict(answer.feedback or {}),
        created_at=answer.created_at,
        graded_at=answer.graded_at,
    )


def _owned_attempt(db: Session, owner_id: str, attempt_id: str) -> QuizAttempt:
    attempt = dao.get_attempt(db, attempt_id)
    if attempt is None or attempt.owner_id != owner_id:
        raise ResourceNotFound(f"笔试 {attempt_id} 不存在")
    return attempt


def _find_question(attempt: QuizAttempt, question_id: str) -> dict | None:
    for item in attempt.questions_snapshot or []:
        if item.get("id") == question_id:
            return item
    return None


def create_attempt(db: Session, owner_id: str, payload: QuizAttemptCreate) -> QuizAttemptDetail:
    now = _now()
    items = _draw_questions(db, payload.role, list(payload.question_types))
    attempt = QuizAttempt(
        id=_new_id("qza"),
        owner_id=owner_id,
        role=payload.role,
        status="in_progress",
        question_types=list(payload.question_types),
        questions_snapshot=items,
        max_score=sum(item["points"] for item in items),
        total_score=None,
        policy=dict(POLICY),
        created_at=now,
        updated_at=now,
        submitted_at=None,
    )
    dao.add_attempt(db, attempt)
    db.commit()
    db.refresh(attempt)
    return get_detail(db, owner_id, attempt.id)


def get_detail(db: Session, owner_id: str, attempt_id: str) -> QuizAttemptDetail:
    attempt = _owned_attempt(db, owner_id, attempt_id)
    snapshot = attempt.questions_snapshot or []
    latest: dict[str, QuizAnswer] = {}
    for answer in dao.list_answers(db, attempt.id):
        # 同一题重做时保留最新一条，得分也以最新为准。
        latest[answer.question_id] = answer
    result = None
    if attempt.status == "submitted" and attempt.submitted_at is not None:
        result = QuizResultView(
            total_score=attempt.total_score or 0,
            max_score=attempt.max_score or 0,
            policy=dict(attempt.policy or {}),
            submitted_at=attempt.submitted_at,
        )
    return QuizAttemptDetail(
        id=attempt.id,
        status=attempt.status,
        role=attempt.role,
        question_types=list(attempt.question_types or []),
        questions=[_question_view(item) for item in snapshot],
        answers=[_answer_view(latest[item["id"]]) for item in snapshot if item["id"] in latest],
        result=result,
        max_score=attempt.max_score or 0,
        created_at=attempt.created_at,
        updated_at=attempt.updated_at,
        submitted_at=attempt.submitted_at,
    )


def _normalized_payload(group: str, item: dict, payload: QuizAnswerCreate) -> dict:
    if group == "objective":
        option_ids = [option["id"] for option in item.get("options", [])]
        selected: list[str] = []
        for value in payload.selected_option_ids:
            text = _as_text(value)
            if not text or text in selected:
                continue
            if text not in option_ids:
                raise ValidationFailed(f"选项 {text} 不属于本题")
            selected.append(text)
        if not selected:
            raise ValidationFailed("请至少选择一个选项再提交")
        return {"selectedOptionIds": selected, "textAnswer": None, "codeAnswer": None}
    if group == "open":
        text = (payload.text_answer or "").strip()
        if len(text) < OPEN_MIN_CHARS:
            raise ValidationFailed(f"作答至少需要 {OPEN_MIN_CHARS} 个字符")
        return {"selectedOptionIds": [], "textAnswer": text, "codeAnswer": None}
    code = (payload.code_answer or "").strip()
    if len(code) < CODE_MIN_CHARS:
        raise ValidationFailed(f"代码至少需要 {CODE_MIN_CHARS} 个字符")
    return {"selectedOptionIds": [], "textAnswer": None, "codeAnswer": code}


def _feedback_objective(item: dict, selected: list[str]) -> dict:
    correct_set = set(item.get("correctOptionIds") or [])
    chosen = set(selected)
    explanations = item.get("optionExplanations") or {}
    analysis = [
        {
            "optionId": option["id"],
            "correct": option["id"] in correct_set,
            "chosen": option["id"] in chosen,
            "explanation": explanations.get(option["id"], ""),
        }
        for option in item.get("options", [])
    ]
    return {"policy": OBJECTIVE_POLICY, "optionAnalysis": analysis}


def _grade_objective(item: dict, payload: dict) -> dict:
    selected = list(payload["selectedOptionIds"])
    graded = grade_objective(
        kind=item["kind"],
        selected=selected,
        correct=list(item.get("correctOptionIds") or []),
        points=item["points"],
    )
    return {
        "awarded_points": graded["awardedPoints"],
        "verdict": graded["verdict"],
        "feedback": _feedback_objective(item, selected),
        "executed": None,
        "graded_at": _now(),
    }


def _grade_open(db: Session, owner_id: str, item: dict, answer_text: str) -> dict:
    user_prompt = (
        f"题目：{item['prompt']}\n"
        f"评分要点：{'；'.join(item.get('referencePoints') or []) or '（未提供）'}\n"
        f"候选人作答：{answer_text}\n\n"
        "请按四个维度评分。"
    )
    data = interview_llm.chat_json(
        db,
        owner_id,
        system_prompt=_OPEN_SYSTEM,
        user_prompt=user_prompt,
        max_tokens=4000,
    )
    dimensions = _coerce_dimensions(data.get("dimensions"), answer_text, OPEN_DIMENSIONS)
    return {
        "awarded_points": _points_from_dimensions(dimensions, item["points"]),
        "verdict": "graded",
        "feedback": {
            "dimensions": [item_score.model_dump(by_alias=True) for item_score in dimensions],
            "summary": _as_text(data.get("summary")),
            "highlights": _as_text_list(data.get("highlights"), limit=5),
            "gaps": _as_text_list(data.get("gaps"), limit=5),
            "suggestions": _as_text_list(data.get("suggestions"), limit=5),
        },
        "executed": None,
        "graded_at": _now(),
    }


def _grade_code(db: Session, owner_id: str, item: dict, code_text: str) -> dict:
    user_prompt = (
        f"题目：{item['prompt']}\n"
        f"评审要点：{'；'.join(item.get('referencePoints') or []) or '（未提供）'}\n"
        f"提交代码：\n{code_text}\n\n"
        "请只做静态评审，不要执行代码。"
    )
    data = interview_llm.chat_json(
        db,
        owner_id,
        system_prompt=_CODE_SYSTEM,
        user_prompt=user_prompt,
        max_tokens=4000,
    )
    dimensions = _coerce_dimensions(data.get("dimensions"), code_text, CODE_DIMENSIONS)
    return {
        "awarded_points": _points_from_dimensions(dimensions, item["points"]),
        "verdict": "graded",
        "feedback": {
            "dimensions": [item_score.model_dump(by_alias=True) for item_score in dimensions],
            "summary": _as_text(data.get("summary")),
            "issues": _as_text_list(data.get("issues"), limit=5),
            "suggestions": _as_text_list(data.get("suggestions"), limit=5),
            # 显式记录：代码只被静态评审，没有被执行。
            "executed": False,
        },
        "executed": False,
        "graded_at": _now(),
    }


def submit_answer(
    db: Session,
    owner_id: str,
    attempt_id: str,
    payload: QuizAnswerCreate,
) -> QuizAnswerResult:
    """判分并落一条作答；命中唯一键时原样返回，不重复落库。"""
    attempt = _owned_attempt(db, owner_id, attempt_id)
    if attempt.status != "in_progress":
        raise QuizAttemptClosed("本次笔试已提交，不能继续作答")
    item = _find_question(attempt, payload.question_id)
    if item is None:
        raise ResourceNotFound(f"题目 {payload.question_id} 不存在")

    normalized = _normalized_payload(item["group"], item, payload)
    key = (payload.idempotency_key or "").strip() or _derive_idempotency_key(item["id"], normalized)
    existing = dao.get_answer_by_key(db, item["id"], key)
    if existing is not None:
        return QuizAnswerResult(answer=_answer_view(existing))

    # 判分（开放题/代码题可能调用模型）先于落库：失败时不留「有作答、无结果」的中间态。
    if item["group"] == "objective":
        graded = _grade_objective(item, normalized)
    elif item["group"] == "open":
        graded = _grade_open(db, owner_id, item, normalized["textAnswer"] or "")
    else:
        graded = _grade_code(db, owner_id, item, normalized["codeAnswer"] or "")

    now = _now()
    answer = QuizAnswer(
        id=_new_id("qzn"),
        attempt_id=attempt.id,
        question_id=item["id"],
        question_group=item["group"],
        question_kind=item["kind"],
        idempotency_key=key,
        answer_payload=normalized,
        awarded_points=graded["awarded_points"],
        max_points=item["points"],
        verdict=graded["verdict"],
        feedback=graded["feedback"],
        executed=graded["executed"],
        created_at=now,
        graded_at=graded["graded_at"],
    )
    dao.add_answer(db, answer)
    attempt.updated_at = now
    try:
        db.commit()
    except IntegrityError:
        # 并发重复提交：唯一约束兜底，回滚后返回已落库的那一条。
        db.rollback()
        existing = dao.get_answer_by_key(db, item["id"], key)
        if existing is None:
            raise
        return QuizAnswerResult(answer=_answer_view(existing))
    db.refresh(answer)
    return QuizAnswerResult(answer=_answer_view(answer))


def submit_attempt(db: Session, owner_id: str, attempt_id: str) -> QuizAttemptDetail:
    """冻结总分与提交时间；重复提交返回同一份结果（幂等）。"""
    attempt = _owned_attempt(db, owner_id, attempt_id)
    if attempt.status == "submitted":
        return get_detail(db, owner_id, attempt.id)

    latest: dict[str, QuizAnswer] = {}
    for answer in dao.list_answers(db, attempt.id):
        latest[answer.question_id] = answer
    total = sum((answer.awarded_points or 0) for answer in latest.values())

    now = _now()
    attempt.status = "submitted"
    attempt.total_score = total
    attempt.submitted_at = now
    attempt.updated_at = now
    db.commit()
    db.refresh(attempt)
    return get_detail(db, owner_id, attempt.id)

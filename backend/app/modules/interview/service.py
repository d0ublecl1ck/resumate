"""面试会话编排：创建（冻结上下文 + 生成题目）、作答（幂等 + 追问）、评估。

模型调用的输入输出都在这里做字段校验与收敛：模型返回的 kind、分数、证据条数
一律按白名单/区间裁剪，缺证据的维度不给分（score=null）而不是给 0 分。
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

from app.modules.jd.dao import get_jd
from app.modules.resume.dao import get_resume, get_version
from app.shared.errors import (
    ApiException,
    ErrorCode,
    ModelNotConfigured,
    ModelOutputInvalid,
    ResourceNotFound,
    UpstreamRejected,
    UpstreamTimeout,
    ValidationFailed,
)

from . import dao, llm
from .models import InterviewAnswer, InterviewQuestion, InterviewReport, InterviewSession
from .schemas import (
    InterviewAnswerCreate,
    InterviewAnswerResult,
    InterviewAnswerView,
    InterviewContextSnapshot,
    InterviewQuestionView,
    InterviewReportScore,
    InterviewReportView,
    InterviewSessionCreate,
    InterviewSessionDetail,
    InterviewSessionSummary,
)

logger = logging.getLogger(__name__)

# 量表版本随报告冻结存储；调整评分口径时必须新增版本号，不能原地改语义。
RUBRIC_VERSION = "interview-rubric-v1"
CONTENT_DIMENSIONS = ("correctness", "depth", "rigor", "fit")
QUESTION_KINDS = ("technical", "behavioral", "situational")
FOLLOW_UP_KIND = "follow_up"
MIN_QUESTIONS = 3
MAX_QUESTIONS = 5
MAX_RESUME_CHARS = 4000


class InterviewSessionClosed(ApiException):
    """会话已结束仍尝试写入作答；用稳定的 409 机器码而不是 500。"""

    status_code = 409
    code = ErrorCode.RUN_STATE_CONFLICT


_QUESTION_SYSTEM = (
    "你是资深面试官。根据目标岗位 JD 与候选人简历，生成有区分度的面试题。"
    "只输出 JSON 本身，不要输出解释或 Markdown 代码块。字段："
    '{"questions":[{"kind":"technical|behavioral|situational","prompt":"题干",'
    '"referencePoints":["要点1","要点2"]}]}。'
    "kind 只能是 technical（技术）、behavioral（行为）、situational（情景）三者之一；"
    "referencePoints 是判断回答是否到位的关键要点，每道题 2-4 条，必须具体、可核对。"
    "不要编造简历里不存在的经历；题目必须与 JD 要求相关，题目之间不要重复。"
)

_FOLLOW_UP_SYSTEM = (
    "你是资深面试官。根据题目要点与候选人的回答，找出一处尚未覆盖的关键缺失点并提出一个追问。"
    '只输出 JSON：{"followUp":"追问题干","missingPoints":["缺失要点"]}。'
    '如果回答已经覆盖全部要点，返回 {"followUp":"","missingPoints":[]}。'
    "追问必须针对缺失点，不要重复原题，一次只问一个问题。"
)

_REPORT_SYSTEM = (
    "你是面试评估专家。基于完整问答记录，为候选人的内容表现打分。"
    '只输出 JSON：{"contentScores":[{"dimension":"correctness|depth|rigor|fit",'
    '"score":0 到 100 的整数,"evidence":["候选人回答原话"]}],'
    '"summary":"总体评价","highlights":["亮点"],"gaps":["不足"],"suggestions":["改进建议"]}。'
    "四个维度各输出一条且不允许重复：correctness（内容正确性）、depth（深度）、"
    "rigor（严谨性）、fit（岗位匹配度）。evidence 必须逐字引用候选人的回答原文，"
    "不得改写、不得编造；某个维度找不到原话证据时，把 evidence 留空数组且 score 设为 null。"
)


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


_WHITESPACE_RE = re.compile(r"\s+")
# 一条证据原话的最小可核对长度；低于此长度不做原话比对（例如「对」「嗯」）。
MIN_EVIDENCE_CHARS = 8


def _normalise_for_match(text: str) -> str:
    """去掉所有空白，便于把模型引用的原话与候选人作答做包含比对。"""
    return _WHITESPACE_RE.sub("", text)


def _keep_verbatim_evidence(evidence: list[str], haystack: str) -> list[str]:
    """只保留确实出自候选人作答的证据原话。

    模型被要求逐字引用；这里做程序化核对，容忍空白差异与引号/句末标点，
    并允许模型只引用了原话的前半段。核对不通过的一律丢弃（该维度因此不给分）。
    """
    if not haystack:
        return []
    kept: list[str] = []
    for item in evidence:
        probe = _normalise_for_match(item).strip("「」“”\"'。，,.;；：:")
        if len(probe) < MIN_EVIDENCE_CHARS:
            logger.warning("丢弃过短的证据引用：%r", item[:30])
            continue
        if probe in haystack:
            kept.append(item)
            continue
        head = probe[:20]
        if len(head) >= MIN_EVIDENCE_CHARS and head in haystack:
            kept.append(item)
            continue
        logger.warning("丢弃非原话证据（未在作答中找到）：%s", probe[:40])
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


def _derive_idempotency_key(question_id: str, content: str) -> str:
    digest = hashlib.sha256(f"{question_id}\n{content}".encode("utf-8")).hexdigest()
    return f"auto:{digest[:48]}"


def _get_owned_session(db: Session, owner_id: str, session_id: str) -> InterviewSession:
    session = dao.get_session(db, session_id)
    if session is None or session.owner_id != owner_id:
        raise ResourceNotFound(f"面试会话 {session_id} 不存在")
    return session


def _resume_text(snapshot: object) -> str:
    try:
        text = json.dumps(snapshot or {}, ensure_ascii=False, sort_keys=True)
    except (TypeError, ValueError):
        text = str(snapshot)
    return text[:MAX_RESUME_CHARS]


def _generate_questions(
    db: Session,
    owner_id: str,
    *,
    role: str,
    jd_body: str,
    resume_text: str,
    count: int,
) -> list[dict]:
    """调模型生成 3-5 道题；数量不足或格式非法直接报 MODEL_OUTPUT_INVALID。"""
    user_prompt = (
        f"目标岗位：{role}\n\n"
        f"岗位 JD：\n{jd_body}\n\n"
        f"候选人简历（冻结版本）：\n{resume_text}\n\n"
        f"请生成 {count} 道题。"
    )
    data = llm.chat_json(db, owner_id, system_prompt=_QUESTION_SYSTEM, user_prompt=user_prompt)
    raw = data.get("questions")
    if not isinstance(raw, list):
        raise ModelOutputInvalid("模型没有返回题目，请重试")
    items: list[dict] = []
    invalid_kinds = 0
    for entry in raw[:MAX_QUESTIONS]:
        if not isinstance(entry, dict):
            continue
        prompt = _as_text(entry.get("prompt"))
        if not prompt:
            continue
        raw_kind = _as_text(entry.get("kind")).lower()
        if raw_kind in QUESTION_KINDS:
            kind = raw_kind
        else:
            # 不静默吞掉：记 warning 便于发现模型跑偏，同时保留可用题目。
            invalid_kinds += 1
            kind = "technical"
            logger.warning("模型返回的题型不在白名单，已归为 technical：kind=%r prompt=%s", raw_kind, prompt[:40])
        points = _as_text_list(entry.get("referencePoints") or entry.get("reference_points"), limit=6)
        items.append({"kind": kind, "prompt": prompt, "reference_points": points})
    if len(items) < MIN_QUESTIONS:
        raise ModelOutputInvalid("模型返回的题目数量不足，请重试")
    if invalid_kinds and invalid_kinds == len(items):
        # 全部题型都非法说明模型没有遵守输出约定，不能当作正常结果。
        raise ModelOutputInvalid("模型返回的题型全部非法，请重试")
    return items


def _generate_follow_up(
    db: Session,
    owner_id: str,
    *,
    question: InterviewQuestion,
    answer_content: str,
) -> dict | None:
    points = "；".join(question.reference_points or [])
    user_prompt = (
        f"题目：{question.prompt}\n"
        f"要点：{points or '（未提供）'}\n"
        f"候选人回答：{answer_content}\n\n"
        "请判断是否还有未覆盖的关键要点。"
    )
    data = llm.chat_json(db, owner_id, system_prompt=_FOLLOW_UP_SYSTEM, user_prompt=user_prompt, max_tokens=600)
    follow_up = _as_text(data.get("followUp") or data.get("follow_up"))
    if not follow_up:
        return None
    missing = _as_text_list(data.get("missingPoints") or data.get("missing_points"), limit=4)
    return {"prompt": follow_up, "reference_points": missing}


def _ensure_follow_up(db: Session, session: InterviewSession, question: InterviewQuestion, answer: InterviewAnswer) -> None:
    """每条主问题最多追加一次追问；主问题本身是追问时不再追问。"""
    if question.kind == FOLLOW_UP_KIND:
        return
    if dao.get_follow_up_for_answer(db, answer.id) is not None:
        return
    try:
        generated = _generate_follow_up(db, session.owner_id, question=question, answer_content=answer.content)
    except (ModelNotConfigured, ModelOutputInvalid, UpstreamRejected, UpstreamTimeout) as exc:
        # 作答已落库，追问只是增强项：模型侧失败就跳过，不能把已提交的作答一起丢掉。
        logger.warning(
            "追问生成失败，跳过追加：session=%s question=%s error=%s",
            session.id,
            question.id,
            type(exc).__name__,
        )
        return
    if generated is None:
        return
    now = _now()
    dao.add_question(
        db,
        InterviewQuestion(
            id=_new_id("ivq"),
            session_id=session.id,
            ordinal=dao.count_questions(db, session.id) + 1,
            kind=FOLLOW_UP_KIND,
            prompt=generated["prompt"],
            reference_points=generated["reference_points"],
            parent_question_id=question.id,
            derived_from_answer_id=answer.id,
            created_at=now,
        ),
    )
    session.updated_at = now
    db.commit()


def _answer_view(answer: InterviewAnswer | None) -> InterviewAnswerView | None:
    if answer is None:
        return None
    return InterviewAnswerView(
        id=answer.id,
        question_id=answer.question_id,
        content=answer.content,
        created_at=answer.created_at,
    )


def _question_view(db: Session, question: InterviewQuestion | None) -> InterviewQuestionView | None:
    if question is None:
        return None
    return InterviewQuestionView(
        id=question.id,
        ordinal=question.ordinal,
        kind=question.kind,
        prompt=question.prompt,
        reference_points=list(question.reference_points or []),
        parent_question_id=question.parent_question_id,
        answer=_answer_view(dao.get_latest_answer(db, question.id)),
    )


def _report_view(report: InterviewReport) -> InterviewReportView:
    return InterviewReportView(
        id=report.id,
        session_id=report.session_id,
        rubric_version=report.rubric_version,
        content_scores=[InterviewReportScore.model_validate(item) for item in (report.content_scores or [])],
        summary=report.summary,
        highlights=list(report.highlights or []),
        gaps=list(report.gaps or []),
        suggestions=list(report.suggestions or []),
        created_at=report.created_at,
    )


def _coerce_scores(raw: object, answer_texts: list[str]) -> list[InterviewReportScore]:
    """固定返回四个内容维度（按固定顺序）；缺证据或证据非原话的维度 score=null。"""
    haystack = _normalise_for_match("\n".join(answer_texts))
    by_dimension: dict[str, InterviewReportScore] = {}
    if isinstance(raw, list):
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            dimension = _as_text(entry.get("dimension")).lower()
            if dimension not in CONTENT_DIMENSIONS or dimension in by_dimension:
                continue
            evidence = _keep_verbatim_evidence(_as_text_list(entry.get("evidence"), limit=3), haystack)
            score = _coerce_score(entry.get("score")) if evidence else None
            by_dimension[dimension] = InterviewReportScore(
                dimension=dimension,  # type: ignore[arg-type]
                score=score,
                evidence=evidence,
            )
    if not any(item.evidence for item in by_dimension.values()):
        raise ModelOutputInvalid("模型没有给出可核对的原话证据，请重试")
    return [
        by_dimension.get(
            dimension,
            InterviewReportScore(dimension=dimension, score=None, evidence=[]),  # type: ignore[arg-type]
        )
        for dimension in CONTENT_DIMENSIONS
    ]


def _report_user_prompt(session: InterviewSession, pairs: list[tuple[InterviewQuestion, InterviewAnswer]]) -> str:
    lines = [f"目标岗位：{session.role}", ""]
    for question, answer in pairs:
        lines.append(f"[{question.ordinal}] {question.prompt}")
        if question.reference_points:
            lines.append("要点：" + "；".join(question.reference_points))
        lines.append("候选人回答：" + answer.content)
        lines.append("")
    return "\n".join(lines)


def create_session(db: Session, owner_id: str, payload: InterviewSessionCreate) -> InterviewSessionDetail:
    """冻结简历版本 + JD 快照，并基于该快照生成首批题目。"""
    version = get_version(db, payload.resume_version_id)
    if version is None:
        raise ResourceNotFound(f"简历版本 {payload.resume_version_id} 不存在")
    resume = get_resume(db, version.resume_id)
    if resume is None or resume.owner_id != owner_id:
        raise ResourceNotFound(f"简历版本 {payload.resume_version_id} 不存在")
    if resume.lifecycle == "deleted":
        raise ValidationFailed("目标简历已删除，不能开始面试")
    jd = get_jd(db, payload.jd_id)
    if jd is None or jd.owner_id != owner_id:
        raise ResourceNotFound(f"岗位 {payload.jd_id} 不存在")

    resume_text = _resume_text(version.snapshot)
    questions = _generate_questions(
        db,
        owner_id,
        role=payload.role,
        jd_body=jd.body,
        resume_text=resume_text,
        count=payload.question_count,
    )

    now = _now()
    session = InterviewSession(
        id=_new_id("ivs"),
        owner_id=owner_id,
        resume_id=resume.id,
        resume_version_id=version.id,
        jd_id=jd.id,
        role=payload.role,
        status="active",
        rubric_version=RUBRIC_VERSION,
        context_snapshot={
            "role": payload.role,
            "resumeTitle": resume.title,
            "resumeVersionId": version.id,
            "resumeSnapshot": version.snapshot,
            "jdRole": jd.role,
            "jdCompany": jd.company,
            "jdBody": jd.body,
            "capturedAt": now.isoformat(),
        },
        created_at=now,
        updated_at=now,
        completed_at=None,
    )
    dao.add_session(db, session)
    for ordinal, item in enumerate(questions, start=1):
        dao.add_question(
            db,
            InterviewQuestion(
                id=_new_id("ivq"),
                session_id=session.id,
                ordinal=ordinal,
                kind=item["kind"],
                prompt=item["prompt"],
                reference_points=item["reference_points"],
                parent_question_id=None,
                derived_from_answer_id=None,
                created_at=now,
            ),
        )
    db.commit()
    db.refresh(session)
    return get_detail(db, owner_id, session.id)


def list_sessions(db: Session, owner_id: str) -> list[InterviewSessionSummary]:
    summaries: list[InterviewSessionSummary] = []
    for session in dao.list_sessions(db, owner_id):
        answers = dao.list_answers(db, session.id)
        summaries.append(
            InterviewSessionSummary(
                id=session.id,
                status=session.status,  # type: ignore[arg-type]
                role=session.role,
                question_count=dao.count_questions(db, session.id),
                answered_count=len({answer.question_id for answer in answers}),
                resume_title=(session.context_snapshot or {}).get("resumeTitle", ""),
                has_report=dao.get_report(db, session.id) is not None,
                created_at=session.created_at,
                completed_at=session.completed_at,
            )
        )
    return summaries


def get_detail(db: Session, owner_id: str, session_id: str) -> InterviewSessionDetail:
    session = _get_owned_session(db, owner_id, session_id)
    snapshot = session.context_snapshot or {}
    report = dao.get_report(db, session.id)
    questions = [view for view in (_question_view(db, item) for item in dao.list_questions(db, session.id)) if view]
    return InterviewSessionDetail(
        id=session.id,
        status=session.status,  # type: ignore[arg-type]
        role=session.role,
        resume_id=session.resume_id,
        resume_version_id=session.resume_version_id,
        jd_id=session.jd_id,
        rubric_version=session.rubric_version,
        context_snapshot=InterviewContextSnapshot(
            role=snapshot.get("role", session.role),
            resume_title=snapshot.get("resumeTitle", ""),
            resume_version_id=snapshot.get("resumeVersionId", session.resume_version_id),
            jd_role=snapshot.get("jdRole", ""),
            jd_company=snapshot.get("jdCompany"),
            jd_body=snapshot.get("jdBody", ""),
        ),
        questions=questions,
        report=_report_view(report) if report is not None else None,
        created_at=session.created_at,
        updated_at=session.updated_at,
        completed_at=session.completed_at,
    )


def _answer_result(db: Session, answer: InterviewAnswer) -> InterviewAnswerResult:
    follow_up = dao.get_follow_up_for_answer(db, answer.id)
    return InterviewAnswerResult(
        answer=_answer_view(answer),  # type: ignore[arg-type]
        follow_up_question=_question_view(db, follow_up),
    )


def submit_answer(db: Session, owner_id: str, session_id: str, payload: InterviewAnswerCreate) -> InterviewAnswerResult:
    """落一条作答；(question_id, idempotency_key) 命中时原样返回，不重复落库。"""
    session = _get_owned_session(db, owner_id, session_id)
    if session.status != "active":
        raise InterviewSessionClosed("本场面试已结束，不能继续作答")
    question = dao.get_question(db, payload.question_id)
    if question is None or question.session_id != session.id:
        raise ResourceNotFound(f"题目 {payload.question_id} 不存在")

    key = (payload.idempotency_key or "").strip() or _derive_idempotency_key(question.id, payload.content)
    existing = dao.get_answer_by_key(db, question.id, key)
    if existing is not None:
        return _answer_result(db, existing)

    now = _now()
    answer = InterviewAnswer(
        id=_new_id("iva"),
        session_id=session.id,
        question_id=question.id,
        idempotency_key=key,
        content=payload.content,
        created_at=now,
    )
    dao.add_answer(db, answer)
    session.updated_at = now
    try:
        db.commit()
    except IntegrityError:
        # 并发重复提交：唯一约束兜底，回滚后返回已经落库的那一条。
        db.rollback()
        existing = dao.get_answer_by_key(db, question.id, key)
        if existing is None:
            raise
        return _answer_result(db, existing)
    db.refresh(answer)
    _ensure_follow_up(db, session, question, answer)
    return _answer_result(db, answer)


def finish_session(db: Session, owner_id: str, session_id: str) -> InterviewReportView:
    """生成结构化评估并冻结量表版本；重复调用返回已生成的同一份报告。"""
    session = _get_owned_session(db, owner_id, session_id)
    existing = dao.get_report(db, session.id)
    if existing is not None:
        return _report_view(existing)

    questions = dao.list_questions(db, session.id)
    answers = {answer.question_id: answer for answer in dao.list_answers(db, session.id)}
    pairs = [(question, answers[question.id]) for question in questions if question.id in answers]
    if not pairs:
        raise ValidationFailed("还没有任何作答，无法生成评估")

    # 报告要一次性输出四个维度 + 每条证据，比出题更长；推理型模型还有思考 token，
    # 因此显式给更大的预算，避免 finish_reason=length 把 JSON 截断。
    data = llm.chat_json(
        db,
        session.owner_id,
        system_prompt=_REPORT_SYSTEM,
        user_prompt=_report_user_prompt(session, pairs),
        max_tokens=8000,
    )
    scores = _coerce_scores(
        data.get("contentScores") or data.get("content_scores"),
        [answer.content for _, answer in pairs],
    )

    now = _now()
    report = InterviewReport(
        id=_new_id("ivr"),
        session_id=session.id,
        rubric_version=session.rubric_version,
        content_scores=[score.model_dump(mode="json", by_alias=True) for score in scores],
        summary=_as_text(data.get("summary")),
        highlights=_as_text_list(data.get("highlights"), limit=5),
        gaps=_as_text_list(data.get("gaps"), limit=5),
        suggestions=_as_text_list(data.get("suggestions"), limit=5),
        created_at=now,
    )
    dao.add_report(db, report)
    session.status = "completed"
    session.completed_at = now
    session.updated_at = now
    db.commit()
    db.refresh(report)
    return _report_view(report)


def get_report(db: Session, owner_id: str, session_id: str) -> InterviewReportView:
    session = _get_owned_session(db, owner_id, session_id)
    report = dao.get_report(db, session.id)
    if report is None:
        raise ResourceNotFound("本场面试还没有评估报告")
    return _report_view(report)

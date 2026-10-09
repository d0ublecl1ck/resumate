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
from app.modules.kb import service as kb_service
from app.modules.resume.dao import get_resume, get_version
from app.modules.speech import service as speech_service
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
from .models import (
    InterviewAnswer,
    InterviewQuestion,
    InterviewReport,
    InterviewSession,
    PracticeItem,
)
from .schemas import (
    CALIBER_ROLE_AND_RUBRIC_MISMATCH,
    CALIBER_ROLE_MISMATCH,
    CALIBER_RUBRIC_MISMATCH,
    CALIBER_SAME,
    LEGACY_KIND_ALIASES,
    QUESTION_KINDS,
    InterviewAnswerCreate,
    InterviewAnswerResult,
    InterviewAnswerView,
    InterviewCaliberView,
    InterviewComparisonSession,
    InterviewComparisonView,
    InterviewContextSnapshot,
    InterviewDimensionAverages,
    InterviewGenerationFilters,
    InterviewGrowthPoint,
    InterviewGrowthSeries,
    InterviewGrowthView,
    InterviewInsightsView,
    InterviewQuestionView,
    InterviewReportScore,
    InterviewReportView,
    InterviewSessionCreate,
    InterviewSessionDetail,
    InterviewSessionRegenerate,
    InterviewSessionSummary,
    PracticeItemCreate,
    PracticeItemRetestResult,
    PracticeItemUpdate,
    PracticeItemView,
)

logger = logging.getLogger(__name__)

# 量表版本随报告冻结存储；调整评分口径时必须新增版本号，不能原地改语义。
RUBRIC_VERSION = "interview-rubric-v1"
CONTENT_DIMENSIONS = ("correctness", "depth", "rigor", "fit")
FOLLOW_UP_KIND = "follow_up"
MIN_QUESTIONS = 3
MAX_QUESTIONS = 5
MAX_RESUME_CHARS = 4000
# 出题知识依据：按「岗位 + JD/简历要点」检索 top-k 切片注入 prompt；注入片段本身
# 有字符上限，避免把 prompt 撑爆。
KNOWLEDGE_BASIS_TOP_K = 5
KNOWLEDGE_BASIS_SNIPPET_CHARS = 240
# 每道题记录的知识来源条数；与题库回填 kb/backfill.DEFAULT_REF_LIMIT 对齐。
KNOWLEDGE_REF_LIMIT = 3
# 低于该分数的维度算薄弱，落成练习项；无证据的维度（score=null）同样算薄弱。
PRACTICE_WEAK_THRESHOLD = 80

_INSIGHTS_SYSTEM = (
    "你是面试准备顾问。根据候选人的简历内容与目标岗位 JD，给出准备面试时的"
    "匹配点、风险点与岗位范围关键词。只输出 JSON："
    '{"matchPoints":["匹配点"],"riskPoints":["风险点"],"scopeKeywords":["关键词"]}。'
    "matchPoints 是简历中确有依据、与 JD 对得上的优势；riskPoints 是简历与 JD 的差距或"
    "面试官可能追问的薄弱处；scopeKeywords 是这份 JD 的岗位范围关键词（技术栈、职责域）。"
    "每条都要具体、可核对，不要编造简历里不存在的内容。matchPoints 与 riskPoints 各 2-5 条，"
    "scopeKeywords 3-8 个。"
)


class InterviewSessionClosed(ApiException):
    """会话已结束仍尝试写入作答；用稳定的 409 机器码而不是 500。"""

    status_code = 409
    code = ErrorCode.RUN_STATE_CONFLICT


# 题型与难度的中文标签，用于拼出题 prompt；与前端词条口径一致但不共用资源。
_KIND_LABELS = {
    "technical": "技术",
    "deep_dive": "项目深挖",
    "scenario": "场景",
    "behavioral": "行为",
}
_DIFFICULTY_LABELS = {"easy": "简单", "medium": "中等", "hard": "困难"}

_QUESTION_SYSTEM = (
    "你是资深面试官。根据目标岗位 JD、候选人简历与岗位知识库依据，生成有区分度的面试题。"
    "只输出 JSON 本身，不要输出解释或 Markdown 代码块。字段："
    '{"questions":[{"kind":"technical|deep_dive|scenario|behavioral","prompt":"题干",'
    '"referencePoints":["要点1","要点2"]}]}。'
    "kind 只能是 technical（技术）、deep_dive（项目深挖）、scenario（场景）、behavioral（行为）"
    "四者之一，并且必须覆盖用户在题型要求里指定的全部题型；referencePoints 是判断回答是否"
    "到位的关键要点，每道题 2-4 条，必须具体、可核对。"
    "如果用户给出了「知识依据」，题目与要点要与依据相关，但不得编造依据中没有出现的来源；"
    "没有知识依据时只依据简历与 JD 出题，不要编造知识来源。"
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


def _generation_filters(*, difficulty: str | None, kinds: list[str] | None) -> dict:
    """把筛选收敛成待冻结的 dict；两者都不限时返回空 dict（= 现状行为）。"""
    cleaned: list[str] = []
    for kind in kinds or []:
        canonical = LEGACY_KIND_ALIASES.get(kind, kind)
        if canonical in QUESTION_KINDS and canonical not in cleaned:
            cleaned.append(canonical)
    if not cleaned and difficulty is None:
        return {}
    return {"difficulty": difficulty, "kinds": cleaned}


def _stored_filters(snapshot: object) -> dict:
    """从会话快照读回已冻结的筛选；缺失/非法一律按「不限」处理，兼容历史会话。"""
    raw = snapshot.get("generationFilters") if isinstance(snapshot, dict) else None
    if not isinstance(raw, dict):
        return {}
    difficulty = raw.get("difficulty")
    if difficulty not in _DIFFICULTY_LABELS:
        difficulty = None
    kinds: list[str] = []
    entries = raw.get("kinds")
    for entry in entries if isinstance(entries, list) else []:
        canonical = LEGACY_KIND_ALIASES.get(str(entry), str(entry))
        if canonical in QUESTION_KINDS and canonical not in kinds:
            kinds.append(canonical)
    if not kinds and difficulty is None:
        return {}
    return {"difficulty": difficulty, "kinds": kinds}


def _filters_view(filters: dict) -> InterviewGenerationFilters | None:
    if not filters:
        return None
    return InterviewGenerationFilters(
        difficulty=filters.get("difficulty"),
        kinds=list(filters.get("kinds") or []),
    )


def _knowledge_query(role: str, jd_body: str, resume_text: str) -> str:
    """出题依据检索词：岗位 + JD 正文 + 简历要点；截断到检索接口上限内。"""
    parts = [part.strip() for part in (role, jd_body, resume_text) if part and part.strip()]
    return "\n".join(parts)[:2000]


def _retrieve_knowledge_basis(
    db: Session, *, role: str, jd_body: str, resume_text: str
) -> list:
    """按岗位 + JD/简历要点检索知识库切片；无命中或无文档返回空列表，绝不伪造。"""
    query = _knowledge_query(role, jd_body, resume_text)
    if not query:
        return []
    try:
        result = kb_service.search(db, query=query, role=role, limit=KNOWLEDGE_BASIS_TOP_K)
    except ValidationFailed:
        return []
    return list(result.results)


def _format_knowledge_basis(hits: list) -> str:
    if not hits:
        return ""
    lines = ["知识依据（来自岗位知识库检索，供出题参考）："]
    for index, hit in enumerate(hits, start=1):
        snippet = _WHITESPACE_RE.sub(" ", hit.content).strip()[:KNOWLEDGE_BASIS_SNIPPET_CHARS]
        lines.append(f"[{index}] {hit.source}：{snippet}")
    return "\n".join(lines)


def _knowledge_refs_for_question(db: Session, *, role: str, prompt: str) -> list[str]:
    """按题干检索该题的知识来源；口径与题库回填一致，未命中返回空数组。"""
    try:
        result = kb_service.search(db, query=prompt, role=role, limit=KNOWLEDGE_REF_LIMIT)
    except ValidationFailed:
        return []
    if result.status != "matched":
        return []
    refs: list[str] = []
    for hit in result.results:
        if hit.source not in refs:
            refs.append(hit.source)
    return refs


def _question_user_prompt(
    *,
    role: str,
    jd_body: str,
    resume_text: str,
    count: int,
    difficulty: str | None,
    kinds: list[str],
    basis_text: str,
) -> str:
    lines = [
        f"目标岗位：{role}",
        "",
        f"岗位 JD：\n{jd_body}",
        "",
        f"候选人简历（冻结版本）：\n{resume_text}",
        "",
    ]
    if difficulty:
        lines.append(f"难度要求：{difficulty}（{_DIFFICULTY_LABELS[difficulty]}），所有题目都按该难度出。")
    else:
        lines.append("难度要求：不限。")
    if kinds:
        labels = "、".join(f"{kind}（{_KIND_LABELS[kind]}）" for kind in kinds)
        lines.append(f"题型要求：只生成以下题型，并且必须覆盖全部指定题型：{labels}。")
    else:
        lines.append("题型要求：在 technical、deep_dive、scenario、behavioral 四类中合理搭配，尽量覆盖四类。")
    lines.append("")
    if basis_text:
        lines.append(basis_text)
    else:
        lines.append("知识依据：本岗位知识库没有检索到匹配材料，请只依据简历与 JD 出题，不要编造知识来源。")
    lines.append("")
    lines.append(f"请生成 {count} 道题。")
    return "\n".join(lines)


def _generate_questions(
    db: Session,
    owner_id: str,
    *,
    role: str,
    jd_body: str,
    resume_text: str,
    count: int,
    difficulty: str | None = None,
    kinds: list[str] | None = None,
) -> list[dict]:
    """调模型生成 3-5 道题；数量不足、格式非法或题型超出筛选直接报 MODEL_OUTPUT_INVALID。

    出题前按「岗位 + JD/简历要点」检索知识库并把命中片段作为「知识依据」注入 prompt；
    生成后按每道题的题干再检索一次，把命中的出处落到 knowledge_refs（未命中为空）。
    """
    requested = [kind for kind in (kinds or []) if kind in QUESTION_KINDS]
    basis = _retrieve_knowledge_basis(db, role=role, jd_body=jd_body, resume_text=resume_text)
    user_prompt = _question_user_prompt(
        role=role,
        jd_body=jd_body,
        resume_text=resume_text,
        count=count,
        difficulty=difficulty,
        kinds=requested,
        basis_text=_format_knowledge_basis(basis),
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
        if raw_kind in QUESTION_KINDS or raw_kind in LEGACY_KIND_ALIASES:
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
    if requested:
        allowed = set(requested) | {
            alias for alias, canonical in LEGACY_KIND_ALIASES.items() if canonical in requested
        }
        filtered = [item for item in items if item["kind"] in allowed]
        if len(filtered) != len(items):
            logger.warning("丢弃不符合题型筛选的题目：requested=%s", requested)
        if len(filtered) < MIN_QUESTIONS:
            raise ModelOutputInvalid("模型返回的题型不符合筛选条件，请重试")
        items = filtered
    for item in items:
        item["difficulty"] = difficulty
        item["knowledge_refs"] = _knowledge_refs_for_question(db, role=role, prompt=item["prompt"])
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
        difficulty=question.difficulty,  # type: ignore[arg-type]
        knowledge_refs=list(question.knowledge_refs or []),
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
    filters = _generation_filters(difficulty=payload.difficulty, kinds=payload.kinds)
    questions = _generate_questions(
        db,
        owner_id,
        role=payload.role,
        jd_body=jd.body,
        resume_text=resume_text,
        count=payload.question_count,
        difficulty=filters.get("difficulty"),
        kinds=filters.get("kinds"),
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
            # 冻结本次出题的筛选条件；空 dict 表示不限，历史会话没有该键。
            "generationFilters": filters,
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
                difficulty=item.get("difficulty"),
                knowledge_refs=item.get("knowledge_refs") or [],
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
        report = dao.get_report(db, session.id)
        scores = _normalise_scores(report.content_scores) if report is not None else []
        summaries.append(
            InterviewSessionSummary(
                id=session.id,
                status=session.status,  # type: ignore[arg-type]
                role=session.role,
                rubric_version=session.rubric_version,
                question_count=dao.count_questions(db, session.id),
                answered_count=len({answer.question_id for answer in answers}),
                question_kinds=_question_kind_counts(dao.list_questions(db, session.id)),
                resume_title=(session.context_snapshot or {}).get("resumeTitle", ""),
                has_report=report is not None,
                dimension_scores=scores,
                average_score=_session_average(scores),
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
        filters=_filters_view(_stored_filters(snapshot)),
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


# --------------------------------------------------------------------------- #
# GET /interview/sessions/{id}/report/export
# --------------------------------------------------------------------------- #

# 报告里四个内容维度的中文标签；与前端 interviewReport.content.dims 一一对应。
_CONTENT_LABELS = {
    "correctness": "技术正确性",
    "depth": "知识深度",
    "rigor": "逻辑严谨性",
    "fit": "岗位匹配度",
}
_CLARITY_LABELS = {"good": "良好", "fair": "一般", "needs_work": "需改进"}
_TIMING_LABELS = {
    "timestamps": "语速与停顿按云端词/句级时间戳计算",
    "duration": "语速按字数 ÷ 时长计算（无时间戳）",
    "mixed": "语速分母混合了时间戳与录音时长",
}


def _md_list(items: list[str]) -> str:
    if not items:
        return "（无）"
    return "\n".join(f"- {item}" for item in items)


def _md_table_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def _render_report_markdown(session: InterviewSession, report: InterviewReport, expression: object) -> str:
    """把一条已冻结的评估报告渲染成 Markdown；表达维度来自真实语音指标或「不适用」。"""
    scores = _normalise_scores(report.content_scores)
    evidence_count = sum(1 for score in scores if score.evidence)

    lines = [
        f"# 面试评估报告 · {session.role}",
        "",
        f"- 岗位：{session.role}",
        f"- 量表版本：{report.rubric_version}（已冻结）",
        f"- 报告生成时间：{report.created_at.isoformat(timespec='minutes')}",
        f"- 会话编号：{session.id}",
        "",
        "## 总体摘要",
        "",
        report.summary.strip() or "（模型未给出总体摘要）",
        "",
        "## 内容维度",
        "",
        "| 维度 | 分数 | 证据 |",
        "| --- | --- | --- |",
    ]
    for score in scores:
        label = _CONTENT_LABELS.get(score.dimension, score.dimension)
        value = str(score.score) if score.score is not None else "证据不足"
        evidence = "<br>".join(_md_table_cell(item) for item in score.evidence) or "暂无可引用的回答原文。"
        lines.append(f"| {label} | {value} | {evidence} |")

    lines += [
        "",
        "## 亮点",
        "",
        _md_list(list(report.highlights or [])),
        "",
        "## 不足",
        "",
        _md_list(list(report.gaps or [])),
        "",
        "## 改进建议",
        "",
        _md_list(list(report.suggestions or [])),
        "",
        "## 表达维度",
        "",
    ]

    has_audio = bool(getattr(expression, "has_audio", False))
    if not has_audio:
        lines += [
            "- 语速：不适用（本场没有音频轨，无法测量，不参与计分）",
            "- 清晰度：不适用（本场没有音频轨，无法测量，不参与计分）",
        ]
    else:
        pace = getattr(expression, "pace_chars_per_min", None)
        clarity = getattr(expression, "clarity_level", None)
        timing = getattr(expression, "timing_source", None)
        if pace is None:
            lines.append("- 语速：不适用（有录音但缺少可核对转写，无法测量）")
        else:
            lines.append(f"- 语速：{pace} 字/分（真实录音实测）")
        if clarity is None:
            lines.append("- 清晰度：不适用（有录音但缺少可核对转写，无法测量）")
        else:
            clarity_score = getattr(expression, "clarity_score", None)
            fillers = getattr(expression, "filler_count", 0)
            pauses = getattr(expression, "pause_count", None)
            parts = [f"填充词 {fillers} 次"]
            if pauses is not None:
                parts.append(f"停顿 {pauses} 次")
            score_text = f"{clarity_score} 分 · " if clarity_score is not None else ""
            lines.append(
                f"- 清晰度：{_CLARITY_LABELS.get(str(clarity), clarity)}（{score_text}{'，'.join(parts)}）"
            )
        if timing is not None:
            lines.append(f"- 指标口径：{_TIMING_LABELS.get(str(timing), timing)}")

    lines += [
        f"- 自信度：有依据的估计（依据 {evidence_count} 处作答措辞给出，不来自声学信号）",
        "",
        "---",
        "",
        "本报告由模拟面试自动生成，量表版本随报告冻结，证据均逐字引自候选人作答原话。",
    ]
    return "\n".join(lines) + "\n"


def export_report_markdown(db: Session, owner_id: str, session_id: str) -> tuple[str, str]:
    """渲染一场已结束面试的评估报告为 Markdown，并返回用于文件名的标题。"""
    session = _get_owned_session(db, owner_id, session_id)
    report = dao.get_report(db, session.id)
    if report is None:
        raise ResourceNotFound("本场面试还没有评估报告")
    expression = speech_service.summarize_session_expression(db, owner_id, session.id)
    title = f"面试评估报告-{session.role}".strip("-") or "面试评估报告"
    return _render_report_markdown(session, report, expression), title

# --------------------------------------------------------------------------- #
# 聚合与聚合口径的公共工具
# --------------------------------------------------------------------------- #


def _round_half_up(value: float) -> int:
    """四舍五入到整数；避免 Python round 的「四舍六入五成双」影响展示分。"""
    return int(value + 0.5) if value >= 0 else -int(-value + 0.5)


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def _question_kind_counts(questions: list[InterviewQuestion]) -> dict[str, int]:
    """主问题题型计数；追问不计入历史记录的口径构成。"""
    counts: dict[str, int] = {}
    for question in questions:
        if question.kind == FOLLOW_UP_KIND:
            continue
        counts[question.kind] = counts.get(question.kind, 0) + 1
    return counts


def _normalise_scores(raw: object) -> list[InterviewReportScore]:
    """把存储的 content_scores 收敛成固定四维、固定顺序；缺失维度 score=null。"""
    by_dimension: dict[str, InterviewReportScore] = {}
    if isinstance(raw, list):
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            dimension = _as_text(entry.get("dimension")).lower()
            if dimension not in CONTENT_DIMENSIONS or dimension in by_dimension:
                continue
            by_dimension[dimension] = InterviewReportScore(
                dimension=dimension,  # type: ignore[arg-type]
                score=_coerce_score(entry.get("score")),
                evidence=_as_text_list(entry.get("evidence"), limit=3),
            )
    return [
        by_dimension.get(
            dimension,
            InterviewReportScore(dimension=dimension, score=None, evidence=[]),  # type: ignore[arg-type]
        )
        for dimension in CONTENT_DIMENSIONS
    ]


def _dimension_score_map(scores: list[InterviewReportScore]) -> dict[str, int | None]:
    return {score.dimension: score.score for score in scores}


def _session_average(scores: list[InterviewReportScore]) -> int | None:
    values = [score.score for score in scores if score.score is not None]
    if not values:
        return None
    return _round_half_up(sum(values) / len(values))


def _caliber_key(role: str, rubric_version: str) -> str:
    return f"{role}|{rubric_version}"


def _practice_item_view(item: PracticeItem) -> PracticeItemView:
    return PracticeItemView(
        id=item.id,
        role=item.role,
        dimension=item.dimension,  # type: ignore[arg-type]
        goal=item.goal,
        material=item.material,
        status=item.status,
        source_report_id=item.source_report_id,
        source_session_id=item.source_session_id,
        rubric_version=item.rubric_version,
        retest_session_id=item.retest_session_id,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


# --------------------------------------------------------------------------- #
# GET /interview/growth
# --------------------------------------------------------------------------- #


def list_growth(db: Session, owner_id: str, role: str | None = None) -> InterviewGrowthView:
    """按 role + rubric_version 聚合真实场次的四维分数序列与平均值。

    只认已经产出报告的场次：成长曲线的每个点都对应一条真实会话记录，
    绝不使用写死常量。同一口径（岗位 + 量表版本）才成组。
    """
    sessions = dao.list_sessions_with_reports(db, owner_id, role)
    grouped: dict[tuple[str, str], list[tuple[InterviewSession, InterviewReport]]] = {}
    order: list[tuple[str, str]] = []
    for session in sessions:
        report = dao.get_report(db, session.id)
        if report is None:  # pragma: no cover - join 已保证有报告
            continue
        caliber = (session.role, session.rubric_version)
        if caliber not in grouped:
            grouped[caliber] = []
            order.append(caliber)
        grouped[caliber].append((session, report))

    series: list[InterviewGrowthSeries] = []
    calibers: list[InterviewCaliberView] = []
    for caliber in order:
        role_name, rubric = caliber
        entries = grouped[caliber]
        meta = InterviewCaliberView(
            key=_caliber_key(role_name, rubric),
            role=role_name,
            rubric_version=rubric,
            session_count=len(entries),
        )
        calibers.append(meta)
        points: list[InterviewGrowthPoint] = []
        dimension_values: dict[str, list[float]] = {dimension: [] for dimension in CONTENT_DIMENSIONS}
        for session, report in entries:
            scores = _normalise_scores(report.content_scores)
            score_map = _dimension_score_map(scores)
            for dimension in CONTENT_DIMENSIONS:
                value = score_map.get(dimension)
                if value is not None:
                    dimension_values[dimension].append(float(value))
            points.append(
                InterviewGrowthPoint(
                    session_id=session.id,
                    role=session.role,
                    rubric_version=session.rubric_version,
                    correctness=score_map.get("correctness"),
                    depth=score_map.get("depth"),
                    rigor=score_map.get("rigor"),
                    fit=score_map.get("fit"),
                    average=_session_average(scores),
                    created_at=session.created_at,
                )
            )
        averages = InterviewDimensionAverages(
            correctness=_mean(dimension_values["correctness"]),
            depth=_mean(dimension_values["depth"]),
            rigor=_mean(dimension_values["rigor"]),
            fit=_mean(dimension_values["fit"]),
            overall=_mean([float(point.average) for point in points if point.average is not None]),
        )
        series.append(InterviewGrowthSeries(caliber=meta, points=points, averages=averages))

    primary_key: str | None = None
    if grouped:
        primary = max(
            order,
            key=lambda caliber: (len(grouped[caliber]), max(entry[0].created_at for entry in grouped[caliber])),
        )
        primary_key = _caliber_key(*primary)
        series.sort(key=lambda item: item.caliber.key != primary_key)

    return InterviewGrowthView(
        role=role,
        primary_caliber_key=primary_key,
        calibers=calibers,
        series=series,
        total_sessions=len(sessions),
    )


# --------------------------------------------------------------------------- #
# GET /interview/comparison
# --------------------------------------------------------------------------- #


def _comparison_session(db: Session, session: InterviewSession) -> InterviewComparisonSession:
    report = dao.get_report(db, session.id)
    scores = _normalise_scores(report.content_scores) if report is not None else _normalise_scores([])
    answers = dao.list_answers(db, session.id)
    return InterviewComparisonSession(
        id=session.id,
        role=session.role,
        rubric_version=session.rubric_version,
        average=_session_average(scores),
        scores=scores,
        question_count=dao.count_questions(db, session.id),
        answered_count=len({answer.question_id for answer in answers}),
        created_at=session.created_at,
    )


def compare_sessions(db: Session, owner_id: str, a_id: str, b_id: str) -> InterviewComparisonView:
    """两次场次的口径校验：同岗位且同量表版本才允许连线。"""
    first = _get_owned_session(db, owner_id, a_id)
    second = _get_owned_session(db, owner_id, b_id)
    same_role = first.role == second.role
    same_rubric = first.rubric_version == second.rubric_version
    if same_role and same_rubric:
        reason = CALIBER_SAME
    elif not same_role and not same_rubric:
        reason = CALIBER_ROLE_AND_RUBRIC_MISMATCH
    elif not same_role:
        reason = CALIBER_ROLE_MISMATCH
    else:
        reason = CALIBER_RUBRIC_MISMATCH
    return InterviewComparisonView(
        a=_comparison_session(db, first),
        b=_comparison_session(db, second),
        connectable=same_role and same_rubric,
        same_role=same_role,
        same_rubric_version=same_rubric,
        reason=reason,
    )


# --------------------------------------------------------------------------- #
# 练习项与复测
# --------------------------------------------------------------------------- #


def materialise_practice_items(
    db: Session, owner_id: str, payload: PracticeItemCreate
) -> list[PracticeItemView]:
    """把一份评估报告的 suggestions 落成练习项。

    薄弱维度 = 得分低于达标线或没有证据（score=null）的维度，按最弱优先排序；
    建议按该顺序逐条分配给维度。同一报告同一维度只落一条，重复调用幂等。
    """
    report = db.get(InterviewReport, payload.report_id)
    if report is None:
        raise ResourceNotFound(f"评估报告 {payload.report_id} 不存在")
    session = _get_owned_session(db, owner_id, report.session_id)

    scores = _normalise_scores(report.content_scores)
    score_map = _dimension_score_map(scores)
    weak = [
        dimension
        for dimension in CONTENT_DIMENSIONS
        if score_map.get(dimension) is None or (score_map[dimension] or 0) < PRACTICE_WEAK_THRESHOLD
    ]
    weak.sort(key=lambda dimension: (score_map.get(dimension) is None, score_map.get(dimension) or 0))
    targets = [payload.dimension] if payload.dimension is not None else weak

    suggestions = list(report.suggestions or [])
    gaps = list(report.gaps or [])
    now = _now()
    items: list[PracticeItem] = []
    for dimension in targets:
        existing = dao.get_practice_item_for_report_dimension(db, report.id, dimension)
        if existing is not None:
            items.append(existing)
            continue
        index = weak.index(dimension) if dimension in weak else 0
        goal = suggestions[index] if index < len(suggestions) else (suggestions[-1] if suggestions else "")
        material = gaps[index] if index < len(gaps) else (gaps[-1] if gaps else "")
        item = PracticeItem(
            id=_new_id("pti"),
            owner_id=owner_id,
            role=session.role,
            dimension=dimension,
            goal=goal,
            material=material,
            status="active",
            source_report_id=report.id,
            source_session_id=session.id,
            rubric_version=session.rubric_version,
            retest_session_id=None,
            created_at=now,
            updated_at=now,
        )
        dao.add_practice_item(db, item)
        items.append(item)
    db.commit()
    for item in items:
        db.refresh(item)
    return [_practice_item_view(item) for item in items]


def list_practice_items(db: Session, owner_id: str, role: str | None = None) -> list[PracticeItemView]:
    return [_practice_item_view(item) for item in dao.list_practice_items(db, owner_id, role)]


def _get_owned_practice_item(db: Session, owner_id: str, item_id: str) -> PracticeItem:
    item = dao.get_practice_item(db, item_id)
    if item is None or item.owner_id != owner_id:
        raise ResourceNotFound(f"练习项 {item_id} 不存在")
    return item


def update_practice_item(
    db: Session, owner_id: str, item_id: str, payload: PracticeItemUpdate
) -> PracticeItemView:
    item = _get_owned_practice_item(db, owner_id, item_id)
    if payload.goal is not None:
        item.goal = payload.goal.strip()
    if payload.status is not None:
        item.status = payload.status
    item.updated_at = _now()
    db.commit()
    db.refresh(item)
    return _practice_item_view(item)


def delete_practice_item(db: Session, owner_id: str, item_id: str) -> None:
    item = _get_owned_practice_item(db, owner_id, item_id)
    db.delete(item)
    db.commit()


def start_retest(db: Session, owner_id: str, item_id: str) -> PracticeItemRetestResult:
    """为练习项发起复测：按源场次冻结的简历/JD 且同量表版本生成新题。"""
    item = _get_owned_practice_item(db, owner_id, item_id)
    if item.retest_session_id:
        existing = dao.get_session(db, item.retest_session_id)
        if existing is not None and existing.owner_id == owner_id:
            return PracticeItemRetestResult(
                item=_practice_item_view(item),
                session=get_detail(db, owner_id, existing.id),
            )
    source = _get_owned_session(db, owner_id, item.source_session_id)
    snapshot = source.context_snapshot or {}
    filters = _stored_filters(snapshot)
    count = len([q for q in dao.list_questions(db, source.id) if q.kind != FOLLOW_UP_KIND])
    count = max(MIN_QUESTIONS, min(MAX_QUESTIONS, count or 4))
    questions = _generate_questions(
        db,
        owner_id,
        role=source.role,
        jd_body=str(snapshot.get("jdBody", "")),
        resume_text=_resume_text(snapshot.get("resumeSnapshot")),
        count=count,
        difficulty=filters.get("difficulty"),
        kinds=filters.get("kinds"),
    )
    now = _now()
    retest = InterviewSession(
        id=_new_id("ivs"),
        owner_id=owner_id,
        resume_id=source.resume_id,
        resume_version_id=source.resume_version_id,
        jd_id=source.jd_id,
        role=source.role,
        status="active",
        rubric_version=source.rubric_version,
        context_snapshot={**snapshot, "capturedAt": now.isoformat()},
        created_at=now,
        updated_at=now,
        completed_at=None,
    )
    dao.add_session(db, retest)
    for ordinal, entry in enumerate(questions, start=1):
        dao.add_question(
            db,
            InterviewQuestion(
                id=_new_id("ivq"),
                session_id=retest.id,
                ordinal=ordinal,
                kind=entry["kind"],
                prompt=entry["prompt"],
                reference_points=entry["reference_points"],
                difficulty=entry.get("difficulty"),
                knowledge_refs=entry.get("knowledge_refs") or [],
                parent_question_id=None,
                derived_from_answer_id=None,
                created_at=now,
            ),
        )
    item.retest_session_id = retest.id
    item.updated_at = now
    db.commit()
    db.refresh(item)
    return PracticeItemRetestResult(item=_practice_item_view(item), session=get_detail(db, owner_id, retest.id))


# --------------------------------------------------------------------------- #
# POST /interview/sessions/{id}/regenerate
# --------------------------------------------------------------------------- #


def regenerate_session(
    db: Session,
    owner_id: str,
    session_id: str,
    payload: InterviewSessionRegenerate | None = None,
) -> InterviewSessionDetail:
    """对未作答的场次重新生成题目；已有作答或已结束一律 409，不清空已有记录。

    可选 difficulty / kinds 覆盖筛选；都不传时沿用建场时冻结的筛选（旧会话为不限），
    因此「保留筛选条件」只作用于当前会话，不改写此前练习记录中的题目快照。
    """
    session = _get_owned_session(db, owner_id, session_id)
    if session.status != "active":
        raise InterviewSessionClosed("本场面试已结束，不能重新生成题目")
    if dao.list_answers(db, session.id):
        raise InterviewSessionClosed("本场已有作答，不能重新生成题目")

    snapshot = session.context_snapshot or {}
    stored = _stored_filters(snapshot)
    difficulty = (
        payload.difficulty
        if payload is not None and payload.difficulty is not None
        else stored.get("difficulty")
    )
    if payload is not None and payload.kinds:
        kinds = list(payload.kinds)
    else:
        kinds = list(stored.get("kinds") or [])
    filters = _generation_filters(difficulty=difficulty, kinds=kinds)

    count = len([q for q in dao.list_questions(db, session.id) if q.kind != FOLLOW_UP_KIND])
    count = max(MIN_QUESTIONS, min(MAX_QUESTIONS, count or 4))
    # 先生成、后删除：模型失败时不留下「题目被清空」的中间态。
    questions = _generate_questions(
        db,
        owner_id,
        role=session.role,
        jd_body=str(snapshot.get("jdBody", "")),
        resume_text=_resume_text(snapshot.get("resumeSnapshot")),
        count=count,
        difficulty=filters.get("difficulty"),
        kinds=filters.get("kinds"),
    )
    dao.delete_questions_for_session(db, session.id)
    now = _now()
    for ordinal, entry in enumerate(questions, start=1):
        dao.add_question(
            db,
            InterviewQuestion(
                id=_new_id("ivq"),
                session_id=session.id,
                ordinal=ordinal,
                kind=entry["kind"],
                prompt=entry["prompt"],
                reference_points=entry["reference_points"],
                difficulty=entry.get("difficulty"),
                knowledge_refs=entry.get("knowledge_refs") or [],
                parent_question_id=None,
                derived_from_answer_id=None,
                created_at=now,
            ),
        )
    session.context_snapshot = {**snapshot, "generationFilters": filters}
    session.updated_at = now
    db.commit()
    return get_detail(db, owner_id, session.id)


# --------------------------------------------------------------------------- #
# GET /interview/insights
# --------------------------------------------------------------------------- #


def get_insights(db: Session, owner_id: str, resume_version_id: str, jd_id: str) -> InterviewInsightsView:
    """用真实简历版本 + JD 内容调模型，产出匹配点 / 风险点 / 岗位范围关键词。

    失败时沿用既有可区分错误码：未配置模型 MODEL_NOT_CONFIGURED，
    模型输出非法 MODEL_OUTPUT_INVALID，上游拒绝/超时 UPSTREAM_REJECTED / UPSTREAM_TIMEOUT。
    """
    version = get_version(db, resume_version_id)
    if version is None:
        raise ResourceNotFound(f"简历版本 {resume_version_id} 不存在")
    resume = get_resume(db, version.resume_id)
    if resume is None or resume.owner_id != owner_id:
        raise ResourceNotFound(f"简历版本 {resume_version_id} 不存在")
    jd = get_jd(db, jd_id)
    if jd is None or jd.owner_id != owner_id:
        raise ResourceNotFound(f"岗位 {jd_id} 不存在")

    user_prompt = (
        f"目标岗位：{jd.role}"
        + (f"（{jd.company}）" if jd.company else "")
        + f"\n\n岗位 JD：\n{jd.body}\n\n"
        + f"候选人简历（版本快照）：\n{_resume_text(version.snapshot)}\n\n"
        + "请给出匹配点、风险点与岗位范围关键词。"
    )
    data = llm.chat_json(db, owner_id, system_prompt=_INSIGHTS_SYSTEM, user_prompt=user_prompt, max_tokens=2000)
    match_points = _as_text_list(data.get("matchPoints") or data.get("match_points"), limit=5)
    risk_points = _as_text_list(data.get("riskPoints") or data.get("risk_points"), limit=5)
    scope_keywords = _as_text_list(data.get("scopeKeywords") or data.get("scope_keywords"), limit=8)
    if not (match_points or risk_points or scope_keywords):
        raise ModelOutputInvalid("模型没有给出可用的准备洞察，请重试")
    return InterviewInsightsView(
        resume_version_id=version.id,
        jd_id=jd.id,
        match_points=match_points,
        risk_points=risk_points,
        scope_keywords=scope_keywords,
    )

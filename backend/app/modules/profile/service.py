import math
import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.modules.jd import dao as jd_dao
from app.modules.resume import dao as resume_dao
from app.modules.resume.schemas import ResumeBasics
from app.shared.errors import ResourceNotFound

from . import dao
from .models import Profile, ProfileFact
from .schemas import (
    Evidence,
    FactDeletionImpact,
    FactReference,
    JobMatchResponse,
    JobMatchResult,
    MatchGap,
    ProfileBasicsUpdate,
    ProfileFactCreate,
    ProfileFactUpdate,
)

DEFAULT_DISPLAY_NAME = "我的职业事实库"
BASICS_FIELDS = ("fullName", "headline", "email", "phone", "location")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _get_owned_fact(db: Session, profile: Profile, fact_id: str) -> ProfileFact:
    fact = dao.get_fact(db, fact_id)
    if fact is None or fact.profile_id != profile.id:
        raise ResourceNotFound(f"事实 {fact_id} 不存在")
    return fact


def get_or_create_profile(db: Session, owner_id: str) -> Profile:
    profile = dao.get_profile_by_owner(db, owner_id)
    if profile is None:
        now = _now()
        profile = Profile(
            id=_new_id("profile"),
            owner_id=owner_id,
            display_name=DEFAULT_DISPLAY_NAME,
            basics=ResumeBasics().model_dump(by_alias=True),
            created_at=now,
            updated_at=now,
        )
        dao.add_profile(db, profile)
        db.commit()
        db.refresh(profile)
    return profile


def completeness(basics: dict, fact_count: int) -> int:
    filled = sum(1 for key in BASICS_FIELDS if (basics or {}).get(key))
    if (basics or {}).get("links"):
        filled += 1
    return round(filled / 6 * 60 + min(fact_count, 5) / 5 * 40)


def list_facts(db: Session, owner_id: str, *, type: str | None = None) -> list[ProfileFact]:
    profile = get_or_create_profile(db, owner_id)
    return dao.list_facts(db, profile.id, type=type)


def get_fact(db: Session, owner_id: str, fact_id: str) -> ProfileFact:
    profile = get_or_create_profile(db, owner_id)
    return _get_owned_fact(db, profile, fact_id)


def create_fact(db: Session, owner_id: str, payload: ProfileFactCreate) -> ProfileFact:
    profile = get_or_create_profile(db, owner_id)
    evidence = payload.evidence or Evidence(status="unverified")
    verified = evidence.status == "verified"
    now = _now()
    fact = ProfileFact(
        id=_new_id("fact"),
        profile_id=profile.id,
        type=payload.type,
        title=payload.title,
        content=payload.content,
        tags=list(payload.tags),
        source="手动录入",
        evidence=evidence.model_dump(by_alias=True, exclude_none=True),
        confidence=0.9 if verified else 0.5,
        verified_at=now if verified else None,
        visibility=payload.visibility,
        created_at=now,
        updated_at=now,
    )
    dao.add_fact(db, fact)
    db.commit()
    db.refresh(fact)
    return fact


def update_fact(db: Session, owner_id: str, fact_id: str, payload: ProfileFactUpdate) -> ProfileFact:
    profile = get_or_create_profile(db, owner_id)
    fact = _get_owned_fact(db, profile, fact_id)
    if payload.evidence is not None:
        fact.evidence = payload.evidence.model_dump(by_alias=True, exclude_none=True)
        if payload.evidence.status == "verified":
            fact.verified_at = _now()
            fact.confidence = 0.9
        else:
            fact.verified_at = None
            fact.confidence = 0.5
    for attribute in ("type", "title", "content", "visibility"):
        value = getattr(payload, attribute)
        if value is not None:
            setattr(fact, attribute, value)
    if payload.tags is not None:
        fact.tags = list(payload.tags)
    fact.updated_at = _now()
    db.commit()
    db.refresh(fact)
    return fact


def delete_fact(db: Session, owner_id: str, fact_id: str) -> FactDeletionImpact:
    profile = get_or_create_profile(db, owner_id)
    fact = _get_owned_fact(db, profile, fact_id)
    references = reference_index(db, owner_id).get(fact_id, [])
    dao.delete_fact(db, fact)
    profile.updated_at = _now()
    db.commit()
    return FactDeletionImpact(fact_id=fact_id, referenced_by=references)


# ---------------------------------------------------------------------------
# 岗位匹配（POST /profile/match-job）
#
# 纯确定性规则，不调用任何模型：把 JD 正文拆成要求项，按字符/词元重合度
# 计算每条事实与要求项的覆盖情况，输出 JobMatchResult[] 与 MatchGap[]。
# 中文没有分词依赖，统一用「ASCII 词 + 汉字二元组」做词元，保证同输入同输出。
# ---------------------------------------------------------------------------

_ASCII_TOKEN = re.compile(r"[a-z0-9+#.]{2,}")
_HAN_RUN = re.compile(r"[\u4e00-\u9fff]+")
_REQUIREMENT_SPLIT = re.compile(r"[。；;！!？?\n\r，,]+")
_MAX_REQUIREMENTS = 8
_MAX_RESULTS = 5
_COVERED_THRESHOLD = 0.5
_PARTIAL_THRESHOLD = 0.2


def _tokens(text: str) -> set[str]:
    """ASCII 词元 + 汉字二元组；不依赖任何分词库或模型。"""
    lowered = (text or "").lower()
    tokens = set(_ASCII_TOKEN.findall(lowered))
    for run in _HAN_RUN.findall(text or ""):
        if len(run) == 1:
            tokens.add(run)
            continue
        for index in range(len(run) - 1):
            tokens.add(run[index : index + 2])
    return tokens


def _fact_tokens(fact: ProfileFact) -> set[str]:
    return _tokens(" ".join([fact.title, fact.content, " ".join(fact.tags or [])]))


def _requirements(jd) -> list[str]:
    segments = [segment.strip() for segment in _REQUIREMENT_SPLIT.split(jd.body or "")]
    requirements = [segment for segment in segments if len(segment) >= 2]
    if not requirements:
        requirements = [jd.role] if jd.role else []
    return requirements[:_MAX_REQUIREMENTS]


def match_job(db: Session, owner_id: str, jd_id: str) -> JobMatchResponse:
    jd = jd_dao.get_jd(db, jd_id)
    if jd is None or jd.owner_id != owner_id:
        raise ResourceNotFound(f"岗位 {jd_id} 不存在")

    profile = get_or_create_profile(db, owner_id)
    facts = dao.list_facts(db, profile.id)
    jd_tokens = _tokens(" ".join([jd.role or "", jd.company or "", jd.body or "", " ".join(jd.tags or [])]))
    fact_tokens = [(fact, _fact_tokens(fact)) for fact in facts]

    scored: list[tuple[float, ProfileFact, set[str]]] = []
    for fact, tokens in fact_tokens:
        overlap = jd_tokens & tokens
        if not overlap:
            continue
        denominator = math.sqrt(len(jd_tokens) * len(tokens))
        relevance = round(len(overlap) / denominator, 3) if denominator else 0.0
        scored.append((relevance, fact, overlap))
    scored.sort(key=lambda item: (-item[0], item[1].title))

    results = [
        JobMatchResult(
            fact_id=fact.id,
            fact_title=fact.title,
            relevance=relevance,
            reason=", ".join(sorted(overlap)),
            evidence_status=(fact.evidence or {}).get("status", "unverified"),
        )
        for relevance, fact, overlap in scored[:_MAX_RESULTS]
    ]

    gaps: list[MatchGap] = []
    for requirement in _requirements(jd):
        requirement_tokens = _tokens(requirement)
        best_ratio = 0.0
        best_fact: ProfileFact | None = None
        for fact, tokens in fact_tokens:
            if not requirement_tokens or not tokens:
                continue
            ratio = len(requirement_tokens & tokens) / len(requirement_tokens)
            if ratio > best_ratio:
                best_ratio = ratio
                best_fact = fact
        if best_ratio >= _COVERED_THRESHOLD:
            status = "covered"
        elif best_ratio >= _PARTIAL_THRESHOLD:
            status = "partial"
        else:
            status = "missing"
        gaps.append(
            MatchGap(
                requirement=requirement,
                status=status,
                note=best_fact.title if best_fact is not None and best_ratio > 0 else "",
            )
        )

    return JobMatchResponse(results=results, gaps=gaps)


def update_basics(db: Session, owner_id: str, payload: ProfileBasicsUpdate) -> Profile:
    profile = get_or_create_profile(db, owner_id)
    basics = dict(profile.basics or {})
    basics.update(payload.model_dump(exclude_none=True, by_alias=True))
    profile.basics = basics
    profile.updated_at = _now()
    db.commit()
    db.refresh(profile)
    return profile


def reference_index(db: Session, owner_id: str) -> dict[str, list[FactReference]]:
    """Map fact id to the resume versions whose document cites it."""
    titles = {resume.id: resume.title for resume in resume_dao.list_owner_resumes(db, owner_id)}
    index: dict[str, list[FactReference]] = {}
    for version in resume_dao.list_all_versions(db, owner_id):
        for fact_id in _document_fact_ids(version.snapshot or {}):
            index.setdefault(fact_id, []).append(
                FactReference(
                    resume_id=version.resume_id,
                    resume_title=titles.get(version.resume_id, ""),
                    version_id=version.id,
                )
            )
    return index


def _document_fact_ids(document: dict) -> set[str]:
    fact_ids: set[str] = set()
    for section in document.get("sections", []):
        for entry in section.get("entries", []):
            fact_id = (entry.get("provenance") or {}).get("factId")
            if fact_id:
                fact_ids.add(fact_id)
    return fact_ids

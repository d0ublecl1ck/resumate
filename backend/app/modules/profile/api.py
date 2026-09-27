from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import require_permission
from app.modules.resume.schemas import ResumeBasics

from . import service
from .models import Profile, ProfileFact
from .schemas import (
    Evidence,
    FactDeletionImpact,
    FactReference,
    ProfileBasicsUpdate,
    ProfileFactCreate,
    ProfileFactResponse,
    ProfileFactUpdate,
    ProfileResponse,
)

router = APIRouter(tags=["profile"])


def _fact_response(fact: ProfileFact, references: list[FactReference]) -> ProfileFactResponse:
    return ProfileFactResponse(
        id=fact.id,
        type=fact.type,
        title=fact.title,
        content=fact.content,
        tags=fact.tags,
        source=fact.source,
        evidence=Evidence.model_validate(fact.evidence),
        confidence=fact.confidence,
        verified_at=fact.verified_at,
        visibility=fact.visibility,
        referenced_by=references,
    )


def _profile_response(db: Session, profile: Profile, facts: list[ProfileFact]) -> ProfileResponse:
    references = service.reference_index(db, profile.owner_id)
    return ProfileResponse(
        id=profile.id,
        owner_id=profile.owner_id,
        display_name=profile.display_name,
        completeness=service.completeness(profile.basics, len(facts)),
        basics=ResumeBasics.model_validate(profile.basics),
        facts=[_fact_response(fact, references.get(fact.id, [])) for fact in facts],
        versions=[],
    )


@router.get("/profile", response_model=ProfileResponse)
def get_profile(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("profile:read")),
) -> ProfileResponse:
    profile = service.get_or_create_profile(db, user.id)
    return _profile_response(db, profile, service.list_facts(db, user.id))


@router.patch("/profile/basics", response_model=ProfileResponse)
def update_basics(
    payload: ProfileBasicsUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("profile:write")),
) -> ProfileResponse:
    profile = service.update_basics(db, user.id, payload)
    return _profile_response(db, profile, service.list_facts(db, user.id))


@router.get("/profile/facts", response_model=list[ProfileFactResponse])
def get_facts(
    type: str | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("profile:read")),
) -> list[ProfileFactResponse]:
    references = service.reference_index(db, user.id)
    return [_fact_response(fact, references.get(fact.id, [])) for fact in service.list_facts(db, user.id, type=type)]


@router.post("/profile/facts", response_model=ProfileFactResponse, status_code=status.HTTP_201_CREATED)
def create_fact(
    payload: ProfileFactCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("profile:write")),
) -> ProfileFactResponse:
    fact = service.create_fact(db, user.id, payload)
    return _fact_response(fact, [])


@router.get("/profile/facts/{fact_id}", response_model=ProfileFactResponse)
def get_fact(
    fact_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("profile:read")),
) -> ProfileFactResponse:
    fact = service.get_fact(db, user.id, fact_id)
    return _fact_response(fact, service.reference_index(db, user.id).get(fact_id, []))


@router.patch("/profile/facts/{fact_id}", response_model=ProfileFactResponse)
def update_fact(
    fact_id: str,
    payload: ProfileFactUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("profile:write")),
) -> ProfileFactResponse:
    fact = service.update_fact(db, user.id, fact_id, payload)
    return _fact_response(fact, service.reference_index(db, user.id).get(fact_id, []))


@router.delete("/profile/facts/{fact_id}", response_model=FactDeletionImpact)
def delete_fact(
    fact_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("profile:write")),
) -> FactDeletionImpact:
    return service.delete_fact(db, user.id, fact_id)

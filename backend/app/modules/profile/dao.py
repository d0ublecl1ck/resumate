from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Profile, ProfileFact


def get_profile_by_owner(db: Session, owner_id: str) -> Profile | None:
    return db.scalar(select(Profile).where(Profile.owner_id == owner_id))


def add_profile(db: Session, profile: Profile) -> None:
    db.add(profile)


def list_facts(db: Session, profile_id: str, *, type: str | None = None) -> list[ProfileFact]:
    statement = select(ProfileFact).where(ProfileFact.profile_id == profile_id)
    if type:
        statement = statement.where(ProfileFact.type == type)
    statement = statement.order_by(ProfileFact.created_at.desc())
    return list(db.scalars(statement))


def get_fact(db: Session, fact_id: str) -> ProfileFact | None:
    return db.get(ProfileFact, fact_id)


def add_fact(db: Session, fact: ProfileFact) -> None:
    db.add(fact)


def delete_fact(db: Session, fact: ProfileFact) -> None:
    db.delete(fact)

from dataclasses import dataclass

from fastapi import Query


@dataclass(frozen=True)
class CurrentUser:
    id: str
    display_name: str
    role: str = "user"


@dataclass(frozen=True)
class PaginationParams:
    page: int
    size: int


def get_pagination(page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100)) -> PaginationParams:
    return PaginationParams(page=page, size=size)

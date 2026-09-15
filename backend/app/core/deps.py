"""Shared FastAPI dependencies: pagination parameters and auth placeholders."""

from dataclasses import dataclass

from fastapi import Query


@dataclass(frozen=True)
class PaginationParams:
    page: int
    size: int


def get_pagination(page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100)) -> PaginationParams:
    """Parse and validate common pagination query parameters."""

    return PaginationParams(page=page, size=size)


def get_current_user() -> dict[str, str]:
    """Auth placeholder dependency; replace with real authentication."""

    raise NotImplementedError("Authentication is not configured yet.")

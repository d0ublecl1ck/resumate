from datetime import datetime
from typing import Literal

from app.shared.schemas import ApiModel

TemplateStatus = Literal["draft", "validating", "validation_failed", "published", "retired"]


class TemplateResponse(ApiModel):
    id: str
    name: str
    status: TemplateStatus
    revision: int
    reference_count: int
    publisher: str
    published_at: datetime | None = None
    retired_reason: str | None = None
    validation_errors: list[str]

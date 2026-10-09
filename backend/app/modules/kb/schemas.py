from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.shared.schemas import ApiModel

KbSourceType = Literal["markdown", "text"]
KbSearchStatus = Literal["matched", "no_match"]


class KbDocumentCreate(ApiModel):
    """POST /kb/documents：导入一段知识文档，服务端负责切片。

    body 用 min_length 挡住空串，纯空白由 field_validator 再次拦截，保证
    「空文档」不会落库成 0 切片的空壳。
    """

    title: str = Field(min_length=1, max_length=200)
    role: str = Field(min_length=1, max_length=200)
    source_type: KbSourceType = "markdown"
    body: str = Field(min_length=1, max_length=200_000)

    @field_validator("title", "role", "body")
    @classmethod
    def _require_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("标题、岗位与文档内容不能为空")
        return stripped


class KbDocumentView(ApiModel):
    id: str
    title: str
    role: str
    source_type: KbSourceType
    chunk_count: int
    created_at: datetime


class KbSearchHit(ApiModel):
    chunk_id: str
    document_id: str
    document_title: str
    heading: str | None = None
    # 可直接展示的出处：有标题时是「文档标题 · 小节标题」。
    source: str
    content: str
    summary: str
    score: float
    rank: int


class KbSearchResult(ApiModel):
    """检索结果：无命中时 status=no_match 且 results 为空，绝不伪造引用。"""

    query: str
    role: str | None = None
    status: KbSearchStatus
    total: int = 0
    results: list[KbSearchHit] = Field(default_factory=list)

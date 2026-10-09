from datetime import datetime

from pydantic import Field, field_validator

from app.shared.schemas import ApiModel


class JobDescriptionCreate(ApiModel):
    role: str
    body: str
    company: str | None = None
    source_url: str | None = None
    tags: list[str] = Field(default_factory=list)

    @field_validator("role", "body")
    @classmethod
    def _require_content(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("岗位名称和正文不能为空")
        return stripped


class JobDescriptionUpdate(ApiModel):
    role: str | None = None
    body: str | None = None
    company: str | None = None
    source_url: str | None = None
    tags: list[str] | None = None

    @field_validator("role", "body")
    @classmethod
    def _require_content(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("岗位名称和正文不能为空")
        return stripped


class BindingUpdate(ApiModel):
    resume_id: str


class JdParseRequest(ApiModel):
    text: str

    @field_validator("text")
    @classmethod
    def _require_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("岗位文本不能为空")
        return stripped


# 图片识别上限：业务上限 8 MB；schema 层再放宽到 16 MB 硬顶，
# 让 8 MB 以上的请求由 decode_image 给出「图片过大」的明确文案，而不是 pydantic 默认文案。
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_BASE64_CHARS = 16 * 1024 * 1024


class JdImageParseRequest(ApiModel):
    """POST /jds:parse-image：上传岗位截图，交给支持图像的模型结构化。

    imageBase64 走 JSON（与 /speech/transcribe 同一形态，仓库无 multipart 依赖）；
    contentType 可省略，服务端按魔数嗅探真实类型；只接受 png/jpeg/webp。
    """

    image_base64: str = Field(min_length=1, max_length=MAX_IMAGE_BASE64_CHARS)
    content_type: str | None = Field(default=None, max_length=100)
    filename: str | None = Field(default=None, max_length=200)


class ProposedJdExtracted(ApiModel):
    label: str
    value: str


class ProposedJdResponse(ApiModel):
    """Wire shape of the front-end ProposedJd (issue fb67d)."""

    role: str
    company: str | None = None
    tags: list[str] = Field(default_factory=list)
    body: str
    source_url: str | None = None
    extracted: list[ProposedJdExtracted] = Field(default_factory=list)
    parse_confidence: float
    note: str
    input_source: str


class JobDescriptionResponse(ApiModel):
    id: str
    owner_id: str
    role: str
    company: str | None = None
    body: str
    source_url: str | None = None
    tags: list[str]
    revision: int
    created_at: datetime
    updated_at: datetime
    bound_resume_id: str | None = None
    bound_resume_available: bool | None = None

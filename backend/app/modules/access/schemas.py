from datetime import datetime
from typing import Literal

from pydantic import Field

from app.shared.schemas import ApiModel

PatStatus = Literal["active", "expiring", "revoked"]
AccessResult = Literal["allowed", "denied", "frozen"]


class PersonalAccessTokenResponse(ApiModel):
    id: str
    name: str
    scopes: list[str]
    resources: list[str]
    fields: list[str]
    purpose: str
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime | None = None
    status: PatStatus
    # Returned only by the create call; never persisted in plaintext.
    secret_once: str | None = None


class PersonalAccessTokenCreate(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: list[str] = Field(min_length=1)
    purpose: str = Field(default="", max_length=200)
    resources: list[str] = Field(default_factory=list)
    fields: list[str] = Field(default_factory=list)
    expires_in_days: int = Field(default=90, ge=1, le=3650)


class AccessLogResponse(ApiModel):
    id: str
    at: datetime
    client_id: str
    scope: str
    resource: str
    purpose: str
    result: AccessResult
    error_code: str | None = None


class CapabilityDiscoveryResponse(ApiModel):
    contract_version: str
    openapi_url: str
    mcp_url: str
    well_known_url: str
    auth_methods: list[str]
    capabilities: list[str]

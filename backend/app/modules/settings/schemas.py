from datetime import datetime
from typing import Literal

from pydantic import Field

from app.shared.schemas import ApiModel

ExecutionMode = Literal["approval", "full_access"]
Theme = Literal["paper", "dark"]


class Shortcut(ApiModel):
    action: str
    keys: str
    conflict: bool | None = None


class AgentBudget(ApiModel):
    max_tokens: int = Field(ge=1, le=1_000_000)
    max_turns: int = Field(ge=1, le=100)
    max_cost_usd: float = Field(ge=0, le=10_000)


class AgentConfigResponse(ApiModel):
    current_run_mode: ExecutionMode | None = None
    next_run_mode: ExecutionMode
    mode_source: Literal["session", "agent", "account"]
    full_access_scopes: list[str]
    confirm_retained_ops: list[str]
    budget: AgentBudget


class AgentConfigUpdate(ApiModel):
    next_run_mode: ExecutionMode | None = None
    budget: AgentBudget | None = None


class ModelTestResult(ApiModel):
    at: datetime
    ok: bool
    message: str


class ModelConfigResponse(ApiModel):
    provider: str
    endpoint: str
    model: str
    key_configured: bool
    last_test: ModelTestResult | None = None


class ModelConfigUpdate(ApiModel):
    provider: str | None = None
    endpoint: str | None = None
    model: str | None = None
    # Write-only: accepted on PUT and :test, never returned.
    api_key: str | None = Field(default=None, max_length=400)


class UserPreferencesResponse(ApiModel):
    theme: Theme
    language: str
    display_name: str
    autosave: bool
    default_template_id: str
    default_template_retired: bool = False
    shortcuts: list[Shortcut] = Field(default_factory=list)


class UserPreferencesUpdate(ApiModel):
    theme: Theme | None = None
    language: str | None = Field(default=None, min_length=1, max_length=35)
    display_name: str | None = Field(default=None, max_length=200)
    autosave: bool | None = None
    default_template_id: str | None = Field(default=None, max_length=36)
    shortcuts: list[Shortcut] | None = None

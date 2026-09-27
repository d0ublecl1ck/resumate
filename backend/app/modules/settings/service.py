import base64
import copy
import hashlib
from collections import Counter
from datetime import datetime, timezone
from uuid import uuid4

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.modules.templates import dao as templates_dao
from app.shared.errors import ValidationFailed

from . import catalog, dao
from .models import UserSettings
from .schemas import (
    AgentBudget,
    AgentConfigResponse,
    AgentConfigUpdate,
    ModelCatalogModel,
    ModelCatalogProvider,
    ModelCatalogResponse,
    ModelConfigResponse,
    ModelConfigUpdate,
    ModelTestResult,
    Shortcut,
    UserPreferencesResponse,
    UserPreferencesUpdate,
)

DEFAULT_THEME = "paper"
DEFAULT_LANGUAGE = "zh-CN"
DEFAULT_AUTOSAVE = True
# Stable action keys; the UI maps them through settings.preferences.shortcutAction.*.
DEFAULT_SHORTCUTS: list[dict] = [
    {"action": "save_flush", "keys": "⌘ S"},
    {"action": "send_message", "keys": "⌘ ↵"},
    {"action": "open_history", "keys": "⌘ H"},
    {"action": "accept_all_diff", "keys": "⌘ ⇧ A"},
]
DEFAULT_AGENT_CONFIG: dict = {
    "nextRunMode": "approval",
    "budget": {"maxTokens": 20000, "maxTurns": 8, "maxCostUsd": 0.5},
}
DEFAULT_MODEL_CONFIG: dict = {"provider": "", "endpoint": "", "model": ""}

# Stable policy keys; the UI maps them through settings.agent.fullAccessScope.* /
# settings.agent.confirmRetainedOp.* so the copy follows the active locale.
FULL_ACCESS_SCOPES = ["read_search_compare_render", "content_patch", "metadata_update_archive"]
CONFIRM_RETAINED_OPS = ["delete", "history_restore", "overwrite_export", "profile_to_resume", "fact_promotion"]

# Marks a Fernet ciphertext so keys written before encryption existed still read.
ENCRYPTED_PREFIX = "fernet:"


def _fernet() -> Fernet:
    secret = get_settings().settings_secret_key or "resumate-local-dev-secret"
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def _encrypt_secret(value: str) -> str:
    return ENCRYPTED_PREFIX + _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def _decrypt_secret(value: str) -> str | None:
    """Return the plaintext key, or None when it cannot be decrypted."""
    if not value.startswith(ENCRYPTED_PREFIX):
        return value or None
    try:
        return _fernet().decrypt(value[len(ENCRYPTED_PREFIX):].encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def _normalize_keys(keys: str) -> str:
    return " ".join(keys.split()).lower()


def _validate_shortcuts(shortcuts: list[Shortcut]) -> None:
    owner: dict[str, str] = {}
    for shortcut in shortcuts:
        normalized = _normalize_keys(shortcut.keys)
        if not normalized:
            continue
        if normalized in owner:
            raise ValidationFailed(f"按键 {shortcut.keys} 已绑定给「{owner[normalized]}」，请先解除冲突")
        owner[normalized] = shortcut.action


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return f"settings_{uuid4().hex[:12]}"


def get_or_create(db: Session, user: CurrentUser) -> UserSettings:
    """Return the owner settings row, creating defaults on first access."""
    settings = dao.get_by_owner(db, user.id)
    if settings is None:
        now = _now()
        settings = UserSettings(
            id=_new_id(),
            owner_id=user.id,
            preferences={
                "theme": DEFAULT_THEME,
                "language": DEFAULT_LANGUAGE,
                "displayName": user.display_name,
                "autosave": DEFAULT_AUTOSAVE,
                "defaultTemplateId": "",
                "shortcuts": copy.deepcopy(DEFAULT_SHORTCUTS),
            },
            agent_config=copy.deepcopy(DEFAULT_AGENT_CONFIG),
            model_config=copy.deepcopy(DEFAULT_MODEL_CONFIG),
            created_at=now,
            updated_at=now,
        )
        dao.add(db, settings)
        db.commit()
        db.refresh(settings)
    return settings


def _template_available(db: Session, template_id: str) -> bool:
    if not template_id:
        return True
    template = templates_dao.get_template(db, template_id)
    return template is not None and template.status == "published"


def _preferences(db: Session, settings: UserSettings) -> UserPreferencesResponse:
    prefs = settings.preferences or {}
    template_id = prefs.get("defaultTemplateId", "")
    shortcuts = [Shortcut.model_validate(item) for item in prefs.get("shortcuts", [])]
    counts = Counter(_normalize_keys(item.keys) for item in shortcuts if item.keys.strip())
    for shortcut in shortcuts:
        if counts[_normalize_keys(shortcut.keys)] > 1:
            shortcut.conflict = True
    return UserPreferencesResponse(
        theme=prefs.get("theme", DEFAULT_THEME),
        language=prefs.get("language", DEFAULT_LANGUAGE),
        display_name=prefs.get("displayName", ""),
        autosave=prefs.get("autosave", DEFAULT_AUTOSAVE),
        default_template_id=template_id,
        default_template_retired=not _template_available(db, template_id),
        shortcuts=shortcuts,
    )


def _agent_config(settings: UserSettings) -> AgentConfigResponse:
    config = settings.agent_config or {}
    budget = config.get("budget", {})
    return AgentConfigResponse(
        current_run_mode=None,
        next_run_mode=config.get("nextRunMode", "approval"),
        mode_source="account",
        full_access_scopes=list(FULL_ACCESS_SCOPES),
        confirm_retained_ops=list(CONFIRM_RETAINED_OPS),
        budget=AgentBudget(
            max_tokens=budget.get("maxTokens", 20000),
            max_turns=budget.get("maxTurns", 8),
            max_cost_usd=budget.get("maxCostUsd", 0.5),
        ),
    )


def _model_config(settings: UserSettings) -> ModelConfigResponse:
    config = settings.model_config or {}
    last_test = config.get("lastTest")
    return ModelConfigResponse(
        provider=config.get("provider", ""),
        endpoint=config.get("endpoint", ""),
        model=config.get("model", ""),
        key_configured=bool(config.get("apiKey")),
        last_test=ModelTestResult.model_validate(last_test) if last_test else None,
    )


def get_preferences(db: Session, user: CurrentUser) -> UserPreferencesResponse:
    return _preferences(db, get_or_create(db, user))


def update_preferences(db: Session, user: CurrentUser, payload: UserPreferencesUpdate) -> UserPreferencesResponse:
    settings = get_or_create(db, user)
    if payload.shortcuts is not None:
        _validate_shortcuts(payload.shortcuts)
    prefs = dict(settings.preferences or {})
    prefs.update(payload.model_dump(by_alias=True, exclude_none=True))
    settings.preferences = prefs
    settings.updated_at = _now()
    db.commit()
    db.refresh(settings)
    return _preferences(db, settings)


def get_agent_config(db: Session, user: CurrentUser) -> AgentConfigResponse:
    return _agent_config(get_or_create(db, user))


def update_agent_config(db: Session, user: CurrentUser, payload: AgentConfigUpdate) -> AgentConfigResponse:
    settings = get_or_create(db, user)
    config = dict(settings.agent_config or {})
    data = payload.model_dump(by_alias=True, exclude_none=True)
    if "nextRunMode" in data:
        config["nextRunMode"] = data["nextRunMode"]
    if "budget" in data:
        config["budget"] = data["budget"]
    settings.agent_config = config
    settings.updated_at = _now()
    db.commit()
    db.refresh(settings)
    return _agent_config(settings)


def get_model_config(db: Session, user: CurrentUser) -> ModelConfigResponse:
    return _model_config(get_or_create(db, user))


def update_model_config(db: Session, user: CurrentUser, payload: ModelConfigUpdate) -> ModelConfigResponse:
    settings = get_or_create(db, user)
    config = dict(settings.model_config or {})
    data = payload.model_dump(by_alias=True, exclude_none=True)
    for key in ("provider", "endpoint", "model"):
        if key in data:
            config[key] = data[key]
    if "apiKey" in data:
        secret = (data["apiKey"] or "").strip()
        if secret:
            config["apiKey"] = _encrypt_secret(secret)
        else:
            config.pop("apiKey", None)
    # Any edit invalidates the previous connectivity result.
    config.pop("lastTest", None)
    settings.model_config = config
    settings.updated_at = _now()
    db.commit()
    db.refresh(settings)
    return _model_config(settings)


def _effective(payload: ModelConfigUpdate | None, saved: dict, key: str) -> str:
    """Prefer an explicit request value, else the saved one; empty means unset."""
    if payload is not None:
        value = getattr(payload, key)
        if value is not None:
            return value
    return saved.get(key, "") or ""


def get_model_catalog(*, provider: str | None = None, query: str | None = None) -> ModelCatalogResponse:
    """Serve the read-only model catalog directly from litellm (section 17)."""
    try:
        entries = catalog.list_catalog(provider=provider, query=query)
    except catalog.ModelCatalogUnavailable as exc:
        raise ValidationFailed(str(exc)) from exc
    return ModelCatalogResponse(
        source="litellm",
        providers=[
            ModelCatalogProvider(
                id=entry.id,
                label=entry.label,
                models=[
                    ModelCatalogModel(
                        id=model.id,
                        label=model.label,
                        context_window=model.context_window,
                        max_output_tokens=model.max_output_tokens,
                        input_cost_per_million=model.input_cost_per_million,
                        output_cost_per_million=model.output_cost_per_million,
                    )
                    for model in entry.models
                ],
            )
            for entry in entries
        ],
    )


def test_model_connection(db: Session, user: CurrentUser, payload: ModelConfigUpdate | None = None) -> ModelTestResult:
    settings = get_or_create(db, user)
    saved = settings.model_config or {}
    provider = _effective(payload, saved, "provider").strip()
    model = _effective(payload, saved, "model").strip()
    endpoint = _effective(payload, saved, "endpoint").strip()
    if payload and payload.api_key is not None:
        api_key = payload.api_key or None
    else:
        api_key = _decrypt_secret(saved.get("apiKey", ""))
    if not model:
        raise ValidationFailed("请先配置模型")
    ok, message = catalog.probe_connection(
        model=model,
        provider=provider or None,
        api_key=api_key,
        api_base=endpoint or None,
    )
    result = ModelTestResult(at=_now(), ok=ok, message=message)
    config = dict(settings.model_config or {})
    config["lastTest"] = result.model_dump(mode="json", by_alias=True)
    settings.model_config = config
    settings.updated_at = _now()
    db.commit()
    db.refresh(settings)
    return result

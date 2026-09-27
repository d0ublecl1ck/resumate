import base64
import copy
import hashlib
from collections import Counter
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.modules.templates import dao as templates_dao
from app.shared.errors import ValidationFailed

from . import dao
from .models import UserSettings
from .schemas import (
    AgentBudget,
    AgentConfigResponse,
    AgentConfigUpdate,
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

PROBE_TIMEOUT_SECONDS = 5
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


def _probe(endpoint: str, api_key: str | None) -> tuple[bool, str]:
    """Call the provider's model list; never include the credential in the result."""
    if not endpoint.startswith(("http://", "https://")):
        raise ValidationFailed("Endpoint 必须以 http:// 或 https:// 开头")
    url = endpoint.rstrip("/") + "/models"
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        with urlopen(Request(url, headers=headers, method="GET"), timeout=PROBE_TIMEOUT_SECONDS) as response:
            status = getattr(response, "status", 200)
        return True, f"连接成功（HTTP {status}）"
    except HTTPError as error:
        return False, f"模型服务返回 HTTP {error.code}，请检查 Endpoint、模型名与凭证"
    except (URLError, TimeoutError, OSError):
        return False, "无法连接模型服务，请检查 Endpoint 与网络"


def test_model_connection(db: Session, user: CurrentUser, payload: ModelConfigUpdate | None = None) -> ModelTestResult:
    settings = get_or_create(db, user)
    saved = settings.model_config or {}
    endpoint = (payload.endpoint if payload and payload.endpoint is not None else saved.get("endpoint", "")) or ""
    if payload and payload.api_key is not None:
        api_key = payload.api_key or None
    else:
        api_key = _decrypt_secret(saved.get("apiKey", ""))
    if not endpoint:
        raise ValidationFailed("请先配置模型 Endpoint")
    ok, message = _probe(endpoint, api_key)
    result = ModelTestResult(at=_now(), ok=ok, message=message)
    config = dict(settings.model_config or {})
    config["lastTest"] = result.model_dump(mode="json", by_alias=True)
    settings.model_config = config
    settings.updated_at = _now()
    db.commit()
    db.refresh(settings)
    return result

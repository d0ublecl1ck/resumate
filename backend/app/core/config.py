import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Literal, NoReturn

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# 逃生阀：显式声明本进程允许在没有邮件配置的情况下启动（pytest / CI / 无邮件需求
# 的本地场景）。只认显式的 1/true/yes/on，避免误读空串或 "0"。
ALLOW_MISSING_ENV_VAR = "RESUMATE_ALLOW_MISSING_ENV"

# 启动自检关注的关键项。日志只报名字与来源，绝不打印取值。
_STARTUP_KEY_NAMES: tuple[str, ...] = (
    "DATABASE_URL",
    "REDIS_URL",
    "SETTINGS_SECRET_KEY",
    "PUBLIC_WEB_BASE_URL",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_FROM_EMAIL",
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
)


class StartupConfigError(RuntimeError):
    """有效配置不齐备，拒绝启动。"""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "backend"
    database_url: str = "postgresql+psycopg://localhost:5432/resumate"
    # Derives the Fernet key that encrypts stored model API keys. Override in
    # every non-local deployment: rotating it makes existing ciphertext unreadable.
    settings_secret_key: str = "resumate-local-dev-secret"
    redis_url: str = "redis://localhost:6379/0"
    session_ttl_seconds: int = 7 * 24 * 60 * 60
    session_cookie_name: str = "resumate_session"
    session_cookie_secure: bool = False
    session_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    # Bootstrap admin for local development; change the password before deploying.
    bootstrap_admin_email: str = "admin@resumate.dev"
    bootstrap_admin_password: str = "resumate-admin"
    bootstrap_admin_name: str = "管理员"

    # Email verification: registration proves mailbox ownership before any session
    # is issued, so these knobs govern the token lifetime and sending pressure.
    email_verification_token_ttl_seconds: int = 30 * 60
    # How long a token can still be used to ask for a resend after it expired or
    # was consumed; without this the dead-link page has no way back to the address.
    email_verification_lookup_ttl_seconds: int = 7 * 24 * 60 * 60
    email_verification_resend_cooldown_seconds: int = 60
    email_verification_max_sends_per_hour: int = 5

    # Password reset by emailed one-time link; mirrors the verification knobs.
    # The token is shorter-lived because it can change the credential, while the
    # lookup record still lets the API tell a dead link apart from a wrong new
    # password without consuming anything.
    password_reset_token_ttl_seconds: int = 30 * 60
    password_reset_lookup_ttl_seconds: int = 7 * 24 * 60 * 60
    password_reset_resend_cooldown_seconds: int = 60
    password_reset_max_sends_per_hour: int = 5
    # SMTP relay for verification mail. An empty SMTP_HOST disables real sending.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_starttls: bool = True
    # Base URL used to build the verification link that goes into the mail.
    public_web_base_url: str = "http://localhost:5173"

    # SSE turn subscription: poll the persisted turn + pending-action state and
    # keep the stream warm. Infrastructure knobs, not run-loop settings.
    sse_poll_interval_seconds: float = 1.0
    sse_heartbeat_interval_seconds: float = 15.0

    # Agent runner: the backend spawns the resumate-agent CLI for one run. The
    # command is an executable (tests point it at a stub); the decrypted model
    # key travels in the child's environment, never in argv.
    agent_runner_command: str = "resumate-agent"
    agent_runner_timeout_seconds: float = 300.0
    agent_runner_log_dir: str = "var/agent-runs"
    agent_runner_max_concurrent: int = 2
    # Run credentials: how long they outlive the hard timeout, and how many API
    # calls one run may make before the credential is revoked.
    agent_runner_token_slack_seconds: int = 120
    agent_runner_token_max_uses: int = 1000


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings instance."""
    return Settings()


# --- 启动自检 ---------------------------------------------------------------
# 目标：把「配置缺失」变成启动期失败，而不是运行期才暴露的功能故障。
# 判定标准是「有效配置是否齐备」，与 .env 文件是否存在解耦：环境变量提供同样算数。


def env_file_path() -> Path:
    """Pydantic 读取的 .env 绝对路径。

    与 SettingsConfigDict(env_file=".env") 语义一致：相对进程工作目录。报错里的
    期望路径永远由当前环境推导，而不是把本机绝对路径写进代码。
    """
    return (Path.cwd() / ".env").resolve()


def allow_missing_env() -> bool:
    """逃生阀是否打开；只有显式 1/true/yes/on 才算数。"""
    return os.environ.get(ALLOW_MISSING_ENV_VAR, "").strip().lower() in {"1", "true", "yes", "on"}


def _env_var_provided(name: str) -> bool:
    """进程环境里是否提供了该项；pydantic-settings 默认大小写不敏感。"""
    return name in os.environ or name.lower() in os.environ


def _log_config_sources() -> None:
    """打印配置来源：.env 是否存在、哪些关键项来自真实环境变量。不打印取值。"""
    expected = env_file_path()
    if expected.is_file():
        logger.info("[配置自检] .env 文件：存在（%s）", expected)
    else:
        logger.info("[配置自检] .env 文件：不存在（期望路径 %s）", expected)
    from_env = [name for name in _STARTUP_KEY_NAMES if _env_var_provided(name)]
    from_file_or_default = [name for name in _STARTUP_KEY_NAMES if name not in from_env]
    logger.info("[配置自检] 来自进程环境变量的关键项：%s", "、".join(from_env) or "（无）")
    logger.info(
        "[配置自检] 取自 .env 文件或代码默认值的关键项：%s",
        "、".join(from_file_or_default) or "（无）",
    )


def _smtp_problems(settings: Settings) -> list[str]:
    """返回 SMTP 分组里缺失/冲突的键名；空列表表示这组配置自洽。"""
    if not settings.smtp_host.strip():
        return []
    problems: list[str] = []
    if not settings.smtp_from_email.strip():
        problems.append("SMTP_FROM_EMAIL")
    username_set = bool(settings.smtp_username.strip())
    password_set = bool(settings.smtp_password.strip())
    if username_set and not password_set:
        problems.append("SMTP_PASSWORD")
    elif password_set and not username_set:
        problems.append("SMTP_USERNAME")
    return problems


def _worktree_hint() -> str:
    return (
        "提示：worktree 不会带过来未跟踪的 .env，需要手动复制（从主工作区复制到 "
        f"{env_file_path()}）。"
    )


def _abort(message: str) -> NoReturn:
    logger.error("[配置自检] %s", message)
    raise StartupConfigError(message)


def check_startup_config(settings: Settings | None = None) -> list[str]:
    """启动自检：记录配置来源，并保证 SMTP 这组配置能支撑运行。

    返回放行时的告警文案（目前只有「完全未配置 SMTP 且打开逃生阀」一种）；配置
    不可用时抛 StartupConfigError，由启动生命周期中止进程。
    """
    current = settings if settings is not None else get_settings()
    _log_config_sources()
    expected = env_file_path()

    problems = _smtp_problems(current)
    if problems:
        # 半配置是配置错误，不是「没带 .env」；逃生阀不放行这一类。
        _abort(
            "启动配置自检失败：SMTP 配置不完整，缺少 "
            + "、".join(problems)
            + f"。请在 {expected} 中补齐这些键（需要认证时同时设置 SMTP_USERNAME 与 SMTP_PASSWORD），"
            + "或通过进程环境变量提供。\n"
            + _worktree_hint()
        )

    if not current.smtp_host.strip():
        if allow_missing_env():
            message = (
                "已按 RESUMATE_ALLOW_MISSING_ENV 放行：SMTP_HOST 为空，"
                "邮件相关功能不可用（邮箱验证与忘记密码发信都会失败）。"
            )
            logger.warning("[配置自检] %s", message)
            return [message]
        _abort(
            "启动配置自检失败：SMTP 未配置（SMTP_HOST 为空），"
            "邮箱验证与忘记密码发信都会在运行期失败，因此拒绝启动。\n"
            f"请在 {expected} 中设置 SMTP_HOST 与 SMTP_FROM_EMAIL（需要认证时再设置 "
            "SMTP_USERNAME 与 SMTP_PASSWORD），或通过进程环境变量提供。\n"
            + _worktree_hint()
            + f"\n如需在 pytest / CI / 无邮件需求的本地场景启动，设置 {ALLOW_MISSING_ENV_VAR}=1 "
            "放行（邮件相关功能不可用）。"
        )

    return []


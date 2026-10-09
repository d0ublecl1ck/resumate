"""启动自检：有效配置不齐备时在启动生命周期就失败，而不是运行期才发现。

判定针对「有效配置是否齐备」，与 `.env` 文件是否存在解耦：CI / pytest /
Docker 都能只靠真实环境变量提供配置。这里的用例显式构造 Settings，避免误读
仓库里的 `.env`。
"""

import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, StartupConfigError, check_startup_config, env_file_path


def _settings(**overrides: object) -> Settings:
    """只依赖显式取值的 Settings；_env_file=None 关掉仓库 `.env` 的干扰。"""
    base: dict[str, object] = {
        "smtp_host": "",
        "smtp_from_email": "",
        "smtp_username": "",
        "smtp_password": "",
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


def test_env_file_path_is_absolute_and_named_dot_env() -> None:
    """期望路径从进程工作目录推导，不能在代码里硬编码本机绝对路径。"""
    path = env_file_path()
    assert path.is_absolute()
    assert path.name == ".env"
    assert path == (Path.cwd() / ".env").resolve()


def test_fully_unconfigured_smtp_aborts_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RESUMATE_ALLOW_MISSING_ENV", raising=False)
    with pytest.raises(StartupConfigError) as excinfo:
        check_startup_config(_settings())
    message = str(excinfo.value)
    # 点名缺失的键
    assert "SMTP_HOST" in message
    # 给出期望的绝对 .env 路径
    assert str(env_file_path()) in message
    # worktree 不会带过来未跟踪的 .env，需要手动复制
    assert "worktree" in message
    assert "未跟踪" in message
    assert "手动复制" in message
    # 逃生阀的可执行提示
    assert "RESUMATE_ALLOW_MISSING_ENV" in message


def test_partial_smtp_config_aborts_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RESUMATE_ALLOW_MISSING_ENV", raising=False)
    with pytest.raises(StartupConfigError) as excinfo:
        check_startup_config(_settings(smtp_host="smtp.example.com"))
    assert "SMTP_FROM_EMAIL" in str(excinfo.value)


def test_partial_smtp_credentials_abort_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RESUMATE_ALLOW_MISSING_ENV", raising=False)
    configured = {"smtp_host": "smtp.example.com", "smtp_from_email": "noreply@example.com"}
    with pytest.raises(StartupConfigError) as excinfo:
        check_startup_config(_settings(**configured, smtp_username="mailer"))
    assert "SMTP_PASSWORD" in str(excinfo.value)

    with pytest.raises(StartupConfigError) as excinfo:
        check_startup_config(_settings(**configured, smtp_password="secret"))
    assert "SMTP_USERNAME" in str(excinfo.value)


def test_escape_hatch_does_not_hide_partial_config(monkeypatch: pytest.MonkeyPatch) -> None:
    """逃生阀只放行「完全未配置」，半配置仍是配置错误。"""
    monkeypatch.setenv("RESUMATE_ALLOW_MISSING_ENV", "1")
    with pytest.raises(StartupConfigError) as excinfo:
        check_startup_config(_settings(smtp_host="smtp.example.com"))
    assert "SMTP_FROM_EMAIL" in str(excinfo.value)


def test_escape_hatch_downgrades_to_prominent_warning(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("RESUMATE_ALLOW_MISSING_ENV", "1")
    with caplog.at_level(logging.WARNING):
        warnings = check_startup_config(_settings())
    assert warnings, "放行时必须返回告警，不能静默"
    assert "RESUMATE_ALLOW_MISSING_ENV" in caplog.text
    assert "邮件相关功能不可用" in caplog.text


def test_configured_smtp_logs_sources_without_leaking_values(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.delenv("RESUMATE_ALLOW_MISSING_ENV", raising=False)
    secret = "s3cr3t-smtp-password-must-not-be-logged"
    with caplog.at_level(logging.INFO):
        warnings = check_startup_config(
            _settings(
                smtp_host="smtp.example.com",
                smtp_from_email="noreply@example.com",
                smtp_username="mailer",
                smtp_password=secret,
            )
        )
    assert warnings == []
    assert ".env" in caplog.text
    assert secret not in caplog.text


def test_env_var_sources_are_reported_by_name_only(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.delenv("RESUMATE_ALLOW_MISSING_ENV", raising=False)
    monkeypatch.setenv("PUBLIC_WEB_BASE_URL", "https://web.example.test")
    with caplog.at_level(logging.INFO):
        check_startup_config(_settings(smtp_host="smtp.example.com", smtp_from_email="noreply@example.com"))
    assert "PUBLIC_WEB_BASE_URL" in caplog.text
    assert "环境变量" in caplog.text
    assert "https://web.example.test" not in caplog.text


def test_lifespan_runs_startup_config_check(monkeypatch: pytest.MonkeyPatch) -> None:
    """自检必须挂在 app 启动生命周期上，而不是只在测试里被调用。"""
    import app.main as main

    calls: list[int] = []
    monkeypatch.setattr(main, "check_startup_config", lambda *args, **kwargs: calls.append(1) or [])
    with TestClient(main.app):
        pass
    assert calls, "应用启动时未运行配置自检"

"""compose.yaml 与启动自检的契约。

0552006/3ff68 落地启动自检后，容器路径一度失效：compose 既没有把 SMTP 透传进
backend 容器，也没有设置逃生阀，`docker compose up` 会在 lifespan 自检阶段拒绝启动。
这组用例把「容器路径必须显式配好」固化成可执行的守卫，避免同一回归再次发生。

只读解析 compose.yaml 的文本结构，不引入 YAML 依赖：项目栈里没有 PyYAML，而
compose 文件本身足够规整，按服务块与 environment 缩进解析即可。
"""

import re
from pathlib import Path

COMPOSE = Path(__file__).resolve().parents[2] / "compose.yaml"

# backend 服务必须透传的 SMTP 项 -> 期望的默认值（空串表示缺省为空）。
SMTP_PASSTHROUGH = {
    "SMTP_HOST": "",
    "SMTP_PORT": "587",
    "SMTP_USERNAME": "",
    "SMTP_PASSWORD": "",
    "SMTP_FROM_EMAIL": "",
    "SMTP_STARTTLS": "true",
}
ESCAPE_HATCH = "RESUMATE_ALLOW_MISSING_ENV"
# 不需要这项的服务：逃生阀只属于后端进程。
SERVICES_WITHOUT_ESCAPE_HATCH = ("postgres", "redis", "ui")


def _service_lines(name: str) -> list[str]:
    """返回 `  <name>:` 服务的文本行；遇到下一个两空格缩进的键即结束。"""
    lines = COMPOSE.read_text(encoding="utf-8").splitlines()
    try:
        start = lines.index(f"  {name}:") + 1
    except ValueError:  # pragma: no cover - 失败信息比 IndexError 清楚
        raise AssertionError(f"compose.yaml 缺少服务 {name}") from None
    block: list[str] = []
    for line in lines[start:]:
        if line.strip() and not line.startswith("    "):
            break
        block.append(line)
    return block


def _environment(name: str) -> dict[str, str]:
    """解析服务 environment: 段里的 KEY: value 对。"""
    block = _service_lines(name)
    try:
        start = block.index("    environment:") + 1
    except ValueError:
        # 服务可以没有 environment: 段（例如只跑镜像的 redis / ui）。
        return {}
    env: dict[str, str] = {}
    for line in block[start:]:
        if not line.startswith("      "):
            break
        match = re.match(r"^ {6}([A-Za-z0-9_]+):\s?(.*)$", line)
        if match:
            env[match.group(1)] = match.group(2)
    return env


def test_backend_passes_smtp_through_without_literal_secrets() -> None:
    """SMTP 从宿主环境 / 仓库根 .env 透传；值必须是 ${VAR:-default} 形态。"""
    env = _environment("backend")
    for key, default in SMTP_PASSTHROUGH.items():
        assert key in env, f"compose.yaml 的 backend 服务没有透传 {key}"
        expected = "${" + key + ":-" + default + "}"
        assert env[key] == expected, f"{key} 必须是透传（{expected}），实际为 {env[key]!r}"


def test_backend_sets_visible_escape_hatch_default() -> None:
    """本地/demo 默认放行必须写在明处，默认值为 1。"""
    env = _environment("backend")
    assert env.get(ESCAPE_HATCH) == "${" + ESCAPE_HATCH + ":-1}"


def test_backend_documents_production_contract_next_to_escape_hatch() -> None:
    """逃生阀旁的注释必须说明生产要求，不能只有默认值。"""
    block = _service_lines("backend")
    hatch_line = next(i for i, line in enumerate(block) if line.strip().startswith(ESCAPE_HATCH + ":"))
    comment = "\n".join(block[max(0, hatch_line - 6):hatch_line])
    assert "#" in comment, "逃生阀缺少说明注释"
    assert "生产" in comment, "逃生阀注释必须写明生产环境的做法"
    assert "SMTP" in comment, "逃生阀注释必须点名 SMTP 配置"


def test_escape_hatch_and_smtp_are_scoped_to_backend_only() -> None:
    """逃生阀只属于 backend；其余服务不设，避免一刀切。"""
    for name in SERVICES_WITHOUT_ESCAPE_HATCH:
        env = _environment(name)
        assert ESCAPE_HATCH not in env, f"{name} 不应设置 {ESCAPE_HATCH}"
        assert not [key for key in env if key.startswith("SMTP_")], f"{name} 不应透传 SMTP_*"

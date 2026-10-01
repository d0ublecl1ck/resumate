"""Run-credential allowlist must track agent-core's client (issue 1d3e2).

The allowlist in app.modules.agent.run_token is hand-written. The runner is a
separate process (agent-core), so a required endpoint missing from the allowlist
only shows up as a 403 in production. This test derives the endpoints client.py
actually calls from its source (AST), so the list cannot silently drift.
"""

from __future__ import annotations

import ast
from pathlib import Path

from app.modules.agent import run_token

REPO_ROOT = Path(__file__).resolve().parents[2]
CLIENT_PATH = REPO_ROOT / "agent-core" / "src" / "resumate_agent_core" / "client.py"
SAMPLE_SEGMENT = "sample-id"
UNDERIVABLE = ("<dynamic>", "<missing path>")


def _client_tree() -> ast.Module:
    assert CLIENT_PATH.is_file(), f"agent-core client not found at {CLIENT_PATH}"
    return ast.parse(CLIENT_PATH.read_text(encoding="utf-8"))


def _call_name(func: ast.expr) -> str | None:
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def _render_expr(node: ast.expr, *, turn_path: str | None) -> str:
    """Collapse a dynamic path segment to a single wildcard segment."""
    if isinstance(node, ast.Call) and _call_name(node.func) == "_turn_path" and turn_path is not None:
        return turn_path
    return "*"


def _render_path(node: ast.expr, *, turn_path: str | None) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        parts: list[str] = []
        for value in node.values:
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                parts.append(value.value)
            elif isinstance(value, ast.FormattedValue):
                parts.append(_render_expr(value.value, turn_path=turn_path))
            else:
                return None
        return "".join(parts)
    if isinstance(node, ast.Call):
        return _render_expr(node, turn_path=turn_path)
    return None


def _find_turn_path_template(tree: ast.Module) -> str | None:
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "_turn_path":
            for statement in node.body:
                if isinstance(statement, ast.Return) and statement.value is not None:
                    return _render_path(statement.value, turn_path=None)
    return None


def _request_calls(tree: ast.Module) -> list[tuple[str, str]]:
    turn_path = _find_turn_path_template(tree)
    endpoints: list[tuple[str, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not (
            isinstance(func, ast.Attribute)
            and func.attr == "_request"
            and isinstance(func.value, ast.Name)
            and func.value.id == "self"
        ):
            continue
        method_node = node.args[0] if node.args else None
        path_node = node.args[1] if len(node.args) > 1 else None
        method = method_node.value if isinstance(method_node, ast.Constant) and isinstance(method_node.value, str) else "?"
        if path_node is None:
            endpoints.append((method, "<missing path>"))
            continue
        path = _render_path(path_node, turn_path=turn_path)
        endpoints.append((method, "<dynamic>" if path is None else path))
    return endpoints


def _sample_path(template: str) -> str:
    return template.replace("*", SAMPLE_SEGMENT)


def _disallowed_endpoints(endpoints, allowed) -> list[str]:
    problems: list[str] = []
    for method, template in endpoints:
        if template in UNDERIVABLE:
            problems.append(f"{method} {template} (extend the extractor)")
            continue
        path = _sample_path(template)
        if run_token.is_human_only_path(path):
            continue
        if not any(m == method and pattern.match(path) for m, pattern in allowed):
            problems.append(f"{method} {template}")
    return problems


def test_extractor_finds_the_client_endpoints() -> None:
    endpoints = _request_calls(_client_tree())

    assert endpoints, "AST extraction found no self._request calls"
    assert len(endpoints) >= 16, f"extractor looks stale, derived {len(endpoints)} endpoints: {endpoints}"
    shapes = {template for _, template in endpoints}
    assert "/.well-known/resume-agent" in shapes
    assert "/turns/*/state" in shapes


def test_all_client_endpoints_are_allowed_or_human_only() -> None:
    endpoints = _request_calls(_client_tree())

    disallowed = _disallowed_endpoints(endpoints, run_token._ALLOWED_ENDPOINTS)

    assert not disallowed, (
        "agent-core/client.py calls endpoints the run credential does not allow; a production run "
        "would get 403. Add them to _ALLOWED_ENDPOINTS (or keep human decisions human-only):\n  "
        + "\n  ".join(disallowed)
    )


def test_human_only_endpoints_stay_out_of_the_run_allowlist() -> None:
    endpoints = _request_calls(_client_tree())

    human_only = [
        (method, template)
        for method, template in endpoints
        if template not in UNDERIVABLE and run_token.is_human_only_path(_sample_path(template))
    ]

    assert human_only, "expected the client to still expose approve/reject as human-only"
    for method, template in human_only:
        assert not run_token.endpoint_allowed(method, _sample_path(template)), (
            f"{method} {template} must stay outside the run allowlist"
        )


def test_allowlist_has_no_stale_entries() -> None:
    endpoints = _request_calls(_client_tree())
    sample_paths = [
        (method, _sample_path(template))
        for method, template in endpoints
        if template not in UNDERIVABLE
    ]

    stale = [
        f"{method} {pattern.pattern}"
        for method, pattern in run_token._ALLOWED_ENDPOINTS
        if not any(m == method and pattern.match(path) for m, path in sample_paths)
    ]

    assert not stale, "allowlist entries no client endpoint uses:\n  " + "\n  ".join(stale)


def test_missing_allowlist_entry_is_detected(monkeypatch) -> None:
    endpoints = _request_calls(_client_tree())
    assert all(template not in UNDERIVABLE for _, template in endpoints), endpoints
    trimmed = tuple(
        (method, pattern)
        for method, pattern in run_token._ALLOWED_ENDPOINTS
        if not (method == "GET" and pattern.pattern == r"^/turns/[^/]+/state$")
    )
    monkeypatch.setattr(run_token, "_ALLOWED_ENDPOINTS", trimmed)

    disallowed = _disallowed_endpoints(endpoints, run_token._ALLOWED_ENDPOINTS)

    assert "GET /turns/*/state" in disallowed


def test_client_keeps_a_single_http_seam() -> None:
    tree = _client_tree()

    direct = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "request"
        and isinstance(node.func.value, ast.Attribute)
        and node.func.value.attr == "_http"
    ]

    assert len(direct) == 1, (
        f"client.py must route HTTP through _request; found {len(direct)} direct self._http.request calls"
    )

"""Profile scope tool selection and CLI wiring (issue 60a52)."""

from resumate_agent_core.cli import build_parser
from resumate_agent_core.tools import TOOLS, tools_for_scope


def test_resume_scope_keeps_the_existing_registry() -> None:
    assert set(tools_for_scope("resume")) == set(TOOLS)


def test_profile_scope_excludes_resume_editing_tools() -> None:
    profile = tools_for_scope("profile")

    assert {"get_profile", "propose_profile_change"} <= set(profile)
    assert {"get_working_document", "validate_patch", "preview_patch", "apply_patch"}.isdisjoint(profile)
    assert {
        "capability",
        "create_turn",
        "get_turn",
        "finalize_turn",
        "cancel_turn",
        "list_pending_actions",
    } <= set(profile)


def test_profile_create_turn_requires_a_session() -> None:
    tool = tools_for_scope("profile")["create_turn"]

    assert tool.input_schema["required"] == ["session_id"]


def test_cli_scope_defaults_to_resume_and_accepts_profile() -> None:
    parser = build_parser({})

    assert parser.parse_args([]).scope == "resume"
    assert parser.parse_args(["--scope", "profile"]).scope == "profile"

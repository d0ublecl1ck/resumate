"""Tool registry exposed to model providers.

Each Tool pairs a JSON-schema contract with a callable over ResumateClient so a
model can drive the public API through function calling. Handlers return
wire-shaped (camelCase) dictionaries, ready to serialize back to a model. No
concrete provider lives here; see runtime.py for the loop that consumes this
registry.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from .client import ResumateClient
from .models import ApiModel

ToolHandler = Callable[[ResumateClient, Mapping[str, Any]], Any]


class UnknownToolError(KeyError):
    """Raised when a model calls a tool that is not registered."""

    def __init__(self, name: str) -> None:
        super().__init__(name)
        self.name = name

    def __str__(self) -> str:
        known = ", ".join(sorted(TOOLS))
        return f"Unknown tool {self.name!r}; known tools: {known}"


class ToolArgumentError(ValueError):
    """Raised when a tool call omits a required argument."""


def _wire(value: Any) -> Any:
    """Convert models/lists into JSON-ready wire values."""
    if isinstance(value, ApiModel):
        return value.to_wire()
    if isinstance(value, list):
        return [_wire(item) for item in value]
    return value


def _require(args: Mapping[str, Any], key: str) -> Any:
    if key not in args or args[key] is None:
        raise ToolArgumentError(f"missing required argument {key!r}")
    return args[key]


@dataclass(frozen=True, slots=True)
class Tool:
    """A named capability with a JSON-schema input contract."""

    name: str
    description: str
    input_schema: dict[str, Any]
    handler: ToolHandler

    def invoke(self, client: ResumateClient, args: Mapping[str, Any]) -> Any:
        """Validate the arg container and run the handler."""
        if not isinstance(args, Mapping):
            raise ToolArgumentError(f"{self.name} expects an argument object")
        return self.handler(client, args)

    def to_spec(self) -> dict[str, Any]:
        """Neutral function spec: name, description, and JSON schema."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }

    def to_openai_tool(self) -> dict[str, Any]:
        """OpenAI-compatible function-calling spec for convenience."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.input_schema,
            },
        }


# --- shared schema fragments -------------------------------------------------

_TURN_ID = {"type": "string", "description": "Turn id with the turn_ prefix."}
_RESUME_ID = {"type": "string", "description": "Resume id with the res_ prefix."}
_ACTION_ID = {"type": "string", "description": "PendingAction id with the pa_ prefix."}
_OPS = {
    "type": "array",
    "minItems": 1,
    "description": "Domain patch operations (setBasics/upsertSection/removeSection/upsertEntry/removeEntry).",
    "items": {"type": "object"},
}
_REASON = {"type": "string", "description": "Human-readable reason stored with the patch."}
_BASE_VERSION_ID = {
    "type": "string",
    "description": "Optional base version guard; stale values yield BASE_VERSION_STALE.",
}
_IDEMPOTENCY_KEY = {
    "type": "string",
    "description": "Client-generated key; replaying the same key and payload returns the prior result.",
}


def _patch_schema(*extra: tuple[str, dict[str, Any]]) -> dict[str, Any]:
    properties: dict[str, Any] = {
        "turn_id": _TURN_ID,
        "ops": _OPS,
        "reason": _REASON,
        "base_version_id": _BASE_VERSION_ID,
    }
    for key, schema in extra:
        properties[key] = schema
    return {
        "type": "object",
        "properties": properties,
        "required": ["turn_id", "ops"],
        "additionalProperties": False,
    }


# --- handlers ----------------------------------------------------------------


def _capability(client: ResumateClient, args: Mapping[str, Any]) -> Any:
    return _wire(client.capability())


def _create_turn(client: ResumateClient, args: Mapping[str, Any]) -> Any:
    return _wire(
        client.create_turn(
            _require(args, "resume_id"),
            base_version_id=args.get("base_version_id"),
            execution_mode=args.get("execution_mode"),
            client_id=args.get("client_id"),
            source=args.get("source"),
            message=args.get("message"),
        )
    )


def _get_turn(client: ResumateClient, args: Mapping[str, Any]) -> Any:
    return _wire(client.get_turn(_require(args, "turn_id")))


def _finalize_turn(client: ResumateClient, args: Mapping[str, Any]) -> Any:
    return _wire(
        client.finalize_turn(
            _require(args, "turn_id"),
            idempotency_key=args.get("idempotency_key"),
            message=args.get("message"),
        )
    )


def _cancel_turn(client: ResumateClient, args: Mapping[str, Any]) -> Any:
    return _wire(
        client.cancel_turn(
            _require(args, "turn_id"),
            idempotency_key=args.get("idempotency_key"),
            reason=args.get("reason"),
        )
    )


def _validate_patch(client: ResumateClient, args: Mapping[str, Any]) -> Any:
    return _wire(
        client.validate_patch(
            _require(args, "turn_id"),
            _require(args, "ops"),
            reason=args.get("reason"),
            base_version_id=args.get("base_version_id"),
        )
    )


def _preview_patch(client: ResumateClient, args: Mapping[str, Any]) -> Any:
    return _wire(
        client.preview_patch(
            _require(args, "turn_id"),
            _require(args, "ops"),
            reason=args.get("reason"),
            base_version_id=args.get("base_version_id"),
        )
    )


def _apply_patch(client: ResumateClient, args: Mapping[str, Any]) -> Any:
    return _wire(
        client.apply_patch(
            _require(args, "turn_id"),
            _require(args, "ops"),
            reason=args.get("reason"),
            base_version_id=args.get("base_version_id"),
            pending_action_id=args.get("pending_action_id"),
            idempotency_key=args.get("idempotency_key"),
        )
    )


def _list_pending_actions(client: ResumateClient, args: Mapping[str, Any]) -> Any:
    return _wire(client.list_pending_actions(_require(args, "turn_id")))


def _get_working_document(client: ResumateClient, args: Mapping[str, Any]) -> Any:
    return _wire(client.get_working_document(_require(args, "resume_id")))


def _get_profile(client: ResumateClient, args: Mapping[str, Any]) -> Any:
    profile: dict[str, Any] = _wire(client.get_profile())
    if args.get("include_facts", True):
        profile["facts"] = _wire(client.list_profile_facts())
    return profile


def _propose_profile_change(client: ResumateClient, args: Mapping[str, Any]) -> Any:
    return _wire(
        client.propose_profile_change(
            _require(args, "turn_id"),
            ops=_require(args, "ops"),
            reason=args.get("reason"),
        )
    )


def _create_profile_turn(client: ResumateClient, args: Mapping[str, Any]) -> Any:
    return _wire(
        client.create_profile_turn(
            session_id=_require(args, "session_id"),
            execution_mode=args.get("execution_mode"),
            message=args.get("message"),
        )
    )


# --- registry ----------------------------------------------------------------

TOOLS: dict[str, Tool] = {
    "capability": Tool(
        name="capability",
        description=(
            "Read public capability discovery: contract version, OpenAPI/MCP "
            "entry points, auth methods, and supported capabilities."
        ),
        input_schema={"type": "object", "properties": {}, "additionalProperties": False},
        handler=_capability,
    ),
    "create_turn": Tool(
        name="create_turn",
        description=(
            "Open an editing turn for a resume. Server finalizes any previous "
            "open turn and fixes executionMode for this turn."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "resume_id": _RESUME_ID,
                "base_version_id": _BASE_VERSION_ID,
                "execution_mode": {
                    "type": "string",
                    "enum": ["approval", "full_access"],
                    "description": "Requested mode; the server resolves and freezes it.",
                },
                "client_id": {"type": "string", "description": "Caller identifier, default external."},
                "source": {
                    "type": "string",
                    "enum": ["agent", "manual", "client"],
                    "description": "Untrusted hint; the server does not trust forged values.",
                },
                "message": {"type": "string", "description": "Turn description."},
            },
            # resume_id stays visible but optional: a resume-scoped run injects the
            # bound id, and the model must never be forced to invent one.
            "required": [],
            "additionalProperties": False,
        },
        handler=_create_turn,
    ),
    "get_turn": Tool(
        name="get_turn",
        description="Read a turn, its state, result, and pending-action projection.",
        input_schema={
            "type": "object",
            "properties": {"turn_id": _TURN_ID},
            "required": ["turn_id"],
            "additionalProperties": False,
        },
        handler=_get_turn,
    ),
    "finalize_turn": Tool(
        name="finalize_turn",
        description=(
            "Atomically commit the working copy and close the turn. Idempotent; "
            "no content change creates no version."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "turn_id": _TURN_ID,
                "idempotency_key": _IDEMPOTENCY_KEY,
                "message": {"type": "string", "description": "Version message."},
            },
            "required": ["turn_id"],
            "additionalProperties": False,
        },
        handler=_finalize_turn,
    ),
    "cancel_turn": Tool(
        name="cancel_turn",
        description=(
            "Invalidate open pending actions, settle applied changes per C-04, "
            "and close the turn."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "turn_id": _TURN_ID,
                "idempotency_key": _IDEMPOTENCY_KEY,
                "reason": {"type": "string", "description": "Cancellation reason."},
            },
            "required": ["turn_id"],
            "additionalProperties": False,
        },
        handler=_cancel_turn,
    ),
    "validate_patch": Tool(
        name="validate_patch",
        description="Validate domain patch operations without side effects.",
        input_schema=_patch_schema(),
        handler=_validate_patch,
    ),
    "preview_patch": Tool(
        name="preview_patch",
        description=(
            "Compute the diff for patch operations. In approval mode this opens "
            "a PendingAction that must be approved before apply."
        ),
        input_schema=_patch_schema(),
        handler=_preview_patch,
    ),
    "apply_patch": Tool(
        name="apply_patch",
        description=(
            "Write patch operations into the working copy. Approval mode requires "
            "an approved pending_action_id."
        ),
        input_schema=_patch_schema(
            ("pending_action_id", _ACTION_ID),
            ("idempotency_key", _IDEMPOTENCY_KEY),
        ),
        handler=_apply_patch,
    ),
    "list_pending_actions": Tool(
        name="list_pending_actions",
        description="List the pending-action projection for a turn.",
        input_schema={
            "type": "object",
            "properties": {"turn_id": _TURN_ID},
            "required": ["turn_id"],
            "additionalProperties": False,
        },
        handler=_list_pending_actions,
    ),
    "get_working_document": Tool(
        name="get_working_document",
        description="Read the working copy, its base version, revision, and dirty flag.",
        input_schema={
            "type": "object",
            "properties": {"resume_id": _RESUME_ID},
            # Injected by the run for resume scope; optional here for the same reason.
            "required": [],
            "additionalProperties": False,
        },
        handler=_get_working_document,
    ),
}


# --- scope-based selection (issue 60a52) -------------------------------------

_PROFILE_ACTION_OPS = {
    "type": "array",
    "minItems": 1,
    "description": "Profile change ops: {op: create_fact|update_fact|update_basics, payload: {...}}.",
    "items": {"type": "object"},
}

# Tool names a profile run shares with a resume run (resource-independent tools).
_SHARED_TOOL_NAMES = (
    "capability",
    "create_turn",
    "get_turn",
    "finalize_turn",
    "cancel_turn",
    "list_pending_actions",
)

PROFILE_TOOLS: dict[str, Tool] = {name: TOOLS[name] for name in _SHARED_TOOL_NAMES}
PROFILE_TOOLS["create_turn"] = Tool(
    name="create_turn",
    description="Open a profile-scoped turn for the current session (no resume).",
    input_schema={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Owning session id."},
            "execution_mode": {
                "type": "string",
                "enum": ["approval", "full_access"],
                "description": "Requested mode; the server resolves and freezes it.",
            },
            "message": {"type": "string", "description": "Turn description."},
        },
        "required": ["session_id"],
        "additionalProperties": False,
    },
    handler=_create_profile_turn,
)
PROFILE_TOOLS["get_profile"] = Tool(
    name="get_profile",
    description="Read the owner profile basics and facts.",
    input_schema={
        "type": "object",
        "properties": {
            "include_facts": {"type": "boolean", "description": "Include the fact list (default true)."}
        },
        "additionalProperties": False,
    },
    handler=_get_profile,
)
PROFILE_TOOLS["propose_profile_change"] = Tool(
    name="propose_profile_change",
    description=(
        "Submit profile changes for human confirmation. In approval mode this "
        "opens a PendingAction the human must approve before it is written."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "turn_id": _TURN_ID,
            "ops": _PROFILE_ACTION_OPS,
            "reason": _REASON,
        },
        "required": ["turn_id", "ops"],
        "additionalProperties": False,
    },
    handler=_propose_profile_change,
)


def tools_for_scope(scope: str) -> dict[str, Tool]:
    """The registry a run gets: resume keeps the patch tools, profile does not."""
    return dict(PROFILE_TOOLS) if scope == "profile" else dict(TOOLS)


def _ordered(registry: Mapping[str, Tool]) -> list[Tool]:
    return [registry[name] for name in sorted(registry)]


def tool_specs_for_scope(scope: str) -> list[dict[str, Any]]:
    """Neutral function specs for one scope."""
    return [tool.to_spec() for tool in _ordered(tools_for_scope(scope))]


def openai_tool_specs_for_scope(scope: str) -> list[dict[str, Any]]:
    """OpenAI-compatible function specs for one scope."""
    return [tool.to_openai_tool() for tool in _ordered(tools_for_scope(scope))]


def list_tools() -> list[Tool]:
    """All registered tools, ordered by name."""
    return [TOOLS[name] for name in sorted(TOOLS)]


def tool_specs() -> list[dict[str, Any]]:
    """Neutral function specs suitable for any ModelProvider."""
    return [tool.to_spec() for tool in list_tools()]


def openai_tool_specs() -> list[dict[str, Any]]:
    """OpenAI-compatible function-calling specs."""
    return [tool.to_openai_tool() for tool in list_tools()]


def get_tool(name: str) -> Tool:
    """Look up a tool by name, raising UnknownToolError when absent."""
    try:
        return TOOLS[name]
    except KeyError as exc:
        raise UnknownToolError(name) from exc


def call_tool(client: ResumateClient, name: str, args: Mapping[str, Any] | None = None) -> Any:
    """Dispatch one tool call and return its wire-shaped result."""
    return get_tool(name).invoke(client, args or {})

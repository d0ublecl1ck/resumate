"""Executable entry point: run one agent turn as a standalone process (89ffd).

Decision 1 of the agent-runtime roadmap makes the runner a standalone process,
and the CLI is its least irreversible surface: the backend will later spawn this
same entry point. The CLI adds no orchestration of its own — it builds a
ResumateClient and a model provider and consumes AgentRuntime.run(), so the
loop, budgets, cancellation, and events keep living in one place.

Event output mirrors pi's --mode json: one JSON object per line on stdout, so a
caller can stream and parse it without a second protocol.

State: --state writes a minimal snapshot when the run starts and overwrites it
when the run ends. That is deliberately NOT a checkpoint: per decision 2 the
real checkpoint lands after every model turn, which is the next issue. This flag
exists so that work has a seam to grow into, and so the operator can see which
run is in flight.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TextIO

import httpx

from .checkpoint import CheckpointStore
from .client import ResumateClient
from .config import ENV_PREFIX, AgentCoreSettings
from .openai_provider import DEFAULT_OPENAI_BASE_URL, OpenAICompatibleProvider
from .runtime import (
    AgentRuntime,
    ErrorEvent,
    FinalizeEvent,
    MessageEvent,
    ModelProvider,
    PendingActionEvent,
    RunBudget,
    RunEvent,
    ToolProgressEvent,
)
from .session import SessionJournal

PROGRAM = "resumate-agent"
EXIT_OK = 0
EXIT_RUN_FAILED = 1
EXIT_USAGE = 2

# Connection and credentials follow AgentCoreSettings (RESUME_AGENT_CORE_*).
# The model and run knobs below reuse the same prefix so one namespace configures
# the whole runner.
ENV_MODEL = f"{ENV_PREFIX}MODEL"
ENV_API_KEY = f"{ENV_PREFIX}API_KEY"
ENV_PROVIDER_BASE_URL = f"{ENV_PREFIX}PROVIDER_BASE_URL"
ENV_EXECUTION_MODE = f"{ENV_PREFIX}EXECUTION_MODE"
ENV_SESSION = f"{ENV_PREFIX}SESSION"
ENV_STATE = f"{ENV_PREFIX}STATE"
ENV_EVENTS = f"{ENV_PREFIX}EVENTS"

DEFAULT_EXECUTION_MODE = "approval"
DEFAULT_EVENTS = "json"
EVENT_CHOICES = ("json", "text")
STATE_VERSION = 1


# --- argument parsing --------------------------------------------------------


def build_parser(env: Mapping[str, str] | None = None) -> argparse.ArgumentParser:
    """Build the argument parser, taking env-var defaults from the given mapping."""
    source: Mapping[str, str] = os.environ if env is None else env
    parser = argparse.ArgumentParser(
        prog=PROGRAM,
        description=(
            "Run one Resumate agent turn against the public REST API. "
            "Events go to stdout, one JSON object per line unless --events text."
        ),
        epilog=(
            "Credentials and connection defaults come from RESUME_AGENT_CORE_* "
            "variables (see the package README); command-line flags win."
        ),
    )
    parser.add_argument("--resume-id", default=None, help="resume id the turn operates on (required unless --resume)")
    parser.add_argument("--prompt", default=None, help="user message that opens the turn (required unless --resume)")
    parser.add_argument(
        "--resume",
        default=None,
        help="resume an interrupted turn id from its server-side checkpoint",
    )
    parser.add_argument(
        "--execution-mode",
        choices=("approval", "full_access"),
        default=source.get(ENV_EXECUTION_MODE) or DEFAULT_EXECUTION_MODE,
        help=f"server resolves the effective mode; default {DEFAULT_EXECUTION_MODE}",
    )
    parser.add_argument("--base-version-id", default=None, help="optimistic-lock base version id")
    parser.add_argument("--turn-id", default=None, help="adopt an existing open turn instead of creating one")
    parser.add_argument("--turn-message", default=None, help="message stored on the created turn")
    parser.add_argument(
        "--session",
        default=source.get(ENV_SESSION),
        help=(
            f"session id the conversation history is appended to (env {ENV_SESSION}); "
            "a new session is created when omitted"
        ),
    )

    parser.add_argument("--base-url", default=None, help=f"API root (env {ENV_PREFIX}BASE_URL)")
    parser.add_argument("--session-cookie", default=None, help=f"session cookie value (env {ENV_PREFIX}SESSION_COOKIE)")
    parser.add_argument("--token", default=None, help=f"PAT bearer token (env {ENV_PREFIX}TOKEN)")
    parser.add_argument("--client-id", default=None, help=f"client id recorded on the turn (env {ENV_PREFIX}CLIENT_ID)")

    parser.add_argument("--model", default=source.get(ENV_MODEL), help=f"model id (env {ENV_MODEL})")
    parser.add_argument("--api-key", default=source.get(ENV_API_KEY), help=f"model API key (env {ENV_API_KEY})")
    parser.add_argument(
        "--provider-base-url",
        default=source.get(ENV_PROVIDER_BASE_URL) or DEFAULT_OPENAI_BASE_URL,
        help=f"OpenAI-compatible base url (env {ENV_PROVIDER_BASE_URL})",
    )
    parser.add_argument("--temperature", type=float, default=None, help="provider sampling temperature")
    parser.add_argument("--provider-max-tokens", type=int, default=None, help="provider-side max_tokens")

    parser.add_argument("--max-turns", type=int, default=None, help="run budget: model turns")
    parser.add_argument("--max-tokens", type=int, default=None, help="run budget: total tokens")
    parser.add_argument("--max-cost-usd", type=float, default=None, help="run budget: total cost in USD")

    parser.add_argument(
        "--state",
        default=source.get(ENV_STATE),
        help=f"minimal run snapshot path, rewritten at start and end (env {ENV_STATE})",
    )
    parser.add_argument(
        "--events",
        choices=EVENT_CHOICES,
        default=source.get(ENV_EVENTS) or DEFAULT_EVENTS,
        help=f"stdout format (env {ENV_EVENTS}); default {DEFAULT_EVENTS}",
    )
    return parser


def _build_settings(args: argparse.Namespace, env: Mapping[str, str]) -> AgentCoreSettings:
    """Layer command-line connection flags over the environment settings."""
    settings = AgentCoreSettings.from_env(env)
    overrides: dict[str, Any] = {}
    if args.base_url:
        overrides["base_url"] = args.base_url
    if args.session_cookie:
        overrides["session_cookie"] = args.session_cookie
    if args.token:
        overrides["token"] = args.token
    if args.client_id:
        overrides["default_client_id"] = args.client_id
    return replace(settings, **overrides) if overrides else settings


def _build_provider(
    args: argparse.Namespace,
    provider_factory: Callable[..., ModelProvider] | None,
) -> ModelProvider:
    factory = provider_factory or OpenAICompatibleProvider
    kwargs: dict[str, Any] = {"model": args.model, "base_url": args.provider_base_url}
    if args.api_key:
        kwargs["api_key"] = args.api_key
    if args.temperature is not None:
        kwargs["temperature"] = args.temperature
    if args.provider_max_tokens is not None:
        kwargs["max_tokens"] = args.provider_max_tokens
    return factory(**kwargs)


def _build_budget(args: argparse.Namespace) -> RunBudget:
    overrides: dict[str, Any] = {}
    if args.max_turns is not None:
        overrides["max_turns"] = args.max_turns
    if args.max_tokens is not None:
        overrides["max_tokens"] = args.max_tokens
    if args.max_cost_usd is not None:
        overrides["max_cost_usd"] = args.max_cost_usd
    return RunBudget(**overrides)


# --- event rendering ---------------------------------------------------------


def event_to_wire(event: RunEvent) -> dict[str, Any]:
    """Render one run event as a JSON-ready camelCase mapping."""
    if isinstance(event, MessageEvent):
        return {"type": event.type, "text": event.text}
    if isinstance(event, ToolProgressEvent):
        return {
            "type": event.type,
            "toolCallId": event.tool_call_id,
            "name": event.name,
            "phase": event.phase,
            "result": event.result,
            "detail": event.detail,
        }
    if isinstance(event, PendingActionEvent):
        return {
            "type": event.type,
            "pendingActionId": event.pending_action_id,
            "preview": event.preview.to_wire(),
        }
    if isinstance(event, FinalizeEvent):
        return {
            "type": event.type,
            "turn": event.turn.to_wire(),
            "result": event.result.to_wire() if event.result is not None else None,
        }
    if isinstance(event, ErrorEvent):
        return {
            "type": event.type,
            "code": event.code,
            "message": event.message,
            "detail": event.detail,
        }
    raise TypeError(f"unknown run event: {event!r}")  # pragma: no cover - defensive


def event_to_text(event: RunEvent) -> str:
    """Render one run event for a human reading a terminal."""
    if isinstance(event, MessageEvent):
        return event.text
    if isinstance(event, ToolProgressEvent):
        detail = f" - {event.detail}" if event.detail else ""
        return f"[tool] {event.name} {event.phase}{detail}"
    if isinstance(event, PendingActionEvent):
        return f"[approval] pending action {event.pending_action_id} awaits a human decision"
    if isinstance(event, FinalizeEvent):
        version = event.result.version_id if event.result is not None else None
        return f"[finalize] turn {event.turn.id} state={event.turn.state} version={version}"
    if isinstance(event, ErrorEvent):
        return f"[error] {event.code}: {event.message}"
    raise TypeError(f"unknown run event: {event!r}")  # pragma: no cover - defensive


# --- minimal state snapshot --------------------------------------------------


def write_state(path: str | Path, payload: Mapping[str, Any]) -> None:
    """Write the run snapshot, overwriting the previous one.

    The snapshot is intentionally the latest state only: a restart cannot resume
    from it. Per-turn checkpoints are the next issue's work.
    """
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def state_payload(
    args: argparse.Namespace,
    phase: str,
    started_at: datetime,
    *,
    ended_at: datetime | None = None,
    last_event_type: str | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """Build the minimal snapshot written at the start and the end of a run."""
    payload: dict[str, Any] = {
        "version": STATE_VERSION,
        "phase": phase,
        "resumeId": args.resume_id,
        "executionMode": args.execution_mode,
        "model": args.model,
        "startedAt": started_at.isoformat(),
    }
    if ended_at is not None:
        payload["endedAt"] = ended_at.isoformat()
    if last_event_type is not None:
        payload["lastEventType"] = last_event_type
    if session_id is not None:
        payload["sessionId"] = session_id
    return payload


# --- entry point -------------------------------------------------------------


def main(
    argv: Sequence[str] | None = None,
    *,
    env: Mapping[str, str] | None = None,
    transport: httpx.BaseTransport | None = None,
    provider: ModelProvider | None = None,
    provider_factory: Callable[..., ModelProvider] | None = None,
    stdout: TextIO | None = None,
    stderr: TextIO | None = None,
    now: Callable[[], datetime] | None = None,
) -> int:
    """Run one agent turn; return the process exit code.

    transport / provider / provider_factory are seams for tests: a real
    invocation leaves them unset and reaches the network and the model provider.
    """
    source: Mapping[str, str] = os.environ if env is None else env
    parser = build_parser(source)
    args = parser.parse_args(list(argv) if argv is not None else None)
    out = stdout if stdout is not None else sys.stdout
    err = stderr if stderr is not None else sys.stderr
    clock: Callable[[], datetime] = now or (lambda: datetime.now(timezone.utc))

    if not args.resume and (not args.resume_id or not args.prompt):
        print(f"{PROGRAM}: --resume-id and --prompt are required unless --resume is given.", file=err)
        return EXIT_USAGE

    owns_provider = provider is None
    if owns_provider and provider_factory is None and not args.model:
        print(
            f"{PROGRAM}: --model is required to build a model provider (or set {ENV_MODEL}).",
            file=err,
        )
        return EXIT_USAGE

    settings = _build_settings(args, source)
    if provider is None:
        provider = _build_provider(args, provider_factory)

    started_at = clock()
    if args.state:
        write_state(args.state, state_payload(args, "started", started_at))

    last_event_type: str | None = None
    resolved_session: str | None = None
    saw_error = False
    saw_finalize = False
    try:
        with ResumateClient(settings, transport=transport) as client:
            runtime = AgentRuntime(
                client,
                provider,
                budget=_build_budget(args),
                checkpoint=CheckpointStore(client),
                sessions=SessionJournal(client),
            )
            if args.resume:
                stream = runtime.resume(args.resume)
            else:
                stream = runtime.run(
                    args.resume_id,
                    args.prompt,
                    execution_mode=args.execution_mode,
                    base_version_id=args.base_version_id,
                    client_id=args.client_id,
                    turn_id=args.turn_id,
                    turn_message=args.turn_message,
                    session_id=args.session,
                )
            for event in stream:
                last_event_type = event.type
                saw_error = saw_error or isinstance(event, ErrorEvent)
                saw_finalize = saw_finalize or isinstance(event, FinalizeEvent)
                if args.events == "text":
                    line = event_to_text(event)
                else:
                    line = json.dumps(event_to_wire(event), ensure_ascii=False)
                print(line, file=out)
                out.flush()
            resolved_session = runtime.session_id
            if resolved_session:
                # Print the session id last: it is the handle for the stored
                # history, and a caller can capture it without parsing the run.
                if args.events == "text":
                    print(f"[session] {resolved_session}", file=out)
                else:
                    print(
                        json.dumps({"type": "session", "sessionId": resolved_session}, ensure_ascii=False),
                        file=out,
                    )
                out.flush()
    finally:
        if owns_provider:
            close = getattr(provider, "close", None)
            if callable(close):
                close()

    if args.state:
        write_state(
            args.state,
            state_payload(
                args,
                "failed" if saw_error else "finished",
                started_at,
                ended_at=clock(),
                last_event_type=last_event_type,
                session_id=resolved_session,
            ),
        )

    return EXIT_OK if saw_finalize and not saw_error else EXIT_RUN_FAILED


if __name__ == "__main__":  # pragma: no cover - the console script calls main()
    raise SystemExit(main())

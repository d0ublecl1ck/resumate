"""C-09 runtime loop skeleton: context -> model -> tools -> result.

The runtime orchestrates one agent run against the public API. It owns no
business state: turns, working copies, and versions stay server-side, and a
restart recovers by reading the public API again (C-09). Model access is
injected through the ModelProvider Protocol, so this package never binds to a
specific model vendor.

Guarantees implemented here:

- turn / token / cost budgets with a concrete limit in the failure event;
- cooperative cancellation that settles the turn per C-04;
- typed events for text, tool progress, pending actions, finalize, and errors.
"""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, ClassVar, Literal, Protocol, runtime_checkable

from .client import ResumateClient
from .errors import ApiClientError
from .models import PatchPreviewResponse, TurnResult, UserTurn
from .tools import TOOLS, Tool, UnknownToolError
from .turn import TurnSession

if TYPE_CHECKING:  # pragma: no cover - typing-only imports avoid a cycle
    from .checkpoint import CheckpointStore
    from .session import SessionJournal

DEFAULT_SYSTEM_PROMPT = (
    "You operate a Resumate resume through the public API. Work inside one turn: "
    "open it, stage patches, and close it. In approval mode you must preview a "
    "patch, get the pending action approved, and only then apply it. Never claim "
    "a change was saved before finalize succeeds."
)

MAX_TOOL_RESULT_CHARS = 8000


# --- model provider contract -------------------------------------------------


@dataclass(frozen=True, slots=True)
class ToolCall:
    """One function call requested by the model."""

    id: str
    name: str
    arguments: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class Message:
    """A chat message exchanged with the model provider."""

    role: Literal["system", "user", "assistant", "tool"]
    content: str = ""
    tool_calls: tuple[ToolCall, ...] = ()
    tool_call_id: str | None = None
    name: str | None = None

    def to_wire(self) -> dict[str, Any]:
        """JSON-ready message for a provider that wants plain mappings."""
        payload: dict[str, Any] = {"role": self.role, "content": self.content}
        if self.tool_calls:
            payload["toolCalls"] = [
                {"id": call.id, "name": call.name, "arguments": call.arguments}
                for call in self.tool_calls
            ]
        if self.tool_call_id is not None:
            payload["toolCallId"] = self.tool_call_id
        if self.name is not None:
            payload["name"] = self.name
        return payload

    @classmethod
    def from_wire(cls, payload: Mapping[str, Any]) -> "Message":
        """Rebuild a message from its checkpoint wire form."""
        tool_calls = tuple(
            ToolCall(
                id=str(call.get("id", "")),
                name=str(call.get("name", "")),
                arguments=dict(call.get("arguments") or {}),
            )
            for call in payload.get("toolCalls") or []
        )
        return cls(
            role=payload.get("role", "user"),
            content=payload.get("content") or "",
            tool_calls=tool_calls,
            tool_call_id=payload.get("toolCallId"),
            name=payload.get("name"),
        )


@dataclass(frozen=True, slots=True)
class ModelResponse:
    """A provider completion plus the usage needed for budget accounting."""

    message: Message
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    stop_reason: str | None = None


@runtime_checkable
class ModelProvider(Protocol):
    """Structural contract for a chat-completions-style model provider."""

    def complete(
        self,
        messages: Sequence[Message],
        tools: Sequence[Mapping[str, Any]],
    ) -> ModelResponse:
        """Return the next assistant message (optionally with tool calls)."""
        ...


# --- typed run events --------------------------------------------------------


@dataclass(frozen=True, slots=True)
class MessageEvent:
    """Assistant text produced during the run."""

    text: str
    type: ClassVar[str] = "message"


@dataclass(frozen=True, slots=True)
class ToolProgressEvent:
    """Lifecycle of one tool invocation."""

    tool_call_id: str
    name: str
    phase: Literal["started", "completed", "failed"]
    result: Any = None
    detail: str | None = None
    type: ClassVar[str] = "tool_progress"


@dataclass(frozen=True, slots=True)
class PendingActionEvent:
    """An approval gate opened by preview_patch (approval mode)."""

    pending_action_id: str
    preview: PatchPreviewResponse
    type: ClassVar[str] = "pending_action"


@dataclass(frozen=True, slots=True)
class FinalizeEvent:
    """The turn settled, with the aggregated version result when present."""

    turn: UserTurn
    result: TurnResult | None = None
    type: ClassVar[str] = "finalize"


@dataclass(frozen=True, slots=True)
class ErrorEvent:
    """A terminal failure with a stable machine code."""

    code: str
    message: str
    detail: str | None = None
    type: ClassVar[str] = "error"


RunEvent = MessageEvent | ToolProgressEvent | PendingActionEvent | FinalizeEvent | ErrorEvent


# --- budgets and cancellation ------------------------------------------------


class BudgetExceeded(RuntimeError):
    """Raised when a run exceeds max_tokens, max_turns, or max_cost_usd."""

    def __init__(self, limit: str, message: str) -> None:
        super().__init__(message)
        self.limit = limit


@dataclass(slots=True)
class RunBudget:
    """Mutable usage counters with hard limits for one run."""

    max_tokens: int = 100_000
    max_turns: int = 24
    max_cost_usd: float = 5.0
    tokens_used: int = field(default=0, init=False)
    turns_used: int = field(default=0, init=False)
    cost_used: float = field(default=0.0, init=False)

    def __post_init__(self) -> None:
        if self.max_tokens <= 0:
            raise ValueError("max_tokens must be greater than zero")
        if self.max_turns <= 0:
            raise ValueError("max_turns must be greater than zero")
        if self.max_cost_usd <= 0:
            raise ValueError("max_cost_usd must be greater than zero")

    def start_turn(self) -> None:
        """Count a model turn, raising when max_turns is exhausted."""
        if self.turns_used >= self.max_turns:
            raise BudgetExceeded(
                "max_turns",
                f"max_turns ({self.max_turns}) exhausted after {self.turns_used} turns",
            )
        self.turns_used += 1

    def consume(self, response: ModelResponse) -> None:
        """Account for a completion, raising once a hard limit is crossed."""
        self.tokens_used += response.input_tokens + response.output_tokens
        self.cost_used += response.cost_usd
        if self.tokens_used > self.max_tokens:
            raise BudgetExceeded(
                "max_tokens",
                f"token budget exceeded: {self.tokens_used} > {self.max_tokens}",
            )
        if self.cost_used > self.max_cost_usd:
            raise BudgetExceeded(
                "max_cost_usd",
                f"cost budget exceeded: {self.cost_used:.4f} > {self.max_cost_usd:.4f}",
            )

    def snapshot(self) -> dict[str, Any]:
        """Current usage, useful for logging without leaking credentials."""
        return {
            "turnsUsed": self.turns_used,
            "tokensUsed": self.tokens_used,
            "costUsedUsd": round(self.cost_used, 6),
            "maxTurns": self.max_turns,
            "maxTokens": self.max_tokens,
            "maxCostUsd": self.max_cost_usd,
        }

    @classmethod
    def from_snapshot(cls, snapshot: Mapping[str, Any] | None) -> "RunBudget":
        """Rebuild a budget (limits + usage) from a checkpoint snapshot."""
        data = dict(snapshot or {})
        budget = cls(
            max_tokens=int(data.get("maxTokens", 100_000)),
            max_turns=int(data.get("maxTurns", 24)),
            max_cost_usd=float(data.get("maxCostUsd", 5.0)),
        )
        budget.turns_used = int(data.get("turnsUsed", 0))
        budget.tokens_used = int(data.get("tokensUsed", 0))
        budget.cost_used = float(data.get("costUsedUsd", 0.0))
        return budget


class CancellationToken:
    """Thread-safe cooperative cancellation flag."""

    def __init__(self) -> None:
        self._event = threading.Event()

    def cancel(self) -> None:
        """Request cancellation of the running loop."""
        self._event.set()

    @property
    def cancelled(self) -> bool:
        """Whether cancellation has been requested."""
        return self._event.is_set()


# --- runtime -----------------------------------------------------------------


class AgentRuntime:
    """Runs one model/tool loop over a single resume turn.

    Example::

        runtime = AgentRuntime(client, provider, budget=RunBudget(max_turns=8))
        for event in runtime.run("res_1", "Add a summary section"):
            print(event.type, event)
    """

    def __init__(
        self,
        client: ResumateClient,
        provider: ModelProvider,
        *,
        tools: Mapping[str, Tool] | None = None,
        budget: RunBudget | None = None,
        cancellation: CancellationToken | None = None,
        system_prompt: str | None = None,
        auto_finalize: bool = True,
        max_tool_result_chars: int = MAX_TOOL_RESULT_CHARS,
        checkpoint: CheckpointStore | None = None,
        sessions: SessionJournal | None = None,
    ) -> None:
        self.client = client
        self.provider = provider
        self.tools: dict[str, Tool] = dict(tools) if tools is not None else dict(TOOLS)
        self.budget = budget or RunBudget()
        self.cancellation = cancellation
        self.system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        self.auto_finalize = auto_finalize
        self.max_tool_result_chars = max_tool_result_chars
        self.checkpoint = checkpoint
        self.sessions = sessions
        # Resolved by run()/resume(); exposed so a caller can report where the
        # conversation history was written (issue d2e4a).
        self.session_id: str | None = None

    # --- helpers ------------------------------------------------------------

    def _is_cancelled(self) -> bool:
        return self.cancellation is not None and self.cancellation.cancelled

    def _provider_tools(self) -> list[dict[str, Any]]:
        return [self.tools[name].to_spec() for name in sorted(self.tools)]

    def _invoke(self, session: TurnSession, call: ToolCall) -> Any:
        tool = self.tools.get(call.name)
        if tool is None:
            raise UnknownToolError(call.name)
        args: dict[str, Any] = dict(call.arguments or {})
        required = tool.input_schema.get("required", [])
        if "turn_id" in required and not args.get("turn_id"):
            args["turn_id"] = session.turn_id
        if "resume_id" in required and not args.get("resume_id"):
            args["resume_id"] = session.resume_id
        return tool.invoke(self.client, args)

    def _open_session(
        self,
        session_id: str | None,
        *,
        base: int | None = None,
        recorded: int = 0,
    ) -> None:
        """Ensure the run has a session before the turn is created (d2e4a)."""
        if self.sessions is None:
            self.session_id = session_id
            return
        self.session_id = self.sessions.start(session_id, base=base, recorded=recorded)

    def _record_session(self, messages: Sequence[Message]) -> None:
        """Mirror the current context into the session; best-effort by design."""
        if self.sessions is not None:
            self.sessions.record(messages)

    def _stringify(self, payload: Any) -> str:
        try:
            text = json.dumps(payload, ensure_ascii=False, default=str)
        except (TypeError, ValueError):  # pragma: no cover - defensive branch
            text = str(payload)
        if len(text) > self.max_tool_result_chars:
            return text[: self.max_tool_result_chars] + "...[truncated]"
        return text

    @staticmethod
    def _turn_result(payload: Any) -> TurnResult | None:
        if isinstance(payload, Mapping) and isinstance(payload.get("result"), Mapping):
            return TurnResult.model_validate(payload["result"])
        return None

    def _abort(
        self,
        session: TurnSession,
        code: str,
        message: str,
        detail: str | None = None,
    ) -> Iterator[ErrorEvent]:
        if session.open:
            try:
                session.cancel(reason=f"runtime aborted: {code}")
            except ApiClientError:
                # Best-effort settlement; the limit/cancel event still stands.
                pass
        yield ErrorEvent(code=code, message=message, detail=detail)

    # --- main loop ----------------------------------------------------------

    def run(
        self,
        resume_id: str,
        prompt: str,
        *,
        execution_mode: str | None = None,
        base_version_id: str | None = None,
        client_id: str | None = None,
        source: str | None = None,
        turn_message: str | None = None,
        turn_id: str | None = None,
        session_id: str | None = None,
    ) -> Iterator[RunEvent]:
        """Drive the loop, yielding typed events until the turn settles."""
        try:
            self._open_session(session_id)
        except ApiClientError as exc:
            yield ErrorEvent(code=exc.code, message=str(exc), detail="session failed")
            return
        session = TurnSession(
            self.client,
            resume_id,
            base_version_id=base_version_id,
            execution_mode=execution_mode,
            client_id=client_id,
            source=source,
            message=turn_message,
            turn_id=turn_id,
            session_id=self.session_id,
        )
        try:
            session.begin()
        except ApiClientError as exc:
            yield ErrorEvent(code=exc.code, message=str(exc), detail="begin failed")
            return
        except Exception as exc:  # pragma: no cover - defensive branch
            yield ErrorEvent(code="RUNTIME_ERROR", message=str(exc), detail="begin failed")
            return

        messages: list[Message] = [
            Message(role="system", content=self.system_prompt),
            Message(role="user", content=prompt),
        ]
        # The opening context is journalled before the first model call, so the
        # session reflects the run even if that call fails.
        self._record_session(messages)
        yield from self._drive(session, messages)

    def resume(self, turn_id: str) -> Iterator[RunEvent]:
        """Continue an interrupted turn from its server-side checkpoint."""
        if self.checkpoint is None:
            yield ErrorEvent(code="RUNTIME_ERROR", message="resume requires a checkpoint store")
            return
        try:
            turn = self.client.get_turn(turn_id)
        except ApiClientError as exc:
            yield ErrorEvent(code=exc.code, message=str(exc), detail="resume failed")
            return
        state = self.checkpoint.load(turn_id)
        run_state = state.run_state or {}
        # The turn carries the session it belongs to; an older turn created
        # before the session layer simply has none, and then nothing is journalled.
        journal_session_id = getattr(turn, "session_id", None)
        if journal_session_id:
            stored_base = run_state.get("sessionBase")
            self._open_session(
                journal_session_id,
                base=int(stored_base) if stored_base is not None else None,
                recorded=int(run_state.get("sessionSeq") or 0),
            )
        else:
            self.session_id = None
        session = TurnSession(
            self.client,
            turn.resume_id,
            turn_id=turn_id,
            session_id=self.session_id,
        )
        try:
            session.begin()
        except ApiClientError as exc:
            yield ErrorEvent(code=exc.code, message=str(exc), detail="resume failed")
            return
        if not session.open:
            yield FinalizeEvent(turn=session.turn, result=session.turn.result)
            return

        restored = [
            Message.from_wire(item) for item in (run_state.get("messages") or []) if isinstance(item, Mapping)
        ]
        messages: list[Message] = restored or [Message(role="system", content=self.system_prompt)]
        budget_snapshot = run_state.get("budget")
        if isinstance(budget_snapshot, Mapping):
            self.budget = RunBudget.from_snapshot(budget_snapshot)
        self._record_session(messages)
        yield from self._drive(session, messages)

    def _save_checkpoint(
        self,
        session: TurnSession,
        messages: Sequence[Message],
        phase: str,
        pending_action_id: str | None = None,
    ) -> None:
        """Best-effort checkpoint write; a failure must not kill a live run."""
        self._record_session(messages)
        if self.checkpoint is None:
            return
        try:
            self.checkpoint.save(
                session.turn_id,
                messages=messages,
                budget=self.budget,
                phase=phase,
                pending_action_id=pending_action_id,
                extra={
                    "resumeId": session.resume_id,
                    "sessionId": self.session_id,
                    "sessionBase": self.sessions.base if self.sessions is not None else 0,
                    "sessionSeq": self.sessions.recorded if self.sessions is not None else 0,
                },
            )
        except ApiClientError:
            # The next model turn writes again; a lost checkpoint only costs the
            # ability to resume from that exact point.
            pass

    @staticmethod
    def _phase(pending_action_id: str | None) -> str:
        """Checkpoint phase: a live approval gate is visible to a resumer."""
        return "awaiting_approval" if pending_action_id else "running"

    def _drive(self, session: TurnSession, messages: list[Message]) -> Iterator[RunEvent]:
        provider_tools = self._provider_tools()
        pending_action_id: str | None = None
        for _ in range(self.budget.max_turns):
            if self._is_cancelled():
                self._save_checkpoint(session, messages, "cancelled", pending_action_id)
                yield from self._abort(session, "CANCELLED", "Run cancelled by caller")
                return
            try:
                self.budget.start_turn()
            except BudgetExceeded as exc:
                self._save_checkpoint(session, messages, "failed", pending_action_id)
                yield from self._abort(session, "BUDGET_EXCEEDED", str(exc), exc.limit)
                return
            try:
                response = self.provider.complete(tuple(messages), tuple(provider_tools))
            except Exception as exc:
                self._save_checkpoint(session, messages, "failed", pending_action_id)
                yield from self._abort(session, "MODEL_ERROR", str(exc))
                return
            try:
                self.budget.consume(response)
            except BudgetExceeded as exc:
                self._save_checkpoint(session, messages, "failed", pending_action_id)
                yield from self._abort(session, "BUDGET_EXCEEDED", str(exc), exc.limit)
                return

            if response.message.content:
                yield MessageEvent(text=response.message.content)

            tool_calls = tuple(response.message.tool_calls)
            if not tool_calls:
                messages.append(response.message)
                self._save_checkpoint(session, messages, self._phase(pending_action_id), pending_action_id)
                break

            messages.append(response.message)
            terminal: str | None = None
            finalize_result: TurnResult | None = None

            for call in tool_calls:
                yield ToolProgressEvent(
                    tool_call_id=call.id,
                    name=call.name,
                    phase="started",
                )
                try:
                    result = self._invoke(session, call)
                except ApiClientError as exc:
                    yield ToolProgressEvent(
                        tool_call_id=call.id,
                        name=call.name,
                        phase="failed",
                        detail=str(exc),
                    )
                    messages.append(
                        Message(
                            role="tool",
                            content=f"ERROR [{exc.code}]: {exc.message}",
                            tool_call_id=call.id,
                            name=call.name,
                        )
                    )
                    continue
                except Exception as exc:
                    yield ToolProgressEvent(
                        tool_call_id=call.id,
                        name=call.name,
                        phase="failed",
                        detail=str(exc),
                    )
                    messages.append(
                        Message(
                            role="tool",
                            content=f"ERROR: {exc}",
                            tool_call_id=call.id,
                            name=call.name,
                        )
                    )
                    continue

                payload = result
                yield ToolProgressEvent(
                    tool_call_id=call.id,
                    name=call.name,
                    phase="completed",
                    result=payload,
                )
                if (
                    call.name == "preview_patch"
                    and isinstance(payload, Mapping)
                    and payload.get("pendingActionId")
                ):
                    pending_action_id = str(payload["pendingActionId"])
                    yield PendingActionEvent(
                        pending_action_id=pending_action_id,
                        preview=PatchPreviewResponse.model_validate(payload),
                    )
                elif call.name == "apply_patch":
                    pending_action_id = None
                messages.append(
                    Message(
                        role="tool",
                        content=self._stringify(payload),
                        tool_call_id=call.id,
                        name=call.name,
                    )
                )
                if call.name == "finalize_turn":
                    terminal = "finalize"
                    finalize_result = self._turn_result(payload)
                elif call.name == "cancel_turn":
                    terminal = "cancel"

            self._save_checkpoint(session, messages, self._phase(pending_action_id), pending_action_id)

            if terminal == "finalize":
                try:
                    session.refresh()
                except ApiClientError:  # pragma: no cover - informational refresh
                    pass
                self._save_checkpoint(session, messages, "finalized", None)
                yield FinalizeEvent(turn=session.turn, result=finalize_result or session.turn.result)
                return
            if terminal == "cancel":
                self._save_checkpoint(session, messages, "cancelled", None)
                return
        else:
            self._save_checkpoint(session, messages, "failed", pending_action_id)
            yield from self._abort(
                session,
                "BUDGET_EXCEEDED",
                f"max_turns ({self.budget.max_turns}) exhausted",
                "max_turns",
            )
            return

        if not self.auto_finalize:
            return
        try:
            closed = session.finalize()
        except ApiClientError as exc:
            yield ErrorEvent(code=exc.code, message=str(exc), detail="finalize failed")
            return
        self._save_checkpoint(session, messages, "finalized", None)
        yield FinalizeEvent(turn=closed, result=closed.result)

"""Context compaction: summarise old turns before the token wall (issue 4013b).

The fake server and scripted providers keep the suite offline. Every assertion
is about what the *model* would see, because that is the only thing compaction
changes; the checkpoint assertions prove the compacted context survives a
restart.
"""

from __future__ import annotations

import httpx
import pytest

from test_session_journal import FakeSessionApi, done_response

from resumate_agent_core.checkpoint import CheckpointStore
from resumate_agent_core.compaction import (
    SUMMARY_MARKER,
    CompactionPolicy,
    cut_index,
    estimate_context_tokens,
    should_compact,
)
from resumate_agent_core.runtime import AgentRuntime, Message, ModelResponse, RunBudget, ToolCall
from resumate_agent_core.session import SessionJournal

SUMMARY_TEXT = "Earlier turns refreshed the working document; the experience section was already loaded."

# A deliberately tiny threshold so a handful of scripted turns is enough to trip
# compaction: 600 estimated tokens at 3 chars/token is roughly 1.8k characters.
POLICY = CompactionPolicy(max_context_tokens=600, keep_recent_turns=1, min_messages=4)


class RecordingProvider:
    """Scripted agent responses plus the summarisation calls it was asked for."""

    def __init__(self, responses, summary: str = SUMMARY_TEXT) -> None:
        self._responses = list(responses)
        self._summary = summary
        self.agent_calls: list[list] = []
        self.summary_calls: list[list] = []

    def complete(self, messages, tools):
        if not tools:
            self.summary_calls.append(list(messages))
            return ModelResponse(message=Message(role="assistant", content=self._summary))
        self.agent_calls.append(list(messages))
        return self._responses.pop(0)


class FailingSummaryProvider(RecordingProvider):
    """A provider whose summarisation call always fails."""

    def complete(self, messages, tools):
        if not tools:
            raise RuntimeError("summariser unavailable")
        return super().complete(messages, tools)


class CompactThenCrashProvider:
    """Runs long enough to compact, then dies the way a killed process does."""

    def __init__(self, summary: str = SUMMARY_TEXT) -> None:
        self._summary = summary
        self.agent_calls: list[list] = []
        self.summary_calls: list[list] = []

    def complete(self, messages, tools):
        if not tools:
            self.summary_calls.append(list(messages))
            return ModelResponse(message=Message(role="assistant", content=self._summary))
        self.agent_calls.append(list(messages))
        if len(self.agent_calls) <= 3:
            return turning_response(len(self.agent_calls))
        raise KeyboardInterrupt("simulated process kill")


def turning_response(index: int) -> ModelResponse:
    """One agent turn: a tool call whose text is long enough to matter."""
    return ModelResponse(
        message=Message(
            role="assistant",
            content=f"turn-{index} " + ("x" * 400),
            tool_calls=(ToolCall(id=f"c{index}", name="get_working_document", arguments={"resume_id": "res_1"}),),
        )
    )


def joined(messages) -> str:
    return "\n".join(message.content for message in messages)


def build_runtime(client, provider, policy: CompactionPolicy = POLICY) -> AgentRuntime:
    return AgentRuntime(
        client,
        provider,
        budget=RunBudget(max_turns=8),
        checkpoint=CheckpointStore(client),
        sessions=SessionJournal(client),
        compaction=policy,
    )


def test_run_compacts_old_turns_and_persists_the_result(make_client) -> None:
    fake = FakeSessionApi()
    provider = RecordingProvider(
        [turning_response(1), turning_response(2), turning_response(3), done_response()]
    )
    with make_client(fake.handler) as client:
        runtime = build_runtime(client, provider)
        events = list(runtime.run("res_1", "tighten bullets"))
        session_id = runtime.session_id
        stored = fake.stored(session_id)

    run_state = dict(fake.run_state)

    assert events[-1].type == "finalize"
    assert "compaction" in [event.type for event in events]
    assert provider.summary_calls, "the injected provider was never asked to summarise"

    latest = provider.agent_calls[-1]
    assert latest[0].role == "system"
    assert latest[1].role == "system"
    assert SUMMARY_MARKER in latest[1].content
    assert SUMMARY_TEXT in latest[1].content
    # The folded turns are gone from the request, the newest one is kept.
    assert "turn-1" not in joined(latest)
    assert "turn-2" not in joined(latest)
    assert "turn-3" in joined(latest)

    # The compacted context is exactly what the checkpoint stores.
    assert run_state["compaction"]["compactedMessages"] > 0
    assert any(SUMMARY_MARKER in str(message.get("content", "")) for message in run_state["messages"])

    # History keeps a marker row, and later messages never reuse an older seq.
    seqs = [row["seq"] for row in stored]
    assert seqs == sorted(set(seqs))
    markers = [row for row in stored if isinstance(row["content"], dict) and row["content"].get("compactedHistory")]
    assert markers
    assert all(row["role"] == "system" for row in markers)
    marker_seq = max(row["seq"] for row in markers)
    later = [row for row in stored if row["seq"] > marker_seq]
    assert [row["role"] for row in later] == ["assistant"]


def test_resume_restores_the_compacted_context(make_client) -> None:
    fake = FakeSessionApi()
    with make_client(fake.handler) as client:
        crashing = build_runtime(client, CompactThenCrashProvider())
        with pytest.raises(KeyboardInterrupt):
            list(crashing.run("res_1", "tighten bullets"))
        session_id = crashing.session_id

    assert fake.run_state["compaction"]["compactedMessages"] > 0
    assert [row["seq"] for row in fake.stored(session_id)] == sorted({row["seq"] for row in fake.stored(session_id)})

    provider = RecordingProvider([done_response()])
    with make_client(fake.handler) as resumed_client:
        resumed = build_runtime(resumed_client, provider)
        events = list(resumed.resume("turn_1"))

    assert events[-1].type == "finalize"
    assert provider.summary_calls == []
    restored = provider.agent_calls[0]
    assert any(SUMMARY_MARKER in message.content for message in restored)
    assert "turn-1" not in joined(restored)
    assert "turn-2" not in joined(restored)
    assert "turn-3" in joined(restored)


def test_a_failed_summary_keeps_the_full_context_and_the_run_alive(make_client) -> None:
    fake = FakeSessionApi()
    provider = FailingSummaryProvider(
        [turning_response(1), turning_response(2), turning_response(3), done_response()]
    )
    with make_client(fake.handler) as client:
        runtime = build_runtime(client, provider)
        events = list(runtime.run("res_1", "tighten bullets"))

    assert events[-1].type == "finalize"
    assert "compaction" not in [event.type for event in events]
    assert "turn-1" in joined(provider.agent_calls[-1])
    assert "compaction" not in fake.run_state


def test_estimation_threshold_and_cut_boundaries() -> None:
    messages = [
        Message(role="system", content="s"),
        Message(role="user", content="u"),
        Message(role="assistant", content="a"),
        Message(role="tool", content="t"),
        Message(role="assistant", content="b"),
    ]

    # 3 chars/token plus a fixed per-message overhead (documented assumption).
    assert estimate_context_tokens([Message(role="user", content="x" * 300)]) == 4 + 100
    assert cut_index(messages, 1) == 4
    assert cut_index(messages, 10) == len(messages)
    assert CompactionPolicy().threshold(1000) == 500
    assert CompactionPolicy(max_context_tokens=99).threshold(1000) == 99
    assert should_compact(messages, CompactionPolicy(max_context_tokens=10**9, min_messages=3), max_tokens=10**9) is False
    assert should_compact(messages, CompactionPolicy(max_context_tokens=1, min_messages=3), max_tokens=10**9) is True

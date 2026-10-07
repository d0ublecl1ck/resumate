"""Session journal: the run mirrors its model context into a session (d2e4a).

The fake below is a small in-memory stand-in for the session, turn and run-state
endpoints. Using MockTransport keeps the suite offline, and because the fake owns
the seq uniqueness rule it can prove the client never fabricates a duplicate.
"""

from __future__ import annotations

import json

import httpx
import pytest

from conftest import result_payload, turn_payload, working_document_payload
from resumate_agent_core.checkpoint import CheckpointStore
from resumate_agent_core.runtime import AgentRuntime, Message, ModelResponse, ToolCall
from resumate_agent_core.session import SessionJournal

CREATED_AT = "2026-01-01T00:00:00Z"


class FakeSessionApi:
    """In-memory session / turn / run-state server with seq idempotency."""

    def __init__(self) -> None:
        self.sessions: dict[str, dict] = {}
        self.messages: dict[str, list[dict]] = {}
        self.append_calls: list[tuple[str, int]] = []
        self.turn_bodies: list[dict] = []
        self.run_state: dict = {}
        self.state_version = 0
        self.turn: dict = turn_payload()
        self._sessions = 0
        self._messages = 0

    # --- server behaviour ---------------------------------------------------

    def _create_session(self) -> str:
        self._sessions += 1
        session_id = f"ses_{self._sessions}"
        self.sessions[session_id] = {
            "id": session_id,
            "createdAt": CREATED_AT,
            "updatedAt": CREATED_AT,
            "lastActiveAt": CREATED_AT,
        }
        self.messages[session_id] = []
        return session_id

    def _append(self, session_id: str, seq: int, role: str, content) -> dict:
        self.append_calls.append((session_id, seq))
        if session_id not in self.sessions:
            self._create_session()
            self.sessions[session_id] = {
                "id": session_id,
                "createdAt": CREATED_AT,
                "updatedAt": CREATED_AT,
                "lastActiveAt": CREATED_AT,
            }
            self.messages.setdefault(session_id, [])
        for row in self.messages[session_id]:
            if row["seq"] == seq:
                return row
        self._messages += 1
        row = {
            "id": f"msg_{self._messages}",
            "sessionId": session_id,
            "seq": seq,
            "role": role,
            "content": content,
            "createdAt": CREATED_AT,
        }
        self.messages[session_id].append(row)
        return row

    def stored(self, session_id: str) -> list[dict]:
        return sorted(self.messages[session_id], key=lambda row: row["seq"])

    def handler(self, request: httpx.Request) -> httpx.Response:
        path, method = request.url.path, request.method
        body = json.loads(request.content) if request.content else {}
        if path == "/sessions" and method == "POST":
            session_id = self._create_session()
            return httpx.Response(201, json=self.sessions[session_id])
        if path == "/sessions" and method == "GET":
            return httpx.Response(200, json=list(self.sessions.values()))
        if path.startswith("/sessions/") and path.endswith("/messages"):
            session_id = path.split("/")[2]
            if method == "POST":
                row = self._append(session_id, body["seq"], body["role"], body["content"])
                return httpx.Response(201, json=row)
            after = int(request.url.params.get("afterSeq", 0))
            rows = [row for row in self.stored(session_id) if row["seq"] > after]
            return httpx.Response(200, json=rows)
        if path == "/resumes/res_1/turns" and method == "POST":
            self.turn_bodies.append(body)
            self.turn = turn_payload(sessionId=body.get("sessionId"))
            return httpx.Response(201, json=self.turn)
        if path == "/resumes/res_1/working-document":
            return httpx.Response(200, json=working_document_payload())
        if path == "/turns/turn_1" and method == "GET":
            return httpx.Response(200, json=self.turn)
        if path == "/turns/turn_1/state":
            if method == "GET":
                return httpx.Response(
                    200,
                    json={"turnId": "turn_1", "runState": self.run_state, "stateVersion": self.state_version},
                )
            self.state_version = int(body["stateVersion"]) + 1
            self.run_state = body["runState"]
            return httpx.Response(
                200,
                json={"turnId": "turn_1", "runState": self.run_state, "stateVersion": self.state_version},
            )
        if path == "/turns/turn_1/finalize":
            self.turn = turn_payload(
                state="finalized",
                result=result_payload(),
                sessionId=self.turn.get("sessionId"),
            )
            return httpx.Response(200, json=self.turn)
        if path == "/turns/turn_1/cancel":
            self.turn = turn_payload(state="cancelled", sessionId=self.turn.get("sessionId"))
            return httpx.Response(200, json=self.turn)
        raise AssertionError(f"unexpected {method} {path}")


def inspect_response() -> ModelResponse:
    return ModelResponse(
        message=Message(
            role="assistant",
            content="Inspecting the working copy",
            tool_calls=(ToolCall(id="c1", name="get_working_document", arguments={"resume_id": "res_1"}),),
        ),
        input_tokens=10,
        output_tokens=5,
    )


def done_response() -> ModelResponse:
    return ModelResponse(message=Message(role="assistant", content="Done"))


def create_turn_response() -> ModelResponse:
    return ModelResponse(
        message=Message(
            role="assistant",
            content="Opening a turn",
            tool_calls=(ToolCall(id="c1", name="create_turn", arguments={}),),
        ),
        input_tokens=1,
        output_tokens=1,
    )


class ScriptedProvider:
    def __init__(self, responses) -> None:
        self._responses = list(responses)

    def complete(self, messages, tools):
        return self._responses.pop(0)


class CrashProvider:
    """Completes the first turn, then dies the way a killed process does."""

    def __init__(self) -> None:
        self.calls = 0

    def complete(self, messages, tools):
        self.calls += 1
        if self.calls == 1:
            return inspect_response()
        raise KeyboardInterrupt("simulated process kill")


def test_journal_records_every_context_message_with_contiguous_seq(make_client) -> None:
    fake = FakeSessionApi()
    with make_client(fake.handler) as client:
        journal = SessionJournal(client)
        session_id = journal.start()
        messages = [
            Message(role="system", content="s"),
            Message(role="user", content="u"),
            Message(role="assistant", content="a"),
            Message(role="tool", content="t", tool_call_id="c1", name="get_working_document"),
        ]

        recorded = journal.record(messages)

    assert recorded == 4
    rows = fake.stored(session_id)
    assert [row["seq"] for row in rows] == [1, 2, 3, 4]
    assert [row["role"] for row in rows] == ["system", "user", "assistant", "tool"]
    assert rows[2]["content"]["role"] == "assistant"


def test_journal_replay_reuses_the_same_seq_and_the_server_absorbs_it(make_client) -> None:
    fake = FakeSessionApi()
    messages = [Message(role="system", content="s"), Message(role="user", content="u")]
    with make_client(fake.handler) as client:
        journal = SessionJournal(client)
        session_id = journal.start()
        assert journal.record(messages) == 2

        # The checkpoint stores the base, so a replay after a crash reuses the
        # same seq 1..2 instead of inventing seq 3..4.
        journal.start(session_id, base=0)
        assert journal.record(messages) == 2

    assert fake.append_calls == [(session_id, 1), (session_id, 2), (session_id, 1), (session_id, 2)]
    assert [row["seq"] for row in fake.stored(session_id)] == [1, 2]


def test_journal_continues_an_existing_session_at_the_next_seq(make_client) -> None:
    fake = FakeSessionApi()
    with make_client(fake.handler) as client:
        first = SessionJournal(client)
        session_id = first.start()
        first.record([Message(role="system", content="s1"), Message(role="user", content="u1")])

        # A later run pointed at the same session must append after the stored
        # history, not overwrite seq 1 and 2 with different content.
        second = SessionJournal(client)
        assert second.start(session_id) == session_id
        second.record([Message(role="system", content="s2")])

    assert [(row["seq"], row["role"], row["content"]["content"]) for row in fake.stored(session_id)] == [
        (1, "system", "s1"),
        (2, "user", "u1"),
        (3, "system", "s2"),
    ]


def test_journal_creates_a_session_once_and_reuses_a_given_one(make_client) -> None:
    fake = FakeSessionApi()
    with make_client(fake.handler) as client:
        journal = SessionJournal(client)
        created = journal.start()
        reused = journal.start(created)

    assert created == reused
    assert list(fake.sessions) == [created]


def test_run_journals_messages_and_associates_the_turn_with_the_session(make_client) -> None:
    fake = FakeSessionApi()
    with make_client(fake.handler) as client:
        runtime = AgentRuntime(
            client,
            ScriptedProvider([inspect_response(), done_response()]),
            sessions=SessionJournal(client),
        )
        events = list(runtime.run("res_1", "tighten bullets"))

        session_id = runtime.session_id
        stored = fake.stored(session_id)

    assert events[-1].type == "finalize"
    assert [entry["seq"] for entry in stored] == [1, 2, 3, 4, 5, 6]
    assert [entry["role"] for entry in stored] == ["system", "user", "assistant", "tool", "assistant", "assistant"]
    # The last row is the user-facing reply, not part of the model context.
    assert stored[-1]["content"] == {"text": "Done"}
    assert fake.turn_bodies[0]["sessionId"] == session_id


def test_model_created_turn_is_linked_to_the_journal_session(make_client) -> None:
    """The runtime already opened a turn; if the model opens another anyway it must
    carry the same session so the conversation stays readable from that turn."""
    fake = FakeSessionApi()
    with make_client(fake.handler) as client:
        runtime = AgentRuntime(
            client,
            ScriptedProvider([create_turn_response(), done_response()]),
            sessions=SessionJournal(client),
        )
        list(runtime.run("res_1", "tighten bullets"))
        session_id = runtime.session_id

    assert len(fake.turn_bodies) == 2
    assert all(body.get("sessionId") == session_id for body in fake.turn_bodies)


def test_resume_continues_the_session_without_duplicate_seq(make_client) -> None:
    fake = FakeSessionApi()
    with make_client(fake.handler) as client:
        crashing = AgentRuntime(
            client,
            CrashProvider(),
            checkpoint=CheckpointStore(client),
            sessions=SessionJournal(client),
        )
        with pytest.raises(KeyboardInterrupt):
            list(crashing.run("res_1", "tighten bullets"))
        session_id = crashing.session_id

    assert [row["seq"] for row in fake.stored(session_id)] == [1, 2, 3, 4]
    assert fake.run_state.get("sessionSeq") == 4

    # A brand-new runtime in a brand-new client reads only what the fake server
    # kept: the conversation must continue, not restart.
    with make_client(fake.handler) as resumed_client:
        resumed = AgentRuntime(
            resumed_client,
            ScriptedProvider([done_response()]),
            checkpoint=CheckpointStore(resumed_client),
            sessions=SessionJournal(resumed_client),
        )
        events = list(resumed.resume("turn_1"))

    assert [event.type for event in events] == ["message", "finalize"]
    rows = fake.stored(session_id)
    assert [row["seq"] for row in rows] == [1, 2, 3, 4, 5, 6]
    assert [row["role"] for row in rows] == ["system", "user", "assistant", "tool", "assistant", "assistant"]
    assert rows[-1]["content"] == {"text": "Done"}
    assert len({row["seq"] for row in rows}) == len(rows)

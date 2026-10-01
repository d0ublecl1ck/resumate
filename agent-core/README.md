# resumate-agent-core

Agent foundation for Resumate's external operation layer (issue `58d30`,
contract `docs/agent/agent-operation-api.md`). It gives external agents
(Hermes / Codex / MCP / SDKs) a typed, thin client over the public REST API
plus the orchestration primitives needed to drive a single resume-editing turn:
turns, domain patches, pending-action approvals, a tool registry, and a
model-agnostic runtime loop.

## Trust boundary (read this first)

- **Public API only.** Every operation goes through the frozen REST contract via
  `httpx`. The package never imports a web framework, ORM, migration tool, or
  database driver, and it never opens a business-database connection.
- **Single source of truth.** Business state (turns, working copies, pending
  actions, versions) lives on the server. This package holds no durable state
  and must not maintain a second resume truth source (contract **C-09**).
- **No auth bypass.** `source` and `executionMode` are resolved server-side.
  In `approval` mode an `apply` only succeeds after the matching
  `PendingAction` is approved; the client cannot shortcut confirmation.
- **Approval is human-only.** Deciding a `PendingAction` is a user action: the
  server rejects PAT/agent callers with `403 FORBIDDEN`, and the model tool
  registry never exposes `approve_action` / `reject_action`.
- **Credentials** are supplied by the caller: either the web session cookie or a
  personal access token sent as `Authorization: Bearer`. Both paths are
  implemented end to end. Nothing here logs, stores, or derives credentials.

## Install

```bash
cd agent-core
uv sync            # runtime deps (httpx + pydantic v2) plus pytest
```

Python `>=3.11` is required. The base package has no model-vendor
dependency: `httpx` stays the only required HTTP library.

## Model provider

`OpenAICompatibleProvider` adapts any OpenAI-compatible `/chat/completions`
endpoint (OpenAI, Azure OpenAI, OpenRouter, a local gateway, ...) to the
runtime's `ModelProvider` Protocol. It uses the same `httpx` dependency as the
rest of the package, so there is no vendor SDK to install.

```python
from resumate_agent_core import AgentRuntime, OpenAICompatibleProvider

provider = OpenAICompatibleProvider(
    model="gpt-4o-mini",
    api_key="<key>",
    base_url="https://api.openai.com/v1",
)
runtime = AgentRuntime(client, provider)
for event in runtime.run("res_abc", "Tighten the experience bullets"):
    print(event.type, event)
```

## Quickstart

```python
from resumate_agent_core import AgentCoreSettings, ResumateClient, TurnSession, patches

settings = AgentCoreSettings(
    base_url="http://127.0.0.1:8000",
    session_cookie="<session-cookie-value>",
)
client = ResumateClient(settings)

ops = [
    patches.upsert_section(
        {"id": "exp", "kind": "experience", "title": "Experience", "entries": []}
    )
]

# Open a turn, stage a change, and close it with an auditable version.
with TurnSession(client, "res_abc", execution_mode="approval") as turn:
    preview = turn.preview(ops)
    turn.approve(preview.pending_action_id)
    turn.apply(ops, pending_action_id=preview.pending_action_id)
    turn.finalize(message="Add experience section")
```

Configuration is environment aware; every value can be supplied without code:

| Env var | Setting | Default |
| --- | --- | --- |
| `RESUME_AGENT_CORE_BASE_URL` | API root | `http://127.0.0.1:8000` |
| `RESUME_AGENT_CORE_TIMEOUT_SECONDS` | request timeout | `30` |
| `RESUME_AGENT_CORE_SESSION_COOKIE_NAME` | cookie name | `resumate_session` |
| `RESUME_AGENT_CORE_SESSION_COOKIE` | cookie value | unset |
| `RESUME_AGENT_CORE_TOKEN` | PAT bearer token | unset |
| `RESUME_AGENT_CORE_VERIFY_SSL` | TLS verification | `true` |
| `RESUME_AGENT_CORE_CLIENT_ID` | client id recorded on created turns | `external` |
| `RESUME_AGENT_CORE_MODEL` | CLI model id | unset |
| `RESUME_AGENT_CORE_API_KEY` | CLI model API key | unset |
| `RESUME_AGENT_CORE_PROVIDER_BASE_URL` | CLI provider base url | `https://api.openai.com/v1` |
| `RESUME_AGENT_CORE_EXECUTION_MODE` | CLI default execution mode | `approval` |
| `RESUME_AGENT_CORE_SESSION` | CLI session id to append history to | unset (created per run) |
| `RESUME_AGENT_CORE_STATE` | CLI state snapshot path | unset |
| `RESUME_AGENT_CORE_EVENTS` | CLI stdout format (`json` / `text`) | `json` |

## CLI runner

The package ships one executable entry point, `resumate-agent`, plus
`python -m resumate_agent_core`. It runs a single turn end to end through the
same `AgentRuntime` loop the library exposes, so there is no second
orchestration path to keep in sync.

```bash
export RESUME_AGENT_CORE_BASE_URL=http://127.0.0.1:8000
export RESUME_AGENT_CORE_SESSION_COOKIE=<session-cookie-value>

uv run resumate-agent \
  --resume-id res_abc \
  --prompt "Tighten the experience bullets" \
  --model gpt-4o-mini --api-key "$OPENAI_API_KEY"
```

Events go to stdout, one JSON object per line (the `--mode json` shape). Every
line carries a `type` of `message`, `tool_progress`, `pending_action`,
`finalize`, or `error` plus that event's camelCase payload, so a caller can
stream and parse the run without a second protocol. `--events text` renders the
same events for a human, and `--token <PAT>` switches authentication from the
session cookie to a personal access token. A final `{"type": "session",
"sessionId": "..."}` line reports where the conversation history was written.

Exit codes: `0` when the turn finalized, `1` when the run reported an `error`
event or never finalized, `2` for a usage/configuration mistake. Credentials are
never echoed to stdout or stderr.

### Run state and resume

The runner checkpoints after **every model call**: the message context, budget
counters, `turn_id`, `pending_action_id`, and `phase` are written to the
server-side per-turn checkpoint (`GET|PUT /turns/{turn_id}/state`), so nothing
depends on local process memory. `--resume <turnId>` reloads that checkpoint and
continues the same open turn until it finalizes:

```bash
uv run resumate-agent --resume turn_abc123 \
  --model gpt-4o-mini --api-key "$OPENAI_API_KEY"
```

`--state <path>` remains a **local observability snapshot** (start/finish of one
process), not the source of truth: a restart resumes from the server checkpoint
via `--resume`, never from that file.

### Session history

Every run also writes its conversation to a server-side session. The runtime
adopts the session it is given (`--session <sessionId>`, or
`RESUME_AGENT_CORE_SESSION`) and creates one when none is supplied; the turn is
opened inside that session, and every model message that enters the context —
`system`, `user`, `assistant`, `tool` — is appended to
`agent_session_messages` with a monotonically increasing `seq`.

`seq` is the message's index in the context plus one, so it is deterministic:
a run that died before its checkpoint re-sends the same `seq` values and the
server absorbs them on `(session_id, seq)` instead of duplicating history.
History is browsable with `GET /sessions/{id}/messages`; it is **not** the
resume source — `--resume` still reads only the checkpoint.

### Context compaction

A long run no longer stops at the token wall. Before every model call the runtime
estimates the context size and, when it is over the threshold, asks the *same
injected provider* (with no tools) to summarise the older turns. Those turns are
replaced in the request by one `system` message prefixed with
`[compacted-history]`; only the most recent turns stay verbatim.

There is no tokenizer in this package, so the estimate is a documented character
heuristic: `tokens ≈ 4 + ceil(chars / 3)` per message. English is nearer 4
characters per token and Chinese nearer 1, so 3 deliberately over-estimates
English and triggers compaction a little early — the conservative direction for
budget safety. The default trigger is `max(256, max_tokens // 2)`; override it
with `--compact-above-tokens <n>` and choose how much stays verbatim with
`--keep-recent-turns <n>` (default 4).

Compaction is durable: the compacted context is written to the checkpoint, so
`--resume` restores the summary instead of the full history, and the session
history gains one `system` row marked `"compactedHistory": true`. A failed
summary never kills the run — the runtime keeps the full context and lets the
ordinary budget guard decide.

## Layout

```text
src/resumate_agent_core/
  config.py    # AgentCoreSettings (env-aware, stdlib-only)
  errors.py    # error envelope -> ApiClientError
  models.py    # pydantic v2 models for contract sections 4 and 5
  patches.py   # set_basics / upsert_section / remove_section / upsert_entry / remove_entry
  client.py    # ResumateClient: the agent-operation public endpoints
  turn.py      # TurnSession + idempotency-key helper
  checkpoint.py # per-turn run checkpoint over GET|PUT /turns/{turn_id}/state
  session.py   # SessionJournal: mirror the run context into agent_session_messages
  compaction.py # CompactionPolicy + character-heuristic context size estimate
  tools.py     # TOOLS registry: name -> schema + client callable
  runtime.py   # C-09 loop skeleton (ModelProvider Protocol, budget, cancel, events)
  cli.py       # resumate-agent: one run as a standalone process (JSONL events, --resume)
  __main__.py  # python -m resumate_agent_core -> cli.main
  openai_provider.py   # OpenAI-compatible ModelProvider over httpx
  skills.py    # SKILL.md loader for a skills directory
```

## Tests

```bash
uv run pytest -q
```

All tests run against `httpx.MockTransport`; there is no network access and no
database access.

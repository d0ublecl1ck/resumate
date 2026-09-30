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
- **Credentials** are supplied by the caller (session cookie now, PAT later).
  Nothing here logs, stores, or derives credentials.

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
| `RESUME_AGENT_CORE_TOKEN` | bearer token (future PAT) | unset |
| `RESUME_AGENT_CORE_VERIFY_SSL` | TLS verification | `true` |

## Layout

```text
src/resumate_agent_core/
  config.py    # AgentCoreSettings (env-aware, stdlib-only)
  errors.py    # error envelope -> ApiClientError
  models.py    # pydantic v2 models for contract sections 4 and 5
  patches.py   # set_basics / upsert_section / remove_section / upsert_entry / remove_entry
  client.py    # ResumateClient: the 12 public endpoints
  turn.py      # TurnSession + idempotency-key helper
  tools.py     # TOOLS registry: name -> schema + client callable
  runtime.py   # C-09 loop skeleton (ModelProvider Protocol, budget, cancel, events)
  openai_provider.py   # OpenAI-compatible ModelProvider over httpx
  skills.py    # SKILL.md loader for a skills directory
```

## Tests

```bash
uv run pytest -q
```

All tests run against `httpx.MockTransport`; there is no network access and no
database access.

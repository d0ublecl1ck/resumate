"""Context compaction: summarise old turns instead of hitting the token wall.

A long run accumulates model context until `RunBudget.max_tokens` stops it with
a hard `BUDGET_EXCEEDED`. This module decides *when* that context is too large
and *how much* of it to fold into a summary, so the runtime can keep working.

Estimating without a tokenizer: this package has no vendor tokenizer, so the
estimate is a documented character heuristic —

    tokens(message) = 4 + ceil((len(content) + len(tool-call text)) / chars_per_token)

with `chars_per_token = 3` by default. English is closer to 4 characters per
token and Chinese closer to 1, so 3 sits in between and deliberately
*over*-estimates English prose: compaction fires earlier than strictly needed,
which is the conservative direction for budget safety.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

# Stable marker opening every folded-history message. A later reader (or the
# model) can tell a summary apart from ordinary conversation by this prefix.
SUMMARY_MARKER = "[compacted-history]"
SUMMARY_ROLE = "system"

DEFAULT_CHARS_PER_TOKEN = 3
DEFAULT_KEEP_RECENT_TURNS = 4
DEFAULT_MIN_MESSAGES = 6
DEFAULT_THRESHOLD_RATIO = 0.5
MIN_THRESHOLD_TOKENS = 256
MESSAGE_OVERHEAD_TOKENS = 4


class ContextMessage(Protocol):
    """The slice of the runtime Message that compaction needs."""

    role: str
    content: str


@dataclass(frozen=True, slots=True)
class CompactionPolicy:
    """When to compact, how much recent context to keep, and how to estimate."""

    max_context_tokens: int | None = None
    keep_recent_turns: int = DEFAULT_KEEP_RECENT_TURNS
    min_messages: int = DEFAULT_MIN_MESSAGES
    chars_per_token: int = DEFAULT_CHARS_PER_TOKEN
    threshold_ratio: float = DEFAULT_THRESHOLD_RATIO

    def __post_init__(self) -> None:
        if self.max_context_tokens is not None and self.max_context_tokens <= 0:
            raise ValueError("max_context_tokens must be greater than zero when set")
        if self.keep_recent_turns < 1:
            raise ValueError("keep_recent_turns must be at least 1")
        if self.min_messages < 3:
            raise ValueError("min_messages must be at least 3")
        if self.chars_per_token < 1:
            raise ValueError("chars_per_token must be at least 1")
        if not 0 < self.threshold_ratio <= 1:
            raise ValueError("threshold_ratio must be in (0, 1]")

    def threshold(self, max_tokens: int) -> int:
        """Estimated-token budget that triggers one compaction."""
        if self.max_context_tokens is not None:
            return self.max_context_tokens
        return max(MIN_THRESHOLD_TOKENS, int(max_tokens * self.threshold_ratio))


def estimate_message_tokens(
    message: ContextMessage,
    *,
    chars_per_token: int = DEFAULT_CHARS_PER_TOKEN,
) -> int:
    """Estimated tokens for one message, per-message overhead included."""
    tool_calls = getattr(message, "tool_calls", ()) or ()
    extra = sum(
        len(str(getattr(call, "name", ""))) + len(str(getattr(call, "arguments", "")))
        for call in tool_calls
    )
    return MESSAGE_OVERHEAD_TOKENS + math.ceil((len(message.content or "") + extra) / chars_per_token)


def estimate_context_tokens(
    messages: Sequence[ContextMessage],
    *,
    chars_per_token: int = DEFAULT_CHARS_PER_TOKEN,
) -> int:
    """Estimated tokens for a whole context."""
    return sum(estimate_message_tokens(message, chars_per_token=chars_per_token) for message in messages)


def should_compact(messages: Sequence[ContextMessage], policy: CompactionPolicy, *, max_tokens: int) -> bool:
    """Whether the context is both large enough and above the trigger."""
    if len(messages) < policy.min_messages:
        return False
    return estimate_context_tokens(messages, chars_per_token=policy.chars_per_token) > policy.threshold(max_tokens)


def cut_index(messages: Sequence[ContextMessage], keep_recent_turns: int) -> int:
    """Index where the retained tail starts; messages[1:cut] get summarised.

    Returns len(messages) when there is nothing safe to fold, so the caller skips
    instead of cutting into the only turn.
    """
    seen = 0
    for index in range(len(messages) - 1, 0, -1):
        if messages[index].role == "assistant":
            seen += 1
            if seen >= keep_recent_turns:
                return index
    return len(messages)


def render_transcript(messages: Sequence[ContextMessage]) -> str:
    """Plain-text transcript handed to the summariser."""
    lines: list[str] = []
    for message in messages:
        label = getattr(message, "name", None) or message.role
        lines.append(f"{label}: {message.content}")
    return "\n".join(lines)


def compaction_marker(summary: str) -> str:
    """The content of the message that replaces the folded turns."""
    return f"{SUMMARY_MARKER}\n{summary}"

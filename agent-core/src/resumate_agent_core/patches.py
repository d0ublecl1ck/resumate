"""Builders for the domain patch language (contract section 5).

These helpers keep call sites free of hand-written JSON. Every builder accepts
either a pydantic model or a plain mapping, so callers can pass server-shaped
dictionaries directly. No HTTP happens here; feed the results to
ResumateClient.validate_patch / preview_patch / apply_patch.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from .models import (
    PatchApplyRequest,
    PatchRequest,
    RemoveEntryOp,
    RemoveSectionOp,
    ResumeBasics,
    ResumeEntry,
    ResumeSection,
    SetBasicsOp,
    UpsertEntryOp,
    UpsertSectionOp,
    validate_patch_op,
)

_Op = (
    SetBasicsOp
    | UpsertSectionOp
    | RemoveSectionOp
    | UpsertEntryOp
    | RemoveEntryOp
)


def _coerce(model: type[Any], value: Any) -> Any:
    """Return value as model, validating a mapping when needed."""
    if isinstance(value, model):
        return value
    return model.model_validate(value)


def set_basics(basics: ResumeBasics | Mapping[str, Any]) -> SetBasicsOp:
    """Replace the entire basics block in one operation."""
    return SetBasicsOp(basics=_coerce(ResumeBasics, basics))


def upsert_section(section: ResumeSection | Mapping[str, Any]) -> UpsertSectionOp:
    """Insert or wholly replace a section, keyed by section.id."""
    return UpsertSectionOp(section=_coerce(ResumeSection, section))


def remove_section(section_id: str) -> RemoveSectionOp:
    """Remove a section by id; the server returns SECTION_NOT_FOUND if absent."""
    return RemoveSectionOp(section_id=section_id)


def upsert_entry(
    section_id: str,
    entry: ResumeEntry | Mapping[str, Any],
) -> UpsertEntryOp:
    """Insert or replace an entry within an existing section."""
    return UpsertEntryOp(section_id=section_id, entry=_coerce(ResumeEntry, entry))


def remove_entry(section_id: str, entry_id: str) -> RemoveEntryOp:
    """Remove an entry from a section; missing section/entry is a server error."""
    return RemoveEntryOp(section_id=section_id, entry_id=entry_id)


def normalize_ops(ops: Any) -> list[Any]:
    """Normalize a single op, an iterable of ops, or a PatchRequest into a list."""
    if isinstance(ops, PatchRequest):
        return list(ops.ops)
    if isinstance(ops, _Op):
        return [ops]
    if isinstance(ops, Mapping):
        if "ops" in ops:
            return list(PatchRequest.model_validate(ops).ops)
        return [validate_patch_op(ops)]
    if isinstance(ops, Sequence) and not isinstance(ops, (str, bytes, bytearray)):
        return [validate_patch_op(op) for op in ops]
    return [validate_patch_op(ops)]


def build_patch(
    ops: Sequence[Any] | Any,
    *,
    reason: str = "",
    base_version_id: str | None = None,
) -> PatchRequest:
    """Build a patches:validate / patches:preview request body.

    Passing an existing PatchRequest preserves its reason/base version unless
    this call overrides them.
    """
    if isinstance(ops, PatchRequest):
        update: dict[str, Any] = {}
        if reason:
            update["reason"] = reason
        if base_version_id is not None:
            update["base_version_id"] = base_version_id
        return ops.model_copy(update=update) if update else ops
    return PatchRequest(
        ops=normalize_ops(ops),
        reason=reason,
        base_version_id=base_version_id,
    )


def build_apply_request(
    ops: Sequence[Any] | Any,
    *,
    reason: str | None = None,
    base_version_id: str | None = None,
    pending_action_id: str | None = None,
    idempotency_key: str | None = None,
) -> PatchApplyRequest:
    """Build a patches:apply request body."""
    return PatchApplyRequest(
        ops=normalize_ops(ops),
        reason=reason,
        base_version_id=base_version_id,
        pending_action_id=pending_action_id,
        idempotency_key=idempotency_key,
    )


class PatchBuilder:
    """Mutable accumulator for composing multi-op patches fluently."""

    __slots__ = ("_ops",)

    def __init__(self) -> None:
        self._ops: list[_Op] = []

    def __len__(self) -> int:
        return len(self._ops)

    @property
    def ops(self) -> list[_Op]:
        """A copy of the accumulated operations."""
        return list(self._ops)

    def add(self, op: Any) -> "PatchBuilder":
        """Append a pre-built op or a server-shaped op mapping."""
        self._ops.append(validate_patch_op(op))
        return self

    def set_basics(self, basics: ResumeBasics | Mapping[str, Any]) -> "PatchBuilder":
        """Append a setBasics operation."""
        return self.add(set_basics(basics))

    def upsert_section(self, section: ResumeSection | Mapping[str, Any]) -> "PatchBuilder":
        """Append an upsertSection operation."""
        return self.add(upsert_section(section))

    def remove_section(self, section_id: str) -> "PatchBuilder":
        """Append a removeSection operation."""
        return self.add(remove_section(section_id))

    def upsert_entry(
        self,
        section_id: str,
        entry: ResumeEntry | Mapping[str, Any],
    ) -> "PatchBuilder":
        """Append an upsertEntry operation."""
        return self.add(upsert_entry(section_id, entry))

    def remove_entry(self, section_id: str, entry_id: str) -> "PatchBuilder":
        """Append a removeEntry operation."""
        return self.add(remove_entry(section_id, entry_id))

    def build(
        self,
        *,
        reason: str = "",
        base_version_id: str | None = None,
    ) -> PatchRequest:
        """Freeze the accumulated operations into a PatchRequest."""
        return PatchRequest(
            ops=self.ops,
            reason=reason,
            base_version_id=base_version_id,
        )

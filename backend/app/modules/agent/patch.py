"""Pure domain patch engine over a ResumeDocument dict.

The engine never touches the database or the network: it validates a list of
PatchOp values against a candidate document and applies them atomically. The
document is the camelCase payload persisted on Resume.document / working copy,
so every field access uses the wire keys.
"""

import copy
import json
from collections.abc import Sequence
from typing import Any

from app.shared.errors import ValidationFailed

from .schemas import DiffItem, PatchError, PatchOp

SECTION_NOT_FOUND = "SECTION_NOT_FOUND"
ENTRY_NOT_FOUND = "ENTRY_NOT_FOUND"


def _sections(document: dict) -> list[dict]:
    return list(document.get("sections") or [])


def _find_section(sections: Sequence[dict], section_id: str) -> tuple[int, dict] | tuple[None, None]:
    for index, section in enumerate(sections):
        if section.get("id") == section_id:
            return index, section
    return None, None


def _payload(op: PatchOp) -> dict:
    return op.model_dump(by_alias=True, exclude_none=True)


def _apply_one(document: dict, op: PatchOp) -> str | None:
    """Apply one op in place. Returns an error code, or None on success."""
    data = _payload(op)
    kind = data["op"]
    if kind == "setBasics":
        # 只覆盖请求里显式给出的字段：缺少的字段沿用当前值，避免部分 setBasics 把姓名 /
        # 邮箱 / 手机等静默清空（issue f52ec 实测清空过一次），显式给空串仍然能清空该字段。
        merged = dict(document.get("basics") or {})
        merged.update(op.basics.model_dump(by_alias=True, exclude_unset=True, exclude_none=False))
        document["basics"] = merged
        return None
    sections = document.setdefault("sections", [])
    if kind == "upsertSection":
        section = data["section"]
        index, _ = _find_section(sections, section["id"])
        if index is None:
            sections.append(section)
        else:
            sections[index] = section
        return None
    if kind == "removeSection":
        index, _ = _find_section(sections, data["sectionId"])
        if index is None:
            return SECTION_NOT_FOUND
        sections.pop(index)
        return None
    if kind == "upsertEntry":
        _, section = _find_section(sections, data["sectionId"])
        if section is None:
            return SECTION_NOT_FOUND
        entries = section.setdefault("entries", [])
        entry = data["entry"]
        for index, existing in enumerate(entries):
            if existing.get("id") == entry["id"]:
                entries[index] = entry
                return None
        entries.append(entry)
        return None
    if kind == "removeEntry":
        _, section = _find_section(sections, data["sectionId"])
        if section is None:
            return SECTION_NOT_FOUND
        entries = section.setdefault("entries", [])
        for index, existing in enumerate(entries):
            if existing.get("id") == data["entryId"]:
                entries.pop(index)
                return None
        return ENTRY_NOT_FOUND
    return "OP_UNSUPPORTED"


def _message(code: str, op: PatchOp) -> str:
    data = _payload(op)
    if code == SECTION_NOT_FOUND:
        return f"章节 {data.get('sectionId')} 不存在"
    if code == ENTRY_NOT_FOUND:
        return f"条目 {data.get('entryId')} 不存在"
    return "不支持的 Patch 操作"


def validate(document: dict, ops: Sequence[PatchOp]) -> list[PatchError]:
    """Return every determinable semantic error without mutating the input."""
    candidate = copy.deepcopy(document)
    errors: list[PatchError] = []
    for index, op in enumerate(ops):
        code = _apply_one(candidate, op)
        if code is not None:
            errors.append(PatchError(op_index=index, code=code, message=_message(code, op)))
    return errors


def apply(document: dict, ops: Sequence[PatchOp]) -> dict:
    """Return a new document with every op applied as one atomic group."""
    errors = validate(document, ops)
    if errors:
        raise ValidationFailed("；".join(error.message for error in errors))
    candidate = copy.deepcopy(document)
    for op in ops:
        _apply_one(candidate, op)
    return candidate


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def build_diff(before: dict, after: dict, reason: str) -> list[DiffItem]:
    """Build the human-facing DiffItem list between two documents."""
    items: list[DiffItem] = []

    def add(target: str, change_type: str, before_value: Any, after_value: Any) -> None:
        items.append(
            DiffItem(
                id=f"diff_{len(items) + 1}",
                target=target,
                change_type=change_type,
                before=_text(before_value),
                after=_text(after_value),
                reason=reason,
            )
        )

    if before.get("basics") != after.get("basics"):
        add("基础信息", "modified", before.get("basics"), after.get("basics"))

    before_sections = {section.get("id"): section for section in before.get("sections") or []}
    after_sections = {section.get("id"): section for section in after.get("sections") or []}
    for section_id, section in after_sections.items():
        title = section.get("title") or section_id
        previous = before_sections.get(section_id)
        if previous is None:
            add(title, "added", None, title)
            continue
        if (
            previous.get("title") != section.get("title")
            or previous.get("kind") != section.get("kind")
            or previous.get("text") != section.get("text")
        ):
            add(title, "modified", previous.get("title"), section.get("title"))
        previous_entries = {entry.get("id"): entry for entry in previous.get("entries") or []}
        current_entries = {entry.get("id"): entry for entry in section.get("entries") or []}
        for entry_id, entry in current_entries.items():
            entry_title = entry.get("title") or entry_id
            old = previous_entries.get(entry_id)
            if old is None:
                add(f"{title} · {entry_title}", "added", None, entry_title)
            elif old != entry:
                add(f"{title} · {entry_title}", "modified", old, entry)
        for entry_id, entry in previous_entries.items():
            if entry_id not in current_entries:
                add(f"{title} · {entry.get('title') or entry_id}", "removed", entry.get("title"), None)
    for section_id, section in before_sections.items():
        if section_id not in after_sections:
            add(section.get("title") or section_id, "removed", section.get("title"), None)
    return items

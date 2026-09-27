"""Pure three-way rebase of staged agent edits onto an advanced base.

Contract section 15: when a user manually commits and moves
Resume.current_version_id forward, the delta from old_base to staged is replayed
onto new_base. Both sides changing the same scope (basics, a section header
field, or an entry) is a conflict; the staged document is never discarded.
The module is pure: no database, transport or service imports.
"""

import copy

_SECTION_HEADER_FIELDS = ("title", "kind", "text")


def _index(items: list[dict]) -> dict[str, dict]:
    return {item.get("id"): item for item in items}


def _merge_entries(old_entries: list[dict], agent_entries: list[dict], new_entries: list[dict]) -> tuple[list[dict], bool]:
    old = _index(old_entries)
    agent = _index(agent_entries)
    new = _index(new_entries)
    merged: dict[str, dict] = {}
    conflict = False
    order = list(new) + [entry_id for entry_id in agent if entry_id not in new]
    for entry_id in order:
        old_entry = old.get(entry_id)
        agent_entry = agent.get(entry_id)
        new_entry = new.get(entry_id)
        agent_changed = agent_entry != old_entry
        new_changed = new_entry != old_entry
        if not agent_changed:
            value = new_entry
        elif entry_id not in old:
            # Agent added the entry; the new base already took the same id.
            if entry_id in new:
                conflict = True
                continue
            value = agent_entry
        elif agent_entry is None:
            # Agent removed the entry: delete wins (contract section 15).
            value = None
        elif new_changed and agent_entry != new_entry:
            conflict = True
            continue
        else:
            value = agent_entry
        if value is not None:
            merged[entry_id] = value
    return list(merged.values()), conflict


def _merge_section(old_section: dict, agent_section: dict, new_section: dict) -> tuple[dict | None, bool]:
    merged = copy.deepcopy(agent_section)
    conflict = False
    for field in _SECTION_HEADER_FIELDS:
        old_value = old_section.get(field)
        agent_value = agent_section.get(field)
        new_value = new_section.get(field)
        agent_changed = agent_value != old_value
        new_changed = new_value != old_value
        if agent_changed and new_changed and agent_value != new_value:
            conflict = True
        elif new_changed and not agent_changed:
            merged[field] = new_value
    entries, entry_conflict = _merge_entries(
        old_section.get("entries") or [],
        agent_section.get("entries") or [],
        new_section.get("entries") or [],
    )
    if conflict or entry_conflict:
        return None, True
    merged["entries"] = entries
    return merged, False


def merge_documents(old_base: dict, staged: dict, new_base: dict) -> tuple[dict | None, bool]:
    """Replay the agent delta onto the advanced base.

    Returns (merged_document, False) on success or (None, True) when the same
    scope changed on both sides. The merged document is always a fresh object.
    """
    result: dict = {}
    conflict = False

    old_basics = old_base.get("basics")
    agent_basics = staged.get("basics")
    new_basics = new_base.get("basics")
    agent_changed = agent_basics != old_basics
    new_changed = new_basics != old_basics
    if agent_changed and new_changed and agent_basics != new_basics:
        conflict = True
    elif agent_changed:
        result["basics"] = copy.deepcopy(agent_basics)
    else:
        result["basics"] = copy.deepcopy(new_basics)

    old_sections = _index(old_base.get("sections") or [])
    agent_sections = _index(staged.get("sections") or [])
    new_sections = _index(new_base.get("sections") or [])
    merged_sections: dict[str, dict] = {}
    order = list(agent_sections) + [section_id for section_id in new_sections if section_id not in agent_sections]
    for section_id in order:
        old_section = old_sections.get(section_id)
        agent_section = agent_sections.get(section_id)
        new_section = new_sections.get(section_id)
        agent_changed = agent_section != old_section
        new_changed = new_section != old_section
        if not agent_changed:
            value = new_section
        elif section_id not in old_sections:
            # Agent added the section; the new base already took the same id.
            if section_id in new_sections:
                conflict = True
                continue
            value = agent_section
        elif agent_section is None:
            # Agent removed the section: delete wins (contract section 15).
            value = None
        elif new_section is None:
            # The new base removed a section the agent modified.
            conflict = True
            continue
        elif not new_changed:
            value = agent_section
        else:
            merged_section, section_conflict = _merge_section(old_section, agent_section, new_section)
            if section_conflict:
                conflict = True
                continue
            value = merged_section
        if value is not None:
            merged_sections[section_id] = value

    result["sections"] = list(merged_sections.values())
    if conflict:
        return None, True
    return result, False

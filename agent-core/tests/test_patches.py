"""Contract section 5: domain patch builders and the discriminated union."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from resumate_agent_core import (
    PatchRequest,
    ResumeBasics,
    ResumeEntry,
    ResumeSection,
    patches,
)
from resumate_agent_core.models import (
    RemoveEntryOp,
    RemoveSectionOp,
    SetBasicsOp,
    UpsertEntryOp,
    UpsertSectionOp,
)

SECTION = {"id": "exp", "kind": "experience", "title": "经历"}
ENTRY = {"id": "e1", "title": "Engineer", "bullets": ["shipped"]}


def test_set_basics_wire_shape():
    op = patches.set_basics({"fullName": "Ada", "links": [{"label": "site", "url": "https://x"}]})
    assert isinstance(op, SetBasicsOp)
    wire = op.to_wire()
    assert wire["op"] == "setBasics"
    # setBasics carries a complete ResumeBasics, so untouched fields stay present.
    assert wire["basics"]["fullName"] == "Ada"
    assert wire["basics"]["email"] == ""
    assert wire["basics"]["links"] == [{"label": "site", "url": "https://x"}]
    assert op.basics.full_name == "Ada"


def test_upsert_section_wire_shape():
    op = patches.upsert_section(SECTION)
    assert isinstance(op, UpsertSectionOp)
    assert op.to_wire()["op"] == "upsertSection"
    assert op.to_wire()["section"]["id"] == "exp"


def test_remove_section_wire_shape():
    op = patches.remove_section("exp")
    assert isinstance(op, RemoveSectionOp)
    assert op.to_wire() == {"op": "removeSection", "sectionId": "exp"}


def test_upsert_entry_wire_shape():
    op = patches.upsert_entry("exp", ENTRY)
    assert isinstance(op, UpsertEntryOp)
    wire = op.to_wire()
    assert wire["op"] == "upsertEntry"
    assert wire["sectionId"] == "exp"
    assert wire["entry"]["id"] == "e1"


def test_remove_entry_wire_shape():
    op = patches.remove_entry("exp", "e1")
    assert isinstance(op, RemoveEntryOp)
    assert op.to_wire() == {"op": "removeEntry", "sectionId": "exp", "entryId": "e1"}


def test_patch_request_validates_all_five_ops():
    request = PatchRequest.model_validate(
        {
            "ops": [
                {"op": "setBasics", "basics": {"fullName": "Ada"}},
                {"op": "upsertSection", "section": SECTION},
                {"op": "upsertEntry", "sectionId": "exp", "entry": ENTRY},
                {"op": "removeEntry", "sectionId": "exp", "entryId": "e1"},
                {"op": "removeSection", "sectionId": "exp"},
            ],
            "reason": "batch",
            "baseVersionId": "ver_0",
        }
    )
    kinds = [type(op).__name__ for op in request.ops]
    assert kinds == [
        "SetBasicsOp",
        "UpsertSectionOp",
        "UpsertEntryOp",
        "RemoveEntryOp",
        "RemoveSectionOp",
    ]
    assert request.reason == "batch"
    assert request.base_version_id == "ver_0"


def test_patch_request_requires_at_least_one_op():
    with pytest.raises(ValidationError):
        PatchRequest.model_validate({"ops": []})


def test_patch_request_rejects_unknown_op():
    with pytest.raises(ValidationError):
        PatchRequest.model_validate({"ops": [{"op": "replaceEverything"}]})


def test_build_patch_accepts_single_op_mapping_and_request():
    single = patches.build_patch({"op": "removeSection", "sectionId": "s1"})
    assert isinstance(single.ops[0], RemoveSectionOp)

    request = PatchRequest.from_ops([patches.remove_section("s2")], reason="r")
    rebuilt = patches.build_patch(request)
    assert rebuilt.reason == "r"
    assert rebuilt.ops[0].section_id == "s2"


def test_build_patch_applies_reason_and_base_version():
    request = patches.build_patch([patches.remove_section("s1")], reason="why", base_version_id="ver_3")
    assert request.to_wire() == {
        "ops": [{"op": "removeSection", "sectionId": "s1"}],
        "reason": "why",
        "baseVersionId": "ver_3",
    }


def test_patch_builder_accumulates_operations():
    builder = (
        patches.PatchBuilder()
        .set_basics(ResumeBasics(full_name="Ada"))
        .upsert_section(ResumeSection(id="exp", kind="experience", title="经历"))
        .upsert_entry("exp", ResumeEntry(id="e1", title="Engineer"))
        .remove_entry("exp", "e1")
        .remove_section("exp")
    )
    assert len(builder) == 5
    request = builder.build(reason="compose")
    assert [op.op for op in request.ops] == [
        "setBasics",
        "upsertSection",
        "upsertEntry",
        "removeEntry",
        "removeSection",
    ]


def test_builders_accept_model_instances():
    section = ResumeSection(id="sk", kind="skills", title="技能", text="python")
    assert patches.upsert_section(section).section is section

def test_patch_request_keeps_a_partial_set_basics_partial_on_the_wire():
    body = patches.build_patch(
        [{"op": "setBasics", "basics": {"headline": "资深后端工程师"}}],
        reason="只改头衔",
    )

    assert body.to_wire()["ops"][0]["basics"] == {"headline": "资深后端工程师"}


def test_patch_request_still_sends_every_explicit_basics_field():
    body = patches.build_patch(
        [
            {
                "op": "setBasics",
                "basics": {"fullName": "黄鹏星", "headline": "h", "email": "", "phone": "", "location": "", "links": []},
            }
        ],
        reason="整块替换",
    )

    assert body.to_wire()["ops"][0]["basics"] == {
        "fullName": "黄鹏星",
        "headline": "h",
        "email": "",
        "phone": "",
        "location": "",
        "links": [],
    }


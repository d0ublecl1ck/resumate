"""Patch engine unit tests.

Regression guard for issue f52ec: a partial `setBasics` used to replace the whole
basics block, so every field the caller omitted was silently reset to its empty
default. A real approval run wiped the stored fullName / email / phone this way.
"""

from app.modules.agent.patch import apply
from app.modules.agent.schemas import PatchRequest

BASICS = {
    "fullName": "黄鹏星",
    "headline": "",
    "email": "zhangmu@example.com",
    "phone": "13800000000",
    "location": "上海",
    "links": [{"label": "GitHub", "url": "https://github.com/d0ublecl1ck"}],
}


def _document() -> dict:
    return {"basics": dict(BASICS), "sections": []}


def _request(ops: list[dict]) -> PatchRequest:
    return PatchRequest.model_validate({"ops": ops, "reason": "test"})


def test_partial_set_basics_keeps_the_fields_it_did_not_mention():
    result = apply(_document(), _request([{"op": "setBasics", "basics": {"headline": "资深后端工程师"}}]).ops)

    assert result["basics"] == {**BASICS, "headline": "资深后端工程师"}


def test_explicit_empty_value_still_clears_that_field():
    result = apply(_document(), _request([{"op": "setBasics", "basics": {"headline": "x", "location": ""}}]).ops)

    assert result["basics"]["location"] == ""
    assert result["basics"]["email"] == BASICS["email"]


def test_full_set_basics_replaces_every_field():
    replacement = {"fullName": "新人", "headline": "h", "email": "", "phone": "", "location": "", "links": []}

    result = apply(_document(), _request([{"op": "setBasics", "basics": replacement}]).ops)

    assert result["basics"] == replacement

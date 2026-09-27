"""SKILL.md discovery and front matter parsing."""

from __future__ import annotations

from pathlib import Path

import pytest

from resumate_agent_core.skills import (
    SKILLS_DIR_ENV,
    SkillLoader,
    SkillNotFoundError,
    default_skills_dir,
    parse_frontmatter,
)

FRONTMATTER = """---
name: resumate-api-operations
description: "Operate Resumate through the public API"
allowed-tools: [read, write]
enabled: true
---

# Resumate API operations

Body text.
"""


def write_skill(root: Path, name: str, text: str) -> Path:
    directory = root / name
    directory.mkdir(parents=True)
    path = directory / "SKILL.md"
    path.write_text(text, encoding="utf-8")
    return path


def test_parse_frontmatter_scalars_lists_and_booleans():
    frontmatter, body, raw = parse_frontmatter(FRONTMATTER)
    assert frontmatter["name"] == "resumate-api-operations"
    assert frontmatter["description"] == "Operate Resumate through the public API"
    assert frontmatter["allowed-tools"] == ["read", "write"]
    assert frontmatter["enabled"] is True
    assert body.strip().startswith("# Resumate API operations")
    assert "name:" in raw


def test_parse_without_frontmatter_returns_whole_body():
    frontmatter, body, raw = parse_frontmatter("# Plain skill\n\nNo metadata.\n")
    assert frontmatter == {}
    assert raw == ""
    assert body.startswith("# Plain skill")


def test_loader_discovers_loads_and_catalogs(tmp_path):
    write_skill(tmp_path, "alpha", FRONTMATTER)
    write_skill(tmp_path, "beta", "---\nname: beta\ndescription: second\n---\n# Beta\n")

    loader = SkillLoader(tmp_path)
    names = loader.names()
    assert names == ["resumate-api-operations", "beta"]
    assert len(loader) == 2
    assert "beta" in loader

    skill = loader.load("beta")
    assert skill.description == "second"
    assert skill.to_prompt() == "# Beta"
    assert loader.load("resumate-api-operations").description.startswith("Operate")

    catalog = loader.catalog()
    assert {entry["name"] for entry in catalog} == {"resumate-api-operations", "beta"}
    assert all(entry["path"].endswith("SKILL.md") for entry in catalog)


def test_loader_handles_missing_directory(tmp_path):
    loader = SkillLoader(tmp_path / "nope")
    assert loader.discover() == []
    assert loader.names() == []
    with pytest.raises(SkillNotFoundError):
        loader.load("anything")


def test_default_skills_dir_honors_env(monkeypatch, tmp_path):
    monkeypatch.setenv(SKILLS_DIR_ENV, str(tmp_path))
    assert default_skills_dir() == tmp_path

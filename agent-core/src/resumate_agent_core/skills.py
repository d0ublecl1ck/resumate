"""Loader for agent skills stored as SKILL.md files.

A skill is a directory containing a SKILL.md with optional YAML-style
front matter and a Markdown body. The loader is intentionally dependency-light:
it parses the simple scalar/inline-list front matter used by skills without
pulling in a YAML library. The skills directory itself is owned by another
workstream; this module only points at it.
"""

from __future__ import annotations

import os
import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SKILL_FILENAME = "SKILL.md"
SKILLS_DIR_ENV = "RESUME_AGENT_CORE_SKILLS_DIR"

_FRONTMATTER_RE = re.compile(r"^---\r?\n([\s\S]*?)\r?\n---(?:[ \t]*\r?\n([\s\S]*))?$")


class SkillNotFoundError(FileNotFoundError):
    """Raised when a requested skill has no SKILL.md."""

    def __init__(self, name: str, directory: Path) -> None:
        super().__init__(f"skill {name!r} was not found under {directory}")
        self.name = name
        self.directory = directory


def default_skills_dir() -> Path:
    """Return the default skills directory for this package.

    Honors RESUME_AGENT_CORE_SKILLS_DIR, otherwise resolves to agent-core/skills
    next to the src layout. The directory may not exist yet; the separate Skill
    workstream owns its contents.
    """
    configured = os.environ.get(SKILLS_DIR_ENV)
    if configured:
        return Path(configured).expanduser()
    package_dir = Path(__file__).resolve().parent
    return package_dir.parents[1] / "skills"


def _parse_scalar(raw: str) -> Any:
    value = raw.strip()
    if value == "" or value in {"~", "null", "Null", "NULL"}:
        return None
    lowered = value.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [_parse_scalar(part) for part in inner.split(",")]
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _dedent_block(lines: list[str], *, folded: bool) -> str:
    if not lines:
        return ""
    indents = [len(line) - len(line.lstrip(" ")) for line in lines if line.strip()]
    indent = min(indents) if indents else 0
    stripped = [line[indent:] if len(line) >= indent else "" for line in lines]
    if folded:
        return " ".join(part.strip() for part in stripped if part.strip())
    return "\n".join(stripped).strip("\n")


def _parse_simple_yaml(raw: str) -> dict[str, Any]:
    """Parse the scalar / inline-list front matter used by skills.

    Nested mappings are not supported and are skipped rather than guessed.
    """
    result: dict[str, Any] = {}
    lines = raw.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        index += 1
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line[0].isspace() or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if value in {"|", ">"}:
            block: list[str] = []
            while index < len(lines) and (not lines[index].strip() or lines[index][0].isspace()):
                block.append(lines[index])
                index += 1
            result[key] = _dedent_block(block, folded=value == ">")
        else:
            result[key] = _parse_scalar(value)
    return result


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str, str]:
    """Split SKILL.md text into (frontmatter, body, raw frontmatter).

    Text without a front matter block is returned as an empty mapping plus the
    full body, so a plain Markdown skill still loads.
    """
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return {}, text, ""
    raw = match.group(1)
    body = match.group(2) or ""
    return _parse_simple_yaml(raw), body, raw


@dataclass(frozen=True, slots=True)
class Skill:
    """A loaded SKILL.md with parsed metadata."""

    name: str
    path: Path
    body: str
    frontmatter: dict[str, Any] = field(default_factory=dict)
    frontmatter_raw: str = ""

    @property
    def description(self) -> str:
        """The skill description when present, else an empty string."""
        value = self.frontmatter.get("description")
        return value if isinstance(value, str) else ""

    def to_prompt(self, *, include_frontmatter: bool = False) -> str:
        """Render the skill for injection into a model context."""
        if include_frontmatter and self.frontmatter_raw:
            return f"---\n{self.frontmatter_raw}\n---\n{self.body}".strip()
        return self.body.strip()

    def as_dict(self) -> dict[str, Any]:
        """A compact catalog entry (path is stringified)."""
        return {
            "name": self.name,
            "description": self.description,
            "path": str(self.path),
            "metadata": dict(self.frontmatter),
        }


class SkillLoader:
    """Discover and read SKILL.md files from a skills directory."""

    def __init__(self, directory: Path | str | None = None) -> None:
        self.directory = Path(directory).expanduser() if directory is not None else default_skills_dir()

    @classmethod
    def from_env(cls) -> "SkillLoader":
        """Build a loader using the default (env-aware) skills directory."""
        return cls(default_skills_dir())

    def _skill_files(self) -> list[Path]:
        if not self.directory.is_dir():
            return []
        found: list[Path] = []
        direct = self.directory / SKILL_FILENAME
        if direct.is_file():
            found.append(direct)
        for child in sorted(self.directory.iterdir()):
            if child.is_dir() and (child / SKILL_FILENAME).is_file():
                found.append(child / SKILL_FILENAME)
        return found

    @staticmethod
    def _load_file(name: str, path: Path) -> Skill:
        text = path.read_text(encoding="utf-8")
        frontmatter, body, raw = parse_frontmatter(text)
        declared = frontmatter.get("name")
        final_name = declared if isinstance(declared, str) and declared.strip() else name
        return Skill(
            name=final_name,
            path=path,
            body=body,
            frontmatter=frontmatter,
            frontmatter_raw=raw,
        )

    def discover(self) -> list[Skill]:
        """Load every SKILL.md found, ordered by directory name."""
        skills: list[Skill] = []
        for path in self._skill_files():
            name = path.parent.name if path.parent != self.directory else self.directory.name
            skills.append(self._load_file(name, path))
        return skills

    def names(self) -> list[str]:
        """Names of the discoverable skills."""
        return [skill.name for skill in self.discover()]

    def load(self, name: str) -> Skill:
        """Load one skill by directory name or declared front matter name."""
        direct = self.directory / name / SKILL_FILENAME
        if direct.is_file():
            return self._load_file(name, direct)
        root = self.directory / SKILL_FILENAME
        if root.is_file():
            skill = self._load_file(self.directory.name, root)
            if skill.name == name:
                return skill
        for skill in self.discover():
            if skill.name == name:
                return skill
        raise SkillNotFoundError(name, self.directory)

    def catalog(self) -> list[dict[str, Any]]:
        """Compact metadata for every skill, suitable for a system prompt."""
        return [skill.as_dict() for skill in self.discover()]

    def __iter__(self) -> Iterator[Skill]:
        return iter(self.discover())

    def __len__(self) -> int:
        return len(self._skill_files())

    def __contains__(self, name: object) -> bool:
        return isinstance(name, str) and any(skill.name == name for skill in self.discover())

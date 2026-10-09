"""kb 种子语料与导入脚本：目录结构、文档规格、幂等导入。

语料规格来自任务约束：corpus/<role>/<topic>.md，每篇 800-1500 字、用 # 分 2-4 个小节，
role 目录只允许 java-backend / web-frontend。导入必须按 (title, role) 幂等。
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from scripts.seed_kb_corpus import (
    DEFAULT_CORPUS_DIR,
    ROLE_BY_DIR,
    CorpusError,
    extract_title,
    iter_corpus,
    seed,
)

ROLE_VALUES = set(ROLE_BY_DIR.values())
_HEADING_RE = re.compile(r"^#{1,6}\s+.+$", re.MULTILINE)


def test_corpus_contains_docs_for_both_roles() -> None:
    items = iter_corpus(DEFAULT_CORPUS_DIR)

    assert len(items) >= 20
    assert {item["role"] for item in items} == ROLE_VALUES
    # 每个岗位至少 8 篇，保证题库主题有真实语料可检索。
    for role in ROLE_VALUES:
        assert sum(1 for item in items if item["role"] == role) >= 8


@pytest.mark.parametrize("item", iter_corpus(DEFAULT_CORPUS_DIR))
def test_corpus_doc_spec(item: dict) -> None:
    body = item["body"]
    headings = _HEADING_RE.findall(body)

    lines = body.splitlines()
    title_index = next(index for index, line in enumerate(lines) if line.startswith("# "))
    first_content_line = next(line for line in lines[title_index + 1 :] if line.strip())

    assert item["title"].strip()
    assert len(body) >= 800, f"{item['path'].name} 正文不足 800 字"
    assert len(body) <= 1500, f"{item['path'].name} 正文超过 1500 字"
    # 第一个 # 是文档标题，其余是 2-4 个小节。
    assert 2 <= len(headings) - 1 <= 4, f"{item['path'].name} 小节数不在 2-4"
    assert "种子知识语料" in body, f"{item['path'].name} 缺少种子语料声明"
    # 标题与首个小节之间不能有独立段落，否则声明会落成 heading=标题 的单独切片，
    # 检索出处退化为「标题 · 标题」且正文只是声明。
    assert first_content_line.startswith("## "), f"{item['path'].name} 标题后应紧跟二级小节"


def test_extract_title_prefers_first_h1_and_falls_back_to_stem() -> None:
    assert extract_title("# 标题甲\n\n正文", fallback="x") == "标题甲"
    assert extract_title("没有标题\n\n正文", fallback="fallback") == "fallback"
    assert extract_title("#   留白标题  \n正文", fallback="x") == "留白标题"


def test_iter_corpus_rejects_unknown_role_dir(tmp_path: Path) -> None:
    (tmp_path / "unknown-role").mkdir()
    (tmp_path / "unknown-role" / "a.md").write_text("# 标题\n\n正文", encoding="utf-8")

    with pytest.raises(CorpusError, match="未知的岗位目录"):
        iter_corpus(tmp_path)


def test_iter_corpus_rejects_empty_file(tmp_path: Path) -> None:
    role_dir = tmp_path / "java-backend"
    role_dir.mkdir()
    (role_dir / "empty.md").write_text("   \n\n", encoding="utf-8")

    with pytest.raises(CorpusError, match="空语料文件"):
        iter_corpus(tmp_path)


def test_iter_corpus_rejects_duplicate_title_in_same_role(tmp_path: Path) -> None:
    role_dir = tmp_path / "java-backend"
    role_dir.mkdir()
    (role_dir / "a.md").write_text("# 同名\n\n## 小节\n\n正文甲。", encoding="utf-8")
    (role_dir / "b.md").write_text("# 同名\n\n## 小节\n\n正文乙。", encoding="utf-8")

    with pytest.raises(CorpusError, match="重复的"):
        iter_corpus(tmp_path)


def test_seed_is_idempotent_by_title_and_role(db_session: Session) -> None:
    first = seed(db_session, DEFAULT_CORPUS_DIR, dry_run=False)
    second = seed(db_session, DEFAULT_CORPUS_DIR, dry_run=True)

    assert first["imported"] == first["parsed"]
    assert first["updated"] == 0
    assert first["documents_total"] == first["parsed"]
    # 第二次同一目录：全部按 (title, role) 命中且正文未变，不重复导入。
    assert second["planned_imports"] == []
    assert second["planned_updates"] == []
    assert second["skipped"] == second["parsed"]


def test_seed_replaces_changed_body_without_duplicates(db_session: Session, tmp_path: Path) -> None:
    role_dir = tmp_path / "java-backend"
    role_dir.mkdir()
    doc = role_dir / "topic.md"
    doc.write_text("# 缓存笔记\n\n## 小节\n\n第一版正文内容。", encoding="utf-8")
    first = seed(db_session, tmp_path, dry_run=False)

    doc.write_text("# 缓存笔记\n\n## 小节\n\n第二版正文内容。", encoding="utf-8")
    second = seed(db_session, tmp_path, dry_run=False)

    assert first["imported"] == 1
    assert second["imported"] == 0
    assert second["updated"] == 1
    # 同一 (title, role) 只保留一份文档。
    assert second["documents_total"] == 1

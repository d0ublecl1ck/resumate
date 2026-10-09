"""题库引用回填脚本：按「题干 + role」检索知识库，命中才写 knowledge_refs。

默认只填空题（knowledge_refs 为空），已带引用的题跳过；--force 重算全部。没有
命中的题保持为空，绝不伪造引用。可重复执行，每次输出真实统计。

用法（在 backend 目录下执行）：
    .venv/bin/python -m scripts.backfill_knowledge_refs
    .venv/bin/python -m scripts.backfill_knowledge_refs --force
    .venv/bin/python -m scripts.backfill_knowledge_refs --role "Java 后端" --limit 3

先决条件：知识库已有文档（POST /kb/documents 或脚本导入）。知识库为空时脚本会
提示，但仍会正常跑完并把所有题记为 no_match。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.modules.bank.models import BankQuestion  # noqa: E402
from app.modules.kb.backfill import backfill_knowledge_refs  # noqa: E402
from app.modules.kb.models import KbDocument  # noqa: E402


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="按题干检索知识库并回填题库引用")
    parser.add_argument("--force", action="store_true", help="重算并覆盖已有引用（默认跳过）")
    parser.add_argument("--role", default=None, help="只回填指定岗位，省略则全部")
    parser.add_argument("--limit", type=int, default=3, help="每题最多写入的引用条数")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    with SessionLocal() as db:
        documents = db.scalar(select(KbDocument).limit(1))
        stats = backfill_knowledge_refs(db, force=args.force, ref_limit=args.limit, role=args.role)
        refs_rows = list(db.scalars(select(BankQuestion.knowledge_refs)))
    with_refs = sum(1 for refs in refs_rows if refs)
    without_refs = len(refs_rows) - with_refs
    if documents is None:
        print("知识库为空：先导入文档再回填，本次全部记为 no_match。", file=sys.stderr)
    print(
        json.dumps(
            {
                "backfill": stats,
                "questions_total": len(refs_rows),
                "questions_with_refs": with_refs,
                "questions_without_refs": without_refs,
                "force": args.force,
                "role": args.role,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

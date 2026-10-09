"""知识库种子语料导入：扫描 corpus/<role-slug>/<topic>.md 并调用 kb 服务导入。

幂等：按 (title, role) 去重，重跑不会产生重复文档。--dry-run 只打印导入计划。
--coverage 在只读事务内模拟题库引用回填（等价于 backfill 的 --force 语义：命中
则写真实切片出处，未命中则为空），按 role/kind 分组输出真实覆盖率以及每题
top_score 的分布与最弱命中样本，最后 rollback，不写任何数据，用于决定是否执行
落库回填。

用法（在 backend 目录下执行）：
    .venv/bin/python -m scripts.seed_kb_corpus --dry-run
    .venv/bin/python -m scripts.seed_kb_corpus
    .venv/bin/python -m scripts.seed_kb_corpus --coverage
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import delete, func, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.modules.bank.models import BankQuestion  # noqa: E402
from app.modules.kb import service as kb_service  # noqa: E402
from app.modules.kb.models import KbChunk, KbDocument  # noqa: E402
from app.modules.kb.schemas import KbDocumentCreate  # noqa: E402

# corpus 目录名 -> 题库/知识库实际使用的岗位值。
ROLE_BY_DIR: dict[str, str] = {
    "java-backend": "Java 后端",
    "web-frontend": "Web 前端",
}
DEFAULT_CORPUS_DIR = BACKEND_DIR / "app" / "modules" / "kb" / "corpus"
DEFAULT_REF_LIMIT = 3


class CorpusError(Exception):
    """corpus 目录结构或文件内容不合法。"""


def extract_title(body: str, *, fallback: str) -> str:
    """取正文第一个一级标题作为文档标题；没有一级标题则退回文件名。"""
    for line in body.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        stripped = line.strip()
        if stripped.startswith("# "):
            title = stripped[2:].strip()
            if title:
                return title
    return fallback


def iter_corpus(corpus_dir: Path) -> list[dict]:
    """扫描 corpus 目录，返回按 (role, path) 稳定排序的待导入条目。"""
    if not corpus_dir.is_dir():
        raise CorpusError(f"corpus 目录不存在：{corpus_dir}")

    items: list[dict] = []
    for role_dir in sorted(corpus_dir.iterdir()):
        if not role_dir.is_dir():
            continue
        role = ROLE_BY_DIR.get(role_dir.name)
        if role is None:
            raise CorpusError(f"未知的岗位目录：{role_dir.name}（只支持 {sorted(ROLE_BY_DIR)}）")
        for path in sorted(role_dir.glob("*.md")):
            body = path.read_text(encoding="utf-8")
            if not body.strip():
                raise CorpusError(f"空语料文件：{path}")
            items.append(
                {
                    "role": role,
                    "path": path,
                    "title": extract_title(body, fallback=path.stem),
                    "body": body,
                }
            )
    if not items:
        raise CorpusError(f"corpus 目录下没有 *.md：{corpus_dir}")
    keys = [(item["title"], item["role"]) for item in items]
    if len(set(keys)) != len(keys):
        raise CorpusError("corpus 中存在重复的 (title, role)，会导致重复导入")
    return items


def _existing_documents(db: Session) -> dict[tuple[str, str], KbDocument]:
    rows = db.scalars(select(KbDocument)).all()
    return {(row.title, row.role): row for row in rows}


def _import_item(db: Session, item: dict) -> None:
    kb_service.import_document(
        db,
        KbDocumentCreate(
            title=item["title"],
            role=item["role"],
            source_type="markdown",
            body=item["body"],
        ),
    )


def seed(db: Session, corpus_dir: Path, *, dry_run: bool) -> dict:
    """导入或更新语料；按 (title, role) 去重，正文变化时替换切片。

    幂等：同一批文件重跑时正文未变，全部计 skipped，不产生重复文档；正文变了则
    删掉旧文档与切片后按新正文重导，计数落在 updated。
    """
    items = iter_corpus(corpus_dir)
    existing = _existing_documents(db)

    imported: list[str] = []
    updated: list[str] = []
    skipped: list[str] = []
    for item in items:
        key = (item["title"], item["role"])
        current = existing.get(key)
        label = f"{item['role']} / {item['title']}"
        if current is not None and current.body == item["body"]:
            skipped.append(label)
            continue
        if dry_run:
            (updated if current is not None else imported).append(label)
            continue
        if current is not None:
            # 同一 (title, role) 的正文已变：删旧切片与文档后重导，避免残留旧切片。
            db.execute(delete(KbChunk).where(KbChunk.document_id == current.id))
            db.delete(current)
            db.commit()
            updated.append(label)
        else:
            imported.append(label)
        _import_item(db, item)

    document_count = int(db.scalar(select(func.count()).select_from(KbDocument)) or 0)
    chunk_count = int(db.scalar(select(func.count()).select_from(KbChunk)) or 0)
    return {
        "dry_run": dry_run,
        "corpus_dir": str(corpus_dir),
        "parsed": len(items),
        "imported": 0 if dry_run else len(imported),
        "updated": 0 if dry_run else len(updated),
        "skipped": len(skipped),
        "planned_imports": imported if dry_run else [],
        "planned_updates": updated if dry_run else [],
        "skipped_titles": skipped,
        "documents_total": document_count,
        "chunks_total": chunk_count,
    }


def _percentile(values: list[float], ratio: float) -> float:
    """取升序样本的最近秩分位数；样本为空时返回 0。"""
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * ratio))]


def simulate_backfill(db: Session, *, ref_limit: int = DEFAULT_REF_LIMIT) -> dict:
    """只读模拟 --force 回填：对每题按 role + 题干检索，命中才算有真实依据。

    与 app.modules.kb.backfill 的口径一致（命中则引用 hit.source），但只统计不写库。
    额外输出 top_score 分布与最弱命中样本，用于判断命中是「擦边重合」还是高置信匹配。
    """
    questions = list(db.scalars(select(BankQuestion).order_by(BankQuestion.id)))
    groups: dict[tuple[str, str], dict[str, int]] = defaultdict(
        lambda: {"total": 0, "filled": 0, "no_match": 0}
    )
    filled = 0
    no_match = 0
    scored: list[tuple[float, str, str, str]] = []
    for question in questions:
        result = kb_service.search(db, query=question.prompt, role=question.role, limit=ref_limit)
        refs = [hit.source for hit in result.results] if result.status == "matched" else []
        group = groups[(question.role, question.kind)]
        group["total"] += 1
        if not refs:
            no_match += 1
            group["no_match"] += 1
            continue
        filled += 1
        group["filled"] += 1
        top = result.results[0]
        scored.append((top.score, question.role, question.prompt, top.source))
    by_group = [
        {
            "role": role,
            "kind": kind,
            "total": stats["total"],
            "filled": stats["filled"],
            "no_match": stats["no_match"],
        }
        for (role, kind), stats in sorted(groups.items())
    ]

    scores = [item[0] for item in scored]
    buckets = {"<2": 0, "2-5": 0, "5-10": 0, "10-20": 0, ">=20": 0}
    for score in scores:
        if score < 2:
            buckets["<2"] += 1
        elif score < 5:
            buckets["2-5"] += 1
        elif score < 10:
            buckets["5-10"] += 1
        elif score < 20:
            buckets["10-20"] += 1
        else:
            buckets[">=20"] += 1
    weakest = sorted(scored, key=lambda item: item[0])[:10]
    return {
        "force_semantics": True,
        "ref_limit": ref_limit,
        "total": len(questions),
        "filled": filled,
        "no_match": no_match,
        "by_role_kind": by_group,
        "top_score": {
            "count": len(scores),
            "min": round(min(scores), 4) if scores else 0.0,
            "p25": round(_percentile(scores, 0.25), 4),
            "p50": round(_percentile(scores, 0.5), 4),
            "p75": round(_percentile(scores, 0.75), 4),
            "p90": round(_percentile(scores, 0.90), 4),
            "max": round(max(scores), 4) if scores else 0.0,
            "buckets": buckets,
        },
        "weakest_matches": [
            {"score": round(score, 4), "role": role, "top_ref": ref, "prompt": prompt}
            for score, role, prompt, ref in weakest
        ],
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导入 kb corpus 种子语料并可选试算回填覆盖率")
    parser.add_argument("--dry-run", action="store_true", help="只打印导入计划，不写库")
    parser.add_argument("--coverage", action="store_true", help="只读试算题库引用回填覆盖率（事务内 rollback）")
    parser.add_argument("--corpus-dir", default=str(DEFAULT_CORPUS_DIR), help="语料根目录")
    parser.add_argument("--limit", type=int, default=DEFAULT_REF_LIMIT, help="每题最多引用的切片条数")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    corpus_dir = Path(args.corpus_dir)
    summary: dict = {"import": None, "coverage": None}
    with SessionLocal() as db:
        summary["import"] = seed(db, corpus_dir, dry_run=args.dry_run)
        if args.coverage:
            # 只读试算：即便未来改为写库，事务结束前显式 rollback，绝不落库。
            summary["coverage"] = simulate_backfill(db, ref_limit=args.limit)
            db.rollback()
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

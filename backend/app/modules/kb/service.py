"""知识库服务：服务端切片 + 确定性 BM25 检索（离线、可测、无外部依赖）。

切片：Markdown 按标题分节、纯文本整篇一节；每节按空行分段，段落累积到
MAX_CHUNK_CHARS 为止，超长段落按句末标点切、单句再超长则按定长硬切。

检索：检索文本是「文档标题 + 小节标题 + 正文」，中文按字符 bigram、英文按小写词，
BM25（k1=1.2, b=0.75）打分；再对文档标题、小节标题两个字段单独做一次 BM25 并加权
（权重见 TITLE_FIELD_WEIGHT / HEADING_FIELD_WEIGHT，总和封顶 LABEL_BONUS_CAP），
让命中标题的切片在正文证据之外获得主题加成。只返回 score > 0 且查询词覆盖率达标的
切片，按 (分数降序, chunk id 升序) 排序保证可复现。覆盖率过滤仍用组合文本的词集合，
所以标题加权只改排序、不改召回。无命中时返回 status=no_match 与空结果，前端据此显示
「依据不足、不生成引用」。
"""

from __future__ import annotations

import math
import re
from collections import Counter
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.shared.errors import ValidationFailed

from . import dao
from .models import KbChunk, KbDocument
from .schemas import (
    KbDocumentCreate,
    KbDocumentView,
    KbSearchHit,
    KbSearchResult,
)

# 单个切片的目标上限；超过则切分，保证检索粒度不会太大。
MAX_CHUNK_CHARS = 700
# 命中摘要的展示长度。
SUMMARY_CHARS = 120
# BM25 参数：仓库内固定取值，保证同数据同查询结果完全一致。
BM25_K1 = 1.2
BM25_B = 0.75
# 覆盖率下限分两档，理由是「短查询看比例、长问句看绝对重合」：
# 中文按字符 bigram 后，长问句里「哪些」「情况」「在的」这类虚词 bigram 占多数，
# 比例天然被稀释；而短查询是精确查找，几乎逐词命中才算有依据。
#
# 长查询（查询词多于 SHORT_QUERY_TERMS）沿用宽松下限：语料很小时 idf 区分度不足，
# 「流量」「任务」这类通用 bigram 会把无关长问题也打成命中，这个下限只做弱兜底。
MIN_QUERY_COVERAGE = 0.05
# 短查询的覆盖率下限，实测依据（语料：标题各含 Redis / Kafka / 分库分表的文档）：
# - 「不存在的词zzz」与语料里的「不存在的 key」共享 不存/存在/在的 三个 bigram，
#   一段连续重合会被 bigram 覆盖计数到 3/5 = 60%，所以下限必须高于 60%；
# - 0.7 下 q=Redis、q=Kafka、q=缓存、q=一致性 全部命中；
# - 「HashMap 扩容机制」在只有小节标题「扩容机制」命中的切片上覆盖 3/4 = 75%，
#   0.7 不会把这类标题命中挡掉（0.8 会）；
# - 「Spring 事务在哪些情况下会失效？」这类真实题干有 11 个查询词、只重合 3 个
#   （27%），属于长查询档，因此提高短查询下限不会打断题干回填的召回。
SHORT_QUERY_COVERAGE = 0.7
# 查询词数量不超过这个值时按短查询（精确查找）处理。
SHORT_QUERY_TERMS = 6

# 标题字段加权：组合文本里已经包含文档标题与小节标题，这里再对这两个字段单独做一次
# BM25 并加权，因为标题是人工凝练的主题标签，命中标题比命中正文更能说明「这段在讲
# 题干这个主题」。取值依据（35 篇种子语料 + 200 道题库真题，离线网格实测）：
# - 文档标题已经在组合文本里参与打分，单独再加一份只做轻量纠偏，权重取 0.1；
# - 小节标题是切片级标签，权重取 1.4，把「连接池与主从切换时的连接放大」「INP 与 CLS」
#   这类主题小节顶到 top-1；
# - 标题字段一律 b=0（不做长度归一），因为标题很短，用平均长度归一反而系统性压低
#   较长标题的分值；
# - 标题加权总和封顶 2.2，避免一个长小节标题靠 bigram 重合数量盖过正文证据。
# 这组取值满足：6 道实测错引问题里 5 道的 top-1 落到主题切片（第 6 道「1.2 亿行表
# 在线加联合索引」的 top-1 仍未修好），相对无加权基线没有把任何已知正确出处挤掉，
# 且回填覆盖率仍为 200/200、no_match 0。
TITLE_FIELD_WEIGHT = 0.1
HEADING_FIELD_WEIGHT = 1.4
LABEL_BONUS_CAP = 2.2
# 标题字段 BM25 的长度归一系数：短标签字段不做长度归一。
LABEL_FIELD_B = 0.0

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
_PARAGRAPH_RE = re.compile(r"\n\s*\n")
_SENTENCE_BOUNDARY_RE = re.compile(r"[^。！？!?；;\n]+[。！？!?；;]?")
_CJK_RE = re.compile(r"[\u4e00-\u9fff]+")
_ASCII_RE = re.compile(r"[a-z0-9]+")
_WHITESPACE_RE = re.compile(r"\s+")
# 种子语料正文开头的免责声明块引用行：它只说明语料来源，不属于知识内容。切片时
# 刻意丢弃，保证 chunk content 的第一行就是实质知识，命中摘要不会以模板声明开场。
_DISCLAIMER_RE = re.compile(r"^\s*>\s*本文是\s*resumate\s*项目自建的种子知识语料")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _normalise(body: str) -> str:
    return body.replace("\r\n", "\n").replace("\r", "\n")


def _strip_seed_corpus_disclaimer(text: str) -> str:
    """丢掉种子语料的免责声明行；声明所在的块引用段落随之变空并被段落过滤跳过。"""
    if ">" not in text:
        return text
    kept = [line for line in text.split("\n") if not _DISCLAIMER_RE.match(line)]
    return "\n".join(kept)


def _split_long_paragraph(paragraph: str) -> list[str]:
    """把超长段落按句末标点切成若干片，单句仍超长时按 MAX_CHUNK_CHARS 硬切。"""
    pieces: list[str] = []
    buffer = ""
    for sentence in _SENTENCE_BOUNDARY_RE.findall(paragraph):
        if not sentence:
            continue
        if len(sentence) > MAX_CHUNK_CHARS:
            if buffer:
                pieces.append(buffer)
                buffer = ""
            pieces.extend(
                sentence[index : index + MAX_CHUNK_CHARS]
                for index in range(0, len(sentence), MAX_CHUNK_CHARS)
            )
            continue
        if not buffer:
            buffer = sentence
        elif len(buffer) + len(sentence) <= MAX_CHUNK_CHARS:
            buffer += sentence
        else:
            pieces.append(buffer)
            buffer = sentence
    if buffer:
        pieces.append(buffer)
    return pieces


def _chunk_section(heading: str | None, text: str) -> list[dict]:
    paragraphs = [item.strip() for item in _PARAGRAPH_RE.split(text) if item.strip()]
    pieces: list[str] = []
    for paragraph in paragraphs:
        if len(paragraph) <= MAX_CHUNK_CHARS:
            pieces.append(paragraph)
        else:
            pieces.extend(_split_long_paragraph(paragraph))

    chunks: list[dict] = []
    buffer = ""
    for piece in pieces:
        if not buffer:
            buffer = piece
        elif len(buffer) + 2 + len(piece) <= MAX_CHUNK_CHARS:
            buffer = f"{buffer}\n\n{piece}"
        else:
            chunks.append({"heading": heading, "content": buffer})
            buffer = piece
    if buffer:
        chunks.append({"heading": heading, "content": buffer})
    return chunks


def split_document(body: str, *, source_type: str) -> list[dict]:
    """把文档正文切成 [{heading, content}]；空白文档返回空列表。"""
    normalised = _normalise(body)
    if not normalised.strip():
        return []
    normalised = _strip_seed_corpus_disclaimer(normalised)

    sections: list[tuple[str | None, str]] = []
    if source_type == "markdown":
        heading: str | None = None
        buffer: list[str] = []
        for line in normalised.split("\n"):
            match = _HEADING_RE.match(line)
            if match:
                text = "\n".join(buffer)
                if text.strip():
                    sections.append((heading, text))
                heading = match.group(2).strip() or None
                buffer = []
            else:
                buffer.append(line)
        text = "\n".join(buffer)
        if text.strip():
            sections.append((heading, text))
    else:
        sections.append((None, normalised))

    chunks: list[dict] = []
    for heading, text in sections:
        chunks.extend(_chunk_section(heading, text))
    return chunks


def _summarize(content: str) -> str:
    flat = _WHITESPACE_RE.sub(" ", content).strip()
    if len(flat) <= SUMMARY_CHARS:
        return flat
    return flat[:SUMMARY_CHARS] + "…"


def _source_label(title: str, heading: str | None) -> str:
    return f"{title} · {heading}" if heading else title


def _tokenize(text: str) -> list[str]:
    """中文按字符 bigram（单字保留）、英文数字按小写词切分。"""
    lowered = text.lower()
    tokens: list[str] = []
    for run in _CJK_RE.findall(lowered):
        if len(run) == 1:
            tokens.append(run)
        else:
            tokens.extend(run[index : index + 2] for index in range(len(run) - 1))
    tokens.extend(_ASCII_RE.findall(lowered))
    return tokens


def _bm25_scores(
    query_tokens: list[str],
    documents: list[list[str]],
    *,
    b: float = BM25_B,
    document_frequency: Counter[str] | None = None,
) -> list[float]:
    """对给定的字段文档目做 BM25；df 可由调用方传入，保证标题字段与正文用同一套 idf。"""
    total = len(documents)
    if total == 0:
        return []
    average_length = sum(len(tokens) for tokens in documents) / total or 1.0
    if document_frequency is None:
        document_frequency = Counter()
        for tokens in documents:
            document_frequency.update(set(tokens))

    scores: list[float] = []
    for tokens in documents:
        frequencies = Counter(tokens)
        length = len(tokens) or 1
        score = 0.0
        for term in set(query_tokens):
            frequency = frequencies.get(term, 0)
            if not frequency:
                continue
            idf = math.log(1 + (total - document_frequency[term] + 0.5) / (document_frequency[term] + 0.5))
            denominator = frequency + BM25_K1 * (1 - b + b * length / average_length)
            score += idf * frequency * (BM25_K1 + 1) / denominator
        scores.append(score)
    return scores


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def import_document(db: Session, payload: KbDocumentCreate) -> KbDocumentView:
    chunks = split_document(payload.body, source_type=payload.source_type)
    if not chunks:
        raise ValidationFailed("文档内容不能为空")

    now = _now()
    document = KbDocument(
        id=_new_id("kbd"),
        title=payload.title,
        role=payload.role,
        source_type=payload.source_type,
        body=payload.body,
        chunk_count=len(chunks),
        created_at=now,
        updated_at=now,
    )
    dao.add_document(db, document)
    for ordinal, chunk in enumerate(chunks, start=1):
        dao.add_chunk(
            db,
            KbChunk(
                id=_new_id("kbc"),
                document_id=document.id,
                ordinal=ordinal,
                heading=chunk["heading"],
                content=chunk["content"],
                char_count=len(chunk["content"]),
                created_at=now,
            ),
        )
    db.commit()
    db.refresh(document)
    return KbDocumentView.model_validate(document)


def list_documents(db: Session, *, role: str | None = None) -> list[KbDocumentView]:
    return [KbDocumentView.model_validate(row) for row in dao.list_documents(db, role=_clean(role))]


def search(db: Session, *, query: str, role: str | None, limit: int) -> KbSearchResult:
    """检索切片；无命中返回 no_match，绝不返回编造内容。"""
    cleaned_query = query.strip()
    query_tokens = _tokenize(cleaned_query)
    if not query_tokens:
        raise ValidationFailed("检索词不能为空")

    rows = dao.list_chunks_with_documents(db, role=_clean(role))
    if not rows:
        return KbSearchResult(query=cleaned_query, role=_clean(role), status="no_match", total=0, results=[])

    # 标题参与打分：文档标题与小节标题都是该段主题的高信号词。文档标题此前没有
    # 进入检索文本，导致「Redis 缓存一致性实战」这类只有标题含英文词的文档检索不到。
    documents = [
        _tokenize(f"{document.title} {chunk.heading or ''} {chunk.content}") for chunk, document in rows
    ]
    document_terms = [set(tokens) for tokens in documents]
    query_terms = set(query_tokens)
    coverage_floor = SHORT_QUERY_COVERAGE if len(query_terms) <= SHORT_QUERY_TERMS else MIN_QUERY_COVERAGE
    minimum_matched = max(1, math.ceil(len(query_terms) * coverage_floor))
    # idf 统一用组合文本的文档频率，标题字段与正文共用同一套稀有度口径。
    document_frequency: Counter[str] = Counter()
    for tokens in documents:
        document_frequency.update(set(tokens))
    base_scores = _bm25_scores(query_tokens, documents, document_frequency=document_frequency)
    title_scores = _bm25_scores(
        query_tokens,
        [_tokenize(document.title) for chunk, document in rows],
        b=LABEL_FIELD_B,
        document_frequency=document_frequency,
    )
    heading_scores = _bm25_scores(
        query_tokens,
        [_tokenize(chunk.heading or "") for chunk, document in rows],
        b=LABEL_FIELD_B,
        document_frequency=document_frequency,
    )

    ranked: list[tuple[float, KbChunk, KbDocument]] = []
    for base, title_score, heading_score, (chunk, document), terms in zip(
        base_scores, title_scores, heading_scores, rows, document_terms, strict=True
    ):
        score = base + min(
            TITLE_FIELD_WEIGHT * title_score + HEADING_FIELD_WEIGHT * heading_score,
            LABEL_BONUS_CAP,
        )
        if score <= 0:
            continue
        if len(query_terms & terms) < minimum_matched:
            continue
        ranked.append((score, chunk, document))
    if not ranked:
        return KbSearchResult(query=cleaned_query, role=_clean(role), status="no_match", total=0, results=[])

    ranked.sort(key=lambda item: (-item[0], item[1].id))
    hits = [
        KbSearchHit(
            chunk_id=chunk.id,
            document_id=document.id,
            document_title=document.title,
            heading=chunk.heading,
            source=_source_label(document.title, chunk.heading),
            content=chunk.content,
            summary=_summarize(chunk.content),
            score=round(score, 6),
            rank=index,
        )
        for index, (score, chunk, document) in enumerate(ranked[:limit], start=1)
    ]
    return KbSearchResult(
        query=cleaned_query,
        role=_clean(role),
        status="matched",
        total=len(ranked),
        results=hits,
    )

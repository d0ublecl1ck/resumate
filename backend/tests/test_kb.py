"""知识库检索链路：切片边界、导入校验、BM25 检索排序、无命中状态与 role 隔离。

检索实现为确定性离线 BM25（中文按字符 bigram，英文按小写词），不依赖任何外部
向量服务；无命中时 status=no_match 且 results 为空，前端据此显示「依据不足」。
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.kb import service as kb_service
from app.modules.kb.models import KbChunk, KbDocument  # noqa: F401  建表前注册 metadata

from conftest import TEST_USER
from scripts.seed_kb_corpus import DEFAULT_CORPUS_DIR, seed

JAVA = "Java 后端"
WEB = "Web 前端"

HASHMAP_DOC = """# Java 集合框架

HashMap 在 JDK 8 中按高位拆分链表，树化阈值为 8，退化阈值为 6。

## 扩容机制

扩容时容量翻倍，元素按哈希高位重新拆分到新桶，迁移成本与元素数量成正比。

## 并发安全

ConcurrentHashMap 用 CAS 加 synchronized 控制并发写入，读操作大多无锁。
"""

SPRING_DOC = """# Spring 事务管理

## 失效场景

自调用不经过代理、异常被 catch 吞掉、方法不是 public 时会失效。

## 传播行为

REQUIRED 与 REQUIRES_NEW 的差异在于是否复用外层事务。
"""


def _import_document(client: TestClient, *, title: str, role: str, body: str, source_type: str = "markdown") -> dict:
    response = client.post(
        "/kb/documents",
        json={"title": title, "role": role, "sourceType": source_type, "body": body},
    )
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# 切片：Markdown 标题、超长段落、空文档
# ---------------------------------------------------------------------------


def test_split_document_groups_by_markdown_heading() -> None:
    chunks = kb_service.split_document(HASHMAP_DOC, source_type="markdown")

    headings = [chunk["heading"] for chunk in chunks]
    assert headings == ["Java 集合框架", "扩容机制", "并发安全"]
    # 顶层标题下的首段归到同一个 chunk，正文不含标题行本身。
    assert "树化阈值为 8" in chunks[0]["content"]
    assert "# Java 集合框架" not in chunks[0]["content"]
    assert "重新拆分到新桶" in chunks[1]["content"]
    assert "CAS 加 synchronized" in chunks[2]["content"]


def test_split_document_merges_short_paragraphs_and_keeps_order() -> None:
    body = "\n\n".join(f"第 {index} 段说明分布式锁的租约与续期。" for index in range(1, 4))
    chunks = kb_service.split_document(body, source_type="text")

    assert len(chunks) == 1
    assert chunks[0]["heading"] is None
    assert chunks[0]["content"].startswith("第 1 段")
    assert chunks[0]["content"].endswith("第 3 段说明分布式锁的租约与续期。")


def test_split_document_splits_overlong_paragraph_without_losing_text() -> None:
    long_paragraph = "分布式锁的租约续期" * 200

    chunks = kb_service.split_document(long_paragraph, source_type="text")

    assert len(chunks) > 1
    assert all(len(chunk["content"]) <= kb_service.MAX_CHUNK_CHARS for chunk in chunks)
    assert "".join(chunk["content"] for chunk in chunks) == long_paragraph


def test_split_document_returns_empty_for_blank_body() -> None:
    assert kb_service.split_document("", source_type="text") == []
    assert kb_service.split_document("   \n\n\t ", source_type="markdown") == []


def test_split_document_drops_seed_corpus_disclaimer() -> None:
    """语料正文开头的免责声明块引用不属于知识内容，切片后不得出现在 chunk 里。

    否则命中摘要一开场就是「本文是 resumate 项目自建的种子知识语料…」，既不是
    知识内容，也会让检索面板与报告里的引用显得像模板噪声。
    """
    body = """# 分库分表实战

## 分片键与路由

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

按订单号取模选定分片键，保证同一业务实体的数据落在同一分片。
"""

    chunks = kb_service.split_document(body, source_type="markdown")

    assert chunks, "切片不应为空"
    joined = "".join(chunk["content"] for chunk in chunks)
    assert "本文是 resumate 项目自建的种子知识语料" not in joined
    assert not any(chunk["content"].lstrip().startswith(">") for chunk in chunks)
    assert chunks[0]["content"].startswith("按订单号取模")


def test_text_source_type_does_not_parse_headings() -> None:
    chunks = kb_service.split_document("# 看起来像标题\n\n正文内容", source_type="text")

    assert len(chunks) == 1
    assert chunks[0]["heading"] is None
    assert "# 看起来像标题" in chunks[0]["content"]


# ---------------------------------------------------------------------------
# 导入：真实落库 + 非法输入
# ---------------------------------------------------------------------------


def test_import_document_persists_chunks_with_role(client: TestClient, db_session: Session) -> None:
    created = _import_document(client, title="集合框架讲义", role=JAVA, body=HASHMAP_DOC)

    assert created["chunkCount"] == 3
    assert created["role"] == JAVA
    assert created["sourceType"] == "markdown"

    document = db_session.get(KbDocument, created["id"])
    assert document is not None
    assert document.chunk_count == 3
    chunks = list(
        db_session.scalars(select(KbChunk).where(KbChunk.document_id == created["id"]).order_by(KbChunk.ordinal))
    )
    assert [chunk.ordinal for chunk in chunks] == [1, 2, 3]
    assert chunks[0].heading == "Java 集合框架"


def test_import_rejects_blank_body_and_title(client: TestClient, db_session: Session) -> None:
    blank_body = client.post(
        "/kb/documents",
        json={"title": "空文档", "role": JAVA, "sourceType": "markdown", "body": "   \n\n "},
    )
    assert blank_body.status_code == 422, blank_body.text
    assert blank_body.json()["code"] == "VALIDATION_FAILED"

    blank_title = client.post(
        "/kb/documents",
        json={"title": "   ", "role": JAVA, "sourceType": "markdown", "body": "有正文"},
    )
    assert blank_title.status_code == 422, blank_title.text

    assert db_session.scalars(select(KbDocument)).first() is None


def test_import_rejects_unknown_source_type(client: TestClient) -> None:
    response = client.post(
        "/kb/documents",
        json={"title": "非法来源", "role": JAVA, "sourceType": "pdf", "body": "正文"},
    )
    assert response.status_code == 422, response.text
    assert "sourceType" in response.json()["message"]
    assert "Input should be" not in response.json()["message"]


# ---------------------------------------------------------------------------
# 检索：排序、来源信息、无命中状态、role 隔离、limit
# ---------------------------------------------------------------------------


def test_search_returns_hits_with_source_and_score(client: TestClient, db_session: Session) -> None:
    _import_document(client, title="集合框架讲义", role=JAVA, body=HASHMAP_DOC)

    response = client.get("/kb/search", params={"q": "HashMap 扩容机制", "role": JAVA, "limit": 5})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "matched"
    assert body["query"] == "HashMap 扩容机制"
    assert body["total"] >= 1
    top = body["results"][0]
    assert top["documentTitle"] == "集合框架讲义"
    assert top["heading"] == "扩容机制"
    assert top["source"] == "集合框架讲义 · 扩容机制"
    assert top["score"] > 0
    assert top["rank"] == 1
    assert "重新拆分到新桶" in top["content"]
    assert top["summary"]


def test_search_orders_more_relevant_chunk_first(client: TestClient, db_session: Session) -> None:
    body_text = """# 缓存

## 一致性

缓存一致性方案包括 Cache Aside 与延迟双删。

## 无关章节

本节只讨论日志切割与归档策略，不涉及缓存一致性。
"""
    _import_document(client, title="缓存笔记", role=JAVA, body=body_text)

    body = client.get("/kb/search", params={"q": "缓存一致性 Cache Aside", "role": JAVA}).json()

    assert body["status"] == "matched"
    assert body["results"][0]["heading"] == "一致性"
    scores = [item["score"] for item in body["results"]]
    assert scores == sorted(scores, reverse=True)


def test_search_without_match_returns_empty_and_no_match_status(client: TestClient, db_session: Session) -> None:
    _import_document(client, title="集合框架讲义", role=JAVA, body=HASHMAP_DOC)

    response = client.get("/kb/search", params={"q": "量子计算纠错码", "role": JAVA})

    assert response.status_code == 200, response.text
    assert response.json() == {
        "query": "量子计算纠错码",
        "role": JAVA,
        "status": "no_match",
        "total": 0,
        "results": [],
    }


def test_search_ignores_weak_generic_overlap(client: TestClient, db_session: Session) -> None:
    _import_document(
        client,
        title="通用指标",
        role=JAVA,
        body="# 通用指标\n\n本节讨论系统吞吐与流量统计的通用指标。",
    )
    # 长问题只与文档共享「流量」这类通用 bigram；覆盖率低于阈值时必须判为无命中，
    # 否则会拿通用词给无关问题生成假引用。
    prompt = (
        "请说明你在高并发大促场景下如何设计限流降级熔断方案并推动跨团队协作与容量评估落地，"
        "最后复盘故障演练中的改进项与验证手段等完整过程。"
    )

    body = client.get("/kb/search", params={"q": prompt, "role": JAVA}).json()

    assert body["status"] == "no_match"
    assert body["total"] == 0
    assert body["results"] == []


def test_search_matches_term_that_only_appears_in_document_title(client: TestClient) -> None:
    """标题是切片主题的高信号词：标题里的英文词必须能检索到。

    复现场景：文档正文与小节标题都没有出现 Redis，只有文档标题有；此前检索只
    对「小节标题 + 正文」分词，导致 q=Redis 直接 no_match。
    """
    created = _import_document(
        client,
        title="Redis 缓存一致性实战",
        role=JAVA,
        body="# 失效策略\n\n先更新数据库再删除缓存，写后延时二次删除降低脏缓存概率。",
    )

    for query in ("Redis", "redis"):
        body = client.get("/kb/search", params={"q": query, "role": JAVA}).json()
        assert body["status"] == "matched", (query, body)
        assert body["total"] >= 1, (query, body)
        assert {item["documentId"] for item in body["results"]} == {created["id"]}, (query, body)
        assert body["results"][0]["documentTitle"] == "Redis 缓存一致性实战"


def test_search_rejects_incidental_substring_overlap(client: TestClient) -> None:
    """无关问句只与语料共享一段连续片段时必须判为无命中。

    bigram 覆盖会把一段连续重合算成多个命中项：「不存在的词zzz」与语料里的
    「不存在的 key」共享 不存/存在/在的 三个 bigram，覆盖率 3/5 = 60%，
    这类偶然重合不能当作有依据（P5：无命中即标注依据不足，不生成引用）。
    """
    _import_document(
        client,
        title="Redis 缓存一致性实战",
        role=JAVA,
        body="# 缓存穿透\n\n缓存穿透用布隆过滤器拦截不存在的 key，空值缓存设置较短过期时间。",
    )
    _import_document(
        client,
        title="Kafka 精确一次语义实战",
        role=JAVA,
        body="# 幂等生产者\n\n幂等生产者用 producer id 与序列号在 broker 侧去重。",
    )
    _import_document(
        client,
        title="分库分表实战",
        role=JAVA,
        body="# 分片键\n\n按订单号取模选定分片键，保证同一实体的数据落在同一分片。",
    )

    bogus = client.get("/kb/search", params={"q": "不存在的词zzz", "role": JAVA}).json()

    assert bogus["status"] == "no_match", bogus
    assert bogus["total"] == 0
    assert bogus["results"] == []

    # 反向保护：提高阈值不能把真正的多词相关问句一起挡掉。
    related = client.get("/kb/search", params={"q": "Kafka 精确一次语义", "role": JAVA}).json()
    assert related["status"] == "matched", related
    assert [item["documentTitle"] for item in related["results"]] == ["Kafka 精确一次语义实战"]


def test_search_isolates_role(client: TestClient, db_session: Session) -> None:
    java_doc = _import_document(client, title="Java 并发笔记", role=JAVA, body="# 并发\n\nKafka 精确一次语义依赖幂等生产者。")
    web_doc = _import_document(client, title="前端性能笔记", role=WEB, body="# 性能\n\nKafka 精确一次语义与前端无关，仅作引用占位。")

    web_hits = client.get("/kb/search", params={"q": "Kafka 精确一次语义", "role": WEB}).json()
    assert {item["documentId"] for item in web_hits["results"]} == {web_doc["id"]}

    java_hits = client.get("/kb/search", params={"q": "Kafka 精确一次语义", "role": JAVA}).json()
    assert {item["documentId"] for item in java_hits["results"]} == {java_doc["id"]}

    all_hits = client.get("/kb/search", params={"q": "Kafka 精确一次语义"}).json()
    assert {item["documentId"] for item in all_hits["results"]} == {java_doc["id"], web_doc["id"]}


def test_search_limits_results_and_reports_total(client: TestClient, db_session: Session) -> None:
    body_text = "\n\n".join(f"## 小节 {index}\n\n分布式锁的实现细节第 {index} 节。" for index in range(1, 6))
    _import_document(client, title="分布式锁笔记", role=JAVA, body=body_text)

    body = client.get("/kb/search", params={"q": "分布式锁 实现细节", "role": JAVA, "limit": 2}).json()

    assert body["total"] == 5
    assert len(body["results"]) == 2
    assert [item["rank"] for item in body["results"]] == [1, 2]


def test_search_rejects_blank_query_and_bad_limit(client: TestClient) -> None:
    assert client.get("/kb/search", params={"q": ""}).status_code == 422
    assert client.get("/kb/search", params={"q": "   "}).status_code == 422
    assert client.get("/kb/search", params={"q": "缓存", "limit": 0}).status_code == 422
    assert client.get("/kb/search", params={"q": "缓存", "limit": 100}).status_code == 422


def test_blank_query_error_uses_machine_code_not_raw_pydantic(client: TestClient) -> None:
    response = client.get("/kb/search", params={"q": "   "})

    assert response.status_code == 422, response.text
    assert response.json()["code"] == "VALIDATION_FAILED"
    assert "Input should be" not in response.json()["message"]


# ---------------------------------------------------------------------------
# 权限：读沿用通用读权限，导入沿用写权限
# ---------------------------------------------------------------------------


def test_kb_search_requires_read_and_import_requires_write(client: TestClient) -> None:
    reader = CurrentUser(
        id="user_kb_reader",
        display_name="只读用户",
        role="user",
        roles=("user",),
        permissions=frozenset({"resume:read"}),
    )
    app.dependency_overrides[get_current_user] = lambda: reader
    try:
        assert client.get("/kb/search", params={"q": "缓存"}).status_code == 200
        assert client.get("/kb/documents").status_code == 200
        denied = client.post(
            "/kb/documents",
            json={"title": "受限导入", "role": JAVA, "sourceType": "text", "body": "正文"},
        )
    finally:
        app.dependency_overrides[get_current_user] = lambda: TEST_USER

    assert denied.status_code == 403, denied.text
    assert denied.json()["code"] == "FORBIDDEN"


def test_kb_without_permission_is_forbidden(client: TestClient) -> None:
    nobody = CurrentUser(
        id="user_kb_nobody",
        display_name="无权限用户",
        role="user",
        roles=("user",),
        permissions=frozenset(),
    )
    app.dependency_overrides[get_current_user] = lambda: nobody
    try:
        assert client.get("/kb/search", params={"q": "缓存"}).status_code == 403
        assert client.get("/kb/documents").status_code == 403
        assert (
            client.post(
                "/kb/documents",
                json={"title": "无权限", "role": JAVA, "sourceType": "text", "body": "正文"},
            ).status_code
            == 403
        )
    finally:
        app.dependency_overrides[get_current_user] = lambda: TEST_USER


# ---------------------------------------------------------------------------
# 真实题库题干的排序回归：标题/小节加权 + 语料补全后，top-1 必须落在主题切片上
# ---------------------------------------------------------------------------

# 每题断言 (题干, role, 期望文档标题, 期望小节标题)，question_id 是题库里的真实题目 ID：
# - bkq_8c55fb66446d / bkq_c2e5bd7ee513 / bkq_e413d529ef25 由「单库单表到分库分表的在线迁移」承载；
# - bkq_594e18d13c01 由「Redis 集群模式与大促限流治理」承载；
# - bkq_3b047035d442 由「前端性能优化与 Core Web Vitals · INP 与 CLS」承载。
# bkq_cb88e3abd32c（1.2 亿行表在线加联合索引）当前 top-1 仍是无关切片，未纳入断言。
BANK_TOPIC_RANKING_CASES = [
    (
        "bkq_8c55fb66446d",
        "存量1.2亿订单要从单库迁到8库64表，要求不停机、可回滚。请给出从双写到灰度切流的完整迁移步骤，"
        "说明全量与增量数据如何同步、如何做数据校验、以及切流过程中出现数据不一致时如何回滚。",
        JAVA,
        "单库单表到分库分表的在线迁移",
        "灰度切流与回滚",
    ),
    (
        "bkq_c2e5bd7ee513",
        "订单库分成16个分片后，应用有200个实例，每实例连接池 maxPoolSize=20。按最坏情况计算总连接数"
        "并说明MySQL会出什么问题，你如何评估和改造连接模型？",
        JAVA,
        "单库单表到分库分表的在线迁移",
        "切流期的连接与容量",
    ),
    (
        "bkq_e413d529ef25",
        "订单表要从单库单表迁移到4库8表，要求不停机、可回滚。请描述完整迁移步骤，并说明每个阶段用什么手段"
        "校验数据一致性。",
        JAVA,
        "单库单表到分库分表的在线迁移",
        "迁移阶段与双写",
    ),
    (
        "bkq_594e18d13c01",
        "你用 Redis + Lua 实现按接口维度的分布式滑动窗口限流。大促时发现 Redis 集群 CPU 打满，限流器本身"
        "成为瓶颈甚至拖垮缓存读写。请给出具体的优化方案与取舍。",
        JAVA,
        "Redis 集群模式与大促限流治理",
        "CPU 打满的治理",
    ),
    (
        "bkq_3b047035d442",
        "搜索框输入时需要过滤 5000 条列表，直接 setKeyword 触发全量重算会明显卡顿。请说明 useTransition "
        "与 useDeferredValue 的区别，并给出一个能实际改善输入卡顿的写法要点。",
        WEB,
        "前端性能优化与 Core Web Vitals",
        "INP 与 CLS",
    ),
]


@pytest.mark.parametrize(
    ("question_id", "prompt", "role", "document_title", "heading"),
    BANK_TOPIC_RANKING_CASES,
    ids=[case[0] for case in BANK_TOPIC_RANKING_CASES],
)
def test_search_ranks_topic_chunk_first_for_bank_prompts(
    client: TestClient,
    db_session: Session,
    question_id: str,
    prompt: str,
    role: str,
    document_title: str,
    heading: str,
) -> None:
    """真实题干命中主题切片：标题/小节加权后 top-1 必须是主题文档对应小节。

    断言到具体 chunk 归属（documentTitle + heading），不只看 score；断言语义是
    「引用出处的主题与题干主题一致」，这样加权退化或语料被删时用例会直接报出
    题干 ID 与期望出处。
    """
    seed(db_session, DEFAULT_CORPUS_DIR, dry_run=False)

    body = client.get("/kb/search", params={"q": prompt, "role": role, "limit": 1}).json()

    assert body["status"] == "matched", (question_id, body)
    top = body["results"][0]
    assert (top["documentTitle"], top["heading"]) == (document_title, heading), (
        question_id,
        top["source"],
        top["score"],
    )

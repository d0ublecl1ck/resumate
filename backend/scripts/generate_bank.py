"""岗位题库生成脚本：用「设置」里已配置的模型批量生成真实题目并落库。

复用面试模块的 JSON 加固（app.modules.interview.llm.chat_json 的
response_format + 截断重试 + 解析失败加倍预算），不再写第二套 HTTP 客户端。

目标规模（每个岗位）：technical 48 / deep_dive 24 / scenario 16 / behavioral 12 = 100；
岗位为 Java 后端 与 Web 前端，共 200 题。难度按下面 DIFFICULTY_PLAN 分配。

用法（在 backend 目录下执行）：
    .venv/bin/python -m alembic upgrade head
    .venv/bin/python -m scripts.generate_bank --dry-run
    .venv/bin/python -m scripts.generate_bank
    .venv/bin/python -m scripts.generate_bank --role "Java 后端" --kind technical

幂等可续跑：同一 (role, 去空白题干 sha256) 已存在则跳过，单批失败会重试，
进度与最终真实计数写日志（默认 backend/var/bank-generation.log）。
"""

from __future__ import annotations

import argparse
import logging
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.modules.bank import dao as bank_dao  # noqa: E402
from app.modules.bank.models import BankQuestion  # noqa: E402
from app.modules.bank.schemas import BankQuestionImport  # noqa: E402
from app.modules.bank.service import prompt_hash  # noqa: E402
from app.modules.interview import llm  # noqa: E402
from app.modules.settings import dao as settings_dao  # noqa: E402
from app.modules.settings.models import UserSettings  # noqa: E402
from app.shared.errors import ApiException  # noqa: E402

logger = logging.getLogger("generate_bank")

DEFAULT_OWNER = "user_admin"
BATCH_SIZE = 8
SOURCE = "seed_model"
KINDS = ("technical", "deep_dive", "scenario", "behavioral")

# 每个岗位每类题的目标数量（合计 100）。
KIND_TARGETS: dict[str, int] = {
    "technical": 48,
    "deep_dive": 24,
    "scenario": 16,
    "behavioral": 12,
}
# 难度拆分，合计等于 KIND_TARGETS。
DIFFICULTY_PLAN: dict[str, dict[str, int]] = {
    "technical": {"easy": 12, "medium": 24, "hard": 12},
    "deep_dive": {"easy": 4, "medium": 12, "hard": 8},
    "scenario": {"easy": 2, "medium": 6, "hard": 8},
    "behavioral": {"easy": 4, "medium": 6, "hard": 2},
}

ROLE_BRIEF: dict[str, str] = {
    "Java 后端": (
        "Java 后端工程师岗位，考察 Spring Cloud 微服务治理、MySQL 分库分表与索引、"
        "Redis 缓存与一致性、Kafka 消息可靠性、JVM 内存与 GC、并发与锁、"
        "高并发稳定性（限流/降级/熔断）等真实生产问题。"
    ),
    "Web 前端": (
        "Web 前端工程师岗位，考察 React 运行时与渲染、TypeScript 类型系统、"
        "浏览器渲染与关键渲染路径、性能优化（Core Web Vitals）、前端工程化与构建、"
        "状态管理与组件设计、线上白屏与错误排查等真实工程问题。"
    ),
}

# 每批换一个聚焦方向，降低重复题概率；生成器仍以 (role, prompt_hash) 兜底去重。
FOCUS: dict[str, dict[str, tuple[str, ...]]] = {
    "Java 后端": {
        "technical": (
            "Spring Cloud 服务注册发现、网关与配置中心",
            "MySQL 分库分表、索引与慢查询",
            "Redis 数据结构、缓存一致性与持久化",
            "Kafka 分区、幂等与消息可靠性",
            "JVM 内存结构、GC 与线上调优",
            "Java 并发、锁与线程池",
        ),
        "deep_dive": (
            "项目容量评估与分库分表迁移",
            "缓存与数据库一致性取舍",
            "消息重复消费与幂等设计",
            "服务拆分边界与接口治理",
            "一次线上故障的定位与复盘",
            "技术选型的对比与取舍依据",
        ),
        "scenario": (
            "大促流量突增下的限流与降级",
            "缓存雪崩/击穿/穿透的应急处理",
            "Kafka 消息积压的排查与恢复",
            "MySQL 主从延迟影响业务的处置",
            "全链路压测与容量水位评估",
            "灰度发布出现脏数据的回滚",
        ),
        "behavioral": (
            "主导技术方案并推动落地",
            "线上事故复盘与责任界定",
            "跨团队协作与推动共识",
            "性能优化的目标设定与结果",
        ),
    },
    "Web 前端": {
        "technical": (
            "React 渲染、协调与并发特性",
            "TypeScript 类型系统与类型收敛",
            "浏览器关键渲染路径与事件循环",
            "HTTP 缓存、CDN 与资源加载",
            "前端工程化、打包与依赖治理",
            "状态管理与组件设计",
        ),
        "deep_dive": (
            "性能优化项目的指标与收益",
            "组件库拆分与按需加载",
            "构建提速与研发效能",
            "监控、埋点与线上问题定位",
            "微前端迁移的分层与沙箱",
            "技术选型的对比与取舍依据",
        ),
        "scenario": (
            "首屏 LCP 突然退化的定位",
            "线上白屏的分钟级排查",
            "首屏体积膨胀的治理",
            "线上错误率暴涨的止损",
            "灰度发布出现样式错乱的处置",
            "接口变慢导致交互卡顿的优化",
        ),
        "behavioral": (
            "推动团队统一工程规范",
            "跨端/跨团队协作与对齐",
            "用数据说服团队做技术选型",
            "质量事故复盘与流程改进",
        ),
    },
}

SYSTEM_PROMPT = (
    "你是资深技术面试官与题库编辑。请生成真实、具体、可直接用于面试的题目，"
    "避免空泛与重复。只输出 JSON 本身，不要输出解释或 Markdown 代码块。字段格式："
    '{"questions":[{"prompt":"题干","referencePoints":["要点1","要点2"],'
    '"knowledgeRefs":["知识条目1"]}]}。'
    "referencePoints 必须 2-4 条，每条是一句不超过 40 字的具体可核对技术点，"
    "不要写成整段解释；knowledgeRefs 为 0-2 条知识来源，每条不超过 20 字（没有就给空数组）。"
)


def _build_user_prompt(*, role: str, kind: str, difficulty: str, focus: str, count: int) -> str:
    return (
        f"岗位：{role}（{ROLE_BRIEF[role]}）\n"
        f"题型：{kind}\n"
        f"难度：{difficulty}\n"
        f"本批聚焦方向：{focus}\n\n"
        f"请生成 {count} 道彼此不同、且与该岗位强相关的中文面试题。"
        "题干要具体到技术点或场景，不要出现「谈谈你的理解」这类泛题。"
    )


def _as_text_list(value: object, *, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for entry in value:
        if not isinstance(entry, str):
            continue
        text = entry.strip()
        if text and text not in items:
            items.append(text)
        if len(items) >= limit:
            break
    return items


def _parse_batch(data: dict, *, role: str, kind: str, difficulty: str, want: int) -> list[BankQuestionImport]:
    """把模型输出收敛成待入库条目；要点不足 2 条或题干为空的一律丢弃。"""
    raw = data.get("questions")
    if not isinstance(raw, list):
        return []
    items: list[BankQuestionImport] = []
    for entry in raw[:want]:
        if not isinstance(entry, dict):
            continue
        prompt = str(entry.get("prompt") or "").strip()
        if not prompt:
            continue
        points = _as_text_list(entry.get("referencePoints") or entry.get("reference_points"), limit=4)
        if len(points) < 2:
            logger.warning("丢弃要点不足的题目：%s", prompt[:40])
            continue
        refs = _as_text_list(entry.get("knowledgeRefs") or entry.get("knowledge_refs"), limit=2)
        items.append(
            BankQuestionImport(
                role=role,
                kind=kind,
                difficulty=difficulty,
                prompt=prompt,
                reference_points=points,
                knowledge_refs=refs or None,
            )
        )
    return items


def _generate_batch(
    db: Session,
    owner_id: str,
    *,
    role: str,
    kind: str,
    difficulty: str,
    focus: str,
    want: int,
) -> list[BankQuestionImport]:
    data = llm.chat_json(
        db,
        owner_id,
        system_prompt=SYSTEM_PROMPT,
        user_prompt=_build_user_prompt(role=role, kind=kind, difficulty=difficulty, focus=focus, count=want),
    )
    return _parse_batch(data, role=role, kind=kind, difficulty=difficulty, want=want)


def _configured_model(db: Session, owner_id: str) -> str | None:
    row = settings_dao.get_by_owner(db, owner_id)
    config = (row.model_config if row is not None else {}) or {}
    model = str(config.get("model") or "").strip()
    api_key = str(config.get("apiKey") or "").strip()
    return model if model and api_key else None


def _resolve_owner(db: Session, explicit: str | None) -> str:
    """优先用 --owner；否则 user_admin，再否则第一个配置了模型密钥的账号。"""
    if explicit:
        if _configured_model(db, explicit) is None:
            raise SystemExit(f"账号 {explicit} 未配置可用的模型密钥")
        return explicit
    if _configured_model(db, DEFAULT_OWNER) is not None:
        return DEFAULT_OWNER
    rows = db.execute(select(UserSettings.owner_id, UserSettings.model_config).order_by(UserSettings.owner_id))
    for owner_id, config in rows:
        config = config or {}
        if str(config.get("model") or "").strip() and str(config.get("apiKey") or "").strip():
            return str(owner_id)
    raise SystemExit("没有找到任何已配置模型密钥的账号，请先在设置中完成模型配置")


def _count_existing(db: Session, *, role: str, kind: str, difficulty: str) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(BankQuestion)
            .where(
                BankQuestion.role == role,
                BankQuestion.kind == kind,
                BankQuestion.difficulty == difficulty,
            )
        )
        or 0
    )


def _store(db: Session, items: list[BankQuestionImport], *, seen: set[tuple[str, str]], batch_id: str) -> int:
    """把一批题写入数据库；(role, prompt_hash) 已存在则跳过，返回真实新增数。"""
    now = datetime.now(timezone.utc)
    created = 0
    for item in items:
        digest = prompt_hash(item.prompt)
        key = (item.role, digest)
        if key in seen:
            continue
        seen.add(key)
        db.add(
            BankQuestion(
                id=f"bkq_{uuid4().hex[:12]}",
                role=item.role,
                kind=item.kind,
                difficulty=item.difficulty,
                prompt=item.prompt,
                reference_points=list(item.reference_points),
                knowledge_refs=list(item.knowledge_refs) if item.knowledge_refs is not None else None,
                source=SOURCE,
                batch_id=batch_id,
                prompt_hash=digest,
                created_at=now,
                updated_at=now,
            )
        )
        created += 1
    db.commit()
    return created


def _plan_jobs(args: argparse.Namespace) -> list[tuple[str, str, str, int]]:
    roles = [args.role] if args.role else list(ROLE_BRIEF)
    kinds = [args.kind] if args.kind else list(KINDS)
    jobs: list[tuple[str, str, str, int]] = []
    for role in roles:
        for kind in kinds:
            for difficulty, count in DIFFICULTY_PLAN[kind].items():
                if args.difficulty and difficulty != args.difficulty:
                    continue
                jobs.append((role, kind, difficulty, count))
    return jobs


def _print_summary(db: Session) -> None:
    rows = bank_dao.count_by_role_kind(db)
    per_role: dict[str, dict[str, int]] = {}
    for role, kind, count in rows:
        per_role.setdefault(role, {})[kind] = count
    logger.info("========== 题库真实计数 ==========")
    for role in sorted(per_role):
        kinds = per_role[role]
        total = sum(kinds.values())
        detail = " / ".join(f"{kind} {kinds.get(kind, 0)}" for kind in KINDS)
        logger.info("%s：%s = %d", role, detail, total)
    logger.info("全库总计：%d 题", sum(sum(v.values()) for v in per_role.values()))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="生成岗位题库并写入 bank_questions 表")
    parser.add_argument("--role", choices=list(ROLE_BRIEF), help="只生成某个岗位")
    parser.add_argument("--kind", choices=list(KINDS), help="只生成某类题")
    parser.add_argument("--difficulty", choices=("easy", "medium", "hard"), help="只生成某个难度")
    parser.add_argument("--owner", help="用哪个账号的模型配置，默认自动选择已配置账号")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help="每个模型请求生成几道题")
    parser.add_argument("--rounds", type=int, default=3, help="每个目标允许的额外重试倍数")
    parser.add_argument("--dry-run", action="store_true", help="只打印计划，不调用模型也不入库")
    parser.add_argument("--log-file", default=str(BACKEND_DIR / "var" / "bank-generation.log"))
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    log_path = Path(args.log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(sys.stdout), logging.FileHandler(log_path, encoding="utf-8")],
    )

    jobs = _plan_jobs(args)
    expected_calls = sum(math.ceil(target / args.batch_size) for *_, target in jobs)
    logger.info("生成计划：%d 个 (role, kind, difficulty) 目标，预计至少 %d 次模型调用", len(jobs), expected_calls)
    for role, kind, difficulty, target in jobs:
        logger.info("  - %s / %s / %s：目标 %d 题", role, kind, difficulty, target)

    if args.dry_run:
        logger.info("dry-run：未调用模型、未写库")
        return 0

    with SessionLocal() as db:
        owner_id = _resolve_owner(db, args.owner)
        logger.info("使用账号 %s 的模型配置（model=%s）", owner_id, _configured_model(db, owner_id))

        for role, kind, difficulty, target in jobs:
            seen = bank_dao.existing_hashes(db, roles=[role])
            stored = _count_existing(db, role=role, kind=kind, difficulty=difficulty)
            attempts = 0
            max_attempts = math.ceil(target / args.batch_size) * args.rounds + 3
            focuses = FOCUS[role][kind]
            logger.info("开始 %s / %s / %s：已有 %d，目标 %d", role, kind, difficulty, stored, target)
            while stored < target and attempts < max_attempts:
                want = min(args.batch_size, target - stored)
                focus = focuses[attempts % len(focuses)]
                attempts += 1
                batch_id = f"seed_{kind}_{difficulty}_{uuid4().hex[:8]}"
                try:
                    items = _generate_batch(
                        db, owner_id, role=role, kind=kind, difficulty=difficulty, focus=focus, want=want
                    )
                except ApiException as exc:
                    logger.warning("第 %d 批失败（%s），稍后重试：%s", attempts, type(exc).__name__, exc)
                    time.sleep(1.0)
                    continue
                created = _store(db, items, seen=seen, batch_id=batch_id)
                stored += created
                logger.info(
                    "  %s/%s/%s 第 %d 批：返回 %d，入库 %d，累计 %d/%d",
                    role, kind, difficulty, attempts, len(items), created, stored, target,
                )
                if created == 0:
                    logger.warning("  本批没有新增（模型重复），换角度重试")
            if stored < target:
                logger.warning(
                    "  %s/%s/%s 未达目标：%d/%d（已达最大尝试次数）", role, kind, difficulty, stored, target
                )

        _print_summary(db)
    logger.info("日志文件：%s", log_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

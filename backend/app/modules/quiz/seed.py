"""笔试种子题：题库（bank_questions）里没有客观题，因此内置少量示范题兜底。

题库当前只有 technical/deep_dive/scenario/behavioral 四类开放题（无选项、无答案键），
因此客观题只能来自这里的种子；开放题优先走 bank，bank 为空时回落到种子。
判分口径与答案键只存在于服务端，出题视图会剥离 correctOptionIds / optionExplanations。
"""

from __future__ import annotations

from copy import deepcopy

SEED_SOURCE: dict[str, str] = {"kind": "seed", "label": "内置示范题", "version": "seed-v1"}

_OBJECTIVE: dict = {
    "kind": "multiple_choice",
    "points": 10,
    "prompt": "关于订单服务分库分表的容量评估，下列说法正确的有哪些？",
    "options": [
        {"id": "a", "text": "分片键选订单号，保证同一订单的读写落在同一分片。"},
        {"id": "b", "text": "分片数量一旦确定，后期就不需要再调整。"},
        {"id": "c", "text": "容量评估要同时考虑峰值 QPS、单行大小与索引膨胀系数。"},
        {"id": "d", "text": "跨分片聚合查询应尽量下沉到离线数仓，而不是在线拼装。"},
    ],
    "correctOptionIds": ["a", "c", "d"],
    "optionExplanations": {
        "a": "分片键决定数据分布，同一订单必须落在同一分片，否则会出现跨分片事务。",
        "b": "分片数量与容量增长、再均衡成本相关，需要预留扩容方案，不能说定死不变。",
        "c": "峰值 QPS、单行大小与索引膨胀共同决定单分片容量，是容量评估的三个要素。",
        "d": "跨分片聚合延迟不可控，下沉到离线数仓后再回读是更稳妥的做法。",
    },
    "referencePoints": [],
    "referenceAnswer": "",
    "starterCode": "",
}

_OPEN: dict = {
    "kind": "open",
    "points": 20,
    "prompt": "大促当天订单量突增十倍，数据库连接数逼近上限。请给出你的排查顺序与保护方案，并说明取舍。",
    "options": [],
    "correctOptionIds": [],
    "optionExplanations": {},
    "referencePoints": [
        "排查顺序清晰：先定位瓶颈再处置，而不是直接扩容。",
        "说明保护方案对核心链路的影响与取舍依据。",
        "给出可验证的指标，例如连接数、慢查询数与 P99 延迟。",
    ],
    "referenceAnswer": (
        "先按「限流 → 降级 → 扩容」的顺序保护数据库：网关按业务优先级限流，"
        "非核心链路降级为异步，只读流量加缓存；同时用连接池监控确认是否为慢查询长期占用连接，"
        "必要时终止长事务。"
    ),
    "starterCode": "",
}

_CODE: dict = {
    "kind": "code",
    "points": 20,
    "prompt": (
        "实现一个固定窗口限流器：给定窗口时长、阈值与当前时间，判断本次请求是否放行。"
        "请补全 limit() 方法（本期只做静态评审，服务端不执行你的代码）。"
    ),
    "options": [],
    "correctOptionIds": [],
    "optionExplanations": {},
    "referencePoints": ["窗口过期后重置计数", "used 达到阈值时拒绝", "否则计数并放行"],
    "referenceAnswer": (
        "if (now - bucket.windowStart >= windowMs) {\n"
        "  bucket.windowStart = now\n"
        "  bucket.used = 0\n"
        "}\n"
        "if (bucket.used >= threshold) return false\n"
        "bucket.used += 1\n"
        "return true"
    ),
    "starterCode": (
        "type Bucket = { windowStart: number; used: number }\n\n"
        "export function limit(bucket: Bucket, now: number, windowMs: number, threshold: number) {\n"
        "  // TODO: fixed-window counting\n"
        "  return true\n"
        "}"
    ),
}

SEED_BY_GROUP: dict[str, dict] = {"objective": _OBJECTIVE, "open": _OPEN, "code": _CODE}


def seed_question(group: str) -> dict:
    """返回一份种子题副本；未知分组返回空字典，由调用方决定如何报错。"""
    entry = SEED_BY_GROUP.get(group)
    return deepcopy(entry) if entry is not None else {}

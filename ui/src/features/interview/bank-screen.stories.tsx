// Storybook 确认屏：SCR-140 岗位题库与知识库。
// 数据抓取自 2026-10-09 的真实接口（backend http://127.0.0.1:8000，role=Java 后端，语料 35 篇），
// 按题型各取最新 1 道，保证三类题都能看到；命令：
//   curl -b cookies.txt "http://127.0.0.1:8000/bank/questions?role=Java%20%E5%90%8E%E7%AB%AF&kind=technical&size=1"
//   curl -b cookies.txt "http://127.0.0.1:8000/bank/questions?role=Java%20%E5%90%8E%E7%AB%AF&kind=deep_dive&size=1"
//   curl -b cookies.txt "http://127.0.0.1:8000/bank/questions?role=Java%20%E5%90%8E%E7%AB%AF&kind=scenario&size=1"
//   curl -b cookies.txt "http://127.0.0.1:8000/kb/search?q=<题干全文>&role=Java%20%E5%90%8E%E7%AB%AF&limit=1"
// 题干、id、kind、difficulty、knowledgeRefs、source、content、summary、score 全部是接口原值。
// MSW handler 按题干精确匹配这三条 fixture（不做关键字模糊匹配），三条都返回 matched。

import { http, HttpResponse } from "msw"
import type { BankQuestion, BankStats } from "@/lib/bank-api"
import { worker } from "@/mocks/browser"
import { Screen } from "@/storybook/screen"
import { BankScreen } from "./bank-screen"

const STATS: BankStats = {
  roles: [
    { role: "Java 后端", total: 100, kinds: { technical: 48, deep_dive: 24, scenario: 16, behavioral: 12 } },
    { role: "Web 前端", total: 100, kinds: { technical: 48, deep_dive: 24, scenario: 16, behavioral: 12 } },
  ],
  total: 200,
}

const QUESTIONS: BankQuestion[] = [
  {
    id: "bkq_fc198829470d",
    role: "Java 后端",
    kind: "technical",
    difficulty: "hard",
    prompt: "订单表按 user_id 哈希分成 8 库 64 表，C 端查询正常。现在运营后台要按「create_time 区间 + status + merchant_id」分页查询全量订单，不能做 64 分片广播扫描。请给出可落地的方案，并说明异构数据的一致性如何保证。",
    referencePoints: ["建以 merchant_id 为分片键的异构索引表做双写，或同步到 ES 承担检索","双写一致性用本地消息表或订阅 binlog（Canal）做补偿，保证最终一致","运营分页改为游标翻页，各分片并行查询后归并，避免全表扫描","明确异构表的延迟容忍度，做对账任务修复不一致数据"],
    knowledgeRefs: ["MySQL 分库分表与分片键 · 分片键选择"],
    source: "seed_model",
    createdAt: "2026-10-09T16:15:52.088848+08:00",
  },
  {
    id: "bkq_f2004af091c6",
    role: "Java 后端",
    kind: "deep_dive",
    difficulty: "hard",
    prompt: "订单已按user_id % 4分成4个库，现在数据量上涨要扩到8个库。请说明如何做到不停机扩容，并解释为什么不能直接把取模规则从%4改成%8。",
    referencePoints: ["%4改%8会导致约50%数据需搬迁","成倍扩容：4库各拆一半，只搬一半数据","预分片8库先映射到4库，扩容只改路由映射","用路由表/一致性哈希替代取模，配合双写迁移"],
    knowledgeRefs: ["MySQL 分库分表与分片键 · 分片键选择"],
    source: "seed_model",
    createdAt: "2026-10-09T16:16:38.251422+08:00",
  },
  {
    id: "bkq_da847321f327",
    role: "Java 后端",
    kind: "scenario",
    difficulty: "hard",
    prompt: "大促零点，Spring Cloud Gateway 集群 20 个实例，某秒杀接口 QPS 从 500 突增到 8000。你准备在网关层做限流，请说明你会选 Sentinel 单机均摊限流还是集群流控，集群流控的 Token Server 如何避免单点与自身瓶颈，阈值按什么口径设定。",
    referencePoints: ["单机均摊阈值=集群总阈值/实例数，要求实例数稳定","集群流控 Token Server 需高可用，失败可降级为单机模式","阈值按全链路压测容量与下游 MySQL/Redis 承载量反推","突发流量用预热或匀速排队模式，避免冷启动被打穿"],
    knowledgeRefs: ["Spring Cloud Gateway 限流与灰度路由 · 与 Sentinel 的分工"],
    source: "seed_model",
    createdAt: "2026-10-09T16:17:37.020024+08:00",
  },
]

// 题干全文 -> 该题干在 /kb/search 的真实首条命中（limit=1）。
const KB_HITS: Record<string, { chunkId: string; documentId: string; documentTitle: string; heading: string | null; source: string; content: string; summary: string; score: number; rank: number }> = {
  "订单表按 user_id 哈希分成 8 库 64 表，C 端查询正常。现在运营后台要按「create_time 区间 + status + merchant_id」分页查询全量订单，不能做 64 分片广播扫描。请给出可落地的方案，并说明异构数据的一致性如何保证。": {
    chunkId: "kbc_283e7fb93f61",
    documentId: "kbd_241e2c7425c5",
    documentTitle: "MySQL 分库分表与分片键",
    heading: "分片键选择",
    source: "MySQL 分库分表与分片键 · 分片键选择",
    content: "分片键要满足三个条件：查询命中率最高、数据分布均匀、尽量少跨片。订单场景里 C 端按 user_id 查、商家按 merchant_id 查、客服按 order_id 查，三者天然冲突，只能选一个主分片键，其余用「基因法」把次要键的片段冗余进主键，或建异构索引表（用 canal 订阅 binlog 写一份按 merchant_id 分片的查询表）。取模分片简单但扩容要全量迁移；一致性哈希、Range、预分片（一开始就分够 1024 片，物理上先合并）能缓解扩容；双倍扩容加双写迁移是常见落地路径。",
    summary: "分片键要满足三个条件：查询命中率最高、数据分布均匀、尽量少跨片。订单场景里 C 端按 user_id 查、商家按 merchant_id 查、客服按 order_id 查，三者天然冲突，只能选一个主分片键，其余用「基因法」把次要键的片段冗余…",
    score: 43.87314,
    rank: 1,
  },
  "订单已按user_id % 4分成4个库，现在数据量上涨要扩到8个库。请说明如何做到不停机扩容，并解释为什么不能直接把取模规则从%4改成%8。": {
    chunkId: "kbc_283e7fb93f61",
    documentId: "kbd_241e2c7425c5",
    documentTitle: "MySQL 分库分表与分片键",
    heading: "分片键选择",
    source: "MySQL 分库分表与分片键 · 分片键选择",
    content: "分片键要满足三个条件：查询命中率最高、数据分布均匀、尽量少跨片。订单场景里 C 端按 user_id 查、商家按 merchant_id 查、客服按 order_id 查，三者天然冲突，只能选一个主分片键，其余用「基因法」把次要键的片段冗余进主键，或建异构索引表（用 canal 订阅 binlog 写一份按 merchant_id 分片的查询表）。取模分片简单但扩容要全量迁移；一致性哈希、Range、预分片（一开始就分够 1024 片，物理上先合并）能缓解扩容；双倍扩容加双写迁移是常见落地路径。",
    summary: "分片键要满足三个条件：查询命中率最高、数据分布均匀、尽量少跨片。订单场景里 C 端按 user_id 查、商家按 merchant_id 查、客服按 order_id 查，三者天然冲突，只能选一个主分片键，其余用「基因法」把次要键的片段冗余…",
    score: 19.270382,
    rank: 1,
  },
  "大促零点，Spring Cloud Gateway 集群 20 个实例，某秒杀接口 QPS 从 500 突增到 8000。你准备在网关层做限流，请说明你会选 Sentinel 单机均摊限流还是集群流控，集群流控的 Token Server 如何避免单点与自身瓶颈，阈值按什么口径设定。": {
    chunkId: "kbc_9dedfcfb971c",
    documentId: "kbd_37f96954d1c6",
    documentTitle: "Spring Cloud Gateway 限流与灰度路由",
    heading: "与 Sentinel 的分工",
    source: "Spring Cloud Gateway 限流与灰度路由 · 与 Sentinel 的分工",
    content: "网关做入口的粗粒度限流，服务内部用 Sentinel 做细粒度保护。Sentinel 的流控模式有直接、关联、链路，流控效果有快速失败、Warm Up（冷启动预热）、排队等待；熔断降级按慢调用比例、异常比例或异常数触发，配合最小请求数、统计时长、熔断时长与半开探测。阈值不能拍脑袋，要基于压测得到的容量水位，并按集群实例数换算单机阈值。热点参数限流用于挡住某个商品或用户 ID 的突发流量。",
    summary: "网关做入口的粗粒度限流，服务内部用 Sentinel 做细粒度保护。Sentinel 的流控模式有直接、关联、链路，流控效果有快速失败、Warm Up（冷启动预热）、排队等待；熔断降级按慢调用比例、异常比例或异常数触发，配合最小请求数、统计…",
    score: 30.086237,
    rank: 1,
  },
}

function applyBankHandlers() {
  worker.resetHandlers()
  worker.use(
    http.get("/api/bank/stats", () => HttpResponse.json(STATS)),
    http.get("/api/bank/questions", () => HttpResponse.json(QUESTIONS, { headers: { "X-Total-Count": "100" } })),
    http.get("/api/kb/search", ({ request }) => {
      const query = new URL(request.url).searchParams.get("q") ?? ""
      const hit = KB_HITS[query]
      if (!hit) {
        return HttpResponse.json({ query, role: "Java 后端", status: "no_match", total: 0, results: [] })
      }
      return HttpResponse.json({ query, role: "Java 后端", status: "matched", total: 1, results: [hit] })
    }),
  )
}

export default { title: "Interview/Bank" }

export const JavaBackend = {
  render: () => {
    applyBankHandlers()
    return (
      <Screen path="/interview/bank" routePath="/interview/bank">
        <BankScreen />
      </Screen>
    )
  },
}

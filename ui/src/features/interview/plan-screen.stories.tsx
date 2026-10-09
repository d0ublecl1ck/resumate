// Storybook 确认屏：练习计划与复测。
// 数据抓取自 2026-10-09 的真实接口（backend http://127.0.0.1:8000），命令：
//   curl -b cookies.txt "http://127.0.0.1:8000/interview/sessions"
//   curl -b cookies.txt "http://127.0.0.1:8000/interview/sessions/ivs_8ed9d0cfe39a/report"
//   curl -b cookies.txt "http://127.0.0.1:8000/interview/practice-items"
// 场次、报告与两条练习项（pti_4e669c065867 / pti_3209dd5d5727）都是接口原值。

import { http, HttpResponse } from "msw"
import type { InterviewReportView, InterviewSessionSummary, PracticeItem } from "@/lib/interview"
import { worker } from "@/mocks/browser"
import { Screen } from "@/storybook/screen"
import { PlanScreen } from "./plan-screen"

const SESSION: InterviewSessionSummary = {
  "id": "ivs_8ed9d0cfe39a",
  "status": "completed",
  "role": "Java 后端",
  "rubricVersion": "interview-rubric-v1",
  "questionCount": 5,
  "answeredCount": 4,
  "questionKinds": {
    "technical": 3,
    "situational": 1
  },
  "resumeTitle": "资深后端工程师（真实跑场）",
  "hasReport": true,
  "dimensionScores": [
    {
      "dimension": "correctness",
      "score": 80,
      "evidence": [
        "我们当时用的是 buyer_id 做分片键，因为买家维度的查询是最主要的，同一买家的订单都落在一个分片里，能避免跨库。跨分片查询我们用 ES 建了异构索引，列表页和商家后台都走 ES。",
        "分布式事务用的是本地消息表加定时任务补偿，保证最终一致。",
        "全局唯一 ID 用雪花算法，订单号里带分片信息，方便定位。"
      ]
    },
    {
      "dimension": "depth",
      "score": 75,
      "evidence": [
        "阈值是压测出来的，按容量的百分之七八十设置。",
        "熔断用错误率和慢调用比例触发，触发后走降级，比如订单创建改成异步下单，先返回受理成功，后面慢慢处理。",
        "缓存击穿用互斥锁，只有一个请求去回源，其他的等结果。"
      ]
    },
    {
      "dimension": "rigor",
      "score": 70,
      "evidence": [
        "整体上这套方案能撑住，分片键选对是最关键的。",
        "另外我们做了监控告警，QPS 和错误率都有大盘，出问题能第一时间看到。",
        "这样一套下来，查询性能提升比较明显，热点商品基本都命中缓存。"
      ]
    },
    {
      "dimension": "fit",
      "score": 86,
      "evidence": [
        "我们做的是分层限流。网关层做全局限流，用令牌桶算法，防止外部流量打爆整个集群；应用层在订单创建接口上用滑动窗口，按接口维度限流；依赖层对下游服务用线程池隔离，避免一个慢依赖拖垮整个应用。",
        "消费端要保证幂等，重复消息不能重复扣库存，处理不了的进死信队列再人工补偿，订单状态以数据库为准做对账修复。",
        "遇到这种情况我第一步先止损。先看积压量多大、消费速率多少、分区是不是倾斜，再确认消费者有没有异常。"
      ]
    }
  ],
  "averageScore": 78,
  "createdAt": "2026-10-09T15:53:44.196698+08:00",
  "completedAt": "2026-10-09T15:54:25.186794+08:00"
}

const REPORT: InterviewReportView = {
  "id": "ivr_c03d98927778",
  "sessionId": "ivs_8ed9d0cfe39a",
  "rubricVersion": "interview-rubric-v1",
  "contentScores": [
    {
      "dimension": "correctness",
      "score": 80,
      "evidence": [
        "我们当时用的是 buyer_id 做分片键，因为买家维度的查询是最主要的，同一买家的订单都落在一个分片里，能避免跨库。跨分片查询我们用 ES 建了异构索引，列表页和商家后台都走 ES。",
        "分布式事务用的是本地消息表加定时任务补偿，保证最终一致。",
        "全局唯一 ID 用雪花算法，订单号里带分片信息，方便定位。"
      ]
    },
    {
      "dimension": "depth",
      "score": 75,
      "evidence": [
        "阈值是压测出来的，按容量的百分之七八十设置。",
        "熔断用错误率和慢调用比例触发，触发后走降级，比如订单创建改成异步下单，先返回受理成功，后面慢慢处理。",
        "缓存击穿用互斥锁，只有一个请求去回源，其他的等结果。"
      ]
    },
    {
      "dimension": "rigor",
      "score": 70,
      "evidence": [
        "整体上这套方案能撑住，分片键选对是最关键的。",
        "另外我们做了监控告警，QPS 和错误率都有大盘，出问题能第一时间看到。",
        "这样一套下来，查询性能提升比较明显，热点商品基本都命中缓存。"
      ]
    },
    {
      "dimension": "fit",
      "score": 86,
      "evidence": [
        "我们做的是分层限流。网关层做全局限流，用令牌桶算法，防止外部流量打爆整个集群；应用层在订单创建接口上用滑动窗口，按接口维度限流；依赖层对下游服务用线程池隔离，避免一个慢依赖拖垮整个应用。",
        "消费端要保证幂等，重复消息不能重复扣库存，处理不了的进死信队列再人工补偿，订单状态以数据库为准做对账修复。",
        "遇到这种情况我第一步先止损。先看积压量多大、消费速率多少、分区是不是倾斜，再确认消费者有没有异常。"
      ]
    }
  ],
  "summary": "候选人具备订单中台、限流熔断、缓存一致性、Kafka 积压处理等一线经验，回答覆盖主要方案路径，表达清晰；但对关键取舍、边界条件和兜底细节展开不足，部分结论偏口号化。",
  "highlights": [
    "技术栈与岗位高度匹配，订单中台、限流熔断、缓存、消息积压经验对口",
    "能分层次回答限流、缓存、故障处理等核心问题",
    "有生产实践意识，提到压测阈值、监控告警、对账修复、自动扩容"
  ],
  "gaps": [
    "分片键选择未讨论卖家/订单号等查询维度和热点买家问题",
    "扩容方案未说明双写一致性、回滚和迁移校验细节",
    "限流阈值评估、熔断半开、隔离参数不具体",
    "缓存一致性未讨论延迟双删/binlog，热点 key 副本一致性未提",
    "故障处理缺少团队组织和 owner 分工"
  ],
  "suggestions": [
    "补充分片键基因法和全局索引设计，说明如何覆盖多查询维度",
    "扩容说明虚拟槽位/双写开关/回滚方案，并给出迁移校验指标",
    "限流熔断给出具体算法参数、半开恢复策略和隔离配置",
    "缓存一致性补充 binlog 订阅、可靠 MQ 投递和延迟双删等取舍",
    "故障复盘明确角色分工、演练机制和跨团队同步流程"
  ],
  "createdAt": "2026-10-09T15:54:25.186794+08:00"
}

const ITEM_RIGOR: PracticeItem = {
  "id": "pti_4e669c065867",
  "role": "Java 后端",
  "dimension": "rigor",
  "goal": "补充分片键基因法和全局索引设计，说明如何覆盖多查询维度",
  "material": "分片键选择未讨论卖家/订单号等查询维度和热点买家问题",
  "status": "active",
  "sourceReportId": "ivr_c03d98927778",
  "sourceSessionId": "ivs_8ed9d0cfe39a",
  "rubricVersion": "interview-rubric-v1",
  "retestSessionId": null,
  "createdAt": "2026-10-09T16:44:18.599821+08:00",
  "updatedAt": "2026-10-09T16:44:18.599821+08:00"
}

const ITEM_DEPTH: PracticeItem = {
  "id": "pti_3209dd5d5727",
  "role": "Java 后端",
  "dimension": "depth",
  "goal": "扩容说明虚拟槽位/双写开关/回滚方案，并给出迁移校验指标",
  "material": "扩容方案未说明双写一致性、回滚和迁移校验细节",
  "status": "active",
  "sourceReportId": "ivr_c03d98927778",
  "sourceSessionId": "ivs_8ed9d0cfe39a",
  "rubricVersion": "interview-rubric-v1",
  "retestSessionId": null,
  "createdAt": "2026-10-09T16:44:18.599821+08:00",
  "updatedAt": "2026-10-09T16:44:18.599821+08:00"
}

// 状态示意：更早评估留下的练习项。当前真实库里两条练习项都来自 ivr_c03d98927778，
// 这一条只为展示「更早评估的练习项」分组，来源场次用真实存在的最早一场。
const EARLIER_ITEM: PracticeItem = {
  ...ITEM_RIGOR,
  id: "pti_earlier_demo",
  goal: "补充缓存一致性与故障兜底的取舍说明",
  material: "回答停留在方案罗列，没有说明边界条件与回滚路径",
  sourceReportId: "ivr_earlier_demo",
  sourceSessionId: "ivs_c8a570dfae6a",
  createdAt: "2026-09-20T09:35:00+08:00",
  updatedAt: "2026-09-20T09:35:00+08:00",
}

export default { title: "Interview/Plan" }

export const Default = {
  render: () => {
    worker.resetHandlers()
    worker.use(
      http.get("/api/interview/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/interview/sessions/:id/report", () => HttpResponse.json(REPORT)),
      http.get("/api/interview/practice-items", () => HttpResponse.json([ITEM_RIGOR, ITEM_DEPTH])),
    )
    return (
      <Screen path="/interview/plan" routePath="/interview/plan">
        <PlanScreen />
      </Screen>
    )
  },
}

export const WithEarlierItems = {
  render: () => {
    worker.resetHandlers()
    worker.use(
      http.get("/api/interview/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/interview/sessions/:id/report", () => HttpResponse.json(REPORT)),
      http.get("/api/interview/practice-items", () => HttpResponse.json([ITEM_RIGOR, ITEM_DEPTH, EARLIER_ITEM])),
    )
    return (
      <Screen path="/interview/plan" routePath="/interview/plan">
        <PlanScreen />
      </Screen>
    )
  },
}

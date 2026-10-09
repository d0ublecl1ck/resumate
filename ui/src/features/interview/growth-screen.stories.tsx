// Storybook 确认屏：练习计划与成长曲线。数据形状抄自真实 GET /interview/growth
// 与 GET /interview/practice-items（Java 后端 · interview-rubric-v1，真实四场 81/78/88/89）。
import { http, HttpResponse } from "msw"
import type { InterviewGrowth, PracticeItem } from "@/lib/interview"
import { worker } from "@/mocks/browser"
import { Screen } from "@/storybook/screen"
import { GrowthScreen } from "./growth-screen"

const CALIBER = { key: "Java 后端|interview-rubric-v1", role: "Java 后端", rubricVersion: "interview-rubric-v1", sessionCount: 4 }

const GROWTH: InterviewGrowth = {
  role: null,
  primaryCaliberKey: CALIBER.key,
  totalSessions: 4,
  calibers: [CALIBER],
  series: [
    {
      caliber: CALIBER,
      averages: { correctness: 85.5, depth: 81.25, rigor: 80, fit: 88, overall: 84 },
      points: [
        { sessionId: "ivs_c8a570dfae6a", role: "Java 后端", rubricVersion: "interview-rubric-v1", correctness: 82, depth: 75, rigor: 77, fit: 88, average: 81, createdAt: "2026-10-09T15:40:44.861565+08:00" },
        { sessionId: "ivs_8ed9d0cfe39a", role: "Java 后端", rubricVersion: "interview-rubric-v1", correctness: 80, depth: 75, rigor: 70, fit: 86, average: 78, createdAt: "2026-10-09T15:53:44.196698+08:00" },
        { sessionId: "ivs_fbd85adbe536", role: "Java 后端", rubricVersion: "interview-rubric-v1", correctness: 90, depth: 87, rigor: 86, fit: 88, average: 88, createdAt: "2026-10-09T15:56:15.987277+08:00" },
        { sessionId: "ivs_5d13d06cd4d7", role: "Java 后端", rubricVersion: "interview-rubric-v1", correctness: 90, depth: 88, rigor: 87, fit: 90, average: 89, createdAt: "2026-10-09T15:59:03.218966+08:00" },
      ],
    },
  ],
}

const ITEMS: PracticeItem[] = [
  {
    id: "pti_1",
    role: "Java 后端",
    dimension: "depth",
    goal: "补充分片键基因法与全局 ID 方案的推导过程",
    material: "原理深度不足",
    status: "active",
    sourceReportId: "ivr_1",
    sourceSessionId: "ivs_8ed9d0cfe39a",
    rubricVersion: "interview-rubric-v1",
    retestSessionId: null,
    createdAt: "2026-10-05T09:00:00+08:00",
    updatedAt: "2026-10-05T09:00:00+08:00",
  },
]

export default { title: "Interview/Growth" }

export const Default = {
  render: () => {
    worker.resetHandlers()
    worker.use(
      http.get("/api/interview/growth", () => HttpResponse.json(GROWTH)),
      http.get("/api/interview/practice-items", () => HttpResponse.json(ITEMS)),
    )
    return (
      <Screen path="/interview/growth" routePath="/interview/growth" width="fluid">
        <GrowthScreen />
      </Screen>
    )
  },
}

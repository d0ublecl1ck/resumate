// Storybook 确认屏：创建面试。数据形状抄自真实 /resumes、/resumes/{id}/versions、/jds 与 /interview/insights。
import { http, HttpResponse } from "msw"
import { worker } from "@/mocks/browser"
import { Screen } from "@/storybook/screen"
import { SetupScreen } from "./setup-screen"

const RESUME = {
  id: "res_1",
  title: "后端工程师简历",
  targetRole: "Java 后端",
  tags: ["后端"],
  templateId: "tpl_modern",
  templateVersion: 1,
  currentVersionId: "ver_1",
  lifecycle: "active",
  saveState: "committed",
  updatedAt: "2026-10-05T09:00:00+08:00",
  boundByJdIds: [],
  document: {},
  versions: [],
}

const VERSION = {
  id: "ver_1",
  source: "manual",
  actorId: "user_admin",
  startedAt: "2026-10-05T09:00:00+08:00",
  committedAt: "2026-10-05T09:00:00+08:00",
  message: "定向版",
  changeCount: 3,
  affectedSections: ["skills"],
}

const JD = {
  id: "jd_1",
  ownerId: "user_admin",
  role: "Java 后端工程师",
  company: "星澜科技",
  body: "负责订单中台核心服务的设计与开发，要求熟悉 Java 17、Spring Cloud、MySQL 分库分表与缓存一致性。",
  tags: ["后端"],
  revision: 1,
  createdAt: "2026-10-05T09:00:00+08:00",
  updatedAt: "2026-10-05T09:00:00+08:00",
}

const INSIGHTS = {
  resumeVersionId: VERSION.id,
  jdId: JD.id,
  matchPoints: ["简历中的订单中台项目与 JD 的分布式交易职责一致", "有高并发限流降级经验，对应 JD 的稳定性要求"],
  riskPoints: ["JD 要求 Kafka 实战经验，简历只体现为了解", "缺少 JD 强调的多活容灾落地案例"],
  scopeKeywords: ["Java 17", "Spring Cloud", "分库分表", "高并发与稳定性"],
}

export default { title: "Interview/Setup" }

export const Default = {
  render: () => {
    worker.resetHandlers()
    worker.use(
      http.get("/api/resumes", () => HttpResponse.json([RESUME])),
      http.get("/api/resumes/:id/versions", () => HttpResponse.json([VERSION])),
      http.get("/api/jds", () => HttpResponse.json([JD])),
      http.get("/api/interview/insights", () => HttpResponse.json(INSIGHTS)),
    )
    return (
      <Screen path="/interview/setup" routePath="/interview/setup">
        <SetupScreen />
      </Screen>
    )
  },
}

// Storybook 确认屏：面试历史与口径比较。数据形状抄自真实 /interview/sessions 与 /interview/comparison。
import { http, HttpResponse } from "msw"
import type { InterviewComparison, InterviewReportScore, InterviewSessionSummary } from "@/lib/interview"
import { worker } from "@/mocks/browser"
import { Screen } from "@/storybook/screen"
import { HistoryScreen } from "./history-screen"

const SCORES_A: InterviewReportScore[] = [
  { dimension: "correctness", score: 80, evidence: [] },
  { dimension: "depth", score: 75, evidence: [] },
  { dimension: "rigor", score: 70, evidence: [] },
  { dimension: "fit", score: 86, evidence: [] },
]
const SCORES_B: InterviewReportScore[] = [
  { dimension: "correctness", score: 90, evidence: [] },
  { dimension: "depth", score: 88, evidence: [] },
  { dimension: "rigor", score: 87, evidence: [] },
  { dimension: "fit", score: 90, evidence: [] },
]

function summary(overrides: Partial<InterviewSessionSummary>): InterviewSessionSummary {
  return {
    id: "ivs_1",
    status: "completed",
    role: "Java 后端",
    rubricVersion: "interview-rubric-v1",
    questionCount: 4,
    answeredCount: 4,
    questionKinds: { technical: 2, behavioral: 1, situational: 1 },
    resumeTitle: "后端工程师简历",
    hasReport: true,
    dimensionScores: SCORES_A,
    averageScore: 78,
    createdAt: "2026-10-01T09:00:00+08:00",
    completedAt: "2026-10-01T09:30:00+08:00",
    ...overrides,
  }
}

const SESSIONS: InterviewSessionSummary[] = [
  summary({ id: "ivs_8ed9d0cfe39a", dimensionScores: SCORES_A, averageScore: 78, createdAt: "2026-10-01T09:00:00+08:00", completedAt: "2026-10-01T09:30:00+08:00" }),
  summary({ id: "ivs_fbd85adbe536", dimensionScores: SCORES_B, averageScore: 88, createdAt: "2026-10-03T09:00:00+08:00", completedAt: "2026-10-03T09:30:00+08:00" }),
  summary({ id: "ivs_5d13d06cd4d7", dimensionScores: SCORES_B, averageScore: 89, createdAt: "2026-10-05T09:00:00+08:00", completedAt: "2026-10-05T09:30:00+08:00" }),
]

const COMPARISON: InterviewComparison = {
  a: { id: "ivs_8ed9d0cfe39a", role: "Java 后端", rubricVersion: "interview-rubric-v1", average: 78, scores: SCORES_A, questionCount: 4, answeredCount: 4, createdAt: "2026-10-01T09:00:00+08:00" },
  b: { id: "ivs_5d13d06cd4d7", role: "Java 后端", rubricVersion: "interview-rubric-v1", average: 89, scores: SCORES_B, questionCount: 4, answeredCount: 4, createdAt: "2026-10-05T09:00:00+08:00" },
  connectable: true,
  sameRole: true,
  sameRubricVersion: true,
  reason: "SAME_CALIBER",
}

export default { title: "Interview/History" }

export const SameCaliber = {
  render: () => {
    worker.resetHandlers()
    worker.use(
      http.get("/api/interview/sessions", () => HttpResponse.json(SESSIONS)),
      http.get("/api/interview/comparison", () => HttpResponse.json(COMPARISON)),
    )
    return (
      <Screen path="/interview/history" routePath="/interview/history" width="fluid">
        <HistoryScreen />
      </Screen>
    )
  },
}

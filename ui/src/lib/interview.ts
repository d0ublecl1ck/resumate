// 模拟面试工作流的 REST 客户端（C-14）。
// 六个函数严格对应后端冻结契约 /interview；字段名与后端 camelCase 一致，不做本地改名。
import { request, requestTextWithResponse } from "@/lib/api-client"

// deep_dive / scenario 为四类出题题型；situational 是 scenario 的历史别名，
// 旧场次数据仍以 situational 落库，读取端两者都要能展示。
export type InterviewQuestionKind = "technical" | "deep_dive" | "scenario" | "behavioral" | "situational" | "follow_up"
export type InterviewQuestionDifficulty = "easy" | "medium" | "hard"

export interface InterviewAnswerView {
  id: string
  questionId: string
  content: string
  createdAt: string
}

export interface InterviewQuestionView {
  id: string
  ordinal: number
  kind: InterviewQuestionKind
  prompt: string
  referencePoints: string[]
  /** 生成时指定的难度；历史题与不限难度为 null/缺省。 */
  difficulty?: InterviewQuestionDifficulty | null
  /** 知识库检索命中的出处（与题库同构）；未命中为空数组。 */
  knowledgeRefs?: string[]
  parentQuestionId: string | null
  answer: InterviewAnswerView | null
}

export type InterviewReportDimension = "correctness" | "depth" | "rigor" | "fit"

export interface InterviewReportScore {
  dimension: InterviewReportDimension
  score: number | null
  evidence: string[]
}

export interface InterviewReportView {
  id: string
  sessionId: string
  rubricVersion: string
  contentScores: InterviewReportScore[]
  summary: string
  highlights: string[]
  gaps: string[]
  suggestions: string[]
  createdAt: string
}

export interface InterviewContextSnapshot {
  role: string
  resumeTitle: string
  resumeVersionId: string
  jdRole: string
  jdCompany: string | null
  jdBody: string
}

export type InterviewSessionStatus = "active" | "completed"

/** 会话冻结的出题筛选；kinds 为空表示不限，difficulty 为 null 表示不限。 */
export interface InterviewGenerationFilters {
  difficulty: InterviewQuestionDifficulty | null
  kinds: InterviewQuestionKind[]
}

export interface InterviewSessionDetail {
  id: string
  status: InterviewSessionStatus
  role: string
  resumeId: string
  resumeVersionId: string
  jdId: string
  rubricVersion: string
  contextSnapshot: InterviewContextSnapshot
  filters?: InterviewGenerationFilters | null
  questions: InterviewQuestionView[]
  report: InterviewReportView | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface InterviewSessionSummary {
  id: string
  status: InterviewSessionStatus
  role: string
  rubricVersion: string
  questionCount: number
  answeredCount: number
  questionKinds: Record<string, number>
  resumeTitle: string
  hasReport: boolean
  dimensionScores: InterviewReportScore[]
  averageScore: number | null
  createdAt: string
  completedAt: string | null
}

export interface CreateInterviewSessionInput {
  resumeVersionId: string
  jdId: string
  role: string
  questionCount?: number
  /** 可选筛选：不传 = 不限，保持既有行为。 */
  difficulty?: InterviewQuestionDifficulty
  kinds?: InterviewQuestionKind[]
}

export interface RegenerateInterviewSessionInput {
  /** 可选筛选：不传 = 沿用会话已冻结的筛选。 */
  difficulty?: InterviewQuestionDifficulty
  kinds?: InterviewQuestionKind[]
}

export interface SubmitInterviewAnswerInput {
  questionId: string
  content: string
  idempotencyKey: string
}

export interface SubmitInterviewAnswerResult {
  answer: InterviewAnswerView
  followUpQuestion: InterviewQuestionView | null
}

/** POST /interview/sessions */
export function createInterviewSession(input: CreateInterviewSessionInput): Promise<InterviewSessionDetail> {
  return request<InterviewSessionDetail>("/interview/sessions", { method: "POST", body: JSON.stringify(input) })
}

/** GET /interview/sessions */
export function listInterviewSessions(): Promise<InterviewSessionSummary[]> {
  return request<InterviewSessionSummary[]>("/interview/sessions")
}

/** GET /interview/sessions/{id} */
export function getInterviewSession(id: string): Promise<InterviewSessionDetail> {
  return request<InterviewSessionDetail>(`/interview/sessions/${id}`)
}

/** POST /interview/sessions/{id}/answers */
export function submitInterviewAnswer(sessionId: string, input: SubmitInterviewAnswerInput): Promise<SubmitInterviewAnswerResult> {
  return request<SubmitInterviewAnswerResult>(`/interview/sessions/${sessionId}/answers`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

/** POST /interview/sessions/{id}/finish */
export function finishInterviewSession(id: string): Promise<InterviewReportView> {
  return request<InterviewReportView>(`/interview/sessions/${id}/finish`, { method: "POST" })
}

/** GET /interview/sessions/{id}/report */
export function getInterviewReport(id: string): Promise<InterviewReportView> {
  return request<InterviewReportView>(`/interview/sessions/${id}/report`)
}

/**
 * GET /interview/sessions/{id}/report/export?format=markdown —— 服务端把真实报告渲染成 Markdown 附件。
 * 返回纯文本正文；调用方负责触发下载并按机器错误码映射失败文案。
 */
export async function exportInterviewReportMarkdown(sessionId: string): Promise<string> {
  const { text } = await requestTextWithResponse(
    `/interview/sessions/${sessionId}/report/export?format=markdown`,
  )
  return text
}
// --------------------------------------------------------------------------- //
// 数据聚合：成长曲线 / 口径比较 / 练习项 / 重新生成 / 准备洞察
// --------------------------------------------------------------------------- //

export interface InterviewGrowthPoint {
  sessionId: string
  role: string
  rubricVersion: string
  correctness: number | null
  depth: number | null
  rigor: number | null
  fit: number | null
  average: number | null
  createdAt: string
}

export interface InterviewCaliber {
  key: string
  role: string
  rubricVersion: string
  sessionCount: number
}

export interface InterviewDimensionAverages {
  correctness: number | null
  depth: number | null
  rigor: number | null
  fit: number | null
  overall: number | null
}

export interface InterviewGrowthSeries {
  caliber: InterviewCaliber
  points: InterviewGrowthPoint[]
  averages: InterviewDimensionAverages
}

export interface InterviewGrowth {
  role: string | null
  primaryCaliberKey: string | null
  calibers: InterviewCaliber[]
  series: InterviewGrowthSeries[]
  totalSessions: number
}

export type InterviewCaliberReason =
  | "SAME_CALIBER"
  | "ROLE_MISMATCH"
  | "RUBRIC_VERSION_MISMATCH"
  | "ROLE_AND_RUBRIC_MISMATCH"

export interface InterviewComparisonSession {
  id: string
  role: string
  rubricVersion: string
  average: number | null
  scores: InterviewReportScore[]
  questionCount: number
  answeredCount: number
  createdAt: string
}

export interface InterviewComparison {
  a: InterviewComparisonSession
  b: InterviewComparisonSession
  connectable: boolean
  sameRole: boolean
  sameRubricVersion: boolean
  reason: InterviewCaliberReason
}

export type PracticeItemStatus = "active" | "done"

export interface PracticeItem {
  id: string
  role: string
  dimension: InterviewReportDimension
  goal: string
  material: string
  status: PracticeItemStatus
  sourceReportId: string
  sourceSessionId: string
  rubricVersion: string
  retestSessionId: string | null
  createdAt: string
  updatedAt: string
}

export interface PracticeItemRetest {
  item: PracticeItem
  session: InterviewSessionDetail
}

export interface InterviewInsights {
  resumeVersionId: string
  jdId: string
  matchPoints: string[]
  riskPoints: string[]
  scopeKeywords: string[]
}

/** GET /interview/growth —— 按 role + rubricVersion 聚合真实场次的四维分数序列与平均值。 */
export function getInterviewGrowth(role?: string): Promise<InterviewGrowth> {
  const query = role ? "?role=" + encodeURIComponent(role) : ""
  return request<InterviewGrowth>("/interview/growth" + query)
}

/** GET /interview/comparison —— 两次场次的口径校验；不同口径返回 connectable=false 与原因码。 */
export function getInterviewComparison(a: string, b: string): Promise<InterviewComparison> {
  return request<InterviewComparison>(
    "/interview/comparison?a=" + encodeURIComponent(a) + "&b=" + encodeURIComponent(b),
  )
}

/** GET /interview/practice-items */
export function listPracticeItems(role?: string): Promise<PracticeItem[]> {
  const query = role ? "?role=" + encodeURIComponent(role) : ""
  return request<PracticeItem[]>("/interview/practice-items" + query)
}

/** POST /interview/practice-items —— 把报告的 suggestions 落成练习项；dimension 省略时落全部薄弱维度。 */
export function createPracticeItems(reportId: string, dimension?: InterviewReportDimension): Promise<PracticeItem[]> {
  return request<PracticeItem[]>("/interview/practice-items", {
    method: "POST",
    body: JSON.stringify({ reportId, dimension }),
  })
}

/** PATCH /interview/practice-items/{id} */
export function updatePracticeItem(
  id: string,
  input: { goal?: string; status?: PracticeItemStatus },
): Promise<PracticeItem> {
  return request<PracticeItem>(`/interview/practice-items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

/** DELETE /interview/practice-items/{id} */
export function deletePracticeItem(id: string): Promise<void> {
  return request<void>(`/interview/practice-items/${id}`, { method: "DELETE" })
}

/** POST /interview/practice-items/{id}/retest */
export function startPracticeRetest(id: string): Promise<PracticeItemRetest> {
  return request<PracticeItemRetest>(`/interview/practice-items/${id}/retest`, { method: "POST" })
}

/** POST /interview/sessions/{id}/regenerate —— 未作答场次重新生成题目；已作答返回 409。 */
export function regenerateInterviewSession(
  id: string,
  input: RegenerateInterviewSessionInput = {},
): Promise<InterviewSessionDetail> {
  return request<InterviewSessionDetail>(`/interview/sessions/${id}/regenerate`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

/** GET /interview/insights —— 用真实简历与 JD 内容生成匹配点 / 风险点 / 岗位范围关键词。 */
export function getInterviewInsights(resumeVersionId: string, jdId: string): Promise<InterviewInsights> {
  return request<InterviewInsights>(
    "/interview/insights?resumeVersionId=" + encodeURIComponent(resumeVersionId) + "&jdId=" + encodeURIComponent(jdId),
  )
}

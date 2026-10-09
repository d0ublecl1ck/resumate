// 模拟面试工作流的 REST 客户端（C-14）。
// 六个函数严格对应后端冻结契约 /interview；字段名与后端 camelCase 一致，不做本地改名。
import { request } from "@/lib/api-client"

export type InterviewQuestionKind = "technical" | "behavioral" | "situational" | "follow_up"

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

export interface InterviewSessionDetail {
  id: string
  status: InterviewSessionStatus
  role: string
  resumeId: string
  resumeVersionId: string
  jdId: string
  rubricVersion: string
  contextSnapshot: InterviewContextSnapshot
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
  questionCount: number
  answeredCount: number
  resumeTitle: string
  hasReport: boolean
  createdAt: string
  completedAt: string | null
}

export interface CreateInterviewSessionInput {
  resumeVersionId: string
  jdId: string
  role: string
  questionCount?: number
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

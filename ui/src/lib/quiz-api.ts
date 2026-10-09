// 岗位笔试 REST 客户端（issue 40db8）。
// 四个函数严格对应后端 /quiz 契约；字段名与后端 camelCase 一致，不做本地改名。
// 代码题只提交文本给后端做静态评审，前端不做任何代码执行。
import { request } from "@/lib/api-client"

export type QuizGroup = "objective" | "open" | "code"
export type QuizQuestionKind = "single_choice" | "multiple_choice" | "true_false" | "open" | "code"
export type QuizAttemptStatus = "in_progress" | "submitted"
export type QuizVerdict = "correct" | "partial" | "incorrect" | "graded"

export interface QuizOption {
  id: string
  text: string
}

export interface QuizSource {
  kind: "seed" | "bank"
  label: string
  version: string
}

export interface QuizQuestion {
  id: string
  group: QuizGroup
  kind: QuizQuestionKind
  ordinal: number
  points: number
  prompt: string
  options: QuizOption[]
  referencePoints: string[]
  referenceAnswer: string
  starterCode: string
  source: QuizSource
}

export interface QuizDimensionScore {
  dimension: string
  score: number | null
  evidence: string[]
}

export interface QuizOptionAnalysis {
  optionId: string
  correct: boolean
  chosen: boolean
  explanation: string
}

export interface QuizFeedback {
  policy?: string
  optionAnalysis?: QuizOptionAnalysis[]
  dimensions?: QuizDimensionScore[]
  summary?: string
  highlights?: string[]
  gaps?: string[]
  suggestions?: string[]
  issues?: string[]
  executed?: boolean
}

export interface QuizAnswer {
  id: string
  questionId: string
  questionGroup: QuizGroup
  questionKind: QuizQuestionKind
  selectedOptionIds: string[]
  textAnswer: string | null
  codeAnswer: string | null
  awardedPoints: number | null
  maxPoints: number
  verdict: QuizVerdict
  executed: boolean | null
  feedback: QuizFeedback
  createdAt: string
  gradedAt: string | null
}

export interface QuizResult {
  totalScore: number
  maxScore: number
  policy: Record<string, string>
  submittedAt: string
}

export interface QuizAttempt {
  id: string
  status: QuizAttemptStatus
  role: string
  questionTypes: QuizGroup[]
  questions: QuizQuestion[]
  answers: QuizAnswer[]
  result: QuizResult | null
  maxScore: number
  createdAt: string
  updatedAt: string
  submittedAt: string | null
}

export interface QuizAnswerResult {
  answer: QuizAnswer
}

export interface CreateQuizAttemptInput {
  role: string
  questionTypes?: QuizGroup[]
}

export interface SubmitQuizAnswerInput {
  questionId: string
  selectedOptionIds?: string[]
  textAnswer?: string
  codeAnswer?: string
  idempotencyKey?: string
}

/** POST /quiz/attempts */
export function createQuizAttempt(input: CreateQuizAttemptInput): Promise<QuizAttempt> {
  return request<QuizAttempt>("/quiz/attempts", { method: "POST", body: JSON.stringify(input) })
}

/** GET /quiz/attempts/{id} */
export function getQuizAttempt(attemptId: string): Promise<QuizAttempt> {
  return request<QuizAttempt>(`/quiz/attempts/${attemptId}`)
}

/** POST /quiz/attempts/{id}/answers */
export function submitQuizAnswer(attemptId: string, input: SubmitQuizAnswerInput): Promise<QuizAnswerResult> {
  return request<QuizAnswerResult>(`/quiz/attempts/${attemptId}/answers`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

/** POST /quiz/attempts/{id}/submit */
export function submitQuizAttempt(attemptId: string): Promise<QuizAttempt> {
  return request<QuizAttempt>(`/quiz/attempts/${attemptId}/submit`, { method: "POST" })
}

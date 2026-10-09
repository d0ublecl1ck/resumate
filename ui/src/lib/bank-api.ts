// 岗位题库数据访问（A11）：真实请求后端 /bank/stats 与 /bank/questions。
// 请求统一走 api-client，与仓库其它页面一致；列表分页总数放在 X-Total-Count 响应头。

import { request, requestWithResponse } from "@/lib/api-client"

export type BankKind = "technical" | "deep_dive" | "scenario" | "behavioral"
export type BankDifficulty = "easy" | "medium" | "hard"

export type BankQuestion = {
  id: string
  role: string
  kind: BankKind
  difficulty: BankDifficulty
  prompt: string
  referencePoints: string[]
  knowledgeRefs: string[]
  source: "seed_model" | "import"
  createdAt: string
}

export type BankRoleStats = { role: string; total: number; kinds: Record<string, number> }
export type BankStats = { roles: BankRoleStats[]; total: number }

export type BankQuestionQuery = {
  role?: string
  kind?: BankKind
  difficulty?: BankDifficulty
  q?: string
  page?: number
  size?: number
}

function buildQuery(params: BankQuestionQuery): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? "?" + query : ""
}

/** GET /bank/stats —— 每个岗位每类题的真实计数；role 省略时返回全部岗位。 */
export function getBankStats(role?: string): Promise<BankStats> {
  return request<BankStats>("/bank/stats" + buildQuery({ role }))
}

/** GET /bank/questions —— 分页题目列表，总数来自 X-Total-Count。 */
export async function listBankQuestions(
  params: BankQuestionQuery = {},
): Promise<{ items: BankQuestion[]; total: number }> {
  const { data, response } = await requestWithResponse<BankQuestion[]>("/bank/questions" + buildQuery(params))
  const header = Number(response.headers.get("X-Total-Count"))
  return { items: data, total: Number.isFinite(header) ? header : data.length }
}

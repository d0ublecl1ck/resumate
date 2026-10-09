// 知识库检索数据访问（A11 / Issue acf2f）：真实请求后端 /kb/search。
// 命中返回切片出处与分数；无命中时后端返回 status="no_match" 与空数组，
// 页面据此显示「依据不足 · 不生成引用」，绝不伪造引用。

import { request } from "@/lib/api-client"

export type KbSearchStatus = "matched" | "no_match"

export type KbSearchHit = {
  chunkId: string
  documentId: string
  documentTitle: string
  heading: string | null
  source: string
  content: string
  summary: string
  score: number
  rank: number
}

export type KbSearchResult = {
  query: string
  role: string | null
  status: KbSearchStatus
  total: number
  results: KbSearchHit[]
}

export type KbSearchQuery = {
  q: string
  role?: string
  limit?: number
}

/** GET /kb/search —— 命中返回切片与分数，未命中返回 status=no_match 与空结果。 */
export function searchKnowledgeBase({ q, role, limit }: KbSearchQuery): Promise<KbSearchResult> {
  const search = new URLSearchParams({ q })
  if (role) search.set("role", role)
  if (limit !== undefined) search.set("limit", String(limit))
  return request<KbSearchResult>("/kb/search?" + search.toString())
}

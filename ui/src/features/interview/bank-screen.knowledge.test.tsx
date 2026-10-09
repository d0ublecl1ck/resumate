// 检索面板：按题干调真实 GET /kb/search —— 命中给出处与摘要，未命中的题目显示「依据不足」。
// 检索输入必须是题干本身，题目已回填的 knowledgeRefs 只做列表行静态展示。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import { BankScreen } from "@/features/interview/bank-screen"
import type { BankQuestion, BankStats } from "@/lib/bank-api"
import { server } from "@/test-server"

afterEach(cleanup)

const STATS: BankStats = {
  roles: [{ role: "Java 后端", total: 2, kinds: { technical: 2 } }],
  total: 2,
}

const QUESTIONS: BankQuestion[] = [
  {
    id: "bkq_kb_hit",
    role: "Java 后端",
    kind: "technical",
    difficulty: "medium",
    prompt: "Spring 事务在哪些情况下会失效？",
    referencePoints: [],
    knowledgeRefs: ["事务失效的场景清单"],
    source: "seed_model",
    createdAt: "2026-10-09T08:00:00+08:00",
  },
  {
    id: "bkq_kb_miss",
    role: "Java 后端",
    kind: "technical",
    difficulty: "medium",
    prompt: "线上事故复盘时如何界定责任边界？",
    referencePoints: [],
    knowledgeRefs: ["线上事故复盘 · 责任界定"],
    source: "seed_model",
    createdAt: "2026-10-09T08:00:00+08:00",
  },
]

function renderBank() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <BankScreen />
    </QueryClientProvider>,
  )
}

describe("BankScreen 知识库检索面板", () => {
  it("命中给出处与摘要，未命中显示依据不足", async () => {
    const searched: string[] = []
    server.use(
      http.get("/api/bank/stats", () => HttpResponse.json(STATS)),
      http.get("/api/bank/questions", () => HttpResponse.json(QUESTIONS, { headers: { "X-Total-Count": "2" } })),
      http.get("/api/kb/search", ({ request }) => {
        const query = new URL(request.url).searchParams.get("q") ?? ""
        searched.push(query)
        if (!query.includes("Spring 事务")) {
          return HttpResponse.json({ query, role: "Java 后端", status: "no_match", total: 0, results: [] })
        }
        return HttpResponse.json({
          query,
          role: "Java 后端",
          status: "matched",
          total: 1,
          results: [
            {
              chunkId: "kbc_1",
              documentId: "kbd_1",
              documentTitle: "Spring 事务管理",
              heading: "失效场景",
              source: "Spring 事务管理 · 失效场景",
              content: "自调用不经过代理。",
              summary: "自调用不经过代理，异常被 catch 吞掉时会失效。",
              score: 3.2,
              rank: 1,
            },
          ],
        })
      }),
    )

    renderBank()

    expect(await screen.findByText("Spring 事务管理 · 失效场景")).toBeInTheDocument()
    expect(await screen.findByText("自调用不经过代理，异常被 catch 吞掉时会失效。")).toBeInTheDocument()
    expect(await screen.findByText("依据不足 · 不生成引用")).toBeInTheDocument()
    expect(screen.getByText("知识库中没有匹配条目，本题不生成任何引用。")).toBeInTheDocument()
    // 两道题各检索一次，输入是题干本身，不是已回填的引用。
    expect([...new Set(searched)].sort()).toEqual(
      ["Spring 事务在哪些情况下会失效？", "线上事故复盘时如何界定责任边界？"].sort(),
    )
    expect(searched).not.toContain("事务失效的场景清单")
    // 已回填的引用仍在题目列表行静态展示。
    expect(screen.getByText("事务失效的场景清单")).toBeInTheDocument()
  })
})

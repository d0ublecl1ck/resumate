// 岗位题库屏：真实请求 /bank/stats、/bank/questions 与按题干实时检索的 /kb/search
//（MSW 钉住契约，无需后端）。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import { BankScreen } from "@/features/interview/bank-screen"
import type { BankQuestion, BankStats } from "@/lib/bank-api"
import { server } from "@/test-server"

afterEach(cleanup)

const STATS: BankStats = {
  roles: [
    { role: "Java 后端", total: 100, kinds: { technical: 48, deep_dive: 24, scenario: 16, behavioral: 12 } },
    { role: "Web 前端", total: 100, kinds: { technical: 48, deep_dive: 24, scenario: 16, behavioral: 12 } },
  ],
  total: 200,
}

const QUESTION: BankQuestion = {
  id: "bkq_seed_1",
  role: "Java 后端",
  kind: "technical",
  difficulty: "medium",
  prompt: "Spring 事务在哪些情况下会失效？",
  referencePoints: ["自调用不经过代理", "异常被 catch 吞掉"],
  knowledgeRefs: ["Spring 事务管理 · 失效场景"],
  source: "seed_model",
  createdAt: "2026-10-09T08:00:00+08:00",
}

const MATCHED_HIT = {
  chunkId: "kbc_test_1",
  documentId: "kbd_test",
  documentTitle: "Spring 事务管理",
  heading: "失效场景",
  source: "Spring 事务管理 · 失效场景",
  content: "自调用不经过代理、异常被 catch 吞掉、方法不是 public 时会失效。",
  summary: "自调用不经过代理时会失效。",
  score: 1.5,
  rank: 1,
}

type KbBody = {
  query: string
  role: string
  status: "matched" | "no_match"
  total: number
  results: unknown[]
}

function renderBank() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <BankScreen />
    </QueryClientProvider>,
  )
}

/** 覆盖全局 /api/kb/search 空实现，并记录每次检索用的查询词。 */
function useKbHandler(handler: (query: string) => KbBody) {
  const queries: string[] = []
  server.use(
    http.get("/api/kb/search", ({ request }) => {
      const query = new URL(request.url).searchParams.get("q") ?? ""
      queries.push(query)
      return HttpResponse.json(handler(query))
    }),
  )
  return queries
}

describe("BankScreen", () => {
  it("渲染后端返回的真实计数与题目", async () => {
    let lastKind: string | null = null
    const kbQueries = useKbHandler((query) => ({
      query,
      role: "Java 后端",
      status: "matched",
      total: 1,
      results: [MATCHED_HIT],
    }))
    server.use(
      http.get("/api/bank/stats", () => HttpResponse.json(STATS)),
      http.get("/api/bank/questions", ({ request }) => {
        lastKind = new URL(request.url).searchParams.get("kind")
        return HttpResponse.json([QUESTION], { headers: { "X-Total-Count": lastKind ? "48" : "100" } })
      }),
    )

    renderBank()

    expect(await screen.findByText("全库共 200 题")).toBeInTheDocument()
    expect(screen.getByText("Java 后端 100 题")).toBeInTheDocument()
    expect(screen.getByText("48 题")).toBeInTheDocument()
    expect(screen.getByText("24 题")).toBeInTheDocument()
    expect(screen.getByText("16 题")).toBeInTheDocument()
    expect(screen.getByText("12 题")).toBeInTheDocument()
    // 题干在题目列表与检索面板各出现一次。
    expect(await screen.findAllByText(QUESTION.prompt)).toHaveLength(2)
    // 列表行是已回填的静态依据，面板命中来自实时检索结果。
    expect(screen.getAllByText("Spring 事务管理 · 失效场景").length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText("引用命中")).toBeInTheDocument()
    expect(screen.getByText(/自调用不经过代理时会失效/)).toBeInTheDocument()
    // 检索输入必须是题干本身，而不是题目已回填的引用（否则就是自证命中）。
    expect([...new Set(kbQueries)]).toEqual([QUESTION.prompt])
    expect(kbQueries).not.toContain(QUESTION.knowledgeRefs[0])
    expect(lastKind).toBeNull()
  })

  it("点题型卡片按 kind 重新请求并显示筛选提示", async () => {
    let lastKind: string | null = null
    useKbHandler((query) => ({ query, role: "Java 后端", status: "matched", total: 1, results: [MATCHED_HIT] }))
    server.use(
      http.get("/api/bank/stats", () => HttpResponse.json(STATS)),
      http.get("/api/bank/questions", ({ request }) => {
        lastKind = new URL(request.url).searchParams.get("kind")
        return HttpResponse.json([QUESTION], { headers: { "X-Total-Count": "48" } })
      }),
    )

    renderBank()
    await screen.findAllByText(QUESTION.prompt)

    screen.getByRole("button", { name: /技术知识/ }).click()

    expect(await screen.findByText("已按「技术知识」筛选")).toBeInTheDocument()
    await waitFor(() => expect(lastKind).toBe("technical"))
  })

  it("题干实时检索无命中时标注依据不足，不用已回填引用冒充命中", async () => {
    const kbQueries = useKbHandler((query) => ({
      query,
      role: "Java 后端",
      status: "no_match",
      total: 0,
      results: [],
    }))
    server.use(
      http.get("/api/bank/stats", () => HttpResponse.json(STATS)),
      http.get("/api/bank/questions", () => HttpResponse.json([QUESTION], { headers: { "X-Total-Count": "100" } })),
    )

    renderBank()

    expect(await screen.findByText("依据不足 · 不生成引用")).toBeInTheDocument()
    expect(screen.queryByText("引用命中")).not.toBeInTheDocument()
    expect(screen.getByText(/知识库中没有匹配条目/)).toBeInTheDocument()
    // 已回填的引用只在题目列表行静态展示，不作为检索输入。
    expect(screen.getByText("Spring 事务管理 · 失效场景")).toBeInTheDocument()
    expect([...new Set(kbQueries)]).toEqual([QUESTION.prompt])
  })
})

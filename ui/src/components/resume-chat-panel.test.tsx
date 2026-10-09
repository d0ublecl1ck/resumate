// SCR-003 对话区接历史会话：列表 / 详情 / 继续对话的接线契约。
// 继续对话必须写回同一会话：先 POST /sessions/{id}/messages（seq = 现有最大 seq + 1），
// 再 POST /resumes/{id}/runs 且 body 带同一个 sessionId，绝不新建会话。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ResumeChatPanel } from "@/components/resume-chat-panel"
import i18n from "@/i18n"
import type { AgentRun } from "@/lib/types"
import { server } from "@/test-server"

class FakeEventSource {
  static instances: FakeEventSource[] = []
  readonly url: string
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>()
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const bucket = this.listeners.get(type) ?? new Set()
    bucket.add(listener)
    this.listeners.set(type, bucket)
  }
  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener)
  }
  close(): void {
    this.closed = true
  }
}

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal("EventSource", FakeEventSource)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const RUN: AgentRun = {
  id: "turn_1",
  resumeId: "res_1",
  conversationId: "sess_000000000002",
  userTurnId: "turn_1",
  executionMode: "approval",
  modeSource: "account",
  state: "running",
  budget: { usedTokens: 0, maxTokens: 0, usedTurns: 0, maxTurns: 0, costUsd: 0 },
  timeline: [],
  pendingActions: [],
}

// 列表行不再渲染会话 ID，因此用派生标题定位行（title 是展示层可选入参）。
const SESSIONS = [
  { id: "sess_000000000001", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", lastActiveAt: "2026-10-01T02:00:00Z", title: "优化项目经历措辞" },
  { id: "sess_000000000002", createdAt: "2026-09-30T00:00:00Z", updatedAt: "2026-09-30T00:00:00Z", lastActiveAt: "2026-09-30T02:00:00Z", title: "定制岗位摘要版本" },
]

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPanel(client = newClient(), run: AgentRun | null = RUN) {
  return render(
    <QueryClientProvider client={client}>
      <ResumeChatPanel resumeId="res_1" run={run} mode="approval" />
    </QueryClientProvider>,
  )
}

async function openHistory() {
  fireEvent.click(await screen.findByRole("tab", { name: i18n.t("sessionHistory.title") }))
}

describe("对话区历史会话接线", () => {
  it("历史会话列表来自 GET /sessions，且当前 run 的会话高亮", async () => {
    server.use(http.get("/api/sessions", () => HttpResponse.json(SESSIONS)))
    renderPanel()
    await openHistory()

    const current = await screen.findByRole("button", { name: /定制岗位摘要版本/ })
    expect(current).toHaveAttribute("aria-current", "true")
    const other = screen.getByRole("button", { name: /优化项目经历措辞/ })
    expect(other).not.toHaveAttribute("aria-current")
  })

  it("选中会话后渲染 GET /sessions/{id}/messages 的历史消息", async () => {
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([SESSIONS[0]])),
      http.get("/api/sessions/sess_000000000001/messages", () =>
        HttpResponse.json([
          { id: "msg_1", sessionId: "sess_000000000001", seq: 1, role: "user", content: { role: "user", content: "把项目经历改得更量化" }, createdAt: "2026-10-01T00:00:00Z" },
          { id: "msg_2", sessionId: "sess_000000000001", seq: 2, role: "assistant", content: { role: "assistant", content: "已更新第一条项目经历。" }, createdAt: "2026-10-01T00:00:00Z" },
        ]),
      ),
    )
    renderPanel(newClient(), null)
    await openHistory()
    fireEvent.click(await screen.findByRole("button", { name: /优化项目经历措辞/ }))

    expect(await screen.findByText("把项目经历改得更量化")).toBeInTheDocument()
    expect(await screen.findByText("已更新第一条项目经历。")).toBeInTheDocument()
  })

  it("继续发送写回同一会话：append 用 max(seq)+1，run 带同一 sessionId 且不新建会话", async () => {
    const appended: { seq: number; role: string; content: unknown }[] = []
    const runs: { prompt: string; executionMode?: string; sessionId?: string }[] = []
    let createdSessions = 0
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([SESSIONS[0]])),
      http.post("/api/sessions", () => {
        createdSessions += 1
        return HttpResponse.json(SESSIONS[0], { status: 201 })
      }),
      http.get("/api/sessions/sess_000000000001/messages", () =>
        HttpResponse.json([
          { id: "msg_1", sessionId: "sess_000000000001", seq: 1, role: "user", content: { role: "user", content: "把项目经历改得更量化" }, createdAt: "2026-10-01T00:00:00Z" },
          { id: "msg_9", sessionId: "sess_000000000001", seq: 9, role: "assistant", content: { role: "assistant", content: "已更新第一条项目经历。" }, createdAt: "2026-10-01T00:00:00Z" },
        ]),
      ),
      http.post("/api/sessions/sess_000000000001/messages", async ({ request }) => {
        const body = (await request.json()) as { seq: number; role: string; content: unknown }
        appended.push(body)
        return HttpResponse.json({ id: "msg_10", sessionId: "sess_000000000001", seq: body.seq, role: body.role, content: body.content, createdAt: "2026-10-01T00:00:00Z" }, { status: 201 })
      }),
      http.post("/api/resumes/res_1/runs", async ({ request }) => {
        runs.push((await request.json()) as typeof runs[number])
        return HttpResponse.json({ runId: "run_1", status: "started" }, { status: 202 })
      }),
    )

    renderPanel()
    await openHistory()
    fireEvent.click(await screen.findByRole("button", { name: /优化项目经历措辞/ }))

    const box = await screen.findByRole("textbox", { name: i18n.t("sessionHistory.continue.placeholder") })
    fireEvent.change(box, { target: { value: "再帮我加一条项目" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("sessionHistory.continue.send") }))

    await waitFor(() => expect(runs).toHaveLength(1))
    expect(appended).toHaveLength(1)
    expect(appended[0].seq).toBe(10)
    expect(appended[0].role).toBe("user")
    expect(runs[0].prompt).toBe("再帮我加一条项目")
    expect(runs[0].sessionId).toBe("sess_000000000001")
    expect(createdSessions).toBe(0)
  })
})

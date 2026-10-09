// SCR-003 对话区接历史会话：列表 / 详情 / 继续对话的接线契约。
// 继续对话必须写回同一会话：先 POST /sessions/{id}/messages（seq = 现有最大 seq + 1），
// 再 POST /resumes/{id}/runs 且 body 带同一个 sessionId，绝不新建会话。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ResumeChatPanel } from "@/components/resume-chat-panel"
import i18n from "@/i18n"
import { MODEL_CONFIG } from "@/lib/content"
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
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ResumeChatPanel resumeId="res_1" run={run} mode="approval" />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

/** 记录当前路由；引导动作走 react-router navigate 时用它断言去向。 */
function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderPanelWithRoute(client = newClient(), run: AgentRun | null = RUN) {
  return render(
    <MemoryRouter initialEntries={["/resumes/res_1"]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ResumeChatPanel resumeId="res_1" run={run} mode="approval" />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
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

describe("对话区 AI 可用性引导接线", () => {
  const INPUT = i18n.t("workbench.run.inputAria")
  const SEND = i18n.t("workbench.run.sendAria")
  const TITLE = (state: string) => i18n.t(`agentOnboarding.state.${state}.title`)

  it("model_missing：从 /models/config 派生引导，拦截当前对话输入与发送", async () => {
    server.use(http.get("/api/models/config", () => HttpResponse.json({ ...MODEL_CONFIG, keyConfigured: false })))
    renderPanel()

    expect(await screen.findByText(TITLE("model_missing"))).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: INPUT })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: SEND })).not.toBeInTheDocument()
  })

  it("auth_failed：凭据被拒只显示掩码尾号，且不出现完整 key / Authorization / Traceback", async () => {
    server.use(
      http.get("/api/models/config", () =>
        HttpResponse.json({
          ...MODEL_CONFIG,
          keyConfigured: true,
          lastTest: {
            at: "2026-10-10T09:15:00+08:00",
            ok: false,
            message:
              "Error code: 401 - api key sk-live-abcdef123456 is invalid; Authorization: Bearer sk-live-abcdef123456; Traceback (most recent call last): ****be21",
          },
        }),
      ),
    )
    const { container } = renderPanel()

    expect(await screen.findByText(/被拒凭据：\*\*\*\*be21/)).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: INPUT })).not.toBeInTheDocument()
    const text = container.textContent ?? ""
    expect(text).not.toContain("sk-live-abcdef123456")
    expect(text).not.toContain("Authorization")
    expect(text).not.toContain("Traceback")
  })

  it("runtime_offline：运行体不可用时拦截发送", async () => {
    server.use(http.get("/api/agent/runtime", () => HttpResponse.json({ command: "resumate-agent", available: false })))
    renderPanel()

    expect(await screen.findByText(TITLE("runtime_offline"))).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: INPUT })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: SEND })).not.toBeInTheDocument()
  })

  it("available：正常放行，输入框与发送可见且不显示引导", async () => {
    renderPanel()

    expect(await screen.findByRole("textbox", { name: INPUT })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: SEND })).toBeInTheDocument()
    expect(screen.queryByText(TITLE("model_missing"))).not.toBeInTheDocument()
    expect(screen.queryByText(TITLE("runtime_offline"))).not.toBeInTheDocument()
  })

  it("model_missing 的「去设置」经 action effect 归一为 /settings", async () => {
    server.use(http.get("/api/models/config", () => HttpResponse.json({ ...MODEL_CONFIG, keyConfigured: false })))
    renderPanelWithRoute()

    fireEvent.click(await screen.findByRole("button", { name: i18n.t("agentOnboarding.state.model_missing.action") }))

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/settings"))
  })

  it("load_failed：读取失败给重试并重查模型配置", async () => {
    let calls = 0
    server.use(
      http.get("/api/models/config", () => {
        calls += 1
        return HttpResponse.json({ code: "RATE_LIMITED", message: "RAW-SERVER-TOKEN" }, { status: 429 })
      }),
    )
    renderPanel()

    fireEvent.click(await screen.findByRole("button", { name: i18n.t("agentOnboarding.state.load_failed.action") }))

    await waitFor(() => expect(calls).toBeGreaterThan(1))
    // 负向断言：读取失败也不得把服务端原文透出到界面。
    expect(screen.queryByText(/RAW-SERVER-TOKEN/)).not.toBeInTheDocument()
  })

  it("历史会话的继续输入同样被拦截", async () => {
    server.use(
      http.get("/api/models/config", () => HttpResponse.json({ ...MODEL_CONFIG, keyConfigured: false })),
      http.get("/api/sessions", () => HttpResponse.json([SESSIONS[0]])),
      http.get("/api/sessions/sess_000000000001/messages", () => HttpResponse.json([])),
    )
    renderPanel(newClient(), null)
    await openHistory()
    fireEvent.click(await screen.findByRole("button", { name: /优化项目经历措辞/ }))

    expect(await screen.findByText(TITLE("model_missing"))).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: i18n.t("sessionHistory.continue.placeholder") })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: i18n.t("sessionHistory.continue.send") })).not.toBeInTheDocument()
  })

  it("不可用时不渲染运行失败错误块，避免与引导叠加", async () => {
    server.use(http.get("/api/models/config", () => HttpResponse.json({ ...MODEL_CONFIG, keyConfigured: false })))
    const failedRun: AgentRun = {
      ...RUN,
      state: "turn_closed",
      error: {
        code: "MODEL_AUTH",
        category: "auth",
        message: "api key ****be21 is invalid",
        provider: "deepseek",
        model: "deepseek-flash",
        keyHint: "****be21",
      },
    }
    renderPanel(newClient(), failedRun)

    expect(await screen.findByText(TITLE("model_missing"))).toBeInTheDocument()
    expect(screen.queryByTestId("run-error")).not.toBeInTheDocument()
  })
})


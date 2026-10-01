import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RunPanel } from "@/components/run-panel"
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

  emit(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data }))
    }
  }
}

const RUN: AgentRun = {
  id: "turn_1",
  resumeId: "res_1",
  conversationId: "sess_1",
  userTurnId: "turn_1",
  executionMode: "approval",
  modeSource: "account",
  state: "awaiting_confirm",
  budget: { usedTokens: 0, maxTokens: 0, usedTurns: 0, maxTurns: 0, costUsd: 0 },
  timeline: [],
  pendingActions: [
    {
      id: "pa_1",
      kind: "content_patch",
      title: "强化性能成果",
      targetResource: "职业经历",
      impactSummary: "1 处变更",
      requiresTextConfirm: false,
      state: "pending",
    },
  ],
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPanel(run: AgentRun, queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <RunPanel resumeId="res_1" run={run} mode="approval" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal("EventSource", FakeEventSource)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("RunPanel 审批接线", () => {
  it("approve 发出真实 POST 并刷新 active-run 查询", async () => {
    const seen: string[] = []
    server.use(
      http.post("/api/pending-actions/:id/approve", ({ params }) => {
        seen.push(String(params.id))
        return HttpResponse.json({ id: params.id, state: "approved" })
      }),
    )
    const queryClient = newClient()
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    renderPanel(RUN, queryClient)

    fireEvent.click(screen.getByRole("button", { name: /批准/ }))

    await waitFor(() => expect(seen).toEqual(["pa_1"]))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["active-run", "res_1"] }))
  })

  it("reject 发出真实 POST 并刷新 active-run 查询", async () => {
    const seen: string[] = []
    server.use(
      http.post("/api/pending-actions/:id/reject", ({ params }) => {
        seen.push(String(params.id))
        return HttpResponse.json({ id: params.id, state: "rejected" })
      }),
    )
    const queryClient = newClient()
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    renderPanel(RUN, queryClient)

    fireEvent.click(screen.getByRole("button", { name: /拒绝/ }))

    await waitFor(() => expect(seen).toEqual(["pa_1"]))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["active-run", "res_1"] }))
  })

  it("approve 失败时就地报错", async () => {
    server.use(
      http.post("/api/pending-actions/:id/approve", () =>
        HttpResponse.json({ code: "FORBIDDEN", message: "审批动作仅限人类会话" }, { status: 403 }),
      ),
    )
    renderPanel(RUN, newClient())

    fireEvent.click(screen.getByRole("button", { name: /批准/ }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("审批动作仅限人类会话")
  })

  it("提交中禁用按钮，结束后恢复", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post("/api/pending-actions/:id/approve", async () => {
        await gate
        return HttpResponse.json({ id: "pa_1", state: "approved" })
      }),
    )
    renderPanel(RUN, newClient())
    const button = screen.getByRole("button", { name: /批准/ })

    fireEvent.click(button)

    await waitFor(() => expect(button).toBeDisabled())
    release()
    await waitFor(() => expect(button).not.toBeDisabled())
  })

  it("订阅当前轮次的 SSE，turn.updated 触发刷新", async () => {
    const queryClient = newClient()
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    renderPanel(RUN, queryClient)

    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0))
    const source = FakeEventSource.instances[0]!
    expect(source.url).toBe("/api/turns/turn_1/events")

    source.emit("turn.updated", JSON.stringify({ id: "turn_1" }))

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["active-run", "res_1"] }))
  })

  it("卸载后关闭 EventSource", async () => {
    const { unmount } = renderPanel(RUN, newClient())
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0))
    const source = FakeEventSource.instances.at(-1)!

    unmount()

    expect(source.closed).toBe(true)
    expect(source.listeners.get("turn.updated")?.size ?? 0).toBe(0)
  })

  it("StrictMode 下只保留一个活跃连接", async () => {
    render(
      <StrictMode>
        <QueryClientProvider client={newClient()}>
          <RunPanel run={RUN} mode="approval" />
        </QueryClientProvider>
      </StrictMode>,
    )

    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0))
    await waitFor(() => expect(FakeEventSource.instances.filter((source) => !source.closed).length).toBe(1))
  })

  it("没有活动轮次时不订阅 SSE", async () => {
    render(
      <QueryClientProvider client={newClient()}>
        <RunPanel resumeId="res_1" mode="approval" />
      </QueryClientProvider>,
    )

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(FakeEventSource.instances.length).toBe(0)
  })
})

describe("RunPanel 发起运行", () => {
  function renderStart(queryClient: QueryClient) {
    return render(
      <QueryClientProvider client={queryClient}>
        <RunPanel resumeId="res_1" mode="approval" />
      </QueryClientProvider>,
    )
  }

  it("提交后发出 POST /resumes/res_1/runs 并显示启动中", async () => {
    const bodies: unknown[] = []
    server.use(
      http.post("/api/resumes/:id/runs", async ({ request, params }) => {
        bodies.push({ id: params.id, body: await request.json() })
        return HttpResponse.json({ runId: "run_1", status: "started" }, { status: 202 })
      }),
    )
    renderStart(newClient())
    const input = screen.getByRole("textbox", { name: "对话输入" })

    fireEvent.change(input, { target: { value: "突出性能优化" } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() =>
      expect(bodies).toEqual([{ id: "res_1", body: { prompt: "突出性能优化", executionMode: "approval" } }]),
    )
    expect(screen.getByText(i18n.t("workbench.run.starting"))).toBeInTheDocument()
    expect((input as HTMLTextAreaElement).value).toBe("")
  })

  it("MODEL_NOT_CONFIGURED 显示配置引导且不回显服务端原文", async () => {
    server.use(
      http.post("/api/resumes/:id/runs", () =>
        HttpResponse.json({ code: "MODEL_NOT_CONFIGURED", message: "RAW-SERVER-TOKEN" }, { status: 409 }),
      ),
    )
    renderStart(newClient())

    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "改简历" } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain(i18n.t("workbench.run.errors.modelNotConfigured"))
    expect(screen.queryByText(/RAW-SERVER-TOKEN/)).not.toBeInTheDocument()
  })

  it("RATE_LIMITED 显示可读文案且不回显服务端原文", async () => {
    server.use(
      http.post("/api/resumes/:id/runs", () =>
        HttpResponse.json({ code: "RATE_LIMITED", message: "RAW-RATE" }, { status: 429 }),
      ),
    )
    renderStart(newClient())

    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "改简历" } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain(i18n.t("workbench.run.errors.rateLimited"))
    expect(screen.queryByText(/RAW-RATE/)).not.toBeInTheDocument()
  })

  it("其它错误显示通用文案且不回显服务端原文", async () => {
    server.use(
      http.post("/api/resumes/:id/runs", () =>
        HttpResponse.json({ code: "VALIDATION_FAILED", message: "RAW-OTHER" }, { status: 500 }),
      ),
    )
    renderStart(newClient())

    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "改简历" } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain(i18n.t("workbench.run.errors.generic"))
    expect(screen.queryByText(/RAW-OTHER/)).not.toBeInTheDocument()
  })

  it("发起期间禁用输入与提交并置 aria-busy", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post("/api/resumes/:id/runs", async () => {
        await gate
        return HttpResponse.json({ runId: "run_1", status: "started" }, { status: 202 })
      }),
    )
    renderStart(newClient())
    const input = screen.getByRole("textbox", { name: "对话输入" })
    const send = screen.getByRole("button", { name: "发送" })

    fireEvent.change(input, { target: { value: "改简历" } })
    fireEvent.click(send)

    await waitFor(() => expect(send).toBeDisabled())
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute("aria-busy", "true")

    release()
    await waitFor(() => expect(send).not.toBeDisabled())
  })

  it("run 出现后不再显示启动中", async () => {
    server.use(
      http.post("/api/resumes/:id/runs", () =>
        HttpResponse.json({ runId: "run_1", status: "started" }, { status: 202 }),
      ),
    )
    const queryClient = newClient()
    const view = render(
      <QueryClientProvider client={queryClient}>
        <RunPanel resumeId="res_1" mode="approval" />
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "改简历" } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))
    await screen.findByText(i18n.t("workbench.run.starting"))

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <RunPanel resumeId="res_1" mode="approval" run={RUN} />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.queryByText(i18n.t("workbench.run.starting"))).not.toBeInTheDocument())
  })
})

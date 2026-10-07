// 个人资料助手抽屉的真实 Agent 接线：
// 可用性引导 / 发消息起 profile run / SSE turn.updated 增量拉取并渲染 / 审批 / StrictMode 连接数。
// 契约见 docs/agent/agent-operation-api.md §19 / §21，全部由 MSW 按冻结契约造。

import { StrictMode } from "react"
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProfileAssistant } from "@/components/profile-assistant"
import { ProfilePage } from "@/pages/profile"
import { MODEL_CONFIG, PROFILE } from "@/lib/content"
import { server } from "@/test-server"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const SESSION = {
  id: "sess_1",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  lastActiveAt: "2026-10-01T00:00:00Z",
}

function profileTurn(overrides: Record<string, unknown> = {}) {
  return {
    id: "turn_prof_1",
    scope: "profile",
    resumeId: null,
    clientId: "web",
    source: "agent",
    executionMode: "approval",
    modeSource: "session",
    state: "open",
    baseVersionId: null,
    sessionId: "sess_1",
    message: "把城市改成北京",
    createdAt: "2026-10-01T00:00:00Z",
    closedAt: null,
    result: null,
    pendingActions: [],
    ...overrides,
  }
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderWith(client: QueryClient, node: ReactNode, strict = false) {
  const tree = (
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

function renderAssistant(client = makeClient()) {
  return renderWith(client, <ProfileAssistant open onClose={() => {}} />)
}

class FakeEventSource {
  static all: FakeEventSource[] = []
  readonly url: string
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>()
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    FakeEventSource.all.push(this)
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
    for (const listener of this.listeners.get(type) ?? []) listener(new MessageEvent(type, { data }))
  }
}

function stubEventSource() {
  FakeEventSource.all = []
  vi.stubGlobal("EventSource", FakeEventSource)
  return FakeEventSource.all
}

describe("ProfileAssistant 的 Agent 可用性引导", () => {
  it("还差一步时显示「去设置」且不提供对话输入", async () => {
    server.use(http.get("/api/models/config", () => HttpResponse.json({ ...MODEL_CONFIG, keyConfigured: false })))

    renderAssistant()

    expect(await screen.findByText("先把助手开起来")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去设置" })).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("模型已配置但后端无法启动时如实说明，且不提供对话输入", async () => {
    server.use(http.get("/api/agent/runtime", () => HttpResponse.json({ command: "resumate-agent", available: false })))
    renderAssistant()

    expect(await screen.findByText("助手暂时不可用")).toBeInTheDocument()
    expect(screen.getByText("助手现在还不能聊天，请稍后再试。")).toBeInTheDocument()
    expect(screen.queryByText(/界面不会假装能跑/)).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "开始聊聊" })).not.toBeInTheDocument()
  })

  it("模型已配置且后端可启动时显示对话输入，不再说暂不可用", async () => {
    renderAssistant()

    expect(await screen.findByRole("textbox")).toBeInTheDocument()
    expect(screen.queryByText("助手暂时不可用")).not.toBeInTheDocument()
  })
})

describe("ProfileAssistant 的真实会话", () => {
  it("发消息时新建会话、先记录用户消息再起 profile run", async () => {
    const calls: string[] = []
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([])),
      http.post("/api/sessions", () => {
        calls.push("create")
        return HttpResponse.json(SESSION, { status: 201 })
      }),
      http.get("/api/sessions/sess_1/messages", () => HttpResponse.json([])),
      http.post("/api/sessions/sess_1/messages", async ({ request }) => {
        const body = (await request.json()) as { seq: number; role: string; content: { content: string } }
        calls.push("message:" + body.seq + ":" + body.role + ":" + body.content.content)
        return HttpResponse.json({ id: "msg_1", sessionId: "sess_1", seq: body.seq, role: body.role, content: body.content, createdAt: "2026-10-01T00:00:00Z" }, { status: 201 })
      }),
      http.post("/api/sessions/sess_1/runs", async ({ request }) => {
        const body = (await request.json()) as { prompt: string }
        calls.push("run:" + body.prompt)
        return HttpResponse.json({ runId: "run_1", status: "started" }, { status: 202 })
      }),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([])),
    )

    renderAssistant()
    const box = await screen.findByRole("textbox")
    fireEvent.change(box, { target: { value: "把城市改成北京" } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    // 用户消息立即上屏，不等后端。
    expect(screen.getByText("把城市改成北京")).toBeInTheDocument()
    await waitFor(() => expect(calls).toContain("run:把城市改成北京"))
    expect(calls[0]).toBe("create")
    expect(calls).toContain("message:1:user:把城市改成北京")
    // 用户消息必须先落会话，再起 run：运行体从会话当前最大 seq 之后继续写历史。
    expect(calls.indexOf("message:1:user:把城市改成北京")).toBeLessThan(calls.indexOf("run:把城市改成北京"))
  })

  it("收到 turn.updated 后增量拉取消息并渲染 Agent 回复", async () => {
    const sources = stubEventSource()
    let replyReady = false
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([profileTurn()])),
      http.get("/api/sessions/sess_1/messages", ({ request }) => {
        if (!replyReady) return HttpResponse.json([])
        const after = new URL(request.url).searchParams.get("afterSeq")
        const reply = { id: "msg_a", sessionId: "sess_1", seq: 2, role: "assistant", content: { role: "assistant", content: "已整理好一条经历，请确认。" }, createdAt: "2026-10-01T00:00:00Z" }
        const user = { id: "msg_u", sessionId: "sess_1", seq: 1, role: "user", content: { role: "user", content: "把城市改成北京" }, createdAt: "2026-10-01T00:00:00Z" }
        return HttpResponse.json(after ? [reply] : [user, reply])
      }),
    )

    renderAssistant()
    await waitFor(() => expect(sources.some((source) => source.url.endsWith("/turns/turn_prof_1/events"))).toBe(true))
    expect(screen.queryByText("已整理好一条经历，请确认。")).not.toBeInTheDocument()

    replyReady = true
    sources.find((source) => source.url.endsWith("/turns/turn_prof_1/events"))!.emit("turn.updated", JSON.stringify({ id: "turn_prof_1", resumeId: null, state: "finalized" }))

    expect(await screen.findByText("已整理好一条经历，请确认。")).toBeInTheDocument()
  })

  it("待确认的主档改动复用 PendingActionCard，批准后刷新主档", async () => {
    const profileCalls: number[] = []
    let approved = false
    const pending = {
      id: "pa_prof",
      userTurnId: "turn_prof_1",
      kind: "profile_change",
      title: "主档修改（1 处）",
      targetResource: null,
      baseVersionId: null,
      impactSummary: "共 1 处主档改动",
      requiresTextConfirm: false,
      state: "pending",
      staleReason: null,
      diff: [],
    }
    const newFact = {
      id: "fact_order",
      type: "project",
      title: "订单系统重构",
      content: "主导订单系统重构，首屏从 4s 降到 1.2s。",
      tags: [],
      source: "Agent",
      evidence: { status: "unverified" },
      confidence: 0.5,
      visibility: "resume_only",
      referencedBy: [],
    }
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([profileTurn({ pendingActions: [{ ...pending, state: approved ? "approved" : "pending" }] })])),
      http.get("/api/sessions/sess_1/messages", () => HttpResponse.json([])),
      http.get("/api/profile", () => {
        profileCalls.push(1)
        return HttpResponse.json(approved ? { ...PROFILE, facts: [newFact, ...PROFILE.facts] } : PROFILE)
      }),
      http.post("/api/pending-actions/pa_prof/approve", () => {
        approved = true
        return HttpResponse.json({ ...pending, state: "approved" })
      }),
    )

    const { unmount } = renderWith(makeClient(), <ProfilePage />)
    fireEvent.click(await screen.findByRole("button", { name: "对话维护资料" }))

    expect(await screen.findByText("主档修改（1 处）")).toBeInTheDocument()
    const before = profileCalls.length
    fireEvent.click(screen.getByRole("button", { name: "批准并应用" }))

    await waitFor(() => expect(approved).toBe(true))
    await waitFor(() => expect(profileCalls.length).toBeGreaterThan(before))
    expect(await screen.findByRole("heading", { name: "订单系统重构" })).toBeInTheDocument()
    unmount()
  })

  it("拒绝时调用 reject 且不写入主档", async () => {
    const decided: string[] = []
    const pending = {
      id: "pa_prof",
      userTurnId: "turn_prof_1",
      kind: "profile_change",
      title: "主档修改（1 处）",
      targetResource: null,
      baseVersionId: null,
      impactSummary: "共 1 处主档改动",
      requiresTextConfirm: false,
      state: "pending",
      staleReason: null,
      diff: [],
    }
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([profileTurn({ pendingActions: [pending] })])),
      http.get("/api/sessions/sess_1/messages", () => HttpResponse.json([])),
      http.post("/api/pending-actions/pa_prof/reject", () => {
        decided.push("reject")
        return HttpResponse.json({ ...pending, state: "rejected" })
      }),
    )

    renderAssistant()
    fireEvent.click(await screen.findByRole("button", { name: "拒绝" }))

    await waitFor(() => expect(decided).toEqual(["reject"]))
  })

  it("StrictMode 下只有一个活跃 EventSource，卸载后全部关闭", async () => {
    const sources = stubEventSource()
    const client = makeClient()
    client.setQueryData(["model-config"], MODEL_CONFIG)
    client.setQueryData(["runtime-status"], { command: "resumate-agent", available: true })
    client.setQueryData(["profile-session"], "sess_1")
    client.setQueryData(["session-turns", "sess_1"], [profileTurn()])
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([profileTurn()])),
      http.get("/api/sessions/sess_1/messages", () => HttpResponse.json([])),
    )

    const { unmount } = renderWith(client, <ProfileAssistant open onClose={() => {}} />, true)

    await waitFor(() => expect(sources.length).toBe(2))
    expect(sources.filter((source) => !source.closed)).toHaveLength(1)

    unmount()

    expect(sources.filter((source) => !source.closed)).toHaveLength(0)
    expect(sources.every((source) => source.closed)).toBe(true)
  })

  it("模型未配置时按错误码给出可读提示，不回显服务端原文", async () => {
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/sessions/sess_1/messages", () => HttpResponse.json([])),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([profileTurn()])),
      http.post("/api/sessions/sess_1/runs", () => HttpResponse.json({ code: "MODEL_NOT_CONFIGURED", message: "provider key missing" }, { status: 409 })),
    )

    renderAssistant()
    const box = await screen.findByRole("textbox")
    fireEvent.change(box, { target: { value: "补充一段经历" } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("尚未配置模型密钥")
    expect(screen.queryByText(/provider key missing/)).not.toBeInTheDocument()
  })

  it("并发受限时给出可读提示，不回显服务端原文", async () => {
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/sessions/sess_1/messages", () => HttpResponse.json([])),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([profileTurn()])),
      http.post("/api/sessions/sess_1/runs", () => HttpResponse.json({ code: "RATE_LIMITED", message: "runner concurrency exceeded" }, { status: 429 })),
    )

    renderAssistant()
    const box = await screen.findByRole("textbox")
    fireEvent.change(box, { target: { value: "补充一段经历" } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("已有运行体在执行")
    expect(screen.queryByText(/concurrency exceeded/)).not.toBeInTheDocument()
  })
})

const RESUME_SESSION = {
  id: "sess_resume",
  createdAt: "2026-10-02T00:00:00Z",
  updatedAt: "2026-10-02T00:00:00Z",
  lastActiveAt: "2026-10-02T00:00:00Z",
}

const PROFILE_SESSION = {
  id: "sess_profile",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  lastActiveAt: "2026-10-01T00:00:00Z",
}

function resumeTurn() {
  return profileTurn({
    id: "turn_res_1",
    scope: "resume",
    resumeId: "res_aeba1b686aa4",
    sessionId: "sess_resume",
    message: "请把简历 res_aeba1b686aa4 的一句话头衔改成「资深后端工程师」",
  })
}

describe("ProfileAssistant 按轮次 scope 选取主档会话", () => {
  it("最新会话含 resume 轮次时不采用它，改用 profile 会话", async () => {
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([RESUME_SESSION, PROFILE_SESSION])),
      http.get("/api/sessions/sess_resume/turns", () => HttpResponse.json([resumeTurn()])),
      http.get("/api/sessions/sess_profile/turns", () =>
        HttpResponse.json([profileTurn({ id: "turn_prof_2", sessionId: "sess_profile", message: "整理我的技能" })]),
      ),
      http.get("/api/sessions/sess_resume/messages", () =>
        HttpResponse.json([
          {
            id: "msg_res",
            sessionId: "sess_resume",
            seq: 1,
            role: "user",
            content: { role: "user", content: "请把简历 res_aeba1b686aa4 的一句话头衔改成「资深后端工程师」" },
            createdAt: "2026-10-02T00:00:00Z",
          },
        ]),
      ),
      http.get("/api/sessions/sess_profile/messages", () =>
        HttpResponse.json([
          {
            id: "msg_prof",
            sessionId: "sess_profile",
            seq: 1,
            role: "user",
            content: { role: "user", content: "我最近在做订单系统重构" },
            createdAt: "2026-10-01T00:00:00Z",
          },
        ]),
      ),
    )

    renderAssistant()

    expect(await screen.findByText("我最近在做订单系统重构")).toBeInTheDocument()
    expect(screen.queryByText(/请把简历 res_aeba1b686aa4/)).not.toBeInTheDocument()
  })

  it("只有含 resume 轮次的会话时新建会话，不向它起 profile run", async () => {
    const runs: string[] = []
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([RESUME_SESSION])),
      http.get("/api/sessions/sess_resume/turns", () => HttpResponse.json([resumeTurn()])),
      http.get("/api/sessions/sess_resume/messages", () => HttpResponse.json([])),
      http.post("/api/sessions", () => HttpResponse.json(SESSION, { status: 201 })),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([])),
      http.get("/api/sessions/sess_1/messages", () => HttpResponse.json([])),
      http.post("/api/sessions/sess_1/messages", async ({ request }) => {
        const body = (await request.json()) as { seq: number; role: string; content: unknown }
        return HttpResponse.json(
          { id: "msg_1", sessionId: "sess_1", seq: body.seq, role: body.role, content: body.content, createdAt: "2026-10-01T00:00:00Z" },
          { status: 201 },
        )
      }),
      http.post("/api/sessions/sess_1/runs", () => {
        runs.push("sess_1")
        return HttpResponse.json({ runId: "run_1", status: "started" }, { status: 202 })
      }),
      http.post("/api/sessions/sess_resume/runs", () => {
        runs.push("sess_resume")
        return HttpResponse.json({ runId: "run_x", status: "started" }, { status: 202 })
      }),
    )

    renderAssistant()
    const box = await screen.findByRole("textbox")
    fireEvent.change(box, { target: { value: "补充一段经历" } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => expect(runs).toEqual(["sess_1"]))
  })
})

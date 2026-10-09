// 个人资料助手抽屉的真实 Agent 接线：
// 可用性引导 / 发消息起 profile run / SSE turn.updated 增量拉取并渲染 / 审批 / StrictMode 连接数。
// 契约见 docs/agent/agent-operation-api.md §19 / §21，全部由 MSW 按冻结契约造。

import { StrictMode, useState } from "react"
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { agentAvailabilityActionEffect, type AgentAvailabilityAction } from "@/components/agent-onboarding"
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
    // 抽屉现在是真模态：背景被 inert + aria-hidden，所以刷新后的主档要以 hidden 方式断言。
    expect(await screen.findByRole("heading", { name: "订单系统重构", hidden: true })).toBeInTheDocument()
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

describe("ProfileAssistant 的可用性状态区分", () => {
  it("可用性读取中显示加载占位，而不是空白正文", () => {
    server.use(
      http.get("/api/models/config", async () => {
        await new Promise(() => {})
        return HttpResponse.json(MODEL_CONFIG)
      }),
    )

    renderAssistant()

    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("模型配置加载失败时给出可重试的错误态，不引导去设置", async () => {
    server.use(http.get("/api/models/config", () => HttpResponse.json({ code: "RATE_LIMITED", message: "runner busy" }, { status: 500 })))

    renderAssistant()

    expect(await screen.findByText("助手配置读取失败")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
    expect(screen.queryByText("先把助手开起来")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "去设置" })).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("模型配置返回 403 时说明无权限，既不引导去设置也不提示重试", async () => {
    server.use(http.get("/api/models/config", () => HttpResponse.json({ code: "FORBIDDEN", message: "forbidden" }, { status: 403 })))

    renderAssistant()

    expect(await screen.findByText("没有权限读取助手配置")).toBeInTheDocument()
    expect(screen.queryByText("先把助手开起来")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "去设置" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  })
})

describe("ProfileAssistant 的实时回复", () => {
  it("收到 snapshot 时增量拉取消息并渲染助手回复", async () => {
    const sources = stubEventSource()
    let replyReady = false
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([profileTurn()])),
      http.get("/api/sessions/sess_1/messages", () =>
        HttpResponse.json(
          replyReady
            ? [{ id: "msg_a", sessionId: "sess_1", seq: 2, role: "assistant", content: { role: "assistant", content: "收到" }, createdAt: "2026-10-01T00:00:00Z" }]
            : [],
        ),
      ),
    )

    renderAssistant()
    await waitFor(() => expect(sources.some((source) => source.url.endsWith("/turns/turn_prof_1/events"))).toBe(true))
    expect(screen.queryByText("收到")).not.toBeInTheDocument()

    replyReady = true
    sources
      .find((source) => source.url.endsWith("/turns/turn_prof_1/events"))!
      .emit("snapshot", JSON.stringify({ id: "turn_prof_1", resumeId: null, state: "finalized" }))

    expect(await screen.findByText("收到")).toBeInTheDocument()
  })

  it("轮次集合变化时补拉消息，助手回复无需关闭重开即可见", async () => {
    const client = makeClient()
    let replyReady = false
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([profileTurn()])),
      http.get("/api/sessions/sess_1/messages", ({ request }) => {
        const after = Number(new URL(request.url).searchParams.get("afterSeq") ?? "0")
        const user = { id: "msg_u", sessionId: "sess_1", seq: 1, role: "user", content: { role: "user", content: "在" }, createdAt: "2026-10-01T00:00:00Z" }
        const reply = { id: "msg_a", sessionId: "sess_1", seq: 2, role: "assistant", content: { role: "assistant", content: "收到" }, createdAt: "2026-10-01T00:00:00Z" }
        if (!replyReady) return HttpResponse.json(after >= 1 ? [] : [user])
        return HttpResponse.json(after >= 1 ? [reply] : [user, reply])
      }),
    )

    renderWith(client, <ProfileAssistant open onClose={() => {}} />)
    expect(await screen.findByText("在")).toBeInTheDocument()
    expect(screen.queryByText("收到")).not.toBeInTheDocument()

    replyReady = true
    act(() => {
      client.setQueryData(["session-turns", "sess_1"], [profileTurn({ id: "turn_prof_2" })])
    })

    expect(await screen.findByText("收到")).toBeInTheDocument()
  })
})

describe("ProfileAssistant 抽屉的模态契约", () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          对话维护资料
        </button>
        <ProfileAssistant open={open} onClose={() => setOpen(false)} />
      </>
    )
  }

  it("打开将焦点移入抽屉，Esc 关闭并把焦点归还触发按钮，背景 inert", async () => {
    const client = makeClient()
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([])),
      http.post("/api/sessions", () => HttpResponse.json(SESSION, { status: 201 })),
    )

    const { container } = renderWith(client, <Harness />)
    const trigger = screen.getByRole("button", { name: "对话维护资料" })
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveAttribute("aria-modal", "true")
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    await waitFor(() => expect(container).toHaveAttribute("inert"))

    fireEvent.keyDown(dialog, { key: "Escape" })

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(container).not.toHaveAttribute("inert")
  })

  it("关闭按钮使用区别于通用「关闭」的可访问名", async () => {
    const client = makeClient()
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([])),
      http.post("/api/sessions", () => HttpResponse.json(SESSION, { status: 201 })),
    )
    renderAssistant(client)

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("button", { name: "关闭助手" })).toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: "关闭" })).not.toBeInTheDocument()
  })
})

describe("ProfileAssistant 的发送键约定（与 RunPanel 统一）", () => {
  function stubSession(calls: string[]) {
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([])),
      http.post("/api/sessions", () => HttpResponse.json(SESSION, { status: 201 })),
      http.get("/api/sessions/sess_1/messages", () => HttpResponse.json([])),
      http.post("/api/sessions/sess_1/messages", async ({ request }) => {
        const body = (await request.json()) as { seq: number; role: string; content: unknown }
        calls.push("message:" + body.role)
        return HttpResponse.json(
          { id: "msg_1", sessionId: "sess_1", seq: body.seq, role: body.role, content: body.content, createdAt: "2026-10-01T00:00:00Z" },
          { status: 201 },
        )
      }),
      http.post("/api/sessions/sess_1/runs", async ({ request }) => {
        const body = (await request.json()) as { prompt: string }
        calls.push("run:" + body.prompt)
        return HttpResponse.json({ runId: "run_1", status: "started" }, { status: 202 })
      }),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([])),
    )
  }

  /** 每次按键用独立的调用记录：上一条异步 run 不会漏进下一条断言。 */
  async function typeAndPress(calls: string[], init: Record<string, unknown>) {
    stubSession(calls)
    renderAssistant()
    const box = (await screen.findByRole("textbox")) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "第一行" } })
    const event = createEvent.keyDown(box, init)
    fireEvent(box, event)
    return { box, event }
  }

  const runCalls = (calls: string[]) => calls.filter((call) => call.startsWith("run:"))

  it("Shift+Enter 只换行、不发送", async () => {
    const calls: string[] = []
    const { event } = await typeAndPress(calls, { key: "Enter", shiftKey: true })
    expect(event.defaultPrevented).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(runCalls(calls)).toEqual([])
  })

  it("Meta+Enter 触发发送", async () => {
    const calls: string[] = []
    await typeAndPress(calls, { key: "Enter", metaKey: true })
    await waitFor(() => expect(runCalls(calls)).toEqual(["run:第一行"]))
  })

  it("Ctrl+Enter 触发发送", async () => {
    const calls: string[] = []
    await typeAndPress(calls, { key: "Enter", ctrlKey: true })
    await waitFor(() => expect(runCalls(calls)).toEqual(["run:第一行"]))
  })

  it("IME 组合态下 Meta+Enter 不发送", async () => {
    const calls: string[] = []
    const { event } = await typeAndPress(calls, { key: "Enter", metaKey: true, isComposing: true })
    expect(event.defaultPrevented).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(runCalls(calls)).toEqual([])
  })

  // 放在最后：当前实现下裸 Enter 会真的起一次 run，避免它的在途请求漏进前面的否定断言。
  it("裸 Enter 不发送、不拦截默认换行", async () => {
    const calls: string[] = []
    const { box, event } = await typeAndPress(calls, { key: "Enter" })
    expect(event.defaultPrevented).toBe(false)
    expect(box.value).toBe("第一行")
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(runCalls(calls)).toEqual([])
  })
})

describe("ProfileAssistant 对已关闭轮次的待办兜底", () => {
  const HISTORICAL_PENDING = {
    id: "pa_hist",
    userTurnId: "turn_prof_1",
    kind: "profile_change",
    title: "主档修改（历史遗留）",
    targetResource: null,
    baseVersionId: null,
    impactSummary: "共 1 处主档改动",
    requiresTextConfirm: false,
    state: "pending",
    staleReason: null,
    diff: [],
  }

  function stubTurn(state: "open" | "finalized") {
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/sessions/sess_1/turns", () =>
        HttpResponse.json([profileTurn({ state, pendingActions: [HISTORICAL_PENDING] })]),
      ),
      http.get("/api/sessions/sess_1/messages", () => HttpResponse.json([])),
    )
  }

  it("最新轮次已关闭且待办仍是历史 pending 时不渲染可点按钮，并显示失效原因", async () => {
    stubTurn("finalized")

    renderAssistant()

    expect(await screen.findByText("主档修改（历史遗留）")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "批准并应用" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "拒绝" })).not.toBeInTheDocument()
    expect(screen.getByText("已失效")).toBeInTheDocument()
    expect(screen.getByText("该待办已随轮次关闭失效", { exact: false })).toBeInTheDocument()
  })

  it("轮次未关闭时同一待办仍可点", async () => {
    stubTurn("open")

    renderAssistant()

    expect(await screen.findByText("主档修改（历史遗留）")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "批准并应用" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "拒绝" })).toBeInTheDocument()
  })
})

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{location.pathname + location.search}</span>
}

describe("ProfileAssistant 的可用性引导按 action 分流", () => {
  it("start_chat 进入对话，不跳设置页", () => {
    expect(agentAvailabilityActionEffect("start_chat")).toBe("chat")
  })

  it("configure_model 才去设置页", () => {
    expect(agentAvailabilityActionEffect("configure_model")).toBe("settings")
  })

  it("retry 与上游新增动作都不会误触发导航", () => {
    expect(agentAvailabilityActionEffect("retry")).toBe("retry")
    expect(agentAvailabilityActionEffect("brand_new_action" as unknown as AgentAvailabilityAction)).toBe("stay")
  })

  it("模型未配置时点「去设置」真的导航到 /settings", async () => {
    server.use(http.get("/api/models/config", () => HttpResponse.json({ ...MODEL_CONFIG, keyConfigured: false })))

    renderWith(
      makeClient(),
      <>
        <ProfileAssistant open onClose={() => {}} />
        <LocationProbe />
      </>,
    )

    fireEvent.click(await screen.findByRole("button", { name: "去设置" }))
    expect(screen.getByTestId("location")).toHaveTextContent("/settings")
  })
})

// ---------------------------------------------------------------------------
// 面板真实接线（issue bb89f）：新建会话 / 历史切换 / 历史续聊写对 session /
// 凭据失效不放行 / runError 展示。全部由 MSW 按冻结契约造，断言真实请求与负向文案。
// ---------------------------------------------------------------------------

const OTHER_SESSION = {
  id: "sess_old",
  createdAt: "2026-09-20T00:00:00Z",
  updatedAt: "2026-09-20T00:00:00Z",
  lastActiveAt: "2026-09-20T00:00:00Z",
}

const NEW_SESSION = {
  id: "sess_new",
  createdAt: "2026-10-03T00:00:00Z",
  updatedAt: "2026-10-03T00:00:00Z",
  lastActiveAt: "2026-10-03T00:00:00Z",
}

function userSessionMessage(id: string, sessionId: string, seq: number, text: string) {
  return {
    id,
    sessionId,
    seq,
    role: "user",
    content: { role: "user", content: text },
    createdAt: "2026-10-01T00:00:00Z",
  }
}

describe("ProfileAssistant 的面板真实接线", () => {
  it("点「新建对话」真的 POST /sessions，后续发送写入这条新会话", async () => {
    const calls: string[] = []
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([])),
      http.post("/api/sessions", () => {
        calls.push("create")
        return HttpResponse.json(NEW_SESSION, { status: 201 })
      }),
      http.get("/api/sessions/sess_new/messages", () => HttpResponse.json([])),
      http.get("/api/sessions/sess_new/turns", () => HttpResponse.json([])),
      http.post("/api/sessions/sess_new/messages", async ({ request }) => {
        const body = (await request.json()) as { seq: number; role: string; content: { content: string } }
        calls.push("message:" + body.seq + ":" + body.content.content)
        return HttpResponse.json(
          { id: "msg_new", sessionId: "sess_new", seq: body.seq, role: body.role, content: body.content, createdAt: "2026-10-03T00:00:00Z" },
          { status: 201 },
        )
      }),
      http.post("/api/sessions/sess_new/runs", async ({ request }) => {
        const body = (await request.json()) as { prompt: string }
        calls.push("run:" + body.prompt)
        return HttpResponse.json({ runId: "run_new", status: "started" }, { status: 202 })
      }),
    )

    renderAssistant()
    fireEvent.click(await screen.findByRole("button", { name: "新建对话" }))
    await waitFor(() => expect(calls).toContain("create"))
    // 创建成功后停在当前对话视图，输入框可用。
    expect(screen.getByRole("tab", { name: "当前对话" })).toHaveAttribute("aria-selected", "true")

    const box = await screen.findByRole("textbox")
    fireEvent.change(box, { target: { value: "整理一下我的技能" } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => expect(calls).toContain("run:整理一下我的技能"))
    expect(calls).toContain("message:1:整理一下我的技能")
  })

  it("新建对话请求进行中时入口禁用并切文案，重复点击不发起第二次请求", async () => {
    let creates = 0
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([])),
      http.post("/api/sessions", async () => {
        creates += 1
        await new Promise(() => {})
        return HttpResponse.json(NEW_SESSION, { status: 201 })
      }),
    )

    renderAssistant()
    fireEvent.click(await screen.findByRole("button", { name: "新建对话" }))

    const creating = await screen.findByRole("button", { name: "正在新建对话…" })
    expect(creating).toBeDisabled()
    fireEvent.click(creating)
    expect(creates).toBe(1)
    expect(screen.queryByRole("button", { name: "新建对话" })).not.toBeInTheDocument()
  })

  it("历史列表用派生标题与时间分组，行内不出现会话 ID；点某一行切到该会话并加载消息", async () => {
    // lastActiveAt 取当前时间：分组标签才稳定落在「今天」，不依赖测试运行日期。
    // title / messageCount 由后端 GET /sessions 直接返回（issue 360b1），前端不再自行派生。
    const todaySession = {
      ...SESSION,
      lastActiveAt: new Date().toISOString(),
      title: "我最近在做订单系统重构",
      messageCount: 2,
    }
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([todaySession])),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([profileTurn()])),
      http.get("/api/sessions/sess_1/messages", () =>
        HttpResponse.json([userSessionMessage("msg_u", "sess_1", 1, "我最近在做订单系统重构")]),
      ),
    )

    renderAssistant()
    await screen.findByRole("button", { name: "新建对话" })
    fireEvent.click(screen.getByRole("tab", { name: "历史会话" }))

    const list = await screen.findByRole("tabpanel")
    // 行主文案是后端 title，第二行带消息数；行内不出现会话 ID。
    expect(within(list).getByText("我最近在做订单系统重构")).toBeInTheDocument()
    expect(within(list).getByText(/2 条消息/)).toBeInTheDocument()
    expect(within(list).getByText("今天")).toBeInTheDocument()
    expect(within(list).queryByText(/sess_1/)).not.toBeInTheDocument()

    fireEvent.click(within(list).getByRole("button", { name: /我最近在做订单系统重构/ }))

    expect(await screen.findByRole("heading", { level: 2, name: /我最近在做订单系统重构/ })).toBeInTheDocument()
    expect(screen.getByPlaceholderText("在这个会话继续对话…")).toBeInTheDocument()
  })

  it("后端未返回 title 时行主文案走「未命名对话」兜底，未返回 messageCount 时不渲染消息数", async () => {
    const untitledSession = { ...SESSION, lastActiveAt: new Date().toISOString() }
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([untitledSession])),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([profileTurn()])),
      http.get("/api/sessions/sess_1/messages", () => HttpResponse.json([])),
    )

    renderAssistant()
    await screen.findByRole("button", { name: "新建对话" })
    fireEvent.click(screen.getByRole("tab", { name: "历史会话" }))

    const list = await screen.findByRole("tabpanel")
    expect(within(list).getByText("未命名对话")).toBeInTheDocument()
    expect(within(list).queryByText(/条消息/)).not.toBeInTheDocument()
    expect(within(list).queryByText(/undefined/)).not.toBeInTheDocument()
  })

  it("历史会话底部继续输入写入被选中的会话，绝不写回最新会话", async () => {
    const calls: string[] = []
    // 两条会话都有后端 title：最新会话 / 旧会话，用来证明续聊按选中项分流。
    const latestSession = { ...SESSION, title: "最新会话第一句", messageCount: 1 }
    const oldSession = { ...OTHER_SESSION, title: "旧会话第一句", messageCount: 1 }
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([latestSession, oldSession])),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([profileTurn()])),
      http.get("/api/sessions/sess_1/messages", () =>
        HttpResponse.json([userSessionMessage("msg_new", "sess_1", 1, "最新会话第一句")]),
      ),
      http.get("/api/sessions/sess_old/turns", () =>
        HttpResponse.json([profileTurn({ id: "turn_old", sessionId: "sess_old" })]),
      ),
      http.get("/api/sessions/sess_old/messages", () =>
        HttpResponse.json([userSessionMessage("msg_old", "sess_old", 1, "旧会话第一句")]),
      ),
      http.post("/api/sessions/sess_1/messages", () => {
        calls.push("write:latest")
        return HttpResponse.json({}, { status: 500 })
      }),
      http.post("/api/sessions/sess_1/runs", () => {
        calls.push("run:latest")
        return HttpResponse.json({ runId: "run_wrong", status: "started" }, { status: 202 })
      }),
      http.post("/api/sessions/sess_old/messages", async ({ request }) => {
        const body = (await request.json()) as { seq: number; role: string; content: { content: string } }
        calls.push("write:old:" + body.content.content)
        return HttpResponse.json(
          { id: "msg_old_2", sessionId: "sess_old", seq: body.seq, role: body.role, content: body.content, createdAt: "2026-10-01T00:00:00Z" },
          { status: 201 },
        )
      }),
      http.post("/api/sessions/sess_old/runs", async ({ request }) => {
        const body = (await request.json()) as { prompt: string }
        calls.push("run:old:" + body.prompt)
        return HttpResponse.json({ runId: "run_old", status: "started" }, { status: 202 })
      }),
    )

    renderAssistant()
    await screen.findByRole("button", { name: "新建对话" })
    fireEvent.click(screen.getByRole("tab", { name: "历史会话" }))

    const list = await screen.findByRole("tabpanel")
    fireEvent.click(within(list).getByRole("button", { name: /旧会话第一句/ }))

    const box = await screen.findByPlaceholderText("在这个会话继续对话…")
    fireEvent.change(box, { target: { value: "再补充一条经历" } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => expect(calls).toContain("run:old:再补充一条经历"))
    expect(calls).toContain("write:old:再补充一条经历")
    // 负向：不得写回当前/最新会话。
    expect(calls).not.toContain("write:latest")
    expect(calls).not.toContain("run:latest")
  })

  it("已配置但凭据被上游拒绝时不放行聊天，且只透出上游掩码尾号", async () => {
    server.use(
      http.get("/api/models/config", () =>
        HttpResponse.json({
          ...MODEL_CONFIG,
          keyConfigured: true,
          lastTest: { at: "2026-10-01T00:00:00Z", ok: false, message: "HTTP 401 unauthorized: api key ****be21 rejected" },
        }),
      ),
    )

    renderAssistant()

    expect(await screen.findByText("当前 Key 被模型服务拒绝了")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去更新 Key" })).toBeInTheDocument()
    expect(screen.getByText(/\*\*\*\*be21/)).toBeInTheDocument()
    // 不放行聊天：没有输入框，也没有「开始聊聊」。
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "开始聊聊" })).not.toBeInTheDocument()
    // 负向：不出现认证头与堆栈。
    expect(screen.queryByText(/Authorization/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Traceback/)).not.toBeInTheDocument()
  })

  it("凭据线索不是掩码形态时界面不渲染明文 key", async () => {
    const fullKey = "sk-live-abcdef1234567890"
    server.use(
      http.get("/api/models/config", () =>
        HttpResponse.json({
          ...MODEL_CONFIG,
          keyConfigured: true,
          lastTest: { at: "2026-10-01T00:00:00Z", ok: false, message: "HTTP 401 unauthorized: api key " + fullKey + " rejected" },
        }),
      ),
    )

    renderAssistant()

    expect(await screen.findByText("当前 Key 被模型服务拒绝了")).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(fullKey))).not.toBeInTheDocument()
    expect(screen.queryByText(/sk-live/)).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("轮次带 runError 时在抽屉内展示错误块，且不含完整 key / Authorization / Traceback", async () => {
    const runError = {
      code: "MODEL_AUTH_FAILED",
      category: "auth",
      message: "上游 401 拒绝：key ****be21",
      provider: "openai",
      model: "gpt-4o-mini",
      keyHint: "****be21",
    }
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/sessions/sess_1/turns", () => HttpResponse.json([profileTurn({ runError })])),
      http.get("/api/sessions/sess_1/messages", () => HttpResponse.json([])),
    )

    renderAssistant()

    const block = await screen.findByTestId("run-error")
    expect(block).toHaveTextContent("模型鉴权失败")
    expect(block).toHaveTextContent("openai / gpt-4o-mini")
    expect(block).toHaveTextContent("****be21")
    expect(screen.getByRole("button", { name: "去设置更新 Key" })).toBeInTheDocument()
    expect(screen.queryByText(/Authorization/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Traceback/)).not.toBeInTheDocument()
    expect(screen.queryByText(/sk-live/)).not.toBeInTheDocument()
  })

  it("runError 时可重试最近一次输入，重试真的再起一次 run", async () => {
    const runs: string[] = []
    server.use(
      http.get("/api/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/sessions/sess_1/turns", () =>
        HttpResponse.json([profileTurn({ runError: { code: "MODEL_AUTH_FAILED", category: "auth", message: "上游拒绝 ****be21", provider: "openai", model: "gpt-4o-mini", keyHint: "****be21" } })]),
      ),
      http.get("/api/sessions/sess_1/messages", () => HttpResponse.json([])),
      http.post("/api/sessions/sess_1/messages", async ({ request }) => {
        const body = (await request.json()) as { seq: number; role: string; content: unknown }
        return HttpResponse.json(
          { id: "msg_r", sessionId: "sess_1", seq: body.seq, role: body.role, content: body.content, createdAt: "2026-10-01T00:00:00Z" },
          { status: 201 },
        )
      }),
      http.post("/api/sessions/sess_1/runs", async ({ request }) => {
        const body = (await request.json()) as { prompt: string }
        runs.push(body.prompt)
        return HttpResponse.json({ runId: "run_r", status: "started" }, { status: 202 })
      }),
    )

    renderAssistant()
    const box = await screen.findByRole("textbox")
    fireEvent.change(box, { target: { value: "补充一段经历" } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))
    await waitFor(() => expect(runs).toEqual(["补充一段经历"]))

    fireEvent.click(await screen.findByRole("button", { name: "重试" }))
    await waitFor(() => expect(runs).toEqual(["补充一段经历", "补充一段经历"]))
  })
})
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { approvePendingAction, getActiveRun, rejectPendingAction, startRun } from "@/lib/api"
import { server } from "@/test-server"

const TURN = {
  id: "turn_1",
  resumeId: "res_1",
  clientId: "external",
  source: "agent",
  executionMode: "approval",
  modeSource: "account",
  state: "open",
  baseVersionId: "ver_0",
  sessionId: "sess_1",
  message: "帮我改简历",
  createdAt: "2026-01-01T00:00:00Z",
  closedAt: null,
  result: null,
  pendingActions: [
    {
      id: "pa_1",
      userTurnId: "turn_1",
      kind: "content_patch",
      title: "强化性能成果",
      targetResource: "职业经历",
      baseVersionId: "ver_0",
      impactSummary: "1 处变更",
      requiresTextConfirm: false,
      state: "pending",
      staleReason: null,
      diff: [
        { id: "d_1", target: "经历", changeType: "modified", before: "a", after: "b", reason: "r", state: "pending" },
      ],
      createdAt: "2026-01-01T00:00:00Z",
      decidedAt: null,
    },
  ],
}

describe("getActiveRun", () => {
  it("returns null when the resume has no turns", async () => {
    server.use(http.get("/api/resumes/:id/turns", () => HttpResponse.json([])))

    await expect(getActiveRun("res_1")).resolves.toBeNull()
  })

  it("maps the newest open turn into an AgentRun", async () => {
    const calls: string[] = []
    server.use(
      http.get("/api/resumes/:id/turns", () => {
        calls.push("list")
        return HttpResponse.json([TURN])
      }),
      http.get("/api/turns/:id/state", () => {
        calls.push("state")
        return HttpResponse.json({
          turnId: "turn_1",
          runState: { budget: { tokensUsed: 30, maxTokens: 100, turnsUsed: 2, maxTurns: 8, costUsedUsd: 0.02 } },
          stateVersion: 1,
        })
      }),
    )

    const run = await getActiveRun("res_1")

    expect(calls).toEqual(["list", "state"])
    expect(run?.id).toBe("turn_1")
    expect(run?.resumeId).toBe("res_1")
    expect(run?.userTurnId).toBe("turn_1")
    expect(run?.conversationId).toBe("sess_1")
    expect(run?.executionMode).toBe("approval")
    expect(run?.modeSource).toBe("account")
    expect(run?.state).toBe("awaiting_confirm")
    expect(run?.budget).toEqual({ usedTokens: 30, maxTokens: 100, usedTurns: 2, maxTurns: 8, costUsd: 0.02 })
    expect(run?.pendingActions[0]?.id).toBe("pa_1")
    expect(run?.pendingActions[0]?.state).toBe("pending")
    expect(run?.pendingActions[0]?.diff?.[0]?.after).toBe("b")
    expect(run?.timeline.some((event) => event.text === "帮我改简历")).toBe(true)
  })

  it("finds a preview-only open turn while the working copy is still empty", async () => {
    const previewOnly = {
      ...TURN,
      id: "turn_preview",
      pendingActions: [{ ...TURN.pendingActions[0], id: "pa_preview", userTurnId: "turn_preview" }],
    }
    server.use(
      http.get("/api/resumes/:id/working-document", () =>
        HttpResponse.json({ resumeId: "res_1", document: {}, baseVersionId: null, userTurnId: null, workingRevision: 0, dirty: false }),
      ),
      http.get("/api/resumes/:id/turns", () => HttpResponse.json([previewOnly])),
      http.get("/api/turns/:id/state", () => HttpResponse.json({ turnId: "turn_preview", runState: {}, stateVersion: 0 })),
    )

    const run = await getActiveRun("res_1")

    expect(run?.id).toBe("turn_preview")
    expect(run?.state).toBe("awaiting_confirm")
    expect(run?.pendingActions.map((action) => action.id)).toEqual(["pa_preview"])
  })

  it("falls back to the newest finalized turn so the conversation survives finalize", async () => {
    const closed = {
      ...TURN,
      id: "turn_done",
      state: "finalized",
      closedAt: "2026-01-01T00:05:00Z",
      result: { state: "finalized", resumeId: "res_1", versionId: "ver_1", changeCount: 1, affectedSections: ["基础信息"], message: "已提交 1 处修改" },
      pendingActions: [{ ...TURN.pendingActions[0], userTurnId: "turn_done", state: "consumed" }],
    }
    server.use(
      // 真实后端按 state 过滤：只查 open 时这里必须返回空，否则这个用例测不出缺陷。
      http.get("/api/resumes/:id/turns", ({ request }) => {
        const state = new URL(request.url).searchParams.get("state")
        return HttpResponse.json(state === "open" ? [] : [closed])
      }),
      http.get("/api/turns/:id/state", () => HttpResponse.json({ turnId: "turn_done", runState: {}, stateVersion: 0 })),
      http.get("/api/sessions/:id/messages", () => HttpResponse.json([])),
    )

    const run = await getActiveRun("res_1")

    expect(run?.id).toBe("turn_done")
    expect(run?.state).toBe("turn_closed")
    expect(run?.timeline.some((event) => event.kind === "finalize" && event.text === "已提交 1 处修改")).toBe(true)
  })

  it("projects the session conversation into the timeline and keeps one user bubble", async () => {
    const sessionMessages = [
      { id: "m1", sessionId: "sess_1", seq: 1, role: "system", content: { role: "system", content: "system prompt" }, createdAt: "2026-01-01T00:00:00Z" },
      { id: "m2", sessionId: "sess_1", seq: 2, role: "user", content: { role: "user", content: "帮我改简历" }, createdAt: "2026-01-01T00:00:01Z" },
      { id: "m3", sessionId: "sess_1", seq: 3, role: "assistant", content: { role: "assistant", content: "先读工作副本。", toolCalls: [{ id: "c1", name: "get_working_document", arguments: { resume_id: "res_1" } }] }, createdAt: "2026-01-01T00:00:02Z" },
      { id: "m4", sessionId: "sess_1", seq: 4, role: "assistant", content: { text: "已生成待确认的修改。" }, createdAt: "2026-01-01T00:00:03Z" },
    ]
    server.use(
      http.get("/api/resumes/:id/turns", () => HttpResponse.json([TURN])),
      http.get("/api/turns/:id/state", () => HttpResponse.json({ turnId: "turn_1", runState: {}, stateVersion: 0 })),
      http.get("/api/sessions/:id/messages", () => HttpResponse.json(sessionMessages)),
    )

    const run = await getActiveRun("res_1")

    expect(run?.timeline.filter((event) => event.kind === "message" && event.role === "user")).toHaveLength(1)
    expect(run?.timeline.some((event) => event.text === "先读工作副本。")).toBe(true)
    expect(run?.timeline.some((event) => event.text === "已生成待确认的修改。")).toBe(true)
    expect(run?.timeline.some((event) => event.kind === "tool_progress" && event.toolName === "get_working_document")).toBe(true)
    expect(run?.timeline.some((event) => event.text === "system prompt")).toBe(false)
  })

  it("keeps the turn projection when the session conversation cannot be read", async () => {
    server.use(
      http.get("/api/resumes/:id/turns", () => HttpResponse.json([TURN])),
      http.get("/api/turns/:id/state", () => HttpResponse.json({ turnId: "turn_1", runState: {}, stateVersion: 0 })),
      http.get("/api/sessions/:id/messages", () => HttpResponse.json({ code: "FORBIDDEN", message: "nope" }, { status: 403 })),
    )

    const run = await getActiveRun("res_1")

    expect(run?.timeline.some((event) => event.text === "帮我改简历")).toBe(true)
  })

  it("skips the conversation query when withConversation is false", async () => {
    const calls: string[] = []
    server.use(
      http.get("/api/resumes/:id/turns", () => HttpResponse.json([TURN])),
      http.get("/api/turns/:id/state", () => HttpResponse.json({ turnId: "turn_1", runState: {}, stateVersion: 0 })),
      http.get("/api/sessions/:id/messages", () => {
        calls.push("messages")
        return HttpResponse.json([])
      }),
    )

    await getActiveRun("res_1", { withConversation: false })

    expect(calls).toEqual([])
  })
})

describe("pending action decisions", () => {
  it("POSTs the real approve and reject endpoints", async () => {
    const seen: string[] = []
    server.use(
      http.post("/api/pending-actions/:id/approve", ({ params }) => {
        seen.push("approve:" + params.id)
        return HttpResponse.json({ ...TURN.pendingActions[0], state: "approved" })
      }),
      http.post("/api/pending-actions/:id/reject", ({ params }) => {
        seen.push("reject:" + params.id)
        return HttpResponse.json({ ...TURN.pendingActions[0], state: "rejected" })
      }),
    )

    await approvePendingAction("pa_1")
    await rejectPendingAction("pa_1")

    expect(seen).toEqual(["approve:pa_1", "reject:pa_1"])
  })
})

describe("会话连续性：同一简历多轮共用会话", () => {
  it("startRun 带上当前轮次的 sessionId", async () => {
    let body: Record<string, unknown> | null = null
    server.use(
      http.post("/api/resumes/:id/runs", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ runId: "run_1", status: "started" }, { status: 202 })
      }),
    )

    await startRun("res_1", { prompt: "突出性能优化", executionMode: "approval", sessionId: "sess_1" })

    expect(body).toEqual({ prompt: "突出性能优化", executionMode: "approval", sessionId: "sess_1" })
  })

  it("没有已知会话时不发 sessionId，由运行体首次建会话", async () => {
    let body: Record<string, unknown> | null = null
    server.use(
      http.post("/api/resumes/:id/runs", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ runId: "run_1", status: "started" }, { status: 202 })
      }),
    )

    await startRun("res_1", { prompt: "突出性能优化" })

    expect(body).toEqual({ prompt: "突出性能优化" })
  })
})

describe("跨轮次聚合历史对话与未决待办", () => {
  const older = {
    ...TURN,
    id: "turn_old",
    state: "finalized",
    closedAt: "2026-01-01T00:00:10Z",
    sessionId: "sess_old",
    message: null,
    pendingActions: [
      { ...TURN.pendingActions[0], id: "pa_old", userTurnId: "turn_old", state: "stale", staleReason: "轮次已结束" },
      { ...TURN.pendingActions[0], id: "pa_done", userTurnId: "turn_old", state: "consumed" },
    ],
  }

  it("合并历史轮次的会话消息与未决待办，切分会话也不丢历史", async () => {
    server.use(
      http.get("/api/resumes/:id/turns", () => HttpResponse.json([TURN, older])),
      http.get("/api/turns/:id/state", () => HttpResponse.json({ turnId: "turn_1", runState: {}, stateVersion: 0 })),
      http.get("/api/sessions/sess_1/messages", () =>
        HttpResponse.json([
          { id: "m2", sessionId: "sess_1", seq: 2, role: "user", content: { role: "user", content: "帮我改简历" }, createdAt: "2026-01-01T00:00:05Z" },
        ]),
      ),
      http.get("/api/sessions/sess_old/messages", () =>
        HttpResponse.json([
          { id: "m1", sessionId: "sess_old", seq: 2, role: "user", content: { role: "user", content: "把一句话头衔改成资深后端工程师" }, createdAt: "2026-01-01T00:00:01Z" },
        ]),
      ),
    )

    const run = await getActiveRun("res_1")

    expect(
      run?.timeline.filter((event) => event.kind === "message" && event.role === "user").map((event) => event.text),
    ).toEqual(["把一句话头衔改成资深后端工程师", "帮我改简历"])
    expect(run?.pendingActions.map((action) => action.id)).toEqual(["pa_1", "pa_old"])
  })

  it("历史轮次会话读不到时仍返回当前轮次", async () => {
    server.use(
      http.get("/api/resumes/:id/turns", () => HttpResponse.json([TURN, older])),
      http.get("/api/turns/:id/state", () => HttpResponse.json({ turnId: "turn_1", runState: {}, stateVersion: 0 })),
      http.get("/api/sessions/sess_1/messages", () => HttpResponse.json([])),
      http.get("/api/sessions/sess_old/messages", () => HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 })),
    )

    const run = await getActiveRun("res_1")

    expect(run?.id).toBe("turn_1")
    expect(run?.timeline.some((event) => event.text === "帮我改简历")).toBe(true)
  })
})

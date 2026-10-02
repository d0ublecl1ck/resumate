// 会话层与 profile 作用域 run 的客户端契约（docs/agent/agent-operation-api.md §19 / §21）。
// 每个用例断言真实的 METHOD + path 与请求体，避免用 mock 兜底掩盖契约漂移。

import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import {
  appendSessionMessage,
  createSession,
  listSessionMessages,
  listSessionTurns,
  listSessions,
  mapPendingAction,
  startProfileRun,
} from "@/lib/api"
import type { ApiTurnPendingAction } from "@/lib/types"
import { server } from "@/test-server"

const SESSION = {
  id: "sess_1",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  lastActiveAt: "2026-10-01T00:00:00Z",
}

const TURN = {
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
}

describe("agent sessions", () => {
  it("POSTs /sessions to create and GETs /sessions to list, newest activity first", async () => {
    const seen: string[] = []
    server.use(
      http.post("/api/sessions", () => {
        seen.push("POST /sessions")
        return HttpResponse.json(SESSION, { status: 201 })
      }),
      http.get("/api/sessions", () => {
        seen.push("GET /sessions")
        return HttpResponse.json([SESSION])
      }),
    )

    await expect(createSession()).resolves.toEqual(SESSION)
    await expect(listSessions()).resolves.toEqual([SESSION])
    expect(seen).toEqual(["POST /sessions", "GET /sessions"])
  })

  it("only sends afterSeq when it is greater than zero", async () => {
    const urls: string[] = []
    server.use(
      http.get("/api/sessions/:id/messages", ({ request }) => {
        urls.push(new URL(request.url).pathname + new URL(request.url).search)
        return HttpResponse.json([])
      }),
    )

    await listSessionMessages("sess_1")
    await listSessionMessages("sess_1", 3)

    expect(urls).toEqual(["/api/sessions/sess_1/messages", "/api/sessions/sess_1/messages?afterSeq=3"])
  })

  it("appends a caller-allocated seq with role and content", async () => {
    let body: unknown
    server.use(
      http.post("/api/sessions/:id/messages", async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ id: "msg_1", sessionId: "sess_1", seq: 4, role: "user", content: { role: "user", content: "你好" }, createdAt: "2026-10-01T00:00:00Z" }, { status: 201 })
      }),
    )

    const message = await appendSessionMessage("sess_1", { seq: 4, role: "user", content: { role: "user", content: "你好" } })

    expect(body).toEqual({ seq: 4, role: "user", content: { role: "user", content: "你好" } })
    expect(message.seq).toBe(4)
  })
})

describe("profile-scoped turns and runs", () => {
  it("GETs /sessions/{id}/turns and maps a profile pending action", async () => {
    const pending: ApiTurnPendingAction = {
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
    server.use(http.get("/api/sessions/:id/turns", () => HttpResponse.json([{ ...TURN, pendingActions: [pending] }])))

    const turns = await listSessionTurns("sess_1")

    expect(turns).toHaveLength(1)
    expect(turns[0]?.scope).toBe("profile")
    expect(turns[0]?.resumeId).toBeNull()
    const action = mapPendingAction(turns[0]!.pendingActions![0]!)
    expect(action.kind).toBe("profile_change")
    expect(action.targetResource).toBe("")
    expect(action.state).toBe("pending")
  })

  it("POSTs /sessions/{id}/runs with the prompt and accepts a 202", async () => {
    let body: unknown
    server.use(
      http.post("/api/sessions/:id/runs", async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ runId: "run_1", status: "started" }, { status: 202 })
      }),
    )

    await expect(startProfileRun("sess_1", "把城市改成北京")).resolves.toEqual({ runId: "run_1", status: "started" })
    expect(body).toEqual({ prompt: "把城市改成北京" })
  })
})

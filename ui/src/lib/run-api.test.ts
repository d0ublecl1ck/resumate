import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { approvePendingAction, getActiveRun, rejectPendingAction } from "@/lib/api"
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

function noWorkingTurn() {
  return http.get("/api/resumes/:id/working-document", () =>
    HttpResponse.json({ resumeId: "res_1", document: {}, baseVersionId: null, userTurnId: null, workingRevision: 0, dirty: false }),
  )
}

describe("getActiveRun", () => {
  it("returns undefined when the resume has no working turn", async () => {
    server.use(noWorkingTurn())

    await expect(getActiveRun("res_1")).resolves.toBeUndefined()
  })

  it("maps the real turn projection into an AgentRun", async () => {
    const calls: string[] = []
    server.use(
      http.get("/api/resumes/:id/working-document", () =>
        HttpResponse.json({ resumeId: "res_1", document: {}, baseVersionId: "ver_0", userTurnId: "turn_1", workingRevision: 1, dirty: true }),
      ),
      http.get("/api/turns/:id", ({ params }) => {
        calls.push("turn:" + params.id)
        return HttpResponse.json(TURN)
      }),
      http.get("/api/turns/:id/state", () =>
        HttpResponse.json({
          turnId: "turn_1",
          runState: { budget: { tokensUsed: 30, maxTokens: 100, turnsUsed: 2, maxTurns: 8, costUsedUsd: 0.02 } },
          stateVersion: 1,
        }),
      ),
    )

    const run = await getActiveRun("res_1")

    expect(calls).toEqual(["turn:turn_1"])
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

  it("maps a closed turn to turn_closed without pending gates", async () => {
    server.use(
      http.get("/api/resumes/:id/working-document", () =>
        HttpResponse.json({ resumeId: "res_1", document: {}, baseVersionId: null, userTurnId: "turn_1", workingRevision: 0, dirty: false }),
      ),
      http.get("/api/turns/:id", () =>
        HttpResponse.json({
          ...TURN,
          state: "finalized",
          closedAt: "2026-01-01T00:05:00Z",
          pendingActions: [],
          result: { state: "finalized", versionId: "ver_1", changeCount: 1, message: "已完成" },
        }),
      ),
      http.get("/api/turns/:id/state", () => HttpResponse.json({ turnId: "turn_1", runState: {}, stateVersion: 3 })),
    )

    const run = await getActiveRun("res_1")

    expect(run?.state).toBe("turn_closed")
    expect(run?.pendingActions).toEqual([])
    expect(run?.timeline.some((event) => event.text === "已完成")).toBe(true)
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

// Storybook confirmation artifact for 对话区接历史会话（f8642）：
// 当前 Run / 历史会话列表 / 历史会话详情 + 继续对话，数据由 MSW 按冻结契约提供。
// 会话只绑 owner、scope 是轮次属性（契约 §19.1 / §21.1）；继续对话写回同一会话。
import { MemoryRouter } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { ResumeChatPanel } from "@/components/resume-chat-panel"
import { MODEL_CONFIG } from "@/lib/content"
import { StoryProviders } from "@/storybook/screen"
import type { AgentRun } from "@/lib/types"
import { worker } from "@/mocks/browser"

const SESSIONS = [
  { id: "sess_000000000001", createdAt: "2026-09-30T09:00:00Z", updatedAt: "2026-10-01T02:10:00Z", lastActiveAt: "2026-10-01T02:10:00Z" },
  { id: "sess_000000000002", createdAt: "2026-09-29T08:00:00Z", updatedAt: "2026-09-30T18:00:00Z", lastActiveAt: "2026-09-30T18:00:00Z" },
]

const RUN: AgentRun = {
  id: "turn_story",
  resumeId: "res_1",
  conversationId: SESSIONS[1].id,
  userTurnId: "turn_story",
  executionMode: "approval",
  modeSource: "account",
  state: "running",
  budget: { usedTokens: 0, maxTokens: 0, usedTurns: 0, maxTurns: 0, costUsd: 0 },
  timeline: [],
  pendingActions: [],
}

// seq 故意留出空档并带 compaction 标记：详情仍按 SessionDetail 既有语义渲染。
const MESSAGES = [
  { id: "msg_p1", seq: 1, role: "user", content: { role: "user", content: "把项目经历第二条改得更量化" } }, // i18n-allow: 用户内容不翻译（US-13.4）
  { id: "msg_p2", seq: 2, role: "assistant", content: { role: "assistant", content: "先读一下工作副本。" } }, // i18n-allow: 用户内容不翻译（US-13.4）
  {
    id: "msg_p7",
    seq: 7,
    role: "system",
    content: {
      role: "system",
      content: "[compacted-history]\\nEarlier turns already loaded the working document.",
      compactedHistory: true,
      compactedMessages: 3,
    },
  },
]

function applyHandlers() {
  worker.use(
    http.get("/api/sessions", () => HttpResponse.json(SESSIONS)),
    http.get("/api/sessions/:id/messages", () => HttpResponse.json(MESSAGES)),
    http.post("/api/sessions/:id/messages", async ({ params, request }) => {
      const body = (await request.json()) as { seq: number; role: string; content: unknown }
      return HttpResponse.json(
        { id: `msg_${params.id}_${body.seq}`, sessionId: params.id, seq: body.seq, role: body.role, content: body.content, createdAt: new Date().toISOString() },
        { status: 201 },
      )
    }),
    http.post("/api/resumes/:id/runs", () => HttpResponse.json({ runId: "run_story", status: "started" }, { status: 202 })),
  )
}

function PanelFrame({ children }: { children: React.ReactNode }) {
  // ResumeChatPanel 的引导动作走 react-router navigate，与真实工作台一样需要 Router 上下文。
  return (
    <MemoryRouter>
      <div className="mx-auto h-[560px] max-w-md overflow-hidden rounded-xl border border-input bg-background">{children}</div>
    </MemoryRouter>
  )
}

/** AI 可用性四态的场景：未配置 / 凭据被拒 / 运行体未接入 / 可用。 */
type AvailabilityScenario = "missing" | "rejected" | "runtime_offline" | "available"

/** 用真实 GET /models/config 与 GET /agent/runtime 契约（MSW）驱动四态，先清掉其它 story 的 handler 覆盖。 */
function applyAvailability(scenario: AvailabilityScenario) {
  worker.resetHandlers()
  if (scenario === "missing") {
    worker.use(http.get("/api/models/config", () => HttpResponse.json({ ...MODEL_CONFIG, keyConfigured: false })))
  }
  if (scenario === "rejected") {
    worker.use(
      http.get("/api/models/config", () =>
        HttpResponse.json({
          ...MODEL_CONFIG,
          keyConfigured: true,
          lastTest: { at: "2026-10-10T09:15:00+08:00", ok: false, message: "Error code: 401 - api key ****be21 is invalid" },
        }),
      ),
    )
  }
  if (scenario === "runtime_offline") {
    worker.use(http.get("/api/agent/runtime", () => HttpResponse.json({ command: "resumate-agent", available: false })))
  }
}

function availabilityStory(scenario: AvailabilityScenario) {
  applyAvailability(scenario)
  // StoryProviders 提供隔离 QueryClient，让 story 也能在 story 渲染测试里独立跑。
  return (
    <StoryProviders>
      <PanelFrame>
        <ResumeChatPanel resumeId="res_1" run={RUN} mode="approval" />
      </PanelFrame>
    </StoryProviders>
  )
}

export default {
  title: "Pages/ResumeChatHistory",
  parameters: { layout: "fullscreen" },
}

export const CurrentRun = {
  render: () => (
    <PanelFrame>
      <ResumeChatPanel resumeId="res_1" run={null} mode="approval" />
    </PanelFrame>
  ),
}

export const HistoryList = {
  render: () => {
    applyHandlers()
    return (
      <PanelFrame>
        <ResumeChatPanel resumeId="res_1" run={RUN} mode="approval" initialView="history" />
      </PanelFrame>
    )
  },
}

export const HistoryDetail = {
  render: () => {
    applyHandlers()
    return (
      <PanelFrame>
        <ResumeChatPanel resumeId="res_1" run={RUN} mode="approval" initialView="history" initialSessionId={SESSIONS[0].id} />
      </PanelFrame>
    )
  },
}

/** AI 未配置（keyConfigured=false）：引导取代输入区，聊天不放行。 */
export const AvailabilityModelMissing = { render: () => availabilityStory("missing") }

/** 凭据被上游拒绝（401）：只显示已掩码尾号 ****be21 与「去更新 Key」。 */
export const AvailabilityAuthFailed = { render: () => availabilityStory("rejected") }

/** 已配置但运行体未接入：说明运行体不可用并拦截聊天。 */
export const AvailabilityRuntimeOffline = { render: () => availabilityStory("runtime_offline") }

/** 可用：正常放行，输入区与发送可见，不显示引导。 */
export const AvailabilityAvailable = { render: () => availabilityStory("available") }

// Components/RunPanel：对话区体验升级（issue 3fdec）的 Storybook 确认件。
// 面板数据来自 props（组件级 story），批准 / 发起运行等交互端点由 MSW 提供，不接真实后端。
// 折叠 / 展开、发送拦截、启动中、审批失败这几个态由 AutoDrive 在挂载后自动驱动，
// 保证 story 一打开就能看到目标状态；真实交互仍可继续手动操作。
import { useEffect, useRef, useState, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { delay, http, HttpResponse } from "msw"
import { RunPanel } from "@/components/run-panel"
import { worker } from "@/mocks/browser"
import i18n from "@/i18n"
import type { AgentRun, PendingAction, RunTimelineEvent } from "@/lib/types"

export default { title: "Components/RunPanel" }

const BUDGET = { usedTokens: 4200, maxTokens: 20000, usedTurns: 2, maxTurns: 8, costUsd: 0.03 }

function makeRun(overrides: Partial<AgentRun> & { timeline: RunTimelineEvent[] }): AgentRun {
  return {
    id: "turn_story",
    resumeId: "res_fe_lead",
    conversationId: "sess_story",
    sessionId: "sess_story",
    userTurnId: "turn_story",
    executionMode: "approval",
    modeSource: "session",
    state: "running",
    budget: BUDGET,
    pendingActions: [],
    ...overrides,
  }
}

const PENDING_ACTION: PendingAction = {
  id: "pa_story",
  kind: "content_patch",
  title: "强化性能优化成果",
  targetResource: "职业经历 · 高级前端工程师 · 第 2 条",
  baseVersionId: "v_fe_5",
  impactSummary: "1 处变更",
  requiresTextConfirm: false,
  state: "pending",
}

const CONVERSATION: RunTimelineEvent[] = [
  { id: "s1", kind: "message", at: "2026-10-08T10:00:00Z", role: "user", text: "帮我根据美团这份 JD 突出性能优化经历。" },
  { id: "s2", kind: "message", at: "2026-10-08T10:00:01Z", role: "agent", text: "先读工作副本，确认当前经历的写法。" },
  { id: "s3", kind: "tool_progress", at: "2026-10-08T10:00:02Z", toolName: "get_working_document", text: '{"resume_id":"res_fe_lead"}' },
  {
    id: "s4",
    kind: "message",
    at: "2026-10-08T10:00:03Z",
    role: "agent",
    text: "## 性能优化成果\n\n- 首屏加载从 **3.2s** 降到 `1.1s`\n- 缓存命中率提升到 **92%**\n\n> 依据当前工作副本，批准后写入正式版本。",
  },
  { id: "s5", kind: "finalize", at: "2026-10-08T10:00:04Z", role: "agent", text: "已生成一条待确认的量化改写，等待你的批准。" },
]

const LONG_RUN = makeRun({
  state: "running",
  timeline: [
    { id: "long-1", kind: "message", at: "2026-10-08T10:00:00Z", role: "user", text: "W".repeat(240) },
    { id: "long-2", kind: "tool_progress", at: "2026-10-08T10:00:01Z", toolName: "search_profile_facts", text: "{\"query\":\"性能优化 首屏 缓存\"}" },
    {
      id: "long-3",
      kind: "message",
      at: "2026-10-08T10:00:02Z",
      role: "agent",
      text: "超长回复用于检查气泡断行：" + "把每一段经历都改成可量化的结果，并保留事实来源。".repeat(24),
    },
  ],
})

function Panel({ run, defaultActivityOpen }: { run?: AgentRun | null; defaultActivityOpen?: boolean }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }))
  return (
    <QueryClientProvider client={client}>
      <div className="h-[560px] w-full bg-background p-4">
        <div className="card-soft mx-auto h-full max-w-2xl overflow-hidden">
          <RunPanel resumeId="res_fe_lead" run={run} mode="approval" defaultActivityOpen={defaultActivityOpen} />
        </div>
      </div>
    </QueryClientProvider>
  )
}

type Step = { delay: number; run: (root: HTMLElement) => void }

/** 挂载后按序驱动：先输入再点发送，中间留一帧让受控组件完成重渲染。 */
function AutoDrive({ steps, children }: { steps: Step[]; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !ref.current) return
    done.current = true
    const root = ref.current
    let cancelled = false
    void (async () => {
      for (const step of steps) {
        await new Promise((resolve) => setTimeout(resolve, step.delay))
        if (cancelled) return
        step.run(root)
      }
    })()
    return () => {
      cancelled = true
    }
  })
  return <div ref={ref}>{children}</div>
}

function typeInto(root: HTMLElement, value: string) {
  const input = root.querySelector("textarea")
  if (!input) return
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function clickButton(root: HTMLElement, label: string) {
  const target = [...root.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === label || button.textContent?.includes(label),
  )
  target?.click()
}

/** 默认态：有待审批待办 + Markdown 最终回复 + 折叠的推理与工具活动。 */
export const Default = {
  render: () => {
    worker.resetHandlers()
    return <Panel run={makeRun({ state: "awaiting_confirm", pendingActions: [PENDING_ACTION], timeline: CONVERSATION })} />
  },
}

/** 空态：没有轮次，输入框仍可用。 */
export const Empty = {
  render: () => {
    worker.resetHandlers()
    return <Panel run={null} />
  },
}

/** 加载中：点发送后运行体尚未建出新轮次，面板显示「正在启动运行体…」。 */
export const Starting = {
  render: () => {
    worker.resetHandlers()
    worker.use(
      http.post("/api/resumes/:id/runs", async () => {
        await delay("infinite")
        return HttpResponse.json({ runId: "run_never", status: "started" }, { status: 202 })
      }),
    )
    return (
      <AutoDrive
        steps={[
          { delay: 120, run: (root) => typeInto(root, "把项目经历第二条改得更量化") },
          { delay: 160, run: (root) => clickButton(root, i18n.t("workbench.run.sendAria")) },
        ]}
      >
        <Panel run={null} />
      </AutoDrive>
    )
  },
}

/** 错误态：批准失败就地报错（触发一次真实的 POST /pending-actions/:id/approve）。 */
export const ActionError = {
  render: () => {
    worker.resetHandlers()
    worker.use(
      http.post("/api/pending-actions/:id/approve", () =>
        HttpResponse.json({ code: "FORBIDDEN", message: "审批动作仅限人类会话" }, { status: 403 }),
      ),
    )
    return (
      <AutoDrive steps={[{ delay: 160, run: (root) => clickButton(root, i18n.t("common.actions.approve")) }]}>
        <Panel run={makeRun({ state: "awaiting_confirm", pendingActions: [PENDING_ACTION], timeline: CONVERSATION })} />
      </AutoDrive>
    )
  },
}

/** 超长消息：无空格长串与超长中文都在气泡内断行，不撑破卡片。 */
export const LongMessage = {
  render: () => {
    worker.resetHandlers()
    return <Panel run={LONG_RUN} />
  },
}

/** Markdown 消息：标题、无序列表、加粗、行内 code、引用。 */
export const MarkdownReply = {
  render: () => {
    worker.resetHandlers()
    return (
      <Panel
        run={makeRun({
          state: "turn_closed",
          timeline: [
            { id: "md-1", kind: "message", at: "2026-10-08T10:00:00Z", role: "user", text: "帮我把性能优化写进简历。" },
            {
              id: "md-2",
              kind: "message",
              at: "2026-10-08T10:00:01Z",
              role: "agent",
              text: "# 性能优化成果\n\n- 首屏加载从 **3.2s** 降到 `1.1s`\n- 缓存命中率提升到 **92%**\n- 首屏 JS 体积减少 **38%**\n\n> 数据来自当前工作副本与 Profile 事实，批准后写入正式版本。",
            },
          ],
        })}
      />
    )
  },
}

/** 折叠态：推理与工具活动块收起，只显示条目数。 */
export const ActivityCollapsed = {
  render: () => {
    worker.resetHandlers()
    return <Panel run={makeRun({ state: "turn_closed", timeline: CONVERSATION })} defaultActivityOpen={false} />
  },
}

/** 展开态：推理与工具活动块展开，逐行显示中间回复与工具调用。 */
export const ActivityExpanded = {
  render: () => {
    worker.resetHandlers()
    return <Panel run={makeRun({ state: "turn_closed", timeline: CONVERSATION })} defaultActivityOpen />
  },
}

/** 发送拦截：当前轮次仍有 pending 待办，发送先弹确认框，确认后才发起运行。 */
export const SendBlocked = {
  render: () => {
    worker.resetHandlers()
    return (
      <AutoDrive
        steps={[
          { delay: 120, run: (root) => typeInto(root, "重新总结这一轮的改动") },
          { delay: 160, run: (root) => clickButton(root, i18n.t("workbench.run.sendAria")) },
        ]}
      >
        <Panel run={makeRun({ state: "awaiting_confirm", pendingActions: [PENDING_ACTION], timeline: CONVERSATION })} />
      </AutoDrive>
    )
  },
}

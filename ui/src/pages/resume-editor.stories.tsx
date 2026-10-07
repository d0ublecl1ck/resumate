// SCR-003 简历编辑工作台。空闲自动保存（C-05）的开关与间隔来自 /api/settings，
// story 用共享 MSW worker 覆写该端点，其余数据仍走默认 handlers。
import { http, HttpResponse } from "msw"
import { USER_PREFERENCES } from "@/lib/content"
import { worker } from "@/mocks/browser"
import { Screen } from "@/storybook/screen"
import { ResumeEditorPage } from "./resume-editor"

export default { title: "Pages/ResumeEditor" }

/** 每个 story 先恢复默认 handlers，再按场景覆写偏好设置。 */
function applyPreferences(autosave: boolean, autosaveIntervalSeconds = 10) {
  worker.resetHandlers()
  worker.use(http.get("/api/settings", () => HttpResponse.json({ ...USER_PREFERENCES, autosave, autosaveIntervalSeconds })))
}

export const WithActiveRun = {
  render: () => (
    <Screen path="/resumes/res_fe_lead" routePath="/resumes/:id">
      <ResumeEditorPage />
    </Screen>
  ),
}

export const WithoutActiveRun = {
  render: () => (
    <Screen path="/resumes/res_pm_pivot" routePath="/resumes/:id">
      <ResumeEditorPage />
    </Screen>
  ),
}

/** 默认态：自动保存开启、10 秒静默。改任意字段后徽标旁出现倒计时，约 1.5 秒后草稿进入服务端缓冲。 */
export const AutosaveOn = {
  render: () => {
    applyPreferences(true, 10)
    return (
      <Screen path="/resumes/res_fe_lead" routePath="/resumes/:id">
        <ResumeEditorPage />
      </Screen>
    )
  },
}

/** 关闭自动保存：不再倒计时，草稿只同步到服务端缓冲，需要手动点「保存（flush）」才生成版本。 */
export const AutosaveOff = {
  render: () => {
    applyPreferences(false)
    return (
      <Screen path="/resumes/res_fe_lead" routePath="/resumes/:id">
        <ResumeEditorPage />
      </Screen>
    )
  },
}

/** 极端间隔：静默秒数按设置走，验证长间隔下倒计时文案与布局不破。 */
export const AutosaveLongInterval = {
  render: () => {
    applyPreferences(true, 120)
    return (
      <Screen path="/resumes/res_fe_lead" routePath="/resumes/:id">
        <ResumeEditorPage />
      </Screen>
    )
  },
}

/** 已 finalize 的最近一轮：active-run 仍取最新轮次，对话与 Agent 最终回复留在面板里。 */
const FINALIZED_TURN = {
  id: "turn_now",
  resumeId: "res_fe_lead",
  clientId: "external",
  source: "agent",
  executionMode: "approval",
  modeSource: "session",
  state: "finalized",
  baseVersionId: "ver_fe_5",
  sessionId: "sess_now",
  message: "",
  createdAt: "2026-09-20T14:30:00+08:00",
  closedAt: "2026-09-20T14:31:00+08:00",
  result: {
    state: "finalized",
    resumeId: "res_fe_lead",
    versionId: "ver_fe_6",
    changeCount: 1,
    affectedSections: ["职业经历"], // i18n-allow: MSW mock 的服务端章节名，属后端数据不翻译（US-13.4）
    message: "已提交「强化性能优化量化成果」", // i18n-allow: MSW mock 的轮次结果文案，属后端数据不翻译（US-13.4）
  },
  pendingActions: [],
}

/** 轮次结束后（turn_closed）不再回到空态：会话消息合成的时间线仍是面板内容。 */
export const ConversationAfterFinalize = {
  render: () => {
    applyPreferences(false)
    worker.use(http.get("/api/resumes/:id/turns", () => HttpResponse.json([FINALIZED_TURN])))
    return (
      <Screen path="/resumes/res_fe_lead" routePath="/resumes/:id">
        <ResumeEditorPage />
      </Screen>
    )
  },
}

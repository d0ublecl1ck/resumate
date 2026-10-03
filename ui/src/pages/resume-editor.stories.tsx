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

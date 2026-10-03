import { http, HttpResponse } from "msw"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { USER_PREFERENCES } from "@/lib/content"
import { worker } from "@/mocks/browser"
import { StoryProviders } from "@/storybook/screen"
import { SettingsLayout } from "./settings-layout"

export default { title: "Pages/Settings" }

/** 自动保存分区：开关与静默秒数同属「个人偏好」，story 覆写 /api/settings 展示两种态。 */
function SettingsScreen({ path, autosave = true }: { path: string; autosave?: boolean }) {
  worker.resetHandlers()
  worker.use(http.get("/api/settings", () => HttpResponse.json({ ...USER_PREFERENCES, autosave })))
  return (
    <StoryProviders>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/settings/*"
            element={
              <AppShell>
                <SettingsLayout />
              </AppShell>
            }
          />
        </Routes>
      </MemoryRouter>
    </StoryProviders>
  )
}

export const Default = {
  render: () => <SettingsScreen path="/settings" />,
}

/** 关闭自动保存：间隔输入框禁用，简历编辑器里不再倒计时。 */
export const AutosaveOff = {
  render: () => <SettingsScreen path="/settings" autosave={false} />,
}

export const Backup = {
  render: () => <SettingsScreen path="/settings/backup" />,
}

export const Access = {
  render: () => <SettingsScreen path="/settings/access" />,
}

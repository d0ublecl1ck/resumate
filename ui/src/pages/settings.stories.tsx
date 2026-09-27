import type { ReactNode } from "react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { StoryProviders } from "@/storybook/screen"
import { SettingsLayout } from "./settings-layout"
import { SettingsPage } from "./settings"
import { BackupPage } from "./settings-backup"
import { AccessPage } from "./settings-access"

export default { title: "Pages/Settings" }

function SettingsScreen({ path, child }: { path: string; child: ReactNode }) {
  const childPath = path.replace("/settings", "").replace(/^\//, "")
  return (
    <StoryProviders>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/settings"
            element={
              <AppShell>
                <SettingsLayout />
              </AppShell>
            }
          >
            {childPath ? <Route path={childPath} element={child} /> : <Route index element={child} />}
          </Route>
        </Routes>
      </MemoryRouter>
    </StoryProviders>
  )
}

export const Default = {
  render: () => <SettingsScreen path="/settings" child={<SettingsPage />} />,
}

export const Backup = {
  render: () => <SettingsScreen path="/settings/backup" child={<BackupPage />} />,
}

export const Access = {
  render: () => <SettingsScreen path="/settings/access" child={<AccessPage />} />,
}

import { MemoryRouter, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { StoryProviders } from "@/storybook/screen"
import { SettingsLayout } from "./settings-layout"

export default { title: "Pages/Settings" }

function SettingsScreen({ path }: { path: string }) {
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

export const Backup = {
  render: () => <SettingsScreen path="/settings/backup" />,
}

export const Access = {
  render: () => <SettingsScreen path="/settings/access" />,
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom"
import { ApiRequestError } from "@/lib/api-client"
import { AppShell } from "@/components/app-shell"
import { WorkbenchPage } from "@/pages/workbench"
import { ResumesPage } from "@/pages/resumes"
import { ResumeEditorPage } from "@/pages/resume-editor"
import { ResumeVersionsPage } from "@/pages/resume-versions"
import { JdsPage } from "@/pages/jds"
import { JdDetailPage } from "@/pages/jd-detail"
import { ProfilePage } from "@/pages/profile"
import { SettingsLayout } from "@/pages/settings-layout"
import { SettingsPage } from "@/pages/settings"
import { BackupPage } from "@/pages/settings-backup"
import { AccessPage } from "@/pages/settings-access"
import { TemplatesPage } from "@/pages/templates"
import { TemplateEditorPage } from "@/pages/template-editor"
import { NotFoundPage } from "@/pages/not-found"
import { LoginPage } from "@/pages/login"
import { RequireAuth } from "@/components/require-auth"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx 是确定性业务结果（如 404），重试没有意义，还会拖慢错误态展示。
      retry: (failureCount, error) => {
        if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false
        return failureCount < 2
      },
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppShell>
                  <Outlet />
                </AppShell>
              </RequireAuth>
            }
          >
            <Route index element={<WorkbenchPage />} />
            <Route path="resumes" element={<ResumesPage />} />
            <Route path="resumes/:id" element={<ResumeEditorPage />} />
            <Route path="resumes/:id/versions" element={<ResumeVersionsPage />} />
            <Route path="jds" element={<JdsPage />} />
            <Route path="jds/:id" element={<JdDetailPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<SettingsPage />} />
              <Route path="backup" element={<BackupPage />} />
              <Route path="access" element={<AccessPage />} />
            </Route>
            <Route path="admin/templates" element={<TemplatesPage />} />
            <Route path="admin/templates/:id" element={<TemplateEditorPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App

import "@/i18n"
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
import { InterviewPage } from "@/pages/interview"
import { InterviewSessionPage } from "@/pages/interview-session"
import { BankScreen } from "@/features/interview/bank-screen"
import { WrittenScreen } from "@/features/interview/written-screen"
import { GrowthScreen } from "@/features/interview/growth-screen"
import { HistoryScreen } from "@/features/interview/history-screen"
import { PlanScreen } from "@/features/interview/plan-screen"
import { QuestionsScreen } from "@/features/interview/questions-screen"
import { SetupScreen } from "@/features/interview/setup-screen"
import { ProfilePage } from "@/pages/profile"
import { SettingsLayout } from "@/pages/settings-layout"
import { RbacPage } from "@/pages/rbac"
import { UsersPage } from "@/pages/users"
import { TemplatesPage } from "@/pages/templates"
import { TemplateEditorPage } from "@/pages/template-editor"
import { NotFoundPage } from "@/pages/not-found"
import { LoginPage } from "@/pages/login"
import { ForgotPasswordPage } from "@/pages/forgot-password"
import { ResetPasswordPage } from "@/pages/reset-password"
import { VerifyEmailPage } from "@/pages/verify-email"
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
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="verify-email" element={<VerifyEmailPage />} />
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
            <Route path="interview" element={<InterviewPage />} />
            {/* 具体路径必须排在 interview/:id 之前，否则会被参数路由吞掉。 */}
            <Route path="interview/bank" element={<BankScreen />} />
            <Route path="interview/written" element={<WrittenScreen />} />
            <Route path="interview/growth" element={<GrowthScreen />} />
            <Route path="interview/history" element={<HistoryScreen />} />
            <Route path="interview/plan" element={<PlanScreen />} />
            <Route path="interview/questions" element={<QuestionsScreen />} />
            <Route path="interview/setup" element={<SetupScreen />} />
            <Route path="interview/:id" element={<InterviewSessionPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings/*" element={<SettingsLayout />} />
            <Route path="admin/templates" element={<TemplatesPage />} />
            <Route path="admin/templates/:id" element={<TemplateEditorPage />} />
            <Route path="admin/users" element={<UsersPage />} />
            <Route path="admin/rbac" element={<RbacPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App

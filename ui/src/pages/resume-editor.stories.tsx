import { Screen } from "@/storybook/screen"
import { ResumeEditorPage } from "./resume-editor"

export default { title: "Pages/ResumeEditor" }

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

import { Screen } from "@/storybook/screen"
import { ResumeVersionsPage } from "./resume-versions"

export default { title: "Pages/ResumeVersions" }

export const Default = {
  render: () => (
    <Screen path="/resumes/res_fe_lead/versions" routePath="/resumes/:id/versions">
      <ResumeVersionsPage />
    </Screen>
  ),
}

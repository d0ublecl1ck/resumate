import { Screen } from "@/storybook/screen"
import { InterviewReportScreen } from "./report-screen"

export default { title: "Interview/Report" }

export const Default = {
  render: () => (
    <Screen path="/interview/report" routePath="/interview/report">
      <InterviewReportScreen />
    </Screen>
  ),
}

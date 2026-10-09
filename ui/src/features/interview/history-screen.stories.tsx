import { HistoryScreen } from "./history-screen"
import { Screen } from "@/storybook/screen"

export default { title: "Interview/History" }

export const Default = {
  render: () => (
    <Screen path="/interview/history" routePath="/interview/history">
      <HistoryScreen />
    </Screen>
  ),
}

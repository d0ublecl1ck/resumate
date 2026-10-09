import { Screen } from "@/storybook/screen"
import { SessionScreen } from "./session-screen"

export default { title: "Interview/Session" }

export const InProgress = {
  render: () => (
    <Screen path="/interview/session" routePath="/interview/session">
      <SessionScreen />
    </Screen>
  ),
}

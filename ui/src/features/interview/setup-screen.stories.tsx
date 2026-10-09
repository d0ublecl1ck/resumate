import { Screen } from "@/storybook/screen"
import { SetupScreen } from "./setup-screen"

export default { title: "Interview/Setup" }

export const Default = {
  render: () => (
    <Screen path="/interview/setup" routePath="/interview/setup">
      <SetupScreen />
    </Screen>
  ),
}

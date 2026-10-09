import { GrowthScreen } from "./growth-screen"
import { Screen } from "@/storybook/screen"

export default { title: "Interview/Growth" }

export const Default = {
  render: () => (
    <Screen path="/interview/growth" routePath="/interview/growth">
      <GrowthScreen />
    </Screen>
  ),
}
